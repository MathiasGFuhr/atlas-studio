import { describe, expect, it } from 'vitest'
import {
  buildShortsCopiesPrompt,
  fallbackShortsCopy,
  normalizeShortsCopies,
} from './shortsCopy'

const editorial = {
  language: 'de',
  contentLanguage: 'de',
  languageName: 'German',
  languageSource: 'channel' as const,
  languageConfidence: 0.9,
  channelName: 'Johann Falk',
  artistName: 'Johann Falk',
  songTitle: 'ZU VIEL VON ALLEM',
  sourceName: 'show.mp4',
}

describe('shortsCopy', () => {
  it('música e história usam estratégias editoriais diferentes', () => {
    const music = buildShortsCopiesPrompt({
      profile: 'music',
      editorial,
      fileName: 'show.mp4',
      videoDuration: 240,
      fields: 'all',
      clips: [
        {
          index: 1,
          start: 40,
          end: 72,
          score: 91,
          reason: 'Refrão com a plateia',
          hook: 'A arena explode no refrão',
          transcript: [{ start: 40, end: 48, text: 'zu viel von allem' }],
        },
      ],
    })
    const history = buildShortsCopiesPrompt({
      profile: 'history',
      editorial: {
        language: 'pt-BR',
        contentLanguage: 'pt-BR',
        languageName: 'Brazilian Portuguese',
        languageSource: 'transcript',
        languageConfidence: 0.9,
        sourceName: 'roma.mp4',
      },
      fileName: 'roma.mp4',
      videoDuration: 240,
      fields: 'all',
      clips: [
        {
          index: 1,
          start: 12,
          end: 44,
          score: 80,
          reason: 'Revelação do colapso',
          hook: 'O império começa a ruir',
          transcript: [{ start: 12, end: 20, text: 'o império começou a ruir' }],
        },
      ],
    })

    expect(music).toContain('Perfil editorial: MÚSICA')
    expect(music).toContain('idiomaObrigatorio: de')
    expect(music).toContain('contentLanguage: de')
    expect(music).toContain('languageName: German')
    expect(music).toContain('Generate all viewer-facing metadata in German.')
    expect(music).toContain('Do not translate to Portuguese.')
    expect(music).toContain('Do not use the UI language.')
    expect(music).toContain('artistName: Johann Falk')
    expect(music).toContain('songTitle: ZU VIEL VON ALLEM')
    expect(music).toContain('NÃO traduza automaticamente para inglês')
    expect(music).toContain('reação da plateia')
    expect(music).not.toContain('virada narrativa')
    expect(music).toContain('Não gere título/descrição só com a análise global')
    expect(music).toContain('NÃO invente tema político')

    expect(history).toContain('Perfil editorial: HISTÓRIA')
    expect(history).toContain('idiomaObrigatorio: pt-BR')
    expect(history).toContain('contentLanguage: pt-BR')
    expect(history).toContain('Brazilian Portuguese')
    expect(history).toContain('revelação')
    expect(history).not.toContain('clímax')
  })

  it('pede títulos únicos e bloqueia genéricos', () => {
    const prompt = buildShortsCopiesPrompt({
      profile: 'music',
      editorial,
      fileName: 'show.mp4',
      videoDuration: 180,
      fields: 'title',
      clips: [
        {
          index: 1,
          start: 10,
          end: 40,
          score: 80,
          reason: 'entrada',
          hook: '',
          transcript: [],
          usedTitles: ['O refrão que a plateia já sabia de cor'],
        },
        {
          index: 2,
          start: 80,
          end: 110,
          score: 77,
          reason: 'solo',
          hook: '',
          transcript: [],
        },
      ],
    })
    expect(prompt).toContain('5 títulos realmente diferentes')
    expect(prompt).toContain('Momento incrível')
    expect(prompt).toContain('Reescreva APENAS o título')
    expect(prompt).toContain('titulosJaUsadosEmOutrosShorts')
  })

  it('normaliza o retorno e preenche clips ausentes', () => {
    const result = normalizeShortsCopies(
      {
        clips: [
          {
            index: 2,
            title: 'O solo que corta a luz',
            description: 'A guitarra sobe e a arena some.',
            hashtags: ['#solo', 'JohannFalk', '#solo'],
          },
        ],
      },
      [{ index: 1 }, { index: 2 }],
    )
    expect(result[0]).toEqual({ index: 1, title: '', description: '', hashtags: [], hook: '' })
    expect(result[1].title).toBe('O solo que corta a luz')
    expect(result[1].hashtags).toEqual(['solo', 'JohannFalk'])
  })

  it('fallback usa o trecho, não um título genérico', () => {
    const copy = fallbackShortsCopy({
      index: 1,
      hook: '',
      reason: 'Refrão com a plateia cantando o nome da música',
      transcript: [{ start: 40, end: 46, text: 'zu viel von allem' }],
    })
    expect(copy.title.toLowerCase()).toContain('zu viel von allem')
    expect(copy.title).not.toMatch(/momento incrível/i)
  })
})
