import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const require = createRequire(import.meta.url)

export function resolveFfmpegPath(): string {
  const packaged = path.join(process.resourcesPath ?? '', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  if (app.isPackaged && packaged && fs.existsSync(packaged)) return packaged

  try {
    const fromPackage = require('ffmpeg-static') as string | null
    if (fromPackage && fs.existsSync(fromPackage)) return fromPackage
  } catch {
    /* ignore */
  }

  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

export function runFfmpeg(args: string[], timeoutMs = 120_000): Promise<void> {
  const binary = resolveFfmpegPath()
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('O FFmpeg demorou demais para cortar o áudio.'))
    }, timeoutMs)
    child.stderr?.on('data', (buf: Buffer) => {
      stderr += buf.toString('utf8')
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error('FFmpeg não encontrado. Instale o FFmpeg ou gere o instalador do Atlas de novo.'))
      void error
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim().slice(-400) || 'Falha ao processar o áudio.'))
    })
  })
}
