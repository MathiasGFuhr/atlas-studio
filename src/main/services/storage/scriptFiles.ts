import fs from 'node:fs'
import path from 'node:path'

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
}

/**
 * Salva versões em scripts_path/gerados/NNN-slug/script-vN.md
 * Nunca sobrescreve versões anteriores.
 */
export function saveScriptToFilesystem(options: {
  /** Preferencial: pasta de roteiros do nicho (scripts_path). */
  scriptsPath?: string | null
  /** Fallback legado: workspace do Atlas. */
  workspaceRoot: string
  nicheSlug: string
  title: string
  content: string
  versionNumber: number
  existingFolder?: string
  /** Geração pode criar pasta; ajuste nunca. */
  allowCreateFolder?: boolean
  metadata: Record<string, unknown>
}): { folder: string; versionFile: string } {
  const geradosRoot = options.scriptsPath?.trim()
    ? path.join(path.resolve(options.scriptsPath), 'gerados')
    : path.join(options.workspaceRoot, 'projects', options.nicheSlug, 'scripts')

  fs.mkdirSync(geradosRoot, { recursive: true })

  let folder = options.existingFolder
  if (!folder || !fs.existsSync(folder)) {
    if (options.allowCreateFolder === false) {
      throw new Error('Ajuste de roteiro não pode criar uma nova pasta.')
    }
    const entries = fs.existsSync(geradosRoot)
      ? fs.readdirSync(geradosRoot, { encoding: 'utf8' }).filter((name) => {
          try {
            return fs.statSync(path.join(geradosRoot, name)).isDirectory()
          } catch {
            return false
          }
        })
      : []
    const nextIndex = String(entries.length + 1).padStart(3, '0')
    folder = path.join(geradosRoot, `${nextIndex}-${slugify(options.title) || 'roteiro'}`)
  }

  fs.mkdirSync(folder, { recursive: true })
  const versionFile = path.join(folder, `script-v${options.versionNumber}.md`)
  if (fs.existsSync(versionFile)) {
    throw new Error(`Arquivo de versão já existe e não será sobrescrito: ${versionFile}`)
  }
  fs.writeFileSync(versionFile, options.content, { encoding: 'utf8' })

  const metadataPath = path.join(folder, 'metadata.json')
  const previous = fs.existsSync(metadataPath)
    ? (JSON.parse(fs.readFileSync(metadataPath, { encoding: 'utf8' })) as Record<string, unknown>)
    : {}
  const metadata = {
    ...previous,
    ...options.metadata,
    title: options.title,
    latestVersion: options.versionNumber,
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), { encoding: 'utf8' })

  return { folder, versionFile }
}

export function exportScriptFile(options: {
  title: string
  content: string
  format: 'txt' | 'md'
  targetPath: string
}) {
  const body = options.format === 'md' ? options.content : options.content
  fs.writeFileSync(options.targetPath, body, { encoding: 'utf8' })
}
