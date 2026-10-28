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

export type LipSyncNumberedImage = {
  /** Número da cena, começando em 1. */
  number: number
  fileName: string
  path: string
}

export type LipSyncFolderScan = {
  folder: string
  /** Ordenadas pelo número da cena. */
  matches: LipSyncNumberedImage[]
  /** Imagens sem número válido ou com número repetido. */
  ignored: string[]
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
  const ignored: string[] = []
  const byNumber = new Map<number, LipSyncNumberedImage[]>()

  for (const file of files) {
    const number = sceneNumberFromFileName(file.fileName)
    if (number === null) {
      ignored.push(file.fileName)
      continue
    }
    const group = byNumber.get(number) ?? []
    group.push({ number, fileName: file.fileName, path: file.path })
    byNumber.set(number, group)
  }

  const matches: LipSyncNumberedImage[] = []
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
