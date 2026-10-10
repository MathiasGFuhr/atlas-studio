import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Notification, type BrowserWindow } from 'electron'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { IPC } from '../../../shared/types'
import {
  peersWhoJoined,
  type TeamChatAttachment,
  type TeamChatAttachmentKind,
  type TeamChatCreateGroupInput,
  type TeamChatMember,
  type TeamChatMemberRole,
  type TeamChatMessage,
  type TeamChatPeer,
  type TeamChatRoom,
  type TeamChatRoomKind,
  type TeamChatSendInput,
} from '../../../shared/account'
import { getAtlasSupabase } from '../supabase/atlasSupabase'
import { accountService } from '../account/accountService'

const BUCKET = 'team-chat'
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
}

type TeamMessageRow = {
  id: string
  room_id: string | null
  author_id: string
  author_name: string
  body: string
  created_at: string
  attachment_name?: string | null
  attachment_mime?: string | null
  attachment_url?: string | null
  attachment_kind?: string | null
}

type TeamRoomRow = {
  id: string
  kind: string
  name: string | null
  created_by: string
  dm_key: string | null
  created_at: string
  updated_at: string
}

type TeamMemberRow = {
  room_id: string
  user_id: string
  role: string
  joined_at: string
}

type ProfileRow = {
  id: string
  email: string
  name: string
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

function mapAttachment(row: TeamMessageRow): TeamChatAttachment | null {
  const url = row.attachment_url?.trim()
  const name = row.attachment_name?.trim()
  const mime = row.attachment_mime?.trim()
  const kind = row.attachment_kind === 'image' || row.attachment_kind === 'file' ? row.attachment_kind : null
  if (!url || !name || !mime || !kind) return null
  return { url, name, mime, kind }
}

function mapMessage(row: TeamMessageRow): TeamChatMessage | null {
  const roomId = row.room_id?.trim()
  if (!roomId) return null
  return {
    id: row.id,
    roomId,
    authorId: row.author_id,
    authorName: row.author_name,
    body: row.body ?? '',
    createdAt: row.created_at,
    attachment: mapAttachment(row),
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

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 120) || 'arquivo'
}

function kindFromExt(ext: string): TeamChatAttachmentKind {
  return IMAGE_EXT.has(ext) ? 'image' : 'file'
}

function asRoomKind(value: string): TeamChatRoomKind {
  return value === 'group' ? 'group' : 'dm'
}

function asMemberRole(value: string): TeamChatMemberRole {
  return value === 'admin' ? 'admin' : 'member'
}

function mapPeer(profile: ProfileRow | undefined, fallbackId: string): TeamChatPeer {
  return {
    id: profile?.id ?? fallbackId,
    name: profile?.name?.trim() || 'Usuário',
    email: profile?.email?.trim() || '',
  }
}

async function uploadAttachment(
  userId: string,
  filePath: string,
): Promise<TeamChatAttachment> {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error('Arquivo não encontrado.')
  }
  const size = fs.statSync(resolved).size
  if (size <= 0) throw new Error('O arquivo está vazio.')
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new Error('O arquivo deve ter no máximo 20 MB.')
  }

  const supabase = getAtlasSupabase()
  if (!supabase) throw new Error('O chat da equipe não está disponível.')

  const ext = path.extname(resolved).toLowerCase()
  const name = path.basename(resolved)
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream'
  const kind = kindFromExt(ext)
  const objectPath = `${userId}/${randomUUID()}-${sanitizeFileName(name)}`
  const buffer = fs.readFileSync(resolved)

  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, buffer, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw new Error(error.message || 'Não foi possível enviar o arquivo.')

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath)
  if (!data?.publicUrl) throw new Error('Não foi possível gerar o link do arquivo.')

  return {
    name,
    mime,
    url: data.publicUrl,
    kind,
  }
}

async function loadProfilesByIds(ids: string[]): Promise<Map<string, ProfileRow>> {
  const supabase = getAtlasSupabase()
  const unique = [...new Set(ids.filter(Boolean))]
  const map = new Map<string, ProfileRow>()
  if (!supabase || unique.length === 0) return map
  const { data, error } = await supabase.from('atlas_profiles').select('id, email, name').in('id', unique)
  if (error) throw new Error(error.message)
  for (const row of (data ?? []) as ProfileRow[]) {
    map.set(row.id, row)
  }
  return map
}

async function mapRoom(
  row: TeamRoomRow,
  selfId: string,
  members: TeamMemberRow[],
  profiles: Map<string, ProfileRow>,
  lastPreview: string | null,
): Promise<TeamChatRoom> {
  const kind = asRoomKind(row.kind)
  const myMembership = members.find((member) => member.user_id === selfId)
  const myRole = asMemberRole(myMembership?.role ?? 'member')
  let peer: TeamChatPeer | null = null
  let title = row.name?.trim() || 'Grupo'

  if (kind === 'dm') {
    const other = members.find((member) => member.user_id !== selfId)
    peer = other ? mapPeer(profiles.get(other.user_id), other.user_id) : null
    title = peer?.name || 'Conversa'
  }

  return {
    id: row.id,
    kind,
    name: row.name?.trim() || '',
    title,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    myRole,
    memberCount: members.length,
    lastMessagePreview: lastPreview,
    peer,
  }
}

