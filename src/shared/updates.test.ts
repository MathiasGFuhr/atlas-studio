import { describe, expect, it } from 'vitest'
import {
  isSidebarUpdateRelevant,
  shouldAutoCheckOnStartup,
  sidebarUpdateStatusLabel,
  normalizeReleaseNotes,
  realDownloadPercent,
  safeUpdateErrorText,
  shouldToastAvailableUpdate,
  sidebarDownloadProgressLabel,
  sidebarUpdateToastMessage,
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

  it('verifica atualização ao abrir só em instalação empacotada e ociosa', () => {
    expect(shouldAutoCheckOnStartup({ state: 'idle', packaged: true, autoCheckEnabled: true })).toBe(true)
    expect(shouldAutoCheckOnStartup({ state: 'up-to-date', packaged: true, autoCheckEnabled: true })).toBe(true)
    expect(shouldAutoCheckOnStartup({ state: 'available', packaged: true, autoCheckEnabled: true })).toBe(false)
    expect(shouldAutoCheckOnStartup({ state: 'idle', packaged: false, autoCheckEnabled: true })).toBe(false)
    expect(shouldAutoCheckOnStartup({ state: 'idle', packaged: true, autoCheckEnabled: false })).toBe(false)
  })

  it('rótulo da sidebar acompanha o estado da atualização', () => {
    expect(sidebarUpdateStatusLabel('available')).toBe('Atualização · Disponível')
    expect(sidebarUpdateStatusLabel('downloading')).toBe('Atualização · Baixando')
    expect(sidebarUpdateStatusLabel('ready')).toBe('Atualização · Pronta')
    expect(sidebarUpdateStatusLabel('error')).toBe('Atualização · Erro')
  })

  it('só mostra o card da sidebar em estados relevantes', () => {
    expect(isSidebarUpdateRelevant({ state: 'idle', availableVersion: null })).toBe(false)
    expect(isSidebarUpdateRelevant({ state: 'checking', availableVersion: null })).toBe(false)
    expect(isSidebarUpdateRelevant({ state: 'up-to-date', availableVersion: null })).toBe(false)
    expect(isSidebarUpdateRelevant({ state: 'dev', availableVersion: null })).toBe(false)
    expect(isSidebarUpdateRelevant({ state: 'available', availableVersion: '1.5.3' })).toBe(true)
    expect(isSidebarUpdateRelevant({ state: 'downloading', availableVersion: '1.5.3' })).toBe(true)
    expect(isSidebarUpdateRelevant({ state: 'ready', availableVersion: '1.5.3' })).toBe(true)
    expect(isSidebarUpdateRelevant({ state: 'error', availableVersion: '1.5.3' })).toBe(false)
    expect(
      isSidebarUpdateRelevant({ state: 'error', availableVersion: '1.5.3' }, { userDownloadError: true }),
    ).toBe(true)
  })

  it('não inventa porcentagem no rótulo de download', () => {
    expect(sidebarDownloadProgressLabel(null)).toBe('Baixando...')
    expect(sidebarDownloadProgressLabel(64)).toBe('Baixando... 64%')
  })

  it('não repete toast da mesma versão e sanitiza erro técnico', () => {
    expect(shouldToastAvailableUpdate({ state: 'available', availableVersion: '1.5.3' }, null)).toBe('1.5.3')
    expect(shouldToastAvailableUpdate({ state: 'available', availableVersion: '1.5.3' }, '1.5.3')).toBeNull()
    expect(shouldToastAvailableUpdate({ state: 'checking', availableVersion: null }, null)).toBeNull()
    expect(sidebarUpdateToastMessage('1.5.3')).toBe('Atlas Studio 1.5.3 está disponível.')
    expect(safeUpdateErrorText('ENOTFOUND github.com\n    at ClientRequest')).toBe(
      'Não foi possível concluir a atualização. Tente novamente em alguns instantes.',
    )
  })
})
