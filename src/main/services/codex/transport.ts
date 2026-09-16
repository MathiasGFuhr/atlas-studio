import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CodexStatus } from '../../../shared/types'
import { logger } from '../logging/logger'

export type CodexTransportMode = 'app-server' | 'cli-exec' | 'unavailable'

export interface CodexTransport {
  mode: CodexTransportMode
  binaryPath: string | null
}

/**
 * Localiza o Codex. Para geração real preferimos `codex exec` (estável).
 * Só considera disponível se o binário responder a `--version`.
 */
export async function detectCodexTransport(): Promise<CodexTransport> {
  const binary = await resolveCodexBinary()
  if (!binary) {
    return { mode: 'unavailable', binaryPath: null }
  }

  const probe = await runCapture(binary, ['--version'], 5000)
  const output = `${probe.stdout}\n${probe.stderr}`
  if (probe.code !== 0 && !/codex/i.test(output)) {
    logger.warn('codex.probe.failed', { binary, code: probe.code, output: output.slice(0, 200) })
    return { mode: 'unavailable', binaryPath: null }
  }

  logger.info('codex.probe.ok', { binary, version: output.trim().split(/\r?\n/)[0] })
  return { mode: 'cli-exec', binaryPath: binary }
}

async function resolveCodexBinary(): Promise<string | null> {
  const candidates = [
    process.env.CODEX_PATH,
    'codex',
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'codex', 'codex.exe'),
    path.join(process.env.USERPROFILE ?? '', '.local', 'bin', 'codex.exe'),
    path.join(process.env.USERPROFILE ?? '', '.codex', 'bin', 'codex.exe'),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (candidate === 'codex') {
      const which = await runCapture(process.platform === 'win32' ? 'where' : 'which', ['codex'], 3000)
      if (which.code === 0) {
        const first = which.stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean)
        if (first) return first
      }
      continue
    }
    if (existsSync(candidate)) return candidate
  }
  return null
}

export function buildStatus(partial: Partial<CodexStatus> & { connected: boolean }): CodexStatus {
  return {
    connected: partial.connected,
    authenticated: partial.authenticated ?? partial.connected,
    authState: partial.authState ?? (partial.connected ? 'connected' : 'not_authenticated'),
    account: partial.account ?? null,
    model: partial.model ?? null,
    message: partial.message ?? (partial.connected ? 'Pronto' : 'Não vinculado'),
    lastCheckedAt: new Date().toISOString(),
  }
}

export async function runCodexPrompt(options: {
  binaryPath: string
  mode: CodexTransportMode
  prompt: string
  cwd: string
  model?: string
  threadId?: string
  extraReadableDirs?: string[]
  onChunk?: (text: string) => void
  signal?: AbortSignal
}): Promise<string> {
  if (options.mode === 'unavailable') {
    throw new Error('Codex não está instalado neste computador.')
  }

  // App-server permanece disponível, mas o caminho padrão real é cli-exec.
  if (options.mode === 'app-server') {
    return runAppServerTurn(options)
  }

  return runCliExec(options)
}

import { isRealCodexModelId } from './codexModels'

function isLikelyCodexModel(model?: string): boolean {
  return Boolean(model && isRealCodexModelId(model))
}

