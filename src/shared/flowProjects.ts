/** Projetos Google Flow gerenciados pelo Atlas (Fase 1 — criação e vínculo). */

/**
 * URL canônica atual do Google Flow (confirmada na UI):
 * https://flow.google.com/project/{uuid}
 */
export const FLOW_HOME_URL = 'https://flow.google.com/'
/** Home do Flow — a criação real é via botão “New project” ( /project/new no flow.google.com vira 404 ). */
export const FLOW_NEW_PROJECT_URL = FLOW_HOME_URL
/** Legado Labs — ainda aceito na leitura de vínculos antigos. */
export const FLOW_LABS_HOME_URL = 'https://labs.google/fx/tools/flow'

export const FLOW_SYNC_STATUSES = [
  'local_created',
  'awaiting_login',
  'creating',
  'linked',
  'sync_failed',
] as const

export type FlowSyncStatus = (typeof FLOW_SYNC_STATUSES)[number]

export const FLOW_SYNC_STATUS_LABEL: Record<FlowSyncStatus, string> = {
  local_created: 'Criado localmente',
  awaiting_login: 'Aguardando login no Flow',
  creating: 'Criando no Flow',
  linked: 'Projeto vinculado ao Flow',
  sync_failed: 'Falha de sincronização',
}

/** Modelos de imagem do Google Flow (seletor “Nano Banana”). */
export const FLOW_IMAGE_MODELS = [
  'nano-banana-pro',
  'nano-banana-2-lite',
  'nano-banana-2.1',
] as const

export type FlowImageModel = (typeof FLOW_IMAGE_MODELS)[number]

export const FLOW_IMAGE_MODEL_LABEL: Record<FlowImageModel, string> = {
  'nano-banana-pro': 'Nano Banana Pro',
  'nano-banana-2-lite': 'Nano Banana 2 Lite',
  'nano-banana-2.1': 'Nano Banana 2.1',
}

export const DEFAULT_FLOW_IMAGE_MODEL: FlowImageModel = 'nano-banana-2.1'

/** Quantidade de imagens (pílula x1–x4 ao lado do modelo). */
export const FLOW_IMAGE_OUTPUTS = [1, 2, 3, 4] as const

export type FlowImageOutputs = (typeof FLOW_IMAGE_OUTPUTS)[number]

export const DEFAULT_FLOW_IMAGE_OUTPUTS: FlowImageOutputs = 3

export interface FlowProject {
  id: string
  name: string
  localFolderPath: string
  remoteUrl: string | null
  remoteId: string | null
  /** Identificação segura da conta (ex.: e-mail mascarado). Nunca token/senha. */
  accountHint: string | null
  syncStatus: FlowSyncStatus
  lastError: string | null
  /** Se o usuário pediu criação remota neste projeto. */
  createInFlow: boolean
  /** Token de operação para retomar sem duplicar. */
  operationId: string
  /** Prompt local no Atlas (ainda não sincronizado com o Google Flow). */
  prompt: string
  /** Modelo de imagem do compositor Flow. */
  imageModel: FlowImageModel
  /** Quantidade de saídas (xN) no compositor Flow. */
  imageOutputs: FlowImageOutputs
  /** Fila de geração pausada (ex.: atividade incomum no Flow). */
  generationPaused: boolean
  createdAt: string
  updatedAt: string
}

/** Papéis sugeridos para referências de imagem. */
export const FLOW_REFERENCE_ROLE_SUGGESTIONS = [
  'cantor',
  'banda',
  'microfone',
  'cenário',
] as const

export type FlowReferenceRoleSuggestion = (typeof FLOW_REFERENCE_ROLE_SUGGESTIONS)[number]

export const FLOW_REFERENCE_SYNC_STATUSES = [
  'local',
  'sending',
  'confirming',
  'sent',
  'error',
] as const

export type FlowReferenceSyncStatus = (typeof FLOW_REFERENCE_SYNC_STATUSES)[number]

export function isFlowReferenceSyncStatus(value: unknown): value is FlowReferenceSyncStatus {
  return (
    typeof value === 'string' &&
    (FLOW_REFERENCE_SYNC_STATUSES as readonly string[]).includes(value)
  )
}

