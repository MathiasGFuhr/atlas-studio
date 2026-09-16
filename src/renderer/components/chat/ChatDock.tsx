import { MessageSquare, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ChatPage } from '../../pages/ChatPage'
import { onAtlasChatOpen } from '../../lib/chatEvents'
import { cn } from '../../lib/utils'

export function ChatDock() {
  const [open, setOpen] = useState(false)
  const [launchProjectId, setLaunchProjectId] = useState<string | null>(null)

  useEffect(() => {
    return onAtlasChatOpen((detail) => {
      setLaunchProjectId(detail.projectId ?? null)
      setOpen(true)
    })
  }, [])

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Fechar chat' : 'Abrir chat'}
        title="Chat"
        onClick={() => {
          if (open) {
            setOpen(false)
            return
          }
          setOpen(true)
        }}
        className={cn(
          'fixed bottom-5 right-5 z-[45] flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors',
          open
            ? 'bg-card-2 text-text ring-1 ring-border hover:bg-white/10'
            : 'bg-accent text-black hover:bg-accent-hover',
        )}
      >
        {open ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
      </button>

      {open ? (
        <div className="fixed bottom-20 right-5 z-[44] flex h-[min(720px,calc(100vh-7.5rem))] w-[min(100%-2.5rem,540px)] flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
          <ChatPage
            variant="dock"
            launchProjectId={launchProjectId}
            onClose={() => setOpen(false)}
            onLaunchConsumed={() => setLaunchProjectId(null)}
          />
        </div>
      ) : null}
    </>
  )
}
