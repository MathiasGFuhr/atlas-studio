import { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { getMainDir } from './paths'

export const APP_BACKGROUND = '#0B0F12'
export const MAIN_WINDOW_WIDTH = 1440
export const MAIN_WINDOW_HEIGHT = 900

const SPLASH_MIN_MS = 2400
const SPLASH_EXIT_MS = 420
const SPLASH_HINT_MS = 2800

export function isSplashEnabled(): boolean {
  if (process.env.ATLAS_E2E === '1' || process.env.ATLAS_STATUS_CHECK === '1') {
    return false
  }
  if (process.env.ATLAS_SKIP_SPLASH === '1') return false
  if (process.env.ATLAS_SHOW_SPLASH === '1') return true
  if (process.env.VITE_DEV_SERVER_URL) return false
  return true
}

export function resolveSplashHtml(): string | null {
  const candidates = [
    path.join(getMainDir(), 'splash/index.html'),
    path.join(process.cwd(), 'dist-electron/splash/index.html'),
    path.join(process.cwd(), 'src/splash/index.html'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export class SplashController {
  private splash: BrowserWindow | null = null
  private main: BrowserWindow | null = null
  private mainReady = false
  private minElapsed = false
  private revealed = false
  private minTimer: ReturnType<typeof setTimeout> | null = null
  private hintTimer: ReturnType<typeof setTimeout> | null = null
  private exitTimer: ReturnType<typeof setTimeout> | null = null
  private failsafeTimer: ReturnType<typeof setTimeout> | null = null

  get isActive(): boolean {
    return Boolean(this.splash && !this.splash.isDestroyed())
  }

  start(icon?: string): boolean {
    const html = resolveSplashHtml()
    if (!html) {
      console.warn('[atlas] splash html não encontrada, seguindo sem abertura')
      return false
    }

    this.splash = new BrowserWindow({
      width: MAIN_WINDOW_WIDTH,
      height: MAIN_WINDOW_HEIGHT,
      frame: false,
      show: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      autoHideMenuBar: true,
      backgroundColor: APP_BACKGROUND,
      title: 'Atlas Studio',
      icon,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    })

    this.splash.setMenuBarVisibility(false)

    this.failsafeTimer = setTimeout(() => {
      this.minElapsed = true
      this.tryReveal()
    }, 8000)

    this.splash.webContents.on('did-fail-load', () => {
      console.warn('[atlas] splash falhou ao carregar, seguindo para a janela principal')
      this.minElapsed = true
      this.disposeSplashOnly()
      this.tryReveal()
    })

    this.splash.once('ready-to-show', () => {
      if (!this.splash || this.splash.isDestroyed()) return
      this.splash.center()
      this.splash.show()
      this.minTimer = setTimeout(() => {
        this.minElapsed = true
        this.tryReveal()
      }, SPLASH_MIN_MS)
      this.hintTimer = setTimeout(() => {
        if (!this.revealed) void this.setHtmlClass('is-waiting', true)
      }, SPLASH_HINT_MS)
    })

    this.splash.on('closed', () => {
      this.splash = null
      if (!this.revealed && this.main && !this.main.isDestroyed()) {
        this.revealed = true
        this.main.show()
        this.main.focus()
      }
    })

    void this.splash.loadFile(html)
    return true
  }

  attachMain(main: BrowserWindow) {
    this.main = main
  }

  notifyMainReady() {
    this.mainReady = true
    this.tryReveal()
  }

  dispose() {
    this.revealed = true
    this.clearTimers()
    this.disposeSplashOnly()
  }

  private disposeSplashOnly() {
    if (this.splash && !this.splash.isDestroyed()) {
      this.splash.close()
    }
    this.splash = null
  }

  private tryReveal() {
    if (this.revealed || !this.mainReady || !this.minElapsed) return
    const main = this.main
    if (!main || main.isDestroyed()) return

    this.revealed = true
    this.clearTimers()

    const splash = this.splash && !this.splash.isDestroyed() ? this.splash : null
    if (!splash) {
      main.show()
      main.focus()
      return
    }

    main.setBounds(splash.getBounds())
    splash.setAlwaysOnTop(true)
    main.showInactive()
    void this.setHtmlClass('is-exiting', true)

    this.exitTimer = setTimeout(() => {
      if (!splash.isDestroyed()) {
        splash.setAlwaysOnTop(false)
        splash.close()
      }
      this.splash = null
      if (!main.isDestroyed()) {
        main.show()
        main.focus()
      }
    }, SPLASH_EXIT_MS)
  }

  private async setHtmlClass(className: string, enabled: boolean) {
    const splash = this.splash
    if (!splash || splash.isDestroyed()) return
    const op = enabled ? 'add' : 'remove'
    try {
      await splash.webContents.executeJavaScript(
        `document.documentElement.classList.${op}(${JSON.stringify(className)})`,
      )
    } catch {
      /* janela já fechada */
    }
  }

  private clearTimers() {
    if (this.minTimer) clearTimeout(this.minTimer)
    if (this.hintTimer) clearTimeout(this.hintTimer)
    if (this.exitTimer) clearTimeout(this.exitTimer)
    if (this.failsafeTimer) clearTimeout(this.failsafeTimer)
    this.minTimer = null
    this.hintTimer = null
    this.exitTimer = null
    this.failsafeTimer = null
  }
}
