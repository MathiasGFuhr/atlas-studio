import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { ShortsTranscriptSource, TranscriptCue } from '../../../shared/shorts'
import { normalizeLanguageCode } from '../../../shared/shortsLanguage'

function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  options?: { shell?: boolean },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: options?.shell ?? process.platform === 'win32',
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

const FASTER_WHISPER_SCRIPT = `
import json
import os
import sys

audio_path, json_path, model_name = sys.argv[1], sys.argv[2], sys.argv[3]
language = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] not in ("", "auto") else None
import av

_av_open = av.open

def _open_audio(*args, **kwargs):
    kwargs.pop("metadata_errors", None)
    return _av_open(*args, **kwargs)

av.open = _open_audio

from faster_whisper import WhisperModel

NON_LYRIC = {
    "musica", "música", "music", "instrumental", "aplausos", "applause",
    "silencio", "silêncio", "silence", "risos", "laughter", "legenda",
    "subtitle", "subtitles", "thanks for watching", "obrigado por assistir",
    "inscreva-se", "subscribe",
}
PUNCT = " .,!?:;()[]{}*-" + chr(34) + chr(39) + chr(0x266A) + chr(0x266B)
PROMPTS = {
    "pt": "Letra de música cantada em português do Brasil.",
    "en": "Sung song lyrics in English.",
}

def folded_token(token):
    return token.lower().strip(PUNCT)

def is_junk(text):
    folded = folded_token(text)
    if not folded:
        return True
    if folded in NON_LYRIC:
        return True
    if folded.startswith("[") and folded.endswith("]"):
        return True
    for junk in NON_LYRIC:
        if junk in folded and len(folded) <= len(junk) + 12:
            return True
    return False

def keep_word(word):
    token = (getattr(word, "word", "") or "").strip()
    if not token or is_junk(token):
        return False
    probability = getattr(word, "probability", None)
    if probability is not None and float(probability) < 0.02:
        return False
    return True

def clean_text(words):
    text = "".join((getattr(word, "word", "") or "") for word in words)
    return " ".join(text.split())

def ends_phrase(word):
    return (getattr(word, "word", "") or "").strip().endswith((",", ".", "?", "!", ";", ":"))

def phrase_cues(words):
    cues = []
    group = []

    def flush():
        if not group:
            return
        text = clean_text(group)
        start = float(group[0].start)
        end = float(group[-1].end)
        group.clear()
        if text and not is_junk(text) and end > start:
            cues.append({"start": round(start, 3), "end": round(end, 3), "text": text})

    for word in words:
        if group:
            gap = float(word.start) - float(group[-1].end)
            span = float(word.end) - float(group[0].start)
            if gap >= 0.45 or span >= 8:
                flush()
        group.append(word)
        if ends_phrase(word) and len(group) >= 3:
            flush()
    flush()
    return cues

def lyric_cues(segment):
    if float(getattr(segment, "avg_logprob", 0) or 0) <= -1.5:
        return []
    if float(getattr(segment, "compression_ratio", 0) or 0) >= 2.4:
        return []
    words = [word for word in (getattr(segment, "words", None) or []) if keep_word(word)]
    if words:
        return phrase_cues(words)
    text = " ".join((segment.text or "").split())
    if not text or is_junk(text):
        return []
    start = float(segment.start)
    end = float(segment.end)
    if end - start > 12 or end <= start:
        return []
    return [{"start": round(start, 3), "end": round(end, 3), "text": text}]

threads = max(4, os.cpu_count() or 4)
model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=threads)
segments, info = model.transcribe(
    audio_path,
    beam_size=5,
    best_of=5,
    patience=1.0,
    temperature=0.0,
    condition_on_previous_text=True,
    initial_prompt=PROMPTS.get(language or "", None),
    language=language,
    word_timestamps=True,
    hallucination_silence_threshold=2.0,
    no_speech_threshold=0.95,
    vad_filter=False,
)
cues = []
for segment in segments:
    for cue in lyric_cues(segment):
        cues.append(cue)
payload = {"language": getattr(info, "language", None), "segments": cues}
with open(json_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False)
`

async function findPython(): Promise<{ command: string; argsPrefix: string[] } | null> {
  const py = await findOnPath(['py', 'py.exe'])
  if (py && !py.toLowerCase().includes('windowsapps')) return { command: py, argsPrefix: ['-3'] }
  const python = await findOnPath(['python', 'python.exe'])
  if (python && !python.toLowerCase().includes('windowsapps')) return { command: python, argsPrefix: [] }
  return null
}

function whisperTimeoutMs(modelName: string): number {
  if (modelName.startsWith('large') || modelName === 'turbo') return 90 * 60_000
  if (modelName.startsWith('medium')) return 60 * 60_000
  if (modelName.startsWith('small')) return 35 * 60_000
  return 20 * 60_000
}

async function transcribeWithFasterWhisper(
  audioPath: string,
  outputDir: string,
  language: string | null,
  modelName: string,
): Promise<{ cues: TranscriptCue[]; language: string | null; detail: string | null }> {
  const python = await findPython()
  if (!python) return { cues: [], language: null, detail: null }
  const scriptPath = path.join(outputDir, 'faster_whisper_transcribe.py')
  const jsonPath = path.join(outputDir, 'faster-whisper.json')
  fs.writeFileSync(scriptPath, FASTER_WHISPER_SCRIPT.trimStart(), 'utf8')
  const result = await runCommand(
    python.command,
    [...python.argsPrefix, scriptPath, audioPath, jsonPath, modelName, language || 'auto'],
    whisperTimeoutMs(modelName),
    { shell: false },
  )
  if (fs.existsSync(jsonPath)) {
    const parsed = parseWhisperTranscript(fs.readFileSync(jsonPath, 'utf8'))
    if (parsed.cues.length > 0) return { cues: parsed.cues, language: parsed.language, detail: null }
  }
  const stderr = `${result.stderr}\n${result.stdout}`.trim()
  if (/No module named ['"]?faster_whisper|ModuleNotFoundError/i.test(stderr)) {
    return {
      cues: [],
      language: null,
      detail: 'O modelo de legenda não está instalado no Python. Rode: py -3 -m pip install faster-whisper',
    }
  }
  if (stderr) {
    const tail = stderr
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-3)
      .join(' ')
    return { cues: [], language: null, detail: `Não foi possível gerar a legenda. ${tail}` }
  }
  return { cues: [], language: null, detail: null }
}

export async function transcribeLocalAudio(
  audioPath: string,
  outputDir: string,
  options?: { language?: string | null; model?: string | null },
): Promise<{ cues: TranscriptCue[]; source: ShortsTranscriptSource; language: string | null; detail?: string | null }> {
  fs.mkdirSync(outputDir, { recursive: true })
  const modelName = (options?.model || 'medium').trim() || 'medium'
  const faster = await transcribeWithFasterWhisper(
    audioPath,
    outputDir,
    options?.language ?? null,
    modelName,
  )
  if (faster.cues.length > 0) {
    return { cues: faster.cues, source: 'whisper', language: faster.language, detail: null }
  }
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

  return { cues: [], source: 'none', language: null, detail: faster.detail }
}
