import { Download, RefreshCw, RotateCcw } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import {
  UPDATE_NOTES_FALLBACK,
  normalizeReleaseNotes,
  safeUpdateErrorText,
  updateStateLabel,
} from '@shared/updates'
import { Button } from './Button'
import { Card } from './Card'
import { getAtlasApi } from '../lib/api'
import { useAppUpdate } from '../hooks/useAppUpdate'

export function UpdatesSettingsCard({
  settings,
  onSettingsChange,
  highlight,
}: {
  settings: AppSettings
  onSettingsChange: (next: AppSettings) => void
  highlight?: boolean
}) {
  const api = getAtlasApi()
  const { status, busy, check, download, install, minimizeSidebarCard } = useAppUpdate()

  async function persistAutoCheck(enabled: boolean) {
    const next = { ...settings, autoCheckUpdates: enabled }
    onSettingsChange(next)
    const saved = await api.settings.update({ autoCheckUpdates: enabled })
    onSettingsChange(saved)
  }

  const version = status?.currentVersion ?? '—'
  const state = status?.state ?? 'idle'
  const showDownload =
    Boolean(status?.availableVersion) && (state === 'available' || state === 'error')
  const showInstall = state === 'ready'
  const showProgress = state === 'downloading'
  const percent = status?.downloadPercent
  const availableVersion = status?.availableVersion
  const notes = availableVersion
    ? normalizeReleaseNotes(status?.releaseNotes, { displayedVersion: availableVersion })
    : { items: [] as string[] }
  const errorText = safeUpdateErrorText(status?.errorMessage)

  return (
    <Card id="atualizacoes" className={highlight ? 'ring-1 ring-accent/40' : undefined}>
      <div className="mb-4 flex items-center gap-2">
        <RotateCcw className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text">Atualizações</h3>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Versão instalada</span>
          <span className="font-medium tabular-nums text-text">{version}</span>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Status</span>
          <span className="font-medium text-text">{updateStateLabel(state)}</span>
        </div>

        {availableVersion &&
        (state === 'available' || state === 'error' || state === 'downloading' || state === 'ready') ? (
          <div className="rounded-xl border border-border-soft bg-card-2 px-3.5 py-3">
            <p className="text-sm font-semibold text-text">Nova versão disponível</p>
            <p className="mt-0.5 text-sm text-accent">Atlas Studio {availableVersion}</p>
            {notes.title ? (
              <p className="mt-2 text-xs font-medium leading-relaxed text-text">{notes.title}</p>
            ) : null}
            {notes.items.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {notes.items.map((item, index) => (
                  <li key={`${index}-${item.slice(0, 24)}`} className="flex gap-2 text-xs leading-relaxed text-muted">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted/70" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {notes.text ? (
              <p className="mt-2 text-xs leading-relaxed text-muted">{notes.text}</p>
            ) : null}
            {notes.items.length === 0 && !notes.text ? (
              <p className="mt-2 text-xs leading-relaxed text-muted">{UPDATE_NOTES_FALLBACK}</p>
            ) : null}
          </div>
        ) : null}

        {showProgress ? (
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>Baixando</span>
              <span className="tabular-nums">
                {percent == null ? 'calculando tamanho…' : `${percent}%`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full bg-accent transition-[width] duration-200 ${
                  percent == null ? 'w-full animate-pulse opacity-50' : ''
                }`}
                style={percent == null ? undefined : { width: `${percent}%` }}
              />
            </div>
          </div>
        ) : null}

        {showInstall ? (
          <p className="text-sm text-text">Atualização pronta para instalar.</p>
        ) : null}

        {errorText && (state === 'error' || state === 'unsupported') ? (
          <p className="text-xs leading-relaxed text-danger">{errorText}</p>
        ) : null}

        {state === 'dev' ? (
          <p className="text-xs leading-relaxed text-muted">
            Em desenvolvimento o atualizador não baixa versões. Use uma instalação empacotada para
            testar o fluxo completo.
          </p>
        ) : null}

        <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#35e58b]"
            checked={settings.autoCheckUpdates !== false}
            onChange={(event) => void persistAutoCheck(event.target.checked)}
          />
          Verificar automaticamente
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<RefreshCw className={`h-4 w-4 ${busy && state === 'checking' ? 'animate-spin' : ''}`} />}
            disabled={busy || state === 'downloading'}
            onClick={() => void check()}
          >
            Verificar atualizações
          </Button>
          {showDownload ? (
            <Button
              icon={<Download className="h-4 w-4" />}
              disabled={busy}
              onClick={() => void download()}
            >
              Baixar atualização
            </Button>
          ) : null}
          {showInstall ? (
            <>
              <Button
                disabled={busy}
                onClick={() => void install()}
              >
                Reiniciar e atualizar
              </Button>
              <Button variant="ghost" disabled={busy} onClick={minimizeSidebarCard}>
                Depois
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
