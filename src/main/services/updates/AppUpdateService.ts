import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import { createRequire } from 'node:module'
import { settingsRepository } from '../../repositories/settingsRepository'
import { IPC } from '../../../shared/types'
import {
  emptyUpdateStatus,
  realDownloadPercent,
  summarizeReleaseNotes,
  type AppUpdateStatus,
} from '../../../shared/updates'

const require = createRequire(import.meta.url)

type AppUpdater = import('electron-updater').AppUpdater
type NsisUpdater = import('electron-updater').NsisUpdater

let updater: AppUpdater | null = null
let status: AppUpdateStatus = emptyUpdateStatus('0.0.0', false)
let getWindow: () => BrowserWindow | null = () => null
let started = false
let autoCheckTimer: ReturnType<typeof setTimeout> | null = null

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
  } catch (error) {
    status = {
      ...status,
      state: 'unsupported',
      errorMessage: errorMessage(error, 'Atualizador indisponível nesta instalação.'),
    }
    return
  }

  scheduleAutoCheck()
}

export function scheduleAutoCheck() {
  if (autoCheckTimer) {
    clearTimeout(autoCheckTimer)
    autoCheckTimer = null
  }
  if (!app.isPackaged || !updater || !readAutoCheck()) return
  autoCheckTimer = setTimeout(() => {
    void checkForAppUpdates({ silent: true })
  }, 8000)
}

export async function checkForAppUpdates(opts: { silent?: boolean } = {}): Promise<AppUpdateStatus> {
  if (!app.isPackaged) {
    status = { ...getAppUpdateStatus(), state: 'dev', errorMessage: null }
    emit()
    return getAppUpdateStatus()
  }
  if (!updater) {
    status = {
      ...getAppUpdateStatus(),
      state: 'unsupported',
      errorMessage: 'Canal de atualização não configurado nesta build.',
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
        releaseNotes: summarizeReleaseNotes(info?.releaseNotes),
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
      status = {
        ...getAppUpdateStatus(),
        state: 'unsupported',
        errorMessage: 'Canal de atualização não configurado. Veja docs/atualizacoes.md.',
      }
    } else {
      status = {
        ...getAppUpdateStatus(),
        state: 'error',
        errorMessage: errorMessage(error, 'Não foi possível verificar atualizações.'),
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
    status = {
      ...getAppUpdateStatus(),
      state: 'error',
      errorMessage: errorMessage(error, 'Falha ao baixar a atualização.'),
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
    status = {
      ...getAppUpdateStatus(),
      state: 'error',
      errorMessage: errorMessage(error, 'Não foi possível instalar a atualização.'),
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
      releaseNotes: summarizeReleaseNotes(info.releaseNotes),
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
      releaseNotes: summarizeReleaseNotes(info.releaseNotes) ?? status.releaseNotes,
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
    status = {
      ...getAppUpdateStatus(),
      state: 'error',
      errorMessage: errorMessage(error, 'Erro no atualizador.'),
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
