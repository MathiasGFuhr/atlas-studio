import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'
import fs from 'node:fs'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export function getMainDir(): string {
  return moduleDir
}

function copyDirIfMissing(from: string, to: string) {
  if (!fs.existsSync(from)) return
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) {
      copyDirIfMissing(src, dest)
      continue
    }
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest)
    }
  }
}

/**
 * Workspace gravável do usuário.
 * Em app instalado NÃO usa Program Files/resources (só leitura) —
 * copia o template de resources para userData na primeira execução.
 */
export function getWorkspaceRoot(): string {
  if (app.isPackaged) {
    const userWorkspace = path.join(app.getPath('userData'), 'workspace')
    const template = path.join(process.resourcesPath, 'workspace')
    fs.mkdirSync(userWorkspace, { recursive: true })
    copyDirIfMissing(template, userWorkspace)
    return userWorkspace
  }

  const candidates = [
    path.join(process.cwd(), 'workspace'),
    path.join(app.getAppPath(), 'workspace'),
    path.join(moduleDir, '../../workspace'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  const fallback = path.join(app.getPath('userData'), 'workspace')
  fs.mkdirSync(fallback, { recursive: true })
  return fallback
}

export function getUserDataPath(): string {
  return app.getPath('userData')
}

export function getDatabasePath(): string {
  return path.join(getUserDataPath(), 'atlas-studio.db')
}
