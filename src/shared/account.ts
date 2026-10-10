export type AtlasAccount = {
  id: string
  email: string
  name: string
}

export type AtlasSession = {
  user: AtlasAccount | null
}

export type AtlasAuthInput = {
  email: string
  password: string
  name?: string
}

export type TeamChatAttachmentKind = 'image' | 'file'

export type TeamChatAttachment = {
  name: string
  mime: string
  url: string
  kind: TeamChatAttachmentKind
}

export type TeamChatRoomKind = 'dm' | 'group'

export type TeamChatMemberRole = 'admin' | 'member'

export type TeamChatSendInput = {
  roomId: string
  body?: string
  attachmentPath?: string | null
}

export type TeamChatCreateGroupInput = {
  name: string
  memberIds?: string[]
}

export type TeamChatAddMembersInput = {
  roomId: string
  memberIds: string[]
}

export type TeamChatMessage = {
  id: string
  roomId: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
  attachment?: TeamChatAttachment | null
}

export type TeamChatPeer = {
  id: string
  name: string
  email: string
}

export type TeamChatMember = TeamChatPeer & {
  role: TeamChatMemberRole
}

export type TeamChatRoom = {
  id: string
  kind: TeamChatRoomKind
  name: string
  title: string
  createdBy: string
  updatedAt: string
  myRole: TeamChatMemberRole
  memberCount: number
  lastMessagePreview: string | null
  peer?: TeamChatPeer | null
}

export function peersWhoJoined(
  previous: TeamChatPeer[],
  next: TeamChatPeer[],
  selfId: string,
): TeamChatPeer[] {
  const had = new Set(previous.map((peer) => peer.id))
  return next.filter((peer) => peer.id !== selfId && !had.has(peer.id))
}

export function mapAtlasAccount(user: {
  id: string
  email?: string | null
  user_metadata?: { name?: unknown }
}): AtlasAccount {
  const metadataName = typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : ''
  return {
    id: user.id,
    email: user.email?.trim() || '',
    name: metadataName || user.email?.split('@')[0] || 'Usuário',
  }
}
