import { useEffect, useMemo, useRef, useState } from 'react'
import type { AtlasAccount, TeamChatMessage, TeamChatPeer } from '@shared/account'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { cn } from '../lib/utils'

export function TeamChatPage({ account }: { account: AtlasAccount }) {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const [messages, setMessages] = useState<TeamChatMessage[]>([])
  const [online, setOnline] = useState<TeamChatPeer[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void Promise.all([api.teamChat.listMessages(), api.teamChat.listOnline()]).then(
      ([nextMessages, nextOnline]) => {
        setMessages(nextMessages)
        setOnline(nextOnline)
      },
    )
    const offMessage = api.teamChat.onMessage((message) => {
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current
        return [...current, message]
      })
    })
    const offPresence = api.teamChat.onPresence(setOnline)
    return () => {
      offMessage()
      offPresence()
    }
  }, [api])

  useEffect(() => {
    const node = scroller.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages])

  const others = useMemo(
    () => online.filter((peer) => peer.id !== account.id),
    [account.id, online],
  )

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const message = await api.teamChat.sendMessage(body)
      setDraft('')
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current
        return [...current, message]
      })
    } catch (error) {
      pushError(error, 'Não foi possível enviar.')
    } finally {
      setSending(false)
    }
  }

  return (
    <PageShell scroll={false} className="flex flex-col">
      <PageHeader
        breadcrumb="Equipe"
        title="Chat"
        subtitle="Conversa em tempo real com quem está com o Atlas aberto."
      />
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-card-2">
          <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">
                Nenhuma mensagem ainda. Diga oi para a equipe.
              </p>
            ) : (
              messages.map((message) => {
                const mine = message.authorId === account.id
                return (
                  <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                        mine ? 'bg-accent/15 text-text' : 'bg-bg text-text',
                      )}
                    >
                      <p className="text-[11px] font-medium text-muted">
                        {mine ? 'Você' : message.authorName}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <form
            className="flex gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Escreva para a equipe..."
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-bg px-3.5 text-sm text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
            />
            <Button type="submit" disabled={sending || !draft.trim()} className="h-11">
              Enviar
            </Button>
          </form>
        </section>
        <aside className="rounded-2xl border border-border bg-card-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-2">Online</p>
          <p className="mt-1 text-sm text-muted">{online.length} pessoa(s) na sala</p>
          <ul className="mt-3 space-y-2">
            <li className="text-sm font-medium text-text">{account.name} · você</li>
            {others.map((peer) => (
              <li key={peer.id} className="text-sm text-text">
                {peer.name}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </PageShell>
  )
}
