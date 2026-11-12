import fs from 'node:fs'
import path from 'node:path'
import { projectRepository } from '../../repositories/projectRepository'
import { resolveComfyDownloadDir } from '../comfy/outputDir'
import { EDITOR_VIDEO_EXTENSIONS, type EditorLipsyncGroup } from '../../../shared/editor/types'

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** Vídeos do Comfy/Lipsync em `{pasta do projeto}/lipsync`, agrupados por projeto. */
export function listEditorLipsyncGroups(): EditorLipsyncGroup[] {
  const groups: EditorLipsyncGroup[] = []
  for (const project of projectRepository.list()) {
    const folder = resolveComfyDownloadDir(project.projectFolderPath)
    if (!folder) continue
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true })
    } catch {
      continue
    }
    const videos = entries
      .filter((entry) => entry.isFile())
      .filter((entry) => EDITOR_VIDEO_EXTENSIONS.includes(path.extname(entry.name).slice(1).toLowerCase()))
      .map((entry) => {
        const filePath = path.join(folder, entry.name)
        const stats = fs.statSync(filePath)
        return {
          path: filePath,
          name: entry.name,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        }
      })
      .filter((video) => video.size > 0)
      .sort((a, b) => collator.compare(a.name, b.name))
    if (videos.length === 0) continue
    groups.push({ projectId: project.id, projectName: project.name, folder, videos })
  }
  return groups.sort((a, b) => collator.compare(a.projectName, b.projectName))
}

export function isEditorLipsyncVideo(filePath: string): boolean {
  const target = path.resolve(filePath).toLowerCase()
  return listEditorLipsyncGroups().some((group) =>
    group.videos.some((video) => path.resolve(video.path).toLowerCase() === target),
  )
}
