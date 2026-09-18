import path from 'node:path'
import { getDb } from '../db/database'
import type { AppSettings } from '../../shared/types'
import { CHAT_DOCK_DEFAULT_HEIGHT, CHAT_DOCK_DEFAULT_WIDTH } from '../../shared/chat/chatDockSize'
import { normalizeNotificationReadKeys } from '../../shared/notifications'
import {
  isRealCodexModelId,
  readConfiguredEffort,
  resolveEffectiveCodexModel,
  writeConfiguredEffort,
  writeConfiguredModel,
} from '../services/codex/codexModels'
import { readImageDataUrl } from '../services/storage/profilePhoto'

const TRANSIENT_SETTING_KEYS = new Set(['accountPhotoDataUrl'])

const DEFAULT_SKILL_LIBRARY = path.join(
  process.env.USERPROFILE ?? process.env.HOME ?? '',
  'Documents',
  'ChatGPT',
)

export const DEFAULT_PROJECTS_ROOT = path.join(
  process.env.USERPROFILE ?? process.env.HOME ?? '',
  'Documents',
  'Atlas Studio',
)

const DEFAULTS: AppSettings = {
  accountName: '',
  accountRole: '',
  accountEmail: '',
  accountPhotoPath: '',
  workspacePath: '',
  projectsRoot: DEFAULT_PROJECTS_ROOT,
  skillsPath: DEFAULT_SKILL_LIBRARY,
  skillLibraryRoot: DEFAULT_SKILL_LIBRARY,
  scriptsPath: '',
  defaultLanguage: 'Português',
  defaultNicheId: null,
  defaultOutputStyle: 'profissional',
  defaultDuration: '15',
  finalAuditEnabled: true,
  codexModel: '',
  defaultCodexModel: '',
  defaultCodexEffort: '',
  defaultAntigravityModel: '',
  defaultAntigravityEffort: '',
  allowExternalVideoAnalysis: false,
  autoApproval: false,
  backupEnabled: true,
  autoCheckUpdates: true,
  codexBinaryPath: '',
  antigravityBinaryPath: '',
  codexOnboardingDismissed: false,
  notificationReadKeys: [],
  contentAreasAutoDetect: true,
  contentAreasHistoryEnabled: true,
  contentAreasMusicEnabled: true,
  chatPanelWidth: CHAT_DOCK_DEFAULT_WIDTH,
  chatPanelHeight: CHAT_DOCK_DEFAULT_HEIGHT,
  musicExportFolder: '',
}

export const settingsRepository = {
  get(): AppSettings {
    const rows = getDb().prepare('SELECT key, value FROM settings').all() as Array<{
      key: string
      value: string
    }>
    const settings = { ...DEFAULTS } as AppSettings & Record<string, unknown>
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch {
        settings[row.key] = row.value
      }
    }

    // Bancos anteriores à separação História/Música não têm projectsRoot gravado.
    if (!String(settings.projectsRoot || '').trim()) {
      settings.projectsRoot = DEFAULT_PROJECTS_ROOT
    }

    // Compat: skillLibraryRoot é a fonte oficial; espelha skillsPath legado.
    if (!settings.skillLibraryRoot && settings.skillsPath) {
      settings.skillLibraryRoot = settings.skillsPath
    }
    if (settings.skillLibraryRoot && settings.skillsPath !== settings.skillLibraryRoot) {
      settings.skillsPath = settings.skillLibraryRoot
    }

    const fromLegacy = String(settings.codexModel || '')
    const fromDefault = String(settings.defaultCodexModel || '')
    const resolved = resolveEffectiveCodexModel(fromDefault || fromLegacy)
    settings.defaultCodexModel = resolved
    settings.codexModel = resolved

    if (!String(settings.defaultCodexEffort || '').trim()) {
      settings.defaultCodexEffort = readConfiguredEffort() || ''
    }
    settings.defaultAntigravityModel = String(settings.defaultAntigravityModel || '')
    settings.defaultAntigravityEffort = String(settings.defaultAntigravityEffort || '')
    settings.allowExternalVideoAnalysis = Boolean(settings.allowExternalVideoAnalysis)

    settings.accountPhotoDataUrl = readImageDataUrl(String(settings.accountPhotoPath || ''))
    settings.notificationReadKeys = normalizeNotificationReadKeys(settings.notificationReadKeys)

    return settings
  },

  update(patch: Partial<AppSettings>): AppSettings {
    const current = this.get()
    const next = { ...current, ...patch }

    if (patch.skillLibraryRoot !== undefined) {
      next.skillsPath = patch.skillLibraryRoot
    } else if (patch.skillsPath !== undefined && patch.skillLibraryRoot === undefined) {
      next.skillLibraryRoot = patch.skillsPath
    }

    if (patch.defaultCodexModel !== undefined || patch.codexModel !== undefined) {
      const model = resolveEffectiveCodexModel(patch.defaultCodexModel ?? patch.codexModel)
      next.defaultCodexModel = model
      next.codexModel = model
      if (isRealCodexModelId(model)) {
        try {
          writeConfiguredModel(model)
        } catch {
          /* config.toml pode estar bloqueado — setting Atlas ainda vale via --model */
        }
      }
    }

    if (patch.defaultCodexEffort !== undefined) {
      const effort = String(patch.defaultCodexEffort || '').trim()
      next.defaultCodexEffort = effort
      if (effort) {
        try {
          writeConfiguredEffort(effort)
        } catch {
          /* config.toml pode estar bloqueado — setting Atlas ainda vale via -c */
        }
      }
    }

    const upsert = getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    for (const [key, value] of Object.entries(next)) {
      if (TRANSIENT_SETTING_KEYS.has(key)) continue
      upsert.run(key, JSON.stringify(value))
    }
    return this.get()
  },
}
