import type { MusicTrack } from './musicAnalysis'

export const MUSIC_NO_SINGER_ID = '__sem_cantor__'

export interface MusicSingerGroup {
  id: string
  name: string
  tracks: MusicTrack[]
  cutsCount: number
  captionsCount: number
  latestUpdatedAt: string
}

export function matchesMusicTrackQuery(track: MusicTrack, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    track.name.toLowerCase().includes(q) ||
    (track.channelName?.toLowerCase().includes(q) ?? false)
  )
}

export function groupMusicTracksBySinger(
  tracks: MusicTrack[],
  channels: Array<{ id: string; name: string }> = [],
): MusicSingerGroup[] {
  const channelNames = new Map(channels.map((channel) => [channel.id, channel.name]))
  const map = new Map<string, MusicSingerGroup>()

  for (const track of tracks) {
    const rawChannelId = track.channelId?.trim() || ''
    const knownChannelName = rawChannelId
      ? track.channelName?.trim() || channelNames.get(rawChannelId)?.trim() || ''
      : ''
    const groupId = rawChannelId && knownChannelName ? rawChannelId : rawChannelId || MUSIC_NO_SINGER_ID
    const groupName =
      groupId === MUSIC_NO_SINGER_ID
        ? 'Sem cantor'
        : knownChannelName || 'Cantor'

    const hasCaptions = (track.captions?.length ?? 0) > 0 ? 1 : 0
    const existing = map.get(groupId)
    if (existing) {
      existing.tracks.push(track)
      existing.cutsCount += track.cuts.length
      existing.captionsCount += hasCaptions
      if (track.updatedAt > existing.latestUpdatedAt) {
        existing.latestUpdatedAt = track.updatedAt
      }
      if (existing.name === 'Cantor' && knownChannelName) {
        existing.name = knownChannelName
      }
    } else {
      map.set(groupId, {
        id: groupId,
        name: groupName,
        tracks: [track],
        cutsCount: track.cuts.length,
        captionsCount: hasCaptions,
        latestUpdatedAt: track.updatedAt,
      })
    }
  }

  return [...map.values()]
    .map((group) => ({
      ...group,
      tracks: [...group.tracks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
    .sort((a, b) => {
      if (a.id === MUSIC_NO_SINGER_ID) return 1
      if (b.id === MUSIC_NO_SINGER_ID) return -1
      return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    })
}
