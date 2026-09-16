import {
  ACTION_BY_ID,
  ACTIONS,
  AUTO_CAMERA_BY_ACTION,
  AUTO_FRAMING_BY_ACTION,
  CAMERA_BY_ID,
  CAMERA_STYLE,
  CAMERAS,
  FORBIDDEN_CAMERA_MOVES,
  FRAMING_BY_ID,
  FRAMINGS,
  LIP_SYNC_BLOCK,
  PERFORMANCE_BY_ID,
  PERFORMANCES,
  QUALITY_CONSTRAINTS,
  REFERENCE_PRESERVATION,
  TARGET_INTRO,
} from './presets'
import {
  NO_LIP_SYNC_REQUIREMENT,
  SCENE_CAMERAS,
  SCENE_FRAMINGS,
  isNonSingerScene,
  sceneBlocksFor,
  sceneKindFor,
} from './sceneBlocks'
import { composeStageContextText, stageContextConstraints } from './stageContext'
import type {
  ActionId,
  ActionPreset,
  CameraId,
  CameraPreset,
  CameraVariation,
  ComposePromptInput,
  FramingId,
  FramingPreset,
  PerformanceId,
} from './types'

/**
 * Composição dos Prompts rápidos.
 *
 * Funções puras, sem dependência de React, de Electron ou de rede. O prompt é
 * sempre montado a partir dos presets locais — nenhuma IA participa do processo.
 *
 * Guitarrista, baterista, banda sem cantor e plateia usam blocos próprios e
 * não herdam preservação, lipsync, enquadramento nem câmera de cantor.
 */

const MAX_VARIATIONS = 8

const SCENE_CAMERA_BY_ID = new Map<Exclude<CameraId, 'auto'>, CameraPreset>(
  SCENE_CAMERAS.map((item) => [item.id, item]),
)
const SCENE_FRAMING_BY_ID = new Map<Exclude<FramingId, 'auto'>, FramingPreset>(
  SCENE_FRAMINGS.map((item) => [item.id, item]),
)

function cameraById(id: Exclude<CameraId, 'auto'>): CameraPreset | undefined {
  return CAMERA_BY_ID.get(id) ?? SCENE_CAMERA_BY_ID.get(id)
}

function framingById(id: Exclude<FramingId, 'auto'>): FramingPreset | undefined {
  return FRAMING_BY_ID.get(id) ?? SCENE_FRAMING_BY_ID.get(id)
}

/** Ações oferecidas para uma performance. */
export function actionsForPerformance(performanceId: PerformanceId): ActionPreset[] {
  const performance = PERFORMANCE_BY_ID.get(performanceId)
  if (!performance) return []
  return ACTIONS.filter((action) => performance.compatibleActions.includes(action.id))
}

/** Movimentos de câmera fisicamente plausíveis para uma ação (e família de cena). */
export function camerasForAction(
  actionId: ActionId,
  performanceId?: PerformanceId,
): CameraPreset[] {
  const scene = sceneBlocksFor(performanceId)
  const pool = scene
    ? scene.cameraIds
        .map((id) => cameraById(id))
        .filter((camera): camera is CameraPreset => Boolean(camera))
        .filter((camera) =>
          sceneKindFor(performanceId) === 'audience'
            ? true
            : isCameraCompatible(camera, actionId),
        )
    : CAMERAS.filter((camera) => isCameraCompatible(camera, actionId))

  const priority = scene?.autoCamera ?? AUTO_CAMERA_BY_ACTION[actionId] ?? []
  return [...pool].sort((a, b) => {
    const rankA = priority.indexOf(a.id)
    const rankB = priority.indexOf(b.id)
    if (rankA === rankB) return 0
    if (rankA < 0) return 1
    if (rankB < 0) return -1
    return rankA - rankB
  })
}

/**
 * Resolve "Automático profissional" pelas regras da ação — determinístico,
 * sempre a primeira câmera compatível da lista.
 */
