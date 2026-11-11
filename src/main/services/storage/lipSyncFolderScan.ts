import fs from 'node:fs'
import path from 'node:path'
import type { LipSyncFolderScan } from '../../../shared/lipSyncRefs'
import {
  LIPSYNC_AUDIO_EXTENSIONS,
  LIPSYNC_EXCERPT_EXTENSIONS,
  LIPSYNC_IMAGE_EXTENSIONS,
  matchNumberedFiles,
  matchNumberedImages,
  mergeRootAndFolderClips,
  sceneNumberFromFileName,
  takeSceneFolderClip,
} from '../../../shared/lipSyncRefs'
import { probeAudioDuration } from '../audio/audioProbe'

const PROBE_CONCURRENCY = 4

function filesWithExtension(root: string, extensions: string[]) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.includes(path.extname(entry.name).toLowerCase()))
    .map((entry) => ({ fileName: entry.name, path: path.join(root, entry.name) }))
}

function numberedDirectories(root: string) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ fileName: entry.name, path: path.join(root, entry.name) }))
}

function readExcerpt(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim()
}

/**
 * Raiz: `1.png`, `1.mp3`, `Trecho 1.mp3` e `01 - Trecho 1.mp3`.
 * Pasta `01`, `1` ou `Trecho 01`: o áudio de dentro (qualquer nome) e o `.txt` do trecho.
 * A subpasta `lipsync` não é número, então fica de fora.
 * As durações dos áudios ficam null aqui; `scanLipSyncFolderWithDurations` as preenche.
 */
export function scanLipSyncFolder(folder: string): LipSyncFolderScan {
  const root = folder?.trim() ? path.resolve(folder.trim()) : ''
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error('Pasta não encontrada.')
  }
  const images = matchNumberedImages(filesWithExtension(root, LIPSYNC_IMAGE_EXTENSIONS))
  const rootAudios = matchNumberedFiles(filesWithExtension(root, LIPSYNC_AUDIO_EXTENSIONS))
  const rootTexts = matchNumberedFiles(
    filesWithExtension(root, LIPSYNC_EXCERPT_EXTENSIONS)
      .map((file) => ({ ...file, text: readExcerpt(file.path) }))
      .filter((file) => file.text),
  )
  const folders = matchNumberedFiles(numberedDirectories(root))
  const clips = folders.matches.map((entry) => {
    const texts = filesWithExtension(entry.path, LIPSYNC_EXCERPT_EXTENSIONS).map((file) => ({
      ...file,
      text: readExcerpt(file.path),
    }))
    return {
      number: entry.number,
      ...takeSceneFolderClip({
        audios: filesWithExtension(entry.path, LIPSYNC_AUDIO_EXTENSIONS),
        texts,
      }),
    }
  })
  const merged = mergeRootAndFolderClips({
    rootAudios: rootAudios.matches,
    rootTexts: rootTexts.matches,
    folders: clips,
  })
  const duplicateFolders = folders.ignored.filter((name) => sceneNumberFromFileName(name) !== null)
  return {
    folder: root,
    ...images,
    audios: merged.audios,
    ignoredAudios: [...rootAudios.ignored, ...duplicateFolders, ...merged.ignoredAudios].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    ),
    excerpts: merged.excerpts,
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
