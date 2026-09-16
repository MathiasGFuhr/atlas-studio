import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, Copy, Image, Layers, Sparkles, Video } from 'lucide-react'
import {
  ACTIONS,
  PERFORMANCES,
  actionsForPerformance,
  buildCameraVariations,
  camerasForAction,
  composePrompt,
  defaultActionFor,
  defaultFramingFor,
  framingsForLipSync,
  resolveCamera,
  resolveFraming,
  sceneKindFor,
  stageContextsFor,
} from '@shared/quickPrompts'
import type {
  ActionId,
  CameraId,
  CameraVariation,
  FramingId,
  PerformanceId,
  PromptTarget,
  StageContextId,
} from '@shared/quickPrompts'
import { Card } from './Card'
import { Button } from './Button'
import { Select } from './Select'
import { QuickPromptLibrary } from './QuickPromptLibrary'
import { ImagePromptsForm } from './ImagePromptsForm'
import { FavoriteField, Toggle } from './QuickPromptFields'
import { presetFavoriteKey, toOptions } from '../lib/quickPromptOptions'
import { getAtlasApi } from '../lib/api'
import { useToast } from './Toast'
import { cn } from '../lib/utils'
import {
  QuickPromptAntigravityButtons,
  QuickPromptAntigravityPanel,
  useQuickPromptAntigravity,
} from './QuickPromptAntigravityAudit'
import type { AnalyzeQuickPromptRequest } from '@shared/types'

/**
 * Prompts rápidos — exclusivo dos projetos de Música.
 *
 * Duas categorias, na mesma área:
 * - "Criar imagem": gera a imagem de referência (módulos de imagem).
 * - "Animar / Lipsync": anima uma imagem existente (módulos de vídeo).
 *
 * Toda a composição acontece localmente a partir dos presets de
 * `@shared/quickPrompts`. Selecionar já produz o prompt final.
 * O Antigravity entra só se o usuário clicar em analisar ou limpar.
 */

type QuickPromptTab = 'image' | 'animation'

/** A última categoria usada é lembrada entre sessões. */
const TAB_STORAGE_KEY = 'atlas.quickPrompts.tab'

function readStoredTab(): QuickPromptTab {
  try {
    return window.localStorage.getItem(TAB_STORAGE_KEY) === 'animation' ? 'animation' : 'image'
  } catch {
    return 'image'
  }
}

/**
 * `projectId` é opcional: sem projeto, a biblioteca mostra apenas os prompts
 * globais. É o que permite usar os Prompts rápidos direto no ambiente Música,
 * antes de existir qualquer projeto.
 */
