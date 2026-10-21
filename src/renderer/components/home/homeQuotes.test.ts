import { describe, expect, it } from 'vitest'
import { HOME_QUOTES, quoteForDate } from './homeQuotes'

describe('quoteForDate', () => {
  it('mantém a mesma frase durante o dia', () => {
    const morning = new Date(2026, 9, 13, 8, 15)
    const night = new Date(2026, 9, 13, 23, 40)
    expect(quoteForDate(morning)).toBe(quoteForDate(night))
  })

  it('troca a frase no dia seguinte', () => {
    const today = new Date(2026, 9, 13, 12, 0)
    const tomorrow = new Date(2026, 9, 14, 12, 0)
    expect(quoteForDate(today)).not.toBe(quoteForDate(tomorrow))
  })

  it('não repete frase em dias seguidos do catálogo', () => {
    const start = new Date(2026, 0, 1, 12, 0)
    const seen = new Set<string>()
    for (let offset = 0; offset < HOME_QUOTES.length; offset += 1) {
      const day = new Date(start)
      day.setDate(start.getDate() + offset)
      seen.add(quoteForDate(day))
    }
    expect(seen.size).toBe(HOME_QUOTES.length)
  })
})
