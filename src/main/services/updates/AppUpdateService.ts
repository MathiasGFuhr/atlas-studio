import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import { createRequire } from 'node:module'
import { settingsRepository } from '../../repositories/settingsRepository'
import { IPC } from '../../../shared/types'
import {
  emptyUpdateStatus,
  flattenReleaseNotes,
  realDownloadPercent,
  shouldRunBackgroundUpdateCheck,
  userFacingUpdateError,
  type AppUpdateStatus,
} from '../../../shared/updates'

const require = createRequire(import.meta.url)

type AppUpdater = import('electron-updater').AppUpdater
type NsisUpdater = import('electron-updater').NsisUpdater

const AUTO_CHECK_DELAY_MS = 1500
/** Reconsulta o feed enquanto o app permanece aberto. */
const AUTO_CHECK_INTERVAL_MS = 5 * 60 * 1000
/** Ao focar a janela, evita bater no GitHub a cada clique. */
const FOCUS_CHECK_THROTTLE_MS = 90 * 1000

let updater: AppUpdater | null = null
let status: AppUpdateStatus = emptyUpdateStatus('0.0.0', false)
let getWindow: () => BrowserWindow | null = () => null
let started = false
let focusListenerBound = false
let autoCheckTimer: ReturnType<typeof setTimeout> | null = null
let autoCheckInterval: ReturnType<typeof setInterval> | null = null
let lastBackgroundCheckAt = 0
let checkInFlight: Promise<AppUpdateStatus> | null = null

export function getAppUpdateStatus(): AppUpdateStatus {
  return { ...status, autoCheckEnabled: readAutoCheck() }
}

export function startAppUpdateService(deps: { getWindow: () => BrowserWindow | null }) {
  if (started) return
  started = true
  getWindow = deps.getWindow
  status = emptyUpdateStatus(app.getVersion(), app.isPackaged)

  if (!app.isPackaged) {
    status.state = 'dev'
    return
  }

  try {
    const { autoUpdater } = require('electron-updater') as { autoUpdater: AppUpdater }
    updater = autoUpdater
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.allowDowngrade = false
    updater.allowPrerelease = false
    const nsis = updater as NsisUpdater
    if (typeof nsis.verifyUpdateCodeSignature === 'function') {
      nsis.verifyUpdateCodeSignature = async () => null
    }
    updater.logger = console

    // Produção usa GitHub Releases via app-update.yml gerado no build.
    // ATLAS_UPDATE_FEED_URL é só override local (generic), nunca token.
    const feed = process.env.ATLAS_UPDATE_FEED_URL?.trim()
    if (feed) {
      updater.setFeedURL({ provider: 'generic', url: feed.replace(/\/$/, '') })
    }

    bindUpdaterEvents(updater)
    bindFocusUpdateCheck()
  } catch (error) {
    console.error('[updates]', userFacingUpdateError('unsupported'), error)
    status = {
      ...status,
      state: 'unsupported',
      errorMessage: userFacingUpdateError('unsupported'),
    }
    return
  }

  scheduleAutoCheck()
}

function clearAutoCheckTimers() {
  if (autoCheckTimer) {
    clearTimeout(autoCheckTimer)
    autoCheckTimer = null
  }
  if (autoCheckInterval) {
    clearInterval(autoCheckInterval)
    autoCheckInterval = null
  }
}

function bindFocusUpdateCheck() {
  if (focusListenerBound) return
  focusListenerBound = true
  app.on('browser-window-focus', () => {
    void maybeBackgroundUpdateCheck('focus')
  })
}

function maybeBackgroundUpdateCheck(reason: 'interval' | 'focus') {
  if (!shouldRunBackgroundUpdateCheck(getAppUpdateStatus())) return
  const now = Date.now()
  if (reason === 'focus' && now - lastBackgroundCheckAt < FOCUS_CHECK_THROTTLE_MS) return
  lastBackgroundCheckAt = now
  void checkForAppUpdates({ silent: true })
}

export function scheduleAutoCheck() {
  clearAutoCheckTimers()
  if (!app.isPackaged || !updater || !readAutoCheck()) return

  autoCheckTimer = setTimeout(() => {
    lastBackgroundCheckAt = Date.now()
    void checkForAppUpdates({ silent: true })
  }, AUTO_CHECK_DELAY_MS)

  autoCheckInterval = setInterval(() => {
    void maybeBackgroundUpdateCheck('interval')
  }, AUTO_CHECK_INTERVAL_MS)
}

export async function checkForAppUpdates(opts: { silent?: boolean } = {}): Promise<AppUpdateStatus> {
  if (checkInFlight) return checkInFlight
  checkInFlight = performUpdateCheck(opts).finally(() => {
    checkInFlight = null
  })
  return checkInFlight
}

