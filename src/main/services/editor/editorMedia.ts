import fs from 'node:fs'
import path from 'node:path'
import { nativeImage } from 'electron'
import { getUserDataPath } from '../../paths'
import { runFfmpegResult } from '../audio/ffmpeg'
import { parseFfmpegProbe } from '../media/ffmpegParse'
import { toAtlasMediaUrl } from '../media/localImageUrl'
import { logger } from '../logging/logger'
import { editorRepository } from '../../repositories/editorRepository'
import {
  editorAssetKindFromPath,
  inferEditorAssetOrigin,
  type EditorAsset,
  type EditorAssetKind,
  type EditorAssetOrigin,
  type EditorWaveform,
} from '../../../shared/editor/types'

const THUMB_HEIGHT = 72
/** Lado menor do proxy de edição — 720p deixa scrub mais nítido sem pesar tanto quanto o original. */
const PROXY_SHORT_SIDE = 720
const WAVEFORM_RATE = 4000
const PEAKS_PER_SECOND = 50

export function editorRoot(): string {
  return path.join(getUserDataPath(), 'editor')
}

function assetDir(asset: Pick<EditorAsset, 'projectId' | 'id'>): string {
  return path.join(editorRoot(), asset.projectId, asset.id)
}

export function isInsideEditorRoot(resolved: string): boolean {
  const relative = path.relative(editorRoot().toLowerCase(), resolved.toLowerCase())
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function fileExists(filePath: string | null | undefined): filePath is string {
  if (!filePath) return false
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function coverFilePath(asset: Pick<EditorAsset, 'projectId' | 'id'>): string {
  // v2 = frame do original em ~1440px (a capa antiga/thumbs ficava borrada no card).
  return path.join(assetDir(asset), 'cover-v2.jpg')
}

export function presentEditorAsset(asset: EditorAsset): EditorAsset {
  const available = fileExists(asset.sourcePath)
  const coverPath = coverFilePath(asset)
  return {
    ...asset,
    available,
    url: available ? toAtlasMediaUrl(asset.sourcePath) : null,
    proxyUrl: asset.proxyStatus === 'ready' && fileExists(asset.proxyPath) ? toAtlasMediaUrl(asset.proxyPath) : null,
    thumbsUrl: fileExists(asset.thumbsPath) ? toAtlasMediaUrl(asset.thumbsPath) : null,
    coverUrl: fileExists(coverPath) ? toAtlasMediaUrl(coverPath) : null,
  }
}

type ProbedMedia = {
  kind: EditorAssetKind
  name: string
  duration: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
}

export async function probeEditorMedia(filePath: string): Promise<ProbedMedia> {
  const resolved = path.resolve(filePath)
  if (!fileExists(resolved)) throw new Error(`Arquivo não encontrado: ${path.basename(resolved)}`)
  const kind = editorAssetKindFromPath(resolved)
  if (!kind) throw new Error(`Formato não suportado: ${path.basename(resolved)}`)

  if (kind === 'image') {
    const size = nativeImage.createFromPath(resolved).getSize()
    if (!size.width || !size.height) throw new Error(`Não foi possível ler a imagem ${path.basename(resolved)}.`)
    return { kind, name: path.basename(resolved), duration: 0, width: size.width, height: size.height, fps: 0, hasAudio: false }
  }

  const result = await runFfmpegResult(['-hide_banner', '-i', resolved], {
    timeoutMs: 30_000,
    allowNonZero: true,
    timeoutMessage: 'O FFmpeg demorou demais para ler o arquivo.',
  })
  const info = parseFfmpegProbe(`${result.stderr}\n${result.stdout}`, resolved)
  if (!(info.duration > 0)) throw new Error(`Não foi possível ler a duração de ${info.name}.`)
  if (kind === 'video' && !info.width) throw new Error(`Não foi possível ler o vídeo ${info.name}.`)
  return {
    kind,
    name: info.name,
    duration: info.duration,
    width: info.width,
    height: info.height,
    fps: info.fps,
    hasAudio: kind === 'audio' ? true : info.hasAudio,
  }
}

export async function importEditorMedia(input: {
  projectId: string
  paths: string[]
  origin: EditorAssetOrigin
}): Promise<{ assets: EditorAsset[]; errors: string[] }> {
  const assets: EditorAsset[] = []
  const errors: string[] = []
  for (const raw of input.paths) {
    const sourcePath = path.resolve(String(raw ?? ''))
    try {
      const existing = editorRepository.findAssetBySource(input.projectId, sourcePath)
      if (existing) {
        assets.push(presentEditorAsset(existing))
        continue
      }
      const probe = await probeEditorMedia(sourcePath)
      const created = editorRepository.createAsset({
        projectId: input.projectId,
        kind: probe.kind,
        origin: inferEditorAssetOrigin(sourcePath, input.origin),
        name: probe.name,
        sourcePath,
        duration: probe.duration,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        hasAudio: probe.hasAudio,
      })
      assets.push(presentEditorAsset(created))
      enqueueAssetProcessing(created.id)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { assets, errors }
}

export function removeEditorAssetFiles(asset: Pick<EditorAsset, 'projectId' | 'id'>) {
  fs.rmSync(assetDir(asset), { recursive: true, force: true })
}

export function removeEditorProjectFiles(projectId: string) {
  fs.rmSync(path.join(editorRoot(), projectId), { recursive: true, force: true })
}

// --- processamento em segundo plano (um asset por vez para não travar a máquina) ---

let changeListener: ((asset: EditorAsset) => void) | null = null

export function onEditorAssetChanged(listener: (asset: EditorAsset) => void) {
  changeListener = listener
}

const queue: string[] = []
let processing = false

export function enqueueAssetProcessing(assetId: string) {
  if (!queue.includes(assetId)) queue.push(assetId)
  void drainQueue()
}

/** Reprocessa assets que ficaram sem proxy/miniaturas (app fechado no meio). */
export function resumePendingEditorAssets(projectId: string) {
  for (const asset of editorRepository.listAssets(projectId)) {
    if (!fileExists(asset.sourcePath)) continue
    const needsThumbs = asset.kind !== 'audio' && !fileExists(asset.thumbsPath)
    const needsWave = asset.kind !== 'image' && asset.hasAudio && !fileExists(asset.waveformPath)
    const needsProxy = asset.kind === 'video' && asset.proxyStatus !== 'failed' && !(asset.proxyStatus === 'ready' && fileExists(asset.proxyPath))
    const needsCover = asset.kind === 'video' && !fileExists(coverFilePath(asset))
    if (needsThumbs || needsWave || needsProxy || needsCover) enqueueAssetProcessing(asset.id)
  }
}

async function drainQueue() {
  if (processing) return
  processing = true
  try {
    while (queue.length > 0) {
      const id = queue.shift()!
      try {
        await processAsset(id)
      } catch (error) {
        logger.warn('editor.asset.process_failed', {
          assetId: id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  } finally {
    processing = false
  }
}

function emit(assetId: string) {
  const asset = editorRepository.getAsset(assetId)
  if (asset && changeListener) changeListener(presentEditorAsset(asset))
}

async function processAsset(assetId: string) {
  const asset = editorRepository.getAsset(assetId)
  if (!asset || !fileExists(asset.sourcePath)) return
  const dir = assetDir(asset)
  fs.mkdirSync(dir, { recursive: true })

  if (asset.kind !== 'image' && asset.hasAudio && !fileExists(asset.waveformPath)) {
    try {
      const waveformPath = await buildWaveform(asset.sourcePath, dir)
      editorRepository.updateAssetMedia(asset.id, { waveformPath })
      emit(asset.id)
    } catch (error) {
      logger.warn('editor.asset.waveform_failed', { assetId, error: String(error) })
    }
  }

  if (asset.kind === 'image') {
    if (!fileExists(asset.thumbsPath)) {
      const tile = Math.max(1, Math.round((THUMB_HEIGHT * asset.width) / Math.max(1, asset.height)))
      editorRepository.updateAssetMedia(asset.id, {
        thumbsPath: asset.sourcePath,
        thumbsCount: 1,
        thumbsTileWidth: tile,
      })
      emit(asset.id)
    }
    return
  }

  if (asset.kind !== 'video') return

  let proxyPath = asset.proxyStatus === 'ready' && fileExists(asset.proxyPath) ? asset.proxyPath : null
  if (!proxyPath && asset.proxyStatus !== 'failed') {
    editorRepository.updateAssetMedia(asset.id, { proxyStatus: 'pending' })
    emit(asset.id)
    try {
      proxyPath = await buildProxy(asset, dir)
      editorRepository.updateAssetMedia(asset.id, { proxyStatus: 'ready', proxyPath })
    } catch (error) {
      logger.warn('editor.asset.proxy_failed', { assetId, error: String(error) })
      editorRepository.updateAssetMedia(asset.id, { proxyStatus: 'failed', proxyPath: null })
    }
    emit(asset.id)
  }

  const sourceForStills = proxyPath ?? asset.sourcePath
  if (!fileExists(editorRepository.getAsset(asset.id)?.thumbsPath)) {
    try {
      const thumbs = await buildThumbStrip(sourceForStills, asset.duration, dir)
      editorRepository.updateAssetMedia(asset.id, thumbs)
      emit(asset.id)
    } catch (error) {
      logger.warn('editor.asset.thumbs_failed', { assetId, error: String(error) })
    }
  }

  if (!fileExists(coverFilePath(asset))) {
    try {
      // Capa sempre do original — proxy deixa o card opaco/borrado.
      await buildCoverFrame(asset.sourcePath, asset.duration, dir)
      emit(asset.id)
    } catch (error) {
      logger.warn('editor.asset.cover_failed', { assetId, error: String(error) })
    }
  }
}

async function buildProxy(asset: EditorAsset, dir: string): Promise<string> {
  const output = path.join(dir, 'proxy.mp4')
  const temp = path.join(dir, 'proxy.tmp.mp4')
  fs.rmSync(temp, { force: true })
  // Lado menor em 720px, CRF 23 e keyframe a cada 0,5s: scrub nítido e responsivo.
  const scale = `scale=w='if(gt(iw,ih),-2,min(${PROXY_SHORT_SIDE},iw))':h='if(gt(iw,ih),min(${PROXY_SHORT_SIDE},ih),-2)'`
  const args = [
    '-y',
    '-i',
    asset.sourcePath,
    '-vf',
    `${scale},format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-g',
    '15',
    '-keyint_min',
    '15',
    '-sc_threshold',
    '0',
  ]
  if (asset.hasAudio) args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2')
  else args.push('-an')
  args.push('-movflags', '+faststart', temp)
  await runFfmpegResult(args, {
    timeoutMs: Math.min(60 * 60_000, Math.max(2 * 60_000, Math.round(asset.duration * 3000))),
    timeoutMessage: 'O FFmpeg demorou demais para gerar o proxy de edição.',
    failMessage: 'Falha ao gerar o proxy de edição.',
  })
  if (!fileExists(temp) || fs.statSync(temp).size < 64) throw new Error('Proxy vazio.')
  fs.rmSync(output, { force: true })
  fs.renameSync(temp, output)
  return output
}

/** Frame do arquivo original em alta resolução para cards do Editor. */
async function buildCoverFrame(sourcePath: string, duration: number, dir: string): Promise<string> {
  const output = path.join(dir, 'cover-v2.jpg')
  const temp = path.join(dir, 'cover-v2.tmp.jpg')
  fs.rmSync(temp, { force: true })
  const seek = Math.min(Math.max(0.5, duration * 0.15), Math.max(0, duration - 0.05))
  await runFfmpegResult(
    [
      '-y',
      '-ss',
      seek.toFixed(3),
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-vf',
      "scale='min(1440,iw)':-2:flags=lanczos",
      '-q:v',
      '2',
      temp,
    ],
    {
      timeoutMs: 90_000,
      timeoutMessage: 'O FFmpeg demorou demais para gerar a capa.',
      failMessage: 'Falha ao gerar a capa do vídeo.',
    },
  )
  if (!fileExists(temp) || fs.statSync(temp).size < 32) throw new Error('Capa vazia.')
  fs.rmSync(output, { force: true })
  fs.renameSync(temp, output)
  return output
}

/** Garante capa nítida a partir do original (não usa proxy/thumbs). */
export async function ensureAssetCover(asset: EditorAsset): Promise<string | null> {
  if (asset.kind !== 'video') {
    if (asset.kind === 'image' && fileExists(asset.sourcePath)) return toAtlasMediaUrl(asset.sourcePath)
    return null
  }
  const out = coverFilePath(asset)
  if (fileExists(out)) return toAtlasMediaUrl(out)
  if (!fileExists(asset.sourcePath)) return null
  try {
    await buildCoverFrame(asset.sourcePath, asset.duration, assetDir(asset))
    return fileExists(out) ? toAtlasMediaUrl(out) : null
  } catch (error) {
    logger.warn('editor.asset.cover_ensure_failed', { assetId: asset.id, error: String(error) })
    return null
  }
}

async function buildThumbStrip(
  sourcePath: string,
  duration: number,
  dir: string,
): Promise<{ thumbsPath: string; thumbsCount: number; thumbsTileWidth: number }> {
  const count = Math.max(4, Math.min(60, Math.ceil(duration / 2)))
  const output = path.join(dir, 'thumbs.jpg')
  const rate = (count / Math.max(0.5, duration)).toFixed(5)
  await runFfmpegResult(
    [
      '-y',
      '-i',
      sourcePath,
      '-an',
      '-vf',
      `fps=${rate},scale=-2:${THUMB_HEIGHT},tile=${count}x1`,
      '-frames:v',
      '1',
      '-q:v',
      '5',
      output,
    ],
    {
      timeoutMs: Math.min(20 * 60_000, Math.max(60_000, Math.round(duration * 1500))),
      timeoutMessage: 'O FFmpeg demorou demais para gerar as miniaturas.',
      failMessage: 'Falha ao gerar as miniaturas.',
    },
  )
  const size = nativeImage.createFromPath(output).getSize()
  if (!size.width) throw new Error('Tira de miniaturas vazia.')
  return { thumbsPath: output, thumbsCount: count, thumbsTileWidth: Math.max(1, Math.round(size.width / count)) }
}

async function buildWaveform(sourcePath: string, dir: string): Promise<string> {
  const raw = path.join(dir, 'wave.pcm')
  await runFfmpegResult(
    ['-y', '-i', sourcePath, '-vn', '-ac', '1', '-ar', String(WAVEFORM_RATE), '-f', 's16le', '-c:a', 'pcm_s16le', raw],
    {
      timeoutMs: 10 * 60_000,
      timeoutMessage: 'O FFmpeg demorou demais para ler o áudio.',
      failMessage: 'Falha ao extrair a forma de onda.',
    },
  )
  const buffer = fs.readFileSync(raw)
  fs.rmSync(raw, { force: true })
  const samples = Math.floor(buffer.length / 2)
  const window = Math.max(1, Math.round(WAVEFORM_RATE / PEAKS_PER_SECOND))
  const peaks: number[] = []
  let max = 0
  for (let offset = 0; offset < samples; offset += window) {
    let peak = 0
    const end = Math.min(samples, offset + window)
    for (let index = offset; index < end; index += 1) {
      const value = Math.abs(buffer.readInt16LE(index * 2))
      if (value > peak) peak = value
    }
    peaks.push(peak)
    if (peak > max) max = peak
  }
  const scale = max > 0 ? 1 / max : 0
  const waveform: EditorWaveform = {
    peaksPerSecond: PEAKS_PER_SECOND,
    peaks: peaks.map((value) => Math.round(value * scale * 1000) / 1000),
  }
  const output = path.join(dir, 'waveform.json')
  fs.writeFileSync(output, JSON.stringify(waveform), 'utf8')
  return output
}

export function readEditorWaveform(assetId: string): EditorWaveform | null {
  const asset = editorRepository.getAsset(assetId)
  if (!asset || !fileExists(asset.waveformPath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(asset.waveformPath, 'utf8')) as EditorWaveform
    if (!Array.isArray(parsed.peaks) || !(parsed.peaksPerSecond > 0)) return null
    return parsed
  } catch {
    return null
  }
}
