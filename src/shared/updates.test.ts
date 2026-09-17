import { describe, expect, it } from 'vitest'
import {
  normalizeReleaseNotes,
  realDownloadPercent,
  summarizeReleaseNotes,
  updateNotificationId,
  updateStateLabel,
} from './updates'
import { deriveUpdateNotification } from './notifications'

describe('atualizações', () => {
  it('não inventa porcentagem sem tamanho total', () => {
    expect(realDownloadPercent(0, 0)).toBeNull()
    expect(realDownloadPercent(10, 0)).toBeNull()
    expect(realDownloadPercent(50, 200)).toBe(25)
    expect(realDownloadPercent(0, 100, 12.34)).toBe(0)
  })

  it('resume release notes e ignora vazio', () => {
    expect(summarizeReleaseNotes('')).toBeNull()
    expect(summarizeReleaseNotes([{ note: 'Correções no splash' }])).toBe('Correções no splash')
    expect(summarizeReleaseNotes('a'.repeat(500))?.endsWith('…')).toBe(true)
  })

  it('converte HTML do GitHub em lista sem tags', () => {
    const html =
      '<p>Atlas Studio 1.5.1</p><ul><li>Atualização de manutenção para validação do sistema de auto-update.</li><li>Melhorias internas e correções de estabilidade.</li></ul>'
    const notes = normalizeReleaseNotes(html, { displayedVersion: '1.5.1' })
    expect(notes.title).toBeUndefined()
    expect(notes.items).toEqual([
      'Atualização de manutenção para validação do sistema de auto-update.',
      'Melhorias internas e correções de estabilidade.',
    ])
    expect(JSON.stringify(notes)).not.toMatch(/<\/?[a-z]+/i)
  })

  it('decodifica entidades e ignora conteúdo inesperado', () => {
    expect(normalizeReleaseNotes('<p>A &amp; B &gt; C</p>').text).toBe('A & B > C')
    expect(normalizeReleaseNotes({ foo: 1 }).items).toEqual([])
    expect(normalizeReleaseNotes('[object Object]').items).toEqual([])
  })

  it('resume HTML sem despejar tags', () => {
    const summary = summarizeReleaseNotes(
      '<p>Atlas Studio 1.5.1</p><ul><li>Correção A</li></ul>',
    )
    expect(summary).toContain('Correção A')
    expect(summary).not.toMatch(/<li>|<p>/)
  })

  it('rótulos de estado batem com a UI', () => {
    expect(updateStateLabel('checking')).toBe('Verificando...')
    expect(updateStateLabel('up-to-date')).toBe('Atualizado')
    expect(updateStateLabel('available')).toBe('Nova versão disponível')
    expect(updateStateLabel('downloading')).toBe('Baixando')
    expect(updateStateLabel('ready')).toBe('Atualização pronta')
    expect(updateStateLabel('error')).toBe('Erro')
  })

  it('notificação de versão é estável e não duplica', () => {
    const first = deriveUpdateNotification({
      state: 'available',
      availableVersion: '1.6.0',
    })
    const again = deriveUpdateNotification({
      state: 'ready',
      availableVersion: '1.6.0',
    })
    expect(first?.id).toBe(updateNotificationId('1.6.0'))
    expect(again?.id).toBe(first?.id)
    expect(deriveUpdateNotification({ state: 'up-to-date', availableVersion: null })).toBeNull()
  })
})
