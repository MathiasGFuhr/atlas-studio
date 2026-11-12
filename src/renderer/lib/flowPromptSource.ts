const FLOW_SOURCE_STORAGE_KEY = 'atlas.flow.prompts.source'

export function readFlowSource(): string {
  try {
    return window.localStorage.getItem(FLOW_SOURCE_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeFlowSource(value: string): void {
  try {
    if (value) window.localStorage.setItem(FLOW_SOURCE_STORAGE_KEY, value)
    else window.localStorage.removeItem(FLOW_SOURCE_STORAGE_KEY)
  } catch {
    // armazenamento cheio ou indisponível: a sessão atual continua na memória
  }
}
