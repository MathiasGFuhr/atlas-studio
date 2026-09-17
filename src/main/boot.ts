import { app, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { initDatabase } from './db/database'
import { registerIpcHandlers } from './ipc/handlers'
import { CodexService } from './services/codex/CodexService'
import { CodexRuntimeManager } from './services/codex/CodexRuntimeManager'
import { AntigravityService } from './services/antigravity/AntigravityService'
import { createAtlasActionRegistry } from './services/actions/registerAtlasActions'
import { ChatService } from './services/chat/ChatService'
import { createAgentModelCatalog } from './services/agents/createAgentModelCatalog'
import { getWorkspaceRoot } from './paths'
import { generationRunRepository } from './repositories/generationRunRepository'
import { settingsRepository } from './repositories/settingsRepository'
import { syncSkillLibrary } from './services/skills/SkillLibrarySync'
import { registerAtlasMediaProtocol } from './services/media/atlasMediaProtocol'

let mainWindow: BrowserWindow | null = null
let codexService: CodexService | null = null
let runtimeManager: CodexRuntimeManager | null = null
let antigravityService: AntigravityService | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function setMainWindow(window: BrowserWindow | null) {
  mainWindow = window
}

export function getCodexService(): CodexService | null {
  return codexService
}

export function getRuntimeManager(): CodexRuntimeManager | null {
  return runtimeManager
}

function migratePackagedPaths(workspaceRoot: string) {
  if (!app.isPackaged) return
  const settings = settingsRepository.get()
  const patch: Partial<import('../shared/types').AppSettings> = {}
  const projects = path.join(workspaceRoot, 'projects')

  if (settings.workspacePath !== workspaceRoot) {
    patch.workspacePath = workspaceRoot
  }

  const scripts = settings.scriptsPath?.trim() || ''
  const scriptsMissing = !scripts || !fs.existsSync(scripts)
  const scriptsInsideInstallOrDev =
    /[\\/]Program Files[\\/]/i.test(scripts) ||
    /[\\/]resources[\\/]workspace[\\/]/i.test(scripts) ||
    /altas Studio[\\/]workspace/i.test(scripts)

  if (scriptsMissing || scriptsInsideInstallOrDev) {
    patch.scriptsPath = projects
  }

  if (Object.keys(patch).length > 0) {
    settingsRepository.update(patch)
  }
}

export async function bootAtlasApp(): Promise<{
  workspaceRoot: string
  codexService: CodexService
  runtimeManager: CodexRuntimeManager
  antigravityService: AntigravityService
}> {
  const workspaceRoot = getWorkspaceRoot()
  await initDatabase(workspaceRoot)
  registerAtlasMediaProtocol()
  migratePackagedPaths(workspaceRoot)
  const synced = syncSkillLibrary()
  console.log(
    `[atlas][skills] biblioteca sincronizada: ${synced.total} skills, ${synced.nichesCreated} nichos novos`,
  )

  runtimeManager = new CodexRuntimeManager({
    getWindow: getMainWindow,
  })

  codexService = new CodexService({
    workspaceRoot,
    getWindow: getMainWindow,
    runtimeManager,
  })

  antigravityService = new AntigravityService({
    getWindow: getMainWindow,
  })

  const actionRegistry = createAtlasActionRegistry({
    getMainWindow,
    codexService,
  })
  const chatService = new ChatService({
    registry: actionRegistry,
    codexService,
    runtimeManager,
    antigravityService,
    getMainWindow,
  })

  const agentModelCatalog = createAgentModelCatalog({
    runtimeManager,
    antigravityService,
  })

  registerIpcHandlers({
    codexService,
    runtimeManager,
    antigravityService,
    chatService,
    agentModelCatalog,
    getMainWindow,
  })

  void runtimeManager
    .initialize()
    .then((status) => {
      console.log('[atlas] codex status:', status.authState, '-', status.message)
      void agentModelCatalog.refresh('codex')
    })
    .catch(() => undefined)

  void antigravityService
    .initialize()
    .then((status) => {
      console.log('[atlas] antigravity status:', status.authState, '-', status.message)
      void agentModelCatalog.refresh('antigravity')
    })
    .catch(() => undefined)

  const interrupted = generationRunRepository.markInterruptedAbandoned(2)
  if (interrupted > 0) {
    console.log(`[atlas] marked ${interrupted} abandoned generation run(s) as interrupted`)
  }

  return {
    workspaceRoot,
    codexService,
    runtimeManager,
    antigravityService,
  }
}