export function normalizeFlowReferenceSyncStatus(value: unknown): FlowReferenceSyncStatus {
  return isFlowReferenceSyncStatus(value) ? value : 'local'
}

export const FLOW_GENERATION_CARD_STATUSES = [
  'draft',
  'preparing',
  'prepared',
  'generating',
  'done',
  'blocked',
  'error',
] as const

export type FlowGenerationCardStatus = (typeof FLOW_GENERATION_CARD_STATUSES)[number]

export function isFlowGenerationCardStatus(value: unknown): value is FlowGenerationCardStatus {
  return (
    typeof value === 'string' &&
    (FLOW_GENERATION_CARD_STATUSES as readonly string[]).includes(value)
  )
}

export function normalizeFlowGenerationCardStatus(value: unknown): FlowGenerationCardStatus {
  return isFlowGenerationCardStatus(value) ? value : 'draft'
}

export interface FlowGenerationCard {
  id: string
  projectId: string
  number: number
  prompt: string
  status: FlowGenerationCardStatus
  lastError: string | null
  /** Log das etapas de preparação/geração (JSON serializado). */
  prepLog: string[]
  createdAt: string
  updatedAt: string
}

export type FlowGenerationCardUpdateInput = {
  prompt?: string
  status?: FlowGenerationCardStatus
  lastError?: string | null
  prepLog?: string[]
}

export type FlowProjectCreateInput = {
  name: string
  localFolderPath: string
  createInFlow?: boolean
}

export type FlowProjectPatch = Partial<
  Pick<
    FlowProject,
    | 'name'
    | 'localFolderPath'
    | 'remoteUrl'
    | 'remoteId'
    | 'accountHint'
    | 'syncStatus'
    | 'lastError'
    | 'createInFlow'
    | 'prompt'
    | 'imageModel'
    | 'imageOutputs'
    | 'generationPaused'
  >
>

export function normalizeFlowProjectPrompt(prompt: unknown): string {
  return typeof prompt === 'string' ? prompt.slice(0, 20_000) : ''
}

export function isFlowImageModel(value: unknown): value is FlowImageModel {
  return typeof value === 'string' && (FLOW_IMAGE_MODELS as readonly string[]).includes(value)
}

export function normalizeFlowImageModel(value: unknown): FlowImageModel {
  return isFlowImageModel(value) ? value : DEFAULT_FLOW_IMAGE_MODEL
}

export function flowImageModelLabel(model: FlowImageModel): string {
  return FLOW_IMAGE_MODEL_LABEL[model]
}

export function isFlowImageOutputs(value: unknown): value is FlowImageOutputs {
  return typeof value === 'number' && (FLOW_IMAGE_OUTPUTS as readonly number[]).includes(value)
}

export function normalizeFlowImageOutputs(value: unknown): FlowImageOutputs {
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return normalizeFlowImageOutputs(Number(value.trim()))
  }
  return isFlowImageOutputs(value) ? value : DEFAULT_FLOW_IMAGE_OUTPUTS
}

/** Menções no prompt: `@cantor` ou `[cantor]`. */
export function parseFlowPromptMentions(prompt: unknown): string[] {
  const text = normalizeFlowProjectPrompt(prompt)
  const found: string[] = []
  const seen = new Set<string>()
  const patterns = [/@([A-Za-zÀ-ÿ0-9_][\wÀ-ÿ-]{0,78})/g, /\[([A-Za-zÀ-ÿ0-9_][^\]\n]{0,78})\]/g]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const label = validateFlowReferenceLabel(match[1])
      const key = label.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      found.push(label)
    }
  }
  return found
}

export type FlowPromptSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; label: string }

/** Quebra o prompt em texto e menções, na ordem (para digitar @ no Flow). */
export function splitFlowPromptSegments(prompt: unknown): FlowPromptSegment[] {
  const text = normalizeFlowProjectPrompt(prompt)
  if (!text) return []
  const segments: FlowPromptSegment[] = []
  const token = /(@[A-Za-zÀ-ÿ0-9_][\wÀ-ÿ-]{0,78}|\[([A-Za-zÀ-ÿ0-9_][^\]\n]{0,78})\])/g
  let last = 0
  for (const match of text.matchAll(token)) {
    const index = match.index ?? 0
    if (index > last) segments.push({ type: 'text', value: text.slice(last, index) })
    const raw = match[0]
    const label = validateFlowReferenceLabel(raw.startsWith('[') ? match[2] : raw.slice(1))
    segments.push({ type: 'mention', label })
    last = index + raw.length
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) })
  return segments
}

