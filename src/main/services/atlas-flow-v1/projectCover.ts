export type ProjectCoverCandidate = {
  atlasProjectId: string
  absPath: string
  createdAt: string
}

/**
 * Uma capa por projeto: a imagem gerada mais recente que ainda existe no disco.
 * Projetos sem arquivo ficam de fora.
 */
export function pickLatestExistingCover(
  rows: ProjectCoverCandidate[],
  exists: (absPath: string) => boolean,
): Map<string, string> {
  const ordered = [...rows].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.absPath.localeCompare(a.absPath),
  )
  const chosen = new Map<string, string>()
  for (const row of ordered) {
    const projectId = row.atlasProjectId.trim()
    const absPath = row.absPath.trim()
    if (!projectId || !absPath || chosen.has(projectId)) continue
    if (!exists(absPath)) continue
    chosen.set(projectId, absPath)
  }
  return chosen
}
