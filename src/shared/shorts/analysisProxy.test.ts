import { describe, expect, it } from 'vitest'
import { analysisProxySpec, buildAnalysisProxyArgs, buildKeyframeArgs } from './analysisProxy'

describe('proxy de análise', () => {
  it('reduz resolução e bitrate sem alterar a ideia de duração do arquivo fonte', () => {
    const spec = analysisProxySpec(180, 1920, 1080)
    expect(spec.maxWidth).toBeLessThanOrEqual(960)
    expect(spec.fps).toBeLessThanOrEqual(12)
    const args = buildAnalysisProxyArgs({
      sourcePath: 'C:\\in\\show.mp4',
      outputPath: 'C:\\out\\proxy.mp4',
      duration: 180,
      width: 1920,
      height: 1080,
      hasAudio: true,
    })
    expect(args).toContain('libx264')
    expect(args).toContain('aac')
    expect(args.some((item) => item.includes('fps=12'))).toBe(true)
    expect(args.join(' ')).not.toContain('-t ')
  })

  it('não reescala demais vídeos longos', () => {
    const spec = analysisProxySpec(50 * 60, 3840, 2160)
    expect(spec.maxWidth).toBe(640)
    expect(spec.fps).toBe(6)
  })

  it('extrai um frame pontual, não o vídeo inteiro', () => {
    const args = buildKeyframeArgs({ sourcePath: 'a.mp4', outputPath: 'f.jpg', atSeconds: 42.5 })
    expect(args).toContain('-frames:v')
    expect(args).toContain('1')
    expect(args).toContain('42.500')
  })
})
