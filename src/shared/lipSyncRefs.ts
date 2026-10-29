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

/** Segundos somados à parte inteira do áudio ao preencher o "Duration" do workflow do Comfy. */
export const COMFY_DURATION_PADDING_SECONDS = 1

export type LipSyncNumberedImage = {
  /** Número da cena, começando em 1. */
  number: number
  fileName: string
  path: string
}

export type LipSyncNumberedAudio = LipSyncNumberedImage & {
  /** null quando o FFmpeg não conseguiu ler o arquivo. */
  duration: number | null
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

/** Só nomes que são apenas o número: `1.png`, `2.jpg`. `cena_1.png` e `1_v2.png` não contam. */
export function sceneNumberFromFileName(fileName: string): number | null {
  const stem = fileStem(fileName).trim()
  if (!/^\d+$/.test(stem)) return null
  const value = Number(stem)
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

/** Último número de cena definido pela pasta (imagem ou áudio). `1.mp3`…`15.mp3` → 15. */
export function lastLipSyncFolderSceneNumber(
  scan: Pick<LipSyncFolderScan, 'matches' | 'audios'>,
): number {
  const lastImage = scan.matches[scan.matches.length - 1]?.number ?? 0
  const lastAudio = scan.audios[scan.audios.length - 1]?.number ?? 0
  return Math.max(lastImage, lastAudio)
}
