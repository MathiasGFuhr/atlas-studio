import { describe, expect, it } from 'vitest'
import {
  buildShortsCopiesPrompt,
  fallbackShortsCopy,
  groundShortsCopy,
  normalizeShortsCopies,
  speechCopyNeedsRepair,
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
    expect(music).toContain('fraseLiteralParaOTitulo')
    expect(music).toContain('Abertura íntima')
    expect(music).toContain('Zu viel von allem')
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

  it('com fala, o prompt esconde clima visual e pede a frase dita', () => {
    const prompt = buildShortsCopiesPrompt({
      profile: 'music',
      editorial,
      fileName: 'show.mp4',
      videoDuration: 180,
      fields: 'all',
      clips: [
        {
          index: 1,
          start: 15,
          end: 72,
          score: 84,
          reason: 'entrada do vocal',
          hook: 'Abertura intimista',
          transcript: [{ start: 15, end: 28, text: 'eu tentei te odiar mas eu ainda te amo' }],
          visualReason: 'luz baixa no piano e no violão',
          rejectedTitle: 'Aprender a Perdoar: Abertura íntima com voz, violão e piano',
          rejectedDescription: 'A canção se inicia com uma introdução serena.',
        },
      ],
    })
    expect(prompt).toContain('eu tentei te odiar mas eu ainda te amo')
    expect(prompt).toContain('tituloRejeitado')
    expect(prompt).not.toContain('luz baixa no piano')
  })

  it('troca ficha de arranjo pelo que é dito e mantém título literal', () => {
    const transcript = [
      { start: 15, end: 22, text: 'Eu tentei te odiar' },
      { start: 22, end: 32, text: 'mas eu ainda te amo demais' },
      { start: 32, end: 48, text: 'aprender a perdoar dói quando a gente ainda espera' },
    ]
    const generic = groundShortsCopy(
      {
        index: 1,
        title: 'Aprender a Perdoar: Abertura íntima com voz, violão e piano',
        description:
          "A canção 'Aprender a Perdoar' se inicia com uma introdução serena ao piano e violão acústico. O intérprete entra com delicadeza, estabelecendo a premissa emocional da música em tom intimista.",
        hashtags: ['perdao'],
        hook: 'Abertura intimista com voz e piano',
      },
      { transcript, songTitle: 'Aprender a Perdoar' },
    )
    expect(generic.title.toLowerCase()).toContain('perdoar dói quando a gente ainda espera')
    expect(generic.title.toLowerCase()).not.toMatch(/violão|piano|abertura|intimista/)
    expect(generic.description.toLowerCase()).toContain('tentei te odiar')
    expect(generic.description.toLowerCase()).toContain('ainda espera')
    expect(generic.description.toLowerCase()).not.toMatch(/introdução serena|intérprete|premissa/)
    expect(speechCopyNeedsRepair(
      {
        title: 'Aprender a Perdoar: Abertura íntima com voz, violão e piano',
        description: 'A canção se inicia com uma introdução serena ao piano.',
      },
      transcript,
      { songTitle: 'Aprender a Perdoar' },
    )).toBe(true)

    const literal = groundShortsCopy(
      {
        index: 1,
        title: 'Eu tentei te odiar, mas eu ainda te amo demais',
        description: 'Eu tentei te odiar, mas eu ainda te amo demais. Aprender a perdoar dói quando a gente ainda espera.',
        hashtags: [],
      },
      { transcript, songTitle: 'Aprender a Perdoar' },
    )
    expect(literal.title).toBe('Eu tentei te odiar, mas eu ainda te amo demais')
    expect(literal.description).toContain('ainda espera')
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
