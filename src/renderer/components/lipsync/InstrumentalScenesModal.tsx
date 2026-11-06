import { useState } from 'react'
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

export function InstrumentalScenesModal({
  numbers,
  choices,
  applying,
  hasConflicts,
  reason = 'folder',
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
  onChange: (number: number, choice: InstrumentalChoice) => void
  onClose: () => void
  onConfirm: (replaceExisting: boolean) => void
}) {
  const [step, setStep] = useState(0)
  const [tracked, setTracked] = useState('')
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
      {number === undefined ? null : (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-muted">
            {reason === 'empty-lyrics' ? (
              <>
                A cena {sceneLabel(number)} tem áudio e ainda não tem trecho de letra. Selecione um
                ou mais instrumentos e, se quiser, digite o que está tocando.
              </>
            ) : (
              <>
                A cena {sceneLabel(number)} tem áudio e não tem{' '}
                <span className="text-text">.txt</span>. Selecione um ou mais instrumentos e, se
                quiser, digite o que está tocando.
              </>
            )}
          </p>
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
