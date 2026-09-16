export const PROJECTS_CHANGED_EVENT = 'atlas-projects-changed'

export function notifyProjectsChanged() {
  window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT))
}

export function onProjectsChanged(listener: () => void) {
  window.addEventListener(PROJECTS_CHANGED_EVENT, listener)
  return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, listener)
}
