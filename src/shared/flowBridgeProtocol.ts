/** Protocolo localhost entre o Atlas e a extensão Atlas Flow Bridge. */

export const FLOW_BRIDGE_PROTOCOL_VERSION = 1
export const FLOW_BRIDGE_APP_ID = 'atlas-studio'
export const FLOW_BRIDGE_DEFAULT_PORTS = [39207, 39208, 39209, 39210, 39211] as const

export type FlowBridgeCommandType =
  | 'ping'
  | 'create_project'
  | 'verify_project'
  | 'reveal_project'
  | 'ensure_session'
  | 'delete_project'
  | 'upload_references'
  | 'fill_prompt'

export type FlowBridgeReferencePayload = {
  id: string
  label: string
  fileName: string
  mimeType: string
  /** Conteúdo da imagem em base64 (sem prefixo data:). Vazio no fill_prompt (só reutiliza Envios). */
  base64?: string
  /** Caminho absoluto no disco (CDP setFileInputFiles). */
  localPath?: string
  /** Chave verificável já conhecida em Envios (evita reupload). */
  flowUploadKey?: string
}

export type FlowBridgeCommand =
  | {
      type: 'ping'
      requestId: string
    }
  | {
      type: 'ensure_session'
      requestId: string
      /** false = manter aba inativa (padrão). */
      activate?: boolean
    }
  | {
      type: 'create_project'
      requestId: string
      operationId: string
      name: string
      /** Se já conhecido, a extensão não cria outro — só verifica/renomeia. */
      remoteId?: string | null
      /** Automação em segundo plano (padrão true). */
      background?: boolean
    }
  | {
      type: 'verify_project'
      requestId: string
      remoteId: string
      expectedName?: string
      background?: boolean
    }
  | {
      /** Modo acompanhar: ativa a aba existente sem criar outra. */
      type: 'reveal_project'
      requestId: string
      remoteId?: string | null
      remoteUrl?: string | null
    }
  | {
      type: 'delete_project'
      requestId: string
      remoteId: string
      remoteUrl?: string | null
      background?: boolean
    }
  | {
      /** Envia imagens de referência do Atlas para o projeto aberto no Flow. */
      type: 'upload_references'
      requestId: string
      remoteId: string
      remoteUrl?: string | null
      background?: boolean
      /** true = só Envios/Uploads; não inclui no comando. */
      galleryOnly?: boolean
      references: FlowBridgeReferencePayload[]
    }
  | {
      /** Preenche o prompt no Flow e resolve menções @ / [] com imagens de referência. */
      type: 'fill_prompt'
      requestId: string
      remoteId: string
      remoteUrl?: string | null
      background?: boolean
      prompt: string
      /** Segmentos já parseados (texto + mention). */
      segments: Array<{ type: 'text'; value: string } | { type: 'mention'; label: string }>
      /** Só as refs mencionadas no prompt. */
      references: FlowBridgeReferencePayload[]
      /** Modelo Nano Banana no compositor. */
      imageModel?: string | null
      /** Rótulo exato do modelo no Flow (ex.: "Nano Banana 2.1"). */
      imageModelLabel?: string | null
      /** Quantidade de saídas xN. */
      imageOutputs?: number | null
      /** false = só prepara/valida a caixa; true = clica Generate após checks. */
      submit?: boolean
    }

export type FlowBridgeEvent =
  | {
      type: 'extension_hello'
      accountHint?: string | null
      extensionVersion: string
      workerTabId?: number | null
    }
  | {
      type: 'session_ready'
      requestId: string
      workerTabId: number
      background: boolean
      url?: string | null
    }
  | {
      type: 'revealed'
      requestId: string
      workerTabId: number
      remoteUrl: string
    }
  | {
      type: 'needs_login'
      requestId: string
      loginUrl: string
      message?: string
    }
  | {
      type: 'progress'
      requestId: string
      stage: string
      message: string
    }
  | {
      type: 'project_partial'
      requestId: string
      operationId: string
      remoteId: string
      remoteUrl: string
    }
  | {
      type: 'project_linked'
      requestId: string
      operationId: string
      remoteId: string
      remoteUrl: string
      name: string
      accountHint?: string | null
    }
  | {
      type: 'project_deleted'
      requestId?: string
      remoteId: string
      source?: 'atlas' | 'flow'
    }
  | {
      type: 'reference_progress'
      requestId: string
      remoteId: string
      refId: string
      stage: string
      message: string
      flowUploadKey?: string | null
      reused?: boolean
    }
  | {
      type: 'references_uploaded'
      requestId: string
      remoteId: string
      uploaded: number
      message?: string
      results?: Array<{
        id: string
        flowUploadKey: string
        fileName: string
        reused: boolean
      }>
    }
  | {
      type: 'prompt_filled'
      requestId: string
      remoteId: string
      mentions: number
      message?: string
      submitted?: boolean
      attachedLabels?: string[]
      verified?: boolean
    }
  | {
      type: 'generation_blocked'
      requestId: string
      remoteId?: string | null
      code: 'unusual_activity'
      message: string
    }
  | {
      type: 'error'
      requestId: string
      code:
        | 'not_authenticated'
        | 'extension_busy'
        | 'rename_failed'
        | 'create_failed'
        | 'delete_failed'
        | 'upload_failed'
        | 'prompt_failed'
        | 'connection_failed'
        | 'project_not_found'
        | 'browser_unavailable'
        | 'generation_paused'
        | 'unusual_activity'
        | 'unknown'
      message: string
      remoteId?: string | null
      remoteUrl?: string | null
    }

export type FlowBridgeHelloResponse = {
  app: typeof FLOW_BRIDGE_APP_ID
  protocolVersion: typeof FLOW_BRIDGE_PROTOCOL_VERSION
  token: string
  extensionPath: string
  pendingOperation: boolean
}

export function isFlowBridgeEvent(value: unknown): value is FlowBridgeEvent {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return (
    type === 'extension_hello' ||
    type === 'session_ready' ||
    type === 'revealed' ||
    type === 'needs_login' ||
    type === 'progress' ||
    type === 'project_partial' ||
    type === 'project_linked' ||
    type === 'project_deleted' ||
    type === 'reference_progress' ||
    type === 'references_uploaded' ||
    type === 'prompt_filled' ||
    type === 'generation_blocked' ||
    type === 'error'
  )
}

export function mimeTypeFromImagePath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  return 'image/png'
}
