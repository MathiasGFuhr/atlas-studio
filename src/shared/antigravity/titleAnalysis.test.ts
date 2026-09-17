import { describe, expect, it } from 'vitest'
import {
  TITLE_ANALYSIS_SCHEMA,
  buildTitleAnalysisPrompt,
  computeTitleLocalFacts,
  detectRepeatedOpenings,
  hashTitleAnalysisContext,
  hydrateStoredTitleAnalysis,
  parseTitleAnalysisResponse,
  titleScoreBand,
} from './titleAnalysis'
import type { TitleAnalysisPayload } from '../types'

const CORE_METRICS = {
  hook: 84,
  clarity: 78,
  curiosity: 81,
  specificity: 90,
  emotion: 85,
  naturalness: 88,
  mobile: 69,
  channelFit: 91,
  originality: 76,
}

const MUSIC_TITLE =
  'Johann Falk bringt das Festival zum Beben mit „ZU VIEL VON ALLEM“ | Feuer, Stahl & Rock'

const HISTORY_TITLE = 'Como a Prússia Dominou a Alemanha e Depois Sumiu do Mapa'

export const musicTitleAnalysisExample = {
  score: 82,
  verdict:
    'O gancho do festival aparece cedo e a faixa oficial está preservada; o complemento final adiciona clima depois do corte móvel.',
  metrics: {
    ...CORE_METRICS,
    musicIdentity: 88,
  },
  strengths: [
    '„ZU VIEL VON ALLEM“ permanece visível e reconhecível como o nome da faixa.',
    '„Festival zum Beben“ entrega energia antes dos 45 caracteres.',
    'A ordem artista + acontecimento + música cabe no canal de shows ao vivo.',
  ],
  weaknesses: [
    '„Feuer, Stahl & Rock“ chega depois do ponto provável de truncamento e acrescenta clima, mas pouca informação nova.',
    'Se vários vídeos começam com „Johann Falk bringt“, a fórmula vira risco editorial para inscritos.',
  ],
  alternatives: [
    {
      strategy: 'original_refined',
      title: 'Johann Falk bringt das Festival zum Beben mit „ZU VIEL VON ALLEM“',
      reason: 'Mantém a estrutura original e corta o complemento que quase não aparece no celular.',
    },
    {
      strategy: 'hook_first',
      title: 'Das Festival bebt bei „ZU VIEL VON ALLEM“ | Johann Falk',
      reason: 'Move o acontecimento para os primeiros caracteres e mantém artista + música.',
    },
    {
      strategy: 'compact',
      title: '„ZU VIEL VON ALLEM“ – Johann Falk live',
      reason: 'Versão móvel que preserva faixa e artista sem o festival.',
    },
  ],
}

export const historyTitleAnalysisExample = {
  score: 86,
  verdict:
    'A pergunta implícita (como dominou e por que sumiu) puxa curiosidade histórica sem entregar o mecanismo cedo demais.',
  metrics: {
    hook: 88,
    clarity: 86,
    curiosity: 90,
    specificity: 84,
    emotion: 72,
    naturalness: 91,
    mobile: 88,
    channelFit: 89,
    originality: 80,
    narrativePromise: 87,
  },
  strengths: [
    '„Prússia“ e „Alemanha“ fixam personagem e geografia nos primeiros caracteres.',
    '„Depois Sumiu do Mapa“ promete consequência sem spoiler operacional.',
    'A frase soa natural em português, não como lista de palavras-chave.',
  ],
  weaknesses: [
    'Quem não conhece a Prússia ainda entende o conflito, mas um recorte temporal (séc. XIX) aumentaria especificidade.',
  ],
  alternatives: [
    {
      strategy: 'original_refined',
      title: 'Como a Prússia Dominou a Alemanha — e Depois Sumiu do Mapa',
      reason: 'Lapida o ritmo da frase sem mudar a promessa histórica.',
    },
    {
      strategy: 'hook_first',
      title: 'O Império que Unificou a Alemanha e Sumiu do Mapa',
      reason: 'Começa pela consequência para quem ainda não conhece a Prússia.',
    },
    {
      strategy: 'compact',
      title: 'Como a Prússia Unificou — e Sumiu da Alemanha',
      reason: 'Encurta para mobile mantendo conflito e desaparecimento.',
    },
  ],
}

describe('titleScoreBand', () => {
  it('usa as faixas editoriais', () => {
    expect(titleScoreBand(95)).toBe('Excelente')
    expect(titleScoreBand(82)).toBe('Muito forte')
    expect(titleScoreBand(74)).toBe('Bom, mas pode melhorar')
    expect(titleScoreBand(64)).toBe('Mediano')
    expect(titleScoreBand(40)).toBe('Fraco')
  })
})

describe('computeTitleLocalFacts', () => {
  it('mede recorte móvel sem transformar comprimento em nota', () => {
    const facts = computeTitleLocalFacts(MUSIC_TITLE)
    expect(facts.charCount).toBeGreaterThan(60)
    expect(facts.first45.includes('Festival')).toBe(true)
    expect(facts.first60.includes('ZU VIEL')).toBe(true)
    expect(facts.hasSeparator).toBe(true)
  })
})

describe('detectRepeatedOpenings', () => {
  it('detecta fórmula repetida no canal', () => {
    const repeated = detectRepeatedOpenings(MUSIC_TITLE, [
      'Johann Falk bringt die Menge zum Kochen mit „Nacht“',
      'Johann Falk bringt das Zelt zum Beben mit „Feuer“',
      'Outro artista abre diferente',
    ])
    expect(repeated?.prefix).toBe('johann falk')
    expect(repeated?.count).toBe(2)
  })
})

