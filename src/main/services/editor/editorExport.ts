import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { runFfmpegResult } from '../audio/ffmpeg'
import { ffmpegProgressPercent, parseFfmpegProgressTime } from '../media/ffmpegParse'
import { logger } from '../logging/logger'
import { editorRepository } from '../../repositories/editorRepository'
import { buildEditorExportPlan, type EditorExportAssetInput } from '../../../shared/editor/exportPlan'
import {
  EDITOR_EFFECT_ASSET_PREFIX,
  EDITOR_TEXT_ASSET_PREFIX,
  isEffectClip,
  isTextClip,
} from '../../../shared/editor/timelineOps'
import { editorOutputSize, type EditorExportResolution, type EditorTimeline } from '../../../shared/editor/types'

/** Acima disso o grafo vai para arquivo: a linha de comando do Windows tem limite de ~32k. */
const INLINE_FILTER_LIMIT = 6000

/** Retorna o próximo caminho disponível no formato `short 01.mp4`, `short 02.mp4`, etc. */
export function nextShortOutputPath(folderPath: string): string {
  const dir = path.resolve(folderPath)
  fs.mkdirSync(dir, { recursive: true })
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = path.join(dir, `short ${String(index).padStart(2, '0')}.mp4`)
    if (!fs.existsSync(candidate)) return candidate
  }
  return path.join(dir, `short ${Date.now()}.mp4`)
}

export async function exportEditorProject(input: {
  projectId: string
  outputPath: string
  resolution: EditorExportResolution
  onProgress: (percent: number) => void
  timelineOverride?: EditorTimeline
  skipSetLastExport?: boolean
  videoOnly?: boolean
  maxQuality?: boolean
}): Promise<string> {
  const project = editorRepository.getProject(input.projectId)
  if (!project) throw new Error('Projeto de edição não encontrado.')
  const timeline = input.timelineOverride ?? project.timeline

  const assets: Record<string, EditorExportAssetInput> = {}
  const missing: string[] = []
  const used = new Set(
    timeline.clips
      .filter(
        (clip) =>
          !isEffectClip(clip) &&
          !isTextClip(clip) &&
          !clip.assetId.startsWith(EDITOR_EFFECT_ASSET_PREFIX) &&
          !clip.assetId.startsWith(EDITOR_TEXT_ASSET_PREFIX),
      )
      .map((clip) => clip.assetId),
  )
  for (const mark of timeline.watermarks) {
    if (mark.assetId) used.add(mark.assetId)
  }
  for (const asset of editorRepository.listAssets(project.id)) {
    if (!used.has(asset.id)) continue
    if (!fs.existsSync(asset.sourcePath)) {
      missing.push(asset.name)
      continue
    }
    assets[asset.id] = { path: asset.sourcePath, kind: asset.kind, hasAudio: asset.hasAudio }
  }
  if (missing.length > 0) {
    throw new Error(`Arquivos originais não encontrados: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`)
  }

  const size = editorOutputSize(timeline.aspect, input.resolution)
  const outputPath = path.resolve(input.outputPath)
  const workDir = path.join(
    path.dirname(outputPath),
    `.atlas-editor-${project.id.slice(0, 8)}-${randomUUID().slice(0, 8)}`,
  )
  const plan = buildEditorExportPlan({
    timeline,
    assets,
    ...size,
    outputPath,
    videoOnly: input.videoOnly,
    maxQuality: input.maxQuality,
  })

  const args = ['-y', '-hide_banner', ...plan.inputArgs]
  if (plan.filterGraph.length > INLINE_FILTER_LIMIT) {
    fs.mkdirSync(workDir, { recursive: true })
    const scriptPath = path.join(workDir, 'graph.txt')
    fs.writeFileSync(scriptPath, plan.filterGraph, 'utf8')
    args.push('-filter_complex_script', scriptPath)
  } else {
    args.push('-filter_complex', plan.filterGraph)
  }
  args.push(...plan.outputArgs)

  logger.info('editor.export.start', {
    projectId: project.id,
    duration: plan.duration,
    visualClips: plan.visualClipCount,
    audioClips: plan.audioClipCount,
    width: size.width,
    height: size.height,
  })

  let lastPercent = -1
  try {
    await runFfmpegResult(args, {
      timeoutMs: Math.max(15 * 60_000, Math.round(plan.duration * 10_000)),
      timeoutMessage: 'O FFmpeg demorou demais para exportar o vídeo.',
      failMessage: 'Falha ao exportar o vídeo.',
      onStderr: (chunk) => {
        const current = parseFfmpegProgressTime(chunk)
        if (current == null) return
        const percent = ffmpegProgressPercent(current, plan.duration)
        if (percent === lastPercent) return
        lastPercent = percent
        input.onProgress(percent)
      },
    })
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024) {
    throw new Error('O vídeo exportado ficou vazio.')
  }
  if (!input.skipSetLastExport) {
    editorRepository.setLastExport(project.id, outputPath)
  }
  input.onProgress(100)
  return outputPath
}
