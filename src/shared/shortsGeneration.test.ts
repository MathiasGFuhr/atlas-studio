import { describe, expect, it } from 'vitest'
import type { ShortsClip, ShortsJob } from './shorts'
import { DEFAULT_FRAMING_SETTINGS } from './shortsFraming'
import {
  isShortsAnalyzeStage,
  mergeShortsJobSnapshot,
  shortsAnalyzeProgressLabel,
  shortsAnalyzeResultToast,
} from './shortsGeneration'

function clip(partial: Partial<ShortsClip> = {}): ShortsClip {
  return {
    id: 'c1',
    index: 1,
    start: 0,
    end: 15,
    score: 80,
    reason: 'gancho',
    hook: 'hook',
    title: 'Título',
    description: 'Desc',
    hashtags: [],
    accepted: false,
    exportedPath: null,
    focusStrategy: 'center',
    ...partial,
  }
}

function job(partial: Partial<ShortsJob> = {}): ShortsJob {
  return {
    id: 'job-1',
    projectId: null,
    name: 'Show',
    sourcePath: 'C:\\video.mp4',
    sourceName: 'video.mp4',
    profile: 'music',
    clipCount: 5,
    requestedDuration: 30,
    durationMode: 'approximate',
    aspectMode: 'auto',
    framingSettings: DEFAULT_FRAMING_SETTINGS,
    framingTrack: [],
    captionsEnabled: true,
    clips: [],
    probe: null,
    transcript: [],
    transcriptSource: 'none',
    contentLanguage: '',
    languageSource: 'fallback',
    languageConfidence: 0,
    languageOverride: null,
    detectedLanguage: null,
    transcriptLanguage: null,
    analysisMode: null,
    analysisNotes: null,
    errorMessage: null,
    status: 'ready',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    sourceExists: true,
    thumbnailUrl: null,
    ...partial,
  }
}

describe('shorts generation helpers', () => {
  it('trata exportação como etapa local, não como análise em background', () => {
    expect(isShortsAnalyzeStage('preparing_video')).toBe(true)
    expect(isShortsAnalyzeStage('writing_copy')).toBe(true)
    expect(isShortsAnalyzeStage('exporting')).toBe(false)
  })

  it('usa a mensagem da etapa ou o rótulo padrão', () => {
    expect(
      shortsAnalyzeProgressLabel({
        jobId: 'job-1',
        stage: 'selecting_moments',
        message: 'Escolhendo os melhores cortes...',
      }),
    ).toBe('Escolhendo os melhores cortes...')
    expect(shortsAnalyzeProgressLabel({ jobId: 'job-1', stage: 'preparing_video', message: '' })).toBe(
      'Preparando vídeo...',
    )
  })

  it('monta o toast de sucesso e de erro', () => {
    expect(shortsAnalyzeResultToast(job({ clips: [clip()] }))).toEqual({
      message: '1 Shorts sugeridos.',
      type: 'success',
    })
    expect(shortsAnalyzeResultToast(job({ clips: [clip()] }), 1)).toEqual({
      message: '1 Shorts no projeto. Shorts exportados foram preservados.',
      type: 'success',
    })
    expect(shortsAnalyzeResultToast(job({ status: 'error', errorMessage: 'Sem conexão com a IA.' }))).toEqual({
      message: 'Sem conexão com a IA.',
      type: 'error',
    })
  })

  it('mantém o snapshot mais recente do mesmo job', () => {
    const older = job({ status: 'analyzing', updatedAt: '2026-10-01T00:00:00.000Z' })
    const newer = job({ status: 'ready', updatedAt: '2026-10-01T00:02:00.000Z' })
    expect(mergeShortsJobSnapshot(older, newer)?.status).toBe('ready')
    expect(mergeShortsJobSnapshot(newer, older)?.status).toBe('ready')
    expect(mergeShortsJobSnapshot(null, newer)?.id).toBe('job-1')
  })
})
