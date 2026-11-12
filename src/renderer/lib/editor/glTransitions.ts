import transitions from 'gl-transitions'
import { EDITOR_TRANSITIONS, type EditorTransitionDef } from '@shared/editor/transitionsCatalog'

export type GlTransitionShader = {
  name: string
  glsl: string
  defaultParams?: Record<string, number>
}

type GlTransitionPackageItem = {
  name: string
  glsl: string
  defaultParams?: Record<string, number>
}

const byName = new Map(
  (transitions as GlTransitionPackageItem[]).map((item) => [item.name.toLowerCase(), item]),
)

export function listGlTransitionShaders(): GlTransitionShader[] {
  return (transitions as GlTransitionPackageItem[]).map((item) => ({
    name: item.name,
    glsl: item.glsl,
    defaultParams: item.defaultParams,
  }))
}

export function resolveGlTransition(def: EditorTransitionDef): GlTransitionShader | null {
  const hit = byName.get(def.glName.toLowerCase())
  if (!hit) return null
  return { name: hit.name, glsl: hit.glsl, defaultParams: hit.defaultParams }
}

export function curatedGlTransitions(): Array<EditorTransitionDef & { shader: GlTransitionShader | null }> {
  return EDITOR_TRANSITIONS.map((item) => ({ ...item, shader: resolveGlTransition(item) }))
}
