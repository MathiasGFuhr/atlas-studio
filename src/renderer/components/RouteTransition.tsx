import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

/** Seção da rota (primeiro segmento) — trocar de aba anima; mudar só o id interno não. */
function sectionOf(pathname: string) {
  return pathname.split('/')[1] ?? ''
}

/**
 * Transição de página (transitions.dev · page enter).
 * Usa a Web Animations API no wrapper: nada é remontado, nenhum estado da página
 * se perde, e só transform/opacity são animados (compositor). A animação não
 * deixa transform residual — modais `fixed` continuam ancorados na janela.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const section = sectionOf(pathname)
  const previous = useRef(section)

  useLayoutEffect(() => {
    if (previous.current === section) return
    previous.current = section
    const el = ref.current
    if (!el || typeof el.animate !== 'function') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const animation = el.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
    return () => animation.cancel()
  }, [section])

  return (
    <div ref={ref} className="h-full w-full">
      {children}
    </div>
  )
}

/** Fallback do Suspense: barra fina no topo em vez de tela vazia. */
export function RouteLoadingBar() {
  return (
    <div className="relative h-full w-full overflow-hidden" aria-busy="true" aria-label="Carregando">
      <div className="atlas-route-bar" />
    </div>
  )
}
