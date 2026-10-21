import type { TeamChatPeer, TeamChatRoom } from '@shared/account'
import { MessagesSquare } from 'lucide-react'
import { Card } from '../Card'
import { formatRelativeDate } from '../../lib/utils'

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

export function HomeTeamChatCard({
  rooms,
  online,
  onOpenRoom,
  onOpenAll,
}: {
  rooms: TeamChatRoom[]
  online: TeamChatPeer[]
  onOpenRoom: (roomId: string) => void
  onOpenAll: () => void
}) {
  const onlineIds = new Set(online.map((peer) => peer.id))
  const items = rooms.slice(0, 5)

  return (
    <Card padding="lg" className="flex h-full min-h-[300px] flex-col">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
            Equipe
          </p>
          <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">
            Comunicações
          </h2>
        </div>
        <button
          type="button"
          onClick={onOpenAll}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-text"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {online.length} online
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <MessagesSquare className="mb-2 h-5 w-5 text-muted-2" />
          <p className="text-sm text-muted-2">Nenhuma conversa ainda.</p>
          <button
            type="button"
            onClick={onOpenAll}
            className="mt-3 text-xs font-medium text-accent hover:text-accent-hover"
          >
            Abrir chat
          </button>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {items.map((room) => {
            const peerOnline =
              room.kind === 'dm' && room.peer ? onlineIds.has(room.peer.id) : false
            return (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => onOpenRoom(room.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-hover/60"
                >
                  <div className="relative shrink-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-elevated text-[11px] font-semibold text-text">
                      {room.kind === 'group' ? (
                        <MessagesSquare className="h-3.5 w-3.5 text-muted" />
                      ) : (
                        initials(room.title)
                      )}
                    </div>
                    {peerOnline ? (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-accent" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-text">{room.title}</p>
                      <span className="shrink-0 text-[10px] text-muted-2">
                        {formatRelativeDate(room.updatedAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {room.lastMessagePreview || (room.kind === 'dm' ? 'Conversa privada' : 'Grupo')}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
