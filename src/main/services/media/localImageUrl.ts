import fs from 'node:fs'
import path from 'node:path'
import { getUserDataPath } from '../../paths'
import { readImageDataUrl } from '../storage/profilePhoto'

export const ATLAS_MEDIA_SCHEME = 'atlas-media'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

/** Pastas do userData cujas imagens o renderer pode carregar via atlas-media. */
const IMAGE_ROOTS = ['lipsync-refs', 'channels']

export function toAtlasMediaUrl(filePath: string): string {
  return `${ATLAS_MEDIA_SCHEME}://local/?p=${encodeURIComponent(path.resolve(filePath))}`
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export function isAllowedImagePath(resolved: string): boolean {
  if (!IMAGE_EXT.has(path.extname(resolved).toLowerCase())) return false
  const userData = getUserDataPath()
  const target = resolved.toLowerCase()
  return IMAGE_ROOTS.some((dir) => isInside(path.join(userData, dir).toLowerCase(), target))
}

/**
 * URL para exibir uma imagem local no renderer. Imagens do userData viram
 * `atlas-media://` (streaming + cache do Chromium, sem base64 no IPC);
 * caminhos legados fora dessas pastas continuam como data URL.
 */
export function localImageUrl(filePath: string | null | undefined): string | null {
  if (!filePath?.trim()) return null
  const resolved = path.resolve(filePath)
  if (!isAllowedImagePath(resolved)) return readImageDataUrl(resolved)
  let stats: fs.Stats
  try {
    stats = fs.statSync(resolved)
  } catch {
    return null
  }
  if (!stats.isFile() || stats.size === 0) return null
  // mtime+size na URL: trocar a imagem com o mesmo nome invalida o cache do Chromium.
  return `${toAtlasMediaUrl(resolved)}&v=${Math.trunc(stats.mtimeMs)}-${stats.size}`
}
