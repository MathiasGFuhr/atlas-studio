import fs from 'node:fs'
import path from 'node:path'
import { getUserDataPath } from '../../paths'

const MAX_BYTES = 12 * 1024 * 1024
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

export function flowRefsRoot(): string {
  return path.join(getUserDataPath(), 'flow-refs')
}

export function flowProjectRefsDir(projectId: string): string {
  return path.join(flowRefsRoot(), projectId.trim())
}

export function importFlowReferenceImage(sourcePath: string, projectId: string, refId: string): string {
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

  const destDir = flowProjectRefsDir(projectId)
  fs.mkdirSync(destDir, { recursive: true })
  const dest = path.join(destDir, `${refId}${ext}`)
  if (path.resolve(resolved) !== path.resolve(dest)) {
    fs.copyFileSync(resolved, dest)
  }
  return dest
}

export function removeFlowReferenceImage(filePath: string | null | undefined): void {
  const value = filePath?.trim()
  if (!value) return
  const resolved = path.resolve(value)
  const root = path.resolve(flowRefsRoot())
  const relative = path.relative(root, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return
  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) fs.unlinkSync(resolved)
  } catch {
    /* ignore */
  }
}

export function removeFlowProjectReferenceFiles(projectId: string): void {
  const dir = flowProjectRefsDir(projectId)
  try {
    if (!fs.existsSync(dir)) return
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}
