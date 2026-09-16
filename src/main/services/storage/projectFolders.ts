import fs from 'node:fs'
import path from 'node:path'
import type { ProjectType } from '../../../shared/types'
import { settingsRepository, DEFAULT_PROJECTS_ROOT } from '../../repositories/settingsRepository'

const ENVIRONMENT_DIR: Record<ProjectType, string> = {
  history: 'Historia',
  music: 'Musica',
}

/** Nomes que o Windows reserva para dispositivos e recusa como nome de pasta. */
const RESERVED_WINDOWS_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
])

/**
 * Converte o nome do projeto em um nome de pasta aceito pelo Windows.
 * Remove caracteres proibidos, espaços/pontos finais e nomes reservados.
 */
export function sanitizeWindowsFolderName(rawName: string, fallback = 'Projeto'): string {
  let name = String(rawName ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/g, '')
    .trim()

  if (RESERVED_WINDOWS_NAMES.has(name.toUpperCase())) {
    name = `${name}_`
  }

  return name || fallback
}

/** Raiz configurada pelo usuário (Configurações → Projeto) ou o padrão em Documentos. */
export function resolveProjectsRoot(): string {
  const configured = settingsRepository.get().projectsRoot?.trim()
  return configured ? path.resolve(configured) : DEFAULT_PROJECTS_ROOT
}

/** Pasta base de um ambiente: <raiz>/Historia ou <raiz>/Musica. */
export function resolveEnvironmentRoot(projectType: ProjectType): string {
  return path.join(resolveProjectsRoot(), ENVIRONMENT_DIR[projectType])
}

/**
 * Cria a pasta física do projeto. Se já existir uma pasta com o mesmo nome,
 * adiciona um sufixo numérico em vez de reaproveitar a pasta de outro projeto.
 */
export function createProjectFolder(input: { name: string; projectType: ProjectType }): string {
  const environmentRoot = resolveEnvironmentRoot(input.projectType)
  fs.mkdirSync(environmentRoot, { recursive: true })

  const baseName = sanitizeWindowsFolderName(input.name)
  let target = path.join(environmentRoot, baseName)
  let attempt = 2
  while (fs.existsSync(target)) {
    target = path.join(environmentRoot, `${baseName} (${attempt})`)
    attempt += 1
    if (attempt > 999) throw new Error('Não foi possível criar uma pasta única para este projeto.')
  }

  fs.mkdirSync(target, { recursive: true })
  return target
}

export function folderExists(folderPath: string | null | undefined): boolean {
  if (!folderPath?.trim()) return false
  try {
    return fs.statSync(folderPath).isDirectory()
  } catch {
    return false
  }
}
