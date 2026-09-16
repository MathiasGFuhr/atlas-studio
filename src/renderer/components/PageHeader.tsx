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
    <div className="mb-6">
      <p className="mb-2 text-xs text-muted-2">{breadcrumb}</p>
      <h1 className="text-[28px] font-semibold tracking-tight text-text">{title}</h1>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{subtitle}</p>
      {hint ? <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-2">{hint}</p> : null}
    </div>
  )
}
