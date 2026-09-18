import { extractJsonValue } from '../extractJson'
import type { AutoCutPreset, MusicSegment } from '../musicAnalysis'
import { makeSegment, segmentsFromTimes } from './audioCutService'
import type { CutCandidate, MusicAnalysisSummary } from './audioAnalysisService'
import { roundTime } from './time'

export type MusicAdviseMode = AutoCutPreset

export interface MusicAdviseRequest {
  duration: number
  silences: MusicAnalysisSummary['silences']
  energyChanges: MusicAnalysisSummary['energyChanges']
  transients: number[]
  sectionCandidates: MusicAnalysisSummary['sectionCandidates']
  candidates: CutCandidate[]
  requestedMode: MusicAdviseMode
  inputKind: 'analysis-summary'
}

export interface CodexCutChoice {
  id: string
  time: number
  confidence: number
  reason: string
}

export interface MusicAdviseResult {
  usedCodex: boolean
  inputKind: 'analysis-summary'
  message?: string
  error?: string
  selected: CodexCutChoice[]
  cuts: MusicSegment[]
}

export function buildMusicAdviseRequest(
  summary: MusicAnalysisSummary,
  candidates: CutCandidate[],
  requestedMode: MusicAdviseMode,
): MusicAdviseRequest {
  return {
    duration: summary.duration,
    silences: summary.silences,
    energyChanges: summary.energyChanges,
    transients: summary.transients,
    sectionCandidates: summary.sectionCandidates,
    candidates,
    requestedMode,
    inputKind: 'analysis-summary',
  }
}

export function buildCodexCutPrompt(request: MusicAdviseRequest): string {
  const modeHelp: Record<MusicAdviseMode, string> = {
    completo: 'Escolha pontos naturais para separar a música em trechos coerentes, preferindo pausas e transições. Evite cortes no meio de frases.',
    silencio: 'Escolha apenas o fim do silêncio/fade inicial (trim-start) e o início do silêncio/fade final (trim-end). Não corte o meio.',
    gancho15: 'Escolha UMA janela de cerca de 15 segundos com entrada musical forte, não só o maior RMS.',
    gancho30: 'Escolha UMA janela de cerca de 30 segundos com boa musicalidade e transição natural.',
    estrutura: 'Identifique os pontos de transição mais naturais para dividir a música em blocos coerentes (intro, estrofe, refrão, ponte, final).',
  }

  return [
    'Você é um editor musical. Você NÃO ouviu o áudio bruto.',
    'O Atlas analisou a faixa localmente (FFmpeg/DSP) e gerou candidatos reais.',
    'Escolha somente entre os candidatos abaixo. Nunca invente timestamps.',
    modeHelp[request.requestedMode],
    'Responda APENAS JSON válido neste formato:',
    '{"cuts":[{"id":"C1","confidence":0.91,"reason":"Natural transition after a short pause"}]}',
    'Use o campo id de cada candidato (C1, C2, ...).',
    JSON.stringify({
      duration: request.duration,
      requestedMode: request.requestedMode,
      inputKind: request.inputKind,
      silences: request.silences,
      energyChanges: request.energyChanges.slice(0, 40),
      transients: request.transients.slice(0, 40),
      sectionCandidates: request.sectionCandidates.slice(0, 24),
      candidates: request.candidates.map((candidate) => ({
        id: candidate.id,
        time: candidate.time,
        end: candidate.end,
        kind: candidate.kind,
        score: roundTime(candidate.score, 3),
        reason: candidate.reason,
      })),
    }),
  ].join('\n')
}

