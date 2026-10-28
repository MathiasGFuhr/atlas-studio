import fs from 'node:fs'
import path from 'node:path'
import { getUserDataPath } from '../../paths'
import { LIPSYNC_AUDIO_EXTENSIONS } from '../../../shared/lipSyncRefs'
import { sanitizeWindowsFolderName } from './projectFolders'

const MAX_BYTES = 12 * 1024 * 1024
const MAX_AUDIO_BYTES = 200 * 1024 * 1024
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const ARCHIVE_SUBDIR = 'Lipsync'

function refsDir(): string {
  return path.join(getUserDataPath(), 'lipsync-refs')
}

function projectLipsyncDir(projectFolder: string): string {
  return path.join(path.resolve(projectFolder), ARCHIVE_SUBDIR)
}

function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  const relative = path.relative(resolvedRoot, resolvedCandidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
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
  if (path.resolve(resolved) !== path.resolve(dest)) {
    fs.copyFileSync(resolved, dest)
  }
  return dest
}

export function importLipSyncAudio(sourcePath: string, refId: string): string {
  const resolved = path.resolve(sourcePath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error('Arquivo de áudio não encontrado.')
  }
  const ext = path.extname(resolved).toLowerCase()
  if (!LIPSYNC_AUDIO_EXTENSIONS.includes(ext)) {
    throw new Error('Use um áudio WAV, MP3, M4A, AAC, OGG ou FLAC.')
  }
  const size = fs.statSync(resolved).size
  if (size <= 0) throw new Error('O arquivo de áudio está vazio.')
  if (size > MAX_AUDIO_BYTES) {
    throw new Error('O áudio deve ter no máximo 200 MB.')
  }

  const destDir = refsDir()
  fs.mkdirSync(destDir, { recursive: true })
  for (const other of LIPSYNC_AUDIO_EXTENSIONS) {
    const stale = path.join(destDir, `${refId}-audio${other}`)
    if (other !== ext && fs.existsSync(stale)) fs.unlinkSync(stale)
  }
  const dest = path.join(destDir, `${refId}-audio${ext}`)
  if (path.resolve(resolved) !== path.resolve(dest)) {
    fs.copyFileSync(resolved, dest)
  }
  return dest
}

export function archiveLipSyncRefToProjectFolder(input: {
  sourceImagePath: string
  sourceAudioPath?: string
  projectFolder: string
  label: string
  prompt: string
  lyrics?: string
  refId: string
}): { imagePath: string; promptPath: string } {
  const sourceRaw = input.sourceImagePath?.trim() ?? ''
  const source = sourceRaw ? path.resolve(sourceRaw) : ''
  const hasImage = Boolean(source) && fs.existsSync(source) && fs.statSync(source).isFile()

  const destDir = projectLipsyncDir(input.projectFolder)
  fs.mkdirSync(destDir, { recursive: true })

  const ext = hasImage ? path.extname(source).toLowerCase() || '.png' : ''
  const baseName = sanitizeWindowsFolderName(input.label || 'Cena', 'Cena')
  let stem = baseName
  let attempt = 2
  let target = scenePaths(destDir, stem, ext)
  while (sceneNameTaken(target, source)) {
    stem = `${baseName}-${input.refId.slice(0, 8)}`
    if (attempt > 2) stem = `${baseName}-${input.refId.slice(0, 8)}-${attempt}`
    target = scenePaths(destDir, stem, ext)
    attempt += 1
    if (attempt > 999) throw new Error('Não foi possível criar um nome único na pasta do projeto.')
  }

  if (hasImage && target.imagePath && !isSameFile(source, target.imagePath)) {
    fs.copyFileSync(source, target.imagePath)
  }

  const audioSource = input.sourceAudioPath?.trim() ? path.resolve(input.sourceAudioPath.trim()) : ''
  if (audioSource && fs.existsSync(audioSource) && fs.statSync(audioSource).isFile()) {
    const audioTarget = path.join(destDir, `${stem}${path.extname(audioSource).toLowerCase()}`)
    if (!isSameFile(audioSource, audioTarget)) fs.copyFileSync(audioSource, audioTarget)
  }

  fs.writeFileSync(target.promptPath, sceneText(input.prompt, input.lyrics), 'utf8')
  return target
}

function scenePaths(destDir: string, stem: string, ext: string) {
  return {
    imagePath: ext ? path.join(destDir, `${stem}${ext}`) : '',
    promptPath: path.join(destDir, `${stem}.txt`),
  }
}

function sceneNameTaken(target: { imagePath: string; promptPath: string }, source: string) {
  const imageTaken =
    Boolean(target.imagePath) &&
    fs.existsSync(target.imagePath) &&
    !isSameFile(source, target.imagePath)
  if (imageTaken) return true
  if (!fs.existsSync(target.promptPath)) return false
  return !(target.imagePath && source && isSameFile(source, target.imagePath))
}

function sceneText(prompt: string | undefined, lyrics: string | undefined): string {
  const promptText = prompt ?? ''
  const lyricsText = lyrics?.trim() ?? ''
  if (!lyricsText) return promptText
  if (!promptText.trim()) return lyricsText
  return `${promptText.trimEnd()}\n\nTrecho:\n${lyricsText}\n`
}

function isSameFile(a: string, b: string): boolean {
  try {
    return path.resolve(a) === path.resolve(b)
  } catch {
    return false
  }
}

export function removeLipSyncAudio(filePath: string | null | undefined) {
  if (!filePath?.trim()) return
  try {
    const resolved = path.resolve(filePath)
    if (!isPathInside(refsDir(), resolved)) return
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) fs.unlinkSync(resolved)
  } catch {
    /* ignore */
  }
}

export function removeLipSyncImage(
  filePath: string | null | undefined,
  options?: { projectFolder?: string | null },
) {
  if (!filePath?.trim()) return
  try {
    const resolved = path.resolve(filePath)
    const allowedRoots = [refsDir()]
    const projectFolder = options?.projectFolder?.trim()
    if (projectFolder) {
      allowedRoots.push(projectLipsyncDir(projectFolder))
    }

    if (!allowedRoots.some((root) => isPathInside(root, resolved))) return
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      fs.unlinkSync(resolved)
    }

    const promptSibling = resolved.replace(/\.[^.]+$/, '.txt')
    if (
      promptSibling !== resolved &&
      allowedRoots.some((root) => isPathInside(root, promptSibling)) &&
      fs.existsSync(promptSibling) &&
      fs.statSync(promptSibling).isFile()
    ) {
      fs.unlinkSync(promptSibling)
    }
  } catch {
    /* ignore */
  }
}
