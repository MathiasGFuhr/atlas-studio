import { AsyncLocalStorage } from 'node:async_hooks'

export type ScriptMutationFlow = 'generate' | 'adjust'

const flowStorage = new AsyncLocalStorage<ScriptMutationFlow>()

export function runInScriptFlow<T>(flow: ScriptMutationFlow, fn: () => Promise<T>): Promise<T> {
  return flowStorage.run(flow, fn)
}

export function currentScriptFlow(): ScriptMutationFlow | undefined {
  return flowStorage.getStore()
}

export function assertCanCreateScript() {
  if (flowStorage.getStore() === 'adjust') {
    throw new Error('Ajuste de roteiro não pode criar um novo script.')
  }
}
