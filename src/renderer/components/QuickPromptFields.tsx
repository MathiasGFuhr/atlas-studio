import type { ReactNode } from 'react'
import { Star } from 'lucide-react'
import { cn } from '../lib/utils'

/** Campo com rótulo e botão de favoritar, usado nos seletores de presets. */
export function FavoriteField({
  label,
  favorite,
  favoritable = true,
  onToggleFavorite,
  children,
}: {
  label: string
  favorite: boolean
  /** "Automático profissional" é uma regra, não um preset favoritável. */
  favoritable?: boolean
  onToggleFavorite: () => void
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-5 items-center justify-between">
        <span className="text-sm font-medium text-muted">{label}</span>
        {favoritable ? (
          <button
            type="button"
            aria-label={favorite ? `Desfavoritar ${label}` : `Favoritar ${label}`}
            aria-pressed={favorite}
            onClick={onToggleFavorite}
            className={cn(
              'rounded-lg p-1 transition-colors',
              favorite ? 'text-accent' : 'text-muted-2 hover:text-text',
            )}
          >
            <Star className={cn('h-3.5 w-3.5', favorite && 'fill-current')} />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm transition-colors',
        checked
          ? 'border-accent/40 bg-accent-dark text-accent'
          : 'border-border bg-card-2 text-muted hover:border-[#334049]',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'flex h-5 w-9 items-center rounded-full px-0.5 transition-colors',
          checked ? 'bg-accent/40' : 'bg-[#232d36]',
        )}
      >
        <span
          className={cn(
            'h-4 w-4 rounded-full bg-current transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </span>
      {label}
    </button>
  )
}
