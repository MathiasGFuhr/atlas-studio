import { describe, expect, it } from 'vitest'
import { createMenuOrder } from './createMenu'
import {
  chatAreasPromptNote,
  detectContentAreaPresence,
  filterChatActions,
  filterCreateMenuItems,
  isContentAreaEntityPath,
  preferenceEnablingArea,
  resolveWorkspaceCapabilities,
  contentAreaFromPath,
  MUSIC_PROMPTS_PATH,
  MUSIC_PROMPTS_CUSTOM_PATH,
} from './workspaceCapabilities'

describe('detectContentAreaPresence', () => {
  it('trata canal sem tipo como História', () => {
    expect(
      detectContentAreaPresence({
        channelTypes: [null, 'music'],
        projectTypes: [],
      }),
    ).toEqual({ historyPresent: true, musicPresent: true })
  })

  it('não some História se ainda existir projeto', () => {
    expect(
      detectContentAreaPresence({
        channelTypes: ['music'],
        projectTypes: ['history'],
      }),
    ).toEqual({ historyPresent: true, musicPresent: true })
  })
})

describe('resolveWorkspaceCapabilities', () => {
  it('mostra as duas áreas quando o workspace está vazio', () => {
    const caps = resolveWorkspaceCapabilities(
      { historyPresent: false, musicPresent: false },
      { autoDetect: true, historyEnabled: true, musicEnabled: true },
    )
    expect(caps.historyEnabled).toBe(true)
    expect(caps.musicEnabled).toBe(true)
  })

  it('mostra só Música quando só há dados de Música', () => {
    const caps = resolveWorkspaceCapabilities(
      { historyPresent: false, musicPresent: true },
      { autoDetect: true, historyEnabled: true, musicEnabled: true },
    )
    expect(caps.historyEnabled).toBe(false)
    expect(caps.musicEnabled).toBe(true)
  })

  it('mostra só História quando só há dados de História', () => {
    const caps = resolveWorkspaceCapabilities(
      { historyPresent: true, musicPresent: false },
      { autoDetect: true, historyEnabled: true, musicEnabled: true },
    )
    expect(caps.historyEnabled).toBe(true)
    expect(caps.musicEnabled).toBe(false)
  })

  it('respeita preferência manual', () => {
    const caps = resolveWorkspaceCapabilities(
      { historyPresent: true, musicPresent: true },
      { autoDetect: false, historyEnabled: false, musicEnabled: true },
    )
    expect(caps.historyEnabled).toBe(false)
    expect(caps.musicEnabled).toBe(true)
    expect(caps.autoDetect).toBe(false)
  })
})

describe('menus e chat', () => {
  it('filtra o menu + Novo', () => {
    expect(
      filterCreateMenuItems(createMenuOrder('home'), {
        historyEnabled: false,
        musicEnabled: true,
      }),
    ).toEqual(['music', 'channel', 'task'])
  })

  it('esconde ações exclusivas de História no chat', () => {
    const filtered = filterChatActions(
      [{ name: 'list_scripts' }, { name: 'create_task' }, { name: 'save_quick_prompt' }],
      { historyEnabled: false, musicEnabled: true },
    )
    expect(filtered.map((item) => item.name)).toEqual(['create_task', 'save_quick_prompt'])
  })

  it('descreve áreas visíveis para o agente', () => {
    expect(chatAreasPromptNote({ historyEnabled: false, musicEnabled: true })).toContain('Música')
    expect(chatAreasPromptNote({ historyEnabled: false, musicEnabled: true })).toContain('História')
  })
})

describe('rotas', () => {
  it('preserva rotas de entidades existentes', () => {
    expect(isContentAreaEntityPath('/historia/projetos/abc')).toBe(true)
    expect(isContentAreaEntityPath('/historia/roteiros/xyz')).toBe(true)
    expect(isContentAreaEntityPath('/musica/faixas/1')).toBe(true)
    expect(isContentAreaEntityPath('/historia')).toBe(false)
    expect(isContentAreaEntityPath('/historia/criar')).toBe(false)
    expect(isContentAreaEntityPath(MUSIC_PROMPTS_PATH)).toBe(false)
  })

  it('trata Prompts rápidos como área de Música', () => {
    expect(contentAreaFromPath(MUSIC_PROMPTS_PATH)).toBe('music')
    expect(contentAreaFromPath('/prompts')).toBe('music')
    expect(contentAreaFromPath('/musica')).toBe('music')
    expect(contentAreaFromPath('/historia')).toBe('history')
  })

  it('abre Meus prompts no ambiente de Música', () => {
    expect(MUSIC_PROMPTS_CUSTOM_PATH).toBe('/musica/prompts')
    expect(contentAreaFromPath(MUSIC_PROMPTS_CUSTOM_PATH)).toBe('music')
  })
})

describe('preferenceEnablingArea', () => {
  it('ativa a área oculta sem ligar a outra', () => {
    expect(
      preferenceEnablingArea({ historyEnabled: false, musicEnabled: true }, 'history'),
    ).toEqual({ autoDetect: false, historyEnabled: true, musicEnabled: true })
  })
})
