/**
 * Relação permanente: vídeo musical ↔ projeto de Música, por ID.
 * Título só entra na criação automática e no backfill inicial.
 */

export type MusicProjectMatchCandidate = {
  id: string
  name: string
  channelId: string | null
  folderPath: string | null
  linkedVideoId: string | null
}

export type MusicVideoMatchInput = {
  title: string
  channelId: string
  folderPath?: string | null
  songTitle?: string | null
}

export function resolveMusicProjectName(input: {
  title: string
  songTitle?: string | null
}): string {
  const song = input.songTitle?.trim()
  if (song) return song
  return input.title.trim()
}

export function normalizeMusicMatchKey(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
}

export function normalizeFolderMatchKey(value: string): string {
  return value.trim().replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function musicNamesMatchUnequivocally(a: string, b: string): boolean {
  const left = normalizeMusicMatchKey(a)
  const right = normalizeMusicMatchKey(b)
  return Boolean(left) && left === right
}

function isCompatibleChannel(candidate: MusicProjectMatchCandidate, channelId: string): boolean {
  return !candidate.channelId || candidate.channelId === channelId
}

function availableCandidates(
  candidates: MusicProjectMatchCandidate[],
  channelId: string,
): MusicProjectMatchCandidate[] {
  return candidates.filter((candidate) => !candidate.linkedVideoId && isCompatibleChannel(candidate, channelId))
}

/**
 * Casa vídeo musical com projeto existente só quando o vínculo é inequívoco.
 * Ambiguidade (dois candidatos) → não casa. Título parecido não basta.
 */
export function findUnequivocalMusicProject(
  video: MusicVideoMatchInput,
  candidates: MusicProjectMatchCandidate[],
): MusicProjectMatchCandidate | null {
  const pool = availableCandidates(candidates, video.channelId)
  if (pool.length === 0) return null

  const folderKey = video.folderPath?.trim() ? normalizeFolderMatchKey(video.folderPath) : ''
  if (folderKey) {
    const byFolder = pool.filter(
      (candidate) => candidate.folderPath && normalizeFolderMatchKey(candidate.folderPath) === folderKey,
    )
    if (byFolder.length === 1) return byFolder[0]
    if (byFolder.length > 1) return null
  }

  const names = [video.songTitle, video.title]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
  const byName = pool.filter((candidate) =>
    names.some((name) => musicNamesMatchUnequivocally(candidate.name, name)),
  )
  if (byName.length === 1) return byName[0]
  return null
}
