import type { HomeActivityItem } from '@shared/homeActivity'
import { Activity } from 'lucide-react'
import { Card } from '../Card'
import { HomeActivityRow } from './HomeActivityRow'

export function HomeActivityCard({
  items,
  onOpen,
}: {
  items: HomeActivityItem[]
  onOpen: (href: string) => void
}) {
  return (
    <Card padding="lg" className="flex min-h-[240px] flex-col">
      <div className="mb-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
          Movimento
        </p>
        <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">
          Atividade recente
        </h2>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Activity className="mb-2 h-5 w-5 text-muted-2" />
          <p className="text-sm text-muted-2">Sem movimento recente.</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border-soft overflow-y-auto">
          {items.map((item) => (
            <HomeActivityRow key={item.id} item={item} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </Card>
  )
}
