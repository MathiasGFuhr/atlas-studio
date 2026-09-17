import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Layers } from 'lucide-react'
import {
  IMAGE_SUBJECTS,
  buildAngleVariations,
  composeImagePrompt,
  defaultImagePerformanceFor,
  defaultStageContextFor,
  framingsForSubject,
  imageSceneKind,
  lipSyncApplies,
  performancesForSubject,
  resolveImageFraming,
  stageContextsFor,
} from '@shared/quickPrompts'
import type {
  ImageAngleVariation,
  ImageFramingId,
  ImagePerformanceId,
  ImagePurpose,
  ImageSubjectId,
  StageContextId,
} from '@shared/quickPrompts'
import type { AnalyzeQuickPromptRequest } from '@shared/types'
import { Button } from './Button'
import { Select } from './Select'
import { FavoriteField } from './QuickPromptFields'
import { presetFavoriteKey, toOptions } from '../lib/quickPromptOptions'
import {
  QuickPromptAntigravityButtons,
  QuickPromptAntigravityPanel,
  useQuickPromptAntigravity,
} from './QuickPromptAntigravityAudit'

/**
 * Categoria "Criar imagem": prompts de imagem estática que servirão de
 * referência para a categoria "Animar / Lipsync".
 *
 * Toda a composição vem de `@shared/quickPrompts` (módulos de imagem).
 * Nenhum bloco descreve movimento de câmera e nenhuma IA é chamada.
 */
