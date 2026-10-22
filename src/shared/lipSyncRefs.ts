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
