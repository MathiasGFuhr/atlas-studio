import fs from 'node:fs'
import path from 'node:path'
import type { LipSyncFolderScan } from '../../../shared/lipSyncRefs'
import {
  LIPSYNC_AUDIO_EXTENSIONS,
  LIPSYNC_IMAGE_EXTENSIONS,
  matchNumberedFiles,
  matchNumberedImages,
} from '../../../shared/lipSyncRefs'
import { probeAudioDuration } from '../audio/audioProbe'

const PROBE_CONCURRENCY = 4

function filesWithExtension(root: string, extensions: string[]) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.includes(path.extname(entry.name).toLowerCase()))
    .map((entry) => ({ fileName: entry.name, path: path.join(root, entry.name) }))
}

/**
 * Só o nível de cima da pasta: a subpasta `Lipsync` (arquivo das cenas salvas) fica de fora.
 * As durações dos áudios ficam null aqui; `scanLipSyncFolderWithDurations` as preenche.
 */
export function scanLipSyncFolder(folder: string): LipSyncFolderScan {
  const root = folder?.trim() ? path.resolve(folder.trim()) : ''
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error('Pasta não encontrada.')
  }
  const images = matchNumberedImages(filesWithExtension(root, LIPSYNC_IMAGE_EXTENSIONS))
  const audios = matchNumberedFiles(filesWithExtension(root, LIPSYNC_AUDIO_EXTENSIONS))
  return {
    folder: root,
    ...images,
    audios: audios.matches.map((entry) => ({ ...entry, duration: null })),
    ignoredAudios: audios.ignored,
  }
}

export async function scanLipSyncFolderWithDurations(folder: string): Promise<LipSyncFolderScan> {
  const scan = scanLipSyncFolder(folder)
  const audios = [...scan.audios]
  let next = 0
  async function worker() {
    while (next < audios.length) {
      const index = next
      next += 1
      audios[index] = { ...audios[index], duration: await probeAudioDuration(audios[index].path) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, audios.length) }, worker))
  return { ...scan, audios }
}
