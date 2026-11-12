import type { LucideIcon } from 'lucide-react'
import { Blend, Captions, Mic2, Sparkles, Type, Upload, Wand2 } from 'lucide-react'

export type EditorLibraryTool =
  | 'media'
  | 'effects'
  | 'animations'
  | 'transitions'
  | 'captions'
  | 'text'
  | 'lipsync'

export const EDITOR_LIBRARY_TOOLS: Array<{
  id: EditorLibraryTool
  label: string
  Icon: LucideIcon
  hint: string
}> = [
  { id: 'media', label: 'Mídia', Icon: Upload, hint: 'Vídeos, áudios e imagens' },
  { id: 'effects', label: 'Efeitos', Icon: Sparkles, hint: 'Efeitos visuais nos clipes' },
  { id: 'animations', label: 'Animação', Icon: Wand2, hint: 'Entrada, saída e combinação' },
  { id: 'transitions', label: 'Transições', Icon: Blend, hint: 'Passagens entre clipes' },
  { id: 'captions', label: 'Legendas', Icon: Captions, hint: 'Legendas sincronizadas' },
  { id: 'text', label: 'Texto', Icon: Type, hint: 'Títulos e textos na timeline' },
  { id: 'lipsync', label: 'Lipsync', Icon: Mic2, hint: 'Vídeos gerados no Comfy' },
]
