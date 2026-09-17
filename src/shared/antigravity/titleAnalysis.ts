import type {
  TitleAlternative,
  TitleAlternativeStrategy,
  TitleAnalysisLocalFacts,
  TitleAnalysisMetrics,
  TitleAnalysisPayload,
  TitleAnalysisProfile,
  TitleStrengthAnalysis,
} from '../types'

export const TITLE_ANALYSIS_FAIL_MESSAGE = 'Não foi possível analisar o título.'

export const TITLE_ALTERNATIVE_STRATEGIES: TitleAlternativeStrategy[] = [
  'original_refined',
  'hook_first',
  'compact',
]

export const TITLE_STRATEGY_LABEL: Record<TitleAlternativeStrategy, string> = {
  original_refined: 'Original refinado',
  hook_first: 'Gancho primeiro',
  compact: 'Compacto/mobile',
}

const CORE_METRIC_KEYS = [
  'hook',
  'clarity',
  'curiosity',
  'specificity',
  'emotion',
  'naturalness',
  'mobile',
  'channelFit',
  'originality',
] as const

type CoreMetricKey = (typeof CORE_METRIC_KEYS)[number]

export function titleScoreBand(score: number): string {
  if (score >= 90) return 'Excelente'
  if (score >= 80) return 'Muito forte'
  if (score >= 70) return 'Bom, mas pode melhorar'
  if (score >= 60) return 'Mediano'
  return 'Fraco'
}

export function isTitleAnalysisProfile(value: unknown): value is TitleAnalysisProfile {
  return value === 'music' || value === 'history' || value === 'general'
}

function asTrimmed(value: unknown): string {
  return String(value ?? '').trim()
}

function parseScore(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[„“”"«»]/g, ' ')
    .split(/[\s|/–—-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
}

export function computeTitleLocalFacts(title: string): TitleAnalysisLocalFacts {
  const trimmed = title.trim()
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : []
  const counts = new Map<string, number>()
  for (const token of tokenize(trimmed)) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  const repeatedWords = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([word]) => word)
    .slice(0, 8)

  return {
    charCount: [...trimmed].length,
    wordCount: words.length,
    first45: [...trimmed].slice(0, 45).join(''),
    first60: [...trimmed].slice(0, 60).join(''),
    hasSeparator: /[|•·–—]/.test(trimmed),
    repeatedWords,
  }
}

export function detectRepeatedOpenings(
  title: string,
  recentTitles: string[],
): { prefix: string; count: number } | null {
  const tokens = tokenize(title).slice(0, 3)
  if (tokens.length < 2) return null
  const prefix = tokens.slice(0, 2).join(' ')
  const count = recentTitles.filter((item) => tokenize(item).slice(0, 2).join(' ') === prefix).length
  if (count < 2) return null
  return { prefix, count }
}

function compact<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item == null) continue
    if (typeof item === 'string' && !item.trim()) continue
    if (Array.isArray(item) && item.length === 0) continue
    out[key] = item
  }
  return out
}

export function toTitleAnalysisPayload(input: TitleAnalysisPayload): Record<string, unknown> {
  const localFacts = input.localFacts ?? computeTitleLocalFacts(input.currentTitle)
  const repeatedOpening = detectRepeatedOpenings(input.currentTitle, input.recentChannelTitles ?? [])
  return compact({
    projectType: input.projectType,
    language: input.language,
    country: input.country,
    channel: input.channel
      ? compact({
          name: input.channel.name,
          type: input.channel.type,
          language: input.channel.language,
        })
      : undefined,
    currentTitle: input.currentTitle.trim(),
    songTitle: input.songTitle,
    artistName: input.artistName,
    eventName: input.eventName,
    videoFormat: input.videoFormat,
    videoContext: input.videoContext,
    thumbnailText: input.thumbnailText,
    recentChannelTitles: input.recentChannelTitles,
    performanceDataIfAvailable: input.performanceDataIfAvailable,
    localObservables: {
      ...localFacts,
      repeatedOpeningPrefix: repeatedOpening?.prefix,
      repeatedOpeningCount: repeatedOpening?.count,
    },
  })
}

export function hashTitleAnalysisContext(payload: TitleAnalysisPayload): string {
  const text = JSON.stringify(toTitleAnalysisPayload(payload))
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function asStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => asTrimmed(item)).filter(Boolean).slice(0, max)
}

function asStrategy(value: unknown): TitleAlternativeStrategy | null {
  const raw = asTrimmed(value)
  return TITLE_ALTERNATIVE_STRATEGIES.includes(raw as TitleAlternativeStrategy)
    ? (raw as TitleAlternativeStrategy)
    : null
}

function asAlternatives(value: unknown): TitleAlternative[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const used = new Set<TitleAlternativeStrategy>()
  const items: TitleAlternative[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const strategy = asStrategy(record.strategy)
    const title = asTrimmed(record.title)
    const reason = asTrimmed(record.reason)
    if (!strategy || !title || !reason || used.has(strategy)) continue
    used.add(strategy)
    items.push({ strategy, title, reason })
  }
  return items.length > 0 ? items.slice(0, 3) : null
}

