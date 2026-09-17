import { describe, expect, it } from 'vitest'
import {
  CHAT_DOCK_DEFAULT_HEIGHT,
  CHAT_DOCK_DEFAULT_WIDTH,
  CHAT_DOCK_MAX_WIDTH,
  CHAT_DOCK_MIN_HEIGHT,
  CHAT_DOCK_MIN_WIDTH,
  CHAT_DOCK_VERTICAL_MARGIN,
  clampChatDockSize,
  normalizeChatDockSize,
} from './chatDockSize'

const desktop = { width: 1440, height: 900 }

describe('clampChatDockSize', () => {
  it('respeita mínimo e máximo em viewport grande', () => {
    expect(clampChatDockSize(100, 100, desktop)).toEqual({
      width: CHAT_DOCK_MIN_WIDTH,
      height: CHAT_DOCK_MIN_HEIGHT,
    })
    expect(clampChatDockSize(2000, 2000, desktop)).toEqual({
      width: CHAT_DOCK_MAX_WIDTH,
      height: desktop.height - CHAT_DOCK_VERTICAL_MARGIN,
    })
  })

  it('limita ao espaço disponível em janela menor que o tamanho salvo', () => {
    const small = { width: 700, height: 600 }
    const next = clampChatDockSize(900, 720, small)
    expect(next.width).toBeLessThanOrEqual(Math.floor(700 * 0.8))
    expect(next.width).toBeLessThanOrEqual(700 - 40)
    expect(next.height).toBeLessThanOrEqual(Math.floor(600 * 0.9))
    expect(next.height).toBeLessThanOrEqual(600 - 120)
  })

  it('não exige mínimo maior que o máximo da viewport', () => {
    const tiny = { width: 320, height: 400 }
    const next = clampChatDockSize(540, 720, tiny)
    expect(next.width).toBeLessThan(CHAT_DOCK_MIN_WIDTH)
    expect(next.height).toBeLessThan(CHAT_DOCK_MIN_HEIGHT)
    expect(next.width).toBeGreaterThan(0)
    expect(next.height).toBeGreaterThan(0)
  })
})

describe('normalizeChatDockSize', () => {
  it('usa o tamanho padrão quando o valor persistido é inválido', () => {
    expect(normalizeChatDockSize(undefined, null, desktop)).toEqual({
      width: CHAT_DOCK_DEFAULT_WIDTH,
      height: CHAT_DOCK_DEFAULT_HEIGHT,
    })
  })
})
