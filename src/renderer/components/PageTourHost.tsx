import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ProductTour } from './ProductTour'
import { matchPageTour, PAGE_TOURS } from '../tours/pageTours'

export function PageTourHost({
  ready,
  blocked,
  seen,
  onSeen,
  onActiveChange,
}: {
  ready: boolean
  blocked: boolean
  seen: string[]
  onSeen: (id: string) => void
  onActiveChange?: (active: boolean) => void
}) {
  const { pathname } = useLocation()
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (!ready || blocked) {
      setActiveId(null)
      return
    }
    const id = matchPageTour(pathname)
    if (!id || seen.includes(id)) {
      setActiveId(null)
      return
    }
    const timer = window.setTimeout(() => setActiveId(id), 420)
    return () => window.clearTimeout(timer)
  }, [pathname, ready, blocked, seen])

  const steps = activeId ? PAGE_TOURS[activeId] : null

  useEffect(() => {
    onActiveChange?.(Boolean(steps))
  }, [steps, onActiveChange])

  return (
    <ProductTour
      open={Boolean(steps)}
      steps={steps ?? []}
      firstLabel="Continuar"
      finishLabel="Entendi"
      onComplete={() => {
        if (activeId) onSeen(activeId)
        setActiveId(null)
      }}
    />
  )
}
