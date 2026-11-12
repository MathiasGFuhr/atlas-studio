import { app, BrowserWindow, dialog } from 'electron'
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
import { flushDatabasePersist } from './db/database'
import { killActiveFfmpegProcesses } from './services/audio/ffmpeg'
import { comfyQueueService, remapActiveComfyOutputDirs } from './services/comfy'
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
if (process.platform === 'win32') {
  app.setAppUserModelId('com.atlasstudio.app')
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

  let revealTimer: ReturnType<typeof setTimeout> | null = null
  let revealed = false
  const revealMainWindow = () => {
    if (revealed || mainWindow.isDestroyed()) return
    revealed = true
    if (revealTimer) {
      clearTimeout(revealTimer)
      revealTimer = null
    }
    if (splashController?.isActive) {
      splashController.notifyMainReady()
      return
    }
    mainWindow.show()
    mainWindow.focus()
  }

  mainWindow.once('ready-to-show', revealMainWindow)
  mainWindow.webContents.once('did-finish-load', revealMainWindow)
  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    console.error('[atlas] renderer did-fail-load', { code, description, validatedURL })
  })

  // Em desenvolvimento, falhas do serviço de rede do Chromium podem impedir
  // o ready-to-show mesmo com o renderer carregado. Nunca deixe a janela oculta.
  if (process.env.VITE_DEV_SERVER_URL) {
    revealTimer = setTimeout(revealMainWindow, 3000)
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    // vite-plugin-electron + base './' pode gerar "http://localhost:5173./"
    const raw = process.env.VITE_DEV_SERVER_URL
    const devUrl = raw.replace(/\.\/?$/, '/')
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(path.join(getMainDir(), '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    if (revealTimer) clearTimeout(revealTimer)
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
  try {
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
    remapActiveComfyOutputDirs()
    comfyQueueService.resumeOnBoot()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  } catch (error) {
    console.error('[atlas] falha ao preparar o workspace', error)
    splashController?.dispose()
    splashController = null
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox('Atlas Studio', `Não foi possível preparar o workspace.\n\n${message}`)
    app.exit(1)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    void getCodexService()?.disconnect()
    void getRuntimeManager()?.shutdown()
    app.quit()
  }
})

app.on('before-quit', () => {
  try {
    flushDatabasePersist()
  } catch (error) {
    console.error('[atlas] falha ao gravar o banco ao sair', error)
  }
  splashController?.dispose()
  splashController = null
  comfyQueueService.stop()
  killActiveFfmpegProcesses()
  void getCodexService()?.disconnect()
  void getRuntimeManager()?.shutdown()
})
