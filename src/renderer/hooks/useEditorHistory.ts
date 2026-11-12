import { useCallback, useReducer } from 'react'
import type { EditorTimeline } from '@shared/editor/types'

const HISTORY_LIMIT = 200
const COALESCE_WINDOW_MS = 800

type HistoryState = {
  past: EditorTimeline[]
  present: EditorTimeline
  future: EditorTimeline[]
  lastKey: string | null
  lastAt: number
}

type HistoryAction =
  | { type: 'commit'; next: EditorTimeline; key: string | null; at: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; value: EditorTimeline }

function reducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'commit': {
      if (action.next === state.present) return state
      // Ajustes contínuos (ex.: slider de volume) viram um único passo de desfazer.
      const coalesce =
        action.key !== null && action.key === state.lastKey && action.at - state.lastAt < COALESCE_WINDOW_MS
      return {
        past: coalesce ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: action.next,
        future: [],
        lastKey: action.key,
        lastAt: action.at,
      }
    }
    case 'undo': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastKey: null,
        lastAt: 0,
      }
    }
    case 'redo': {
      const [next, ...rest] = state.future
      if (!next) return state
      return { past: [...state.past, state.present], present: next, future: rest, lastKey: null, lastAt: 0 }
    }
    case 'reset':
      return { past: [], present: action.value, future: [], lastKey: null, lastAt: 0 }
  }
}

export function useEditorHistory(initial: EditorTimeline) {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: initial,
    future: [],
    lastKey: null,
    lastAt: 0,
  })
  const commit = useCallback(
    (next: EditorTimeline, coalesceKey?: string) =>
      dispatch({ type: 'commit', next, key: coalesceKey ?? null, at: Date.now() }),
    [],
  )
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const reset = useCallback((value: EditorTimeline) => dispatch({ type: 'reset', value }), [])
  return {
    timeline: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit,
    undo,
    redo,
    reset,
  }
}
