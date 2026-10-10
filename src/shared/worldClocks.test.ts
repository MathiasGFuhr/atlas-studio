import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORLD_CLOCKS,
  createWorldClock,
  formatWorldClockOffset,
  formatWorldClockTime,
  getWorldClockCountryCode,
  isValidTimeZone,
  normalizeWorldClocks,
  worldClockFlagUrl,
} from './worldClocks'

describe('worldClocks', () => {
  it('valida fusos IANA', () => {
    expect(isValidTimeZone('Europe/Berlin')).toBe(true)
    expect(isValidTimeZone('America/New_York')).toBe(true)
    expect(isValidTimeZone('not-a-zone')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })

  it('usa defaults quando o valor é inválido', () => {
    expect(normalizeWorldClocks(undefined)).toEqual(DEFAULT_WORLD_CLOCKS)
    expect(normalizeWorldClocks(null)).toEqual(DEFAULT_WORLD_CLOCKS)
    expect(normalizeWorldClocks('x')).toEqual(DEFAULT_WORLD_CLOCKS)
  })

  it('preserva lista vazia válida e limpa entradas ruins', () => {
    expect(normalizeWorldClocks([])).toEqual([])
    expect(
      normalizeWorldClocks([
        { id: 'ok', label: 'Alemanha', timeZone: 'Europe/Berlin' },
        { id: 'bad', label: '', timeZone: 'Europe/Berlin' },
        { id: 'bad2', label: 'X', timeZone: 'nope' },
      ]),
    ).toEqual([{ id: 'ok', label: 'Alemanha', timeZone: 'Europe/Berlin' }])
  })

  it('cria relógio com id estável o suficiente', () => {
    const clock = createWorldClock('Japão', 'Asia/Tokyo')
    expect(clock).not.toBeNull()
    expect(clock?.label).toBe('Japão')
    expect(clock?.timeZone).toBe('Asia/Tokyo')
    expect(clock?.id.startsWith('wc_asia_tokyo_')).toBe(true)
    expect(createWorldClock('', 'Asia/Tokyo')).toBeNull()
  })

  it('formata hora e offset', () => {
    const noonUtc = new Date('2026-06-15T12:00:00.000Z')
    expect(formatWorldClockTime(noonUtc, 'UTC')).toBe('12:00')
    expect(formatWorldClockOffset(noonUtc, 'UTC')).toMatch(/UTC/)
  })

  it('resolve código de país da bandeira pelo fuso', () => {
    expect(getWorldClockCountryCode('Europe/Berlin')).toBe('de')
    expect(getWorldClockCountryCode('America/New_York')).toBe('us')
    expect(getWorldClockCountryCode('America/Sao_Paulo')).toBe('br')
    expect(getWorldClockCountryCode('Europe/London', 'Europa')).toBe('eu')
    expect(getWorldClockCountryCode('Europe/London', 'Reino Unido')).toBe('gb')
    expect(getWorldClockCountryCode('UTC')).toBeNull()
    expect(worldClockFlagUrl('br')).toBe('https://flagcdn.com/w640/br.png')
  })
})
