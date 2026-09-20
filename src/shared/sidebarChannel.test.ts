import { describe, expect, it } from 'vitest'
import {
  LAST_SIDEBAR_CHANNEL_KEY,
  channelIdFromPath,
  pickSidebarChannel,
  readLastSidebarChannelId,
  writeLastSidebarChannelId,
} from './sidebarChannel'

function channel(id: string, active = true) {
  return { id, active }
}

describe('channelIdFromPath', () => {
  it('lê o canal nas rotas de calendário e vídeo', () => {
    expect(channelIdFromPath('/canais/abc')).toBe('abc')
    expect(channelIdFromPath('/canais/abc/videos/xyz')).toBe('abc')
  })

  it('ignora a listagem e as páginas compartilhadas', () => {
    expect(channelIdFromPath('/canais')).toBeNull()
    expect(channelIdFromPath('/canais/agenda')).toBeNull()
    expect(channelIdFromPath('/canais/publicados')).toBeNull()
    expect(channelIdFromPath('/musica')).toBeNull()
  })
})

describe('pickSidebarChannel', () => {
  const channels = [channel('a'), channel('b', false), channel('c')]

  it('prioriza o canal da rota atual', () => {
    expect(pickSidebarChannel(channels, { routeChannelId: 'b', lastChannelId: 'c' })?.id).toBe('b')
  })

  it('usa o último canal quando a rota não aponta para um canal da lista', () => {
    expect(pickSidebarChannel(channels, { routeChannelId: 'missing', lastChannelId: 'c' })?.id).toBe('c')
  })

  it('cai no primeiro canal ativo e depois no primeiro da lista', () => {
    expect(pickSidebarChannel(channels)?.id).toBe('a')
    expect(pickSidebarChannel([channel('x', false), channel('y', false)])?.id).toBe('x')
    expect(pickSidebarChannel([])).toBeNull()
  })
})

describe('last sidebar channel storage', () => {
  it('lê e grava o id no storage', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    }

    expect(readLastSidebarChannelId(storage)).toBeNull()
    writeLastSidebarChannelId(storage, 'ch-1')
    expect(store.get(LAST_SIDEBAR_CHANNEL_KEY)).toBe('ch-1')
    expect(readLastSidebarChannelId(storage)).toBe('ch-1')
  })
})
