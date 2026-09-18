import { describe, expect, it } from 'vitest'
import { formatTimecode, parseTimecodeInput, roundTime } from './time'

describe('time', () => {
  it('formata milissegundos', () => {
    expect(formatTimecode(43.327)).toBe('00:43.327')
    expect(formatTimecode(310)).toBe('05:10.000')
    expect(roundTime(43.3274)).toBe(43.327)
  })

  it('aceita entrada em relógio ou segundos', () => {
    expect(parseTimecodeInput('01:23.500')).toBe(83.5)
    expect(parseTimecodeInput('43.327')).toBe(43.327)
  })
})
