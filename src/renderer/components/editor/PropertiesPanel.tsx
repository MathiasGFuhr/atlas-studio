import { useEffect, useState, type ReactNode } from 'react'
import { Maximize, Minimize, Scissors, Trash2, Volume2, VolumeX } from 'lucide-react'
import { editorAnimationById } from '@shared/editor/animationsCatalog'
import { editorEffectById } from '@shared/editor/effectsCatalog'
import {
  EDITOR_TEXT_MOTIONS,
  EDITOR_TEXT_MOTION_SOURCE_LABEL,
  editorTextMotionById,
} from '@shared/editor/textMotionsCatalog'
import { EDITOR_TEXT_FONTS, resolveTextPresentation } from '@shared/editor/textStyleResolve'
import { editorTextTemplateById } from '@shared/editor/textTemplatesCatalog'
import {
  EDITOR_ASPECTS,
  EDITOR_ASPECT_LABEL,
  formatTimecode,
  type EditorAspect,
  type EditorAsset,
  type EditorClip,
  type EditorClipAnimation,
  type EditorTextContent,
  type EditorTimeline,
} from '@shared/editor/types'
import {
  clipDuration,
  isEffectClip,
  isTextClip,
  MAX_CLIP_SCALE,
  MAX_CLIP_VOLUME,
  MIN_CLIP_SCALE,
  timelineDuration,
} from '@shared/editor/timelineOps'
import { cn } from '../../lib/utils'

const SHORTCUTS: Array<[string, string]> = [
  ['Espaço', 'Play / pausa'],
  ['S', 'Dividir no playhead'],
  ['Delete', 'Excluir clipe'],
  ['Shift + Delete', 'Excluir e fechar o buraco'],
  ['Ctrl + Z / Ctrl + Y', 'Desfazer / refazer'],
  ['← →', 'Quadro anterior / próximo'],
  ['Shift + ← →', '1 segundo'],
  ['Ctrl + roda', 'Zoom na timeline'],
]

type ClipPatch = Partial<
  Pick<
    EditorClip,
    'volume' | 'muted' | 'fit' | 'scale' | 'opacity' | 'fadeIn' | 'fadeOut' | 'effects' | 'animation'
  >
>

const VOLUME_DB_MIN = -60
const VOLUME_DB_MAX = 6

function volumeToDb(volume: number): number {
  if (!(volume > 0.001)) return VOLUME_DB_MIN
  return Math.max(VOLUME_DB_MIN, Math.min(VOLUME_DB_MAX, 20 * Math.log10(volume)))
}

function dbToVolume(db: number): number {
  if (db <= VOLUME_DB_MIN) return 0
  return Math.min(MAX_CLIP_VOLUME, 10 ** (db / 20))
}

function formatDb(db: number): string {
  return db.toFixed(1)
}

function formatSeconds(value: number): string {
  return value.toFixed(1)
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-muted-2">{label}</span>
      <span className="truncate tabular-nums text-text">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5 border-b border-border-soft px-3 py-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">{title}</h3>
      {children}
    </section>
  )
}

