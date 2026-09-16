import fs from 'node:fs'
import path from 'node:path'
import { getUserDataPath } from '../../paths'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

function channelDir(channelId: string): string {
  return path.join(getUserDataPath(), 'channels', channelId)
}

export function importChannelImage(
  sourcePath: string,
  channelId: string,
  filenameStem: string,
): string {
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
    throw new Error('A imagem deve ter no máximo 8 MB.')
  }

  const destDir = channelDir(channelId)
  fs.mkdirSync(destDir, { recursive: true })

  for (const name of fs.readdirSync(destDir)) {
    if (name.toLowerCase().startsWith(filenameStem.toLowerCase())) {
      try {
        fs.unlinkSync(path.join(destDir, name))
      } catch {
        /* ignore */
      }
    }
  }

  const dest = path.join(destDir, `${filenameStem}${ext}`)
  fs.copyFileSync(resolved, dest)
  return dest
}

export function removeChannelMedia(channelId: string) {
  const destDir = channelDir(channelId)
  if (!fs.existsSync(destDir)) return
  fs.rmSync(destDir, { recursive: true, force: true })
}

export function removeVideoThumbnailFile(filePath: string) {
  if (!filePath?.trim()) return
  try {
    const resolved = path.resolve(filePath)
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      fs.unlinkSync(resolved)
    }
  } catch {
    /* ignore */
  }
}
