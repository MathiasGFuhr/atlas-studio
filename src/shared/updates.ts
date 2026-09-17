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

export interface NormalizedReleaseNotes {
  title?: string
  items: string[]
  text?: string
}

const PRODUCT_NAME = 'Atlas Studio'
const MAX_NOTE_ITEMS = 12
const MAX_NOTE_TEXT = 480

export const UPDATE_ERROR_CHECK =
  'Não foi possível verificar atualizações. Tente novamente em alguns instantes.'
export const UPDATE_ERROR_DOWNLOAD_SHORT = 'Não foi possível baixar a atualização.'
export const UPDATE_ERROR_DOWNLOAD =
  'Não foi possível baixar a atualização. Tente novamente em alguns instantes.'
export const UPDATE_ERROR_INSTALL = 'Não foi possível instalar a atualização. Tente novamente.'
export const UPDATE_ERROR_GENERIC =
  'Não foi possível concluir a atualização. Tente novamente em alguns instantes.'
export const UPDATE_ERROR_UNSUPPORTED = 'Atualizador indisponível nesta instalação.'
export const UPDATE_ERROR_NO_FEED = 'Canal de atualização não configurado nesta instalação.'
export const UPDATE_NOTES_FALLBACK = 'Esta atualização inclui melhorias e correções.'

export function flattenReleaseNotes(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
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
  if (typeof raw === 'object' && 'note' in (raw as object)) {
    return String((raw as { note?: unknown }).note ?? '')
  }
  return ''
}

export function normalizeReleaseNotes(
  input: unknown,
  options: { displayedVersion?: string | null } = {},
): NormalizedReleaseNotes {
  const raw = flattenReleaseNotes(input).trim()
  if (!raw || raw === '[object Object]' || raw === 'undefined' || raw === 'null') {
    return { items: [] }
  }

  const withoutBlocks = stripUnsafeBlocks(raw)
  const items: string[] = []
  const withListPlaceholders = withoutBlocks.replace(
    /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
    (_match, inner: string) => {
      const text = inlineHtmlToText(inner)
      if (text) items.push(text)
      return '\n'
    },
  )

  const blockText = withListPlaceholders
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|blockquote|tr)>/gi, '\n')
    .replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n')
    .replace(/<p\b[^>]*>/gi, '\n')

  const leftover = blockText
    .split(/\n+/)
    .map((line) => inlineHtmlToText(line))
    .filter(Boolean)

  const paragraphs: string[] = []
  for (const line of leftover) {
    const bullet = line.match(/^(?:[-*•]|–)\s+(.+)$/)
    if (bullet?.[1]) {
      items.push(bullet[1].trim())
      continue
    }
    paragraphs.push(line)
  }

  let title: string | undefined
  if (paragraphs.length > 0 && isHeadingLike(paragraphs[0], options.displayedVersion)) {
    title = paragraphs.shift()
  }

  if (title && isDuplicateTitle(title, options.displayedVersion)) {
    title = undefined
  }

  const uniqueItems = dedupeKeepOrder(
    items
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !isDuplicateTitle(item, options.displayedVersion)),
  ).slice(0, MAX_NOTE_ITEMS)

  const text = clampText(paragraphs.join('\n').trim(), MAX_NOTE_TEXT) || undefined

  return {
    title,
    items: uniqueItems,
    text,
  }
}

