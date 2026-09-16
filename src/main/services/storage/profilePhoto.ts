import fs from 'node:fs'
import path from 'node:path'
import { getUserDataPath } from '../../paths'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

function profileDir(): string {
  return path.join(getUserDataPath(), 'profile')
}

export function readImageDataUrl(filePath: string): string | null {
  if (!filePath?.trim()) return null
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) return null
  const ext = path.extname(resolved).toLowerCase()
  const mime = MIME_BY_EXT[ext]
  if (!mime) return null
  try {
    const buffer = fs.readFileSync(resolved)
    if (buffer.byteLength === 0) return null
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

export function importProfilePhoto(sourcePath: string): string {
  const resolved = path.resolve(sourcePath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error('Arquivo de imagem não encontrado.')
  }
  const ext = path.extname(resolved).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error('Use uma imagem PNG, JPG, GIF ou WEBP.')
  }
  const size = fs.statSync(resolved).size
  if (size > MAX_BYTES) {
    throw new Error('A foto deve ter no máximo 8 MB.')
  }

  const destDir = profileDir()
  fs.mkdirSync(destDir, { recursive: true })
  clearProfilePhotoFiles()
  const dest = path.join(destDir, `avatar${ext}`)
  fs.copyFileSync(resolved, dest)
  return dest
}

export function clearProfilePhotoFiles() {
  const destDir = profileDir()
  if (!fs.existsSync(destDir)) return
  for (const name of fs.readdirSync(destDir)) {
    if (!name.toLowerCase().startsWith('avatar')) continue
    try {
      fs.unlinkSync(path.join(destDir, name))
    } catch {
      /* ignore */
    }
  }
}
