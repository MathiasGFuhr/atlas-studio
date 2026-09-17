export type ContentLanguageSource =
  | 'override'
  | 'transcript'
  | 'channel'
  | 'project'
  | 'text'
  | 'filename'
  | 'fallback'

export interface ContentLanguageSignals {
  languageOverride?: string | null
  transcriptLanguage?: string | null
  transcriptText?: string
  channelLanguage?: string | null
  projectLanguage?: string | null
  nicheLanguage?: string | null
  extraText?: string
  filename?: string
  title?: string
}

export interface ContentLanguageResolution {
  contentLanguage: string
  languageName: string
  languageLabel: string
  languageSource: ContentLanguageSource
  languageConfidence: number
  detectedLanguage: string | null
  discrepancy: boolean
}

export interface ShortsLanguageFields {
  contentLanguage: string
  languageSource: ContentLanguageSource
  languageConfidence: number
  languageOverride: string | null
  detectedLanguage: string | null
  transcriptLanguage: string | null
}

export interface ContentLanguageOption {
  code: string
  label: string
  languageName: string
}

export const SHORTS_CONTENT_LANGUAGE_OPTIONS: ContentLanguageOption[] = [
  { code: 'de', label: 'Alemão', languageName: 'German' },
  { code: 'en', label: 'Inglês', languageName: 'English' },
  { code: 'pt-BR', label: 'Português', languageName: 'Brazilian Portuguese' },
  { code: 'fr', label: 'Francês', languageName: 'French' },
  { code: 'es', label: 'Espanhol', languageName: 'Spanish' },
  { code: 'it', label: 'Italiano', languageName: 'Italian' },
]

const LANGUAGE_ALIASES: Record<string, string> = {
  de: 'de',
  deu: 'de',
  ger: 'de',
  german: 'de',
  deutsch: 'de',
  alemao: 'de',
  en: 'en',
  eng: 'en',
  english: 'en',
  ingles: 'en',
  pt: 'pt-BR',
  por: 'pt-BR',
  'pt-br': 'pt-BR',
  'pt-pt': 'pt-PT',
  portuguese: 'pt-BR',
  portugues: 'pt-BR',
  brasileiro: 'pt-BR',
  brazil: 'pt-BR',
  fr: 'fr',
  fra: 'fr',
  fre: 'fr',
  french: 'fr',
  frances: 'fr',
  francais: 'fr',
  es: 'es',
  spa: 'es',
  spanish: 'es',
  espanhol: 'es',
  espanol: 'es',
  it: 'it',
  ita: 'it',
  italian: 'it',
  italiano: 'it',
  nl: 'nl',
  dutch: 'nl',
  holandes: 'nl',
  ja: 'ja',
  japanese: 'ja',
  japones: 'ja',
  ko: 'ko',
  korean: 'ko',
  coreano: 'ko',
  ru: 'ru',
  russian: 'ru',
  russo: 'ru',
  pl: 'pl',
  polish: 'pl',
  polones: 'pl',
  und: 'und',
  auto: 'auto',
}

const LANGUAGE_NAMES: Record<string, string> = {
  de: 'German',
  en: 'English',
  'pt-BR': 'Brazilian Portuguese',
  'pt-PT': 'Portuguese',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  nl: 'Dutch',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  pl: 'Polish',
  und: 'the source material language',
}

const LANGUAGE_LABELS: Record<string, string> = {
  de: 'Alemão',
  en: 'Inglês',
  'pt-BR': 'Português',
  'pt-PT': 'Português',
  fr: 'Francês',
  es: 'Espanhol',
  it: 'Italiano',
  nl: 'Holandês',
  ja: 'Japonês',
  ko: 'Coreano',
  ru: 'Russo',
  pl: 'Polonês',
  und: 'Indeterminado',
}

