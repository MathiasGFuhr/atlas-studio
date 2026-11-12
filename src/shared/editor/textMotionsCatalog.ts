/**
 * Moções tipográficas estilo React Bits / Remotion Bits / GSAP SplitText.
 * Presets próprios MIT — não embute as libs Remotion (incompatíveis com o player Atlas).
 * O preview usa GSAP + split manual (chars/words).
 */

export type EditorTextMotionId =
  | 'none'
  | 'split-chars'
  | 'split-words'
  | 'blur-in'
  | 'typewriter'
  | 'glitch-in'
  | 'decrypt'
  | 'shuffle'
  | 'word-by-word'
  | 'stagger-up'
  | 'stagger-scale'
  | 'fade-lines'
  | 'slide-left-words'
  | 'elastic-chars'
  | 'matrix-reveal'

export type EditorTextMotionSource = 'react-bits' | 'remotion-bits' | 'gsap-splittext'

export type EditorTextMotionDef = {
  id: EditorTextMotionId
  label: string
  description: string
  source: EditorTextMotionSource
  /** Duração típica da revelação (s). */
  duration: number
  /** Como fatiar o texto no preview. */
  split: 'none' | 'char' | 'word' | 'line'
}

export const EDITOR_TEXT_MOTION_SOURCE_LABEL: Record<EditorTextMotionSource, string> = {
  'react-bits': 'React Bits',
  'remotion-bits': 'Remotion Bits',
  'gsap-splittext': 'GSAP SplitText',
}

export const EDITOR_TEXT_MOTIONS: EditorTextMotionDef[] = [
  {
    id: 'none',
    label: 'Nenhuma',
    description: 'Texto estático (só animações de entrada/saída do clipe)',
    source: 'gsap-splittext',
    duration: 0,
    split: 'none',
  },
  {
    id: 'split-chars',
    label: 'Split chars',
    description: 'Letras entram em stagger — estilo GSAP SplitText',
    source: 'gsap-splittext',
    duration: 0.9,
    split: 'char',
  },
  {
    id: 'split-words',
    label: 'Split words',
    description: 'Palavras entram em stagger — SplitText por palavra',
    source: 'gsap-splittext',
    duration: 0.85,
    split: 'word',
  },
  {
    id: 'elastic-chars',
    label: 'Elastic chars',
    description: 'Letras com bounce elástico (GSAP elastic)',
    source: 'gsap-splittext',
    duration: 1.1,
    split: 'char',
  },
  {
    id: 'blur-in',
    label: 'Blur in',
    description: 'Desfoque → nítido palavra a palavra — React Bits / Remotion Blur In',
    source: 'react-bits',
    duration: 1,
    split: 'word',
  },
  {
    id: 'typewriter',
    label: 'Typewriter',
    description: 'Digitação com cursor — React Bits TextType / Remotion Typewriter',
    source: 'react-bits',
    duration: 1.4,
    split: 'none',
  },
  {
    id: 'glitch-in',
    label: 'Glitch in',
    description: 'RGB split + jitter — React Bits Glitch / Remotion Glitch In',
    source: 'react-bits',
    duration: 0.75,
    split: 'none',
  },
  {
    id: 'decrypt',
    label: 'Decrypt',
    description: 'Glifos aleatórios até resolver — React Bits Decrypted Text',
    source: 'react-bits',
    duration: 1.2,
    split: 'char',
  },
  {
    id: 'shuffle',
    label: 'Shuffle',
    description: 'Letras embaralham e assentam — React Bits Shuffle',
    source: 'react-bits',
    duration: 1,
    split: 'char',
  },
  {
    id: 'word-by-word',
    label: 'Word by word',
    description: 'Revelação palavra a palavra — Remotion Bits',
    source: 'remotion-bits',
    duration: 1,
    split: 'word',
  },
  {
    id: 'stagger-up',
    label: 'Stagger up',
    description: 'Chars sobem com fade — Remotion Staggered Char',
    source: 'remotion-bits',
    duration: 0.95,
    split: 'char',
  },
  {
    id: 'stagger-scale',
    label: 'Stagger scale',
    description: 'Chars crescem de 0 — Remotion Bits scale stagger',
    source: 'remotion-bits',
    duration: 0.9,
    split: 'char',
  },
  {
    id: 'fade-lines',
    label: 'Fade lines',
    description: 'Linhas em fade sequencial — Remotion Bits',
    source: 'remotion-bits',
    duration: 0.9,
    split: 'line',
  },
  {
    id: 'slide-left-words',
    label: 'Slide words',
    description: 'Palavras deslizam da esquerda — Remotion Slide',
    source: 'remotion-bits',
    duration: 0.85,
    split: 'word',
  },
  {
    id: 'matrix-reveal',
    label: 'Matrix reveal',
    description: 'Cascata estilo matrix — Remotion Matrix / React Bits',
    source: 'remotion-bits',
    duration: 1.15,
    split: 'char',
  },
]

export function editorTextMotionById(id: string | null | undefined): EditorTextMotionDef | undefined {
  if (!id) return undefined
  return EDITOR_TEXT_MOTIONS.find((item) => item.id === id)
}

export function normalizeTextMotionId(raw: unknown): EditorTextMotionId {
  if (typeof raw === 'string' && EDITOR_TEXT_MOTIONS.some((item) => item.id === raw)) {
    return raw as EditorTextMotionId
  }
  return 'none'
}
