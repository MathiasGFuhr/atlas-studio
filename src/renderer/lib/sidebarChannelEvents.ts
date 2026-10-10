import { LAST_SIDEBAR_CHANNEL_KEY, writeLastSidebarChannelId } from '@shared/sidebarChannel'

const EVENT = 'atlas:sidebar-channel-changed'

export function notifySidebarChannelChanged(channelId: string) {
  writeLastSidebarChannelId(typeof localStorage === 'undefined' ? null : localStorage, channelId)
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: channelId }))
}

export function onSidebarChannelChanged(listener: (channelId: string) => void): () => void {
  if (typeof window === 'undefined') return () => undefined

  function onCustom(event: Event) {
    const detail = (event as CustomEvent<string>).detail
    if (typeof detail === 'string' && detail.trim()) listener(detail.trim())
  }

  function onStorage(event: StorageEvent) {
    if (event.key !== LAST_SIDEBAR_CHANNEL_KEY) return
    const value = event.newValue?.trim()
    if (value) listener(value)
  }

  window.addEventListener(EVENT, onCustom as EventListener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, onCustom as EventListener)
    window.removeEventListener('storage', onStorage)
  }
}
