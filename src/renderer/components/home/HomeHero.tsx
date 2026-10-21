import heroImage from '../../assets/home-hero.jpg'
import { AtlasLogo } from '../AtlasLogo'
import { quoteForDate } from './homeQuotes'

export function HomeHero({
  hello,
  name,
  dateLabel,
}: {
  hello: string
  name: string
  dateLabel: string
}) {
  const firstName = name.trim().split(/\s+/)[0] || ''

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border-soft/90 shadow-popover">
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt=""
          className="h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/92 via-bg/72 to-bg/28" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg/80 via-transparent to-bg/35" />
      </div>

      <div className="relative grid min-h-[220px] grid-cols-1 items-end gap-6 px-5 py-6 sm:min-h-[260px] sm:px-8 sm:py-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2.5">
            <AtlasLogo variant="mark" className="h-7 w-7 rounded-lg" />
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-2">
              Atlas Studio · {dateLabel}
            </p>
          </div>
          <h1 className="home-greeting mt-3 text-[2rem] leading-[1.1] text-text sm:text-[2.6rem]">
            <span className="home-greeting__hello">{hello}{firstName ? ',' : ''}</span>
            {firstName ? (
              <>
                {' '}
                <span className="text-accent">{firstName}</span>
              </>
            ) : null}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-[15px]">
            Produção, criatividade e crescimento em um só lugar.
          </p>
        </div>

        <blockquote className="max-w-sm justify-self-start rounded-2xl border border-border-soft bg-bg/35 px-4 py-3.5 backdrop-blur-md lg:justify-self-end">
          <p className="home-greeting text-[1.15rem] leading-snug text-text/95 sm:text-[1.35rem]">
            “{quoteForDate()}”
          </p>
        </blockquote>
      </div>
    </section>
  )
}
