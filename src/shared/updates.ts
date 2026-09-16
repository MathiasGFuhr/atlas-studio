export type AppUpdateState =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'
  | 'dev'
  | 'unsupported'

export interface AppUpdateStatus {
  state: AppUpdateState
  currentVersion: string
  availableVersion: string | null
  releaseNotes: string | null
  /** 0–100 quando o tamanho total é conhecido; senão null (não inventar %). */
  downloadPercent: number | null
  errorMessage: string | null
  packaged: boolean
  autoCheckEnabled: boolean
}

export const UPDATE_SETTINGS_HREF = '/configuracoes?secao=atualizacoes'

export function emptyUpdateStatus(currentVersion: string, packaged: boolean): AppUpdateStatus {
  return {
    state: packaged ? 'idle' : 'dev',
    currentVersion,
    availableVersion: null,
    releaseNotes: null,
    downloadPercent: null,
    errorMessage: null,
    packaged,
    autoCheckEnabled: true,
  }
}

export function updateStateLabel(state: AppUpdateState): string {
  switch (state) {
    case 'checking':
      return 'Verificando...'
    case 'up-to-date':
      return 'Atualizado'
    case 'available':
      return 'Nova versão disponível'
    case 'downloading':
      return 'Baixando'
    case 'ready':
      return 'Atualização pronta'
    case 'error':
      return 'Erro'
    case 'dev':
      return 'Desenvolvimento'
    case 'unsupported':
      return 'Não configurado'
    default:
      return '—'
  }
}

export function summarizeReleaseNotes(raw: unknown, maxLength = 420): string | null {
  const text = flattenReleaseNotes(raw).replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trimEnd()}…`
}

function flattenReleaseNotes(raw: unknown): string {
  if (!raw) return ''
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'note' in item) {
          return String((item as { note?: unknown }).note ?? '')
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return String(raw)
}

export function realDownloadPercent(transferred: number, total: number, percent?: number): number | null {
  if (Number.isFinite(total) && total > 0 && Number.isFinite(transferred) && transferred >= 0) {
    return Math.min(100, Math.max(0, Math.round((transferred / total) * 1000) / 10))
  }
  if (Number.isFinite(percent) && (percent as number) >= 0 && (percent as number) <= 100) {
    return Math.round((percent as number) * 10) / 10
  }
  return null
}

export function updateNotificationId(version: string): string {
  return `app-update:${version}`
}
