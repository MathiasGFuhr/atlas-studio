import { describe, expect, it } from 'vitest'
import { parseFfmpegProbe, parseSceneTimes, parseSilenceRegions } from './ffmpegParse'

describe('ffmpegVideo parsers', () => {
  it('lê duração, resolução, fps e proporção do stderr do FFmpeg', () => {
    const stderr = `
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'show.mp4':
  Duration: 00:12:34.50, start: 0.000000, bitrate: 4500 kb/s
    Stream #0:0(und): Video: h264 (High), yuv420p, 1920x1080 [SAR 1:1 DAR 16:9], 29.97 fps, 29.97 tbr
    Stream #0:1(und): Audio: aac (LC), 48000 Hz, stereo
`
    const info = parseFfmpegProbe(stderr, 'C:\\videos\\show.mp4')
    expect(info.duration).toBeCloseTo(754.5, 1)
    expect(info.width).toBe(1920)
    expect(info.height).toBe(1080)
    expect(info.fps).toBeCloseTo(29.97, 1)
    expect(info.aspectRatio).toBe('16:9')
    expect(info.hasAudio).toBe(true)
    expect(info.name).toBe('show.mp4')
  })

  it('extrai cenas e silêncios', () => {
    expect(parseSceneTimes('pts_time:12.4\npts_time:12.5\npts_time:40.0')).toEqual([12.4, 40])
    expect(parseSilenceRegions('silence_start: 10.0\nsilence_end: 12.2 | silence_duration: 2.2')).toEqual([
      { start: 10, end: 12.2 },
    ])
  })
})
