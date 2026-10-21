import type { ReactNode } from 'react'

export function HomeSection({
  kicker,
  title,
  count,
  action,
  children,
}: {
  kicker?: string
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          {kicker ? (
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-2">
              {kicker}
            </p>
          ) : null}
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-[18px] font-semibold tracking-tight text-text">{title}</h2>
            {count != null ? (
              <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-border-soft bg-elevated px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted">
                {count}
              </span>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}
