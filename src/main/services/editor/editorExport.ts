import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { runFfmpegResult } from '../audio/ffmpeg'
import { ffmpegProgressPercent, parseFfmpegProgressTime } from '../media/ffmpegParse'
import { logger } from '../logging/logger'
import { editorRepository } from '../../repositories/editorRepository'
import { buildEditorExportPlan, type EditorExportAssetInput } from '../../../shared/editor/exportPlan'
import {
  buildClipCutExportItems,
  buildClipCutFfmpegArgs,
  type ClipCutExportAssetInput,
} from '../../../shared/editor/clipCutExportPlan'
import {
  EDITOR_EFFECT_ASSET_PREFIX,
  EDITOR_TEXT_ASSET_PREFIX,
  isEffectClip,
  isTextClip,
} from '../../../shared/editor/timelineOps'
import {
  editorOutputSize,
  type EditorExportClipsResult,
  type EditorExportResolution,
  type EditorTimeline,
} from '../../../shared/editor/types'

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

/**
 * Exporta cada clipe de vídeo da timeline como um arquivo `.mp4` separado na pasta escolhida,
 * respeitando exatamente o corte (`inPoint`..`outPoint`) de cada cena (pronto para CapCut).
 */
export async function exportEditorClipCuts(input: {
  projectId: string
  outputDir: string
  clipIds?: string[]
  stripAudio?: boolean
  maxQuality?: boolean
  onProgress: (percent: number, message: string) => void
}): Promise<EditorExportClipsResult> {
  const project = editorRepository.getProject(input.projectId)
  if (!project) throw new Error('Projeto de edição não encontrado.')
  const timeline = project.timeline

  const clipFilter =
    Array.isArray(input.clipIds) && input.clipIds.length > 0 ? new Set(input.clipIds) : null
  const visibleVideoTrackIds = new Set(
    timeline.tracks.filter((track) => track.kind === 'video' && !track.hidden).map((track) => track.id),
  )
  const neededAssetIds = new Set(
    timeline.clips
      .filter(
        (clip) =>
          !isEffectClip(clip) &&
          !isTextClip(clip) &&
          visibleVideoTrackIds.has(clip.trackId) &&
          (!clipFilter || clipFilter.has(clip.id)),
      )
      .map((clip) => clip.assetId),
  )

  const assets: Record<string, ClipCutExportAssetInput> = {}
  const missing: string[] = []
  for (const asset of editorRepository.listAssets(project.id)) {
    if (asset.kind !== 'video' || !neededAssetIds.has(asset.id)) continue
    if (!fs.existsSync(asset.sourcePath)) {
      missing.push(asset.name)
      continue
    }
    assets[asset.id] = {
      name: asset.name,
      path: asset.sourcePath,
      kind: asset.kind,
      hasAudio: asset.hasAudio,
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Arquivos originais não encontrados: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
    )
  }

  const items = buildClipCutExportItems({
    timeline,
    assets,
    clipIds: input.clipIds,
  })
  if (items.length === 0) {
    throw new Error('Nenhum clipe de vídeo na timeline para exportar.')
  }

  const outputDir = path.resolve(input.outputDir)
  fs.mkdirSync(outputDir, { recursive: true })
  const stripAudio = Boolean(input.stripAudio)
  const maxQuality = Boolean(input.maxQuality)

  logger.info('editor.export_clips.start', {
    projectId: project.id,
    count: items.length,
    outputDir,
    stripAudio,
    maxQuality,
  })

  const exportedFiles: string[] = []
  let lastReportedPercent = -1

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    const targetPath = path.join(outputDir, item.fileName)
    const tempPath = path.join(outputDir, `.atlas-cut-${randomUUID().slice(0, 8)}.tmp.mp4`)
    const args = buildClipCutFfmpegArgs({
      sourcePath: item.sourcePath,
      outputPath: tempPath,
      inPoint: item.inPoint,
      duration: item.duration,
      hasAudio: item.hasAudio,
      stripAudio,
      maxQuality,
    })

    const basePercent = Math.round((i / items.length) * 100)
    if (basePercent !== lastReportedPercent) {
      lastReportedPercent = basePercent
      input.onProgress(basePercent, `Exportando cena ${i + 1} de ${items.length}...`)
    }

    try {
      await runFfmpegResult(args, {
        timeoutMs: Math.max(2 * 60_000, Math.round(item.duration * 20_000)),
        timeoutMessage: `O FFmpeg demorou demais para exportar a cena ${item.index}.`,
        failMessage: `Falha ao exportar a cena ${item.index} (${item.fileName}).`,
        onStderr: (chunk) => {
          const current = parseFfmpegProgressTime(chunk)
          if (current == null) return
          const clipPercent = ffmpegProgressPercent(current, item.duration)
          const overall = Math.min(99, Math.round(((i + clipPercent / 100) / items.length) * 100))
          if (overall === lastReportedPercent) return
          lastReportedPercent = overall
          input.onProgress(overall, `Exportando cena ${i + 1} de ${items.length} (${overall}%)...`)
        },
      })
      if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size < 256) {
        throw new Error(`O arquivo da cena ${item.index} ficou vazio.`)
      }
      fs.renameSync(tempPath, targetPath)
      exportedFiles.push(targetPath)
    } catch (error) {
      fs.rmSync(tempPath, { force: true })
      throw error
    }
  }

  logger.info('editor.export_clips.done', {
    projectId: project.id,
    count: exportedFiles.length,
    outputDir,
  })
  input.onProgress(100, `${exportedFiles.length} ${exportedFiles.length === 1 ? 'cena exportada' : 'cenas exportadas'}.`)
  return { directory: outputDir, files: exportedFiles }
}
