import fs from 'node:fs'
import path from 'node:path'
import { COMFY_DOWNLOAD_SUBDIR } from '../../../shared/comfy'

const LEGACY_COMFY_SUBDIR = 'comfy'

function isDirectory(folderPath: string): boolean {
  try {
    return fs.statSync(folderPath).isDirectory()
  } catch {
    return false
  }
}

/** `{pasta vinculada}/lipsync`. Nunca a raiz da música, nunca outro disco. */
export function resolveComfyDownloadDir(projectFolderPath: string | null | undefined): string | null {
  const folder = projectFolderPath?.trim()
  if (!folder) return null
  return path.join(path.resolve(folder), COMFY_DOWNLOAD_SUBDIR)
}

/** Cria `{pasta vinculada}/lipsync` se a pasta do projeto existir. */
export function ensureComfyDownloadDir(projectFolderPath: string | null | undefined): string | null {
  const folder = projectFolderPath?.trim()
  if (!folder) return null
  const parent = path.resolve(folder)
  if (!isDirectory(parent)) return null
  const dest = path.join(parent, COMFY_DOWNLOAD_SUBDIR)
  fs.mkdirSync(dest, { recursive: true })
  return dest
}

/**
 * Destino efetivo do vídeo. Com pasta vinculada, usa só `{pasta}/lipsync`.
 * Lotes antigos na raiz ou em `Comfy/` passam para `lipsync/`.
 */
export function coerceComfyDownloadDir(
  storedOutputDir: string,
  projectFolderPath: string | null | undefined,
): string {
  const linked = resolveComfyDownloadDir(projectFolderPath)
  if (linked) return linked
  const stored = storedOutputDir.trim() ? path.resolve(storedOutputDir) : ''
  if (!stored) return stored
  const base = path.basename(stored).toLowerCase()
  if (base === COMFY_DOWNLOAD_SUBDIR) return stored
  if (base === LEGACY_COMFY_SUBDIR) return path.join(path.dirname(stored), COMFY_DOWNLOAD_SUBDIR)
  return path.join(stored, COMFY_DOWNLOAD_SUBDIR)
}
