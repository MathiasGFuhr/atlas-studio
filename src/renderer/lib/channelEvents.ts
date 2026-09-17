export const CHANNELS_CHANGED_EVENT = 'atlas-channels-changed'

export function notifyChannelsChanged() {
  window.dispatchEvent(new Event(CHANNELS_CHANGED_EVENT))
}

export function onChannelsChanged(listener: () => void) {
  window.addEventListener(CHANNELS_CHANGED_EVENT, listener)
  return () => window.removeEventListener(CHANNELS_CHANGED_EVENT, listener)
}
