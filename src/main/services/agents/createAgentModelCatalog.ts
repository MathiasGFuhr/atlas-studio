import path from 'node:path'
import { getUserDataPath } from '../../paths'
import type { CodexRuntimeManager } from '../codex/CodexRuntimeManager'
import type { AntigravityService } from '../antigravity/AntigravityService'
import { AgentModelCache } from './AgentModelCache'
import { AgentModelCatalog } from './AgentModelCatalog'
import { AntigravityModelProvider } from './AntigravityModelProvider'
import { CodexModelProvider } from './CodexModelProvider'

export function createAgentModelCatalog(deps: {
  runtimeManager: CodexRuntimeManager
  antigravityService: AntigravityService
  cachePath?: string
}): AgentModelCatalog {
  const cache = new AgentModelCache(
    deps.cachePath ?? path.join(getUserDataPath(), 'agent-models-cache.json'),
  )
  const codex = new CodexModelProvider({
    runCli: (args, timeoutMs) => deps.runtimeManager.runCliCommand(args, timeoutMs),
    tryRpc: (method, params) => deps.runtimeManager.tryAppServerRpc(method, params ?? {}),
    getVersion: () => deps.runtimeManager.getVersion(),
    getAuthFingerprint: () => deps.runtimeManager.getAuthFingerprint(),
    getConnected: () => deps.runtimeManager.isConnected(),
    getAccountLabel: () => {
      const account = deps.runtimeManager.getStatus().account
      return account?.email || account?.loginType || null
    },
  })
  const antigravity = new AntigravityModelProvider({
    runCli: (args, timeoutMs) => deps.antigravityService.runCli(args, timeoutMs),
    getVersion: () => deps.antigravityService.getVersion(),
    getAuthFingerprint: () => deps.antigravityService.getAuthFingerprint(),
    getConnected: () => deps.antigravityService.getStatus().connected,
    hasBinary: async () => Boolean(await deps.antigravityService.ensureBinary()),
  })
  return new AgentModelCatalog({ codex, antigravity }, cache)
}