describe('parseTitleAnalysisResponse', () => {
  it('valida o exemplo de Música', () => {
    const facts = computeTitleLocalFacts(MUSIC_TITLE)
    const analysis = parseTitleAnalysisResponse(musicTitleAnalysisExample, {
      profile: 'music',
      localFacts: facts,
    })
    expect(analysis?.score).toBe(82)
    expect(analysis?.metrics.musicIdentity).toBe(88)
    expect(analysis?.alternatives.map((item) => item.strategy)).toEqual([
      'original_refined',
      'hook_first',
      'compact',
    ])
  })

  it('valida o exemplo de História com rubrica diferente', () => {
    const analysis = parseTitleAnalysisResponse(historyTitleAnalysisExample, {
      profile: 'history',
      localFacts: computeTitleLocalFacts(HISTORY_TITLE),
    })
    expect(analysis?.score).toBe(86)
    expect(analysis?.metrics.narrativePromise).toBe(87)
    expect(analysis?.metrics.musicIdentity).toBeUndefined()
  })

  it('recusa resposta sem nota válida', () => {
    expect(
      parseTitleAnalysisResponse(
        { ...musicTitleAnalysisExample, score: 'n/a' },
        { profile: 'music', localFacts: computeTitleLocalFacts(MUSIC_TITLE) },
      ),
    ).toBeNull()
  })

  it('recusa média inventada quando faltam métricas', () => {
    expect(
      parseTitleAnalysisResponse(
        { score: 80, verdict: 'ok', strengths: ['a'], weaknesses: ['b'], alternatives: [] },
        { profile: 'general', localFacts: computeTitleLocalFacts('Título') },
      ),
    ).toBeNull()
  })
})

describe('hydrateStoredTitleAnalysis', () => {
  it('lê o formato antigo do calendário', () => {
    const hydrated = hydrateStoredTitleAnalysis(
      {
        score: 71,
        verdict: 'Razoável',
        curiosity: 70,
        clarity: 80,
        emotion: 60,
        length: 40,
        specificity: 75,
        strengths: ['Clareza'],
        weaknesses: ['Gancho fraco'],
        suggestions: ['Título A', 'Título B', 'Título C'],
      },
      HISTORY_TITLE,
    )
    expect(hydrated?.score).toBe(71)
    expect(hydrated?.alternatives).toHaveLength(3)
    expect(hydrated?.alternatives[0]?.strategy).toBe('original_refined')
  })
})

describe('buildTitleAnalysisPrompt', () => {
  it('separa rubrica de Música e História e inclui o idioma', () => {
    const music: TitleAnalysisPayload = {
      projectType: 'music',
      language: 'de',
      currentTitle: MUSIC_TITLE,
      artistName: 'Johann Falk',
      songTitle: 'ZU VIEL VON ALLEM',
      eventName: 'Festival',
      recentChannelTitles: ['Johann Falk bringt das Zelt zum Beben mit „Feuer“'],
    }
    const history: TitleAnalysisPayload = {
      projectType: 'history',
      language: 'pt-BR',
      currentTitle: HISTORY_TITLE,
    }
    const musicPrompt = buildTitleAnalysisPrompt(music)
    const historyPrompt = buildTitleAnalysisPrompt(history)
    expect(musicPrompt).toContain('PERFIL: MÚSICA')
    expect(musicPrompt).toContain('metrics.musicIdentity')
    expect(musicPrompt).toContain('Idioma do canal/título: de')
    expect(musicPrompt).not.toContain('PERFIL: HISTÓRIA')
    expect(historyPrompt).toContain('PERFIL: HISTÓRIA')
    expect(historyPrompt).toContain('metrics.narrativePromise')
    expect(historyPrompt).not.toContain('PERFIL: MÚSICA')
  })

  it('não envia campos vazios', () => {
    const prompt = buildTitleAnalysisPrompt({
      projectType: 'general',
      currentTitle: 'Título simples',
    })
    expect(prompt).not.toContain('songTitle')
    expect(prompt).not.toContain('performanceDataIfAvailable')
  })
})

describe('hashTitleAnalysisContext', () => {
  it('muda quando o título ou o contexto mudam', () => {
    const base: TitleAnalysisPayload = {
      projectType: 'music',
      language: 'de',
      currentTitle: MUSIC_TITLE,
    }
    const same = hashTitleAnalysisContext(base)
    expect(hashTitleAnalysisContext({ ...base })).toBe(same)
    expect(hashTitleAnalysisContext({ ...base, currentTitle: `${MUSIC_TITLE}!` })).not.toBe(same)
    expect(hashTitleAnalysisContext({ ...base, thumbnailText: 'LIVE' })).not.toBe(same)
  })
})

describe('TITLE_ANALYSIS_SCHEMA', () => {
  it('exige score editorial e alternativas com estratégia', () => {
    expect(TITLE_ANALYSIS_SCHEMA.required).toEqual([
      'score',
      'verdict',
      'metrics',
      'strengths',
      'weaknesses',
      'alternatives',
    ])
    const altSchema = TITLE_ANALYSIS_SCHEMA.properties.alternatives.items.properties.strategy
    expect(altSchema.enum).toEqual(['original_refined', 'hook_first', 'compact'])
  })
})
