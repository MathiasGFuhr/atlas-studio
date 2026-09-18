import type { ShortsDurationMode, ShortsEditorialContext, ShortsLocalCandidate, ShortsProfile, TranscriptCue } from '../shorts'
import {
  clampAiAdjust,
  overlapRatio,
  SHORTS_AI_ADJUST_SECONDS,
  toRankedWindows,
  withCandidateIds,
  type ShortsRankedWindow,
} from '../shortsDiversity'
import { durationBounds } from '../shortsDuration'
import { contentLanguagePromptBlock } from '../shortsLanguage'

export interface ShortsAiClip {
  id: string
  start: number
  end: number
  score: number
  reason: string
  hook: string
}

export const SHORTS_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    selected: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          candidateId: { type: 'string', description: 'ID do candidato local (c1, c2, ...)' },
          score: { type: 'integer', description: 'Potencial 0-100 para Short' },
          reason: { type: 'string', description: 'Motivo editorial curto em português (nota interna do Atlas)' },
          hook: { type: 'string', description: 'Gancho de 1 frase no idioma do conteúdo (YouTube), nunca no idioma da UI' },
          start: {
            type: 'number',
            description: 'Ajuste fino opcional do início, no máximo 3s longe do candidato',
          },
          end: {
            type: 'number',
            description: 'Ajuste fino opcional do fim, no máximo 3s longe do candidato',
          },
        },
        required: ['candidateId', 'score', 'reason'],
      },
    },
    clips: {
      type: 'array',
      description: 'Formato legado. Prefira selected[].candidateId.',
      items: {
        type: 'object',
        properties: {
          candidateId: { type: 'string' },
          start: { type: 'number' },
          end: { type: 'number' },
          score: { type: 'integer' },
          reason: { type: 'string' },
          hook: { type: 'string' },
        },
      },
    },
    notes: { type: 'string', description: 'Observação editorial opcional' },
  },
  required: [],
}

const MUSIC_CRITERIA = [
  'refrão',
  'clímax vocal',
  'solo',
  'entrada forte',
  'reação da plateia',
  'mudança de dinâmica',
  'final forte',
]

const HISTORY_CRITERIA = [
  'gancho',
  'curiosidade',
  'revelação',
  'conflito',
  'frase memorável',
  'consequência',
  'virada narrativa',
]

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clampScore(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(asNumber(value, 0))))
}

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

function formatCueLine(cue: TranscriptCue): string {
  return `[${cue.start.toFixed(1)}-${cue.end.toFixed(1)}] ${cue.text.trim()}`
}

