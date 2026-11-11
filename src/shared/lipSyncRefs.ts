export type LipSyncRefStatus = 'active' | 'archived'

/** Cantor solo ou conjunto da banda. */
export type LipSyncSubject = 'singer' | 'band'

export const LIPSYNC_SUBJECTS: LipSyncSubject[] = ['singer', 'band']

export const LIPSYNC_SUBJECT_LABEL: Record<LipSyncSubject, string> = {
  singer: 'Cantor',
  band: 'Banda',
}

export function isLipSyncSubject(value: unknown): value is LipSyncSubject {
  return value === 'singer' || value === 'band'
}

export type LipSyncRef = {
  id: string
  label: string
  prompt: string
  /** Trecho da música usado nesta cena. */
  lyrics: string
  imagePath: string
  imageDataUrl: string | null
  /** Miniatura (lado menor ~360px) para listas; null em imagens legadas — use `imageDataUrl`. */
  imageThumbUrl?: string | null
  /** Versão reduzida (lado menor ~1080px) para o preview grande; null em imagens legadas. */
  imagePreviewUrl?: string | null
  /** Trecho de áudio da cena (cópia em userData); vazio quando ainda não vinculado. */
  audioPath: string
  /** URL atlas-media para ouvir o trecho no renderer; null se não houver áudio. */
  audioUrl?: string | null
  /** Duração real do áudio em segundos, lida pelo FFmpeg. */
  audioDuration: number | null
  projectId: string | null
  projectName: string | null
  subject: LipSyncSubject
  status: LipSyncRefStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type LipSyncRefCreateInput = {
  /** Opcional: a cena pode nascer só com prompt ou trecho e receber a imagem depois. */
  imagePath?: string
  label?: string
  prompt?: string
  lyrics?: string
  projectId?: string | null
  subject?: LipSyncSubject
}

export type LipSyncRefUpdateInput = {
  label?: string
  prompt?: string
  lyrics?: string
  projectId?: string | null
  imagePath?: string
  subject?: LipSyncSubject
}

export type LipSyncRefListFilters = {
  projectId?: string | null
  /** Quando true com projectId null, só retorna itens sem projeto. */
  unassignedOnly?: boolean
  /** Padrão: active. Use `all` para incluir arquivados. */
  status?: LipSyncRefStatus | 'all'
  subject?: LipSyncSubject
}

export function isLipSyncRefStatus(value: unknown): value is LipSyncRefStatus {
  return value === 'active' || value === 'archived'
}

export const LIPSYNC_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

/** Acima disso o número do arquivo não é tratado como número de cena (ex.: `foto_2026.png`). */
export const LIPSYNC_MAX_SCENE_NUMBER = 500

export const LIPSYNC_AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac']

/** Letra do trecho exportada em texto puro, dentro da pasta da cena. */
export const LIPSYNC_EXCERPT_EXTENSIONS = ['.txt']

/** Segundos somados à parte inteira do áudio ao preencher o "Duration" do workflow do Comfy. */
export const COMFY_DURATION_PADDING_SECONDS = 1

export type LipSyncNumberedImage = {
  /** Número da cena, começando em 1. */
  number: number
  fileName: string
  path: string
}

export type LipSyncAudioOrigin = 'root' | 'folder'

export type LipSyncNumberedAudio = LipSyncNumberedImage & {
  /** null quando o FFmpeg não conseguiu ler o arquivo. */
  duration: number | null
  /** `folder` quando o áudio saiu de `01/`, `02/`… `root` quando o arquivo está na raiz (`1.mp3`). */
  origin?: LipSyncAudioOrigin
  /**
   * Trecho lido do `.txt` da cena.
   * `string`: texto para gravar na cena.
   * `null`: áudio sem `.txt` — instrumental, o usuário escolhe.
   */
  excerpt?: string | null
}

export type LipSyncNumberedExcerpt = {
  number: number
  fileName: string
  path: string
  text: string
}

export type LipSyncFolderScan = {
  folder: string
  /** Ordenadas pelo número da cena. */
  matches: LipSyncNumberedImage[]
  /** Imagens sem número válido ou com número repetido. */
  ignored: string[]
  /** Áudios numerados, ordenados pelo número da cena. */
  audios: LipSyncNumberedAudio[]
  /** Áudios sem número válido ou com número repetido. */
  ignoredAudios: string[]
  /** `.txt` de uma pasta numerada que não tinha áudio nem `N.mp3` na raiz. */
  excerpts: LipSyncNumberedExcerpt[]
}

export type InstrumentalPreset = {
  id: string
  label: string
  /** Banda e banda com cantor em cena mudam o assunto da cena. */
  subject: LipSyncSubject | null
}

export const INSTRUMENTAL_PRESETS: InstrumentalPreset[] = [
  { id: 'violino', label: 'Violino', subject: null },
  { id: 'guitarra', label: 'Guitarra', subject: null },
  { id: 'violao', label: 'Violão', subject: null },
  { id: 'piano', label: 'Piano', subject: null },
  { id: 'bateria', label: 'Bateria', subject: null },
  { id: 'baixo', label: 'Baixo', subject: null },
  { id: 'teclado', label: 'Teclado', subject: null },
  { id: 'banda', label: 'Banda', subject: 'band' },
  { id: 'banda-cantor', label: 'Banda + cantor sem cantar', subject: 'band' },
]

export type InstrumentalChoice = {
  /** Um ou mais instrumentos selecionados. */
  presetIds: string[]
  /** Texto livre opcional (sempre pode digitar). */
  custom: string
}

/** Texto que vai para o trecho da cena, e o assunto quando alguma opção é de banda. */
export function resolveInstrumentalChoice(
  choice: InstrumentalChoice | string,
  customText = '',
): { lyrics: string; subject: LipSyncSubject | null } | null {
  const presetIds = typeof choice === 'string' ? [choice] : choice.presetIds
  const customRaw = typeof choice === 'string' ? customText : choice.custom
  const custom = customRaw.replace(/\r\n/g, '\n').trim()

  const labels: string[] = []
  let subject: LipSyncSubject | null = null
  for (const id of presetIds) {
    if (id === 'outro') continue
    const preset = INSTRUMENTAL_PRESETS.find((entry) => entry.id === id)
    if (!preset) continue
    if (!labels.includes(preset.label)) labels.push(preset.label)
    if (preset.subject === 'band') subject = 'band'
  }

  const parts = [...labels, ...(custom ? [custom] : [])]
  if (parts.length === 0) return null
  return { lyrics: parts.join(', '), subject }
}

export function applyInstrumentalChoices(
  scan: LipSyncFolderScan,
  choices: Record<number, InstrumentalChoice | undefined>,
): { scan: LipSyncFolderScan; subjects: Record<number, LipSyncSubject> } {
  const subjects: Record<number, LipSyncSubject> = {}
  const audios = scan.audios.map((audio) => {
    if (audio.excerpt !== null) return audio
    const choice = choices[audio.number]
    const resolved = choice ? resolveInstrumentalChoice(choice) : null
    if (!resolved) return audio
    if (resolved.subject) subjects[audio.number] = resolved.subject
    return { ...audio, excerpt: resolved.lyrics }
  })
  return { scan: { ...scan, audios }, subjects }
}

/**
 * Duração inteira enviada ao Comfy: parte inteira do áudio + folga (21,4 s → 22).
 * Segundos inteiros mantêm `duração × 24 + 1` no formato 8n+1 que o LTX exige.
 */
export function comfyDurationSeconds(
  audioDuration: number | null | undefined,
  paddingSeconds = COMFY_DURATION_PADDING_SECONDS,
): number | null {
  if (audioDuration == null || !Number.isFinite(audioDuration) || audioDuration <= 0) return null
  const padding = Math.max(0, Math.floor(paddingSeconds))
  return Math.max(1, Math.floor(audioDuration) + padding)
}

function fileStem(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/**
 * Aceita o número sozinho ou após `Trecho`: `1.png`, `Trecho 2.jpg`, pasta `Trecho 03`.
 * Outros prefixos/sufixos (`cena_1.png`, `1_v2.png`) continuam fora para evitar associações acidentais.
 */
export function sceneNumberFromFileName(fileName: string): number | null {
  const stem = fileStem(fileName).trim()
  const match = stem.match(/^(?:trecho\s+)?(\d+)$/i)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isInteger(value) || value < 1 || value > LIPSYNC_MAX_SCENE_NUMBER) return null
  return value
}

/**
 * Associa cada imagem ao número da cena. Com números repetidos (`1.png` e `01.jpg`) vence o
 * nome mais curto; as demais vão para `ignored`.
 */
export function matchNumberedImages(
  files: { fileName: string; path: string }[],
): Pick<LipSyncFolderScan, 'matches' | 'ignored'> {
  return matchNumberedFiles(files)
}

/** Mesma regra de `matchNumberedImages`, para qualquer tipo de arquivo (ex.: áudios). */
export function matchNumberedFiles<T extends { fileName: string; path: string }>(
  files: T[],
): { matches: Array<T & { number: number }>; ignored: string[] } {
  const ignored: string[] = []
  const byNumber = new Map<number, Array<T & { number: number }>>()

  for (const file of files) {
    const number = sceneNumberFromFileName(file.fileName)
    if (number === null) {
      ignored.push(file.fileName)
      continue
    }
    const group = byNumber.get(number) ?? []
    group.push({ ...file, number })
    byNumber.set(number, group)
  }

  const matches: Array<T & { number: number }> = []
  for (const group of byNumber.values()) {
    group.sort(
      (a, b) =>
        fileStem(a.fileName).length - fileStem(b.fileName).length ||
        a.fileName.localeCompare(b.fileName, undefined, { numeric: true }),
    )
    const [winner, ...rest] = group
    if (winner) matches.push(winner)
    ignored.push(...rest.map((entry) => entry.fileName))
  }

  matches.sort((a, b) => a.number - b.number)
  ignored.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return { matches, ignored }
}

/** Junta textos de prompts salvos na ordem marcada, um embaixo do outro. */
export function joinPromptTexts(texts: string[]): string {
  return texts.map((text) => text.trim()).filter(Boolean).join('\n\n')
}

/** Último número de cena definido pela pasta (imagem, áudio ou `.txt`). `1.mp3`…`15.mp3` → 15. */
export function lastLipSyncFolderSceneNumber(
  scan: Pick<LipSyncFolderScan, 'matches' | 'audios'> & { excerpts?: LipSyncNumberedExcerpt[] },
): number {
  const lastImage = scan.matches[scan.matches.length - 1]?.number ?? 0
  const lastAudio = scan.audios[scan.audios.length - 1]?.number ?? 0
  const lastExcerpt = Math.max(0, ...(scan.excerpts ?? []).map((entry) => entry.number))
  return Math.max(lastImage, lastAudio, lastExcerpt)
}

function stemKey(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const stem = (dot > 0 ? fileName.slice(0, dot) : fileName).trim()
  return stem.toLowerCase()
}

function byStemThenName<T extends { fileName: string }>(preferredStem: string | null) {
  return (a: T, b: T) => {
    const aMatch = preferredStem && stemKey(a.fileName) === preferredStem ? 0 : 1
    const bMatch = preferredStem && stemKey(b.fileName) === preferredStem ? 0 : 1
    return (
      aMatch - bMatch ||
      stemKey(a.fileName).length - stemKey(b.fileName).length ||
      a.fileName.localeCompare(b.fileName, undefined, { numeric: true })
    )
  }
}

export type SceneFolderClip = {
  audio: { fileName: string; path: string } | null
  excerpt: { fileName: string; path: string; text: string } | null
  ignored: string[]
}

/** Dentro de `01/`: um áudio e, se houver, o `.txt` de mesmo nome. O resto fica de fora. */
export function takeSceneFolderClip(input: {
  audios: { fileName: string; path: string }[]
  texts: { fileName: string; path: string; text: string }[]
}): SceneFolderClip {
  const texts = input.texts.filter((entry) => entry.text.trim())
  const textStems = new Set(texts.map((entry) => stemKey(entry.fileName)))
  const audios = [...input.audios].sort((a, b) => {
    const aMatch = textStems.has(stemKey(a.fileName)) ? 0 : 1
    const bMatch = textStems.has(stemKey(b.fileName)) ? 0 : 1
    return (
      aMatch - bMatch ||
      stemKey(a.fileName).length - stemKey(b.fileName).length ||
      a.fileName.localeCompare(b.fileName, undefined, { numeric: true })
    )
  })
  const [audio, ...extraAudios] = audios
  const [excerpt, ...extraTexts] = [...texts].sort(byStemThenName(audio ? stemKey(audio.fileName) : null))
  return {
    audio: audio ?? null,
    excerpt: excerpt ?? null,
    ignored: [...extraAudios, ...extraTexts].map((entry) => entry.fileName),
  }
}

export type SceneFolderSource = {
  number: number
  audio: { fileName: string; path: string } | null
  excerpt: { fileName: string; path: string; text: string } | null
  ignored: string[]
}

/**
 * Áudio dentro de `01/` vence o `1.mp3` da raiz, porque é o que vem junto do `.txt`.
 * Sem áudio na pasta, o arquivo numerado da raiz continua valendo e recebe o texto.
 */
export function mergeRootAndFolderClips(input: {
  rootAudios: Array<{ number: number; fileName: string; path: string }>
  /** `.txt` numerado na raiz, como `4.txt` ao lado de `4.mp3`. */
  rootTexts?: Array<{ number: number; fileName: string; path: string; text: string }>
  folders: SceneFolderSource[]
}): {
  audios: LipSyncNumberedAudio[]
  excerpts: LipSyncNumberedExcerpt[]
  ignoredAudios: string[]
} {
  const ignoredAudios = input.folders.flatMap((folder) => folder.ignored)
  const rootByNumber = new Map(input.rootAudios.map((audio) => [audio.number, audio]))
  const rootTextByNumber = new Map((input.rootTexts ?? []).map((entry) => [entry.number, entry]))
  const audios: LipSyncNumberedAudio[] = []
  const excerpts: LipSyncNumberedExcerpt[] = []
  const handled = new Set<number>()

  for (const folder of input.folders) {
    const text = folder.excerpt?.text.trim() ?? ''
    const root = rootByNumber.get(folder.number)
    if (folder.audio) {
      if (root) ignoredAudios.push(root.fileName)
      handled.add(folder.number)
      audios.push({
        number: folder.number,
        fileName: folder.audio.fileName,
        path: folder.audio.path,
        duration: null,
        origin: 'folder',
        excerpt: text ? text : null,
      })
      continue
    }
    if (text && root && folder.excerpt) {
      handled.add(folder.number)
      audios.push({
        number: root.number,
        fileName: root.fileName,
        path: root.path,
        duration: null,
        origin: 'root',
        excerpt: text,
      })
      continue
    }
    if (text && folder.excerpt) {
      handled.add(folder.number)
      excerpts.push({
        number: folder.number,
        fileName: folder.excerpt.fileName,
        path: folder.excerpt.path,
        text,
      })
    }
  }

  for (const root of input.rootAudios) {
    if (handled.has(root.number)) continue
    const text = rootTextByNumber.get(root.number)?.text.trim() ?? ''
    audios.push({
      number: root.number,
      fileName: root.fileName,
      path: root.path,
      duration: null,
      origin: 'root',
      excerpt: text ? text : null,
    })
  }

  audios.sort((a, b) => a.number - b.number)
  excerpts.sort((a, b) => a.number - b.number)
  ignoredAudios.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return { audios, excerpts, ignoredAudios }
}

function normalizeFolderKey(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** Compara pastas ignorando barra, caixa e barra final. */
export function sameLipSyncFolder(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeFolderKey(a)
  const right = normalizeFolderKey(b)
  return Boolean(left) && left === right
}

/**
 * “Puxar da pasta” só reaproveita o projeto aberto se a pasta já for a dele,
 * ou se ele ainda não tem pasta nem cenas. Qualquer outro caso cria um projeto novo.
 */
export function reuseOpenProjectForFolder(input: {
  currentFolderPath: string | null | undefined
  selectedFolder: string
  currentSceneCount: number
}): boolean {
  if (sameLipSyncFolder(input.currentFolderPath, input.selectedFolder)) return true
  if (!input.currentFolderPath?.trim() && input.currentSceneCount === 0) return true
  return false
}
