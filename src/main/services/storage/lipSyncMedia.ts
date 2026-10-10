import fs from 'node:fs'
import path from 'node:path'
import { getUserDataPath } from '../../paths'

const MAX_BYTES = 12 * 1024 * 1024
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

function refsDir(): string {
  return path.join(getUserDataPath(), 'lipsync-refs')
}

export function importLipSyncImage(sourcePath: string, refId: string): string {
  const resolved = path.resolve(sourcePath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error('Arquivo de imagem não encontrado.')
  }
  const ext = path.extname(resolved).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error('Use uma imagem PNG, JPG, GIF ou WEBP.')
  }
  const size = fs.statSync(resolved).size
  if (size <= 0) throw new Error('O arquivo está vazio.')
  if (size > MAX_BYTES) {
    throw new Error('A imagem deve ter no máximo 12 MB.')
  }

  const destDir = refsDir()
  fs.mkdirSync(destDir, { recursive: true })
  const dest = path.join(destDir, `${refId}${ext}`)
  fs.copyFileSync(resolved, dest)
  return dest
}

export function removeLipSyncImage(filePath: string | null | undefined) {
  if (!filePath?.trim()) return
  try {
    const resolved = path.resolve(filePath)
    const root = path.resolve(refsDir())
    if (!resolved.startsWith(root)) return
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      fs.unlinkSync(resolved)
    }
  } catch {
    /* ignore */
  }
}