function asMetrics(value: unknown, profile: TitleAnalysisProfile): TitleAnalysisMetrics | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const metrics: TitleAnalysisMetrics = {
    hook: 0,
    clarity: 0,
    curiosity: 0,
    specificity: 0,
    emotion: 0,
    naturalness: 0,
    mobile: 0,
    channelFit: 0,
    originality: 0,
  }
  for (const key of CORE_METRIC_KEYS) {
    const score = parseScore(record[key])
    if (score == null) return null
    metrics[key] = score
  }
  const musicIdentity = parseScore(record.musicIdentity ?? record.identity)
  const narrativePromise = parseScore(record.narrativePromise ?? record.promise)
  if (profile === 'music') metrics.musicIdentity = musicIdentity
  if (profile === 'history') metrics.narrativePromise = narrativePromise
  if (musicIdentity != null && profile !== 'history') metrics.musicIdentity = musicIdentity
  if (narrativePromise != null && profile !== 'music') metrics.narrativePromise = narrativePromise
  return metrics
}

export function parseTitleAnalysisResponse(
  raw: unknown,
  opts: { profile: TitleAnalysisProfile; localFacts: TitleAnalysisLocalFacts },
): TitleStrengthAnalysis | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const score = parseScore(record.score)
  const verdict = asTrimmed(record.verdict)
  const metrics = asMetrics(record.metrics, opts.profile)
  const strengths = asStringList(record.strengths, 3)
  const weaknesses = asStringList(record.weaknesses, 3)
  const alternatives = asAlternatives(record.alternatives)
  if (score == null || !verdict || !metrics || !alternatives) return null
  if (strengths.length === 0 && weaknesses.length === 0) return null

  return {
    score,
    verdict,
    profile: opts.profile,
    metrics,
    strengths,
    weaknesses,
    alternatives,
    localFacts: opts.localFacts,
  }
}

/** Lê análises novas ou o formato antigo persistido no calendário. */
export function hydrateStoredTitleAnalysis(
  raw: unknown,
  titleForFacts?: string,
): TitleStrengthAnalysis | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const profile = isTitleAnalysisProfile(record.profile) ? record.profile : 'general'
  const localFacts =
    record.localFacts && typeof record.localFacts === 'object'
      ? {
          ...computeTitleLocalFacts(titleForFacts ?? ''),
          ...(record.localFacts as Partial<TitleAnalysisLocalFacts>),
        }
      : computeTitleLocalFacts(titleForFacts ?? '')

  const parsed = parseTitleAnalysisResponse(record, { profile, localFacts })
  if (parsed) return parsed

  const score = parseScore(record.score)
  if (score == null) return null
  const suggestions = asStringList(record.suggestions, 3)
  const alternatives: TitleAlternative[] = Array.isArray(record.alternatives)
    ? asAlternatives(record.alternatives) ?? []
    : suggestions.map((title, index) => ({
        strategy: TITLE_ALTERNATIVE_STRATEGIES[index] ?? 'original_refined',
        title,
        reason: 'Sugestão gerada na análise anterior.',
      }))

  const metricsFromFlat: TitleAnalysisMetrics = {
    hook: parseScore(record.curiosity) ?? 0,
    clarity: parseScore(record.clarity) ?? 0,
    curiosity: parseScore(record.curiosity) ?? 0,
    specificity: parseScore(record.specificity) ?? 0,
    emotion: parseScore(record.emotion) ?? 0,
    naturalness: parseScore(record.clarity) ?? 0,
    mobile: parseScore(record.length) ?? 0,
    channelFit: parseScore(record.specificity) ?? 0,
    originality: parseScore(record.curiosity) ?? 0,
  }

  return {
    score,
    verdict: asTrimmed(record.verdict) || titleScoreBand(score),
    profile,
    metrics: asMetrics(record.metrics, profile) ?? metricsFromFlat,
    strengths: asStringList(record.strengths, 3),
    weaknesses: asStringList(record.weaknesses, 3),
    alternatives,
    localFacts,
  }
}

