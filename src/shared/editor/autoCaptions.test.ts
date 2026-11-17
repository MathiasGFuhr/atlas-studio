import { describe, expect, it } from 'vitest'
import { applyAutomaticCaptions, pickCaptionAssetId } from './autoCaptions'
import { findClip, insertAssetClip, insertTextClip, isTextClip } from './timelineOps'
import { createEmptyTimeline } from './timelineOps'
import type { EditorTimeline } from './types'

const audio = (id: string, duration: number) => ({ id, kind: 'audio' as const, duration })

function withAudio(start = 0): EditorTimeline {
  const inserted = insertAssetClip(createEmptyTimeline(), audio('song', 20), { start, exactStart: true })
  return inserted.timeline
}

describe('pickCaptionAssetId', () => {
  it('prefere a faixa de áudio', () => {
    let timeline = insertAssetClip(createEmptyTimeline(), {
      id: 'video',
      kind: 'video',
      duration: 30,
    }).timeline
    timeline = insertAssetClip(timeline, audio('song', 12)).timeline
    expect(pickCaptionAssetId(timeline)).toBe('song')
  })
})

describe('applyAutomaticCaptions', () => {
  it('coloca a fala no tempo do áudio e troca a geração anterior', () => {
    const shifted = withAudio(5)
    const clip = shifted.clips.find((item) => item.assetId === 'song')!
    const timeline: EditorTimeline = {
      ...shifted,
      clips: shifted.clips.map((item) =>
        item.id === clip.id ? { ...item, inPoint: 1, outPoint: 12 } : item,
      ),
    }
    const manual = insertTextClip(timeline, 'classic-bold', { start: 0, title: 'DANIEL', exactStart: true })
    const first = applyAutomaticCaptions(manual.timeline, 'song', [
      { start: 2, end: 3.5, text: 'cruza o meu caminho' },
      { start: 0, end: 0.4, text: 'fora do corte' },
    ])
    const captions = first.clips.filter((item) => isTextClip(item) && item.text?.templateId === 'cap-auto')
    expect(captions).toHaveLength(1)
    expect(captions[0]).toMatchObject({ start: 6 })
    expect(captions[0]?.text?.title).toBe('cruza o meu caminho')
    expect(first.clips.some((item) => item.text?.title === 'DANIEL')).toBe(true)

    const again = applyAutomaticCaptions(first, 'song', [{ start: 4, end: 5, text: 'de novo' }])
    const next = again.clips.filter((item) => isTextClip(item) && item.text?.templateId === 'cap-auto')
    expect(next).toHaveLength(1)
    expect(next[0]?.text?.title).toBe('de novo')
    expect(findClip(again, manual.clipId)?.text?.title).toBe('DANIEL')
  })
})
