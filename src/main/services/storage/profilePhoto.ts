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

type ImageCacheEntry = {
  mtimeMs: number
  size: number
  dataUrl: string | null
}

/** Evita re-ler e re-encodar a mesma thumbnail/avatar a cada troca de aba. */
const imageDataUrlCache = new Map<string, ImageCacheEntry>()

export function readImageDataUrl(filePath: string): string | null {
  if (!filePath?.trim()) return null
  const resolved = path.resolve(filePath)
  const ext = path.extname(resolved).toLowerCase()
  const mime = MIME_BY_EXT[ext]
  if (!mime) return null

  let stat: fs.Stats
  try {
    stat = fs.statSync(resolved)
    if (!stat.isFile()) {
      imageDataUrlCache.delete(resolved)
      return null
    }
  } catch {
    imageDataUrlCache.delete(resolved)
    return null
  }

  const cached = imageDataUrlCache.get(resolved)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.dataUrl
  }

  try {
    const buffer = fs.readFileSync(resolved)
    const dataUrl =
      buffer.byteLength === 0 ? null : `data:${mime};base64,${buffer.toString('base64')}`
    imageDataUrlCache.set(resolved, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      dataUrl,
    })
    return dataUrl
  } catch {
    imageDataUrlCache.delete(resolved)
    return null
  }
}

export function clearImageDataUrlCache(filePath?: string) {
  if (!filePath?.trim()) {
    imageDataUrlCache.clear()
    return
  }
  imageDataUrlCache.delete(path.resolve(filePath))
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
