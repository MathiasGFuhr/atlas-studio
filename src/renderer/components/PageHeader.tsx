export function PageHeader({
  breadcrumb,
  title,
  subtitle,
  hint,
}: {
  breadcrumb: string
  title: string
  subtitle: string
  hint?: string
}) {
  return (
    <div className="mb-6 min-w-0">
      <p className="mb-2 break-words text-xs text-muted-2">{breadcrumb}</p>
      <h1 className="text-2xl font-semibold tracking-tight text-text break-words sm:text-[28px]">{title}</h1>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-pretty text-muted">{subtitle}</p>
      {hint ? <p className="mt-1 max-w-3xl text-xs leading-relaxed text-pretty text-muted-2">{hint}</p> : null}
    </div>
  )
}
