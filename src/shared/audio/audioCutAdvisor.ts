import { extractJsonValue } from '../extractJson'
import type { AutoCutPreset, MusicSegment } from '../musicAnalysis'
import { makeSegment, segmentsFromTimes, sortCuts, fitCutsToExactDuration } from './audioCutService'
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
  const budget = splitBudget(request.duration, request.requestedMode)
  const modeHelp: Record<MusicAdviseMode, string> = {
    completo: `Separe a música em trechos tocáveis e coerentes. Alvo: cerca de ${budget.targetCount} trechos, cada um com ${budget.minSegment.toFixed(0)}–${budget.maxSegment.toFixed(0)}s (ideal ~${budget.targetSegment.toFixed(0)}s). Prefira pausas e mudanças de seção. Evite cortar no meio da frase.`,
    silencio: 'Escolha apenas o fim do silêncio/fade inicial (trim-start) e o início do silêncio/fade final (trim-end). Não corte o meio.',
    gancho15: 'Escolha UMA janela de cerca de 15 segundos com entrada musical forte, não só o maior RMS.',
    gancho30: 'Escolha UMA janela de cerca de 30 segundos com boa musicalidade e transição natural.',
    estrutura: `Divida em blocos musicais (intro, estrofe, refrão, ponte, final). Alvo: cerca de ${budget.targetCount} blocos, cada um com ${budget.minSegment.toFixed(0)}–${budget.maxSegment.toFixed(0)}s.`,
  }

  return [
    'Você é um editor musical. Você NÃO ouviu o áudio bruto.',
    'O Atlas analisou a faixa localmente (FFmpeg/DSP) e gerou candidatos reais de transição.',
    'Escolha somente entre os candidatos abaixo, usando o campo id (C1, C2, ...). Nunca invente timestamps.',
    modeHelp[request.requestedMode],
    'Regras editoriais:',
    '- Corte só em transição natural: fim de frase, retomada após pausa, mudança de seção.',
    '- Não escolha dois candidatos da mesma pausa nem cortes a menos de alguns segundos um do outro.',
    '- Não crie trechos minúsculos nem fatie a música a cada variação pequena de energia.',
    '- Menos cortes bons valem mais do que muitos cortes inseguros.',
    '- Distribua os cortes do começo ao FIM da faixa. Não deixe o final inteiro em um único trecho.',
    '- Os trechos devem cobrir a faixa inteira: o Atlas usa os pontos escolhidos como divisórias entre 0 e o fim.',
    'Responda APENAS JSON válido neste formato:',
    '{"cuts":[{"id":"C1","confidence":0.91,"reason":"Retomada após pausa no fim da frase"}]}',
    JSON.stringify({
      duration: request.duration,
      requestedMode: request.requestedMode,
      inputKind: request.inputKind,
      targetCount: budget.targetCount,
      minSegmentSec: roundTime(budget.minSegment, 1),
      targetSegmentSec: roundTime(budget.targetSegment, 1),
      maxSegmentSec: roundTime(budget.maxSegment, 1),
      maxCuts: budget.maxSplits,
      silences: request.silences,
      energyChanges: request.energyChanges.slice(0, 24),
      transients: request.transients.slice(0, 24),
      sectionCandidates: request.sectionCandidates.slice(0, 18),
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

function snapToCandidate(time: number, candidates: CutCandidate[], maxDist = 0.45): CutCandidate | null {
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

export interface SplitBudget {
  minSegment: number
  maxSegment: number
  targetSegment: number
  maxSplits: number
  targetCount: number
}

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function splitBudget(duration: number, mode: MusicAdviseMode): SplitBudget {
  if (mode === 'gancho15' || mode === 'gancho30' || mode === 'silencio') {
    return { minSegment: 0, maxSegment: duration, targetSegment: duration, maxSplits: 0, targetCount: 1 }
  }
  const estrutura = mode === 'estrutura'
  const targetSegment = clampNum(duration / (estrutura ? 5.5 : 7.5), estrutura ? 14 : 12, estrutura ? 34 : 26)
  const minSegment = Math.min(duration / 2, estrutura ? Math.max(9, targetSegment * 0.48) : Math.max(7, targetSegment * 0.42))
  const maxSegment = Math.min(duration, Math.max(targetSegment * 1.65, estrutura ? 40 : 36))
  const targetCount = Math.max(2, Math.min(estrutura ? 12 : 18, Math.round(duration / targetSegment)))
  const maxSplits = Math.max(1, targetCount - 1)
  return {
    minSegment,
    maxSegment,
    targetSegment,
    maxSplits,
    targetCount,
  }
}

export function pickSpacedCuts(
  choices: CodexCutChoice[],
  duration: number,
  budget: SplitBudget,
): CodexCutChoice[] {
  if (choices.length === 0) return []
  if (budget.maxSplits <= 0) return [choices[0]]
  const minGap = budget.minSegment
  const ranked = [...choices].sort((a, b) => b.confidence - a.confidence || a.time - b.time)
  const picked: CodexCutChoice[] = []
  for (const choice of ranked) {
    if (choice.time < minGap || choice.time > duration - minGap) continue
    if (picked.some((item) => Math.abs(item.time - choice.time) < minGap)) continue
    picked.push(choice)
    if (picked.length >= budget.maxSplits) break
  }

  const used = (choice: CodexCutChoice) =>
    picked.some((item) => item.id === choice.id || Math.abs(item.time - choice.time) < minGap)

  while (picked.length < budget.maxSplits) {
    const times = [0, ...picked.map((item) => item.time).sort((a, b) => a - b), duration]
    let gapStart = 0
    let gapEnd = duration
    let gapSize = 0
    for (let i = 0; i < times.length - 1; i += 1) {
      const size = times[i + 1] - times[i]
      if (size > gapSize) {
        gapStart = times[i]
        gapEnd = times[i + 1]
        gapSize = size
      }
    }
    if (gapSize <= budget.maxSegment) break
    const lo = gapStart + minGap
    const hi = gapEnd - minGap
    if (hi <= lo) break
    const extra =
      ranked.find((choice) => choice.time >= lo && choice.time <= hi && !used(choice)) ??
      ranked
        .filter((choice) => choice.time > gapStart + 1 && choice.time < gapEnd - 1 && !used(choice))
        .sort((a, b) => Math.abs((gapStart + gapEnd) / 2 - a.time) - Math.abs((gapStart + gapEnd) / 2 - b.time))[0]
    if (!extra) break
    picked.push(extra)
  }

  const unique: CodexCutChoice[] = []
  for (const choice of picked.sort((a, b) => a.time - b.time)) {
    if (unique.some((item) => item.id === choice.id || Math.abs(item.time - choice.time) < 0.08)) continue
    unique.push(choice)
  }
  return unique
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

  const budget = splitBudget(request.duration, request.requestedMode)
  const choices = candidates.map((item) => ({
    id: item.id,
    time: item.time,
    confidence: Math.min(1, item.score),
    reason: item.reason,
  }))
  return pickSpacedCuts(choices, request.duration, budget)
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

  const budget = splitBudget(request.duration, request.requestedMode)
  const pool = completeCutPool(request.candidates, selected)
  const spaced = pickSpacedCuts(pool, request.duration, budget)
  const times = spaced.map((choice) => choice.time).filter((time) => time > 0 && time < request.duration)
  const segments = fitCutsToExactDuration(
    mergeUndersizedCuts(
      segmentsFromTimes(times, request.duration, source),
      request.silences,
      budget.minSegment,
    ),
    request.duration,
  )
  return segments.map((segment, index) => {
    const left = spaced.find((choice) => Math.abs(choice.time - segment.start) < 0.12)
    return {
      ...segment,
      label: `Trecho ${index + 1}`,
      reason: left?.reason,
      confidence: left?.confidence,
    }
  })
}

function completeCutPool(candidates: CutCandidate[], selected: CodexCutChoice[]): CodexCutChoice[] {
  const chosen = new Map(selected.map((item) => [item.id, item]))
  const pool = candidates.map((candidate) => {
    const fromCodex = chosen.get(candidate.id)
    if (fromCodex) {
      return { ...fromCodex, confidence: Math.max(fromCodex.confidence, 0.9) }
    }
    return {
      id: candidate.id,
      time: candidate.time,
      confidence: Math.min(0.86, candidate.score),
      reason: candidate.reason,
    }
  })
  for (const choice of selected) {
    if (!pool.some((item) => item.id === choice.id)) pool.push(choice)
  }
  return pool
}

function silenceOverlap(segment: MusicSegment, silences: MusicAdviseRequest['silences']): number {
  return silences.reduce((acc, gap) => {
    return acc + Math.max(0, Math.min(segment.end, gap.end) - Math.max(segment.start, gap.start))
  }, 0)
}

function mergeUndersizedCuts(
  segments: MusicSegment[],
  silences: MusicAdviseRequest['silences'],
  minSegment: number,
): MusicSegment[] {
  if (segments.length <= 1 || minSegment <= 0) return segments
  const next = sortCuts(segments).map((segment) => ({ ...segment }))
  let index = 0
  while (index < next.length) {
    const current = next[index]
    const duration = current.end - current.start
    const overlap = silenceOverlap(current, silences)
    const weak = duration < minSegment || (duration < minSegment * 1.35 && overlap / Math.max(duration, 0.001) > 0.62)
    if (!weak || next.length === 1) {
      index += 1
      continue
    }
    if (index === 0) {
      next[1] = { ...next[1], start: current.start }
      next.splice(0, 1)
      continue
    }
    next[index - 1] = { ...next[index - 1], end: current.end }
    next.splice(index, 1)
  }
  return next
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