export function ImagePromptsForm({
  favorites,
  onToggleFavorite,
  onCopy,
  copied,
}: {
  favorites: Set<string>
  onToggleFavorite: (category: string, id: string) => void
  onCopy: (text: string, key: string, message?: string) => Promise<void>
  copied: string | null
}) {
  const [subjectId, setSubjectId] = useState<ImageSubjectId>('singer-solo')
  const [performanceId, setPerformanceId] = useState<ImagePerformanceId>('singing-mic')
  const [framingId, setFramingId] = useState<ImageFramingId>('auto')
  const [stageContextId, setStageContextId] = useState<StageContextId>('on-stage')
  const [purpose, setPurpose] = useState<ImagePurpose>('lipsync')
  const [variations, setVariations] = useState<ImageAngleVariation[]>([])
  const [promptOverride, setPromptOverride] = useState<string | null>(null)

  const subject = useMemo(
    () => IMAGE_SUBJECTS.find((item) => item.id === subjectId),
    [subjectId],
  )
  const availablePerformances = useMemo(
    () => performancesForSubject(subjectId),
    [subjectId],
  )
  const availableFramings = useMemo(
    () => framingsForSubject(subjectId, purpose, performanceId),
    [subjectId, purpose, performanceId],
  )
  const lipSyncOn = lipSyncApplies(subjectId, purpose)
  const sceneKind = useMemo(
    () => imageSceneKind(subject?.framingGroup, subject?.hasSinger),
    [subject],
  )
  const availableContexts = useMemo(() => stageContextsFor(sceneKind), [sceneKind])

  const composedPrompt = useMemo(
    () => composeImagePrompt({ subjectId, performanceId, framingId, purpose, stageContextId }),
    [subjectId, performanceId, framingId, purpose, stageContextId],
  )
  const prompt = promptOverride ?? composedPrompt
  const resolvedFraming = useMemo(
    () => resolveImageFraming(framingId, subjectId, purpose),
    [framingId, subjectId, purpose],
  )

  // Trocar de sujeito pode invalidar a performance selecionada.
  useEffect(() => {
    if (!availablePerformances.some((item) => item.id === performanceId)) {
      setPerformanceId(defaultImagePerformanceFor(subjectId))
    }
  }, [availablePerformances, performanceId, subjectId])

  // Ângulo que deixou de ser compatível volta para o automático.
  useEffect(() => {
    if (framingId !== 'auto' && !availableFramings.some((item) => item.id === framingId)) {
      setFramingId('auto')
    }
  }, [availableFramings, framingId])

  useEffect(() => {
    if (!availableContexts.some((item) => item.id === stageContextId)) {
      setStageContextId(defaultStageContextFor(sceneKind))
    }
  }, [availableContexts, sceneKind, stageContextId])

  useEffect(() => {
    if (!subject?.hasSinger && purpose === 'lipsync') {
      setPurpose('scene')
    }
  }, [purpose, subject?.hasSinger])

  useEffect(() => {
    setVariations([])
    setPromptOverride(null)
  }, [subjectId, performanceId, purpose, stageContextId, framingId])

  function generateVariations() {
    setVariations(buildAngleVariations({ subjectId, performanceId, framingId, purpose, stageContextId }))
  }

  const auditContext = useMemo(
    (): Omit<AnalyzeQuickPromptRequest, 'prompt' | 'intent'> => ({
      kind: 'image',
      performance: [
        subject?.label,
        availablePerformances.find((item) => item.id === performanceId)?.label,
      ]
        .filter(Boolean)
        .join(' · '),
      framing: resolvedFraming?.label ?? framingId,
      context: availableContexts.find((item) => item.id === stageContextId)?.label ?? stageContextId,
      lipSync: lipSyncOn,
      purpose: purpose === 'lipsync' ? 'Lipsync' : 'Cena geral',
    }),
    [
      availableContexts,
      availablePerformances,
      framingId,
      lipSyncOn,
      performanceId,
      purpose,
      resolvedFraming?.label,
      stageContextId,
      subject?.label,
    ],
  )

  const audit = useQuickPromptAntigravity({
    context: auditContext,
    prompt,
    resetKey: composedPrompt,
    onApplyPrompt: setPromptOverride,
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <FavoriteField
          label="Quem aparece"
          favorite={favorites.has(presetFavoriteKey('image-subject', subjectId))}
          onToggleFavorite={() => onToggleFavorite('image-subject', subjectId)}
        >
          <Select
            options={toOptions(IMAGE_SUBJECTS, favorites, 'image-subject')}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value as ImageSubjectId)}
          />
        </FavoriteField>

        <FavoriteField
          label="Performance"
          favorite={favorites.has(presetFavoriteKey('image-performance', performanceId))}
          onToggleFavorite={() => onToggleFavorite('image-performance', performanceId)}
        >
          <Select
            options={toOptions(availablePerformances, favorites, 'image-performance')}
            value={performanceId}
            onChange={(e) => setPerformanceId(e.target.value as ImagePerformanceId)}
          />
        </FavoriteField>

        <FavoriteField
          label="Enquadramento / ângulo"
          favoritable={framingId !== 'auto'}
          favorite={favorites.has(presetFavoriteKey('image-framing', framingId))}
          onToggleFavorite={() => onToggleFavorite('image-framing', framingId)}
        >
          <Select
            options={[
              { value: 'auto', label: 'Automático profissional' },
              ...toOptions(availableFramings, favorites, 'image-framing'),
            ]}
            value={framingId}
            onChange={(e) => setFramingId(e.target.value as ImageFramingId)}
          />
        </FavoriteField>

        <FavoriteField
          label={sceneKind === 'audience' ? 'Contexto da plateia' : 'Contexto de palco'}
          favorite={favorites.has(presetFavoriteKey('stage-context', stageContextId))}
          onToggleFavorite={() => onToggleFavorite('stage-context', stageContextId)}
        >
          <Select
            options={toOptions(availableContexts, favorites, 'stage-context')}
            value={stageContextId}
            onChange={(e) => setStageContextId(e.target.value as StageContextId)}
          />
        </FavoriteField>

        {subject?.hasSinger ? (
        <div className="flex flex-col gap-2">
          <div className="flex h-5 items-center">
            <span className="text-sm font-medium text-muted">Finalidade</span>
          </div>
          <Select
            options={[
              { value: 'lipsync', label: 'Lipsync' },
              { value: 'scene', label: 'Cena geral' },
            ]}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as ImagePurpose)}
          />
        </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={copied === 'image' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          onClick={() => void onCopy(prompt, 'image')}
        >
          {copied === 'image' ? 'Copiado' : 'Copiar prompt'}
        </Button>
        <Button
          variant="secondary"
          icon={<Layers className="h-4 w-4" />}
          onClick={generateVariations}
        >
          Criar variações de ângulo
        </Button>
        <QuickPromptAntigravityButtons
          busy={audit.busy}
          onAnalyze={audit.analyze}
          onClean={audit.clean}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Prompt final {lipSyncOn ? '· preparado para lipsync' : ''}</span>
          {framingId === 'auto' && resolvedFraming ? (
            <span className="text-muted-2">Ângulo: {resolvedFraming.label}</span>
          ) : null}
        </div>
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-card-2 px-3.5 py-3 font-mono text-xs leading-relaxed text-muted">
          {prompt}
        </pre>
        {promptOverride ? (
          <p className="text-xs text-muted-2">
            Prompt ajustado pelo Antigravity. Mudar os blocos restaura a composição local.
          </p>
        ) : null}
        <QuickPromptAntigravityPanel
          analysis={audit.analysis}
          error={audit.error}
          preview={audit.preview}
          currentPrompt={prompt}
          onClose={audit.close}
          onPreviewCorrected={() => audit.setPreview('corrected')}
          onPreviewCleaned={() => audit.setPreview('cleaned')}
          onApplyPreview={audit.applyPreview}
          onCancelPreview={() => audit.setPreview(null)}
        />
      </div>

      {variations.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs text-muted">
            {variations.length} variações profissionais de enquadramento
            {subject?.label ? ` · ${subject.label}` : ''}
          </div>
          <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 lg:grid-cols-2">
            {variations.map((variation, index) => (
              <div
                key={variation.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card-2 px-3 py-2"
              >
                <span className="w-6 shrink-0 text-xs font-semibold text-muted-2">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-text">
                  {variation.label}
                </span>
                <Button
                  variant="ghost"
                  className="h-8 shrink-0 px-2 text-xs"
                  icon={
                    copied === variation.id ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )
                  }
                  onClick={() => void onCopy(variation.prompt, variation.id)}
                >
                  {copied === variation.id ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
