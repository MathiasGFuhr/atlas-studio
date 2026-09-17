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
}

export interface ShortsAiCopy {
  index: number
  title: string
  description: string
  hashtags: string[]
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
          title: { type: 'string', description: 'Título editorial nativo no idioma do conteúdo (contentLanguage)' },
          description: { type: 'string', description: 'Descrição curta nativa no idioma do conteúdo (1 a 3 frases)' },
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

function transcriptBlock(cues: TranscriptCue[]): string {
  const lines = cues.map((cue) => formatCueLine(cue)).filter((line) => line.trim())
  return lines.length > 0 ? lines.slice(0, 40).join('\n') : '(sem fala transcrita neste trecho)'
}

export function fallbackShortsCopy(input: {
  index: number
  hook: string
  reason: string
  transcript: TranscriptCue[]
}): ShortsAiCopy {
  const snippet = input.transcript
    .map((cue) => cue.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const fromTranscript = snippet.length > 8 ? snippet.slice(0, 80).replace(/[,.;:!?\s]+$/, '') : ''
  const title = (input.hook || fromTranscript || input.reason || `Short #${input.index}`).trim().slice(0, 100)
  const description = [input.reason.trim(), snippet && snippet !== input.reason ? snippet.slice(0, 180) : '']
    .filter(Boolean)
    .join(' ')
    .slice(0, 280)
  return {
    index: input.index,
    title,
    description,
    hashtags: [],
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
          'Estratégia Música (títulos editoriais profissionais):',
          '- explore o momento específico: refrão, clímax, solo, reação da plateia, frase da música, acontecimento visual',
          '- pode citar artista e música quando fizer sentido editorial',
          '- NÃO use clickbait vazio nem superlativos ocos',
          '- cada Short é um instante diferente da performance — o título precisa mostrar QUAL instante',
        ]
      : [
          'Estratégia História (unidade narrativa do trecho):',
          '- priorize descoberta, consequência, pergunta implícita, fato específico, revelação, conflito, curiosidade',
          '- o título deve funcionar sozinho, sem o episódio completo',
          '- NÃO invente fatos que não estejam no trecho',
          '- NÃO use clickbait falso',
        ]

  const clipBlocks = input.clips
    .map((clip) => {
      const used = (clip.usedTitles ?? []).filter(Boolean)
      return [
        `--- SHORT #${clip.index} ---`,
        `janela: ${formatShortsTimecode(clip.start)} → ${formatShortsTimecode(clip.end)} (${(clip.end - clip.start).toFixed(1)}s)`,
        `startSeconds: ${clip.start.toFixed(2)}`,
        `endSeconds: ${clip.end.toFixed(2)}`,
        `score: ${clip.score}`,
        `motivoDoCorte: ${clip.reason || '(não informado)'}`,
        `hook: ${clip.hook || '(não informado)'}`,
        clip.currentTitle ? `tituloAtual: ${clip.currentTitle}` : '',
        clip.currentDescription ? `descricaoAtual: ${clip.currentDescription}` : '',
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
    'Os cortes JÁ foram escolhidos. NÃO altere timestamps. Só escreva metadados editoriais de cada trecho.',
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
    musicRules.join('\n'),
    '',
    'Regras de título:',
    '- um título por Short, específico DAQUELE trecho (transcript + motivo + hook)',
    '- se houver 5 Shorts, quero 5 títulos realmente diferentes',
    '- proibido repetir o mesmo título ou variar só um adjetivo',
    `- proibido títulos genéricos como: ${GENERIC_TITLE_HINTS.map((item) => `"${item}"`).join(', ')}`,
    '- profissional, editorial, concreto',
    '',
    'Regras de descrição:',
    '- 1 a 3 frases curtas contextualizando ESTE trecho',
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
    })
  }

  return expected.map((item) => {
    const found = byIndex.get(item.index)
    if (found) return found
    return { index: item.index, title: '', description: '', hashtags: [] }
  })
}