export function matchFlowReferencesByMentions<T extends { label: string }>(
  references: T[],
  mentions: string[],
): T[] {
  if (!mentions.length) return []
  const byLabel = new Map(references.map((ref) => [ref.label.trim().toLowerCase(), ref]))
  const matched: T[] = []
  const seen = new Set<string>()
  for (const mention of mentions) {
    const key = mention.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    const ref = byLabel.get(key)
    if (!ref) continue
    seen.add(key)
    matched.push(ref)
  }
  return matched
}

export type FlowBridgeConnectionState =
  | 'idle'
  | 'waiting_extension'
  | 'connected'
  | 'needs_login'
  | 'error'

export type FlowExtensionStatus = {
  bridgeRunning: boolean
  bridgePort: number | null
  extensionConnected: boolean
  accountHint: string | null
  extensionPath: string
  pairToken: string | null
  lastError: string | null
}

export type FlowCreateProgress = {
  projectId: string
  stage: string
  message: string
  syncStatus: FlowSyncStatus
}

/** Imagem de referência anexada a um projeto Flow (local no Atlas). */
export interface FlowReference {
  id: string
  projectId: string
  label: string
  imagePath: string
  /** Preview para o renderer (atlas-media ou data URL). */
  imageUrl: string | null
  imageThumbUrl: string | null
  sortOrder: number
  /** Chave verificável do item em Envios/Uploads no Flow. */
  flowUploadKey: string | null
  /** Nome do arquivo confirmado no Flow. */
  flowFileName: string | null
  syncStatus: FlowReferenceSyncStatus
  syncedAt: string | null
  lastSyncError: string | null
  createdAt: string
  updatedAt: string
}

export type FlowReferenceUpdateInput = {
  label?: string
  flowUploadKey?: string | null
  flowFileName?: string | null
  syncStatus?: FlowReferenceSyncStatus
  syncedAt?: string | null
  lastSyncError?: string | null
}

/** Chave estável preferida para casar item em Envios (label + fileName). */
export function buildFlowUploadKey(label: unknown, fileName: unknown): string {
  const stem = validateFlowReferenceLabel(label)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const file = String(fileName || '')
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .split('/')
    .pop() || ''
  return [stem, file].filter(Boolean).join('::') || stem || file || 'ref'
}

export function labelFromImagePath(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop() || 'Referência'
  const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base
  const cleaned = stem.trim().replace(/[_-]+/g, ' ')
  return cleaned || 'Referência'
}

export function validateFlowReferenceLabel(label: unknown): string {
  const value = typeof label === 'string' ? label.trim() : ''
  return value.slice(0, 80) || 'Referência'
}

/** Nome do arquivo enviado ao Flow — usa o rótulo da referência (ex.: banda.png). */
export function buildFlowReferenceUploadFileName(label: unknown, imagePath: string): string {
  const raw = validateFlowReferenceLabel(label)
  const stem =
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 60) || 'referencia'
  const base = imagePath.replace(/\\/g, '/').split('/').pop() || 'ref.png'
  const extMatch = base.match(/(\.[a-z0-9]{1,5})$/i)
  const ext = (extMatch?.[1] || '.png').toLowerCase()
  return `${stem}${ext}`
}

export function isFlowSyncStatus(value: unknown): value is FlowSyncStatus {
  return typeof value === 'string' && (FLOW_SYNC_STATUSES as readonly string[]).includes(value)
}

export function validateFlowProjectCreateInput(input: {
  name?: unknown
  localFolderPath?: unknown
  folderExists?: boolean
}): { ok: true; name: string; localFolderPath: string } | { ok: false; error: string } {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) {
    return { ok: false, error: 'Informe o nome do projeto.' }
  }

  const localFolderPath =
    typeof input.localFolderPath === 'string' ? input.localFolderPath.trim() : ''
  if (!localFolderPath) {
    return { ok: false, error: 'Selecione a pasta local de destino.' }
  }

  if (input.folderExists === false) {
    return { ok: false, error: 'A pasta selecionada não existe.' }
  }

  return { ok: true, name, localFolderPath }
}

