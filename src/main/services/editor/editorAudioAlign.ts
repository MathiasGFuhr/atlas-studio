import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { cutForScene, sceneNumberFromAsset } from '../../../shared/editor/syncToMusic'
import { alignAudioSegment, scaleNumberedSegmentsToMusic } from '../../../shared/editor/audioAlign'
import {
  pickPreferredAudioPath,
  sceneNumberFromAudioFileName,
} from '../../../shared/editor/numberedAudio'
import type { EditorAsset } from '../../../shared/editor/types'
import type { MusicSegment } from '../../../shared/musicAnalysis'
import { probeAudioDuration } from '../audio/audioProbe'
import { runFfmpegResult } from '../audio/ffmpeg'
import { logger } from '../logging/logger'

const ALIGN_SAMPLE_RATE = 4000

export type EditorAudioAlignPlacement = {
  assetId: string
  start: number
  /** Duração do áudio do trecho na música — usada para cortar o excedente do vídeo. */
  duration: number
  score: number
  sceneNumber: number | null
  needlePath: string
}

export type EditorAudioAlignResult = {
  placements: EditorAudioAlignPlacement[]
  skipped: Array<{ assetId: string; reason: string }>
  musicAssetId: string
}

async function decodeMonoPcm(sourcePath: string, sampleRate = ALIGN_SAMPLE_RATE): Promise<Int16Array> {
  const resolved = path.resolve(sourcePath)
  if (!fs.existsSync(resolved)) throw new Error(`Arquivo não encontrado: ${resolved}`)
  const temp = path.join(os.tmpdir(), `atlas-align-${randomUUID()}.pcm`)
  try {
    await runFfmpegResult(
      [
        '-y',
        '-i',
        resolved,
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(sampleRate),
        '-f',
        's16le',
        '-c:a',
        'pcm_s16le',
        temp,
      ],
      {
        timeoutMs: 5 * 60_000,
        timeoutMessage: 'O FFmpeg demorou demais para ler o áudio do alinhamento.',
        failMessage: 'Não foi possível ler o áudio para alinhar.',
      },
    )
    const buffer = fs.readFileSync(temp)
    const samples = new Int16Array(Math.floor(buffer.length / 2))
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = buffer.readInt16LE(i * 2)
    }
    return samples
  } finally {
    fs.rmSync(temp, { force: true })
  }
}

function listNumberedAudioInDir(dir: string, sceneNumber: number): string | null {
  if (!dir || !fs.existsSync(dir)) return null
  let entries: string[] = []
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return null
  }
  const matches = entries
    .filter((entry) => sceneNumberFromAudioFileName(entry) === sceneNumber)
    .map((entry) => path.join(dir, entry))
  return pickPreferredAudioPath(matches)
}

/** Lista áudios de trecho na pasta (`1.mp3` ou `01 - Trecho 1.mp3`), ordenados. */
export function listNumberedAudioFiles(dir: string): Array<{ scene: number; path: string }> {
  if (!dir || !fs.existsSync(dir)) return []
  let entries: string[] = []
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return []
  }
  const byScene = new Map<number, string[]>()
  for (const entry of entries) {
    const scene = sceneNumberFromAudioFileName(entry)
    if (scene == null) continue
    const list = byScene.get(scene) ?? []
    list.push(path.join(dir, entry))
    byScene.set(scene, list)
  }
  const unique: Array<{ scene: number; path: string }> = []
  for (const scene of [...byScene.keys()].sort((a, b) => a - b)) {
    const preferred = pickPreferredAudioPath(byScene.get(scene) ?? [])
    if (preferred) unique.push({ scene, path: preferred })
  }
  return unique
}

/**
 * Quando a pasta tem 1.mp3, 2.mp3… (cortes em sequência), monta starts/durações
 * encaixados na duração real da música — remove o padding que ia acumulando.
 */
export async function buildCumulativeStartsFromNumberedAudio(
  dir: string,
  musicPath: string,
): Promise<Map<number, { start: number; path: string; duration: number }> | null> {
  const files = listNumberedAudioFiles(dir)
  if (files.length === 0) return null

  const segments: Array<{ scene: number; path: string; duration: number }> = []
  let expected = 1
  for (const file of files) {
    if (file.scene !== expected) {
      if (segments.length === 0 && file.scene > 1) return null
      break
    }
    const duration = await probeAudioDuration(file.path)
    if (duration == null || !(duration > 0)) return null
    segments.push({ scene: file.scene, path: file.path, duration })
    expected += 1
  }
  if (segments.length === 0) return null

  const musicDuration = await probeAudioDuration(musicPath)
  if (musicDuration == null || !(musicDuration > 0)) return null

  const scaled = scaleNumberedSegmentsToMusic({ segments, musicDuration })
  const starts = new Map<number, { start: number; path: string; duration: number }>()
  for (const item of scaled) {
    starts.set(item.scene, { start: item.start, path: item.path, duration: item.duration })
  }
  return starts.size > 0 ? starts : null
}

