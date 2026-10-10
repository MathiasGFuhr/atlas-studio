import fs from 'node:fs'
import path from 'node:path'
import { Notification, type BrowserWindow } from 'electron'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { IPC } from '../../../shared/types'
import { peersWhoJoined, type TeamChatMessage, type TeamChatPeer } from '../../../shared/account'
import { getAtlasSupabase } from '../supabase/atlasSupabase'
import { accountService } from '../account/accountService'

type TeamMessageRow = {
  id: string
  author_id: string
  author_name: string
  body: string
  created_at: string
}

let channel: RealtimeChannel | null = null
let getWindow: (() => BrowserWindow | null) | null = null
let online: TeamChatPeer[] = []
let presenceReady = false

function resolveNotifyIcon(): string | undefined {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'icon.ico'),
    path.join(process.cwd(), 'build', 'icon.ico'),
  ]
  return candidates.find((candidate) => candidate && fs.existsSync(candidate))
}

function showOnlineToast(peer: TeamChatPeer) {
  if (!Notification.isSupported()) return
  const toast = new Notification({
    title: 'Atlas Studio',
    body: `${peer.name.trim() || 'Alguém'} entrou e está online`,
    icon: resolveNotifyIcon(),
  })
  toast.on('click', () => {
    const win = getWindow?.()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    emit(IPC.teamChat.openChat, null)
  })
  toast.show()
}

function mapMessage(row: TeamMessageRow): TeamChatMessage {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
  }
}

function emit(channelName: string, payload: unknown) {
  const win = getWindow?.()
  if (win && !win.isDestroyed()) win.webContents.send(channelName, payload)
}

function peersFromPresence(state: Record<string, Array<Record<string, unknown>>>): TeamChatPeer[] {
  const byId = new Map<string, TeamChatPeer>()
  for (const metas of Object.values(state)) {
    for (const meta of metas) {
      const id = typeof meta.id === 'string' ? meta.id : ''
      if (!id) continue
      byId.set(id, {
        id,
        name: typeof meta.name === 'string' && meta.name.trim() ? meta.name : 'Usuário',
        email: typeof meta.email === 'string' ? meta.email : '',
      })
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export const teamChatService = {
  attachWindow(next: () => BrowserWindow | null) {
    getWindow = next
  },

  listOnline(): TeamChatPeer[] {
    return [...online]
  },

  async listMessages(): Promise<TeamChatMessage[]> {
    const supabase = getAtlasSupabase()
    if (!supabase) return []
    const { data, error } = await supabase
      .from('team_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) throw new Error(error.message)
    return ((data ?? []) as TeamMessageRow[]).map(mapMessage)
  },

  async sendMessage(body: string): Promise<TeamChatMessage> {
    const text = body.trim()
    if (!text) throw new Error('Escreva uma mensagem.')
    const supabase = getAtlasSupabase()
    if (!supabase) throw new Error('O chat da equipe não está disponível.')
    const session = await accountService.getSession()
    if (!session.user) throw new Error('Entre com sua conta para conversar.')
    const { data, error } = await supabase
      .from('team_messages')
      .insert({
        author_id: session.user.id,
        author_name: session.user.name,
        body: text,
      })
      .select()
      .single()
    if (error || !data) throw new Error(error?.message || 'Não foi possível enviar a mensagem.')
    return mapMessage(data as TeamMessageRow)
  },

  async start() {
    const supabase = getAtlasSupabase()
    const session = await accountService.getSession()
    if (!supabase || !session.user) {
      this.stop()
      return
    }
    this.stop()
    const user = session.user
    channel = supabase.channel('atlas-team', {
      config: { presence: { key: user.id } },
    })
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'team_messages' },
      (payload) => {
        emit(IPC.teamChat.message, mapMessage(payload.new as TeamMessageRow))
      },
    )
    channel.on('presence', { event: 'sync' }, () => {
      const next = peersFromPresence(channel?.presenceState() ?? {})
      if (presenceReady) {
        for (const peer of peersWhoJoined(online, next, user.id)) {
          emit(IPC.teamChat.peerOnline, peer)
          showOnlineToast(peer)
        }
      }
      presenceReady = true
      online = next
      emit(IPC.teamChat.presence, online)
    })
    await channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED' || !channel) return
      await channel.track({
        id: user.id,
        name: user.name,
        email: user.email,
      })
    })
  },

  stop() {
    if (channel) {
      void channel.unsubscribe()
      channel = null
    }
    online = []
    presenceReady = false
    emit(IPC.teamChat.presence, [])
  },
}
