export type EditorHistorySnapshot<T> = T

export function createEditorHistory<T>(limit = 80) {
  let past: T[] = []
  let future: T[] = []

  return {
    push(current: T) {
      past = [...past, current].slice(-limit)
      future = []
    },
    undo(current: T): T | null {
      const previous = past[past.length - 1]
      if (previous == null) return null
      past = past.slice(0, -1)
      future = [...future, current]
      return previous
    },
    redo(current: T): T | null {
      const next = future[future.length - 1]
      if (next == null) return null
      future = future.slice(0, -1)
      past = [...past, current]
      return next
    },
    canUndo() {
      return past.length > 0
    },
    canRedo() {
      return future.length > 0
    },
    clear() {
      past = []
      future = []
    },
  }
}
