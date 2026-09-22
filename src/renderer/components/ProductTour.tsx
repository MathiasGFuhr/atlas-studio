import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Compass, Layers, MessageSquare, PanelLeft, Search, Sparkles, Wand2, type LucideIcon } from 'lucide-react'
import { Button } from './Button'
import { placeTourCard, type TourRect } from './productTourLayout'
import { setProductTourActive } from '../lib/productTourEvents'
import { cn } from '../lib/utils'

type TourStep = {
  id: string
  target: string | null
  icon: LucideIcon
  kicker: string
  title: string
  body: string
  note?: string
}

export const INTRO_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: null,
    icon: Sparkles,
    kicker: 'Primeiro acesso',
    title: 'Bem-vindo ao Atlas Studio',
    body: 'O Atlas é o estúdio da sua produção. Roteiro, música, agenda e pendências ficam no mesmo lugar, no ritmo do canal.',
    note: 'O passeio leva menos de um minuto. Esc pula, e dá para rever em Configurações.',
  },
  {
    id: 'sidebar',
    target: '[data-tour="sidebar"]',
    icon: PanelLeft,
    kicker: 'Navegação',
    title: 'O mapa do estúdio',
    body: 'O canal ativo fica no topo: calendário e atalhos seguem essa escolha. Abaixo estão Início, História, Música, Canais, Shorts Studio e Tarefas.',
  },
  {
    id: 'topbar',
    target: '[data-tour="topbar"]',
    icon: Search,
    kicker: 'Atalhos',
    title: 'Busque, crie e abra a conta',
    body: 'A busca encontra projetos, roteiros, canais e temas. Novo cria projeto, canal ou tarefa a partir de qualquer tela. O perfil abre as configurações.',
  },
  {
    id: 'modules',
    target: '[data-tour="modules"]',
    icon: Layers,
    kicker: 'Produção',
    title: 'História e Música',
    body: 'História concentra pesquisa, roteiro e revisão. Música organiza projeto, faixa, corte e prompt. A agenda e as pendências do dia ficam logo abaixo.',
  },
  {
    id: 'ai',
    target: '[data-tour="ai"]',
    icon: Wand2,
    kicker: 'Inteligência',
    title: 'Conecte a IA do Atlas',
    body: 'Este cartão mostra se o Codex e o Antigravity estão prontos. Com eles, o Atlas pesquisa, escreve, revisa e analisa títulos. A vinculação fica em Configurações.',
  },
  {
    id: 'chat',
    target: '[data-tour="chat"]',
    icon: MessageSquare,
    kicker: 'Assistente',
    title: 'Fale com o Atlas',
    body: 'Este botão abre o chat. Peça um roteiro, uma revisão ou uma ideia. O assistente acompanha o que você está produzindo.',
  },
  {
    id: 'done',
    target: null,
    icon: Compass,
    kicker: 'Pronto',
    title: 'O estúdio é seu',
    body: 'Escolha o canal, crie o primeiro projeto e publique no calendário. Quando quiser gerar com IA, vincule o Codex.',
    note: 'Cada tela nova também tem um tutorial curto na primeira visita. Para rever a introdução: Configurações → Introdução.',
  },
]

const SPOTLIGHT_PAD = 8

function readRect(element: HTMLElement): TourRect {
  const bounds = element.getBoundingClientRect()
  return {
    top: bounds.top,
    left: bounds.left,
    width: bounds.width,
    height: bounds.height,
    right: bounds.right,
    bottom: bounds.bottom,
  }
}