export function summarizeReleaseNotes(raw: unknown, maxLength = 420): string | null {
  const notes = normalizeReleaseNotes(raw)
  const parts = [
    notes.title,
    ...notes.items.map((item) => `• ${item}`),
    notes.text,
  ].filter(Boolean)
  const text = parts.join(' ').replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trimEnd()}…`
}

export function userFacingUpdateError(
  kind: 'check' | 'download' | 'install' | 'unsupported' | 'no-feed' | 'generic' = 'generic',
): string {
  switch (kind) {
    case 'check':
      return UPDATE_ERROR_CHECK
    case 'download':
      return UPDATE_ERROR_DOWNLOAD
    case 'install':
      return UPDATE_ERROR_INSTALL
    case 'unsupported':
      return UPDATE_ERROR_UNSUPPORTED
    case 'no-feed':
      return UPDATE_ERROR_NO_FEED
    default:
      return UPDATE_ERROR_GENERIC
  }
}

function stripUnsafeBlocks(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
}

function inlineHtmlToText(html: string): string {
  const withoutTags = html.replace(/<[^>]+>/g, ' ')
  return decodeHtmlEntities(withoutTags).replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => codePointToChar(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => codePointToChar(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function codePointToChar(code: number): string {
  if (!Number.isFinite(code) || code < 32 && code !== 10 && code !== 9) return ''
  if (code > 0x10ffff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

function isHeadingLike(text: string, version?: string | null): boolean {
  if (text.length > 80) return false
  if (/[.!?]$/.test(text)) return false
  const compact = text.replace(/\s+/g, ' ').trim()
  if (isDuplicateTitle(compact, version)) return true
  return /^(atlas studio|versão|version|release)\b/i.test(compact)
}

function isDuplicateTitle(text: string, version?: string | null): boolean {
  const compact = text.replace(/\s+/g, ' ').trim().replace(/[.]+$/, '')
  const lower = compact.toLowerCase()
  const ver = version?.trim()
  if (!ver) {
    return /^atlas studio$/i.test(compact)
  }
  const escaped = ver.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (
    new RegExp(`^${PRODUCT_NAME}\\s+v?${escaped}$`, 'i').test(compact) ||
    new RegExp(`^v?${escaped}$`, 'i').test(compact) ||
    lower === `${PRODUCT_NAME.toLowerCase()} ${ver.toLowerCase()}`
  )
}

function dedupeKeepOrder(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function clampText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trimEnd()}…`
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

export const SIDEBAR_UPDATE_TOAST_PREFIX = 'atlas.update.toast:'
export const SIDEBAR_UPDATE_MINIMIZED_KEY = 'atlas.update.sidebarMinimized'

export function shouldAutoCheckOnStartup(
  status: Pick<AppUpdateStatus, 'state' | 'packaged' | 'autoCheckEnabled'> | null | undefined,
): boolean {
  if (!status?.packaged || status.autoCheckEnabled === false) return false
  return status.state === 'idle' || status.state === 'up-to-date'
}

export function sidebarUpdateStatusLabel(state: AppUpdateStatus['state']): string {
  switch (state) {
    case 'downloading':
      return 'Atualização · Baixando'
    case 'ready':
      return 'Atualização · Pronta'
    case 'error':
      return 'Atualização · Erro'
    default:
      return 'Atualização · Disponível'
  }
}

export function isSidebarUpdateRelevant(
  status: Pick<AppUpdateStatus, 'state' | 'availableVersion'> | null | undefined,
  options: { userDownloadError?: boolean } = {},
): boolean {
  if (!status) return false
  const { state, availableVersion } = status
  if (state === 'available' || state === 'downloading' || state === 'ready') {
    return Boolean(availableVersion?.trim())
  }
  if (state === 'error' && options.userDownloadError) return true
  return false
}

export function sidebarUpdateToastMessage(version: string): string {
  return `Atlas Studio ${version} está disponível.`
}

export function sidebarDownloadProgressLabel(percent: number | null): string {
  if (percent == null) return 'Baixando...'
  const rounded = Number.isInteger(percent) ? String(percent) : String(Math.round(percent))
  return `Baixando... ${rounded}%`
}

export function safeUpdateErrorText(message: string | null | undefined): string | null {
  if (!message) return null
  const compact = message.replace(/\s+/g, ' ').trim()
  if (!compact) return null
  if (
    compact.length > 180 ||
    /https?:\/\//i.test(compact) ||
    /\b(ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EPERM|ENOENT)\b/i.test(compact) ||
    /\bat\s+\S+\s+\(/i.test(compact)
  ) {
    return UPDATE_ERROR_GENERIC
  }
  return compact
}

export function shouldToastAvailableUpdate(
  status: Pick<AppUpdateStatus, 'state' | 'availableVersion'> | null | undefined,
  alreadyToastedVersion: string | null,
): string | null {
  const version = status?.availableVersion?.trim()
  if (!version || status?.state !== 'available') return null
  if (alreadyToastedVersion === version) return null
  return version
}