export function QuickPromptsPanel({ projectId }: { projectId?: string | null }) {
  const api = getAtlasApi()
  const { push } = useToast()

  const [tab, setTab] = useState<QuickPromptTab>(readStoredTab)

  const [performanceId, setPerformanceId] = useState<PerformanceId>('singer-solo')
  const [actionId, setActionId] = useState<ActionId>('standing')
  const [framingId, setFramingId] = useState<FramingId>('auto')
  const [cameraId, setCameraId] = useState<CameraId>('auto')
  const [stageContextId, setStageContextId] = useState<StageContextId>('on-stage')
  const [lipSync, setLipSync] = useState(true)
  const [target, setTarget] = useState<PromptTarget>('generic')

  const [variations, setVariations] = useState<CameraVariation[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [copied, setCopied] = useState<string | null>(null)
  const [promptOverride, setPromptOverride] = useState<string | null>(null)

  const favoriteSet = useMemo(() => new Set(favorites), [favorites])

  const loadFavorites = useCallback(async () => {
    setFavorites(await api.quickPrompts.listFavorites())
  }, [api])

  useEffect(() => {
    void loadFavorites()
  }, [loadFavorites])

  const performance = useMemo(
    () => PERFORMANCES.find((item) => item.id === performanceId),
    [performanceId],
  )
  /** Lipsync só vale em performances com vocal em cena. */
  const lipSyncOn = lipSync && (performance?.supportsLipSync ?? false)

  const availableActions = useMemo(() => actionsForPerformance(performanceId), [performanceId])
  const availableFramings = useMemo(
    () => framingsForLipSync(lipSyncOn, performanceId),
    [lipSyncOn, performanceId],
  )
  const availableCameras = useMemo(
    () => camerasForAction(actionId, performanceId),
    [actionId, performanceId],
  )
  const sceneKind = useMemo(() => sceneKindFor(performanceId), [performanceId])
  const availableContexts = useMemo(() => stageContextsFor(sceneKind), [sceneKind])

  const composedPrompt = useMemo(
    () =>
      composePrompt({
        performanceId,
        actionId,
        framingId,
        cameraId,
        lipSync: lipSyncOn,
        target,
        stageContextId,
      }),
    [performanceId, actionId, framingId, cameraId, lipSyncOn, target, stageContextId],
  )
  const prompt = promptOverride ?? composedPrompt

  /** O que o "Automático profissional" escolheu de fato, para mostrar na UI. */
  const resolvedCamera = useMemo(
    () => resolveCamera(cameraId, actionId, performanceId),
    [cameraId, actionId, performanceId],
  )
  const resolvedFraming = useMemo(
    () => resolveFraming(framingId, actionId, lipSyncOn, performanceId),
    [framingId, actionId, lipSyncOn, performanceId],
  )

  // Trocar de performance pode invalidar a ação selecionada.
  useEffect(() => {
    if (!availableActions.some((action) => action.id === actionId)) {
      setActionId(defaultActionFor(performanceId))
    }
  }, [availableActions, actionId, performanceId])

  // Com lipsync ligado o rosto precisa continuar legível: perfis saem da lista.
  // Trocar para plateia/banda também invalida close-ups de cantor.
  useEffect(() => {
    setFramingId((current) => defaultFramingFor(lipSyncOn, current, performanceId))
  }, [lipSyncOn, performanceId])

  // Câmera incompatível com a nova ação volta para o automático.
  useEffect(() => {
    if (cameraId !== 'auto' && !availableCameras.some((camera) => camera.id === cameraId)) {
      setCameraId('auto')
    }
  }, [availableCameras, cameraId])

  // Plateia troca o seletor de palco por contextos de público.
  useEffect(() => {
    if (!availableContexts.some((context) => context.id === stageContextId)) {
      setStageContextId(availableContexts[0]?.id ?? 'on-stage')
    }
  }, [availableContexts, stageContextId])

  // Mudar qualquer bloco invalida as variações já listadas e o override do Antigravity.
  useEffect(() => {
    setVariations([])
    setPromptOverride(null)
  }, [performanceId, actionId, framingId, cameraId, lipSyncOn, target, stageContextId])

  const copy = useCallback(
    async (text: string, key: string, message = 'Prompt copiado') => {
      try {
        await api.system.copyText(text)
        setCopied(key)
        push(message, 'success')
        window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800)
      } catch {
        push('Não foi possível copiar o prompt.', 'error')
      }
    },
    [api, push],
  )

  const toggleFavorite = useCallback(
    async (category: string, id: string) => {
      const key = presetFavoriteKey(category, id)
      setFavorites(await api.quickPrompts.setFavorite(key, !favoriteSet.has(key)))
    },
    [api, favoriteSet],
  )

  function selectTab(next: QuickPromptTab) {
    setTab(next)
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, next)
    } catch {
      /* preferência de UI: se o storage falhar, seguimos sem lembrar */
    }
  }

  function generateVariations() {
    const next = buildCameraVariations({
      performanceId,
      actionId,
      framingId,
      lipSync: lipSyncOn,
      target,
      stageContextId,
    })
    setVariations(next)
    if (next.length === 0) push('Nenhum movimento compatível com esta ação.', 'error')
  }

  const auditContext = useMemo(
    (): Omit<AnalyzeQuickPromptRequest, 'prompt' | 'intent'> => ({
      kind: 'animation',
      performance: performance?.label ?? performanceId,
      action: availableActions.find((action) => action.id === actionId)?.label ?? actionId,
      framing: resolvedFraming?.label ?? framingId,
      camera: resolvedCamera?.label ?? cameraId,
      context: availableContexts.find((item) => item.id === stageContextId)?.label ?? stageContextId,
      lipSync: lipSyncOn,
      target: target === 'comfy-ltx' ? 'Comfy / LTX' : 'Genérico',
    }),
    [
      actionId,
      availableActions,
      availableContexts,
      cameraId,
      framingId,
      lipSyncOn,
      performance?.label,
      performanceId,
      resolvedCamera?.label,
      resolvedFraming?.label,
      stageContextId,
      target,
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
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-dark text-accent">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-text">Prompts rápidos</h2>
              <p className="text-xs text-muted">
                Blocos combinados localmente. Sem IA, sem espera — selecione e copie.
              </p>
            </div>
          </div>

          <div className="flex rounded-xl border border-border bg-card-2 p-1">
            <TabButton
              active={tab === 'image'}
              icon={<Image className="h-3.5 w-3.5" />}
              onClick={() => selectTab('image')}
            >
              Criar imagem
            </TabButton>
            <TabButton
              active={tab === 'animation'}
              icon={<Video className="h-3.5 w-3.5" />}
              onClick={() => selectTab('animation')}
            >
              Animar / Lipsync
            </TabButton>
          </div>
        </div>

        {tab === 'image' ? (
          <ImagePromptsForm
            favorites={favoriteSet}
            onToggleFavorite={(category, id) => void toggleFavorite(category, id)}
            onCopy={copy}
            copied={copied}
          />
        ) : (
          <>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FavoriteField
            label="Performance"
            favorite={favoriteSet.has(presetFavoriteKey('performance', performanceId))}
            onToggleFavorite={() => void toggleFavorite('performance', performanceId)}
          >
            <Select
              options={toOptions(PERFORMANCES, favoriteSet, 'performance')}
              value={performanceId}
              onChange={(e) => setPerformanceId(e.target.value as PerformanceId)}
            />
          </FavoriteField>

          <FavoriteField
            label="Ação"
            favorite={favoriteSet.has(presetFavoriteKey('action', actionId))}
            onToggleFavorite={() => void toggleFavorite('action', actionId)}
          >
            <Select
              options={toOptions(availableActions, favoriteSet, 'action')}
              value={actionId}
              onChange={(e) => setActionId(e.target.value as ActionId)}
            />
          </FavoriteField>

          <FavoriteField
            label="Enquadramento"
            // "Automático profissional" é uma regra, não um preset favoritável.
            favoritable={framingId !== 'auto'}
            favorite={favoriteSet.has(presetFavoriteKey('framing', framingId))}
            onToggleFavorite={() => void toggleFavorite('framing', framingId)}
          >
            <Select
              options={[
                { value: 'auto', label: 'Automático profissional' },
                ...toOptions(availableFramings, favoriteSet, 'framing'),
              ]}
              value={framingId}
              onChange={(e) => setFramingId(e.target.value as FramingId)}
            />
          </FavoriteField>

          <FavoriteField
            label="Câmera"
            // "Automático profissional" é uma regra, não um preset favoritável.
            favoritable={cameraId !== 'auto'}
            favorite={favoriteSet.has(presetFavoriteKey('camera', cameraId))}
            onToggleFavorite={() => void toggleFavorite('camera', cameraId)}
          >
            <Select
              options={[
                { value: 'auto', label: 'Automático profissional' },
                ...toOptions(availableCameras, favoriteSet, 'camera'),
              ]}
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value as CameraId)}
            />
          </FavoriteField>

          <FavoriteField
            label={sceneKind === 'audience' ? 'Contexto da plateia' : 'Contexto de palco'}
            favorite={favoriteSet.has(presetFavoriteKey('stage-context', stageContextId))}
            onToggleFavorite={() => void toggleFavorite('stage-context', stageContextId)}
          >
            <Select
              options={toOptions(availableContexts, favoriteSet, 'stage-context')}
              value={stageContextId}
              onChange={(e) => setStageContextId(e.target.value as StageContextId)}
            />
          </FavoriteField>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted">Lipsync</span>
            <Toggle
              checked={lipSyncOn}
              disabled={!performance?.supportsLipSync}
              onChange={setLipSync}
              label={lipSyncOn ? 'Ligado' : 'Desligado'}
            />
          </div>

          <div className="w-full max-w-[220px]">
            <Select
              label="Destino"
              options={[
                { value: 'generic', label: 'Genérico' },
                { value: 'comfy-ltx', label: 'Comfy / LTX' },
              ]}
              value={target}
              onChange={(e) => setTarget(e.target.value as PromptTarget)}
            />
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              icon={
                copied === 'main' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />
              }
              onClick={() => void copy(prompt, 'main')}
            >
              {copied === 'main' ? 'Copiado' : 'Copiar prompt'}
            </Button>
            <Button
              variant="secondary"
              icon={<Layers className="h-4 w-4" />}
              onClick={generateVariations}
            >
              Criar variações de câmera
            </Button>
            <QuickPromptAntigravityButtons
              busy={audit.busy}
              onAnalyze={audit.analyze}
              onClean={audit.clean}
            />
          </div>
        </div>

        {!performance?.supportsLipSync ? (
          <p className="text-xs text-muted-2">
            Esta performance não tem vocal em cena, então o bloco de sincronização labial fica fora
            do prompt.
          </p>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Prompt final</span>
            <span className="text-muted-2">
              {[
                framingId === 'auto' && resolvedFraming
                  ? `Enquadramento: ${resolvedFraming.label}`
                  : null,
                cameraId === 'auto' && resolvedCamera ? `Câmera: ${resolvedCamera.label}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
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
              {variations.length} variações compatíveis com “
              {ACTIONS.find((action) => action.id === actionId)?.label}”
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {variations.map((variation, index) => (
                <div
                  key={variation.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card-2 px-3 py-2"
                >
                  <span className="w-5 shrink-0 text-xs font-semibold text-muted-2">
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
                    onClick={() => void copy(variation.prompt, variation.id)}
                  >
                    {copied === variation.id ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
          </>
        )}
      </Card>

      <QuickPromptLibrary
        projectId={projectId ?? null}
        favorites={favoriteSet}
        onFavoritesChange={setFavorites}
        onCopy={copy}
        copied={copied}
      />
    </div>
  )
}

function TabButton({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean
  icon: ReactNode
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
        active ? 'bg-accent-dark text-accent' : 'text-muted hover:text-text',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