function nearestCandidate(
  start: number,
  end: number,
  candidates: ShortsLocalCandidate[],
): ShortsLocalCandidate | null {
  let best: ShortsLocalCandidate | null = null
  let bestScore = 0
  for (const candidate of candidates) {
    const ratio = overlapRatio({ start, end }, candidate)
    const startDist = Math.abs(candidate.start - start)
    const score = ratio * 10 + (startDist <= 5 ? 2 : 0)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  if (!best) return null
  if (overlapRatio({ start, end }, best) >= 0.25 || Math.abs(best.start - start) <= 5) return best
  return null
}

export function buildShortsAnalysisPrompt(input: {
  profile: ShortsProfile
  duration: number
  clipCount: number
  requestedDuration: number
  durationMode: ShortsDurationMode
  fileName: string
  transcript: TranscriptCue[]
  scenes: Array<{ time: number }>
  localCandidates: Array<Omit<ShortsLocalCandidate, 'id'> & { id?: string }>
  hasTranscript: boolean
  editorial?: ShortsEditorialContext
}): string {
  const bounds = durationBounds(input.requestedDuration, input.duration, input.durationMode)
  const criteria = input.profile === 'music' ? MUSIC_CRITERIA : HISTORY_CRITERIA
  const profileLabel = input.profile === 'music' ? 'MÚSICA' : 'HISTÓRIA'
  const candidates = withCandidateIds(input.localCandidates)
  const contentLanguage = input.editorial?.contentLanguage?.trim() || input.editorial?.language?.trim() || ''
  const languageName = input.editorial?.languageName?.trim() || contentLanguage || 'the source material language'
  const languageBlock = contentLanguage
    ? [
        contentLanguagePromptBlock({
          contentLanguage,
          languageName,
        }),
        `hook: 1 frase no idioma do conteúdo (${languageName} / ${contentLanguage})`,
        'reason pode permanecer em português (nota interna). hook, se houver, no idioma do conteúdo.',
      ].join('\n')
    : ''
  const transcriptBlock =
    input.transcript.length > 0
      ? input.transcript.slice(0, 220).map(formatCueLine).join('\n')
      : '(sem transcrição textual — use cenas, silêncios e candidatos locais)'
  const scenesBlock =
    input.scenes.length > 0
      ? input.scenes
          .slice(0, 80)
          .map((scene) => scene.time.toFixed(1))
          .join(', ')
      : '(nenhuma)'
  const localBlock = candidates
    .map(
      (item) =>
        `${item.id}: ${item.start.toFixed(1)}–${item.end.toFixed(1)}s · ${item.reason} · score local ${item.score}`,
    )
    .join('\n')

  const durationRules =
    input.durationMode === 'exact'
      ? [
          'Modo de duração: EXATA.',
          `Cada clip deve ter ${bounds.target.toFixed(1)}s (end = start + ${bounds.target.toFixed(1)}), sem ultrapassar o vídeo.`,
          'Escolha o melhor ponto inicial para que essa janela fixa faça sentido.',
          'Não alongue nem encurte para “fechar melhor” — a duração é fixa.',
        ]
      : [
          'Modo de duração: APROXIMADA (recomendado).',
          `Alvo: ${bounds.target.toFixed(1)}s. Faixa permitida: ${bounds.min.toFixed(1)}s a ${bounds.max.toFixed(1)}s.`,
          'Todos os Shorts devem ficar nessa faixa. Não misture 11s com 58s.',
          input.profile === 'music'
            ? 'Priorize integridade musical: se um refrão completo tiver ~34s e o pedido for 30s, prefira o refrão completo.'
            : 'Priorize uma unidade narrativa completa: começo compreensível, desenvolvimento e conclusão. Não comece uma explicação sem contexto nem corte antes do fechamento.',
        ]

  const musicRules =
    input.profile === 'music'
      ? [
          'Regras Música:',
          '- não comece no meio de uma palavra ou frase musical',
          '- não termine no meio de uma frase',
          '- preserve entrada natural, refrão completo e resolução quando o modo for aproximado',
          '- evite cortes musicalmente ruins se houver alternativa',
          '- priorize refrão, clímax vocal, solo, entrada forte, plateia, mudança de dinâmica, final forte',
          '- cada Short precisa ser um momento real diferente: refrão, solo, clímax, entrada vocal, plateia, mudança dinâmica, encerramento',
        ]
      : [
          'Regras História:',
          '- o trecho precisa começar de forma compreensível, sem depender do bloco anterior',
          '- tenha desenvolvimento (não só uma frase isolada) e termine naturalmente',
          '- priorize gancho, curiosidade, revelação, conflito, frase memorável, consequência, virada',
          '- cada Short precisa ser um trecho distinto: gancho, revelação, conflito, consequência, conclusão',
        ]

  return [
    'Você é editor de YouTube Shorts do Atlas Studio.',
    `Perfil editorial: ${profileLabel}. NÃO use a estratégia do outro perfil.`,
    `Arquivo: ${input.fileName}`,
    `videoDuration: ${input.duration.toFixed(1)}`,
    `requestedClipDuration: ${bounds.target.toFixed(1)}`,
    `durationMode: ${input.durationMode}`,
    `O usuário pediu ${input.clipCount} Shorts. RANKEIE os candidatos locais. Não invente timestamps novos.`,
    'Rankeie candidatos fortes e temporalmente distintos. Prefira centros diferentes (início, meio, fim).',
    `Devolva até ${Math.max(input.clipCount + 8, input.clipCount * 3)} IDs para o seletor local. Não decida a quantidade final.`,
    'Não escolha só os melhores no mesmo clímax. Cada Short precisa de um núcleo editorial próprio.',
    'Não proponha o mesmo momento com alguns segundos de diferença. Sobreposição pequena só vale se o trecho principal for outro.',
    'A quantidade pedida é um teto, não uma ordem para inventar clones. Nunca devolva o mesmo start/end (nem o mesmo candidateId) para Shorts diferentes.',
    `Ajuste fino opcional de start/end: no máximo ${SHORTS_AI_ADJUST_SECONDS}s em relação ao candidato. Não transforme todos no final do vídeo.`,
    'Qualidade editorial continua prioritária, mas distribua os Shorts por regiões diferentes do vídeo quando houver alternativas boas.',
    durationRules.join('\n'),
    'Não invente timestamps fora do vídeo. start >= 0 e end <= videoDuration.',
    'Não escolha frases isoladas. O corte precisa funcionar sozinho: começo claro, desenvolvimento, fechamento.',
    musicRules.join('\n'),
    `Critérios deste perfil: ${criteria.join(', ')}.`,
    input.hasTranscript
      ? 'Há transcrição com timestamps. Use-a para escolher entre os candidatos, não para inventar um único corte repetido.'
      : 'Não há transcrição confiável. Use candidatos locais, cenas e dinâmica de áudio. Não invente falas. A diversidade temporal continua obrigatória.',
    '',
    'Transcrição:',
    transcriptBlock,
    '',
    `Mudanças de cena (s): ${scenesBlock}`,
    '',
    'Candidatos locais (obrigatório escolher por ID):',
    localBlock || '(nenhum)',
    languageBlock,
    languageBlock ? 'Responda só no JSON do schema.' : 'Responda só no JSON do schema, em português do Brasil.',
    'Formato: { "selected": [ { "candidateId": "c1", "score": 94, "reason": "...", "hook": "..." } ], "notes": "" }',
  ]
    .filter((line) => line != null)
    .join('\n')
}

function resolveSelectedItem(
  record: Record<string, unknown>,
  candidates: ShortsLocalCandidate[],
  usedIds: Set<string>,
): ShortsAiClip | null {
  const byId = new Map(candidates.map((item) => [item.id, item]))
  const requestedId = asText(record.candidateId)
  let candidate = requestedId ? byId.get(requestedId) ?? null : null

  const rawStart = asNumber(record.start, NaN)
  const rawEnd = asNumber(record.end, NaN)
  if (!candidate && Number.isFinite(rawStart) && Number.isFinite(rawEnd)) {
    candidate = nearestCandidate(rawStart, rawEnd, candidates)
  }
  if (!candidate && candidates.length === 0 && Number.isFinite(rawStart) && Number.isFinite(rawEnd)) {
    const syntheticId = requestedId || `ai-${usedIds.size + 1}`
    candidate = {
      id: syntheticId,
      start: Math.min(rawStart, rawEnd),
      end: Math.max(rawStart, rawEnd),
      score: clampScore(record.score),
      reason: asText(record.reason) || 'Trecho com potencial para Short',
      source: 'speech',
    }
  }
  if (!candidate) return null
  if (usedIds.has(candidate.id)) return null

  const adjusted = clampAiAdjust(
    candidate,
    {
      start: Number.isFinite(rawStart) ? rawStart : candidate.start,
      end: Number.isFinite(rawEnd) ? rawEnd : candidate.end,
    },
    SHORTS_AI_ADJUST_SECONDS,
  )

  usedIds.add(candidate.id)
  return {
    id: candidate.id,
    start: Math.round(adjusted.start * 100) / 100,
    end: Math.round(adjusted.end * 100) / 100,
    score: clampScore(record.score) || candidate.score,
    reason: asText(record.reason) || candidate.reason || 'Trecho com potencial para Short',
    hook: asText(record.hook),
  }
}

function applyDurationBounds(
  clip: ShortsAiClip,
  input: { duration: number; requestedDuration: number; durationMode: ShortsDurationMode },
): ShortsAiClip | null {
  const bounds = durationBounds(input.requestedDuration, input.duration, input.durationMode)
  let start = Math.max(0, Math.min(input.duration, clip.start))
  let end = Math.max(0, Math.min(input.duration, clip.end))
  if (end < start) {
    const swap = start
    start = end
    end = swap
  }
  if (end - start < 0.8) return null

  if (input.durationMode === 'exact') {
    end = Math.min(input.duration, start + bounds.target)
    if (end - start < bounds.target - 0.12) {
      start = Math.max(0, end - bounds.target)
    }
  } else {
    if (end - start < bounds.min) {
      end = Math.min(input.duration, start + bounds.min)
    }
    if (end - start > bounds.max) {
      end = Math.min(input.duration, start + bounds.max)
    }
    if (end - start < bounds.min) {
      start = Math.max(0, end - bounds.min)
    }
  }

  if (end <= start || end > input.duration + 0.04) return null
  return {
    ...clip,
    start: Math.round(start * 100) / 100,
    end: Math.round(end * 100) / 100,
  }
}

export function normalizeShortsAnalysis(
  raw: Record<string, unknown>,
  input: {
    duration: number
    clipCount: number
    requestedDuration: number
    durationMode: ShortsDurationMode
    localCandidates?: ShortsLocalCandidate[]
  },
): { clips: ShortsAiClip[]; notes: string } {
  const candidates = input.localCandidates ?? []
  const selectedRaw = Array.isArray(raw.selected) ? raw.selected : []
  const legacyRaw = Array.isArray(raw.clips) ? raw.clips : []
  const list = selectedRaw.length > 0 ? selectedRaw : legacyRaw
  const usedIds = new Set<string>()
  const clips: ShortsAiClip[] = []

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const resolved = resolveSelectedItem(item as Record<string, unknown>, candidates, usedIds)
    if (!resolved) continue
    const bounded = applyDurationBounds(resolved, input)
    if (!bounded) continue
    clips.push(bounded)
    if (clips.length >= input.clipCount + 8) break
  }

  if (clips.length === 0 && candidates.length > 0) {
    for (const candidate of [...candidates].sort((a, b) => b.score - a.score || a.start - b.start)) {
      const bounded = applyDurationBounds(
        {
          id: candidate.id,
          start: candidate.start,
          end: candidate.end,
          score: candidate.score,
          reason: candidate.reason,
          hook: '',
        },
        input,
      )
      if (!bounded) continue
      clips.push(bounded)
      if (clips.length >= input.clipCount + 8) break
    }
  }

  clips.sort((a, b) => b.score - a.score || a.start - b.start)
  return {
    clips: clips.slice(0, Math.max(input.clipCount + 8, input.clipCount * 3)),
    notes: asText(raw.notes),
  }
}

export function shortsAiClipsToRanked(clips: ShortsAiClip[]): ShortsRankedWindow[] {
  return toRankedWindows(
    clips.map((clip) => ({
      id: clip.id,
      start: clip.start,
      end: clip.end,
      score: clip.score,
      reason: clip.reason,
      hook: clip.hook,
      source: 'ai' as const,
    })),
  )
}

export const SHORTS_ANALYSIS_FAIL_MESSAGE =
  'O Antigravity não devolveu cortes válidos. Os trechos locais foram mantidos.'
