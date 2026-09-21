/**
 * Prompts rápidos — tipos da biblioteca de presets.
 *
 * Tudo aqui é dado estático e composição local: nenhuma chamada de IA,
 * de rede ou de processo externo participa da montagem dos prompts.
 */

import type { StageContextId } from './stageContext'

export type QuickPromptCategory =
  | 'performance'
  | 'action'
  | 'framing'
  | 'camera'
  | 'stage-context'

/** Destino do prompt final. */
export type PromptTarget = 'generic' | 'comfy-ltx'

export type PerformanceId =
  | 'singer-solo'
  | 'singer-mic'
  | 'singer-acoustic'
  | 'singer-electric'
  | 'singer-band'
  | 'guitarist'
  | 'drummer'
  | 'band-no-singer'
  | 'audience'

export type ActionId =
  | 'standing'
  | 'seated'
  | 'walking'
  | 'driving'
  | 'acoustic-guitar'
  | 'electric-guitar'
  | 'band'
  | 'natural'
  | 'audience-reaction'
  | 'audience-clapping'
  | 'audience-singing-along'
  | 'audience-arms-raised'
  | 'audience-emotional'
  | 'audience-high-energy'
  | 'audience-watching'

export type FramingId =
  | 'auto'
  | 'close-up'
  | 'medium-close-up'
  | 'medium-shot'
  | 'medium-wide'
  | 'three-quarter-front'
  | 'three-quarter-left'
  | 'three-quarter-right'
  | 'profile-left'
  | 'profile-right'
  | 'eye-level'
  | 'low-angle-slight'
  | 'crowd-medium-shot'
  | 'crowd-medium-wide'
  | 'front-row-reaction'
  | 'audience-section'
  | 'side-crowd-view'
  | 'close-reaction-group'
  | 'diagonal-crowd'
  | 'crowd-stage-background'

export type CameraId =
  | 'auto'
  | 'slow-push-in'
  | 'very-slow-push-in'
  | 'gentle-pull-back'
  | 'lateral-tracking-left'
  | 'lateral-tracking-right'
  | 'smooth-backward-tracking'
  | 'smooth-forward-tracking'
  | 'parallel-tracking'
  | 'controlled-follow'
  | 'three-quarter-tracking'
  | 'locked-cinematic'
  | 'subtle-diagonal-dolly'
  | 'subtle-handheld'
  | 'passenger-side-fixed'
  | 'dashboard-mounted'
  | 'passenger-three-quarter'
  | 'exterior-vehicle-tracking'
  | 'locked-cinematic-crowd'
  | 'very-slow-push-in-crowd'
  | 'gentle-lateral-crowd'
  | 'stable-crowd'
  | 'subtle-handheld-crowd'
  | 'slow-controlled-pull-back-crowd'

/**
 * Família de cena da aba Animar / Lipsync.
 * Cantor continua no caminho padrão; as outras famílias usam blocos próprios.
 */
export type SceneKind = 'singer' | 'guitarist' | 'drummer' | 'band-no-singer' | 'audience'

export interface PerformancePreset {
  id: PerformanceId
  category: 'performance'
  label: string
  text: string
  /** Ações oferecidas para esta performance. */
  compatibleActions: ActionId[]
  /** Performances sem vocal não oferecem lipsync. */
  supportsLipSync: boolean
}

export interface ActionPreset {
  id: ActionId
  category: 'action'
  label: string
  text: string
}

export interface FramingPreset {
  id: Exclude<FramingId, 'auto'>
  category: 'framing'
  label: string
  text: string
  /** Mantém o rosto visível o suficiente para lipsync confiável. */
  lipSyncFriendly: boolean
}

export interface CameraPreset {
  id: Exclude<CameraId, 'auto'>
  category: 'camera'
  label: string
  text: string
  /** Ações em que este movimento é fisicamente plausível e profissional. */
  compatibleActions: ActionId[]
  blockedActions?: ActionId[]
}

export interface ComposePromptInput {
  performanceId: PerformanceId
  actionId: ActionId
  framingId: FramingId
  cameraId: CameraId
  lipSync: boolean
  target: PromptTarget
  stageContextId: StageContextId
}

export interface CameraVariation {
  id: string
  framingId: Exclude<FramingId, 'auto'>
  cameraId: Exclude<CameraId, 'auto'>
  /** Rótulo curto no formato "3/4 esquerdo + Lateral tracking". */
  label: string
  prompt: string
}

/** Prompt escrito à mão pelo usuário, persistido no SQLite. */
export interface CustomPrompt {
  id: string
  name: string
  category: string
  text: string
  /** Sub-aba em Meus prompts. `null` = sem aba (aparece só em Todos). */
  tabId: string | null
  /** `null` = disponível em todos os projetos de Música. */
  projectId: string | null
  createdAt: string
  updatedAt: string
}

/** Sub-aba criada pelo usuário em Meus prompts (lipsync, câmeras, etc.). */
export interface CustomPromptTab {
  id: string
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** Id sintético da vista que lista todos os prompts, independente de aba. */
export const ALL_PROMPT_TABS_ID = 'all'
