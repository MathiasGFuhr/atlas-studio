export const PROMPTS_CHANGED_EVENT = 'atlas-prompts-changed'

export function notifyPromptsChanged() {
  window.dispatchEvent(new Event(PROMPTS_CHANGED_EVENT))
}

export function onPromptsChanged(listener: () => void) {
  window.addEventListener(PROMPTS_CHANGED_EVENT, listener)
  return () => window.removeEventListener(PROMPTS_CHANGED_EVENT, listener)
}
