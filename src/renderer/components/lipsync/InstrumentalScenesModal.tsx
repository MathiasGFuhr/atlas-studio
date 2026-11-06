import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { INSTRUMENTAL_PRESETS, resolveInstrumentalChoice, type InstrumentalChoice } from '@shared/lipSyncRefs'
import { cn } from '../../lib/utils'
import { Button } from '../Button'
import { Modal } from '../Modal'

function sceneLabel(number: number): string {
  return String(number).padStart(2, '0')
}

function emptyChoice(): InstrumentalChoice {
  return { presetIds: [], custom: '' }
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function InstrumentalScenesModal({
  numbers,
  choices,
  applying,
  hasConflicts,
  reason = 'folder',
  audioUrls = {},
  onChange,
  onClose,
  onConfirm,
}: {
  numbers: number[]
  choices: Record<number, InstrumentalChoice | undefined>
  applying: boolean
  hasConflicts: boolean
  /** `empty-lyrics`: cenas já na fila sem trecho; `folder`: áudio sem .txt na pasta. */
  reason?: 'folder' | 'empty-lyrics'
  /** URL atlas-media do áudio por número da cena. */
  audioUrls?: Record<number, string | null | undefined>
  onChange: (number: number, choice: InstrumentalChoice) => void
  onClose: () => void
  onConfirm: (replaceExisting: boolean) => void
}) {
  const [step, setStep] = useState(0)
  const [tracked, setTracked] = useState('')
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const track = numbers.join(',')
  if (track !== tracked) {
    setTracked(track)
    setStep(0)
  }

  const index = Math.min(step, Math.max(numbers.length - 1, 0))
  const number = numbers[index]
  const choice = number === undefined ? emptyChoice() : (choices[number] ?? emptyChoice())
  const selected = new Set(choice.presetIds)
  const custom = choice.custom
  const ready = Boolean(number !== undefined && resolveInstrumentalChoice(choice))
  const last = index >= numbers.length - 1
  const audioUrl = number === undefined ? null : (audioUrls[number] ?? null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    if (audioUrl) {
      audio.src = audioUrl
      audio.load()
    } else {
      audio.removeAttribute('src')
      audio.load()
    }
  }, [audioUrl, number])

  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (!audio) return
      audio.pause()
      audio.removeAttribute('src')
    }
  }, [])

  function toggle(presetId: string) {
    if (number === undefined) return
    const nextIds = selected.has(presetId)
      ? choice.presetIds.filter((id) => id !== presetId)
      : [...choice.presetIds, presetId]
    onChange(number, { presetIds: nextIds, custom: choice.custom })
  }

  function setCustom(value: string) {
    if (number === undefined) return
    onChange(number, { presetIds: choice.presetIds, custom: value })
  }

  async function togglePlay() {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    try {
      if (playing) {
        audio.pause()
        setPlaying(false)
        return
      }
      await audio.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
    }
  }

  const title =
    number === undefined
      ? 'Trechos sem letra'
      : `Cena ${sceneLabel(number)} · ${index + 1} de ${numbers.length}`

  return (
    <Modal
      open={numbers.length > 0}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={applying} onClick={onClose}>
            Cancelar
          </Button>
          {index > 0 ? (
            <Button variant="secondary" disabled={applying} onClick={() => setStep(index - 1)}>
              Anterior
            </Button>
          ) : null}
          {last && hasConflicts ? (
            <>
              <Button variant="secondary" disabled={!ready || applying} onClick={() => onConfirm(false)}>
                Só cards vazios
              </Button>
              <Button disabled={!ready || applying} onClick={() => onConfirm(true)}>
                Substituir e aplicar
              </Button>
            </>
          ) : last ? (
            <Button disabled={!ready || applying} onClick={() => onConfirm(true)}>
              Aplicar nas cenas
            </Button>
          ) : (
            <Button variant="secondary" disabled={!ready || applying} onClick={() => setStep(index + 1)}>
              Próxima cena
            </Button>
          )}
        </>
      }
    >
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onEnded={() => {
          setPlaying(false)
          setCurrentTime(0)
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      {number === undefined ? null : (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-muted">
            {reason === 'empty-lyrics' ? (
              <>
                A cena {sceneLabel(number)} tem áudio e ainda não tem trecho de letra. Ouça o trecho,
                selecione um ou mais instrumentos e, se quiser, digite o que está tocando.
              </>
            ) : (
              <>
                A cena {sceneLabel(number)} tem áudio e não tem{' '}
                <span className="text-text">.txt</span>. Ouça o trecho, selecione um ou mais
                instrumentos e, se quiser, digite o que está tocando.
              </>
            )}
          </p>

          {audioUrl ? (
            <div className="flex items-center gap-3 rounded-xl border border-border-soft bg-bg/40 px-3 py-2.5">
              <button
                type="button"
                disabled={applying}
                onClick={() => void togglePlay()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
                aria-label={playing ? 'Pausar trecho' : 'Ouvir trecho'}
                title={playing ? 'Pausar' : 'Ouvir trecho'}
              >
                {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text">Ouvir trecho da cena {sceneLabel(number)}</p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
                  {formatClock(currentTime)}
                  {duration > 0 ? ` / ${formatClock(duration)}` : ''}
                </p>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border-soft px-3 py-2 text-xs text-muted-2">
              Áudio desta cena indisponível para prévia.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {INSTRUMENTAL_PRESETS.map((preset) => {
              const active = selected.has(preset.id)
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={applying}
                  aria-pressed={active}
                  onClick={() => toggle(preset.id)}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm transition-colors disabled:opacity-50',
                    active
                      ? 'border-accent bg-accent/15 text-text'
                      : 'border-border bg-bg/40 text-muted hover:border-accent/40 hover:text-text',
                  )}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`instrumental-custom-${number}`} className="text-xs font-medium text-muted">
              Ou digite (opcional)
            </label>
            <input
              id={`instrumental-custom-${number}`}
              value={custom}
              disabled={applying}
              placeholder="Ex.: sanfona, percussão, solo acústico…"
              onChange={(event) => setCustom(event.target.value)}
              className="h-10 rounded-xl border border-border bg-bg/50 px-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
            />
          </div>
          <p className="text-[11px] text-muted-2">
            Pode marcar vários. O trecho fica tipo “Violão, Guitarra”. Banda marca a cena como banda.
          </p>
        </div>
      )}
    </Modal>
  )
}
