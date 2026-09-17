import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { initDatabase } from './db/database'
import { registerIpcHandlers } from './ipc/handlers'
import { CodexService } from './services/codex/CodexService'
import { CodexRuntimeManager } from './services/codex/CodexRuntimeManager'
import { AntigravityService } from './services/antigravity/AntigravityService'
import { createAtlasActionRegistry } from './services/actions/registerAtlasActions'
import { ChatService } from './services/chat/ChatService'
import { startAppUpdateService } from './services/updates/AppUpdateService'
import { getMainDir, getWorkspaceRoot } from './paths'
import { runRealFlowTest } from './services/e2e/runRealFlowTest'
import { generationRunRepository } from './repositories/generationRunRepository'
import { settingsRepository } from './repositories/settingsRepository'
import { syncSkillLibrary } from './services/skills/SkillLibrarySync'
import {
  registerAtlasMediaProtocol,
  registerAtlasMediaScheme,
} from './services/media/atlasMediaProtocol'
import {
  APP_BACKGROUND,
  MAIN_WINDOW_HEIGHT,
  MAIN_WINDOW_WIDTH,
  SplashController,
  isSplashEnabled,
} from './splash'

let mainWindow: BrowserWindow | null = null
let splashController: SplashController | null = null
let codexService: CodexService | null = null
let runtimeManager: CodexRuntimeManager | null = null
let antigravityService: AntigravityService | null = null

registerAtlasMediaScheme()

// Nome exibido + pasta userData correta no Windows (não o slug npm).
if (app.isPackaged) {
  app.setName('Atlas Studio')
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

function resolveAppIcon(): string | undefined {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'icon.ico'),
    path.join(getMainDir(), '../build/icon.ico'),
    path.join(process.cwd(), 'build', 'icon.ico'),
  ]
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return undefined
}

function createWindow() {
  const preloadPath = resolvePreloadPath()
  console.log('[atlas] preload:', preloadPath)

  mainWindow = new BrowserWindow({
    width: MAIN_WINDOW_WIDTH,
    height: MAIN_WINDOW_HEIGHT,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: APP_BACKGROUND,
    title: 'Atlas Studio',
    icon: resolveAppIcon(),
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  splashController?.attachMain(mainWindow)

  mainWindow.once('ready-to-show', () => {
    if (splashController?.isActive) {
      splashController.notifyMainReady()
      return
    }
    mainWindow?.show()
    mainWindow?.focus()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(getMainDir(), '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function resolvePreloadPath(): string {
  const candidates = [
    path.join(getMainDir(), 'preload.cjs'),
    path.join(getMainDir(), 'preload.js'),
    path.join(process.cwd(), 'dist-electron', 'preload.cjs'),
    path.join(process.cwd(), 'dist-electron', 'preload.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[0]
}

app.whenReady().then(async () => {
  if (isSplashEnabled()) {
    splashController = new SplashController()
    if (!splashController.start(resolveAppIcon())) {
      splashController = null
    }
  }

  const workspaceRoot = getWorkspaceRoot()
  await initDatabase(workspaceRoot)
  registerAtlasMediaProtocol()
  migratePackagedPaths(workspaceRoot)
  const synced = syncSkillLibrary()
  console.log(
    `[atlas][skills] biblioteca sincronizada: ${synced.total} skills, ${synced.nichesCreated} nichos novos`,
  )

  runtimeManager = new CodexRuntimeManager({
    getWindow: () => mainWindow,
  })

  codexService = new CodexService({
    workspaceRoot,
    getWindow: () => mainWindow,
    runtimeManager,
  })

  antigravityService = new AntigravityService({
    getWindow: () => mainWindow,
  })

  const actionRegistry = createAtlasActionRegistry({
    getMainWindow: () => mainWindow,
    codexService: codexService!,
  })
  const chatService = new ChatService({
    registry: actionRegistry,
    codexService: codexService!,
    runtimeManager: runtimeManager!,
    antigravityService: antigravityService!,
    getMainWindow: () => mainWindow,
  })

  registerIpcHandlers({
    codexService: codexService!,
    runtimeManager: runtimeManager!,
    antigravityService: antigravityService!,
    chatService,
    getMainWindow: () => mainWindow,
  })

  void runtimeManager
    .initialize()
    .then((status) => {
      console.log(
        '[atlas] codex status:',
        status.authState,
        '-',
        status.message,
      )
    })
    .catch(() => undefined)

  void antigravityService
    .initialize()
    .then((status) => {
      console.log('[atlas] antigravity status:', status.authState, '-', status.message)
    })
    .catch(() => undefined)

  const interrupted = generationRunRepository.markInterruptedAbandoned(2)
  if (interrupted > 0) {
    console.log(`[atlas] marked ${interrupted} abandoned generation run(s) as interrupted`)
  }

  if (process.env.ATLAS_STATUS_CHECK === '1') {
    try {
      const status = await codexService.connect()
      console.log('[atlas-status]', JSON.stringify(status))
      app.exit(status.connected ? 0 : 1)
    } catch (error) {
      console.error('[atlas-status] failed', error)
      app.exit(1)
    }
    return
  }

  if (process.env.ATLAS_E2E === '1') {
    try {
      const result = await runRealFlowTest(codexService)
      console.log('[atlas-e2e]', JSON.stringify(result, null, 2))
      app.exit(result.ok ? 0 : 1)
    } catch (error) {
      console.error('[atlas-e2e] failed', error)
      app.exit(1)
    }
    return
  }

  createWindow()
  startAppUpdateService({ getWindow: () => mainWindow })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    void codexService?.disconnect()
    void runtimeManager?.shutdown()
    app.quit()
  }
})

app.on('before-quit', () => {
  splashController?.dispose()
  splashController = null
  void runtimeManager?.shutdown()
})
