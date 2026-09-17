import { describe, expect, it } from 'vitest'
import {
  contentLanguagePromptBlock,
  detectLanguageFromText,
  extractExplicitLanguage,
  normalizeLanguageCode,
  resolveContentLanguage,
} from './shortsLanguage'

describe('shortsLanguage', () => {
  it('normaliza nomes, códigos e rótulos de canal', () => {
    expect(normalizeLanguageCode('de')).toBe('de')
    expect(normalizeLanguageCode('German')).toBe('de')
    expect(normalizeLanguageCode('Alemão')).toBe('de')
    expect(normalizeLanguageCode('pt-br')).toBe('pt-BR')
    expect(normalizeLanguageCode('Português')).toBe('pt-BR')
    expect(normalizeLanguageCode('English')).toBe('en')
    expect(extractExplicitLanguage('Idioma: alemão.')).toBe('de')
    expect(extractExplicitLanguage('Language: German')).toBe('de')
    expect(extractExplicitLanguage('Canal de shows ao vivo na Alemanha')).toBeNull()
  })

  it('detecta alemão no filename/título mesmo sem transcrição', () => {
    const detected = detectLanguageFromText('Als „GEGEN DEN TAKT“ begann, erwachte das gan...')
    expect(detected.code).toBe('de')
    expect(detected.confidence).toBeGreaterThan(0.5)
  })

  it('CASO 1: Atlas PT-BR + vídeo alemão + canal alemão → alemão', () => {
    const resolved = resolveContentLanguage({
      channelLanguage: 'Idioma: alemão.',
      nicheLanguage: 'Português',
      filename: 'Als „GEGEN DEN TAKT“ begann, erwachte das gan.mp4',
      title: 'Als „GEGEN DEN TAKT“ begann',
    })
    expect(resolved.contentLanguage).toBe('de')
    expect(resolved.languageName).toBe('German')
    expect(resolved.languageSource).toBe('channel')
    expect(resolved.languageConfidence).toBeGreaterThanOrEqual(0.9)
  })

  it('CASO 2: Atlas PT-BR + transcript inglês → inglês', () => {
    const resolved = resolveContentLanguage({
      transcriptLanguage: 'en',
      transcriptText: 'The empire began to collapse after the final battle.',
      channelLanguage: 'Idioma: alemão.',
      nicheLanguage: 'Português',
    })
    expect(resolved.contentLanguage).toBe('en')
    expect(resolved.languageSource).toBe('transcript')
    expect(resolved.discrepancy).toBe(true)
  })

  it('CASO 3: vídeo português → português', () => {
    const resolved = resolveContentLanguage({
      transcriptText: 'O império começou a ruir depois da última batalha que você não esperava.',
      filename: 'roma-o-colapso.mp4',
    })
    expect(resolved.contentLanguage).toBe('pt-BR')
    expect(resolved.languageSource).toBe('transcript')
  })

  it('CASO 4: sem transcript, filename alemão + canal alemão → alemão', () => {
    const resolved = resolveContentLanguage({
      filename: 'Als „GEGEN DEN TAKT“ begann.mp4',
      title: 'Als „GEGEN DEN TAKT“ begann',
      channelLanguage: 'de',
      transcriptText: '',
      transcriptLanguage: null,
    })
    expect(resolved.contentLanguage).toBe('de')
    expect(['channel', 'filename']).toContain(resolved.languageSource)
  })

  it('CASO 5: override manual persiste e não é sobrescrito pela detecção', () => {
    const resolved = resolveContentLanguage({
      languageOverride: 'en',
      transcriptLanguage: 'de',
      channelLanguage: 'de',
      filename: 'Als „GEGEN DEN TAKT“ begann.mp4',
    })
    expect(resolved.contentLanguage).toBe('en')
    expect(resolved.languageSource).toBe('override')
    expect(resolved.languageConfidence).toBe(1)
    expect(resolved.detectedLanguage).toBe('de')
  })

  it('CASO 6: regenerar usa o contentLanguage atual', () => {
    const current = resolveContentLanguage({
      languageOverride: 'en',
      transcriptLanguage: 'de',
    })
    const prompt = contentLanguagePromptBlock(current)
    expect(prompt).toContain('contentLanguage: en')
    expect(prompt).toContain('languageName: English')
    expect(prompt).toContain('Generate all viewer-facing metadata in English.')
    expect(prompt).toContain('Do not translate to Portuguese.')
    expect(prompt).toContain('Do not use the UI language.')
  })

  it('não assume português só porque o nicho/UI está em Português', () => {
    const resolved = resolveContentLanguage({
      nicheLanguage: 'Português',
      filename: 'Als „GEGEN DEN TAKT“ begann, erwachte das ganze.mp4',
      title: 'Als „GEGEN DEN TAKT“ begann',
    })
    expect(resolved.contentLanguage).toBe('de')
    expect(resolved.languageSource).toBe('filename')
  })

  it('Automático limpa o override e volta à detecção', () => {
    const resolved = resolveContentLanguage({
      languageOverride: null,
      transcriptLanguage: 'de',
    })
    expect(resolved.contentLanguage).toBe('de')
    expect(resolved.languageSource).toBe('transcript')
  })
})