async function performUpdateCheck(opts: { silent?: boolean } = {}): Promise<AppUpdateStatus> {
  if (!app.isPackaged) {
    status = { ...getAppUpdateStatus(), state: 'dev', errorMessage: null }
    emit()
    return getAppUpdateStatus()
  }
  if (!updater) {
    status = {
      ...getAppUpdateStatus(),
      state: 'unsupported',
      errorMessage: userFacingUpdateError('no-feed'),
    }
    emit()
    return getAppUpdateStatus()
  }

  status = {
    ...getAppUpdateStatus(),
    state: 'checking',
    errorMessage: null,
    downloadPercent: null,
  }
  emit()

  try {
    const result = await updater.checkForUpdates()
    const info = result?.updateInfo
    const latest = info?.version ?? null
    const current = app.getVersion()
    if (latest && isNewerVersion(latest, current)) {
      status = {
        ...getAppUpdateStatus(),
        state: status.state === 'ready' ? 'ready' : 'available',
        availableVersion: latest,
        releaseNotes: flattenReleaseNotes(info?.releaseNotes) || null,
        errorMessage: null,
      }
    } else {
      status = {
        ...getAppUpdateStatus(),
        state: 'up-to-date',
        availableVersion: null,
        releaseNotes: null,
        errorMessage: null,
      }
    }
  } catch (error) {
    if (opts.silent && isNetworkError(error)) {
      status = { ...getAppUpdateStatus(), state: 'idle', errorMessage: null }
    } else if (isMissingFeedError(error)) {
      console.error('[updates]', userFacingUpdateError('no-feed'), error)
      status = {
        ...getAppUpdateStatus(),
        state: 'unsupported',
        errorMessage: userFacingUpdateError('no-feed'),
      }
    } else {
      console.error('[updates]', userFacingUpdateError('check'), error)
      status = {
        ...getAppUpdateStatus(),
        state: 'error',
        errorMessage: userFacingUpdateError('check'),
      }
    }
  }

  emit()
  return getAppUpdateStatus()
}

export async function downloadAppUpdate(): Promise<AppUpdateStatus> {
  if (!app.isPackaged || !updater) return getAppUpdateStatus()
  if (status.state !== 'available' && status.state !== 'error' && status.state !== 'downloading') {
    if (status.state !== 'ready') return getAppUpdateStatus()
    return getAppUpdateStatus()
  }

  status = {
    ...getAppUpdateStatus(),
    state: 'downloading',
    downloadPercent: status.downloadPercent,
    errorMessage: null,
  }
  emit()

  try {
    await updater.downloadUpdate()
  } catch (error) {
    console.error('[updates]', userFacingUpdateError('download'), error)
    status = {
      ...getAppUpdateStatus(),
      state: 'error',
      errorMessage: userFacingUpdateError('download'),
    }
    emit()
  }
  return getAppUpdateStatus()
}

export function installAppUpdate(): AppUpdateStatus {
  if (!app.isPackaged || !updater || status.state !== 'ready') {
    return getAppUpdateStatus()
  }
  try {
    updater.quitAndInstall(false, true)
  } catch (error) {
    console.error('[updates]', userFacingUpdateError('install'), error)
    status = {
      ...getAppUpdateStatus(),
      state: 'error',
      errorMessage: userFacingUpdateError('install'),
    }
    emit()
  }
  return getAppUpdateStatus()
}

function bindUpdaterEvents(autoUpdater: AppUpdater) {
  autoUpdater.on('checking-for-update', () => {
    status = { ...getAppUpdateStatus(), state: 'checking', errorMessage: null }
    emit()
  })

  autoUpdater.on('update-available', (info) => {
    status = {
      ...getAppUpdateStatus(),
      state: 'available',
      availableVersion: info.version,
      releaseNotes: flattenReleaseNotes(info.releaseNotes) || null,
      errorMessage: null,
    }
    emit()
  })

  autoUpdater.on('update-not-available', () => {
    status = {
      ...getAppUpdateStatus(),
      state: 'up-to-date',
      availableVersion: null,
      releaseNotes: null,
      errorMessage: null,
    }
    emit()
  })

  autoUpdater.on('download-progress', (progress) => {
    const percent = realDownloadPercent(progress.transferred, progress.total, progress.percent)
    status = {
      ...getAppUpdateStatus(),
      state: 'downloading',
      downloadPercent: percent,
      errorMessage: null,
    }
    emit()
  })

  autoUpdater.on('update-downloaded', (info) => {
    status = {
      ...getAppUpdateStatus(),
      state: 'ready',
      availableVersion: info.version ?? status.availableVersion,
      releaseNotes: flattenReleaseNotes(info.releaseNotes) || status.releaseNotes,
      downloadPercent: 100,
      errorMessage: null,
    }
    emit()
  })

  autoUpdater.on('error', (error) => {
    if (status.state === 'checking' || status.state === 'idle') {
      if (isNetworkError(error)) {
        status = { ...getAppUpdateStatus(), state: 'idle', errorMessage: null }
        emit()
        return
      }
    }
    console.error('[updates]', userFacingUpdateError('generic'), error)
    status = {
      ...getAppUpdateStatus(),
      state: 'error',
      errorMessage: userFacingUpdateError('generic'),
    }
    emit()
  })
}

function emit() {
  const snapshot = getAppUpdateStatus()
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.updates.changed, snapshot)
  }
}

function readAutoCheck(): boolean {
  try {
    return settingsRepository.get().autoCheckUpdates !== false
  } catch {
    return true
  }
}

function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0)
  const b = current.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av > bv) return true
    if (av < bv) return false
  }
  return false
}

function isNetworkError(error: unknown): boolean {
  const text = errorMessage(error, '').toLowerCase()
  return (
    text.includes('enotfound') ||
    text.includes('econnrefused') ||
    text.includes('etimedout') ||
    text.includes('enetunreach') ||
    text.includes('offline') ||
    text.includes('net::') ||
    text.includes('getaddrinfo')
  )
}

function isMissingFeedError(error: unknown): boolean {
  const text = errorMessage(error, '').toLowerCase()
  return (
    text.includes('app-update.yml') ||
    text.includes('no published versions') ||
    text.includes('cannot find channel')
  )
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}
