import fs from 'node:fs'
import path from 'node:path'
import type { LipSyncFolderScan } from '../../../shared/lipSyncRefs'
import { LIPSYNC_IMAGE_EXTENSIONS, matchNumberedImages } from '../../../shared/lipSyncRefs'

/** Só o nível de cima da pasta: a subpasta `Lipsync` (arquivo das cenas salvas) fica de fora. */
export function scanLipSyncFolder(folder: string): LipSyncFolderScan {
  const root = folder?.trim() ? path.resolve(folder.trim()) : ''
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error('Pasta não encontrada.')
  }
  const images = fs
    .readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && LIPSYNC_IMAGE_EXTENSIONS.includes(path.extname(entry.name).toLowerCase()),
    )
    .map((entry) => ({ fileName: entry.name, path: path.join(root, entry.name) }))
  return { folder: root, ...matchNumberedImages(images) }
}
