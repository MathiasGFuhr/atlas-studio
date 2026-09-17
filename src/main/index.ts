import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { startAppUpdateService } from './services/updates/AppUpdateService'
import { getMainDir } from './paths'
import {
  bootAtlasApp,
  getCodexService,
  getMainWindow,
  getRuntimeManager,
  setMainWindow,
} from './boot'
import {
  registerAtlasMediaScheme,
} from './services/media/atlasMediaProtocol'
import {
  APP_BACKGROUND,
  MAIN_WINDOW_HEIGHT,
  MAIN_WINDOW_WIDTH,
  SplashController,
  isSplashEnabled,
} from './splash'

let splashController: SplashController | null = null

registerAtlasMediaScheme()

// Nome exibido + pasta userData correta no Windows (não o slug npm).
if (app.isPackaged) {
  app.setName('Atlas Studio')
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

  const mainWindow = new BrowserWindow({
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
  setMainWindow(mainWindow)

  splashController?.attachMain(mainWindow)

  mainWindow.once('ready-to-show', () => {
    if (splashController?.isActive) {
      splashController.notifyMainReady()
      return
    }
    mainWindow.show()
    mainWindow.focus()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(getMainDir(), '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    setMainWindow(null)
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

  const { codexService } = await bootAtlasApp()

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

  createWindow()
  startAppUpdateService({ getWindow: getMainWindow })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    void getCodexService()?.disconnect()
    void getRuntimeManager()?.shutdown()
    app.quit()
  }
})

app.on('before-quit', () => {
  splashController?.dispose()
  splashController = null
  void getRuntimeManager()?.shutdown()
})
