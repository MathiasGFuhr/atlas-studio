import type { ShortsDurationMode, ShortsLocalCandidate, ShortsProfile, TranscriptCue } from '../shorts'
import { durationBounds } from '../shortsDuration'

export interface ShortsAiClip {
  start: number
  end: number
  score: number
  reason: string
  hook: string
}

export const SHORTS_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    clips: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start: { type: 'number', description: 'Início em segundos' },
          end: { type: 'number', description: 'Fim em segundos' },
          score: { type: 'integer', description: 'Potencial 0-100 para Short' },
          reason: { type: 'string', description: 'Motivo editorial curto em português' },
          hook: { type: 'string', description: 'Gancho de 1 frase em português' },
        },
        required: ['start', 'end', 'score', 'reason'],
      },
    },
    notes: { type: 'string', description: 'Observação editorial opcional' },
  },
  required: ['clips'],
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

export function buildShortsAnalysisPrompt(input: {
  profile: ShortsProfile
  duration: number
  clipCount: number
  requestedDuration: number
  durationMode: ShortsDurationMode
  fileName: string
  transcript: TranscriptCue[]
  scenes: Array<{ time: number }>
  localCandidates: ShortsLocalCandidate[]
  hasTranscript: boolean
}): string {
  const bounds = durationBounds(input.requestedDuration, input.duration, input.durationMode)
  const criteria = input.profile === 'music' ? MUSIC_CRITERIA : HISTORY_CRITERIA
  const profileLabel = input.profile === 'music' ? 'MÚSICA' : 'HISTÓRIA'
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
  const localBlock = input.localCandidates
    .map(
      (item, index) =>
        `${index + 1}. ${item.start.toFixed(1)}–${item.end.toFixed(1)}s · ${item.reason} · score local ${item.score}`,
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
        ]
      : [
          'Regras História:',
          '- o trecho precisa começar de forma compreensível, sem depender do bloco anterior',
          '- tenha desenvolvimento (não só uma frase isolada) e termine naturalmente',
          '- priorize gancho, curiosidade, revelação, conflito, frase memorável, consequência, virada',
        ]

  return [
    'Você é editor de YouTube Shorts do Atlas Studio.',
    `Perfil editorial: ${profileLabel}. NÃO use a estratégia do outro perfil.`,
    `Arquivo: ${input.fileName}`,
    `videoDuration: ${input.duration.toFixed(1)}`,
    `requestedClipDuration: ${bounds.target.toFixed(1)}`,
    `durationMode: ${input.durationMode}`,
    `Devolva exatamente ${input.clipCount} clips (pode devolver até ${input.clipCount + 2} para o Atlas filtrar).`,
    durationRules.join('\n'),
    'Não invente timestamps fora do vídeo. start >= 0 e end <= videoDuration.',
    'Não escolha frases isoladas. O corte precisa funcionar sozinho: começo claro, desenvolvimento, fechamento.',
    musicRules.join('\n'),
    `Critérios deste perfil: ${criteria.join(', ')}.`,
    input.hasTranscript
      ? 'Há transcrição com timestamps. Use-a como fonte principal.'
      : 'Não há transcrição confiável. Use candidatos locais, cenas e dinâmica de áudio. Não invente falas.',
    '',
    'Transcrição:',
    transcriptBlock,
    '',
    `Mudanças de cena (s): ${scenesBlock}`,
    '',
    'Candidatos locais (referência, você pode ajustar):',
    localBlock || '(nenhum)',
    '',
    'Responda só no JSON do schema, em português do Brasil.',
  ].join('\n')
}

export function normalizeShortsAnalysis(
  raw: Record<string, unknown>,
  input: {
    duration: number
    clipCount: number
    requestedDuration: number
    durationMode: ShortsDurationMode
  },
): { clips: ShortsAiClip[]; notes: string } {
  const bounds = durationBounds(input.requestedDuration, input.duration, input.durationMode)
  const list = Array.isArray(raw.clips) ? raw.clips : []
  const clips: ShortsAiClip[] = []

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    let start = asNumber(record.start, NaN)
    let end = asNumber(record.end, NaN)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (end < start) {
      const swap = start
      start = end
      end = swap
    }
    start = Math.max(0, Math.min(input.duration, start))
    end = Math.max(0, Math.min(input.duration, end))
    if (end - start < 0.8) continue

    if (input.durationMode === 'exact') {
      end = Math.min(input.duration, start + bounds.target)
      if (end - start < bounds.target - 0.12) {
        start = Math.max(0, end - bounds.target)
      }
    } else {
      if (end - start < bounds.min) {
        end = Math.min(input.duration, start + bounds.min)
        if (end - start < bounds.min) start = Math.max(0, end - bounds.min)
      }
      if (end - start > bounds.max) {
        end = start + bounds.max
        if (end > input.duration) {
          end = input.duration
          start = Math.max(0, end - bounds.max)
        }
      }
    }

    if (end <= start || start < 0 || end > input.duration + 0.04) continue
    const reason = asText(record.reason) || 'Trecho com potencial para Short'
    const hook = asText(record.hook)
    clips.push({
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      score: clampScore(record.score),
      reason,
      hook,
    })
  }

  clips.sort((a, b) => b.score - a.score || a.start - b.start)
  const picked: ShortsAiClip[] = []
  for (const clip of clips) {
    const overlap = picked.some((existing) => {
      const from = Math.max(existing.start, clip.start)
      const to = Math.min(existing.end, clip.end)
      return to - from > (clip.end - clip.start) * 0.55
    })
    if (overlap) continue
    picked.push(clip)
    if (picked.length >= input.clipCount) break
  }

  return {
    clips: picked,
    notes: asText(raw.notes),
  }
}

export const SHORTS_ANALYSIS_FAIL_MESSAGE =
  'O Antigravity não devolveu cortes válidos. Os trechos locais foram mantidos.'
