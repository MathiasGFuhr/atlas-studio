import type {
  ShortsCopyFields,
  ShortsEditorialContext,
  ShortsProfile,
  TranscriptCue,
} from '../shorts'
import { formatShortsTimecode, normalizeHashtags } from '../shorts'
import { contentLanguagePromptBlock } from '../shortsLanguage'

export interface ShortsCopyClipInput {
  index: number
  start: number
  end: number
  score: number
  reason: string
  hook: string
  transcript: TranscriptCue[]
  currentTitle?: string
  currentDescription?: string
  usedTitles?: string[]
  visualReason?: string
  audioReason?: string
  visualSummary?: string
  audioSummary?: string
  keyframePaths?: string[]
  clipMediaPath?: string | null
  watchedClip?: boolean
  rejectedTitle?: string
  rejectedDescription?: string
}

export interface ShortsAiCopy {
  index: number
  title: string
  description: string
  hashtags: string[]
  hook?: string
}

export const SHORTS_COPY_FAIL_MESSAGE = 'O Antigravity não devolveu título e descrição válidos.'

export const SHORTS_COPY_SCHEMA = {
  type: 'object',
  properties: {
    clips: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: 'Número do Short (1-based)' },
          hook: { type: 'string', description: 'Gancho de 1 frase no idioma do conteúdo, específico deste trecho' },
          title: {
            type: 'string',
            description:
              'Título clicável: uma frase literal dita ou cantada neste trecho, cortada para dar vontade de ouvir o resto. Proibido instrumento, clima, arranjo ou “a canção começa”.',
          },
          description: {
            type: 'string',
            description:
              '1 a 3 frases com as falas reais deste trecho, para quem lê saber o que é dito antes de ouvir. Proibido arranjo, instrumento ou “a canção se inicia”.',
          },
          hashtags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Até 5 hashtags relevantes, sem # obrigatório',
          },
        },
        required: ['index', 'title', 'description'],
      },
    },
  },
  required: ['clips'],
}

const GENERIC_TITLE_HINTS = [
  'Momento incrível',
  'Você precisa ver isso',
  'Performance épica',
  'O momento mais intenso',
  'Um momento intenso',
  'Melhor momento',
  'Não perca',
  'Assista até o fim',
]

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

function formatCueLine(cue: TranscriptCue): string {
  return `[${cue.start.toFixed(1)}-${cue.end.toFixed(1)}] ${cue.text.trim()}`
}

function spokenLines(cues: TranscriptCue[]): string[] {
  return cues
    .map((cue) => cue.text.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 1)
    .slice(0, 24)
}

function transcriptBlock(cues: TranscriptCue[]): string {
  const lines = cues.map((cue) => formatCueLine(cue)).filter((line) => line.trim())
  return lines.length > 0 ? lines.slice(0, 40).join('\n') : '(sem fala transcrita neste trecho)'
}

function spokenSourceBlock(cues: TranscriptCue[]): string {
  const lines = spokenLines(cues)
  if (lines.length === 0) {
    return [
      'O QUE É DITO NESTE TRECHO: (sem transcrição)',
      'Sem fala utilizável: não invente letra e não preencha título/descrição com instrumento, clima ou “abertura intimista”.',
    ].join('\n')
  }
  return [
    'O QUE É DITO NESTE TRECHO (única fonte de título e descrição):',
    ...lines.map((line) => `- "${line}"`),
  ].join('\n')
}

const ARRANGEMENT_WORDS = new Set([
  'abertura',
  'intimista',
  'violao',
  'piano',
  'introducao',
  'interprete',
  'serena',
  'sereno',
  'premissa',
  'acustico',
  'acustica',
  'arranjo',
  'melodia',
  'guitarra',
  'bateria',
  'plateia',
  'refrao',
  'climax',
  'instrumental',
  'delicadeza',
  'emocional',
  'gitarre',
  'klavier',
])

const STOP_WORDS = new Set([
  'que',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'a',
  'o',
  'e',
  'em',
  'um',
  'uma',
  'para',
  'com',
  'no',
  'na',
  'se',
  'eu',
  'voce',
  'me',
  'te',
  'por',
  'mais',
  'nao',
  'os',
  'as',
  'ao',
  'ou',
  'ja',
  'ele',
  'ela',
  'the',
  'and',
  'of',
  'to',
  'in',
  'ich',
  'du',
  'und',
  'der',
  'die',
  'das',
  'ein',
  'eine',
])

