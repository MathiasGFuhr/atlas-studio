const DEFAULT_FALLBACK = 'Algo deu errado. Tente novamente.'

const IPC_REMOTE_METHOD_RE = /^Error invoking remote method ['"][^'"]+['"]:\s*/i
const LEADING_ERROR_RE = /^(?:Error:\s*)+/i
const STACK_FRAME_RE = /\bat\s+\S+\s+\(/i
const NODE_ERRNO_RE = /\b(ENOENT|EACCES|EPERM|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EPIPE|EBUSY)\b/i

export function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message || error.name
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return ''
}

/** Remove wrappers técnicos do Electron/IPC e deixa só a mensagem útil. */
export function stripTechnicalErrorWrappers(message: string): string {
  let text = message.replace(/\r\n/g, '\n').trim()
  if (!text) return ''

  const firstLine = text.split('\n')[0] ?? text
  text = firstLine.trim()

  let previous = ''
  while (text !== previous) {
    previous = text
    text = text.replace(IPC_REMOTE_METHOD_RE, '').trim()
    text = text.replace(LEADING_ERROR_RE, '').trim()
  }

  return text
}

function looksLikeTechnicalNoise(text: string): boolean {
  if (!text) return true
  if (IPC_REMOTE_METHOD_RE.test(text) || /Error invoking remote method/i.test(text)) return true
  if (STACK_FRAME_RE.test(text)) return true
  if (NODE_ERRNO_RE.test(text)) return true
  if (/https?:\/\//i.test(text) && text.length > 100) return true
  if (/^[A-Za-z]+Error\b/.test(text) && !/[àáâãéêíóôõúç]/i.test(text)) return true
  return false
}

function clampMessage(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trimEnd()}…`
}

/**
 * Converte qualquer erro (incl. wrappers IPC do Electron) em texto seguro para UI.
 */
export function toUserFacingError(
  error: unknown,
  fallback: string = DEFAULT_FALLBACK,
): string {
  const raw = extractErrorMessage(error)
  if (!raw.trim()) return fallback

  const cleaned = stripTechnicalErrorWrappers(raw)
  if (!cleaned || looksLikeTechnicalNoise(cleaned)) return fallback

  return clampMessage(cleaned, 180)
}
