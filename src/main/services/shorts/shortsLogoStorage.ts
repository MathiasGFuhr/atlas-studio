import fs from 'node:fs'
import path from 'node:path'
import { shortsJobCacheDir } from './shortsThumbnail'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

export function shortsLogoCachePath(jobId: string, ext: string): string {
  return path.join(shortsJobCacheDir(jobId), `logo${ext}`)
}

export function importShortsLogo(jobId: string, sourcePath: string): string {
  const resolved = path.resolve(sourcePath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error('Arquivo de imagem não encontrado.')
  }
  const ext = path.extname(resolved).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error('Use uma imagem PNG, JPG, GIF ou WEBP.')
  }
  if (fs.statSync(resolved).size > MAX_BYTES) {
    throw new Error('A logo deve ter no máximo 8 MB.')
  }

  const destDir = shortsJobCacheDir(jobId)
  fs.mkdirSync(destDir, { recursive: true })
  for (const name of fs.readdirSync(destDir)) {
    if (name.toLowerCase().startsWith('logo.')) {
      try {
        fs.unlinkSync(path.join(destDir, name))
      } catch {
        /* ignore */
      }
    }
  }

  const dest = shortsLogoCachePath(jobId, ext)
  fs.copyFileSync(resolved, dest)
  return dest
}

export function clearShortsLogoFiles(jobId: string) {
  const destDir = shortsJobCacheDir(jobId)
  if (!fs.existsSync(destDir)) return
  for (const name of fs.readdirSync(destDir)) {
    if (!name.toLowerCase().startsWith('logo.')) continue
    try {
      fs.unlinkSync(path.join(destDir, name))
    } catch {
      /* ignore */
    }
  }
}
