import type { ShortsAspectMode } from '@shared/shorts'
import type { ShortsFramingSettings, ShortsFramingMode, ShortsSubjectRole } from '@shared/shortsFraming'
import { SHORTS_FRAMING_MODES, verticalFramingMode } from '@shared/shortsFraming'
import { Button } from '../Button'
import { Card } from '../Card'
import { cn } from '../../lib/utils'

export function ShortsFramingPanel({
  aspectMode,
  settings,
  subjects,
  usedFallback,
  disabled,
  onModeChange,
  onSettingsChange,
}: {
  aspectMode: ShortsAspectMode
  settings: ShortsFramingSettings
  subjects: Array<{ id: string; label: string }>
  usedFallback?: boolean
  disabled?: boolean
  onModeChange: (mode: ShortsFramingMode) => void
  onSettingsChange: (patch: Partial<ShortsFramingSettings>) => void
}) {
  const mode = verticalFramingMode(aspectMode)
  const picking = settings.picking

  function togglePick(role: ShortsSubjectRole) {
    onSettingsChange({ picking: picking === role ? null : role })
  }

  return (
    <Card className="space-y-4 md:col-span-2">
      <div>
        <p className="text-sm font-medium text-text">Enquadramento vertical</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-2">
          O recorte 9:16 segue o palco no preview e na exportação. Sem detecção confiável, o Atlas usa o centro seguro.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {SHORTS_FRAMING_MODES.map((item) => (
          <label
            key={item.id}
            className={cn(
              'flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5',
              mode === item.id ? 'border-accent/60 bg-accent-dark' : 'border-border bg-card-2',
            )}
          >
            <input
              type="radio"
              name="shorts-framing-mode"
              className="mt-1 accent-accent"
              checked={mode === item.id}
              disabled={disabled}
              onChange={() => onModeChange(item.id)}
            />
            <span>
              <span className="block text-sm text-text">{item.label}</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-2">{item.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">Controles manuais</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={picking === 'lead' ? 'primary' : 'secondary'}
            className="h-9 px-3 text-xs"
            disabled={disabled}
            onClick={() => togglePick('lead')}
          >
            {picking === 'lead' ? 'Clique no cantor no preview' : 'Definir cantor principal'}
          </Button>
          <Button
            variant={picking === 'subject1' ? 'primary' : 'secondary'}
            className="h-9 px-3 text-xs"
            disabled={disabled}
            onClick={() => togglePick('subject1')}
          >
            {picking === 'subject1' ? 'Clique no sujeito 1' : 'Definir sujeito 1'}
          </Button>
          <Button
            variant={picking === 'subject2' ? 'primary' : 'secondary'}
            className="h-9 px-3 text-xs"
            disabled={disabled}
            onClick={() => togglePick('subject2')}
          >
            {picking === 'subject2' ? 'Clique no sujeito 2' : 'Definir sujeito 2'}
          </Button>
        </div>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-accent"
            checked={settings.lockLead}
            disabled={disabled}
            onChange={(event) => onSettingsChange({ lockLead: event.target.checked, picking: null })}
          />
          <span className="text-sm text-text">
            Travar foco no cantor
            <span className="mt-0.5 block text-xs text-muted-2">O 9:16 não troca de pessoa, mesmo se outro se mexer mais.</span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-accent"
            checked={settings.preferSplit}
            disabled={disabled}
            onChange={(event) => onSettingsChange({ preferSplit: event.target.checked, picking: null })}
          />
          <span className="text-sm text-text">
            Preferir tela dividida
            <span className="mt-0.5 block text-xs text-muted-2">Se dois sujeitos importantes estiverem afastados, empilha os recortes.</span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-accent"
            checked={settings.preventFocusSwitch}
            disabled={disabled}
            onChange={(event) =>
              onSettingsChange({ preventFocusSwitch: event.target.checked, picking: null })
            }
          />
          <span className="text-sm text-text">
            Impedir troca automática de foco
            <span className="mt-0.5 block text-xs text-muted-2">Mantém o sujeito escolhido até você mudar manualmente.</span>
          </span>
        </label>
      </div>
      {subjects.length > 0 ? (
        <p className="text-xs text-muted-2">
          Detectados: {subjects.map((item) => item.label).join(', ')}
        </p>
      ) : null}
      {usedFallback ? (
        <p className="text-xs text-muted">Sem detecção confiável neste trecho. Usando recorte central.</p>
      ) : null}
    </Card>
  )
}
