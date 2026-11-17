import { describe, expect, it } from 'vitest'
import { parseIdeaLinks } from './ideas'

describe('parseIdeaLinks', () => {
  it('lê um link e vários colados juntos', () => {
    expect(parseIdeaLinks('https://youtu.be/abc123')).toEqual(['https://youtu.be/abc123'])
    expect(
      parseIdeaLinks('https://youtu.be/abc123\nhttps://vimeo.com/99'),
    ).toEqual(['https://youtu.be/abc123', 'https://vimeo.com/99'])
  })

  it('completa https e ignora texto solto', () => {
    expect(parseIdeaLinks('youtube.com/watch?v=abc')).toEqual(['https://youtube.com/watch?v=abc'])
    expect(parseIdeaLinks('só uma nota')).toEqual([])
  })
})