async function runCliExec(options: {
  binaryPath: string
  prompt: string
  cwd: string
  model?: string
  threadId?: string
  extraReadableDirs?: string[]
  onChunk?: (text: string) => void
  signal?: AbortSignal
}): Promise<string> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'atlas-codex-'))
  const outputFile = path.join(tmpDir, 'last-message.txt')

  const args = [
    'exec',
    '--skip-git-repo-check',
    '--sandbox',
    'danger-full-access',
    '--dangerously-bypass-approvals-and-sandbox',
    '-C',
    options.cwd,
    '-o',
    outputFile,
  ]

  if (isLikelyCodexModel(options.model)) {
    args.push('--model', options.model!.trim())
  }

  for (const dir of options.extraReadableDirs ?? []) {
    if (dir && existsSync(dir)) {
      args.push('--add-dir', dir)
    }
  }

  // Prompt via stdin evita problemas de aspas/Unicode no Windows.
  args.push('-')

  logger.info('codex.exec.start', {
    binaryPath: options.binaryPath,
    cwd: options.cwd,
    threadId: options.threadId ?? null,
    args: args.filter((a) => a !== options.prompt),
  })

  const started = Date.now()

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(options.binaryPath, args, {
        cwd: options.cwd,
        env: { ...process.env },
        windowsHide: true,
      })

      let stdoutBuf = ''
      let stderrBuf = ''

      const onAbort = () => {
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
              windowsHide: true,
              stdio: 'ignore',
            })
          } else {
            child.kill('SIGTERM')
          }
        } catch {
          child.kill()
        }
        reject(new Error('Geração cancelada.'))
      }
      if (options.signal?.aborted) {
        onAbort()
        return
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })

      child.stdin.write(options.prompt, 'utf8')
      child.stdin.end()

      child.stdout.on('data', (buf: Buffer) => {
        const text = buf.toString('utf8')
        stdoutBuf += text
        options.onChunk?.(text)
      })
      child.stderr.on('data', (buf: Buffer) => {
        stderrBuf += buf.toString('utf8')
      })
      child.on('error', (err) => {
        options.signal?.removeEventListener('abort', onAbort)
        reject(err)
      })
      child.on('close', (code) => {
        options.signal?.removeEventListener('abort', onAbort)
        if (options.signal?.aborted) {
          reject(new Error('Geração cancelada.'))
          return
        }
        if (code === 0 || stdoutBuf.trim().length > 0 || existsSync(outputFile)) {
          resolve(stdoutBuf)
          return
        }
        reject(new Error(stderrBuf.trim() || `Codex encerrou com código ${code}`))
      })
    })

    let finalText = ''
    if (existsSync(outputFile)) {
      finalText = readFileSync(outputFile, { encoding: 'utf8' }).trim()
    }
    if (!finalText) {
      finalText = extractFinalFromStdout(stdout)
    }

    logger.info('codex.exec.done', {
      cwd: options.cwd,
      threadId: options.threadId ?? null,
      durationMs: Date.now() - started,
      resultChars: finalText.length,
      status: finalText ? 'ok' : 'empty',
    })

    return finalText
  } catch (error) {
    logger.error('codex.exec.error', {
      cwd: options.cwd,
      threadId: options.threadId ?? null,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

function extractFinalFromStdout(stdout: string): string {
  const trimmed = stdout.trim()
  if (!trimmed) return ''
  // Quando --json não é usado, o stdout pode misturar logs; preferir bloco longo final.
  const lines = trimmed.split(/\r?\n/)
  const meaningful = lines.filter((l) => l.trim() && !/^\s*\[/.test(l))
  return meaningful.join('\n').trim() || trimmed
}

async function runAppServerTurn(options: {
  binaryPath: string
  prompt: string
  cwd: string
  model?: string
  onChunk?: (text: string) => void
  signal?: AbortSignal
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.binaryPath, ['app-server'], {
      cwd: options.cwd,
      env: { ...process.env },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams

    let buffer = ''
    let finalText = ''
    let settled = false

    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      if (err) reject(err)
      else resolve(finalText.trim())
    }

    const onAbort = () => finish(new Error('Geração cancelada.'))
    options.signal?.addEventListener('abort', onAbort, { once: true })

    const send = (payload: unknown) => {
      child.stdin.write(`${JSON.stringify(payload)}\n`)
    }

    const threadId = randomUUID()
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'atlas-studio', version: '1.0.0' } },
    })
    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'thread/start',
      params: { threadId, cwd: options.cwd },
    })
    send({
      jsonrpc: '2.0',
      id: 3,
      method: 'turn/start',
      params: {
        threadId,
        input: [{ type: 'text', text: options.prompt }],
        model: isLikelyCodexModel(options.model) ? options.model : undefined,
      },
    })

    child.stdout.on('data', (buf: Buffer) => {
      buffer += buf.toString('utf8')
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as {
            method?: string
            params?: { delta?: string; text?: string; item?: { text?: string } }
            result?: { text?: string; message?: string }
            error?: { message?: string }
          }

          if (msg.error?.message) {
            finish(new Error(msg.error.message))
            return
          }

          const delta =
            msg.params?.delta ??
            msg.params?.text ??
            msg.params?.item?.text ??
            msg.result?.text ??
            msg.result?.message

          if (typeof delta === 'string' && delta.length > 0) {
            finalText += delta
            options.onChunk?.(delta)
          }

          if (msg.method === 'turn/completed' || msg.method === 'turn/complete') {
            finish()
          }
        } catch {
          finalText += `${line}\n`
          options.onChunk?.(line)
        }
      }
    })

    child.stderr.on('data', () => undefined)
    child.on('error', (err) => finish(err))
    child.on('close', (code) => {
      if (settled) return
      if (finalText.trim()) finish()
      else finish(new Error(`Codex app-server encerrou com código ${code}`))
    })

    setTimeout(() => {
      if (!settled && finalText.trim()) finish()
      else if (!settled) finish(new Error('Timeout aguardando resposta do Codex.'))
    }, 1000 * 60 * 20)
  })
}

function runCapture(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: process.platform === 'win32' && command === 'where',
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve({ code: null, stdout, stderr })
    }, timeoutMs)

    child.stdout?.on('data', (b: Buffer) => {
      stdout += b.toString('utf8')
    })
    child.stderr?.on('data', (b: Buffer) => {
      stderr += b.toString('utf8')
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ code: 1, stdout, stderr })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}
