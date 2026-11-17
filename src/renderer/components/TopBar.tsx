import { ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlobalSearch } from './GlobalSearch'
import { HeaderChannelSwitcher } from './HeaderChannelSwitcher'
import { NewMenuButton } from './NewMenuButton'
import { NotificationBell } from './NotificationBell'
import type { AppSettings } from '@shared/types'

export function TopBar({ settings }: { settings: AppSettings | null }) {
  const navigate = useNavigate()

  return (
    <header
      data-tour="topbar"
      className="relative flex h-14 shrink-0 items-center gap-2 border-b border-border-soft bg-topbar px-3 sm:h-[68px] sm:gap-4 sm:px-6"
    >
      <div className="min-w-0 flex-1 basis-[12rem] max-w-[22rem]">
        <GlobalSearch />
      </div>

      <div className="flex min-w-0 flex-[1.4] justify-center">
        <HeaderChannelSwitcher />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <NewMenuButton />
        <NotificationBell />

        <button
          type="button"
          aria-label="Abrir configurações"
          className="atlas-press group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-hover"
          onClick={() => navigate('/configuracoes')}
        >
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-hover text-[12px] font-semibold uppercase text-muted ring-2 ring-transparent transition-[box-shadow] duration-300 group-hover:ring-accent/25">
            {settings?.accountPhotoDataUrl ? (
              <img
                src={settings.accountPhotoDataUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              (settings?.accountName?.trim() || 'A').charAt(0)
            )}
          </div>
          <div className="hidden min-w-0 text-left lg:block">
            <div className="max-w-[140px] truncate text-sm font-medium text-text">
              {settings?.accountName || 'Atlas Studio'}
            </div>
            <div className="text-xs text-muted">{settings?.accountRole || 'Editor'}</div>
          </div>
          <ChevronDown className="hidden h-4 w-4 text-muted sm:block" />
        </button>
      </div>
    </header>
  )
}
