import path from 'node:path'
import { getDb } from '../db/database'
import type { AppSettings } from '../../shared/types'
import { normalizeNotificationReadKeys } from '../../shared/notifications'
import {
  isRealCodexModelId,
  resolveEffectiveCodexModel,
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
  autoApproval: false,
  backupEnabled: true,
  autoCheckUpdates: true,
  codexBinaryPath: '',
  antigravityBinaryPath: '',
  codexOnboardingDismissed: false,
  notificationReadKeys: [],
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

    // Modelo real do Codex (config.toml), não placeholder GPT-4o.
    const resolved = resolveEffectiveCodexModel(String(settings.codexModel || ''))
    if (settings.codexModel !== resolved) {
      settings.codexModel = resolved
      try {
        getDb()
          .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
          .run('codexModel', JSON.stringify(resolved))
      } catch {
        /* db pode ainda não estar pronto em testes */
      }
    }

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

    if (patch.codexModel !== undefined) {
      const model = resolveEffectiveCodexModel(patch.codexModel)
      next.codexModel = model
      if (isRealCodexModelId(model)) {
        try {
          writeConfiguredModel(model)
        } catch {
          /* config.toml pode estar bloqueado — setting Atlas ainda vale via --model */
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
