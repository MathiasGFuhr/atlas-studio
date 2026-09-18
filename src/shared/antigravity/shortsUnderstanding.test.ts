import { describe, expect, it } from 'vitest'
import { buildCandidateProposalPrompt, buildVideoUnderstandingPrompt } from './shortsUnderstanding'

describe('prompts de compreensão audiovisual', () => {
  it('no modo vídeo pede para assistir o proxy e não escolher cortes ainda', () => {
    const prompt = buildVideoUnderstandingPrompt({
      profile: 'music',
      duration: 200,
      fileName: 'show.mp4',
      mediaPath: 'D:\\proxy\\analysis.mp4',
      watchedVideo: true,
    })
    expect(prompt).toContain('ASSISTA e OUÇA')
    expect(prompt).toContain('Não escolha cortes ainda')
    expect(prompt).toContain('D:\\proxy\\analysis.mp4')
    expect(prompt).not.toContain('Você NÃO recebeu o vídeo completo')
  })

  it('no fallback proíbe fingir que assistiu ao vídeo', () => {
    const prompt = buildVideoUnderstandingPrompt({
      profile: 'history',
      duration: 200,
      fileName: 'doc.mp4',
      mediaPath: null,
      watchedVideo: false,
      keyframeIndex: [{ time: 12, path: 'frame-001.jpg' }],
    })
    expect(prompt).toContain('Você NÃO recebeu o vídeo completo')
    expect(prompt).toContain('frame-001.jpg')
    expect(prompt).not.toContain('ASSISTA e OUÇA')
  })

  it('candidatos usam a compreensão global e permitem devolver menos cortes', () => {
    const prompt = buildCandidateProposalPrompt({
      profile: 'music',
      duration: 200,
      clipCount: 5,
      requestedDuration: 30,
      durationMode: 'approximate',
      fileName: 'show.mp4',
      mediaPath: 'proxy.mp4',
      watchedVideo: true,
      understanding: {
        language: 'de',
        contentType: 'live',
        structure: 'intro chorus solo',
        majorMoments: [],
        visualHighlights: [],
        audioHighlights: [],
        narrativeArc: 'build to chorus',
      },
    })
    expect(prompt).toContain('Pode devolver MENOS')
    expect(prompt).toContain('contentType: live')
    expect(prompt).toContain('visualReason')
    expect(prompt).toContain('Não escolha só o trecho mais alto')
  })
})
