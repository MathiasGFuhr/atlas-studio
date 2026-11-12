import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { logger } from '../logging/logger'

/** Caminhos típicos do Google Chrome no Windows. */
export function chromeExecutableCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform !== 'win32') {
    return ['google-chrome', 'google-chrome-stable', 'chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  }

  const localAppData = env.LOCALAPPDATA?.trim() || ''
  const programFiles = env.PROGRAMFILES?.trim() || 'C:\\Program Files'
  const programFilesX86 = env['PROGRAMFILES(X86)']?.trim() || 'C:\\Program Files (x86)'

  return [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    localAppData ? path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  ].filter(Boolean)
}

export function resolveChromeExecutable(
  candidates: string[] = chromeExecutableCandidates(),
  existsFn: (filePath: string) => boolean = (filePath) => fs.existsSync(filePath),
): string | null {
  for (const candidate of candidates) {
    if (existsFn(candidate)) return candidate
  }
  return null
}

/**
 * Abre a URL no Google Chrome — nunca no Edge/navegador padrão.
 * A extensão Atlas Flow Bridge roda no Chrome; abrir no Edge quebraria o vínculo.
 */
export async function openInChrome(
  url: string,
  options: {
    resolveExecutable?: () => string | null
    spawnFn?: typeof spawn
  } = {},
): Promise<void> {
  const target = url.trim()
  if (!/^https?:\/\//i.test(target)) {
    throw new Error('URL inválida para abrir no Chrome.')
  }

  const chromePath = (options.resolveExecutable ?? resolveChromeExecutable)()
  if (!chromePath) {
    throw new Error(
      'Google Chrome não encontrado. Instale o Chrome — a integração Flow usa a extensão neste navegador, não no Edge.',
    )
  }

  const spawnFn = options.spawnFn ?? spawn
  await new Promise<void>((resolve, reject) => {
    try {
      const child = spawnFn(chromePath, [target], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      child.once('error', (error) => {
        reject(
          new Error(
            `Não foi possível abrir o Google Chrome: ${error.message}. A integração Flow não usa o Edge.`,
          ),
        )
      })
      child.unref()
      logger.info('flow.open_chrome', { host: safeHost(target), chromePath })
      resolve()
    } catch (error) {
      reject(
        error instanceof Error
          ? error
          : new Error('Não foi possível abrir o Google Chrome.'),
      )
    }
  })
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'invalid'
  }
}