export function ProductTour({
  open,
  steps,
  aiConnected = false,
  offerConnect = false,
  focusHome = false,
  firstLabel = 'Começar',
  finishLabel = 'Começar a usar',
  onComplete,
  onConnectAi,
}: {
  open: boolean
  steps: TourStep[]
  aiConnected?: boolean
  offerConnect?: boolean
  focusHome?: boolean
  firstLabel?: string
  finishLabel?: string
  onComplete: () => void
  onConnectAi?: () => void
}) {
  const navigate = useNavigate()
  const [stepIndex, setStepIndex] = useState(0)
  const [spot, setSpot] = useState<TourRect | null>(null)
  const [cardPos, setCardPos] = useState({ top: 80, left: 80 })
  const cardRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)
  const revealedStepRef = useRef<string | null>(null)
  const stepIndexRef = useRef(0)
  const stepsRef = useRef(steps)
  stepIndexRef.current = stepIndex
  stepsRef.current = steps

  const step = steps[stepIndex] ?? steps[0]
  const isFirst = stepIndex === 0
  const isLast = steps.length === 0 || stepIndex === steps.length - 1

  useEffect(() => {
    if (!open) return
    setProductTourActive(true)
    return () => setProductTourActive(false)
  }, [open])

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setStepIndex(0)
      revealedStepRef.current = null
      if (focusHome) navigate('/')
    }
    wasOpenRef.current = open
  }, [open, navigate, focusHome])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onComplete()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (stepIndexRef.current >= stepsRef.current.length - 1) {
          onComplete()
          return
        }
        setStepIndex((current) => Math.min(stepsRef.current.length - 1, current + 1))
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setStepIndex((current) => Math.max(0, current - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onComplete])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('atlas-tour-primary')?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, stepIndex])

  useLayoutEffect(() => {
    if (!open || !step) return
    let frame = 0

    function measure() {
      const card = cardRef.current
      const cardWidth = card?.offsetWidth ?? 420
      const cardHeight = card?.offsetHeight ?? 280
      const target = step.target ? document.querySelector(step.target) : null

      if (!(target instanceof HTMLElement)) {
        setSpot(null)
        setCardPos(placeTourCard(null, cardWidth, cardHeight))
        return
      }

      const main = document.querySelector('main')
      if (main?.contains(target) && revealedStepRef.current !== step.id) {
        revealedStepRef.current = step.id
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
      }

      const rect = readRect(target)
      if (rect.width < 8 || rect.height < 8) {
        setSpot(null)
        setCardPos(placeTourCard(null, cardWidth, cardHeight))
        return
      }

      setSpot(rect)
      setCardPos(placeTourCard(rect, cardWidth, cardHeight))
    }

    measure()
    const timers = [80, 260, 460].map((delay) => window.setTimeout(measure, delay))
    function onChange() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measure)
    }
    window.addEventListener('resize', onChange)
    window.addEventListener('scroll', onChange, true)
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', onChange)
      window.removeEventListener('scroll', onChange, true)
    }
  }, [open, step])

  if (!open || !step) return null

  const Icon = step.icon
  const primaryLabel = isFirst ? firstLabel : isLast ? finishLabel : 'Próximo'

  function goNext() {
    if (isLast) {
      onComplete()
      return
    }
    setStepIndex((current) => Math.min(steps.length - 1, current + 1))
  }

  function goBack() {
    setStepIndex((current) => Math.max(0, current - 1))
  }

  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div className="absolute inset-0" />
      {spot ? (
        <div
          aria-hidden
          className="atlas-tour-spot pointer-events-none absolute"
          style={{
            top: spot.top - SPOTLIGHT_PAD,
            left: spot.left - SPOTLIGHT_PAD,
            width: spot.width + SPOTLIGHT_PAD * 2,
            height: spot.height + SPOTLIGHT_PAD * 2,
            borderRadius: 18,
            boxShadow:
              '0 0 0 1.5px rgba(53,229,139,0.95), 0 0 28px rgba(53,229,139,0.28), 0 0 0 9999px rgba(5,8,11,0.78)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(5,8,11,0.78)] backdrop-blur-[2px]" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas-product-tour-title"
        className="atlas-tour-card absolute w-[min(420px,calc(100vw-32px))] rounded-2xl border border-border bg-card shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        style={{ top: cardPos.top, left: cardPos.left }}
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-dark text-accent">
              <Icon className="h-5 w-5" />
            </div>
            <p className="pt-1 text-[11px] font-medium tabular-nums tracking-[0.16em] text-muted-2">
              {String(stepIndex + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
            </p>
          </div>

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{step.kicker}</p>
          <h2 id="atlas-product-tour-title" className="mt-1.5 text-xl font-semibold tracking-tight text-text">
            {step.title}
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed text-muted">{step.body}</p>
          {step.note ? (
            <p className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2.5 text-xs leading-relaxed text-muted-2 ring-1 ring-border-soft">
              {step.note}
            </p>
          ) : null}

          <div className="mt-5 flex gap-1" aria-hidden>
            {steps.map((item, index) => (
              <span
                key={item.id}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  index <= stepIndex ? 'bg-accent' : 'bg-white/10',
                )}
              />
            ))}
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            {isLast ? null : (
              <button
                type="button"
                onClick={onComplete}
                className="mr-auto text-sm text-muted transition-colors hover:text-text"
              >
                Pular
              </button>
            )}
            <div className="flex items-center gap-2">
              {isFirst ? null : (
                <Button variant="ghost" className="h-10 px-3" onClick={goBack}>
                  Voltar
                </Button>
              )}
              {isLast && offerConnect && !aiConnected && onConnectAi ? (
                <Button variant="secondary" className="h-10 px-3" onClick={onConnectAi}>
                  Vincular IA
                </Button>
              ) : null}
              <Button id="atlas-tour-primary" className="h-10 px-3.5" onClick={goNext}>
                {primaryLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