export function resolveCamera(
  cameraId: CameraId,
  actionId: ActionId,
  performanceId?: PerformanceId,
): CameraPreset | null {
  if (cameraId !== 'auto') {
    const explicit = cameraById(cameraId)
    if (explicit && isCameraCompatible(explicit, actionId)) {
      const scene = sceneBlocksFor(performanceId)
      if (!scene || scene.cameraIds.includes(explicit.id)) return applyCameraSceneText(explicit, performanceId)
    }
  }
  const fallback = camerasForAction(actionId, performanceId)
  return fallback[0] ? applyCameraSceneText(fallback[0], performanceId) : null
}

function isCameraCompatible(camera: CameraPreset, actionId: ActionId): boolean {
  return (
    camera.compatibleActions.includes(actionId) && !camera.blockedActions?.includes(actionId)
  )
}

function applyCameraSceneText(camera: CameraPreset, performanceId?: PerformanceId): CameraPreset {
  const scene = sceneBlocksFor(performanceId)
  const text = scene?.cameraTexts[camera.id]
  if (!text) return camera
  return { ...camera, text }
}

function applyFramingSceneText(framing: FramingPreset, performanceId?: PerformanceId): FramingPreset {
  const scene = sceneBlocksFor(performanceId)
  const text = scene?.framingTexts[framing.id]
  if (!text) return framing
  return { ...framing, text }
}

/** Enquadramentos sugeridos. Com lipsync ligado, o rosto precisa continuar legível. */
export function framingsForLipSync(
  lipSync: boolean,
  performanceId?: PerformanceId,
): FramingPreset[] {
  const scene = sceneBlocksFor(performanceId)
  const pool = scene
    ? scene.framingIds
        .map((id) => framingById(id))
        .filter((framing): framing is FramingPreset => Boolean(framing))
    : FRAMINGS
  const visible = pool.map((framing) => applyFramingSceneText(framing, performanceId))
  if (!lipSync) return visible
  return visible.filter((framing) => framing.lipSyncFriendly)
}

/**
 * Resolve o enquadramento "Automático profissional" pelas regras da ação.
 * Determinístico: a primeira opção compatível da lista sempre vence.
 */
export function resolveFraming(
  framingId: FramingId,
  actionId: ActionId,
  lipSync: boolean,
  performanceId?: PerformanceId,
): FramingPreset | null {
  const pool = framingsForLipSync(lipSync, performanceId)
  if (framingId !== 'auto') {
    const explicit = pool.find((framing) => framing.id === framingId)
    if (explicit) return explicit
  }
  const autoIds = sceneBlocksFor(performanceId)?.autoFraming ?? AUTO_FRAMING_BY_ACTION[actionId] ?? []
  for (const id of autoIds) {
    const found = pool.find((framing) => framing.id === id)
    if (found) return found
  }
  return pool[0] ?? null
}

function joinSentences(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
}

/** Cantor + banda, banda instrumental, ou ação de conjunto. */
function isEnsembleScene(performanceId: PerformanceId, actionId: ActionId): boolean {
  return performanceId === 'singer-band' || performanceId === 'band-no-singer' || actionId === 'band'
}

/**
 * Monta o prompt final a partir dos blocos selecionados.
 * Retorna apenas a string — nenhum efeito colateral.
 */
export function composePrompt(input: ComposePromptInput): string {
  const performance = PERFORMANCE_BY_ID.get(input.performanceId)
  const action = ACTION_BY_ID.get(input.actionId)
  const camera = resolveCamera(input.cameraId, input.actionId, input.performanceId)
  const scene = sceneBlocksFor(input.performanceId)
  const kind = sceneKindFor(input.performanceId)

  // Lipsync só entra em performances com vocal. As 4 cenas sem cantor nunca
  // recebem o bloco de sincronização labial, mesmo com o toggle ligado.
  const lipSync =
    !scene && input.lipSync && (performance?.supportsLipSync ?? false)
  const framing = resolveFraming(input.framingId, input.actionId, lipSync, input.performanceId)
  const stageOptions = {
    stageContextId: input.stageContextId,
    ensemble: isEnsembleScene(input.performanceId, input.actionId),
    keepLeadSinger: Boolean(
      performance?.supportsLipSync && isEnsembleScene(input.performanceId, input.actionId),
    ),
    animation: true,
    sceneKind: kind,
  }

  const intro = scene ? scene.intro[input.target] : TARGET_INTRO[input.target]
  const preservation = scene ? scene.preservation : REFERENCE_PRESERVATION
  // Plateia usa ações próprias no prompt; as outras cenas sem cantor já descrevem
  // o movimento no bloco de performance, então não reaproveitam texto de performer.
  const actionText = scene && kind !== 'audience' ? '' : (action?.text ?? '')

  const sections: string[] = [
    intro,
    preservation,
    performance?.text ?? '',
    actionText,
    framing?.text ?? '',
    joinSentences([camera?.text ?? '', CAMERA_STYLE]),
    composeStageContextText(stageOptions),
  ]

  if (lipSync) sections.push(LIP_SYNC_BLOCK)
  if (scene) sections.push(NO_LIP_SYNC_REQUIREMENT)

  const negatives = [
    ...(scene ? scene.forbiddenCameraMoves : FORBIDDEN_CAMERA_MOVES),
    ...QUALITY_CONSTRAINTS,
    ...(scene ? scene.constraints : []),
    ...stageContextConstraints(stageOptions),
  ]
  sections.push(`Avoid: ${negatives.join(', ')}.`)

  return sections
    .map((section) => section.trim())
    .filter(Boolean)
    .join('\n\n')
}

