import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { Channel } from '@shared/types'
import {
  channelIdFromPath,
  pickSidebarChannel,
  readLastSidebarChannelId,
} from '@shared/sidebarChannel'
import { getAtlasApi } from '../lib/api'
import { onChannelsChanged } from '../lib/channelEvents'
import {
  notifySidebarChannelChanged,
  onSidebarChannelChanged,
} from '../lib/sidebarChannelEvents'

function sortChannels(channels: Channel[]): Channel[] {
  return [...channels].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
  )
}

export function usePrimaryChannel() {
  const api = getAtlasApi()
  const { pathname } = useLocation()
  const [channels, setChannels] = useState<Channel[]>([])
  const [lastChannelId, setLastChannelId] = useState<string | null>(() =>
    readLastSidebarChannelId(typeof localStorage === 'undefined' ? null : localStorage),
  )

  const routeChannelId = channelIdFromPath(pathname)
  const musicChannels = useMemo(
    () => sortChannels(channels.filter((channel) => channel.channelType === 'music')),
    [channels],
  )
  const selected = useMemo(
    () => pickSidebarChannel(musicChannels, { routeChannelId, lastChannelId }),
    [musicChannels, routeChannelId, lastChannelId],
  )

  const load = useCallback(async () => {
    const list = await api.channels.list({ channelType: 'music' })
    setChannels(list)
  }, [api])

  useEffect(() => {
    void load()
    return onChannelsChanged(() => {
      void load()
    })
  }, [load])

  useEffect(() => {
    return onSidebarChannelChanged((id) => setLastChannelId(id))
  }, [])

  useEffect(() => {
    if (!selected) return
    if (lastChannelId === selected.id) return
    notifySidebarChannelChanged(selected.id)
    setLastChannelId(selected.id)
  }, [selected, lastChannelId])

  const setPrimaryChannel = useCallback((channel: Channel) => {
    notifySidebarChannelChanged(channel.id)
    setLastChannelId(channel.id)
  }, [])

  return {
    pathname,
    channels: musicChannels,
    selected,
    setPrimaryChannel,
  }
}