function UnitField({
  label,
  value,
  min,
  max,
  step,
  unit,
  display,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  display: string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(display)
  useEffect(() => {
    setDraft(display)
  }, [display])

  const commit = () => {
    const parsed = Number(
      draft
        .replace(',', '.')
        .replace(new RegExp(unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
        .trim(),
    )
    if (!Number.isFinite(parsed)) {
      setDraft(display)
      return
    }
    const next = Math.min(max, Math.max(min, parsed))
    setDraft(unit === '%' ? String(Math.round(next)) : next.toFixed(1))
    if (Math.abs(next - value) > 1e-6) onChange(next)
  }

  return (
    <div className="space-y-1.5">
      <span className="text-[11px] text-muted-2">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-w-0 flex-1 accent-[var(--color-accent)] disabled:opacity-40"
          aria-label={label}
        />
        <div className="flex h-7 w-[78px] shrink-0 items-center rounded-md border border-border-soft bg-elevated px-1.5">
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
                event.currentTarget.blur()
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-right text-[11px] tabular-nums text-text outline-none disabled:opacity-40"
            aria-label={`${label} (${unit})`}
          />
          <span className="pl-0.5 text-[10px] text-muted-2">{unit}</span>
        </div>
      </div>
    </div>
  )
}

function VisualTransformSection({
  clip,
  onClipPatch,
}: {
  clip: EditorClip
  onClipPatch: (patch: ClipPatch) => void
}) {
  const scalePercent = Math.round(clip.scale * 100)
  const opacityPercent = Math.round(clip.opacity * 100)
  return (
    <Section title="Transformar">
      <UnitField
        label="Escala"
        value={scalePercent}
        min={Math.round(MIN_CLIP_SCALE * 100)}
        max={Math.round(MAX_CLIP_SCALE * 100)}
        step={1}
        unit="%"
        display={String(scalePercent)}
        onChange={(value) => onClipPatch({ scale: value / 100 })}
      />
      <UnitField
        label="Opacidade"
        value={opacityPercent}
        min={0}
        max={100}
        step={1}
        unit="%"
        display={String(opacityPercent)}
        onChange={(value) => onClipPatch({ opacity: value / 100 })}
      />
    </Section>
  )
}

function ClipEffectsSection({
  clip,
  onRemoveEffect,
}: {
  clip: EditorClip
  onRemoveEffect?: (effectId: string) => void
}) {
  if (!clip.effects || clip.effects.length === 0) return null
  return (
    <Section title="Efeitos">
      <ul className="space-y-1.5">
        {clip.effects.map((item) => {
          const def = editorEffectById(item.id)
          return (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border-soft bg-elevated px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-text">{def?.label ?? item.id}</p>
                <p className="text-[10px] text-muted-2">{Math.round(item.intensity * 100)}%</p>
              </div>
              {onRemoveEffect ? (
                <button
                  type="button"
                  title="Remover efeito"
                  onClick={() => onRemoveEffect(item.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-2 hover:bg-hover hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function ClipAnimationSection({
  clip,
  onClipPatch,
}: {
  clip: EditorClip
  onClipPatch: (patch: ClipPatch) => void
}) {
  const anim = clip.animation ?? { inId: null, outId: null, comboId: null, inDuration: 0.6, outDuration: 0.6 }
  const inLabel = anim.inId ? editorAnimationById(anim.inId)?.label ?? anim.inId : 'Nenhuma'
  const outLabel = anim.outId ? editorAnimationById(anim.outId)?.label ?? anim.outId : 'Nenhuma'
  const comboLabel = anim.comboId ? editorAnimationById(anim.comboId)?.label ?? anim.comboId : 'Nenhuma'
  const patchAnim = (patch: Partial<EditorClipAnimation>) =>
    onClipPatch({ animation: { ...anim, ...patch } })

  return (
    <Section title="Animação">
      <Row label="Entrada" value={inLabel} />
      <Row label="Saída" value={outLabel} />
      <Row label="Combinação" value={comboLabel} />
      <UnitField
        label="Duração entrada"
        value={Number(anim.inDuration.toFixed(1))}
        min={0.1}
        max={3}
        step={0.1}
        unit="s"
        display={`${anim.inDuration.toFixed(1)}s`}
        onChange={(value) => patchAnim({ inDuration: value })}
      />
      <UnitField
        label="Duração saída"
        value={Number(anim.outDuration.toFixed(1))}
        min={0.1}
        max={3}
        step={0.1}
        unit="s"
        display={`${anim.outDuration.toFixed(1)}s`}
        onChange={(value) => patchAnim({ outDuration: value })}
      />
      <p className="text-[10px] leading-relaxed text-muted-2">
        Escolha presets na biblioteca Animação.
      </p>
    </Section>
  )
}

function EffectBlockSection({
  clip,
  fps,
  onClipPatch,
  onDelete,
  onApplyToAll,
}: {
  clip: EditorClip
  fps: number
  onClipPatch: (patch: ClipPatch) => void
  onDelete: () => void
  onApplyToAll?: () => void
}) {
  const def = clip.effectId ? editorEffectById(clip.effectId) : undefined
  const intensity = Math.round((clip.effects?.[0]?.intensity ?? 1) * 100)
  const duration = clipDuration(clip)
  return (
    <div className="h-full overflow-y-auto">
      <Section title="Efeito">
        <p className="truncate text-xs font-semibold text-text">{def?.label ?? clip.effectId ?? 'Efeito'}</p>
        {def?.description ? <p className="text-[10px] leading-relaxed text-muted-2">{def.description}</p> : null}
        <Row label="Início" value={formatTimecode(clip.start, fps)} />
        <Row label="Duração" value={formatTimecode(duration, fps)} />
        <UnitField
          label="Intensidade"
          value={intensity}
          min={10}
          max={200}
          step={5}
          unit="%"
          display={String(intensity)}
          onChange={(value) => {
            if (!clip.effectId) return
            onClipPatch({ effects: [{ id: clip.effectId, intensity: value / 100 }] })
          }}
        />
        {onApplyToAll ? (
          <button
            type="button"
            onClick={onApplyToAll}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-soft bg-elevated py-2 text-xs font-semibold text-text hover:bg-hover"
          >
            Aplicar a tudo
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-danger/25 bg-danger/10 py-2 text-xs font-semibold text-danger hover:bg-danger/15"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remover efeito
        </button>
      </Section>
    </div>
  )
}

function AudioBasicSection({
  clip,
  onClipPatch,
}: {
  clip: EditorClip
  onClipPatch: (patch: ClipPatch) => void
}) {
  const duration = clipDuration(clip)
  const db = volumeToDb(clip.volume)
  const fadeIn = Math.min(clip.fadeIn || 0, duration)
  const fadeOut = Math.min(clip.fadeOut || 0, duration)
  return (
    <Section title="Áudio">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-text">Básico</span>
        <button
          type="button"
          title={clip.muted ? 'Ativar som' : 'Silenciar'}
          onClick={() => onClipPatch({ muted: !clip.muted })}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md border border-border-soft',
            clip.muted ? 'text-warning' : 'text-muted hover:text-text',
          )}
        >
          {clip.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>
      <UnitField
        label="Volume"
        value={Number(db.toFixed(1))}
        min={VOLUME_DB_MIN}
        max={VOLUME_DB_MAX}
        step={0.1}
        unit="dB"
        display={formatDb(db)}
        disabled={clip.muted}
        onChange={(value) => onClipPatch({ volume: dbToVolume(value) })}
      />
      <UnitField
        label="Fade-in"
        value={Number(fadeIn.toFixed(1))}
        min={0}
        max={Math.max(0, Number(duration.toFixed(1)))}
        step={0.1}
        unit="s"
        display={formatSeconds(fadeIn)}
        disabled={clip.muted}
        onChange={(value) => onClipPatch({ fadeIn: value })}
      />
      <UnitField
        label="Fade-out"
        value={Number(fadeOut.toFixed(1))}
        min={0}
        max={Math.max(0, Number(duration.toFixed(1)))}
        step={0.1}
        unit="s"
        display={formatSeconds(fadeOut)}
        disabled={clip.muted}
        onChange={(value) => onClipPatch({ fadeOut: value })}
      />
    </Section>
  )
}

export function PropertiesPanel({
  timeline,
  clip,
  asset,
  selectionCount,
  selectionHasVisual,
  selectionHasAudio,
  onAspectChange,
  onClipPatch,
  onRemoveEffect,
  onSplit,
  onDelete,
  onApplyEffectToAll,
  onTextPatch,
}: {
  timeline: EditorTimeline
  clip: EditorClip | null
  asset: EditorAsset | null
  selectionCount: number
  selectionHasVisual: boolean
  selectionHasAudio: boolean
  onAspectChange: (aspect: EditorAspect) => void
  onClipPatch: (patch: ClipPatch) => void
  onRemoveEffect?: (effectId: string) => void
  onSplit: () => void
  onDelete: () => void
  onApplyEffectToAll?: () => void
  onTextPatch?: (patch: Partial<EditorTextContent>) => void
}) {
  const fps = timeline.fps

  if (selectionCount > 1) {
    return (
      <div className="h-full overflow-y-auto">
        <Section title="Seleção">
          <p className="text-xs text-muted">{selectionCount} clipes selecionados.</p>
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-danger/25 bg-danger/10 py-2 text-xs font-semibold text-danger hover:bg-danger/15"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir selecionados
          </button>
        </Section>
        {selectionHasVisual && clip ? (
          <VisualTransformSection clip={clip} onClipPatch={onClipPatch} />
        ) : null}
        {selectionHasVisual && clip ? (
          <ClipEffectsSection clip={clip} onRemoveEffect={onRemoveEffect} />
        ) : null}
        {selectionHasAudio && clip ? <AudioBasicSection clip={clip} onClipPatch={onClipPatch} /> : null}
      </div>
    )
  }

  if (!clip) {
    return (
      <div className="h-full overflow-y-auto">
        <Section title="Projeto">
          <div className="grid grid-cols-3 gap-1.5">
            {EDITOR_ASPECTS.map((aspect) => (
              <button
                key={aspect}
                type="button"
                title={EDITOR_ASPECT_LABEL[aspect]}
                onClick={() => onAspectChange(aspect)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border py-2 text-[11px] font-semibold transition-colors',
                  timeline.aspect === aspect
                    ? 'border-accent/60 bg-accent-subtle text-accent'
                    : 'border-border-soft text-muted hover:border-border-strong hover:text-text',
                )}
              >
                <span
                  className="rounded-[3px] border-2 border-current"
                  style={
                    aspect === '9:16'
                      ? { width: 12, height: 20 }
                      : aspect === '16:9'
                        ? { width: 22, height: 12 }
                        : { width: 16, height: 16 }
                  }
                />
                {aspect}
              </button>
            ))}
          </div>
          <Row label="Duração" value={formatTimecode(timelineDuration(timeline), fps)} />
          <Row label="Clipes" value={String(timeline.clips.length)} />
          <Row label="Quadros por segundo" value={`${fps} fps`} />
        </Section>
        <Section title="Atalhos">
          <ul className="space-y-1.5">
            {SHORTCUTS.map(([key, label]) => (
              <li key={key} className="flex items-center justify-between gap-2 text-[11px]">
                <kbd className="rounded border border-border-soft bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted">
                  {key}
                </kbd>
                <span className="text-right text-muted-2">{label}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    )
  }

  if (isEffectClip(clip)) {
    return (
      <EffectBlockSection
        clip={clip}
        fps={fps}
        onClipPatch={onClipPatch}
        onDelete={onDelete}
        onApplyToAll={onApplyEffectToAll}
      />
    )
  }

  if (isTextClip(clip) && clip.text) {
    const template = editorTextTemplateById(clip.text.templateId)
    const resolved = resolveTextPresentation(clip.text)
    const titleStyle = resolved?.titleStyle
    const subtitleStyle = resolved?.subtitleStyle
    const field =
      'w-full rounded-lg border border-border-soft bg-elevated px-2 py-1.5 text-[11px] text-text outline-none focus:border-accent'
    return (
      <div className="h-full overflow-y-auto">
        <Section title="Texto">
          <p className="truncate text-xs font-semibold text-text">
            {template?.label ?? clip.text.templateId}
          </p>
          <Row label="Início" value={formatTimecode(clip.start, fps)} />
          <Row label="Duração" value={formatTimecode(clipDuration(clip), fps)} />
          <label className="block space-y-1">
            <span className="text-[10px] text-muted-2">Título</span>
            <textarea
              value={clip.text.title}
              rows={2}
              onChange={(event) => onTextPatch?.({ title: event.target.value })}
              className={cn(field, 'resize-none')}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] text-muted-2">Subtítulo</span>
            <textarea
              value={clip.text.subtitle}
              rows={2}
              onChange={(event) => onTextPatch?.({ subtitle: event.target.value })}
              className={cn(field, 'resize-none')}
            />
          </label>
        </Section>

        <Section title="Tipografia">
          <label className="block space-y-1">
            <span className="text-[10px] text-muted-2">Fonte</span>
            <select
              value={
                EDITOR_TEXT_FONTS.find((font) => font.family === titleStyle?.fontFamily)?.family ??
                titleStyle?.fontFamily ??
                EDITOR_TEXT_FONTS[0].family
              }
              onChange={(event) => onTextPatch?.({ titleStyle: { fontFamily: event.target.value } })}
              className={field}
              style={{ fontFamily: titleStyle?.fontFamily }}
            >
              {EDITOR_TEXT_FONTS.map((font) => (
                <option key={font.id} value={font.family} style={{ fontFamily: font.family }}>
                  {font.label}
                </option>
              ))}
              {titleStyle?.fontFamily &&
              !EDITOR_TEXT_FONTS.some((font) => font.family === titleStyle.fontFamily) ? (
                <option value={titleStyle.fontFamily}>Modelo</option>
              ) : null}
            </select>
          </label>
          <label className="block space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-2">
              <span>Tamanho</span>
              <span className="tabular-nums text-text">{(titleStyle?.fontSizePercent ?? 6).toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min={1.5}
              max={22}
              step={0.1}
              value={titleStyle?.fontSizePercent ?? 6}
              onChange={(event) =>
                onTextPatch?.({ titleStyle: { fontSizePercent: Number(event.target.value) } })
              }
              className="w-full accent-[var(--color-accent)]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] text-muted-2">Peso</span>
            <select
              value={String(titleStyle?.fontWeight ?? 700)}
              onChange={(event) => {
                const raw = event.target.value
                const asNum = Number(raw)
                onTextPatch?.({ titleStyle: { fontWeight: Number.isFinite(asNum) ? asNum : raw } })
              }}
              className={field}
            >
              {[300, 400, 500, 600, 700, 800, 900].map((weight) => (
                <option key={weight} value={weight}>
                  {weight}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] text-muted-2">Cor do título</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(titleStyle?.color ?? '') ? titleStyle!.color : '#ffffff'}
                onChange={(event) => onTextPatch?.({ titleStyle: { color: event.target.value } })}
                className="h-8 w-10 cursor-pointer rounded border border-border-soft bg-elevated"
              />
              <input
                type="text"
                value={titleStyle?.color ?? '#ffffff'}
                onChange={(event) => onTextPatch?.({ titleStyle: { color: event.target.value } })}
                className={cn(field, 'flex-1 font-mono')}
              />
            </div>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] text-muted-2">Caixa</span>
            <select
              value={titleStyle?.textTransform ?? 'none'}
              onChange={(event) =>
                onTextPatch?.({
                  titleStyle: {
                    textTransform: event.target.value as 'none' | 'uppercase' | 'lowercase',
                  },
                })
              }
              className={field}
            >
              <option value="none">Normal</option>
              <option value="uppercase">MAIÚSCULAS</option>
              <option value="lowercase">minúsculas</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-[11px] text-text">
            <span>Sombra</span>
            <input
              type="checkbox"
              checked={Boolean(titleStyle?.textShadow)}
              onChange={(event) =>
                onTextPatch?.({
                  titleStyle: {
                    textShadow: event.target.checked ? '0 2px 12px rgba(0,0,0,0.55)' : null,
                  },
                })
              }
              className="accent-[var(--color-accent)]"
            />
          </label>
        </Section>

        <Section title="Subtítulo · estilo">
          <label className="block space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-2">
              <span>Tamanho</span>
              <span className="tabular-nums text-text">
                {(subtitleStyle?.fontSizePercent ?? 3.5).toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={14}
              step={0.1}
              value={subtitleStyle?.fontSizePercent ?? 3.5}
              onChange={(event) =>
                onTextPatch?.({ subtitleStyle: { fontSizePercent: Number(event.target.value) } })
              }
              className="w-full accent-[var(--color-accent)]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] text-muted-2">Cor do subtítulo</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={
                  /^#[0-9a-fA-F]{6}$/.test(subtitleStyle?.color ?? '')
                    ? subtitleStyle!.color
                    : '#cbd5e1'
                }
                onChange={(event) => onTextPatch?.({ subtitleStyle: { color: event.target.value } })}
                className="h-8 w-10 cursor-pointer rounded border border-border-soft bg-elevated"
              />
              <input
                type="text"
                value={subtitleStyle?.color ?? '#cbd5e1'}
                onChange={(event) => onTextPatch?.({ subtitleStyle: { color: event.target.value } })}
                className={cn(field, 'flex-1 font-mono')}
              />
            </div>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] text-muted-2">Fonte do subtítulo</span>
            <select
              value={
                EDITOR_TEXT_FONTS.find((font) => font.family === subtitleStyle?.fontFamily)?.family ??
                subtitleStyle?.fontFamily ??
                EDITOR_TEXT_FONTS[0].family
              }
              onChange={(event) => onTextPatch?.({ subtitleStyle: { fontFamily: event.target.value } })}
              className={field}
            >
              {EDITOR_TEXT_FONTS.map((font) => (
                <option key={font.id} value={font.family}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
        </Section>

        <Section title="Posição">
          <label className="block space-y-1">
            <span className="text-[10px] text-muted-2">Alinhamento</span>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ['left', 'Esq.'],
                  ['center', 'Centro'],
                  ['right', 'Dir.'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTextPatch?.({ align: id })}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-[10px] font-semibold transition-colors',
                    (resolved?.align ?? 'center') === id
                      ? 'border-accent/60 bg-accent-subtle text-accent'
                      : 'border-border-soft text-muted-2 hover:text-text',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </label>
          <label className="block space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-2">
              <span>Horizontal (X)</span>
              <span className="tabular-nums text-text">{Math.round(resolved?.xPercent ?? 50)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={resolved?.xPercent ?? 50}
              onChange={(event) => onTextPatch?.({ xPercent: Number(event.target.value) })}
              className="w-full accent-[var(--color-accent)]"
            />
          </label>
          <label className="block space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-2">
              <span>Vertical (Y)</span>
              <span className="tabular-nums text-text">{Math.round(resolved?.yPercent ?? 50)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={resolved?.yPercent ?? 50}
              onChange={(event) => onTextPatch?.({ yPercent: Number(event.target.value) })}
              className="w-full accent-[var(--color-accent)]"
            />
          </label>
          <label className="block space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-2">
              <span>Opacidade</span>
              <span className="tabular-nums text-text">{Math.round(clip.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clip.opacity}
              onChange={(event) => onClipPatch({ opacity: Number(event.target.value) })}
              className="w-full accent-[var(--color-accent)]"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-[11px] text-text">
            <span>Placa / fundo</span>
            <input
              type="checkbox"
              checked={resolved?.showPlate ?? false}
              onChange={(event) => onTextPatch?.({ showPlate: event.target.checked })}
              className="accent-[var(--color-accent)]"
            />
          </label>
          <button
            type="button"
            onClick={() =>
              onTextPatch?.({
                xPercent: null,
                yPercent: null,
                align: null,
                titleStyle: null,
                subtitleStyle: null,
                showPlate: null,
              })
            }
            className="w-full rounded-lg border border-border-soft px-2 py-1.5 text-[10px] font-semibold text-muted-2 hover:bg-hover hover:text-text"
          >
            Restaurar estilo do modelo
          </button>
        </Section>

        <Section title="Moção">
          <label className="block space-y-1">
            <span className="text-[10px] text-muted-2">Moção tipográfica</span>
            <select
              value={clip.text.motionId ?? 'none'}
              onChange={(event) => {
                const value = event.target.value
                onTextPatch?.({ motionId: value === 'none' ? null : value })
              }}
              className={field}
            >
              {EDITOR_TEXT_MOTIONS.map((motion) => (
                <option key={motion.id} value={motion.id}>
                  {motion.label} · {EDITOR_TEXT_MOTION_SOURCE_LABEL[motion.source]}
                </option>
              ))}
            </select>
            <p className="text-[10px] leading-relaxed text-muted-2">
              {editorTextMotionById(clip.text.motionId)?.description ??
                'React Bits / Remotion Bits / GSAP SplitText no preview'}
            </p>
          </label>
          <div className="flex gap-1.5 pt-1">
            <button
              type="button"
              onClick={onSplit}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-soft bg-elevated py-1.5 text-[11px] font-semibold text-text hover:bg-hover"
            >
              <Scissors className="h-3.5 w-3.5" />
              Dividir
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/25 bg-danger/10 py-1.5 text-[11px] font-semibold text-danger hover:bg-danger/15"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir
            </button>
          </div>
        </Section>
        <ClipAnimationSection clip={clip} onClipPatch={onClipPatch} />
      </div>
    )
  }

  const hasAudio = asset ? asset.kind === 'audio' || asset.hasAudio : false
  const visual = asset ? asset.kind !== 'audio' : false

  return (
    <div className="h-full overflow-y-auto">
      <Section title="Clipe">
        <p className="truncate text-xs font-semibold text-text" title={asset?.sourcePath}>
          {asset?.name ?? 'Mídia ausente'}
        </p>
        <Row label="Início" value={formatTimecode(clip.start, fps)} />
        <Row label="Duração" value={formatTimecode(clipDuration(clip), fps)} />
        <Row label="Trecho da fonte" value={`${formatTimecode(clip.inPoint, fps)} – ${formatTimecode(clip.outPoint, fps)}`} />
        {asset && asset.width > 0 ? <Row label="Resolução" value={`${asset.width}×${asset.height}`} /> : null}
        <div className="flex gap-1.5 pt-1">
          <button
            type="button"
            onClick={onSplit}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-soft bg-elevated py-1.5 text-[11px] font-semibold text-text hover:bg-hover"
          >
            <Scissors className="h-3.5 w-3.5" />
            Dividir
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/25 bg-danger/10 py-1.5 text-[11px] font-semibold text-danger hover:bg-danger/15"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir
          </button>
        </div>
      </Section>

      {visual ? <VisualTransformSection clip={clip} onClipPatch={onClipPatch} /> : null}

      {visual ? <ClipAnimationSection clip={clip} onClipPatch={onClipPatch} /> : null}

      {visual ? <ClipEffectsSection clip={clip} onRemoveEffect={onRemoveEffect} /> : null}

      {hasAudio ? <AudioBasicSection clip={clip} onClipPatch={onClipPatch} /> : null}

      {visual ? (
        <Section title="Enquadramento">
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['contain', 'Encaixar', Minimize],
                ['cover', 'Preencher', Maximize],
              ] as const
            ).map(([fit, label, Icon]) => (
              <button
                key={fit}
                type="button"
                onClick={() => onClipPatch({ fit })}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11px] font-semibold transition-colors',
                  clip.fit === fit
                    ? 'border-accent/60 bg-accent-subtle text-accent'
                    : 'border-border-soft text-muted hover:text-text',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] leading-relaxed text-muted-2">
            Encaixar mostra o quadro inteiro com bordas; Preencher corta as sobras para ocupar a tela toda.
          </p>
        </Section>
      ) : null}
    </div>
  )
}
