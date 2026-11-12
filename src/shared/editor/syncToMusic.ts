import { sceneNumberFromFileName } from '../lipSyncRefs'
import type { MusicSegment, MusicTrack } from '../musicAnalysis'
import type { EditorAsset, EditorClip, EditorTimeline } from './types'
import { placeClipAt } from './timelineOps'

/** Número da cena a partir do nome do asset (`2.mp4` → 2). */
export function sceneNumberFromAsset(asset: Pick<EditorAsset, 'name' | 'sourcePath'>): number | null {
  const fromName = sceneNumberFromFileName(asset.name)
  if (fromName != null) return fromName
  const base = asset.sourcePath.replace(/^.*[/\\]/, '')
  return sceneNumberFromFileName(base)
}

/** Resolve o corte do trecho N — prefere label `Trecho N` / `N`, senão a posição N na lista. */
export function cutForScene(cuts: MusicSegment[], sceneNumber: number): MusicSegment | null {
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1) return null
  const byLabel = cuts.find((cut) => {
    const label = String(cut.label ?? '').trim()
    const trecho = /(?:trecho|corte|cena)\s*(\d+)/i.exec(label)
    if (trecho != null && Number(trecho[1]) === sceneNumber) return true
    if (/^\d+$/.test(label) && Number(label) === sceneNumber) return true
    return false
  })
  if (byLabel && Number.isFinite(byLabel.start)) return byLabel
  const byIndex = cuts[sceneNumber - 1]
  if (!byIndex || !Number.isFinite(byIndex.start)) return null
  return byIndex
}

/** Tempo na música onde o trecho N deve começar. */
export function cutStartForScene(cuts: MusicSegment[], sceneNumber: number): number | null {
  const cut = cutForScene(cuts, sceneNumber)
  if (!cut) return null
  return Math.max(0, cut.start)
}

function fileBase(filePath: string): string {
  return filePath.replace(/^.*[/\\]/, '').toLowerCase()
}

function stem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').toLowerCase()
}

function trackNameMatches(trackName: string, candidate: string): boolean {
  const name = trackName.trim().toLowerCase()
  const other = candidate.trim().toLowerCase()
  if (!name || !other) return false
  return name === other || name.includes(other) || other.includes(name)
}

function newestTrack(tracks: MusicTrack[]): MusicTrack | null {
  if (tracks.length === 0) return null
  if (tracks.length === 1) return tracks[0]
  return [...tracks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

/** Escolhe a faixa de música cujos cortes guiam a sincronização. */
export function pickMusicTrackForSync(input: {
  tracks: MusicTrack[]
  audioAssets: Array<Pick<EditorAsset, 'name' | 'sourcePath'>>
  lipsyncProjectId?: string | null
  preferredTrackId?: string | null
  projectName?: string | null
}): MusicTrack | null {
  const withCuts = input.tracks.filter((track) => track.cuts.length > 0)
  if (withCuts.length === 0) return null

  if (input.preferredTrackId) {
    const preferred = withCuts.find((track) => track.id === input.preferredTrackId)
    if (preferred) return preferred
  }

  for (const asset of input.audioAssets) {
    const assetPath = asset.sourcePath.toLowerCase()
    const assetBase = fileBase(asset.sourcePath)
    const assetStem = stem(asset.name)
    const match = withCuts.find((track) => {
      const original = track.originalPath.toLowerCase()
      const preview = track.previewPath.toLowerCase()
      const name = track.name.trim().toLowerCase()
      return (
        assetPath === original ||
        assetPath === preview ||
        assetBase === fileBase(track.originalPath) ||
        assetBase === fileBase(track.previewPath) ||
        trackNameMatches(name, assetStem)
      )
    })
    if (match) return match
  }

  const projectName = input.projectName?.trim() || ''
  if (projectName) {
    const byProjectName = withCuts.filter((track) => trackNameMatches(track.name, projectName))
    const named = newestTrack(byProjectName)
    if (named) return named
  }

  if (input.lipsyncProjectId) {
    const inProject = withCuts.filter((track) => track.projectId === input.lipsyncProjectId)
    const linked = newestTrack(inProject)
    if (linked) return linked
  }

  if (withCuts.length === 1) return withCuts[0]
  return null
}

export type SyncClipResult =
  | { ok: true; start: number; sceneNumber: number; trackName: string }
  | { ok: false; reason: string }

/** Onde a música começa na timeline (clip.start do áudio correspondente). */
export function musicClipStartOnTimeline(input: {
  timeline: EditorTimeline
  assets: Map<string, Pick<EditorAsset, 'name' | 'sourcePath' | 'kind'>>
  track: MusicTrack
}): number {
  const original = input.track.originalPath.toLowerCase()
  const preview = input.track.previewPath.toLowerCase()
  const name = input.track.name.trim().toLowerCase()
  for (const clip of input.timeline.clips) {
    const asset = input.assets.get(clip.assetId)
    if (!asset || asset.kind !== 'audio') continue
    const path = asset.sourcePath.toLowerCase()
    const base = fileBase(asset.sourcePath)
    const assetStem = stem(asset.name)
    if (
      path === original ||
      path === preview ||
      base === fileBase(input.track.originalPath) ||
      base === fileBase(input.track.previewPath) ||
      assetStem === name ||
      assetStem.includes(name) ||
      name.includes(assetStem)
    ) {
      return Math.max(0, clip.start)
    }
  }
  return 0
}

export function planClipMusicSync(input: {
  clip: EditorClip
  asset: EditorAsset
  track: MusicTrack
  /** Deslocamento da música na timeline (em geral o start do clipe de áudio). */
  musicOffset?: number
}): SyncClipResult {
  const sceneNumber = sceneNumberFromAsset(input.asset)
  if (sceneNumber == null) {
    return {
      ok: false,
      reason: 'Não deu para identificar o número do trecho (use nomes como 1.mp4, 2.mp4).',
    }
  }
  const cutStart = cutStartForScene(input.track.cuts, sceneNumber)
  if (cutStart == null) {
    return {
      ok: false,
      reason: `Não há corte ${sceneNumber} na música "${input.track.name}".`,
    }
  }
  const offset = Number.isFinite(input.musicOffset) ? Math.max(0, input.musicOffset ?? 0) : 0
  return {
    ok: true,
    start: cutStart + offset,
    sceneNumber,
    trackName: input.track.name,
  }
}

/** Move o clipe para o tempo exato do corte na música (permite buracos na faixa). */
export function syncClipToMusicStart(timeline: EditorTimeline, clipId: string, start: number): EditorTimeline {
  return placeClipAt(timeline, clipId, start)
}
