import { describe, expect, it } from 'vitest'
import type { MusicTrack } from './musicAnalysis'
import {
  mergeTrackCaptions,
  musicCaptionResultToast,
  removeMusicCaptionJob,
  upsertMusicCaptionJob,
  type MusicCaptionJob,
} from './musicCaptionGeneration'

function makeTrack(partial: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id: 'track-1',
    projectId: null,
    name: 'Minha Música',
    originalPath: 'C:\\audio.mp3',
    previewPath: 'C:\\preview.wav',
    duration: 180,
    cutMode: 'manual',
    cuts: [{ id: 'c1', start: 0, end: 20, label: 'Trecho 1', source: 'manual' }],
    captions: [],
    captionsLanguage: null,
    selectedId: 'c1',
    appliedPreset: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  }
}

function makeJob(partial: Partial<MusicCaptionJob> = {}): MusicCaptionJob {
  return {
    trackId: 'track-1',
    trackName: 'Minha Música',
    language: 'pt',
    model: 'turbo',
    startedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  }
}

describe('musicCaptionGeneration helpers', () => {
  it('adiciona, atualiza e remove jobs ativos por trackId', () => {
    const first = makeJob({ trackId: 't1', model: 'medium' })
    const second = makeJob({ trackId: 't2', model: 'turbo' })
    let list = upsertMusicCaptionJob([], first)
    list = upsertMusicCaptionJob(list, second)
    expect(list).toHaveLength(2)

    const updated = makeJob({ trackId: 't1', model: 'large-v3' })
    list = upsertMusicCaptionJob(list, updated)
    expect(list).toHaveLength(2)
    expect(list[0].model).toBe('large-v3')

    list = removeMusicCaptionJob(list, 't1')
    expect(list).toEqual([second])
  })

  it('mescla somente captions e idioma sem sobrescrever cortes locais', () => {
    const local = makeTrack({
      cuts: [
        { id: 'c1', start: 0, end: 12, label: 'Intro', source: 'manual' },
        { id: 'c2', start: 12, end: 30, label: 'Verso', source: 'manual' },
      ],
      selectedId: 'c2',
      updatedAt: '2026-10-01T00:05:00.000Z',
    })
    const server = makeTrack({
      cuts: [{ id: 'c1', start: 0, end: 20, label: 'Antigo', source: 'manual' }],
      selectedId: 'c1',
      captions: [{ start: 1, end: 4, text: 'Olá mundo' }],
      captionsLanguage: 'pt',
      updatedAt: '2026-10-01T00:06:00.000Z',
    })

    const merged = mergeTrackCaptions(local, server)
    expect(merged.cuts).toEqual(local.cuts)
    expect(merged.selectedId).toBe('c2')
    expect(merged.captions).toEqual([{ start: 1, end: 4, text: 'Olá mundo' }])
    expect(merged.captionsLanguage).toBe('pt')
    expect(merged.updatedAt).toBe('2026-10-01T00:06:00.000Z')
  })

  it('ignora snapshot de outra faixa ou nulo ao mesclar', () => {
    const local = makeTrack({ id: 'track-1' })
    expect(mergeTrackCaptions(local, null)).toBe(local)
    expect(mergeTrackCaptions(local, makeTrack({ id: 'track-2' }))).toBe(local)
  })

  it('gera toast adequado quando o usuário está na faixa ou em outra aba', () => {
    const withCaptions = makeTrack({
      name: 'O Véu Já Não Nos Separa',
      captions: [{ start: 0, end: 3, text: 'Letra' }],
    })
    expect(musicCaptionResultToast(withCaptions, null, true)).toEqual({
      message: 'Legenda gerada.',
      type: 'success',
    })
    expect(musicCaptionResultToast(withCaptions, null, false)).toEqual({
      message: 'Legenda gerada para “O Véu Já Não Nos Separa”.',
      type: 'success',
    })
    const empty = makeTrack({ name: 'Instrumental', captions: [] })
    expect(musicCaptionResultToast(empty, null, false)).toEqual({
      message: 'Nenhuma fala encontrada em “Instrumental”.',
      type: 'success',
    })
  })
})