const NOISE_LINE =
  /^(musica|music|aplausos|applause|risos|laughter|silencio|silence|instrumental|ah+|oh+|yeah+|la+|na+|hmm+|hum+)$/

const EMOTION =
  /\b(eu|voce|nunca|sempre|ainda|mas|porque|quando|sem|amor|perd\w*|dor|medo|chor\w*|odei\w*|quero|precis\w*|deix\w*|volt\w*|ich|nicht|immer|nie|aber|wenn|liebe|schmerz|zu viel|te amo)\b/

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function usableSpeechLines(cues: TranscriptCue[]): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const cue of cues) {
    const clean = cue.text.replace(/[♪♫]/g, ' ').replace(/\s+/g, ' ').trim()
    const folded = fold(clean)
    if (folded.length < 2 || NOISE_LINE.test(folded) || seen.has(folded)) continue
    seen.add(folded)
    lines.push(clean)
  }
  return lines.slice(0, 24)
}

function arrangementHits(text: string, speech: string): boolean {
  const speechFold = fold(speech)
  return fold(text)
    .split(' ')
    .filter((word) => word.length > 3)
    .some((word) => ARRANGEMENT_WORDS.has(word) && !speechFold.includes(word))
}

function hasLiteralPhrase(text: string, speech: string): boolean {
  const speechFold = fold(speech)
  const words = fold(text)
    .split(' ')
    .filter((word) => word.length > 1)
  if (words.length === 0 || !speechFold) return false
  const size = Math.min(3, words.length)
  if (size < 2) return words[0].length >= 4 && !STOP_WORDS.has(words[0]) && speechFold.includes(words[0])
  for (let i = 0; i + size <= words.length; i += 1) {
    const window = words.slice(i, i + size)
    const hasContent = window.some((word) => word.length >= 4 && !STOP_WORDS.has(word))
    if (!hasContent) continue
    if (speechFold.includes(window.join(' '))) return true
  }
  return false
}

function titleIsGrounded(title: string, lines: string[], songTitle?: string): boolean {
  const speech = lines.join(' ')
  if (!title.trim() || arrangementHits(title, speech) || !hasLiteralPhrase(title, speech)) return false
  const foldedTitle = fold(title)
  const foldedSong = songTitle ? fold(songTitle) : ''
  if (!foldedSong) return true
  const rest = foldedTitle.startsWith(foldedSong) ? foldedTitle.slice(foldedSong.length).trim() : foldedTitle
  const songOnly = foldedTitle === foldedSong || rest.split(' ').filter(Boolean).length < 3
  if (!songOnly) return true
  const hasRicherLine = lines.some((line) => {
    const folded = fold(line)
    return folded !== foldedSong && folded.split(' ').length >= 4
  })
  return !hasRicherLine
}

function descriptionIsGrounded(description: string, lines: string[]): boolean {
  const speech = lines.join(' ')
  return Boolean(description.trim()) && !arrangementHits(description, speech) && hasLiteralPhrase(description, speech)
}

