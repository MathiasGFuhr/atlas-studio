import type { AppDatabase } from './database'
import path from 'node:path'
import type { AppSettings, OutputStyle } from '../../shared/types'
import { CHAT_DOCK_DEFAULT_HEIGHT, CHAT_DOCK_DEFAULT_WIDTH } from '../../shared/chat/chatDockSize'

/**
 * Popula apenas as settings padrão quando o banco é recém-criado.
 * NÃO cria nichos nem roteiros fictícios — a tela de Nichos exibe
 * exclusivamente dados reais inseridos pelo usuário.
 */
export function seedIfEmpty(db: AppDatabase, workspaceRoot: string) {
  const count = db.prepare('SELECT COUNT(*) as c FROM settings').get() as { c: number }
  if (Number(count.c) > 0) return

  const settings: AppSettings = {
    accountName: '',
    accountRole: '',
    accountEmail: '',
    accountPhotoPath: '',
    workspacePath: workspaceRoot,
    projectsRoot: path.join(
      process.env.USERPROFILE ?? process.env.HOME ?? '',
      'Documents',
      'Atlas Studio',
    ),
    skillsPath: path.join(
      process.env.USERPROFILE ?? process.env.HOME ?? '',
      'Documents',
      'ChatGPT',
    ),
    skillLibraryRoot: path.join(
      process.env.USERPROFILE ?? process.env.HOME ?? '',
      'Documents',
      'ChatGPT',
    ),
    scriptsPath: path.join(workspaceRoot, 'projects'),
    defaultLanguage: 'Português',
    defaultNicheId: null,
    defaultOutputStyle: 'profissional' as OutputStyle,
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

  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(settings)) {
    upsert.run(key, JSON.stringify(value))
  }
}
