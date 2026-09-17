import { formatAvoid, joinSentences } from '../helpers'
import { IMAGE_SCENE_BODIES } from './bodies'
import { IMAGE_PERFORMANCE_BY_ID, IMAGE_SUBJECT_BY_ID } from '../imagePresets'
import { composeStageContextText, stageContextConstraints } from '../stageContext'
import type { ComposeImagePromptInput, ImageFramingPreset } from '../imageTypes'

const IMPLIED_IMAGE_PERFORMANCE: Record<string, string[]> = {
  'singer-solo': ['singing-mic', 'standing-singing', 'natural'],
  'singer-acoustic': ['acoustic-singing', 'natural'],
  'singer-electric': ['electric-singing', 'natural'],
  'singer-full-band': ['natural-with-band', 'natural'],
  'singer-guitarist': ['natural-with-band', 'natural'],
  'singer-drummer': ['natural-with-band', 'natural'],
  'singer-guitarist-drummer': ['natural-with-band', 'natural'],
  'guitarist-solo': ['guitar-playing', 'natural'],
  'drummer-solo': ['drums-playing', 'natural'],
  'guitarist-drummer': ['band-playing', 'natural'],
  'band-no-singer': ['band-playing', 'natural'],
  'band-with-singer': ['band-playing', 'natural-with-band', 'natural'],
  audience: [],
}

export function composeSingerImagePrompt(
  input: ComposeImagePromptInput,
  framing: ImageFramingPreset | null,
): string {
  return composeImageScenePrompt(input, framing)
}

export function composeInstrumentalistImagePrompt(
  input: ComposeImagePromptInput,
  framing: ImageFramingPreset | null,
): string {
  return composeImageScenePrompt(input, framing)
}

export function composeBandImagePrompt(
  input: ComposeImagePromptInput,
  framing: ImageFramingPreset | null,
): string {
  return composeImageScenePrompt(input, framing)
}

export function composeAudienceImagePrompt(
  input: ComposeImagePromptInput,
  framing: ImageFramingPreset | null,
): string {
  return composeImageScenePrompt(input, framing)
}

export function composeImageScenePrompt(
  input: ComposeImagePromptInput,
  framing: ImageFramingPreset | null,
): string {
  const subject = IMAGE_SUBJECT_BY_ID.get(input.subjectId)
  const body = IMAGE_SCENE_BODIES[input.subjectId]
  const performance = IMAGE_PERFORMANCE_BY_ID.get(input.performanceId)
  const implied = IMPLIED_IMAGE_PERFORMANCE[input.subjectId] ?? []
  const performanceText =
    performance && !implied.includes(input.performanceId) ? performance.text : ''
  const lipSync = input.purpose === 'lipsync' && Boolean(subject?.hasSinger)
  const ensemble = subject?.framingGroup === 'band'
  const stageOptions = {
    stageContextId: input.stageContextId,
    ensemble,
    keepLeadSinger: Boolean(subject?.hasSinger && ensemble),
    sceneKind: imageSceneKind(subject?.framingGroup, subject?.hasSinger),
  }

  const prompt = joinSentences([
    body?.text,
    performanceText,
    framing?.text,
    composeStageContextText(stageOptions),
    lipSync ? body?.lipsyncLine ?? '' : '',
    formatAvoid([
      ...(body?.negatives ?? []),
      ...stageContextConstraints(stageOptions),
    ]),
  ])

  return prompt
}

export function imageSceneKind(
  framingGroup: 'singer' | 'guitarist' | 'drummer' | 'band' | 'audience' | undefined,
  hasSinger: boolean | undefined,
): 'singer' | 'guitarist' | 'drummer' | 'band-no-singer' | 'audience' {
  if (framingGroup === 'audience') return 'audience'
  if (framingGroup === 'guitarist') return 'guitarist'
  if (framingGroup === 'drummer') return 'drummer'
  if (framingGroup === 'band' && !hasSinger) return 'band-no-singer'
  return 'singer'
}
