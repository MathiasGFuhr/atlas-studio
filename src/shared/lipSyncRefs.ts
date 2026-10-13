export type LipSyncRefStatus = 'active' | 'archived'

export type LipSyncRef = {
  id: string
  label: string
  prompt: string
  imagePath: string
  imageDataUrl: string | null
  projectId: string | null
  projectName: string | null
  status: LipSyncRefStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type LipSyncRefCreateInput = {
  imagePath: string
  label?: string
  prompt?: string
  projectId?: string | null
}

export type LipSyncRefUpdateInput = {
  label?: string
  prompt?: string
  projectId?: string | null
  imagePath?: string
}

export type LipSyncRefListFilters = {
  projectId?: string | null
  /** Quando true com projectId null, só retorna itens sem projeto. */
  unassignedOnly?: boolean
  /** Padrão: active. Use `all` para incluir arquivados. */
  status?: LipSyncRefStatus | 'all'
}

export function isLipSyncRefStatus(value: unknown): value is LipSyncRefStatus {
  return value === 'active' || value === 'archived'
}
