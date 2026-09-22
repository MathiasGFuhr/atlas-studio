import { ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlobalSearch } from './GlobalSearch'
import { NewMenuButton } from './NewMenuButton'
import { NotificationBell } from './NotificationBell'
import type { AppSettings } from '@shared/types'

export function TopBar({ settings }: { settings: AppSettings | null }) {
  const navigate = useNavigate()

  return (
    <header
      data-tour="topbar"
      className="flex h-14 shrink-0 items-center gap-2 border-b border-border-soft bg-bg/80 px-3 backdrop-blur sm:h-[68px] sm:gap-4 sm:px-6"
    >
      <div className="min-w-0 flex-1">
        <GlobalSearch />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <NewMenuButton />
        <NotificationBell />

        <button
          type="button"
          aria-label="Abrir configurações"
          className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/5"
          onClick={() => navigate('/configuracoes')}
        >
          <div className="h-9 w-9 overflow-hidden rounded-full border border-border bg-gradient-to-br from-[#2b3a44] to-[#10161a]">
            {settings?.accountPhotoDataUrl ? (
              <img
                src={settings.accountPhotoDataUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
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