export const teamChatService = {
  attachWindow(next: () => BrowserWindow | null) {
    getWindow = next
  },

  listOnline(): TeamChatPeer[] {
    return [...online]
  },

  async listDirectory(): Promise<TeamChatPeer[]> {
    const supabase = getAtlasSupabase()
    if (!supabase) return []
    const session = await accountService.getSession()
    if (!session.user) return []
    const { data, error } = await supabase
      .from('atlas_profiles')
      .select('id, email, name')
      .neq('id', session.user.id)
      .order('name', { ascending: true })
    if (error) throw new Error(error.message)
    return ((data ?? []) as ProfileRow[]).map((row) => mapPeer(row, row.id))
  },

  async listRooms(): Promise<TeamChatRoom[]> {
    const supabase = getAtlasSupabase()
    if (!supabase) return []
    const session = await accountService.getSession()
    if (!session.user) return []

    const { data: memberships, error: membershipError } = await supabase
      .from('team_room_members')
      .select('room_id, user_id, role, joined_at')
      .eq('user_id', session.user.id)
    if (membershipError) throw new Error(membershipError.message)

    const roomIds = ((memberships ?? []) as TeamMemberRow[]).map((row) => row.room_id)
    if (roomIds.length === 0) return []

    const { data: rooms, error: roomsError } = await supabase
      .from('team_rooms')
      .select('*')
      .in('id', roomIds)
      .order('updated_at', { ascending: false })
    if (roomsError) throw new Error(roomsError.message)

    const { data: allMembers, error: membersError } = await supabase
      .from('team_room_members')
      .select('room_id, user_id, role, joined_at')
      .in('room_id', roomIds)
    if (membersError) throw new Error(membersError.message)

    const memberRows = (allMembers ?? []) as TeamMemberRow[]
    const profileIds = memberRows.map((row) => row.user_id)
    const profiles = await loadProfilesByIds(profileIds)

    const previews = new Map<string, string>()
    const { data: recentMessages, error: messagesError } = await supabase
      .from('team_messages')
      .select('room_id, body, created_at')
      .in('room_id', roomIds)
      .order('created_at', { ascending: false })
      .limit(Math.max(roomIds.length * 3, 30))
    if (messagesError) throw new Error(messagesError.message)
    for (const row of (recentMessages ?? []) as Array<{ room_id: string; body: string }>) {
      if (!previews.has(row.room_id)) {
        previews.set(row.room_id, (row.body ?? '').trim())
      }
    }

    const membersByRoom = new Map<string, TeamMemberRow[]>()
    for (const member of memberRows) {
      const list = membersByRoom.get(member.room_id) ?? []
      list.push(member)
      membersByRoom.set(member.room_id, list)
    }

    const mapped = await Promise.all(
      ((rooms ?? []) as TeamRoomRow[]).map((room) =>
        mapRoom(
          room,
          session.user!.id,
          membersByRoom.get(room.id) ?? [],
          profiles,
          previews.get(room.id) ?? null,
        ),
      ),
    )
    return mapped
  },

  async listMembers(roomId: string): Promise<TeamChatMember[]> {
    const supabase = getAtlasSupabase()
    if (!supabase) return []
    const id = roomId.trim()
    if (!id) return []
    const { data, error } = await supabase
      .from('team_room_members')
      .select('room_id, user_id, role, joined_at')
      .eq('room_id', id)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as TeamMemberRow[]
    const profiles = await loadProfilesByIds(rows.map((row) => row.user_id))
    return rows
      .map((row) => ({
        ...mapPeer(profiles.get(row.user_id), row.user_id),
        role: asMemberRole(row.role),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  },

  async listMessages(roomId: string): Promise<TeamChatMessage[]> {
    const supabase = getAtlasSupabase()
    if (!supabase) return []
    const id = roomId.trim()
    if (!id) return []
    const { data, error } = await supabase
      .from('team_messages')
      .select('*')
      .eq('room_id', id)
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) throw new Error(error.message)
    return ((data ?? []) as TeamMessageRow[])
      .map(mapMessage)
      .filter((message): message is TeamChatMessage => Boolean(message))
  },

  async openDm(userId: string): Promise<TeamChatRoom> {
    const supabase = getAtlasSupabase()
    if (!supabase) throw new Error('O chat da equipe não está disponível.')
    const session = await accountService.getSession()
    if (!session.user) throw new Error('Entre com sua conta para conversar.')
    const otherId = userId.trim()
    if (!otherId) throw new Error('Escolha uma pessoa.')

    const { data, error } = await supabase.rpc('team_chat_open_dm', {
      p_other_user_id: otherId,
    })
    if (error || !data) throw new Error(error?.message || 'Não foi possível abrir a conversa.')
    const room = (Array.isArray(data) ? data[0] : data) as TeamRoomRow
    if (!room?.id) throw new Error('Não foi possível abrir a conversa.')
    const members = await this.listMembers(room.id)
    const profiles = await loadProfilesByIds(members.map((member) => member.id))
    const memberRows: TeamMemberRow[] = members.map((member) => ({
      room_id: room.id,
      user_id: member.id,
      role: member.role,
      joined_at: '',
    }))
    return mapRoom(room, session.user.id, memberRows, profiles, null)
  },

  async createGroup(input: TeamChatCreateGroupInput): Promise<TeamChatRoom> {
    const supabase = getAtlasSupabase()
    if (!supabase) throw new Error('O chat da equipe não está disponível.')
    const session = await accountService.getSession()
    if (!session.user) throw new Error('Entre com sua conta para conversar.')
    const name = input.name?.trim() || ''
    if (!name) throw new Error('Informe o nome do grupo.')
    const memberIds = [...new Set((input.memberIds ?? []).map((id) => id.trim()).filter(Boolean))]

    const { data, error } = await supabase.rpc('team_chat_create_group', {
      p_name: name,
      p_member_ids: memberIds,
    })
    if (error || !data) throw new Error(error?.message || 'Não foi possível criar o grupo.')
    const room = (Array.isArray(data) ? data[0] : data) as TeamRoomRow
    if (!room?.id) throw new Error('Não foi possível criar o grupo.')
    const members = await this.listMembers(room.id)
    const profiles = await loadProfilesByIds(members.map((member) => member.id))
    const memberRows: TeamMemberRow[] = members.map((member) => ({
      room_id: room.id,
      user_id: member.id,
      role: member.role,
      joined_at: '',
    }))
    return mapRoom(room, session.user.id, memberRows, profiles, null)
  },

  async addGroupMembers(roomId: string, memberIds: string[]): Promise<TeamChatMember[]> {
    const supabase = getAtlasSupabase()
    if (!supabase) throw new Error('O chat da equipe não está disponível.')
    const session = await accountService.getSession()
    if (!session.user) throw new Error('Entre com sua conta para conversar.')
    const id = roomId.trim()
    const ids = [...new Set(memberIds.map((value) => value.trim()).filter(Boolean))]
    if (!id) throw new Error('Grupo inválido.')
    if (ids.length === 0) throw new Error('Escolha ao menos uma pessoa.')

    const { error } = await supabase.rpc('team_chat_add_members', {
      p_room_id: id,
      p_member_ids: ids,
    })
    if (error) throw new Error(error.message || 'Não foi possível adicionar pessoas.')
    return this.listMembers(id)
  },

  async sendMessage(input: TeamChatSendInput | string): Promise<TeamChatMessage> {
    const payload: TeamChatSendInput =
      typeof input === 'string' ? { roomId: '', body: input } : input ?? { roomId: '' }
    const roomId = payload.roomId?.trim() || ''
    const text = (payload.body ?? '').trim()
    const attachmentPath = payload.attachmentPath?.trim() || ''
    if (!roomId) throw new Error('Selecione uma conversa.')
    if (!text && !attachmentPath) throw new Error('Escreva uma mensagem ou anexe um arquivo.')

    const supabase = getAtlasSupabase()
    if (!supabase) throw new Error('O chat da equipe não está disponível.')
    const session = await accountService.getSession()
    if (!session.user) throw new Error('Entre com sua conta para conversar.')

    let attachment: TeamChatAttachment | null = null
    if (attachmentPath) {
      attachment = await uploadAttachment(session.user.id, attachmentPath)
    }

    const { data, error } = await supabase
      .from('team_messages')
      .insert({
        room_id: roomId,
        author_id: session.user.id,
        author_name: session.user.name,
        body: text || (attachment ? attachment.name : ''),
        attachment_name: attachment?.name ?? null,
        attachment_mime: attachment?.mime ?? null,
        attachment_url: attachment?.url ?? null,
        attachment_kind: attachment?.kind ?? null,
      })
      .select()
      .single()
    if (error || !data) throw new Error(error?.message || 'Não foi possível enviar a mensagem.')
    const message = mapMessage(data as TeamMessageRow)
    if (!message) throw new Error('Não foi possível enviar a mensagem.')
    return message
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
    await accountService.syncProfile(user)
    channel = supabase.channel('atlas-team', {
      config: { presence: { key: user.id } },
    })
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'team_messages' },
      (payload) => {
        const message = mapMessage(payload.new as TeamMessageRow)
        if (message) emit(IPC.teamChat.message, message)
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
