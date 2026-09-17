import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { ShortsTranscriptSource, TranscriptCue } from '../../../shared/shorts'
import { normalizeLanguageCode } from '../../../shared/shortsLanguage'

function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: process.platform === 'win32',
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve({ code: 1, stdout, stderr: stderr + '\ntimeout' })
    }, timeoutMs)
    child.stdout?.on('data', (buf: Buffer) => {
      stdout += buf.toString('utf8')
    })
    child.stderr?.on('data', (buf: Buffer) => {
      stderr += buf.toString('utf8')
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

async function findOnPath(names: string[]): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  for (const name of names) {
    const result = await runCommand(cmd, [name], 8_000)
    const found = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (result.code === 0 && found) return found
  }
  return null
}

function asCues(value: unknown): TranscriptCue[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const start = Number(record.start)
      const end = Number(record.end)
      const text = String(record.text ?? '').trim()
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) return null
      return { start, end, text }
    })
    .filter((item): item is TranscriptCue => Boolean(item))
}

export function extractWhisperLanguage(parsed: Record<string, unknown>): string | null {
  const nested = parsed.result && typeof parsed.result === 'object' ? (parsed.result as Record<string, unknown>) : null
  return (
    normalizeLanguageCode(String(parsed.language ?? '')) ||
    normalizeLanguageCode(String(parsed.detected_language ?? '')) ||
    normalizeLanguageCode(String(nested?.language ?? '')) ||
    null
  )
}

export function parseWhisperTranscript(raw: string): { cues: TranscriptCue[]; language: string | null } {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const language = extractWhisperLanguage(parsed)
    const segments = asCues(parsed.segments)
    if (segments.length > 0) return { cues: segments, language }
    const transcription = Array.isArray(parsed.transcription) ? parsed.transcription : []
    const cues = transcription
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const record = item as Record<string, unknown>
        const offsets = record.offsets as { from?: number; to?: number } | undefined
        const start = offsets?.from != null ? Number(offsets.from) / 1000 : Number(record.start)
        const end = offsets?.to != null ? Number(offsets.to) / 1000 : Number(record.end)
        const text = String(record.text ?? '').trim()
        if (!Number.isFinite(start) || !Number.isFinite(end) || !text) return null
        return { start, end, text }
      })
      .filter((item): item is TranscriptCue => Boolean(item))
    return { cues, language }
  } catch {
    return { cues: [], language: null }
  }
}

export function parseWhisperJson(raw: string): TranscriptCue[] {
  return parseWhisperTranscript(raw).cues
}

export function cuesFromSilence(
  duration: number,
  silence: Array<{ start: number; end: number }>,
): TranscriptCue[] {
  const cues: TranscriptCue[] = []
  let cursor = 0
  for (const gap of silence) {
    if (gap.start - cursor >= 0.8) {
      cues.push({ start: cursor, end: gap.start, text: '' })
    }
    cursor = Math.max(cursor, gap.end)
  }
  if (duration - cursor >= 0.8) cues.push({ start: cursor, end: duration, text: '' })
  return cues
}

export async function transcribeLocalAudio(
  audioPath: string,
  outputDir: string,
): Promise<{ cues: TranscriptCue[]; source: ShortsTranscriptSource; language: string | null }> {
  fs.mkdirSync(outputDir, { recursive: true })
  const whisper = await findOnPath(['whisper', 'whisper.exe'])
  if (whisper) {
    const result = await runCommand(
      whisper,
      [audioPath, '--output_format', 'json', '--output_dir', outputDir, '--fp16', 'False'],
      12 * 60_000,
    )
    const jsonPath = path.join(outputDir, `${path.basename(audioPath, path.extname(audioPath))}.json`)
    if (fs.existsSync(jsonPath)) {
      const parsed = parseWhisperTranscript(fs.readFileSync(jsonPath, 'utf8'))
      if (parsed.cues.length > 0) return { cues: parsed.cues, source: 'whisper', language: parsed.language }
    }
    const fromStdout = parseWhisperTranscript(result.stdout)
    if (fromStdout.cues.length > 0) {
      return { cues: fromStdout.cues, source: 'whisper', language: fromStdout.language }
    }
  }

  const whisperCli = await findOnPath(['whisper-cli', 'whisper-cli.exe', 'main', 'whisper.cpp'])
  if (whisperCli) {
    const jsonOut = path.join(outputDir, 'whisper-cli.json')
    await runCommand(whisperCli, ['-f', audioPath, '-l', 'auto', '-oj', '-of', jsonOut.replace(/\.json$/, '')], 12 * 60_000)
    const candidate = fs.existsSync(`${jsonOut}`) ? jsonOut : `${jsonOut}.json`
    if (fs.existsSync(candidate)) {
      const parsed = parseWhisperTranscript(fs.readFileSync(candidate, 'utf8'))
      if (parsed.cues.length > 0) return { cues: parsed.cues, source: 'whisper', language: parsed.language }
    }
  }

  return { cues: [], source: 'none', language: null }
}