const DETECTOR_PROFILES: Array<{
  code: string
  words: string[]
  unique: RegExp
}> = [
  {
    code: 'de',
    unique: /[äöüßÄÖÜ\u201E\u201A]/g,
    words: [
      'und',
      'der',
      'die',
      'das',
      'ist',
      'nicht',
      'ich',
      'mit',
      'auf',
      'ein',
      'eine',
      'als',
      'den',
      'dem',
      'des',
      'von',
      'zu',
      'im',
      'sich',
      'auch',
      'nach',
      'bei',
      'oder',
      'aber',
      'wie',
      'noch',
      'nur',
      'wenn',
      'dann',
      'war',
      'hat',
      'wird',
      'sind',
      'kann',
      'gegen',
      'begann',
      'erwachte',
      'ganz',
      'takt',
      'nicht',
      'fuer',
      'für',
      'über',
      'ueber',
      'werden',
      'haben',
      'einer',
      'einem',
      'wurde',
      'sein',
      'einer',
    ],
  },
  {
    code: 'pt-BR',
    unique: /[ãõÃÕ]/g,
    words: [
      'que',
      'nao',
      'não',
      'uma',
      'para',
      'com',
      'os',
      'as',
      'do',
      'da',
      'dos',
      'das',
      'voce',
      'você',
      'isso',
      'este',
      'esta',
      'pelo',
      'pela',
      'mais',
      'como',
      'quando',
      'porque',
      'também',
      'tambem',
      'muito',
      'sobre',
      'depois',
      'antes',
      'entre',
    ],
  },
  {
    code: 'en',
    unique: /$^/g,
    words: [
      'the',
      'and',
      'of',
      'to',
      'in',
      'is',
      'that',
      'this',
      'you',
      'for',
      'with',
      'on',
      'are',
      'as',
      'was',
      'be',
      'have',
      'from',
      'or',
      'not',
      'your',
      'they',
      'his',
      'her',
      'about',
      'when',
      'what',
      'which',
    ],
  },
  {
    code: 'fr',
    unique: /[àâçéèêëîïôùûÿœæÀÂÇÉÈÊËÎÏÔÙÛŸŒÆ]/g,
    words: [
      'les',
      'des',
      'une',
      'est',
      'dans',
      'pour',
      'que',
      'qui',
      'pas',
      'avec',
      'sur',
      'plus',
      'par',
      'sont',
      'cette',
      'tout',
      'mais',
      'nous',
      'vous',
      'elle',
    ],
  },
  {
    code: 'es',
    unique: /[ñÑ¡¿]/g,
    words: [
      'que',
      'los',
      'las',
      'una',
      'para',
      'con',
      'el',
      'por',
      'como',
      'del',
      'una',
      'este',
      'esta',
      'pero',
      'mas',
      'más',
      'cuando',
      'sobre',
      'todo',
      'también',
    ],
  },
  {
    code: 'it',
    unique: /[àèéìòùÀÈÉÌÒÙ]/g,
    words: [
      'che',
      'non',
      'una',
      'per',
      'con',
      'il',
      'gli',
      'della',
      'sono',
      'come',
      'più',
      'piu',
      'anche',
      'questo',
      'questa',
      'delle',
      'nel',
      'alla',
    ],
  },
]

const EXPLICIT_LANGUAGE_RE = /(?:idioma|language|sprache)\s*:\s*([^\n.;,]+)/i

export function defaultShortsLanguageFields(): ShortsLanguageFields {
  return {
    contentLanguage: '',
    languageSource: 'fallback',
    languageConfidence: 0,
    languageOverride: null,
    detectedLanguage: null,
    transcriptLanguage: null,
  }
}

export function foldLanguageKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function normalizeLanguageCode(value: string | null | undefined): string | null {
  if (!value) return null
  const raw = value.trim()
  if (!raw) return null
  const folded = foldLanguageKey(raw)
  if (!folded) return null
  if (LANGUAGE_ALIASES[folded]) return LANGUAGE_ALIASES[folded]
  const compact = folded.replace(/\s+/g, '-')
  if (LANGUAGE_ALIASES[compact]) return LANGUAGE_ALIASES[compact]
  const first = folded.split(/[\s-]/)[0]
  if (first && LANGUAGE_ALIASES[first]) return LANGUAGE_ALIASES[first]
  if (/^[a-z]{2}$/.test(folded)) return folded
  if (/^[a-z]{2}-[a-z]{2}$/.test(compact)) {
    const [lang, region] = compact.split('-')
    return `${lang}-${region.toUpperCase()}`
  }
  return null
}

