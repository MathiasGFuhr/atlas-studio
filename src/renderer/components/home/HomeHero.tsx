import { ArrowRight, Sparkles } from 'lucide-react'
import heroImage from '../../assets/home-hero.jpg'
import { AtlasLogo } from '../AtlasLogo'
import { quoteForDate } from './homeQuotes'

export function HomeHero({
  hello,
  name,
  dateLabel,
  onPrimaryAction,
}: {
  hello: string
  name: string
  dateLabel: string
  onPrimaryAction?: () => void
}) {
  const firstName = name.trim().split(/\s+/)[0] || ''

  return (
    <section className="home-v2-hero relative isolate overflow-hidden rounded-[1.75rem] border border-border-soft/70 shadow-popover">
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt=""
          className="home-v2-hero__bg h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/88 to-bg/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <div className="home-v2-hero__bloom pointer-events-none absolute -left-16 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full" />
      </div>

      <div className="relative flex min-h-[280px] flex-col justify-end px-6 py-7 sm:min-h-[320px] sm:px-9 sm:py-9 lg:min-h-[340px]">
        <div className="home-v2-hero__in max-w-2xl" style={{ animationDelay: '80ms' }}>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <AtlasLogo variant="mark" className="h-9 w-9 rounded-xl shadow-card" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-accent">
                Era 2.0
              </p>
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-2">
                Atlas Studio · {dateLabel}
              </p>
            </div>
          </div>

          <h1 className="home-greeting text-[2.35rem] leading-[1.02] tracking-[-0.03em] text-text sm:text-[3.15rem] lg:text-[3.4rem]">
            <span className="home-greeting__hello">{hello}{firstName ? ',' : ''}</span>
            {firstName ? (
              <>
                {' '}
                <span className="home-v2-hero__name">{firstName}</span>
              </>
            ) : null}
          </h1>

          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted sm:text-base">
            O centro de comando da produção musical com IA — mais preciso, mais rápido, mais seu.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {onPrimaryAction ? (
              <button
                type="button"
                onClick={onPrimaryAction}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
              >
                <Sparkles className="h-4 w-4" />
                Novo projeto
                <ArrowRight className="h-4 w-4 opacity-80" />
              </button>
            ) : null}
            <p className="home-greeting max-w-sm text-[0.95rem] leading-snug text-muted-2 sm:text-[1.05rem]">
              “{quoteForDate()}”
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