function polishPhrase(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim().replace(/^["“”']+|["“”']+$/g, '')
  if (!clean) return ''
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

function clipTitle(text: string): string {
  const clean = polishPhrase(text)
  if (clean.length <= 100) return clean
  const cut = clean.slice(0, 100)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[,:;.\s]+$/, '')
}

function scoreTitle(text: string, songTitle?: string): number {
  const folded = fold(text)
  const words = folded.split(' ').filter(Boolean)
  let score = 0
  if (words.length >= 6 && words.length <= 12) score += 8
  else if (words.length >= 4 && words.length <= 14) score += 4
  else score -= 4
  score -= Math.abs(words.length - 9)
  if (text.includes('?')) score += 6
  if (EMOTION.test(folded)) score += 4
  if (songTitle && folded === fold(songTitle)) score -= 15
  return score
}

export function clickableCopyFromSpeech(
  cues: TranscriptCue[],
  songTitle?: string,
): { title: string; description: string } {
  const lines = usableSpeechLines(cues)
  if (lines.length === 0) return { title: '', description: '' }
  const candidates: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    candidates.push(lines[i])
    if (i + 1 < lines.length) {
      const head = lines[i].replace(/[.!?,;:]+$/g, '')
      const tail = lines[i + 1].trim()
      const bridge = /^(mas|porque|quando|though|but|aber)\b/i.test(tail) ? ',' : ''
      const joined = `${head}${bridge} ${tail}`.replace(/\s+/g, ' ').trim()
      const count = joined.split(/\s+/).length
      if (count >= 4 && count <= 14) candidates.push(joined)
    }
  }
  const best = candidates.reduce((winner, current) =>
    scoreTitle(current, songTitle) > scoreTitle(winner, songTitle) ? current : winner,
  )
  const title = clipTitle(best)
  const description = lines
    .slice(0, 5)
    .map((line) => {
      const clean = polishPhrase(line)
      return /[.!?…]$/.test(clean) ? clean : `${clean}.`
    })
    .join(' ')
    .slice(0, 320)
  return { title, description: description || title }
}

export function speechCopyNeedsRepair(
  copy: Pick<ShortsAiCopy, 'title' | 'description'>,
  transcript: TranscriptCue[],
  options?: { songTitle?: string; fields?: ShortsCopyFields },
): boolean {
  const lines = usableSpeechLines(transcript)
  if (lines.length === 0) return false
  const fields = options?.fields ?? 'all'
  if (fields !== 'description' && !titleIsGrounded(copy.title, lines, options?.songTitle)) return true
  if (fields !== 'title' && !descriptionIsGrounded(copy.description, lines)) return true
  return false
}

export function groundShortsCopy(
  copy: ShortsAiCopy,
  input: { transcript: TranscriptCue[]; songTitle?: string },
): ShortsAiCopy {
  const lines = usableSpeechLines(input.transcript)
  if (lines.length === 0) {
    return {
      ...copy,
      title: arrangementHits(copy.title, '') ? '' : copy.title,
      description: arrangementHits(copy.description, '') ? '' : copy.description,
    }
  }
  const local = clickableCopyFromSpeech(input.transcript, input.songTitle)
  const titleOk = titleIsGrounded(copy.title, lines, input.songTitle)
  const descriptionOk = descriptionIsGrounded(copy.description, lines)
  return {
    ...copy,
    title: titleOk ? copy.title.trim() : local.title,
    description: descriptionOk ? copy.description.trim() : local.description,
    hook: copy.hook && titleIsGrounded(copy.hook, lines, input.songTitle) ? copy.hook.trim() : '',
  }
}

export function fallbackShortsCopy(input: {
  index: number
  hook: string
  reason: string
  transcript: TranscriptCue[]
  songTitle?: string
}): ShortsAiCopy {
  const local = clickableCopyFromSpeech(input.transcript, input.songTitle)
  return {
    index: input.index,
    title: local.title,
    description: local.description,
    hashtags: [],
    hook: local.title,
  }
}

export function buildShortsCopiesPrompt(input: {
  profile: ShortsProfile
  editorial: ShortsEditorialContext
  fileName: string
  videoDuration: number
  fields: ShortsCopyFields
  clips: ShortsCopyClipInput[]
}): string {
  const profileLabel = input.profile === 'music' ? 'MÚSICA' : 'HISTÓRIA'
  const contentLanguage = input.editorial.contentLanguage?.trim() || input.editorial.language.trim()
  const languageName = input.editorial.languageName?.trim() || contentLanguage || 'the source material language'
  const language = contentLanguage || languageName
  const fieldsLabel =
    input.fields === 'title'
      ? 'Reescreva APENAS o título de cada clip. description e hashtags ainda entram no JSON, mas o Atlas só aplicará o título.'
      : input.fields === 'description'
        ? 'Reescreva APENAS a descrição e as hashtags. O título ainda entra no JSON, mas o Atlas só aplicará descrição/hashtags.'
        : 'Gere título, descrição e hashtags para cada clip.'

  const musicRules =
    input.profile === 'music'
      ? [
          'Estratégia Música (título clicável a partir do que é dito/cantado NESTE trecho):',
          '- título e descrição nascem da FALA/LETRA transcrita deste Short',
          '- o título é uma frase LITERAL do bloco "O QUE É DITO": verso, confissão ou pergunta, cortada para dar vontade de ouvir a próxima linha',
          '- pode cortar a frase; não pode trocar as palavras por clima, instrumento ou sinônimo',
          '- comece pela frase forte. O nome da música não substitui o que é dito',
          '- cada Short usa palavras diferentes daquele intervalo',
          '- PROIBIDO descrever arranjo, instrumento, clima ou estrutura: "abertura intimista", "voz, violão e piano", "introdução serena", "o intérprete entra", "tom emocional", "a canção se inicia"',
          '- PROIBIDO clickbait vazio que não esteja nas palavras: "momento incrível", "você precisa ouvir", "não perca"',
        ]
      : [
          'Estratégia História (título clicável a partir do que é dito NESTE trecho):',
          '- título e descrição nascem da fala transcrita deste Short',
          '- título clicável: descoberta, consequência, pergunta implícita, fato específico, revelação ou conflito dito no trecho',
          '- o título deve funcionar sozinho, sem o episódio completo',
          '- NÃO invente fatos que não estejam no trecho',
          '- NÃO use clickbait falso nem resumo genérico do episódio',
        ]

  const clipBlocks = input.clips
    .map((clip) => {
      const used = (clip.usedTitles ?? []).filter(Boolean)
      const spoken = spokenLines(clip.transcript)
      const suggested = spoken.length
        ? clickableCopyFromSpeech(clip.transcript, input.editorial.songTitle).title
        : ''
      return [
        `--- SHORT #${clip.index} ---`,
        spokenSourceBlock(clip.transcript),
        suggested ? `fraseLiteralParaOTitulo: "${suggested}"` : '',
        `janela: ${formatShortsTimecode(clip.start)} → ${formatShortsTimecode(clip.end)} (${(clip.end - clip.start).toFixed(1)}s)`,
        `startSeconds: ${clip.start.toFixed(2)}`,
        `endSeconds: ${clip.end.toFixed(2)}`,
        `score: ${clip.score}`,
        `motivoDoCorte (nota interna, não copie como título): ${clip.reason || '(não informado)'}`,
        spoken.length
          ? 'Este Short tem fala transcrita. Título e descrição usam só essas palavras. Não descreva imagem, instrumento, plateia nem clima.'
          : [
              clip.visualReason ? `visualDesteTrecho (contexto, não vira título nem descrição): ${clip.visualReason}` : '',
              clip.audioReason ? `audioDesteTrecho (contexto, não vira título nem descrição): ${clip.audioReason}` : '',
              clip.visualSummary ? `oQueSeVeNesteTrecho (contexto, não vira copy): ${clip.visualSummary}` : '',
              clip.audioSummary ? `oQueSeOuveNesteTrecho (contexto, não vira copy): ${clip.audioSummary}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
        spoken.length
          ? 'Se assistir ao recorte, é só para conferir as palavras já transcritas. Não transforme o que você vê em título.'
          : clip.watchedClip && clip.clipMediaPath
            ? `Assista/ouça ESTE recorte em ${clip.clipMediaPath} (intervalo ${clip.start.toFixed(1)}–${clip.end.toFixed(1)}s). Não recicle a análise global.`
            : clip.keyframePaths?.length
              ? `Frames deste Short:\n${clip.keyframePaths.map((path) => `  ${path}`).join('\n')}\nAnalise ESTE trecho. Você não necessariamente assistiu ao vídeo inteiro.`
              : 'Analise o conteúdo específico deste Short, não o vídeo inteiro.',
        `hookAtual: ${clip.hook || '(vazio)'}`,
        clip.currentTitle ? `tituloAtual: ${clip.currentTitle}` : '',
        clip.currentDescription ? `descricaoAtual: ${clip.currentDescription}` : '',
        clip.rejectedTitle || clip.rejectedDescription
          ? [
              'A resposta anterior foi rejeitada porque não usa o que é dito neste trecho.',
              clip.rejectedTitle ? `tituloRejeitado: ${clip.rejectedTitle}` : '',
              clip.rejectedDescription ? `descricaoRejeitada: ${clip.rejectedDescription}` : '',
              'Não repita esse texto. O título novo copia uma frase literal da transcrição.',
            ]
              .filter(Boolean)
              .join('\n')
          : '',
        used.length ? `titulosJaUsadosEmOutrosShorts: ${used.join(' | ')}` : '',
        'transcriptDesteTrecho:',
        transcriptBlock(clip.transcript),
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')

  const contextLines = [
    input.editorial.channelName ? `canal: ${input.editorial.channelName}` : '',
    input.editorial.artistName ? `artistName: ${input.editorial.artistName}` : '',
    input.editorial.songTitle ? `songTitle: ${input.editorial.songTitle}` : '',
    `arquivoOriginal: ${input.fileName}`,
    `contentLanguage: ${contentLanguage || 'und'}`,
    `languageName: ${languageName}`,
    `idiomaObrigatorio: ${language}`,
  ].filter(Boolean)

  return [
    'Você é editor de YouTube Shorts do Atlas Studio.',
    'Os cortes JÁ foram escolhidos. NÃO altere timestamps. Escreva metadados de CADA trecho depois de analisar aquele Short.',
    'Não gere título/descrição só com a análise global. Short #1 usa o conteúdo do Short #1; Short #2 usa o conteúdo do Short #2.',
    `Perfil editorial: ${profileLabel}. NÃO use a estratégia do outro perfil.`,
    `videoDuration: ${input.videoDuration.toFixed(1)}`,
    contextLines.join('\n'),
    fieldsLabel,
    '',
    contentLanguagePromptBlock({
      contentLanguage: contentLanguage || 'und',
      languageName,
    }),
    '',
    'Idioma do conteúdo (obrigatório, já resolvido pelo Atlas):',
    `- título, descrição e hashtags DEVEM estar em ${languageName} (${contentLanguage || 'und'}).`,
    '- NÃO use o idioma da interface do Atlas.',
    '- NÃO traduza para português, a menos que contentLanguage seja português.',
    '- NÃO traduza automaticamente para inglês.',
    '- reason/hook abaixo: reason é nota interna; hook já deve estar no idioma do conteúdo. Não copie reason como título.',
    '',
    'Exemplo que será descartado:',
    'Título ruim: Aprender a Perdoar: Abertura íntima com voz, violão e piano',
    'Descrição ruim: A canção se inicia com uma introdução serena ao piano e violão. O intérprete entra com delicadeza, estabelecendo a premissa emocional.',
    'Exemplo certo, só se o trecho disser essas palavras: título "Eu tentei te odiar, mas eu ainda te amo". A descrição continua com as frases seguintes da fala, sem instrumento e sem clima.',
    '',
    musicRules.join('\n'),
    '- NÃO invente tema político, social ou letra que não esteja em "O QUE É DITO NESTE TRECHO".',
    '- Se houver fala transcrita, ignore arranjo, instrumento, plateia e clima. Isso não é título nem descrição.',
    '- O título precisa conter uma sequência literal de palavras desse bloco. fraseLiteralParaOTitulo é a frase forte; use ela ou outro corte literal do mesmo bloco.',
    '- Sem fala transcrita: não invente letra e não substitua por "abertura", "violão", "piano" ou "tom intimista".',
    '',
    'Regras de título (clicável):',
    '- um título por Short, feito SÓ com o que é dito naquele intervalo',
    '- a pessoa clica porque quer ouvir aquela frase, confissão ou pergunta — não porque leu uma ficha da música',
    '- 4 a 12 palavras quando a frase couber; no máximo 100 caracteres',
    '- se houver 5 Shorts, quero 5 títulos realmente diferentes, cada um com palavras daquele trecho',
    '- proibido repetir o mesmo título ou variar só um adjetivo',
    '- proibido "Nome da música: abertura/clima/instrumento"',
    `- proibido títulos genéricos como: ${GENERIC_TITLE_HINTS.map((item) => `"${item}"`).join(', ')}`,
    '',
    'Regras de descrição:',
    '- 1 a 3 frases curtas com o que é falado ou cantado NESTE trecho',
    '- cite as falas reais do intervalo, para quem lê saber o conteúdo antes de ouvir',
    '- cada frase precisa trazer palavras que estão na transcrição deste Short',
    '- proibido: "a canção se inicia", "introdução serena", "o intérprete entra", "estabelecendo a premissa emocional"',
    '- não copiar a descrição do vídeo original',
    '- sem enrolação',
    '',
    'Hashtags:',
    '- 0 a 5, só se forem relevantes a este trecho',
    '- sem muralha, sem tags aleatórias só porque são populares (#fyp #viral #foryou)',
    '- #shorts no máximo uma vez, e só se couber',
    '',
    'Clips:',
    clipBlocks,
    '',
    'Responda só no JSON do schema.',
  ].join('\n')
}

export function normalizeShortsCopies(
  raw: Record<string, unknown>,
  expected: Array<{ index: number }>,
): ShortsAiCopy[] {
  const list = Array.isArray(raw.clips) ? raw.clips : []
  const byIndex = new Map<number, ShortsAiCopy>()

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const index = Math.round(asNumber(record.index, NaN))
    if (!Number.isFinite(index) || index < 1) continue
    const title = asText(record.title)
    const description = asText(record.description)
    if (!title && !description) continue
    byIndex.set(index, {
      index,
      title,
      description,
      hashtags: normalizeHashtags(record.hashtags),
      hook: asText(record.hook),
    })
  }

  return expected.map((item) => {
    const found = byIndex.get(item.index)
    if (found) return found
    return { index: item.index, title: '', description: '', hashtags: [], hook: '' }
  })
}