export function contentLanguageName(code: string | null | undefined): string {
  const normalized = normalizeLanguageCode(code) || String(code ?? '').trim()
  if (!normalized) return 'the source material language'
  return LANGUAGE_NAMES[normalized] || LANGUAGE_NAMES[normalized.split('-')[0]] || normalized
}

export function contentLanguageLabel(code: string | null | undefined): string {
  const normalized = normalizeLanguageCode(code) || String(code ?? '').trim()
  if (!normalized) return 'Automático'
  return (
    LANGUAGE_LABELS[normalized] ||
    SHORTS_CONTENT_LANGUAGE_OPTIONS.find((item) => item.code === normalized)?.label ||
    normalized
  )
}

export function extractExplicitLanguage(text: string | null | undefined): string | null {
  if (!text) return null
  const labeled = text.match(EXPLICIT_LANGUAGE_RE)
  if (labeled?.[1]) return normalizeLanguageCode(labeled[1])
  const trimmed = text.trim()
  if (trimmed.length > 40) return null
  return normalizeLanguageCode(trimmed)
}

export function detectLanguageFromText(text: string | null | undefined): {
  code: string | null
  confidence: number
} {
  const raw = String(text ?? '').trim()
  if (raw.length < 8) return { code: null, confidence: 0 }

  const tokens = foldLanguageKey(raw)
    .split(' ')
    .filter((token) => token.length >= 2)
  const scores = new Map<string, number>()

  for (const profile of DETECTOR_PROFILES) {
    let score = 0
    const uniqueHits = raw.match(profile.unique)?.length ?? 0
    score += uniqueHits * 4
    const wordSet = new Set(profile.words.map((word) => foldLanguageKey(word)))
    for (const token of tokens) {
      if (wordSet.has(token)) score += 2
    }
    if (score > 0) scores.set(profile.code, score)
  }

  let bestCode: string | null = null
  let bestScore = 0
  let second = 0
  for (const [code, score] of scores) {
    if (score > bestScore) {
      second = bestScore
      bestScore = score
      bestCode = code
    } else if (score > second) {
      second = score
    }
  }

  if (!bestCode || bestScore < 2) return { code: null, confidence: 0 }
  const margin = bestScore - second
  const confidence = Math.max(0.45, Math.min(0.92, 0.45 + bestScore / 40 + margin / 20))
  return { code: bestCode, confidence }
}

function configuredLanguage(
  value: string | null | undefined,
  opts?: { allowPortuguese?: boolean },
): string | null {
  const code = extractExplicitLanguage(value) || normalizeLanguageCode(value)
  if (!code) return null
  if (!opts?.allowPortuguese && code === 'pt-BR') return null
  return code
}

