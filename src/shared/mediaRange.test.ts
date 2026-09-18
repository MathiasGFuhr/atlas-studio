import { describe, expect, it } from 'vitest'
import { parseByteRange } from './mediaRange'

describe('parseByteRange', () => {
  it('aceita intervalo aberto no fim', () => {
    expect(parseByteRange('bytes=1000-', 5000)).toEqual({ start: 1000, end: 4999, size: 5000 })
  })

  it('aceita intervalo fechado', () => {
    expect(parseByteRange('bytes=0-499', 8000)).toEqual({ start: 0, end: 499, size: 8000 })
  })

  it('aceita sufixo', () => {
    expect(parseByteRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999, size: 1000 })
  })

  it('rejeita fora do arquivo', () => {
    expect(parseByteRange('bytes=9000-', 1000)).toBeNull()
    expect(parseByteRange('bytes=abc', 1000)).toBeNull()
    expect(parseByteRange(null, 1000)).toBeNull()
  })
})
