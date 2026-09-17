import { ANIMATION_SCENE_BODIES } from './bodies'
import { formatAvoid, joinSentences } from '../helpers'
import { ACTION_BY_ID, PERFORMANCE_BY_ID } from '../presets'
import { composeStageContextText, stageContextConstraints } from '../stageContext'
import { sceneKindFor } from '../sceneBlocks'
import type { CameraPreset, ComposePromptInput, FramingPreset } from '../types'

const IMPLIED_ACTIONS: Record<string, string[]> = {
  'singer-solo': ['standing', 'natural'],
  'singer-mic': ['standing', 'natural'],
  'singer-acoustic': ['standing', 'acoustic-guitar', 'natural'],
  'singer-electric': ['standing', 'electric-guitar', 'natural'],
  'singer-band': ['standing', 'band', 'natural'],
  guitarist: ['electric-guitar', 'natural'],
  drummer: ['natural'],
  'band-no-singer': ['band', 'natural'],
  audience: [],
}

export function composeSingerLipSyncPrompt(
  input: ComposePromptInput,
  framing: FramingPreset | null,
  camera: CameraPreset | null,
): string {
  return composeAnimationScenePrompt(input, framing, camera)
}

export function composeSingerAnimationPrompt(
  input: ComposePromptInput,
  framing: FramingPreset | null,
  camera: CameraPreset | null,
): string {
  return composeAnimationScenePrompt(input, framing, camera)
}

export function composeGuitaristAnimationPrompt(
  input: ComposePromptInput,
  framing: FramingPreset | null,
  camera: CameraPreset | null,
): string {
  return composeAnimationScenePrompt(input, framing, camera)
}

export function composeDrummerAnimationPrompt(
  input: ComposePromptInput,
  framing: FramingPreset | null,
  camera: CameraPreset | null,
): string {
  return composeAnimationScenePrompt(input, framing, camera)
}

export function composeBandAnimationPrompt(
  input: ComposePromptInput,
  framing: FramingPreset | null,
  camera: CameraPreset | null,
): string {
  return composeAnimationScenePrompt(input, framing, camera)
}

export function composeAudienceAnimationPrompt(
  input: ComposePromptInput,
  framing: FramingPreset | null,
  camera: CameraPreset | null,
): string {
  return composeAnimationScenePrompt(input, framing, camera)
}

export function composeAnimationScenePrompt(
  input: ComposePromptInput,
  framing: FramingPreset | null,
  camera: CameraPreset | null,
): string {
  const performance = PERFORMANCE_BY_ID.get(input.performanceId)
  const scene = ANIMATION_SCENE_BODIES[input.performanceId]
  const kind = sceneKindFor(input.performanceId)
  const lipSync = Boolean(
    input.lipSync && performance?.supportsLipSync && kind === 'singer',
  )
  const implied = IMPLIED_ACTIONS[input.performanceId] ?? []
  const action = ACTION_BY_ID.get(input.actionId)
  const actionText = action && !implied.includes(input.actionId) ? action.text : ''
  const prefix = input.target === 'comfy-ltx' ? 'Image-to-video.' : ''
  const body = lipSync ? (scene.withLipSync ?? scene.withoutLipSync) : scene.withoutLipSync
  const stageOptions = {
    stageContextId: input.stageContextId,
    ensemble: input.performanceId === 'singer-band' || input.performanceId === 'band-no-singer' || input.actionId === 'band',
    keepLeadSinger: input.performanceId === 'singer-band',
    animation: true,
    sceneKind: kind,
  }

  return joinSentences([
    prefix,
    body,
    actionText,
    framing?.text,
    camera?.text,
    composeStageContextText(stageOptions),
    formatAvoid([...(scene.negatives ?? []), ...stageContextConstraints(stageOptions)]),
  ])
}
