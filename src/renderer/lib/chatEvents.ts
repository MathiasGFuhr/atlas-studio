export const OPEN_CHAT_EVENT = 'atlas-open-chat'

export type OpenChatDetail = {
  projectId?: string | null
}

let queued: OpenChatDetail | null = null

export function openAtlasChat(detail?: OpenChatDetail) {
  queued = detail ?? {}
  window.dispatchEvent(new CustomEvent<OpenChatDetail>(OPEN_CHAT_EVENT, { detail: queued }))
}

export function onAtlasChatOpen(listener: (detail: OpenChatDetail) => void) {
  if (queued) {
    const next = queued
    queued = null
    listener(next)
  }
  const handler = (event: Event) => {
    queued = null
    listener((event as CustomEvent<OpenChatDetail>).detail ?? {})
  }
  window.addEventListener(OPEN_CHAT_EVENT, handler)
  return () => window.removeEventListener(OPEN_CHAT_EVENT, handler)
}
