import { describe, expect, it } from 'vitest'
import { createEditorHistory } from './history'

describe('editor history', () => {
  it('desfaz e refaz', () => {
    const history = createEditorHistory<number>()
    history.push(1)
    expect(history.undo(2)).toBe(1)
    expect(history.redo(1)).toBe(2)
    expect(history.canUndo()).toBe(true)
    history.push(2)
    expect(history.canRedo()).toBe(false)
    expect(history.undo(3)).toBe(2)
  })
})