export function parseCodexCutAdvice(raw: string, candidates: CutCandidate[]): CodexCutChoice[] {
  const parsed = extractJsonValue(raw)
  if (!parsed || typeof parsed !== 'object') return []
  const record = parsed as Record<string, unknown>
  const rawCuts = Array.isArray(record.cuts)
    ? record.cuts
    : Array.isArray(record.selected)
      ? record.selected
      : Array.isArray(record.candidateIds)
        ? record.candidateIds
        : []

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const choices: CodexCutChoice[] = []

  for (const item of rawCuts) {
    if (typeof item === 'string') {
      const candidate = byId.get(item)
      if (!candidate) continue
      choices.push({
        id: candidate.id,
        time: candidate.time,
        confidence: candidate.score,
        reason: candidate.reason,
      })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const byCandidateId = typeof row.id === 'string' ? byId.get(row.id) : undefined
    const snapped = byCandidateId ?? snapToCandidate(Number(row.time), candidates)
    if (!snapped) continue
    choices.push({
      id: snapped.id,
      time: snapped.time,
      confidence: clampConfidence(row.confidence, snapped.score),
      reason: typeof row.reason === 'string' && row.reason.trim() ? row.reason.trim() : snapped.reason,
    })
  }

  const unique: CodexCutChoice[] = []
  for (const choice of choices.sort((a, b) => a.time - b.time)) {
    if (unique.some((item) => item.id === choice.id || Math.abs(item.time - choice.time) < 0.05)) continue
    unique.push(choice)
  }
  return unique
}

function snapToCandidate(time: number, candidates: CutCandidate[], maxDist = 0.05): CutCandidate | null {
  if (!Number.isFinite(time)) return null
  let best: CutCandidate | null = null
  let bestDist = maxDist
  for (const candidate of candidates) {
    const dist = Math.abs(candidate.time - time)
    if (dist <= bestDist) {
      best = candidate
      bestDist = dist
    }
  }
  return best
}

function clampConfidence(value: unknown, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return Math.min(1, Math.max(0, fallback))
  return Math.min(1, Math.max(0, numeric))
}

export function localSelectCandidates(request: MusicAdviseRequest): CodexCutChoice[] {
  const candidates = request.candidates
  if (candidates.length === 0) return []

  if (request.requestedMode === 'gancho15' || request.requestedMode === 'gancho30') {
    const best = [...candidates].sort((a, b) => b.score - a.score)[0]
    return best
      ? [{ id: best.id, time: best.time, confidence: Math.min(1, best.score), reason: best.reason }]
      : []
  }

  if (request.requestedMode === 'silencio') {
    const start = [...candidates.filter((item) => item.kind === 'trim-start')].sort((a, b) => b.score - a.score)[0]
    const end = [...candidates.filter((item) => item.kind === 'trim-end')].sort((a, b) => b.score - a.score)[0]
    return [start, end]
      .filter((item): item is CutCandidate => Boolean(item))
      .map((item) => ({
        id: item.id,
        time: item.time,
        confidence: item.score,
        reason: item.reason,
      }))
  }

  const minGap = request.requestedMode === 'estrutura' ? 6 : 2.4
  const ranked = [...candidates].sort((a, b) => b.score - a.score)
  const picked: CutCandidate[] = []
  for (const candidate of ranked) {
    if (picked.some((item) => Math.abs(item.time - candidate.time) < minGap)) continue
    picked.push(candidate)
    if (picked.length >= (request.requestedMode === 'estrutura' ? 8 : 12)) break
  }
  return picked
    .sort((a, b) => a.time - b.time)
    .map((item) => ({
      id: item.id,
      time: item.time,
      confidence: Math.min(1, item.score),
      reason: item.reason,
    }))
}

export function cutsFromAdvice(request: MusicAdviseRequest, selected: CodexCutChoice[], source: MusicSegment['source']): MusicSegment[] {
  const byId = new Map(request.candidates.map((candidate) => [candidate.id, candidate]))
  if (request.requestedMode === 'gancho15' || request.requestedMode === 'gancho30') {
    const choice = selected[0]
    const candidate = choice ? byId.get(choice.id) : undefined
    if (!candidate) return []
    const end = candidate.end ?? Math.min(request.duration, candidate.time + (request.requestedMode === 'gancho15' ? 15 : 30))
    return [
      makeSegment(candidate.time, end, 1, source, {
        label: request.requestedMode === 'gancho15' ? 'Gancho 15s' : 'Gancho 30s',
        reason: choice.reason,
        confidence: choice.confidence,
      }),
    ]
  }

  if (request.requestedMode === 'silencio') {
    const starts = selected
      .map((choice) => byId.get(choice.id))
      .filter((item): item is CutCandidate => item?.kind === 'trim-start')
    const ends = selected
      .map((choice) => byId.get(choice.id))
      .filter((item): item is CutCandidate => item?.kind === 'trim-end')
    const startChoice = selected.find((choice) => byId.get(choice.id)?.kind === 'trim-start')
    const endChoice = selected.find((choice) => byId.get(choice.id)?.kind === 'trim-end')
    const start = starts.sort((a, b) => b.score - a.score)[0]?.time ?? 0
    const end = ends.sort((a, b) => b.score - a.score)[0]?.time ?? request.duration
    return [
      makeSegment(start, Math.max(start + 0.05, end), 1, source, {
        label: 'Faixa (sem pontas)',
        reason: [startChoice?.reason, endChoice?.reason].filter(Boolean).join(' · ') || 'Remove silêncio das extremidades',
        confidence: Math.min(startChoice?.confidence ?? 0.8, endChoice?.confidence ?? 0.8),
      }),
    ]
  }

  const times = selected.map((choice) => choice.time)
  const extras = undefined
  const segments = segmentsFromTimes(times, request.duration, source, extras)
  return dropMostlySilent(segments, request.silences, request.requestedMode).map((segment, index) => {
    const left = selected.find((choice) => Math.abs(choice.time - segment.start) < 0.08)
    return {
      ...segment,
      label: `Trecho ${index + 1}`,
      reason: left?.reason,
      confidence: left?.confidence,
    }
  })
}

function dropMostlySilent(
  segments: MusicSegment[],
  silences: MusicAdviseRequest['silences'],
  mode: MusicAdviseMode,
): MusicSegment[] {
  if (mode === 'estrutura') return segments
  const filtered = segments.filter((segment) => {
    const overlap = silences.reduce((acc, gap) => {
      return acc + Math.max(0, Math.min(segment.end, gap.end) - Math.max(segment.start, gap.start))
    }, 0)
    const duration = segment.end - segment.start
    return duration >= 0.45 && overlap / Math.max(duration, 0.001) < 0.85
  })
  return filtered.length > 0 ? filtered : segments
}

export function adviseCutsLocally(request: MusicAdviseRequest): MusicAdviseResult {
  const selected = localSelectCandidates(request)
  return {
    usedCodex: false,
    inputKind: 'analysis-summary',
    message: 'Codex não está conectado. Usando análise local.',
    selected,
    cuts: cutsFromAdvice(request, selected, 'auto'),
  }
}
