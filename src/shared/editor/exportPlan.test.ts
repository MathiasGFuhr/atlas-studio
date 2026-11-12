import { describe, expect, it } from 'vitest'
import { buildEditorExportPlan } from './exportPlan'
import {
  addTrack,
  createEmptyTimeline,
  insertAssetClip,
  insertEffectClip,
  insertTextClip,
  updateClip,
  updateTrack,
} from './timelineOps'

const assets = {
  base: { path: 'C:\\v\\base.mp4', kind: 'video' as const, hasAudio: true },
  over: { path: 'C:\\v\\logo.png', kind: 'image' as const, hasAudio: false },
  song: { path: 'C:\\a\\song.mp3', kind: 'audio' as const, hasAudio: true },
}

function sample() {
  let timeline = createEmptyTimeline('9:16')
  timeline = insertAssetClip(timeline, { id: 'base', kind: 'video', duration: 8 }).timeline
  const overlay = addTrack(timeline, 'video')
  timeline = insertAssetClip(overlay.timeline, { id: 'over', kind: 'image', duration: 0 }, {
    trackId: overlay.trackId,
    start: 2,
  }).timeline
  const song = insertAssetClip(timeline, { id: 'song', kind: 'audio', duration: 4 }, { start: 1 })
  return { timeline: song.timeline, songClipId: song.clipId }
}