/** Pastas onde os N.mp3 dos cortes costumam estar (música, projeto, lipsync e pais). */
export function candidateSegmentAudioDirs(input: {
  musicAsset: Pick<EditorAsset, 'sourcePath'>
  videoAssets: Array<Pick<EditorAsset, 'sourcePath'>>
}): string[] {
  const dirs: string[] = []
  const musicDir = path.dirname(input.musicAsset.sourcePath)
  dirs.push(musicDir)
  dirs.push(path.join(musicDir, 'lipsync'))
  dirs.push(path.join(musicDir, 'video'))
  for (const video of input.videoAssets) {
    const videoDir = path.dirname(video.sourcePath)
    dirs.push(videoDir)
    dirs.push(path.dirname(videoDir))
    const base = path.basename(videoDir).toLowerCase()
    if (base === 'lipsync' || base === 'video') {
      dirs.push(path.dirname(videoDir))
    }
  }
  return [...new Set(dirs.map((dir) => path.resolve(dir)).filter(Boolean))]
}

/** Áudio do trecho N ao lado da música / do vídeo (1.mp3, 2.wav…). */
export function resolveSegmentAudioPath(input: {
  videoAsset: Pick<EditorAsset, 'name' | 'sourcePath'>
  musicAsset: Pick<EditorAsset, 'sourcePath'>
}): string | null {
  const scene = sceneNumberFromAsset(input.videoAsset)
  if (scene == null) return null
  const dirs = candidateSegmentAudioDirs({
    musicAsset: input.musicAsset,
    videoAssets: [input.videoAsset],
  })
  for (const dir of dirs) {
    const found = listNumberedAudioInDir(dir, scene)
    if (found) return found
  }
  return null
}

function pickMusicAsset(
  assets: EditorAsset[],
  timelineAudioAssetIds: string[],
): EditorAsset | null {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  for (const id of timelineAudioAssetIds) {
    const asset = byId.get(id)
    if (asset && asset.kind === 'audio' && asset.available !== false) return asset
  }
  return assets.find((asset) => asset.kind === 'audio' && asset.available !== false) ?? null
}

function placementFromCut(input: {
  assetId: string
  sceneNumber: number
  cuts: MusicSegment[]
  needlePath: string
}): EditorAudioAlignPlacement | null {
  const cut = cutForScene(input.cuts, input.sceneNumber)
  if (!cut || !Number.isFinite(cut.start)) return null
  return {
    assetId: input.assetId,
    start: Math.max(0, cut.start),
    duration: Math.max(0.1, cut.end - cut.start),
    score: 1,
    sceneNumber: input.sceneNumber,
    needlePath: input.needlePath,
  }
}

async function resolveCumulativeMap(
  dirs: string[],
  musicPath: string,
): Promise<Map<number, { start: number; path: string; duration: number }> | null> {
  for (const dir of dirs) {
    const cumulative = await buildCumulativeStartsFromNumberedAudio(dir, musicPath)
    if (cumulative) return cumulative
  }
  return null
}

/**
 * Para cada vídeo, posiciona no tempo certo da música:
 * 1) 1.mp3…N.mp3 em sequência (pasta da música / projeto / lipsync);
 * 2) corte N da faixa vinculada (caminho confiável para vídeos do Lipsync);
 * 3) match PCM do áudio do trecho — se falhar e houver corte, usa o corte.
 */
