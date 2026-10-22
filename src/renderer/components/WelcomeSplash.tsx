import { useCallback, useEffect, useMemo, useState } from 'react'
import heroImage from '../assets/home-hero.jpg'
import { AtlasLogo } from './AtlasLogo'
import { dayOfYear } from './home/homeQuotes'

const SHOWN_KEY = 'atlas.welcomeShown'
const BAR_DELAY_MS = 1100
const BAR_MS = 4000
/** A barra termina cheia e fica parada um instante antes da saída. */
const VISIBLE_MS = BAR_DELAY_MS + BAR_MS + 400
const EXIT_MS = 600

/** Uma frase por dia, na ordem do calendário. */
const LINES = [
  'O estúdio está pronto. Bora criar algo que ninguém esquece.',
  'Mais um dia para transformar ideia em hit.',
  'Seus projetos esperaram por você. Hora de soltar o play.',
  'Cada sessão aqui vira catálogo. Vamos fazer a de hoje valer.',
  'Luz acesa, mesa ligada. O palco é seu.',
  'Hoje é dia de terminar o que começou — e começar o próximo.',
  'O algoritmo não para. Você também não.',
  'Respira, foca e manda ver. O Atlas cuida do resto.',
  'Grandes canais nascem de dias comuns bem trabalhados.',
  'A próxima faixa pode ser a que muda tudo.',
  'Quem publica todo dia não depende de sorte.',
  'Hoje a ideia sai da cabeça e vai para a tela.',
  'O público ainda não sabe, mas está esperando o seu próximo vídeo.',
  'Disciplina hoje, alcance amanhã.',
  'Uma cena por vez. Um sucesso por vez.',
  'O seu estilo é a sua assinatura. Capricha nela hoje.',
  'Menos espera, mais lançamento.',
  'Tudo pronto para mais um dia de criação sem limites.',
  'O play que você der hoje ecoa a semana inteira.',
  'Criar é a parte divertida. Bora começar por ela.',
  'Consistência transforma esforço em audiência.',
  'Seu catálogo cresce cada vez que você aparece.',
  'Hoje tem cena nova, prompt novo e meta batida.',
  'A inspiração gosta de encontrar você trabalhando.',
  'Faça hoje o vídeo que você gostaria de assistir.',
  'Ritmo de produção: ligado.',
  'Pequenos avanços todo dia viram resultado gigante.',
  'O mundo precisa ouvir o que você está criando.',
  'Mais um dia, mais uma chance de viralizar.',
  'Foco no processo. O resultado vem junto.',
  'Bem-vindo de volta ao seu centro de comando.',
]

function greeting(now: Date) {
  const hour = now.getHours()
  if (hour < 5) return 'Madrugada criativa'
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Uma vez por abertura da janela: recarregar a tela não repete a animação. */
export function shouldShowWelcome() {
  try {
    return sessionStorage.getItem(SHOWN_KEY) !== '1'
  } catch {
    return true
  }
}

export function WelcomeSplash({ name, onDone }: { name: string; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const firstName = name.trim().split(/\s+/)[0] || ''
  const { hello, line, dateLabel } = useMemo(() => {
    const now = new Date()
    return {
      hello: greeting(now),
      line: LINES[dayOfYear(now) % LINES.length] ?? LINES[0],
      dateLabel: new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(now),
    }
  }, [])

  const leave = useCallback(() => setLeaving(true), [])

  useEffect(() => {
    try {
      sessionStorage.setItem(SHOWN_KEY, '1')
    } catch {
      /* sem sessionStorage a animação só volta a aparecer ao recarregar */
    }
    const timer = window.setTimeout(leave, VISIBLE_MS)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') leave()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
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
      aria-label="Boas-vindas ao Atlas Studio"
      onClick={leave}
      className={`atlas-welcome fixed inset-0 z-[300] flex cursor-pointer items-center justify-center overflow-hidden bg-bg ${
        leaving ? 'atlas-welcome--leaving' : ''
      }`}
    >
      <img src={heroImage} alt="" className="atlas-welcome__bg absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/70 via-bg/85 to-bg" />
      <div className="atlas-welcome__glow pointer-events-none absolute left-1/2 top-1/2 h-[42rem] w-[42rem] rounded-full" />

      <div className="relative flex max-w-3xl flex-col items-center px-8 text-center">
        <div className="atlas-welcome__logo relative mb-8">
          <span className="atlas-welcome__ring absolute inset-0 rounded-3xl" />
          <AtlasLogo variant="mark" className="relative h-20 w-20 rounded-3xl shadow-popover" />
        </div>

        <p className="atlas-welcome__in text-[11px] font-medium uppercase tracking-[0.32em] text-muted-2 [animation-delay:250ms]">
          Atlas Studio · {dateLabel}
        </p>

        <h1 className="home-greeting mt-5 text-[2.75rem] leading-[1.05] text-text sm:text-[4rem]">
          <span className="atlas-welcome__in home-greeting__hello inline-block [animation-delay:450ms]">
            {hello}
            {firstName ? ',' : ''}
          </span>
          {firstName ? (
            <>
              {' '}
              <span className="atlas-welcome__in atlas-welcome__name inline-block [animation-delay:700ms]">
                {firstName}
              </span>
            </>
          ) : null}
        </h1>

        <p className="atlas-welcome__in mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg [animation-delay:1000ms]">
          {line}
        </p>

        <div className="atlas-welcome__in mt-10 h-[3px] w-56 overflow-hidden rounded-full bg-border-soft [animation-delay:1100ms]">
          <div
            className="atlas-welcome__bar h-full rounded-full bg-accent"
            style={{ animationDuration: `${BAR_MS}ms`, animationDelay: `${BAR_DELAY_MS}ms` }}
          />
        </div>
        <p className="atlas-welcome__in mt-3 text-[11px] text-muted-2 [animation-delay:1300ms]">
          Clique ou aperte Enter para entrar
        </p>
      </div>
    </div>
  )
}
