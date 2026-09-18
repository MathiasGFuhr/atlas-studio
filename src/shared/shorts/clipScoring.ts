export interface ShortScoreDimensions {
  openingStrength: number
  standaloneClarity: number
  payoff: number
  visualValue: number
  audioValue: number
  retentionPotential: number
  conclusion: number
  durationFit: number
  originality: number
}

const WEIGHTS: Array<{ key: keyof ShortScoreDimensions; weight: number }> = [
  { key: 'openingStrength', weight: 1.2 },
  { key: 'standaloneClarity', weight: 1.3 },
  { key: 'payoff', weight: 1.2 },
  { key: 'visualValue', weight: 1.1 },
  { key: 'audioValue', weight: 1.1 },
  { key: 'retentionPotential', weight: 1.2 },
  { key: 'conclusion', weight: 1 },
  { key: 'durationFit', weight: 0.9 },
  { key: 'originality', weight: 1 },
]

function clampScore(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function normalizeScoreDimensions(value: unknown): ShortScoreDimensions | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const dims: ShortScoreDimensions = {
    openingStrength: clampScore(record.openingStrength, NaN),
    standaloneClarity: clampScore(record.standaloneClarity, NaN),
    payoff: clampScore(record.payoff, NaN),
    visualValue: clampScore(record.visualValue, NaN),
    audioValue: clampScore(record.audioValue, NaN),
    retentionPotential: clampScore(record.retentionPotential, NaN),
    conclusion: clampScore(record.conclusion, NaN),
    durationFit: clampScore(record.durationFit, NaN),
    originality: clampScore(record.originality, NaN),
  }
  const filled = Object.values(dims).filter((item) => Number.isFinite(item)).length
  if (filled < 4) return null
  for (const key of Object.keys(dims) as Array<keyof ShortScoreDimensions>) {
    if (!Number.isFinite(dims[key])) dims[key] = 50
  }
  return dims
}

export function scoreFromDimensions(
  dims: ShortScoreDimensions,
  opts?: { overlapPenalty?: number },
): number {
  const totalWeight = WEIGHTS.reduce((sum, item) => sum + item.weight, 0)
  const weighted =
    WEIGHTS.reduce((sum, item) => sum + dims[item.key] * item.weight, 0) / Math.max(1, totalWeight)
  const penalty = Math.max(0, Math.min(0.7, opts?.overlapPenalty ?? 0))
  return clampScore(weighted * (1 - penalty))
}

export function fallbackScoreFromSignals(input: {
  visualValue?: number
  audioValue?: number
  speechValue?: number
  durationFit?: number
  overlapPenalty?: number
}): number {
  const visual = clampScore(input.visualValue, 45)
  const audio = clampScore(input.audioValue, 45)
  const speech = clampScore(input.speechValue, 40)
  const durationFit = clampScore(input.durationFit, 70)
  return scoreFromDimensions(
    {
      openingStrength: Math.round((visual + audio) / 2),
      standaloneClarity: speech,
      payoff: Math.round((audio + visual) / 2),
      visualValue: visual,
      audioValue: audio,
      retentionPotential: Math.round(audio * 0.55 + visual * 0.45),
      conclusion: Math.round((speech + durationFit) / 2),
      durationFit,
      originality: 70,
    },
    { overlapPenalty: input.overlapPenalty },
  )
}
