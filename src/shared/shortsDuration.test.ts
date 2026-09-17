import { describe, expect, it } from 'vitest'
import {
  capRequestedDuration,
  constrainClipWindow,
  durationBounds,
  formatClipLength,
  formatDurationInput,
  parseDurationInput,
  requestedDurationFromLegacyPreset,
} from './shortsDuration'

describe('shortsDuration', () => {
  it('aceita segundos, MM:SS e 1m20s', () => {
    expect(parseDurationInput('20')).toBe(20)
    expect(parseDurationInput('00:20')).toBe(20)
    expect(parseDurationInput('60')).toBe(60)
    expect(parseDurationInput('01:00')).toBe(60)
    expect(parseDurationInput('90')).toBe(90)
    expect(parseDurationInput('01:30')).toBe(90)
    expect(parseDurationInput('1m20s')).toBe(80)
    expect(parseDurationInput('1m 20s')).toBe(80)
    expect(formatDurationInput(80)).toBe('01:20')
  })

  it('não deixa a duração pedida passar do vídeo', () => {
    const result = capRequestedDuration(60, 43)
    expect(result.capped).toBe(true)
    expect(result.requested).toBe(43)
    expect(result.message).toBe('O vídeo possui apenas 43 segundos.')
  })

  it('no modo aproximado permite refrão um pouco maior que o pedido', () => {
    const bounds = durationBounds(30, 120, 'approximate')
    expect(bounds.min).toBeLessThan(30)
    expect(bounds.max).toBeGreaterThanOrEqual(34)
    expect(bounds.max).toBeLessThanOrEqual(36)
  })

  it('no modo exato trava a duração e não ultrapassa o vídeo', () => {
    const movedStart = constrainClipWindow({
      start: 40,
      videoDuration: 50,
      requestedDuration: 20,
      mode: 'exact',
      moved: 'start',
    })
    expect(movedStart.end - movedStart.start).toBeCloseTo(20, 1)
    expect(movedStart.end).toBeLessThanOrEqual(50)

    const overflow = constrainClipWindow({
      start: 40,
      videoDuration: 50,
      requestedDuration: 20,
      mode: 'exact',
      moved: 'start',
    })
    expect(overflow.end).toBe(50)
    expect(overflow.start).toBe(30)
  })

  it('no modo aproximado não empurra starts distintos para o fim do vídeo', () => {
    const a = constrainClipWindow({
      start: 20,
      end: 310,
      videoDuration: 310,
      requestedDuration: 30,
      mode: 'approximate',
      moved: 'both',
    })
    const b = constrainClipWindow({
      start: 80,
      end: 310,
      videoDuration: 310,
      requestedDuration: 30,
      mode: 'approximate',
      moved: 'both',
    })
    expect(a.start).toBeCloseTo(20, 0)
    expect(b.start).toBeCloseTo(80, 0)
    expect(a.end - a.start).toBeLessThanOrEqual(36)
    expect(b.end - b.start).toBeLessThanOrEqual(36)
    expect(a.start).not.toBeCloseTo(b.start, 0)
  })

  it('mostra duração com décimos', () => {
    expect(formatClipLength(37.4)).toBe('00:37.4')
  })

  it('converte presets antigos', () => {
    expect(requestedDurationFromLegacyPreset('20-45')).toBe(30)
    expect(requestedDurationFromLegacyPreset('30')).toBe(30)
  })
})
