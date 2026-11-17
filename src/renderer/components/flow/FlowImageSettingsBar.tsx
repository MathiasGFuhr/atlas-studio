import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { FlowImageSettings } from '@shared/flowImageSettings'
import {
  FLOW_IMAGE_ASPECTS,
  FLOW_IMAGE_MODELS,
  FLOW_IMAGE_OUTPUTS,
  FLOW_IMAGE_REASONING,
  flowImageCreditsLabel,
  reasoningDetail,
  type FlowImageAspect,
} from '@shared/flowImageSettings'
import { cn } from '../../lib/utils'

function AspectMark({ ratio }: { ratio: FlowImageAspect }) {
  const [w, h] = ratio.split(':').map(Number)
  const max = 16
  const width = w >= h ? max : Math.max(8, Math.round((max * w) / h))
  const height = h >= w ? max : Math.max(8, Math.round((max * h) / w))
  return (
    <span
      className="rounded-[3px] border-[1.5px] border-current"
      style={{ width, height }}
    />
  )
}

function Segment({
  selected,
  children,
  onClick,
}: {
  selected: boolean
  children: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 min-w-0 flex-1 rounded-lg text-[13px] font-medium text-white transition-colors',
        selected ? 'bg-[#4a4a4a]' : 'hover:bg-white/5',
      )}
    >
      {children}
    </button>
  )
}

export function FlowImageSettingsBar({
  value,
  onChange,
}: {
  value: FlowImageSettings
  onChange: (next: FlowImageSettings) => void
}) {
  const [modelsOpen, setModelsOpen] = useState(false)
  const credits = flowImageCreditsLabel(value.modelKey)

  return (
    <div className="w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#2a2a2a] p-3 text-white shadow-2xl">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-black">
          <span className="grid h-4 w-4 place-items-center rounded-[3px] border border-black/70 text-[9px]">
            ▢
          </span>
          Imagem
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[13px] text-white/80">
          <span className="text-[11px]">▷</span>
          Vídeo
        </span>
      </div>

      <div className="grid grid-cols-5 gap-1">
        {FLOW_IMAGE_ASPECTS.map((aspect) => {
          const selected = value.aspectRatio === aspect
          return (
            <button
              key={aspect}
              type="button"
              onClick={() => onChange({ ...value, aspectRatio: aspect })}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px]',
                selected ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/5',
              )}
            >
              <AspectMark ratio={aspect} />
              {aspect}
            </button>
          )
        })}
      </div>

      <div className="relative mt-2">
        <button
          type="button"
          onClick={() => setModelsOpen((open) => !open)}
          className="flex h-11 w-full items-center gap-2 rounded-xl bg-[#1c1c1c] px-3 text-left text-[14px]"
        >
          <span className="text-base leading-none text-amber-300">🍌</span>
          <span className="min-w-0 flex-1 truncate">{value.modelLabel}</span>
          <ChevronDown className="h-4 w-4 text-white/70" />
        </button>
        {modelsOpen ? (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-white/10 bg-[#1c1c1c] py-1 shadow-xl">
            {FLOW_IMAGE_MODELS.map((model) => (
              <button
                key={model.key}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-white/10',
                  model.key === value.modelKey && 'bg-white/10',
                )}
                onClick={() => {
                  onChange({ ...value, modelKey: model.key, modelLabel: model.label })
                  setModelsOpen(false)
                }}
              >
                <span className="text-amber-300">🍌</span>
                {model.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="mb-1.5 mt-3 text-center text-[13px] text-white/90">Nível de raciocínio</p>
      <div className="flex gap-1 rounded-xl bg-[#1a1a1a] p-1">
        {FLOW_IMAGE_REASONING.map((level) => (
          <Segment
            key={level.key}
            selected={value.reasoning === level.key}
            onClick={() => onChange({ ...value, reasoning: level.key })}
          >
            {level.label}
          </Segment>
        ))}
      </div>
      <p className="mt-2 text-center text-[12px] text-white/55">{reasoningDetail(value.reasoning)}</p>

      <div className="mt-2 flex gap-1 rounded-xl bg-[#1a1a1a] p-1">
        {FLOW_IMAGE_OUTPUTS.map((count) => (
          <Segment
            key={count}
            selected={value.outputs === count}
            onClick={() => onChange({ ...value, outputs: count })}
          >
            {`x${count}`}
          </Segment>
        ))}
      </div>

      {credits ? <p className="mt-3 text-center text-[12px] text-white/55">{credits}</p> : null}
    </div>
  )
}
