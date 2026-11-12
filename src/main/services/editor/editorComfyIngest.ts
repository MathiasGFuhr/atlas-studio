import path from 'node:path'
import { cutForScene, cutStartForScene, sceneNumberFromAsset } from '../../../shared/editor/syncToMusic'
import {
  clipEnd,
  findClip,
  fitClipToMusicDuration,
  insertAssetClip,
  placeClipAt,
} from '../../../shared/editor/timelineOps'
import type { EditorAsset, EditorProject } from '../../../shared/editor/types'
import type { MusicTrack } from '../../../shared/musicAnalysis'
import { editorRepository } from '../../repositories/editorRepository'
import { musicRepository } from '../../repositories/musicRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { logger } from '../logging/logger'
import { importEditorMedia, presentEditorAsset } from './editorMedia'

export type ComfyEditorIngestResult = {
  project: EditorProject
  asset: EditorAsset
  clipId: string
  sceneNumber: number
  start: number
}

function pickMusicTrack(musicProjectId: string, preferredTrackId?: string | null): MusicTrack | null {
  const tracks = musicRepository.list({ projectId: musicProjectId }).filter((track) => track.cuts.length > 0)
  if (tracks.length === 0) return null
  if (preferredTrackId) {
    const preferred = tracks.find((track) => track.id === preferredTrackId)
    if (preferred) return preferred
  }
  return [...tracks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

function ensureEditorProject(musicProjectId: string, track: MusicTrack): EditorProject {
  const existing = editorRepository.findByMusicProjectId(musicProjectId)
  if (existing) {
    const musicProject = projectRepository.get(musicProjectId)
    const patch: { musicTrackId?: string; channelId?: string | null } = {}
    if (existing.musicTrackId !== track.id) patch.musicTrackId = track.id
    if (!existing.channelId && musicProject?.channelId) patch.channelId = musicProject.channelId
    if (Object.keys(patch).length > 0) {
      return editorRepository.updateProject(existing.id, patch) ?? existing
    }
    return existing
  }

  const musicProject = projectRepository.get(musicProjectId)
  const name = track.name.trim() || musicProject?.name?.trim() || 'Nova edição'
  return editorRepository.createProject({
    name,
    aspect: '9:16',
    musicProjectId,
    musicTrackId: track.id,
    channelId: musicProject?.channelId ?? null,
  })
}

async function ensureMusicOnTimeline(project: EditorProject, track: MusicTrack): Promise<EditorProject> {
  const assets = editorRepository.listAssets(project.id)
  const original = path.resolve(track.originalPath).toLowerCase()
  let musicAsset =
    assets.find((asset) => path.resolve(asset.sourcePath).toLowerCase() === original) ?? null

  if (!musicAsset) {
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
 * Quando o Comfy termina um N.mp4: garante o projeto do Editor daquela música,
 * importa o vídeo e posiciona no tempo do corte N.
 */
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

  const track = pickMusicTrack(musicProjectId)
  if (!track) {
    logger.info('editor.comfy_ingest.skip_no_cuts', { musicProjectId, sceneNumber })
    return null
  }

  const cut = cutForScene(track.cuts, sceneNumber)
  const cutStart = cutStartForScene(track.cuts, sceneNumber)
  if (!cut || cutStart == null) {
    logger.info('editor.comfy_ingest.skip_no_cut', { musicProjectId, sceneNumber, trackId: track.id })
    return null
  }
  const cutDuration = Math.max(0.1, cut.end - cut.start)

  let project = ensureEditorProject(musicProjectId, track)
  project = await ensureMusicOnTimeline(project, track)

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
  const existingClip = timeline.clips.find((clip) => clip.assetId === asset.id)
  let clipId = existingClip?.id ?? null
  if (clipId) {
    timeline = placeClipAt(timeline, clipId, cutStart)
  } else {
    const inserted = insertAssetClip(timeline, asset, { start: cutStart, exactStart: true })
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
  if (clipId) timeline = fitClipToMusicDuration(timeline, clipId, cutDuration)

  const updated = editorRepository.updateProject(project.id, { timeline })
  if (!updated || !clipId) return null

  logger.info('editor.comfy_ingest.ok', {
    editorProjectId: updated.id,
    sceneNumber,
    start: cutStart,
    clipEnd: clipEnd(findClip(updated.timeline, clipId)!),
    asset: asset.name,
  })

  return {
    project: updated,
    asset: presentEditorAsset(asset),
    clipId,
    sceneNumber,
    start: cutStart,
  }
}

/** Confirma se o nome do arquivo bate com a cena (defesa extra). */
export function sceneNumberFromComfyPath(filePath: string, fallback: number): number {
  const fromName = sceneNumberFromAsset({ name: path.basename(filePath), sourcePath: filePath })
  return fromName ?? fallback
}
