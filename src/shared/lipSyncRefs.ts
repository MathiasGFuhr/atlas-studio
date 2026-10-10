export type LipSyncRef = {
  id: string
  label: string
  prompt: string
  imagePath: string
  imageDataUrl: string | null
  projectId: string | null
  projectName: string | null
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
}

export type LipSyncRefListFilters = {
  projectId?: string | null
  /** Quando true com projectId null, só retorna itens sem projeto. */
  unassignedOnly?: boolean
}