export async function alignEditorVideosToMusic(input: {
  assets: EditorAsset[]
  videoAssetIds: string[]
  timelineAudioAssetIds: string[]
  /** Cortes da faixa vinculada ao projeto do Editor (`Trecho N` → start/end). */
  cuts?: MusicSegment[]
}): Promise<EditorAudioAlignResult> {
  const music = pickMusicAsset(input.assets, input.timelineAudioAssetIds)
  if (!music) {
    throw new Error('Coloque a música (áudio) na timeline para sincronizar os vídeos.')
  }

  const videos = input.videoAssetIds
    .map((id) => input.assets.find((asset) => asset.id === id))
    .filter((asset): asset is EditorAsset => Boolean(asset && asset.kind === 'video'))

  if (videos.length === 0) {
    return { placements: [], skipped: [], musicAssetId: music.id }
  }

  const cuts = Array.isArray(input.cuts) ? input.cuts : []
  const searchDirs = candidateSegmentAudioDirs({ musicAsset: music, videoAssets: videos })
  const cumulative = await resolveCumulativeMap(searchDirs, music.sourcePath)
  const placements: EditorAudioAlignPlacement[] = []
  const skipped: Array<{ assetId: string; reason: string }> = []

  const needPcm = videos.filter((video) => {
    const scene = sceneNumberFromAsset(video)
    if (cumulative && scene != null && cumulative.has(scene)) return false
    if (scene != null && cutForScene(cuts, scene)) return false
    return true
  })

  let haystack: Int16Array | null = null
  const pcmCache = new Map<string, Int16Array>()
  if (needPcm.length > 0) {
    haystack = await decodeMonoPcm(music.sourcePath)
  }

  let mode: 'numbered-scaled' | 'music-cuts' | 'pcm-match' | 'mixed' = 'pcm-match'
  let usedNumbered = false
  let usedCuts = false
  let usedPcm = false

  for (const video of videos) {
    const sceneNumber = sceneNumberFromAsset(video)

    if (cumulative && sceneNumber != null && cumulative.has(sceneNumber)) {
      const entry = cumulative.get(sceneNumber)!
      placements.push({
        assetId: video.id,
        start: entry.start,
        duration: entry.duration,
        score: 1,
        sceneNumber,
        needlePath: entry.path,
      })
      usedNumbered = true
      continue
    }

    if (sceneNumber != null) {
      const fromCut = placementFromCut({
        assetId: video.id,
        sceneNumber,
        cuts,
        needlePath: music.sourcePath,
      })
      if (fromCut) {
        placements.push(fromCut)
        usedCuts = true
        continue
      }
    }

    const companion = resolveSegmentAudioPath({ videoAsset: video, musicAsset: music })
    const needlePath = companion || video.sourcePath
    try {
      if (!haystack) throw new Error('Música não decodificada para alinhamento.')
      let needle = pcmCache.get(needlePath)
      if (!needle) {
        needle = await decodeMonoPcm(needlePath)
        pcmCache.set(needlePath, needle)
      }
      const aligned = alignAudioSegment({
        haystack,
        needle,
        sampleRate: ALIGN_SAMPLE_RATE,
      })
      if (!aligned.ok) {
        if (sceneNumber != null) {
          const fromCut = placementFromCut({
            assetId: video.id,
            sceneNumber,
            cuts,
            needlePath: music.sourcePath,
          })
          if (fromCut) {
            placements.push(fromCut)
            usedCuts = true
            continue
          }
        }
        skipped.push({ assetId: video.id, reason: aligned.reason })
        continue
      }
      const needleDuration =
        (await probeAudioDuration(needlePath)) ?? needle.length / ALIGN_SAMPLE_RATE
      placements.push({
        assetId: video.id,
        start: aligned.offset,
        duration: Math.max(0.1, needleDuration),
        score: aligned.score,
        sceneNumber,
        needlePath,
      })
      usedPcm = true
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (sceneNumber != null) {
        const fromCut = placementFromCut({
          assetId: video.id,
          sceneNumber,
          cuts,
          needlePath: music.sourcePath,
        })
        if (fromCut) {
          placements.push(fromCut)
          usedCuts = true
          continue
        }
      }
      logger.warn('editor.audio_align.failed', { assetId: video.id, needlePath, error: reason })
      skipped.push({ assetId: video.id, reason })
    }
  }

  const modes = [usedNumbered, usedCuts, usedPcm].filter(Boolean).length
  if (modes > 1) mode = 'mixed'
  else if (usedNumbered) mode = 'numbered-scaled'
  else if (usedCuts) mode = 'music-cuts'
  else mode = 'pcm-match'

  placements.sort((a, b) => a.start - b.start || (a.sceneNumber ?? 0) - (b.sceneNumber ?? 0))

  // Soma dos N.mp3 / PCM: encaixa um no outro. Cortes da faixa já têm start/end corretos.
  const musicDuration = (await probeAudioDuration(music.sourcePath)) ?? music.duration
  if (mode === 'numbered-scaled' || mode === 'pcm-match') {
    for (let index = 0; index < placements.length; index += 1) {
      if (index + 1 < placements.length) {
        const abut = Math.max(0.1, placements[index + 1].start - placements[index].start)
        placements[index] = { ...placements[index], duration: abut }
        continue
      }
      const untilEnd = Math.max(0.1, musicDuration - placements[index].start)
      placements[index] = {
        ...placements[index],
        duration: Math.min(placements[index].duration, untilEnd),
      }
    }
  }

  logger.info('editor.audio_align.done', {
    musicAssetId: music.id,
    mode,
    placed: placements.length,
    skipped: skipped.length,
    musicDuration,
    cuts: cuts.length,
  })
  return { placements, skipped, musicAssetId: music.id }
}
