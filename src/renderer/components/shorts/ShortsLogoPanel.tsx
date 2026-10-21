import { ImagePlus, Trash2 } from 'lucide-react'
import type { ShortsLogoPosition, ShortsLogoSettings } from '@shared/shortsLogo'
import { SHORTS_LOGO_POSITIONS } from '@shared/shortsLogo'
import { Button } from '../Button'

export function ShortsLogoPanel({
  settings,
  logoUrl,
  placing,
  disabled,
  onPick,
  onClear,
  onChange,
  onTogglePlacing,
}: {
  settings: ShortsLogoSettings
  logoUrl: string | null
  placing: boolean
  disabled?: boolean
  onPick: () => void
  onClear: () => void
  onChange: (patch: Partial<ShortsLogoSettings>) => void
  onTogglePlacing: () => void
}) {
  const hasLogo = Boolean(settings.imagePath && logoUrl)

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text">Logo / marca d&apos;água</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-2">
            Protege o Short com a logo do cantor ou da banda. A imagem entra no MP4 gerado.
          </p>
        </div>
        {hasLogo && logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="h-12 w-12 rounded-lg border border-border-soft bg-elevated object-contain p-1"
          />
        ) : null}
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={settings.enabled && hasLogo}
          disabled={disabled || !hasLogo}
          onChange={(event) => onChange({ enabled: event.target.checked })}
          className="h-4 w-4 accent-accent"
        />
        <span className="text-sm text-text">Mostrar logo no vídeo</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-9 px-3 text-xs"
          disabled={disabled}
          icon={<ImagePlus className="h-3.5 w-3.5" />}
          onClick={onPick}
        >
          {hasLogo ? 'Trocar logo' : 'Escolher logo'}
        </Button>
        {hasLogo ? (
          <Button
            type="button"
            variant="ghost"
            className="h-9 px-3 text-xs"
            disabled={disabled}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={onClear}
          >
            Remover
          </Button>
        ) : null}
      </div>

      {hasLogo ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="text-muted">Posição</span>
            <select
              className="h-10 w-full rounded-xl border border-border-soft bg-elevated px-3 text-sm text-text"
              value={settings.position}
              disabled={disabled}
              onChange={(event) => onChange({ position: event.target.value as ShortsLogoPosition })}
            >
              {SHORTS_LOGO_POSITIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-muted">Opacidade · {Math.round(settings.opacity * 100)}%</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.01}
              value={settings.opacity}
              disabled={disabled}
              onChange={(event) => onChange({ opacity: Number(event.target.value) })}
              className="mt-2 w-full accent-accent"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-muted">Tamanho · {Math.round(settings.scale * 100)}%</span>
            <input
              type="range"
              min={0.1}
              max={0.6}
              step={0.01}
              value={settings.scale}
              disabled={disabled}
              onChange={(event) => onChange({ scale: Number(event.target.value) })}
              className="mt-2 w-full accent-accent"
            />
          </label>
          {settings.position === 'custom' ? (
            <div className="flex items-end">
              <Button
                type="button"
                variant={placing ? 'primary' : 'secondary'}
                className="h-10 w-full text-xs"
                disabled={disabled}
                onClick={onTogglePlacing}
              >
                {placing ? 'Clique no preview…' : 'Posicionar no vídeo'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
