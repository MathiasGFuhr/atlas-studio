import { useCallback, useEffect, useState } from 'react'
import heroImage from '../assets/home-hero.jpg'
import { AtlasLogo } from './AtlasLogo'

/** Chave da première 2.0 — só marca como vista ao sair da cena. */
const PREMIERE_KEY = 'atlas.premiere.v2.0'
const LEGACY_KEYS = ['atlas.premiere.v2']
const EXIT_MS = 720
/** Tempo até o CTA aparecer; Enter/Espaço já pulam antes. */
const CTA_READY_MS = 2800

export function shouldShowPremiereV2() {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)
    return localStorage.getItem(PREMIERE_KEY) !== '1'
  } catch {
    return true
  }
}

function markPremiereSeen() {
  try {
    localStorage.setItem(PREMIERE_KEY, '1')
  } catch {
    /* sem storage, a cena só volta ao reiniciar o app */
  }
}

export function WelcomePremiereV2({
  name,
  onDone,
}: {
  name: string
  onDone: () => void
}) {
  const [leaving, setLeaving] = useState(false)
  const [ctaReady, setCtaReady] = useState(false)
  const firstName = name.trim().split(/\s+/)[0] || ''

  const leave = useCallback(() => {
    if (leaving) return
    markPremiereSeen()
    setLeaving(true)
  }, [leaving])

  useEffect(() => {
    const ctaTimer = window.setTimeout(() => setCtaReady(true), CTA_READY_MS)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        leave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(ctaTimer)
      window.removeEventListener('keydown', onKey)
    }
  }, [leave])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(onDone, EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [leaving, onDone])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Atlas Studio 2.0"
      className={`atlas-premiere fixed inset-0 z-[300] overflow-hidden bg-bg ${
        leaving ? 'atlas-premiere--leaving' : ''
      }`}
    >
      <img
        src={heroImage}
        alt=""
        className="atlas-premiere__bg absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,transparent_0%,rgb(7_11_15/0.35)_55%,rgb(7_11_15/0.92)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/55 via-bg/70 to-bg" />
      <div className="atlas-premiere__bloom pointer-events-none absolute left-1/2 top-[42%] h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <div className="atlas-premiere__sheen pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="atlas-premiere__mark mb-8">
          <AtlasLogo variant="mark" className="h-[4.5rem] w-[4.5rem] rounded-[1.35rem] shadow-modal" />
        </div>

        <p className="atlas-premiere__version text-[11px] font-medium uppercase tracking-[0.42em] text-accent">
          Versão 2.0
        </p>

        <h1 className="atlas-premiere__brand home-greeting mt-4 text-[3.4rem] leading-[0.95] text-text sm:text-[5.5rem] md:text-[6.5rem]">
          Atlas Studio
        </h1>

        <p className="atlas-premiere__line mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
          {firstName
            ? `${firstName}, você está entrando no sistema de criação mais avançado que já existiu.`
            : 'Você está entrando no sistema de criação mais avançado que já existiu.'}
        </p>

        <button
          type="button"
          onClick={leave}
          disabled={!ctaReady}
          className="atlas-premiere__cta mt-10 inline-flex h-12 items-center justify-center rounded-xl bg-accent px-8 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:pointer-events-none"
        >
          Entrar no Atlas
        </button>

        <p className="atlas-premiere__hint mt-4 text-[11px] tracking-wide text-muted-2">
          Enter para começar
        </p>
      </div>
    </div>
  )
}