describe('buildEditorExportPlan', () => {
  it('monta entradas recortadas, composição de baixo para cima e mixagem', () => {
    const { timeline } = sample()
    const plan = buildEditorExportPlan({ timeline, assets, width: 1080, height: 1920, outputPath: 'out.mp4' })

    expect(plan.duration).toBe(8)
    expect(plan.inputArgs.slice(0, 4)).toEqual(['-f', 'lavfi', '-i', 'color=c=black:s=1080x1920:r=30:d=8.000'])
    expect(plan.inputArgs).toEqual(expect.arrayContaining(['-ss', '0.000', '-t', '8.000', '-i', 'C:\\v\\base.mp4']))
    expect(plan.inputArgs).toEqual(expect.arrayContaining(['-loop', '1', '-framerate', '30', '-t', '5.000']))
    expect(plan.visualClipCount).toBe(2)
    expect(plan.audioClipCount).toBe(2)

    const baseOverlay = plan.filterGraph.indexOf('[0:v][v0]overlay')
    const topOverlay = plan.filterGraph.indexOf('[o0][v1]overlay')
    expect(baseOverlay).toBeGreaterThanOrEqual(0)
    expect(topOverlay).toBeGreaterThan(baseOverlay)
    expect(plan.filterGraph).toContain("enable='between(t,2.000,7.000)'")
    expect(plan.filterGraph).toContain('adelay=1000:all=1')
    expect(plan.filterGraph).toContain('amix=inputs=3')
    expect(plan.outputArgs.slice(-1)).toEqual(['out.mp4'])
  })

  it('respeita faixa oculta, faixa muda e clipe mudo', () => {
    const { timeline, songClipId } = sample()
    const videoTop = timeline.tracks[0]
    const audioTrack = timeline.tracks.find((track) => track.kind === 'audio')!
    let next = updateTrack(timeline, videoTop.id, { hidden: true })
    next = updateTrack(next, audioTrack.id, { muted: true })
    const plan = buildEditorExportPlan({ timeline: next, assets, width: 1080, height: 1920, outputPath: 'o.mp4' })
    expect(plan.visualClipCount).toBe(1)
    expect(plan.audioClipCount).toBe(1)

    const baseClip = next.clips.find((clip) => clip.assetId === 'base')!
    const silent = updateClip(updateTrack(next, audioTrack.id, { muted: false }), baseClip.id, { muted: true })
    const silentPlan = buildEditorExportPlan({ timeline: silent, assets, width: 1080, height: 1920, outputPath: 'o.mp4' })
    expect(silentPlan.audioClipCount).toBe(1)
    expect(silent.clips.some((clip) => clip.id === songClipId)).toBe(true)
  })

  it('recusa timeline vazia', () => {
    expect(() =>
      buildEditorExportPlan({ timeline: createEmptyTimeline(), assets, width: 1080, height: 1920, outputPath: 'o.mp4' }),
    ).toThrow(/vazia/)
  })

  it('aplica fade de áudio na exportação', () => {
    const { timeline, songClipId } = sample()
    const withFade = updateClip(timeline, songClipId, { fadeIn: 0.5, fadeOut: 1 })
    const plan = buildEditorExportPlan({
      timeline: withFade,
      assets,
      width: 1080,
      height: 1920,
      outputPath: 'out.mp4',
    })
    expect(plan.filterGraph).toContain('afade=t=in:st=0:d=0.500')
    expect(plan.filterGraph).toContain('afade=t=out:st=3.000:d=1.000')
  })

  it('aplica spans de efeito com enable between após a composição', () => {
    const { timeline } = sample()
    const withEffect = insertEffectClip(timeline, 'glow', { start: 1, duration: 2, exactStart: true }).timeline
    const plan = buildEditorExportPlan({
      timeline: withEffect,
      assets,
      width: 1080,
      height: 1920,
      outputPath: 'out.mp4',
    })
    expect(plan.filterGraph).toContain("enable='between(t,1.000,3.000)'")
    expect(plan.filterGraph).toMatch(/\[o\d+].*gblur=sigma=1\.5:enable=/)
    expect(plan.filterGraph).toContain('[fx0]format=yuv420p[vout]')
  })

  it('aplica drawtext para clipes de texto na timeline', () => {
    const { timeline } = sample()
    const withText = insertTextClip(timeline, 'classic-bold', {
      start: 1,
      duration: 2,
      exactStart: true,
      title: 'OLA',
    }).timeline
    const plan = buildEditorExportPlan({
      timeline: withText,
      assets,
      width: 1080,
      height: 1920,
      outputPath: 'out.mp4',
    })
    expect(plan.filterGraph).toContain("drawtext=text='OLA'")
    expect(plan.filterGraph).toContain("enable='between(t,1.000,3.000)'")
    expect(plan.filterGraph).toMatch(/\[tx\d+]format=yuv420p\[vout]/)
    expect(plan.inputArgs.join(' ')).not.toContain('text:')
  })

  it('aplica marca d\'água no canto escolhido', () => {
    const { timeline } = sample()
    const withMark = {
      ...timeline,
      watermarks: [
        {
          id: 'wm-1',
          assetId: 'over',
          corner: 'bottom-right' as const,
          scale: 0.2,
          opacity: 0.8,
          margin: 0.04,
          animation: { inId: null, outId: null, comboId: null, inDuration: 0.6, outDuration: 0.6 },
        },
      ],
    }
    const plan = buildEditorExportPlan({
      timeline: withMark,
      assets,
      width: 1080,
      height: 1920,
      outputPath: 'out.mp4',
    })
    expect(plan.inputArgs).toEqual(
      expect.arrayContaining(['-loop', '1', '-framerate', '30', '-t', '8.000', '-i', 'C:\\v\\logo.png']),
    )
    expect(plan.filterGraph).toContain('colorchannelmixer=aa=0.800')
    expect(plan.filterGraph).toContain('main_w-overlay_w-43')
    expect(plan.filterGraph).toContain('main_h-overlay_h-43')
    expect(plan.filterGraph).toContain('[wmout0]format=yuv420p[vout]')
  })

  it('empilha duas marcas d\'água no filtro', () => {
    const { timeline } = sample()
    const withMarks = {
      ...timeline,
      watermarks: [
        {
          id: 'wm-a',
          assetId: 'over',
          corner: 'top-left' as const,
          scale: 0.15,
          opacity: 1,
          margin: 0.02,
          animation: { inId: null, outId: null, comboId: null, inDuration: 0.6, outDuration: 0.6 },
        },
        {
          id: 'wm-b',
          assetId: 'over',
          corner: 'bottom-right' as const,
          scale: 0.2,
          opacity: 0.7,
          margin: 0.03,
          animation: { inId: null, outId: null, comboId: null, inDuration: 0.6, outDuration: 0.6 },
        },
      ],
    }
    const plan = buildEditorExportPlan({
      timeline: withMarks,
      assets,
      width: 1080,
      height: 1920,
      outputPath: 'out.mp4',
    })
    expect(plan.filterGraph).toContain('[wm0]')
    expect(plan.filterGraph).toContain('[wm1]')
    expect(plan.filterGraph).toContain('[wmout1]format=yuv420p[vout]')
  })
})
