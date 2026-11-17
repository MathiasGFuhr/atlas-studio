import { cn } from '../lib/utils'

export function PageHeader({
  breadcrumb,
  title,
  subtitle,
  hint,
  className,
}: {
  breadcrumb: string
  title: string
  subtitle: string
  hint?: string
  className?: string
}) {
  return (
    <div className={cn('atlas-page-header mb-6 min-w-0', className)}>
      <p className="mb-2 break-words text-[11px] font-medium uppercase tracking-[0.16em] text-muted-2">{breadcrumb}</p>
      <h1 className="text-2xl font-semibold tracking-[-0.025em] text-balance text-text break-words sm:text-[30px] sm:leading-[1.1]">{title}</h1>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-pretty text-muted">{subtitle}</p>
      {hint ? <p className="mt-1 max-w-3xl text-xs leading-relaxed text-pretty text-muted-2">{hint}</p> : null}
    </div>
  )
}
