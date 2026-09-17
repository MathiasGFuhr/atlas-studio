export const SETTINGS_CHANGED_EVENT = 'atlas-settings-changed'

export function notifySettingsChanged() {
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
}

export function onSettingsChanged(listener: () => void) {
  window.addEventListener(SETTINGS_CHANGED_EVENT, listener)
  return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, listener)
}
