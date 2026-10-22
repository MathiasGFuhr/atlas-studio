import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getUserDataPath } from '../../paths'
import { runFfmpeg } from '../audio/ffmpeg'
import { logger } from '../logging/logger'

/**
 * Tamanhos aceitos em `atlas-media://...&w=` — valor do lado MENOR da imagem, para o recorte
 * `object-cover` continuar nítido em quadros retrato ou paisagem. Lista fechada: evita gerar
 * um arquivo por tamanho arbitrário.
 */
export const THUMB_WIDTHS = [360, 1080] as const
export type ThumbWidth = (typeof THUMB_WIDTHS)[number]

const MAX_PARALLEL = 2
const MAX_CACHED_FILES = 600
const PRUNE_TO = 400

const pending = new Map<string, Promise<string | null>>()
const queue: Array<() => void> = []
let running = 0
let generatedSincePrune = 0

export function parseThumbWidth(value: string | null): ThumbWidth | null {
  const width = Number(value)
  return (THUMB_WIDTHS as readonly number[]).includes(width) ? (width as ThumbWidth) : null
}

function thumbsDir(): string {
  return path.join(getUserDataPath(), 'image-thumbs')
}

function thumbPath(source: string, stats: fs.Stats, width: number): string {
  const key = crypto
    .createHash('sha1')
    .update(`${source.toLowerCase()}|${Math.trunc(stats.mtimeMs)}|${stats.size}|${width}`)
    .digest('hex')
  // PNG/WebP podem ter transparência; JPEG viraria fundo preto.
  const ext = /\.(png|webp|gif)$/i.test(source) ? '.png' : '.jpg'
  return path.join(thumbsDir(), `${key}${ext}`)
}

function withSlot<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      running += 1
      task()
        .then(resolve, reject)
        .finally(() => {
          running -= 1
          queue.shift()?.()
        })
    }
    if (running < MAX_PARALLEL) start()
    else queue.push(start)
  })
}

function pruneCache() {
  generatedSincePrune = 0
  try {
    const dir = thumbsDir()
    const files = fs
      .readdirSync(dir)
      .map((name) => {
        const full = path.join(dir, name)
        return { full, mtime: fs.statSync(full).mtimeMs }
      })
    if (files.length <= MAX_CACHED_FILES) return
    files.sort((a, b) => a.mtime - b.mtime)
    for (const file of files.slice(0, files.length - PRUNE_TO)) {
      fs.rmSync(file.full, { force: true })
    }
  } catch (error) {
    logger.warn('thumbs.prune_failed', { error: error instanceof Error ? error.message : String(error) })
  }
}

async function generate(source: string, target: string, width: number): Promise<string | null> {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = target.replace(/(\.\w+)$/, `.tmp$1`)
  try {
    await runFfmpeg(
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        source,
        '-vf',
        `scale='if(gt(iw,ih),-2,min(${width},iw))':'if(gt(iw,ih),min(${width},ih),-2)'`,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        tmp,
      ],
      30_000,
    )
    fs.renameSync(tmp, target)
    generatedSincePrune += 1
    if (generatedSincePrune >= 50) pruneCache()
    return target
  } catch (error) {
    fs.rmSync(tmp, { force: true })
    logger.warn('thumbs.generate_failed', {
      source,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/** Gera as miniaturas em segundo plano logo após importar a imagem, antes da tela pedir. */
export function warmImageThumbnails(source: string | null | undefined) {
  if (!source?.trim()) return
  let stats: fs.Stats
  try {
    stats = fs.statSync(source)
  } catch {
    return
  }
  if (!stats.isFile()) return
  for (const width of THUMB_WIDTHS) void getImageThumbnail(path.resolve(source), stats, width)
}

/**
 * Caminho de uma miniatura em cache (gerada pelo ffmpeg fora do processo principal).
 * Retorna null se não der para gerar; quem chama serve o original.
 */
export function getImageThumbnail(source: string, stats: fs.Stats, width: ThumbWidth): Promise<string | null> {
  const target = thumbPath(source, stats, width)
  if (fs.existsSync(target)) return Promise.resolve(target)
  const inFlight = pending.get(target)
  if (inFlight) return inFlight
  const job = withSlot(() => generate(source, target, width)).finally(() => pending.delete(target))
  pending.set(target, job)
  return job
}
