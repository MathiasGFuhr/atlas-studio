import path from 'node:path'
import { cutForScene, cutStartForScene, sceneNumberFromAsset } from '../../../shared/editor/syncToMusic'
import {
  clipEnd,
  findClip,
  fitClipToMusicDuration,
  insertAssetClip,
  placeClipAt,
  timelineDuration,
} from '../../../shared/editor/timelineOps'
import type { EditorAsset, EditorProject } from '../../../shared/editor/types'
import type { MusicTrack } from '../../../shared/musicAnalysis'
import { editorRepository } from '../../repositories/editorRepository'
import { musicRepository } from '../../repositories/musicRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { buildCumulativeStartsFromNumberedAudio } from './editorAudioAlign'
import { logger } from '../logging/logger'
import { importEditorMedia, presentEditorAsset } from './editorMedia'

export type ComfyEditorIngestResult = {
  project: EditorProject
  asset: EditorAsset
  clipId: string
  sceneNumber: number
  start: number
}

function newestTrack(tracks: MusicTrack[]): MusicTrack | null {
  if (tracks.length === 0) return null
  if (tracks.length === 1) return tracks[0]
  return [...tracks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

function trackNameMatches(trackName: string, candidate: string): boolean {
  const name = trackName.trim().toLowerCase()
  const other = candidate.trim().toLowerCase()
  if (!name || !other) return false
  return name === other || name.includes(other) || other.includes(name)
}

/** Prefere faixa com cortes; senão qualquer faixa do projeto; senão pelo nome. */
export function pickMusicTrackForProject(
  musicProjectId: string,
  preferredTrackId?: string | null,
): MusicTrack | null {
  const linked = musicRepository.list({ projectId: musicProjectId })
  if (preferredTrackId) {
    const preferred =
      linked.find((track) => track.id === preferredTrackId) ??
      musicRepository.get(preferredTrackId) ??
      null
    if (preferred) return preferred
  }

  const withCuts = linked.filter((track) => track.cuts.length > 0)
  const fromProject = newestTrack(withCuts) ?? newestTrack(linked)
  if (fromProject) return fromProject

  const project = projectRepository.get(musicProjectId)
  const projectName = project?.name?.trim() || ''
  if (!projectName) return null
  const byName = musicRepository
    .list()
    .filter((track) => trackNameMatches(track.name, projectName))
  return newestTrack(byName.filter((track) => track.cuts.length > 0)) ?? newestTrack(byName)
}

/** Cria/atualiza o projeto do Editor ligado ao projeto de música e ao cantor. */
export function ensureEditorProjectForMusicProject(
  musicProjectId: string,
  preferredTrackId?: string | null,
): EditorProject | null {
  const id = String(musicProjectId ?? '').trim()
  if (!id) return null
  const musicProject = projectRepository.get(id)
  if (!musicProject) return null

  const track = pickMusicTrackForProject(id, preferredTrackId)
  const existing = editorRepository.findByMusicProjectId(id)
  if (existing) {
    const patch: {
      musicTrackId?: string | null
      channelId?: string | null
      name?: string
    } = {}
    if (track && existing.musicTrackId !== track.id) patch.musicTrackId = track.id
    if (!existing.channelId && musicProject.channelId) patch.channelId = musicProject.channelId
    if (
      musicProject.name.trim() &&
      existing.name.trim() === 'Nova edição' &&
      existing.name !== musicProject.name
    ) {
      patch.name = musicProject.name.trim()
    }
    if (Object.keys(patch).length > 0) {
      return editorRepository.updateProject(existing.id, patch) ?? existing
    }
    return existing
  }

  const name = track?.name.trim() || musicProject.name.trim() || 'Nova edição'
  return editorRepository.createProject({
    name,
    aspect: '9:16',
    musicProjectId: id,
    musicTrackId: track?.id ?? null,
    channelId: musicProject.channelId ?? null,
  })
}

async function ensureMusicOnTimeline(
  project: EditorProject,
  track: MusicTrack,
): Promise<EditorProject> {
  const assets = editorRepository.listAssets(project.id)
  const original = path.resolve(track.originalPath).toLowerCase()
  let musicAsset =
    assets.find((asset) => path.resolve(asset.sourcePath).toLowerCase() === original) ?? null

  if (!musicAsset) {
    if (!track.originalPath) return project
    const imported = await importEditorMedia({
      projectId: project.id,
      paths: [track.originalPath],
      origin: 'file',
    })
    musicAsset = imported.assets[0] ?? null
  }
  if (!musicAsset) return project

  let timeline = editorRepository.getProject(project.id)?.timeline ?? project.timeline
  const onTimeline = timeline.clips.some((clip) => clip.assetId === musicAsset!.id)
  if (!onTimeline) {
    const inserted = insertAssetClip(timeline, musicAsset, { start: 0, exactStart: true })
    timeline = inserted.timeline
    editorRepository.updateProject(project.id, { timeline })
  }
  return editorRepository.getProject(project.id) ?? project
}

/**
 * Garante projeto do Editor + música na timeline para o projeto de Lipsync/música.
 * Chamado ao criar/enviar cortes e ao iniciar lote Comfy.
 */
export async function seedEditorForMusicProject(
  musicProjectId: string,
  preferredTrackId?: string | null,
): Promise<EditorProject | null> {
  const project = ensureEditorProjectForMusicProject(musicProjectId, preferredTrackId)
  if (!project) return null
  const track =
    (project.musicTrackId ? musicRepository.get(project.musicTrackId) : null) ??
    pickMusicTrackForProject(musicProjectId, preferredTrackId)
  if (!track) {
    logger.info('editor.seed.ok_without_music', {
      editorProjectId: project.id,
      musicProjectId,
      channelId: project.channelId,
    })
    return project
  }
  const seeded = await ensureMusicOnTimeline(project, track)
  logger.info('editor.seed.ok', {
    editorProjectId: seeded.id,
    musicProjectId,
    trackId: track.id,
    channelId: seeded.channelId,
  })
  return seeded
}

async function resolvePlacement(input: {
  musicProjectId: string
  track: MusicTrack | null
  sceneNumber: number
  timeline: EditorProject['timeline']
  videoDuration: number
}): Promise<{ start: number; duration: number; source: 'cut' | 'numbered-audio' | 'append' }> {
  if (input.track && input.track.cuts.length > 0) {
    const cut = cutForScene(input.track.cuts, input.sceneNumber)
    const cutStart = cutStartForScene(input.track.cuts, input.sceneNumber)
    if (cut && cutStart != null) {
      return {
        start: cutStart,
        duration: Math.max(0.1, cut.end - cut.start),
        source: 'cut',
      }
    }
  }

  const musicProject = projectRepository.get(input.musicProjectId)
  const folder = musicProject?.projectFolderPath?.trim() || ''
  const musicPath = input.track?.originalPath || ''
  if (folder && musicPath) {
    try {
      const cumulative = await buildCumulativeStartsFromNumberedAudio(folder, musicPath)
      const entry = cumulative?.get(input.sceneNumber)
      if (entry) {
        return { start: entry.start, duration: entry.duration, source: 'numbered-audio' }
      }
    } catch (error) {
      logger.warn('editor.comfy_ingest.numbered_audio_failed', {
        musicProjectId: input.musicProjectId,
        sceneNumber: input.sceneNumber,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    start: Math.max(0, timelineDuration(input.timeline)),
    duration: Math.max(0.1, input.videoDuration || 1),
    source: 'append',
  }
}

/**
 * Quando o Comfy termina um N.mp4: garante o projeto do Editor daquela música,
 * importa o vídeo e posiciona no tempo do corte N (ou fallback).
 */
const ingestQueues = new Map<string, Promise<unknown>>()

function serializeByProject<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = ingestQueues.get(key) ?? Promise.resolve()
  const next = prev.catch(() => undefined).then(fn)
  const tracked = next.finally(() => {
    if (ingestQueues.get(key) === tracked) ingestQueues.delete(key)
  })
  ingestQueues.set(key, tracked)
  return next
}

export async function ingestComfyVideoToEditor(input: {
  musicProjectId: string | null | undefined
  sceneNumber: number
  videoPath: string
}): Promise<ComfyEditorIngestResult | null> {
  const musicProjectId = String(input.musicProjectId ?? '').trim()
  const videoPath = path.resolve(String(input.videoPath ?? ''))
  const sceneNumber = Math.floor(Number(input.sceneNumber))
  if (!musicProjectId || !videoPath || !Number.isInteger(sceneNumber) || sceneNumber < 1) {
    return null
  }
  return serializeByProject(musicProjectId, () =>
    runIngestComfyVideoToEditor({ musicProjectId, sceneNumber, videoPath }),
  )
}

async function runIngestComfyVideoToEditor(input: {
  musicProjectId: string
  sceneNumber: number
  videoPath: string
}): Promise<ComfyEditorIngestResult | null> {
  const { musicProjectId, videoPath, sceneNumber } = input

  let project = ensureEditorProjectForMusicProject(musicProjectId)
  if (!project) {
    logger.info('editor.comfy_ingest.skip_no_project', { musicProjectId, sceneNumber })
    return null
  }

  const track =
    (project.musicTrackId ? musicRepository.get(project.musicTrackId) : null) ??
    pickMusicTrackForProject(musicProjectId)
  if (track) {
    project = await ensureMusicOnTimeline(project, track)
  } else {
    logger.info('editor.comfy_ingest.no_music_track', { musicProjectId, sceneNumber })
  }

  const imported = await importEditorMedia({
    projectId: project.id,
    paths: [videoPath],
    origin: 'lipsync',
  })
  const asset = imported.assets[0]
  if (!asset) {
    logger.warn('editor.comfy_ingest.import_failed', {
      musicProjectId,
      sceneNumber,
      errors: imported.errors,
    })
    return null
  }

  // Recarrega timeline depois do import (música pode ter entrado).
  project = editorRepository.getProject(project.id) ?? project
  let timeline = project.timeline
  const placement = await resolvePlacement({
    musicProjectId,
    track,
    sceneNumber,
    timeline,
    videoDuration: asset.duration,
  })

  const existingClip = timeline.clips.find((clip) => clip.assetId === asset.id)
  let clipId = existingClip?.id ?? null
  if (clipId) {
    timeline = placeClipAt(timeline, clipId, placement.start)
  } else {
    const inserted = insertAssetClip(timeline, asset, { start: placement.start, exactStart: true })
    timeline = inserted.timeline
    clipId = inserted.clipId
  }

  // Evita empilhar clipes de áudio do vídeo lipsync por cima da música: silencia áudio do clipe de vídeo.
  const clip = findClip(timeline, clipId)
  if (clip && !clip.muted) {
    timeline = {
      ...timeline,
      clips: timeline.clips.map((item) => (item.id === clipId ? { ...item, muted: true } : item)),
    }
  }

  // Corta o excedente do vídeo para ficar só o trecho da música.
  if (clipId) timeline = fitClipToMusicDuration(timeline, clipId, placement.duration)

  const updated = editorRepository.updateProject(project.id, { timeline })
  if (!updated || !clipId) return null

  logger.info('editor.comfy_ingest.ok', {
    editorProjectId: updated.id,
    sceneNumber,
    start: placement.start,
    placementSource: placement.source,
    clipEnd: clipEnd(findClip(updated.timeline, clipId)!),
    asset: asset.name,
    channelId: updated.channelId,
  })

  return {
    project: updated,
    asset: presentEditorAsset(asset),
    clipId,
    sceneNumber,
    start: placement.start,
  }
}

/** Confirma se o nome do arquivo bate com a cena (defesa extra). */
export function sceneNumberFromComfyPath(filePath: string, fallback: number): number {
  const fromName = sceneNumberFromAsset({ name: path.basename(filePath), sourcePath: filePath })
  return fromName ?? fallback
}