/** Rótulo curto de uma combinação, usado na lista de variações. */
function variationLabel(framing: FramingPreset, camera: CameraPreset): string {
  return `${framing.label} + ${camera.label}`
}

/**
 * Gera até 8 variações de câmera combinando enquadramentos e movimentos
 * compatíveis com a ação. Determinístico: as mesmas entradas produzem sempre
 * a mesma lista, na mesma ordem. Não há sorteio nem IA.
 */
export function buildCameraVariations(
  input: Omit<ComposePromptInput, 'cameraId'>,
  limit = MAX_VARIATIONS,
): CameraVariation[] {
  const performance = PERFORMANCE_BY_ID.get(input.performanceId)
  const scene = isNonSingerScene(input.performanceId)
  const lipSync = !scene && input.lipSync && (performance?.supportsLipSync ?? false)

  const cameras = camerasForAction(input.actionId, input.performanceId)
  if (cameras.length === 0) return []

  const framings = variationFramings(
    input.framingId,
    input.actionId,
    lipSync,
    input.performanceId,
  )
  const variations: CameraVariation[] = []
  const seen = new Set<string>()
  const maxSteps = framings.length * cameras.length

  for (let step = 0; step < maxSteps && variations.length < limit; step += 1) {
    const framing = framings[step % framings.length]
    const camera = cameras[step % cameras.length]
    const key = `${framing.id}|${camera.id}`
    if (seen.has(key)) continue
    seen.add(key)

    variations.push({
      id: key,
      framingId: framing.id,
      cameraId: camera.id,
      label: variationLabel(framing, camera),
      prompt: composePrompt({
        ...input,
        framingId: framing.id,
        cameraId: camera.id,
      }),
    })
  }

  return variations
}

/**
 * Ordem dos enquadramentos nas variações: começa pelo que está selecionado
 * (ou pelo automático da ação), depois percorre os demais compatíveis.
 */
function variationFramings(
  selectedId: FramingId,
  actionId: ActionId,
  lipSync: boolean,
  performanceId?: PerformanceId,
): FramingPreset[] {
  const pool = framingsForLipSync(lipSync, performanceId)
  const first = resolveFraming(selectedId, actionId, lipSync, performanceId)
  if (!first) return pool
  return [first, ...pool.filter((framing) => framing.id !== first.id)]
}

/** Primeira ação válida para a performance — usada ao trocar de performance na UI. */
export function defaultActionFor(performanceId: PerformanceId): ActionId {
  return actionsForPerformance(performanceId)[0]?.id ?? 'natural'
}

/**
 * Corrige a seleção de enquadramento quando o lipsync muda. "Automático" é
 * sempre válido; um perfil deixa de ser assim que o lipsync entra.
 */
export function defaultFramingFor(
  lipSync: boolean,
  current?: FramingId,
  performanceId?: PerformanceId,
): FramingId {
  if (current === 'auto') return 'auto'
  const pool = framingsForLipSync(lipSync, performanceId)
  if (current && pool.some((framing) => framing.id === current)) return current
  return 'auto'
}

export { PERFORMANCES, FRAMINGS, ACTIONS, CAMERAS }
