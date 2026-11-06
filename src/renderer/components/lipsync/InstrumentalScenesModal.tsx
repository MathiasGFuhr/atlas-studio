import { useState } from 'react'
import { INSTRUMENTAL_PRESETS, resolveInstrumentalChoice, type InstrumentalChoice } from '@shared/lipSyncRefs'
import { cn } from '../../lib/utils'
import { Button } from '../Button'
import { Modal } from '../Modal'

function sceneLabel(number: number): string {
  return String(number).padStart(2, '0')
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
  const choice = number === undefined ? undefined : choices[number]
  const selected = choice?.presetId ?? ''
  const custom = choice?.custom ?? ''
  const ready = Boolean(number !== undefined && resolveInstrumentalChoice(selected, custom))
  const last = index >= numbers.length - 1

  function pick(presetId: string) {
    if (number === undefined) return
    onChange(number, { presetId, custom: presetId === selected ? custom : '' })
    if (presetId !== 'outro' && !last) setStep(index + 1)
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
                A cena {sceneLabel(number)} tem áudio e ainda não tem trecho de letra. Escolha o que
                está tocando (violão, guitarra, banda…). A próxima cena sem letra abre aqui mesmo.
              </>
            ) : (
              <>
                A cena {sceneLabel(number)} tem áudio e não tem{' '}
                <span className="text-text">.txt</span>. Escolha o que está tocando. A próxima cena
                sem letra abre aqui mesmo.
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {INSTRUMENTAL_PRESETS.map((preset) => {
              const active = selected === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={applying}
                  onClick={() => pick(preset.id)}
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
          {selected === 'outro' ? (
            <input
              value={custom}
              disabled={applying}
              placeholder="Descreva o que está tocando"
              onChange={(event) => onChange(number, { presetId: 'outro', custom: event.target.value })}
              className="h-10 rounded-xl border border-border bg-bg/50 px-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
            />
          ) : null}
          <p className="text-[11px] text-muted-2">
            Banda e banda + cantor marcam a cena como banda.
          </p>
        </div>
      )}
    </Modal>
  )
}
