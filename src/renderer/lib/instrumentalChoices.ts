import {
  normalizeInstrumentalChoice,
  type InstrumentalChoice,
} from '@shared/lipSyncRefs'

const STORAGE_KEY = 'atlas.lipsync.instrumentalChoices.v1'
const MAX_SCOPES = 50

type ChoiceMap = Record<string, InstrumentalChoice>

type StoredChoicesPayload = {
  byProject: Record<string, ChoiceMap>
  byFolder: Record<string, ChoiceMap>
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function normalizeInstrumentalFolderKey(folderPath: string | null | undefined): string {
  return (folderPath ?? '').trim().replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
}

function emptyPayload(): StoredChoicesPayload {
  return { byProject: {}, byFolder: {} }
}

function sanitizeChoiceMap(raw: unknown): ChoiceMap {
  if (!raw || typeof raw !== 'object') return {}
  const next: ChoiceMap = {}
  for (const [key, value] of Object.entries(raw)) {
    const number = Number.parseInt(key, 10)
    if (!Number.isInteger(number) || number < 1) continue
    const normalized = normalizeInstrumentalChoice(value)
    if (normalized) next[String(number)] = normalized
  }
  return next
}

function sanitizeScopeMap(raw: unknown): Record<string, ChoiceMap> {
  if (!raw || typeof raw !== 'object') return {}
  const next: Record<string, ChoiceMap> = {}
  for (const [scopeKey, value] of Object.entries(raw)) {
    const key = scopeKey.trim()
    if (!key) continue
    const choices = sanitizeChoiceMap(value)
    if (Object.keys(choices).length > 0) next[key] = choices
  }
  return next
}

function readPayload(storage: StorageLike | null): StoredChoicesPayload {
  if (!storage) return emptyPayload()
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return emptyPayload()
    const parsed = JSON.parse(raw) as { byProject?: unknown; byFolder?: unknown }
    return {
      byProject: sanitizeScopeMap(parsed?.byProject),
      byFolder: sanitizeScopeMap(parsed?.byFolder),
    }
  } catch {
    return emptyPayload()
  }
}

function trimScopeMap(map: Record<string, ChoiceMap>): Record<string, ChoiceMap> {
  const entries = Object.entries(map)
  if (entries.length <= MAX_SCOPES) return map
  return Object.fromEntries(entries.slice(entries.length - MAX_SCOPES))
}

function writePayload(storage: StorageLike | null, payload: StoredChoicesPayload): void {
  if (!storage) return
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        byProject: trimScopeMap(payload.byProject),
        byFolder: trimScopeMap(payload.byFolder),
      }),
    )
  } catch {
    // armazenamento cheio ou indisponível: a sessão atual continua na memória
  }
}

function toNumberMap(map: ChoiceMap | undefined): Record<number, InstrumentalChoice> {
  if (!map) return {}
  const result: Record<number, InstrumentalChoice> = {}
  for (const [key, choice] of Object.entries(map)) {
    const number = Number.parseInt(key, 10)
    if (Number.isInteger(number) && number >= 1) {
      result[number] = choice
    }
  }
  return result
}

function applyScopeUpdate(
  scopes: Record<string, ChoiceMap>,
  scopeKey: string,
  updates: Record<number, InstrumentalChoice | undefined>,
): Record<string, ChoiceMap> {
  if (!scopeKey) return scopes
  const next = { ...scopes }
  const current: ChoiceMap = { ...(next[scopeKey] ?? {}) }
  for (const [rawNumber, choice] of Object.entries(updates)) {
    const number = Number.parseInt(rawNumber, 10)
    if (!Number.isInteger(number) || number < 1) continue
    const normalized = normalizeInstrumentalChoice(choice)
    if (normalized) {
      current[String(number)] = normalized
    } else {
      delete current[String(number)]
    }
  }
  if (Object.keys(current).length > 0) {
    // Move para o fim para manter os projetos/pastas mais recentes ao limitar o histórico.
    delete next[scopeKey]
    next[scopeKey] = current
  } else {
    delete next[scopeKey]
  }
  return next
}

export function readSavedInstrumentalChoices(
  scope: {
    projectId?: string | null
    folderPath?: string | null
    numbers?: number[]
  },
  storage: StorageLike | null = defaultStorage(),
): Record<number, InstrumentalChoice> {
  const payload = readPayload(storage)
  const folderKey = normalizeInstrumentalFolderKey(scope.folderPath)
  const projectKey = scope.projectId?.trim() ?? ''
  const merged: Record<number, InstrumentalChoice> = {
    ...(folderKey ? toNumberMap(payload.byFolder[folderKey]) : {}),
    ...(projectKey ? toNumberMap(payload.byProject[projectKey]) : {}),
  }
  if (!scope.numbers) return merged
  const allowed = new Set(scope.numbers)
  const filtered: Record<number, InstrumentalChoice> = {}
  for (const number of allowed) {
    const choice = merged[number]
    if (choice) filtered[number] = choice
  }
  return filtered
}

export function writeSavedInstrumentalChoices(
  scope: {
    projectId?: string | null
    folderPath?: string | null
  },
  choices: Record<number, InstrumentalChoice | undefined>,
  storage: StorageLike | null = defaultStorage(),
): void {
  const projectKey = scope.projectId?.trim() ?? ''
  const folderKey = normalizeInstrumentalFolderKey(scope.folderPath)
  if (!projectKey && !folderKey) return
  const payload = readPayload(storage)
  const next: StoredChoicesPayload = {
    byProject: projectKey ? applyScopeUpdate(payload.byProject, projectKey, choices) : payload.byProject,
    byFolder: folderKey ? applyScopeUpdate(payload.byFolder, folderKey, choices) : payload.byFolder,
  }
  writePayload(storage, next)
}

export function writeSavedInstrumentalChoice(
  scope: {
    projectId?: string | null
    folderPath?: string | null
  },
  number: number,
  choice: InstrumentalChoice | undefined,
  storage: StorageLike | null = defaultStorage(),
): void {
  writeSavedInstrumentalChoices(scope, { [number]: choice }, storage)
}
