import { createRequire } from 'node:module'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const require = createRequire(import.meta.url)

export function resolveFfmpegPath(): string {
  const packaged = path.join(process.resourcesPath ?? '', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  if (app?.isPackaged && packaged && fs.existsSync(packaged)) return packaged

  try {
    const fromPackage = require('ffmpeg-static') as string | null
    if (fromPackage && fs.existsSync(fromPackage)) return fromPackage
  } catch {
    /* ignore */
  }

  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

const activeChildren = new Set<ChildProcess>()

/** Encerra exportações/análises em andamento para não deixar ffmpeg.exe órfão ao sair. */
export function killActiveFfmpegProcesses() {
  for (const child of activeChildren) {
    try {
      child.kill()
    } catch {
      /* processo já encerrado */
    }
  }
  activeChildren.clear()
}

export type FfmpegRunOptions = {
  timeoutMs?: number
  timeoutMessage?: string
  failMessage?: string
  allowNonZero?: boolean
  onStderr?: (chunk: string) => void
}

const MAX_STDIO_CHARS = 256 * 1024

function appendCapped(current: string, chunk: string): string {
  const combined = current + chunk
  return combined.length > MAX_STDIO_CHARS ? combined.slice(-MAX_STDIO_CHARS) : combined
}

export function runFfmpegResult(
  args: string[],
  options: FfmpegRunOptions = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const binary = resolveFfmpegPath()
  const timeoutMs = options.timeoutMs ?? 120_000
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true })
    activeChildren.add(child)
    let settled = false
    const cleanup = () => {
      activeChildren.delete(child)
      clearTimeout(timer)
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      try {
        child.kill('SIGKILL')
      } catch {
        try {
          child.kill()
        } catch {
          /* ignore */
        }
      }
      reject(new Error(options.timeoutMessage || 'O FFmpeg demorou demais para cortar o áudio.'))
    }, timeoutMs)
    child.stdout?.on('data', (buf: Buffer) => {
      stdout = appendCapped(stdout, buf.toString('utf8'))
    })
    child.stderr?.on('data', (buf: Buffer) => {
      const chunk = buf.toString('utf8')
      stderr = appendCapped(stderr, chunk)
      try {
        options.onStderr?.(chunk)
      } catch {
        /* callback do chamador não deve derrubar o processo principal */
      }
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('FFmpeg não encontrado. Instale o FFmpeg ou gere o instalador do Atlas de novo.'))
      void error
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      cleanup()
      if (code === 0 || options.allowNonZero) {
        resolve({ code, stdout, stderr })
        return
      }
      reject(new Error(stderr.trim().slice(-400) || options.failMessage || 'Falha ao processar o áudio.'))
    })
  })
}

export function runFfmpeg(args: string[], timeoutMs = 120_000): Promise<void> {
  return runFfmpegResult(args, { timeoutMs }).then(() => undefined)
}