function pickDetected(input: ContentLanguageSignals): {
  contentLanguage: string
  languageSource: ContentLanguageSource
  languageConfidence: number
  channelLanguage: string | null
} {
  const transcriptCode = normalizeLanguageCode(input.transcriptLanguage)
  const channelLanguage = configuredLanguage(input.channelLanguage, { allowPortuguese: true })
  const projectLanguage = configuredLanguage(input.projectLanguage, { allowPortuguese: true })
  const nicheLanguage = configuredLanguage(input.nicheLanguage, { allowPortuguese: false })
  const transcriptText = detectLanguageFromText(input.transcriptText)
  const extraText = detectLanguageFromText(input.extraText)
  const filenameText = detectLanguageFromText([input.filename, input.title].filter(Boolean).join(' '))

  if (transcriptCode) {
    return {
      contentLanguage: transcriptCode,
      languageSource: 'transcript',
      languageConfidence: 0.97,
      channelLanguage,
    }
  }

  if (transcriptText.code && transcriptText.confidence >= 0.55) {
    return {
      contentLanguage: transcriptText.code,
      languageSource: 'transcript',
      languageConfidence: Math.max(0.72, transcriptText.confidence),
      channelLanguage,
    }
  }

  if (channelLanguage) {
    return {
      contentLanguage: channelLanguage,
      languageSource: 'channel',
      languageConfidence: 0.9,
      channelLanguage,
    }
  }

  if (projectLanguage) {
    return {
      contentLanguage: projectLanguage,
      languageSource: 'project',
      languageConfidence: 0.85,
      channelLanguage,
    }
  }

  if (nicheLanguage) {
    return {
      contentLanguage: nicheLanguage,
      languageSource: 'channel',
      languageConfidence: 0.8,
      channelLanguage,
    }
  }

  if (extraText.code) {
    return {
      contentLanguage: extraText.code,
      languageSource: 'text',
      languageConfidence: extraText.confidence,
      channelLanguage,
    }
  }

  if (filenameText.code) {
    return {
      contentLanguage: filenameText.code,
      languageSource: 'filename',
      languageConfidence: Math.min(0.78, filenameText.confidence + 0.08),
      channelLanguage,
    }
  }

  if (transcriptText.code) {
    return {
      contentLanguage: transcriptText.code,
      languageSource: 'transcript',
      languageConfidence: transcriptText.confidence,
      channelLanguage,
    }
  }

  return {
    contentLanguage: '',
    languageSource: 'fallback',
    languageConfidence: 0,
    channelLanguage,
  }
}

/**
 * Resolve o idioma do conteúdo do Short. Não usa o idioma da interface.
 *
 * Prioridade efetiva:
 * 0. override manual persistido
 * 1. idioma da transcrição (Whisper ou texto)
 * 2. idioma explícito do canal / projeto
 * 3. detecção no texto disponível
 * 4. título / nome do arquivo
 */
export function resolveContentLanguage(input: ContentLanguageSignals): ContentLanguageResolution {
  const detected = pickDetected(input)
  const override = normalizeLanguageCode(input.languageOverride)
  const detectedLanguage = detected.contentLanguage || null
  const channelMismatch =
    Boolean(detected.channelLanguage && detectedLanguage && detected.channelLanguage !== detectedLanguage)

  if (override) {
    return {
      contentLanguage: override,
      languageName: contentLanguageName(override),
      languageLabel: contentLanguageLabel(override),
      languageSource: 'override',
      languageConfidence: 1,
      detectedLanguage,
      discrepancy: Boolean(detectedLanguage && detectedLanguage !== override) || channelMismatch,
    }
  }

  return {
    contentLanguage: detected.contentLanguage,
    languageName: contentLanguageName(detected.contentLanguage || 'und'),
    languageLabel: contentLanguageLabel(detected.contentLanguage),
    languageSource: detected.languageSource,
    languageConfidence: detected.languageConfidence,
    detectedLanguage,
    discrepancy: channelMismatch,
  }
}

export function languageFieldsFromResolution(
  resolution: ContentLanguageResolution,
  input: Pick<ContentLanguageSignals, 'languageOverride' | 'transcriptLanguage'>,
): ShortsLanguageFields {
  return {
    contentLanguage: resolution.contentLanguage,
    languageSource: resolution.languageSource,
    languageConfidence: resolution.languageConfidence,
    languageOverride: normalizeLanguageCode(input.languageOverride),
    detectedLanguage: resolution.detectedLanguage,
    transcriptLanguage: normalizeLanguageCode(input.transcriptLanguage),
  }
}

export function contentLanguagePromptBlock(resolution: Pick<ContentLanguageResolution, 'contentLanguage' | 'languageName'>): string {
  const code = resolution.contentLanguage || 'und'
  const name = resolution.languageName || contentLanguageName(code)
  return [
    `contentLanguage: ${code}`,
    `languageName: ${name}`,
    `Generate all viewer-facing metadata in ${name}.`,
    'Do not translate to Portuguese.',
    'Do not use the UI language.',
    `Write as native ${name} YouTube copy, not a translation from Portuguese.`,
  ].join('\n')
}
