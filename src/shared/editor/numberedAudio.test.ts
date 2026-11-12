import { describe, expect, it } from 'vitest'
import { pickPreferredAudioPath, sceneNumberFromAudioFileName } from './numberedAudio'

describe('sceneNumberFromAudioFileName', () => {
  it('aceita 6.mp3', () => {
    expect(sceneNumberFromAudioFileName('6.mp3')).toBe(6)
    expect(sceneNumberFromAudioFileName('06.wav')).toBe(6)
  })

  it('aceita export oficial 06 - Trecho 6.mp3', () => {
    expect(sceneNumberFromAudioFileName('06 - Trecho 6.mp3')).toBe(6)
    expect(sceneNumberFromAudioFileName('01 - Trecho 1.mp3')).toBe(1)
    expect(sceneNumberFromAudioFileName('10 - Trecho 10.mp3')).toBe(10)
  })

  it('aceita Trecho N.mp3', () => {
    expect(sceneNumberFromAudioFileName('Trecho 3.mp3')).toBe(3)
    expect(sceneNumberFromAudioFileName('corte 12.wav')).toBe(12)
  })

  it('ignora nomes inválidos', () => {
    expect(sceneNumberFromAudioFileName('capa.mp3')).toBeNull()
    expect(sceneNumberFromAudioFileName('musica.wav')).toBeNull()
  })
})

describe('pickPreferredAudioPath', () => {
  it('prefere 6.mp3 a 06 - Trecho 6.mp3', () => {
    expect(
      pickPreferredAudioPath(['C:/x/06 - Trecho 6.mp3', 'C:/x/6.mp3']),
    ).toBe('C:/x/6.mp3')
  })
})