export function buildTitleAnalysisPrompt(payload: TitleAnalysisPayload): string {
  const profile = payload.projectType
  const language = payload.language?.trim() || payload.channel?.language?.trim() || 'desconhecido'
  const rubric =
    profile === 'music'
      ? [
          'PERFIL: MÚSICA. Não use a rubrica de História.',
          'Entenda a estrutura antes de julgar comprimento: artista, acontecimento/live/festival, nome da música, complemento.',
          'Avalie se cada parte justifica o espaço. Não penalize artista no começo por regra; contextualize reconhecimento no canal.',
          'Preserve o nome oficial da faixa nas alternativas, salvo se o usuário claramente não o usou.',
          'Live, festival, local: só recomende remover se não agregarem valor editorial.',
          'Evite título de catálogo (só Artista – Música) se houver energia, evento ou promessa visual/emocional disponível.',
          'Métrica extra obrigatória: metrics.musicIdentity (identidade musical / evento).',
          'Estratégias das 3 alternativas: original_refined, hook_first, compact — estruturas realmente diferentes.',
        ]
      : profile === 'history'
        ? [
            'PERFIL: HISTÓRIA. Não use a rubrica de Música ao vivo.',
            'Avalie pergunta implícita, curiosidade histórica, especificidade, consequência, conflito, personagem/império/evento,',
            'informação revelada cedo demais, promessa do vídeo, clareza temporal/geográfica, naturalidade, originalidade,',
            'excesso de sensacionalismo e capacidade de atrair quem não conhece o tema.',
            'Métrica extra obrigatória: metrics.narrativePromise (promessa narrativa verdadeira, sem clickbait falso).',
            'Estratégias das 3 alternativas: original_refined, hook_first, compact — ângulos diferentes, mesma promessa honesta.',
          ]
        : [
            'PERFIL: GERAL. Avalie adequação ao tipo de conteúdo informado. Não force rubrica de música ou história.',
            'Estratégias das 3 alternativas: original_refined, hook_first, compact.',
          ]

  return [
    'Você é um analista editorial especialista em títulos de YouTube.',
    'Objetivo: avaliar se ESTE título é forte PARA ESTE VÍDEO E ESTE CANAL.',
    'Não otimize só para clickbait. Equilibre CTR potencial, clareza, qualidade editorial e promessa verdadeira.',
    'Não recomende promessa enganosa sobre o vídeo.',
    '',
    `Idioma do canal/título: ${language}. Analise o título nesse idioma (alemão como alemão, etc.).`,
    'As justificativas (verdict, strengths, weaknesses, reason) devem estar em português do Brasil, citando trechos reais.',
    'As alternativas devem permanecer no idioma do título.',
    '',
    ...rubric,
    '',
    'Comprimento NÃO determina a nota. Título longo pode ser excelente se o gancho visível e cada bloco justificarem o espaço.',
    'Mobile: olhe localObservables.first45 e first60. Pergunta: se truncar ali, o usuário ainda entende a promessa?',
    'Não escreva "título muito longo" nem "precisa de mais curiosidade". Cite QUAL trecho, POR QUE, QUAL impacto.',
    'Máximo 2 frases no verdict. Máximo 3 strengths e 3 weaknesses.',
    'score 0–100 é julgamento editorial final, NÃO média aritmética das métricas.',
    'Faixas: 90–100 Excelente; 80–89 Muito forte; 70–79 Bom, mas pode melhorar; 60–69 Mediano; <60 Fraco.',
    'Não inflar notas. Não destruir títulos bons só porque são longos.',
    'Se recentChannelTitles existir, aponte fórmula repetida como risco editorial, não como condenação automática.',
    'Se thumbnailText existir: título e thumbnail devem se complementar, não repetir a mesma informação sem ganho.',
    'Não invente artista, música, evento, país, métricas de desempenho ou dados ausentes no JSON.',
    '',
    'Contexto (somente dados existentes):',
    JSON.stringify(toTitleAnalysisPayload(payload)),
  ].join('\n')
}

export const TITLE_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    score: {
      type: 'integer',
      description: 'Nota editorial final 0-100. Não é média das métricas. Comprimento sozinho não derruba a nota.',
    },
    verdict: {
      type: 'string',
      description: '1 ou 2 frases em português do Brasil, específicas para este título.',
    },
    metrics: {
      type: 'object',
      properties: {
        hook: { type: 'integer' },
        clarity: { type: 'integer' },
        curiosity: { type: 'integer' },
        specificity: { type: 'integer' },
        emotion: { type: 'integer' },
        naturalness: { type: 'integer' },
        mobile: { type: 'integer' },
        channelFit: { type: 'integer' },
        originality: { type: 'integer' },
        musicIdentity: { type: 'integer', description: 'Só perfil music: identidade musical/evento' },
        narrativePromise: { type: 'integer', description: 'Só perfil history: promessa narrativa' },
      },
      required: CORE_METRIC_KEYS,
    },
    strengths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Até 3 pontos. Cite trechos. Sem frases genéricas.',
    },
    weaknesses: {
      type: 'array',
      items: { type: 'string' },
      description: 'Até 3 pontos. Cite trechos e impacto (ex.: truncamento, fórmula repetida).',
    },
    alternatives: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          strategy: {
            type: 'string',
            enum: TITLE_ALTERNATIVE_STRATEGIES,
          },
          title: { type: 'string', description: 'Título alternativo no idioma original' },
          reason: { type: 'string', description: 'Uma linha em português: por que esta estratégia existe' },
        },
        required: ['strategy', 'title', 'reason'],
      },
    },
  },
  required: ['score', 'verdict', 'metrics', 'strengths', 'weaknesses', 'alternatives'],
} as const
