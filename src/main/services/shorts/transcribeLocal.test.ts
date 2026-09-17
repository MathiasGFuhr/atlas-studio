import { describe, expect, it } from 'vitest'
import { parseWhisperJson, parseWhisperTranscript, cuesFromSilence } from './transcribeLocal'

describe('transcribeLocal', () => {
  it('lê segmentos do JSON do Whisper', () => {
    const cues = parseWhisperJson(
      JSON.stringify({
        segments: [
          { start: 1.2, end: 3.4, text: ' refrão ' },
          { start: 5, end: 4, text: 'inválido' },
        ],
      }),
    )
    expect(cues).toEqual([{ start: 1.2, end: 3.4, text: 'refrão' }])
  })

  it('lê o idioma detectado no JSON do Whisper', () => {
    const parsed = parseWhisperTranscript(
      JSON.stringify({
        language: 'de',
        segments: [{ start: 1.2, end: 3.4, text: ' Gegen den Takt ' }],
      }),
    )
    expect(parsed.language).toBe('de')
    expect(parsed.cues).toEqual([{ start: 1.2, end: 3.4, text: 'Gegen den Takt' }])
  })

  it('cria faixas de fala a partir de silêncio, sem inventar texto', () => {
    const cues = cuesFromSilence(20, [{ start: 8, end: 10 }])
    expect(cues).toEqual([
      { start: 0, end: 8, text: '' },
      { start: 10, end: 20, text: '' },
    ])
  })
})
