import { cn } from '../../lib/utils'
import { formatBrlInteger, parseBrlDigits } from '@shared/finance/revenueGoal'

export function MoneyField({
  id,
  label,
  value,
  onChange,
  hint,
  className,
}: {
  id: string
  label: string
  value: number
  onChange: (next: number) => void
  hint?: string
  className?: string
}) {
  return (
    <label className={cn('flex w-full min-w-0 flex-col gap-2', className)} htmlFor={id}>
      <span className="text-sm font-medium text-muted">{label}</span>
      <div className="flex h-12 min-w-0 items-center gap-1.5 rounded-xl border border-border bg-input px-3.5 transition-colors hover:border-border-strong focus-within:border-accent/70 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]">
        <span className="shrink-0 text-sm font-semibold text-accent">R$</span>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={formatBrlInteger(value)}
          onChange={(event) => onChange(parseBrlDigits(event.target.value))}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent text-right text-[17px] font-semibold tabular-nums tracking-tight text-text placeholder:text-muted-2 focus:outline-none"
          placeholder="0"
        />
        <span className="shrink-0 text-[17px] font-semibold tabular-nums text-muted-2">,00</span>
      </div>
      {hint ? <span className="text-[11px] leading-snug text-muted-2">{hint}</span> : null}
    </label>
  )
}