export function isFlowHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host === 'labs.google' ||
    host.endsWith('.labs.google') ||
    host === 'flow.google.com' ||
    host.endsWith('.flow.google.com')
  )
}

/** Extrai o ID remoto de flow.google.com/project/{uuid} (ou Labs legado). */
export function parseFlowProjectIdFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  try {
    const parsed = new URL(url.trim())
    if (!isFlowHostname(parsed.hostname)) return null
    if (/\/404\b/i.test(parsed.pathname) || parsed.searchParams.get('reason') === 'project') {
      return null
    }
    const match =
      parsed.pathname.match(/^\/project\/([a-f0-9-]{8,})(?:\/|$)/i) ||
      parsed.pathname.match(/\/tools\/flow\/project\/([a-f0-9-]{8,})(?:\/|$)/i)
    if (!match) return null
    const id = match[1]
    if (id.toLowerCase() === 'new') return null
    return id
  } catch {
    return null
  }
}

/** URL canônica atual: flow.google.com/project/{id} */
export function buildFlowProjectUrl(remoteId: string): string {
  return `https://flow.google.com/project/${remoteId}`
}

/** Normaliza Labs legado → flow.google.com; descarta 404. */
export function normalizeFlowProjectUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  try {
    const parsed = new URL(url.trim())
    if (/\/404\b/i.test(parsed.pathname) || parsed.searchParams.get('reason') === 'project') {
      return null
    }
  } catch {
    return url.trim()
  }
  const id = parseFlowProjectIdFromUrl(url)
  if (id) return buildFlowProjectUrl(id)
  return url.trim()
}

export function maskGoogleAccountHint(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? ''
  if (!value) return null
  const emailMatch = value.match(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
  if (!emailMatch) {
    return value.length <= 4 ? value : `${value.slice(0, 2)}…${value.slice(-2)}`
  }
  const local = emailMatch[1]
  const domain = emailMatch[2]
  const visible = local.length <= 2 ? local[0] ?? '*' : `${local.slice(0, 2)}…`
  return `${visible}@${domain}`
}

/**
 * Decide se uma nova tentativa deve criar no Flow ou só recuperar o vínculo.
 * Nome igual nunca é prova de identidade remota.
 */
export function planFlowLinkAttempt(project: Pick<
  FlowProject,
  'remoteId' | 'remoteUrl' | 'syncStatus' | 'createInFlow' | 'operationId'
>): {
  action: 'skip' | 'create' | 'verify_existing' | 'resume_rename'
  reason: string
} {
  if (!project.createInFlow) {
    return { action: 'skip', reason: 'Criação no Google Flow desativada para este projeto.' }
  }

  const remoteId =
    project.remoteId?.trim() || parseFlowProjectIdFromUrl(project.remoteUrl) || null

  if (remoteId && project.syncStatus === 'linked') {
    return { action: 'skip', reason: 'Projeto já vinculado.' }
  }

  if (remoteId) {
    return {
      action: project.syncStatus === 'creating' ? 'resume_rename' : 'verify_existing',
      reason: 'ID remoto já conhecido — não criar outro projeto.',
    }
  }

  return {
    action: 'create',
    reason: 'Sem ID remoto verificável — criar novo projeto no Flow.',
  }
}

export function shouldShowRetryLink(status: FlowSyncStatus): boolean {
  return status === 'sync_failed' || status === 'awaiting_login' || status === 'local_created'
}

export function flowDeleteConfirmMessage(
  project: Pick<FlowProject, 'name' | 'remoteId'>,
): string {
  const folderNote = 'A pasta local não será apagada.'
  if (project.remoteId) {
    return `Excluir “${project.name}” no Atlas e no Google Flow?\n\n${folderNote}`
  }
  return `Excluir “${project.name}” do Atlas?\n\n${folderNote}`
}

export function flowStatusTone(
  status: FlowSyncStatus,
): 'neutral' | 'warning' | 'success' | 'danger' | 'progress' {
  switch (status) {
    case 'linked':
      return 'success'
    case 'sync_failed':
      return 'danger'
    case 'awaiting_login':
      return 'warning'
    case 'creating':
      return 'progress'
    default:
      return 'neutral'
  }
}
