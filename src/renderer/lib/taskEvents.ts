import { TASKS_CHANGED_EVENT } from '@shared/tasks'

export function notifyTasksChanged() {
  window.dispatchEvent(new Event(TASKS_CHANGED_EVENT))
}

export function onTasksChanged(listener: () => void) {
  window.addEventListener(TASKS_CHANGED_EVENT, listener)
  return () => window.removeEventListener(TASKS_CHANGED_EVENT, listener)
}
