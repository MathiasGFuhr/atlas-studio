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

export type TeamChatMessage = {
  id: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

export type TeamChatPeer = {
  id: string
  name: string
  email: string
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
