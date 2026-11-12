/**
 * Catálogo de modelos de texto (estilo CapCut + packs editoriais).
 * Presets próprios MIT — inspirados em Motion Array / Envato Titles / Mister Horse Essential Typography
 * (sem assets proprietários).
 */

import type { EditorTextAlign } from './types'

export type { EditorTextAlign }

export type EditorTextCategory =
  | 'music'
  | 'classic'
  | 'lower-third'
  | 'title'
  | 'outro'
  | 'social'
  | 'kinetic'
  | 'caption'
  | 'promo'
  | 'quote'
  | 'numbers'
  | 'sticker'
  | 'film'
  | 'podcast'
  | 'gaming'
  | 'warning'
  | 'bits'
  | 'ma-kinetic'
  | 'envato-titles'
  | 'mh-essential'

export type EditorTextVAlign = 'top' | 'center' | 'bottom'

export type EditorTextTemplateDef = {
  id: string
  category: EditorTextCategory
  label: string
  description: string
  defaultTitle: string
  defaultSubtitle: string
  /** CSS tipografia do título. */
  titleStyle: ReactTextStyle
  subtitleStyle?: ReactTextStyle
  /** Fundo/placa opcional atrás do texto. */
  plate?: {
    background: string
    paddingX: string
    paddingY: string
    borderRadius: string
    border?: string
  }
  align: EditorTextAlign
  vAlign: EditorTextVAlign
  /** Offset vertical em % do frame (0 = topo, 100 = base). */
  yPercent: number
  xPercent: number
  /** Animação sugerida ao inserir. */
  defaultInId?: string | null
  defaultOutId?: string | null
  /** Moção tipográfica (SplitText / Bits). */
  defaultMotionId?: string | null
  /** Cor de fundo do card na biblioteca. */
  previewBg: string
}

type ReactTextStyle = {
  fontFamily: string
  fontSize: string
  fontWeight: number | string
  color: string
  letterSpacing?: string
  textTransform?: 'none' | 'uppercase' | 'lowercase'
  textShadow?: string
  lineHeight?: number | string
}

export const EDITOR_TEXT_CATEGORY_LABEL: Record<EditorTextCategory, string> = {
  music: 'Clipe musical',
  classic: 'Clássico',
  'lower-third': 'Lower third',
  title: 'Títulos',
  outro: 'Encerramento',
  social: 'Social',
  kinetic: 'Cinético',
  caption: 'Legenda',
  promo: 'Promo',
  quote: 'Citação',
  numbers: 'Números',
  sticker: 'Sticker',
  film: 'Cinema',
  podcast: 'Podcast',
  gaming: 'Games',
  warning: 'Aviso',
  bits: 'Bits / SplitText',
  'ma-kinetic': 'Kinetic (MA)',
  'envato-titles': 'Títulos (Envato)',
  'mh-essential': 'Essential (MH)',
}

export const EDITOR_TEXT_CATEGORY_ORDER: EditorTextCategory[] = [
  'music',
  'ma-kinetic',
  'envato-titles',
  'mh-essential',
  'bits',
  'classic',
  'title',
  'lower-third',
  'kinetic',
  'social',
  'outro',
  'caption',
  'promo',
  'quote',
  'numbers',
  'sticker',
  'film',
  'podcast',
  'gaming',
  'warning',
]

const SHADOW = '0 2px 12px rgba(0,0,0,0.55)'
const SHADOW_SOFT = '0 1px 6px rgba(0,0,0,0.4)'

function t(
  partial: Omit<EditorTextTemplateDef, 'align' | 'vAlign' | 'xPercent' | 'yPercent' | 'previewBg'> &
    Partial<Pick<EditorTextTemplateDef, 'align' | 'vAlign' | 'xPercent' | 'yPercent' | 'previewBg'>>,
): EditorTextTemplateDef {
  return {
    align: 'center',
    vAlign: 'center',
    xPercent: 50,
    yPercent: 50,
    previewBg: 'linear-gradient(145deg,#1e293b,#0f172a)',
    ...partial,
  }
}

const BASE_TEXT_TEMPLATES: EditorTextTemplateDef[] = [
  // —— Clássico ——
  t({
    id: 'classic-bold',
    category: 'classic',
    label: 'Negrito',
    description: 'Título forte central',
    defaultTitle: 'TÍTULO',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Arial Black", "Segoe UI", sans-serif',
      fontSize: '7.5%',
      fontWeight: 900,
      color: '#ffffff',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      textShadow: SHADOW,
    },
    defaultInId: 'in-fade',
    defaultOutId: 'out-fade',
  }),
  t({
    id: 'classic-welcome',
    category: 'classic',
    label: 'Welcome',
    description: 'Boas-vindas limpas',
    defaultTitle: 'WELCOME',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '8%',
      fontWeight: 700,
      color: '#f8fafc',
      letterSpacing: '0.12em',
      textShadow: SHADOW,
    },
    defaultInId: 'in-zoom',
  }),
  t({
    id: 'classic-minimal',
    category: 'classic',
    label: 'Minimal',
    description: 'Tipografia fina',
    defaultTitle: 'minimal title',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", Helvetica, sans-serif',
      fontSize: '5.5%',
      fontWeight: 300,
      color: '#e2e8f0',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      textShadow: SHADOW_SOFT,
    },
    defaultInId: 'in-fade',
  }),
  t({
    id: 'classic-serif',
    category: 'classic',
    label: 'Serif elegante',
    description: 'Editorial',
    defaultTitle: 'Never Stop Growing',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: 'Georgia, serif',
      fontSize: '6%',
      fontWeight: 500,
      color: '#fff7ed',
      textShadow: SHADOW,
    },
    defaultInId: 'in-slide-up',
  }),
  t({
    id: 'classic-oops',
    category: 'classic',
    label: 'Impacto',
    description: 'Palavra de impacto',
    defaultTitle: 'OOOPS!',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '10%',
      fontWeight: 900,
      color: '#fef08a',
      textShadow: '0 0 24px rgba(250,204,21,0.45), 0 4px 16px rgba(0,0,0,0.6)',
    },
    defaultInId: 'in-pop',
  }),
  t({
    id: 'classic-line',
    category: 'classic',
    label: 'Com linha',
    description: 'Título + subtítulo',
    defaultTitle: 'CAPÍTULO 01',
    defaultSubtitle: 'O começo de tudo',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '4%',
      fontWeight: 700,
      color: '#94a3b8',
      letterSpacing: '0.25em',
      textTransform: 'uppercase',
    },
    subtitleStyle: {
      fontFamily: 'Georgia, serif',
      fontSize: '6.5%',
      fontWeight: 600,
      color: '#f8fafc',
      textShadow: SHADOW,
    },
    defaultInId: 'in-slide-up',
  }),

  // —— Títulos ——
  t({
    id: 'title-cinematic',
    category: 'title',
    label: 'Cinemático',
    description: 'Abertura de filme',
    defaultTitle: 'ATLAS STUDIO',
    defaultSubtitle: 'Apresenta',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '7%',
      fontWeight: 800,
      color: '#ffffff',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      textShadow: SHADOW,
    },
    subtitleStyle: {
      fontFamily: 'Georgia, serif',
      fontSize: '3%',
      fontWeight: 400,
      color: '#cbd5e1',
      letterSpacing: '0.35em',
      textTransform: 'uppercase',
    },
    yPercent: 48,
    defaultInId: 'in-zoom',
    defaultOutId: 'out-fade',
  }),
  t({
    id: 'title-split',
    category: 'title',
    label: 'Split',
    description: 'Duas linhas contrastantes',
    defaultTitle: 'NOVO',
    defaultSubtitle: 'EPISÓDIO',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '8%',
      fontWeight: 900,
      color: '#22d3ee',
      textShadow: SHADOW,
    },
    subtitleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '8%',
      fontWeight: 900,
      color: '#ffffff',
      textShadow: SHADOW,
    },
    defaultInId: 'in-slide-left',
  }),
  t({
    id: 'title-quote',
    category: 'title',
    label: 'Citação',
    description: 'Frase + autor',
    defaultTitle: '"A arte imita a vida."',
    defaultSubtitle: '— Atlas',
    titleStyle: {
      fontFamily: 'Georgia, serif',
      fontSize: '5%',
      fontWeight: 500,
      color: '#f1f5f9',
      textShadow: SHADOW,
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.8%',
      fontWeight: 600,
      color: '#94a3b8',
      letterSpacing: '0.08em',
    },
    defaultInId: 'in-fade',
  }),
  t({
    id: 'title-chapter',
    category: 'title',
    label: 'Capítulo',
    description: 'Número + nome',
    defaultTitle: '03',
    defaultSubtitle: 'A virada',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '12%',
      fontWeight: 200,
      color: '#38bdf8',
      textShadow: SHADOW_SOFT,
    },
    subtitleStyle: {
      fontFamily: 'Georgia, serif',
      fontSize: '5%',
      fontWeight: 600,
      color: '#f8fafc',
      textShadow: SHADOW,
    },
    defaultInId: 'in-slide-up',
  }),
  t({
    id: 'title-neon',
    category: 'title',
    label: 'Neon',
    description: 'Brilho noturno',
    defaultTitle: 'NIGHT CITY',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '7%',
      fontWeight: 800,
      color: '#f0abfc',
      letterSpacing: '0.15em',
      textShadow: '0 0 10px #e879f9, 0 0 28px #a855f7, 0 0 48px #7c3aed',
    },
    previewBg: 'linear-gradient(145deg,#1e1b4b,#0f172a)',
    defaultInId: 'in-pop',
  }),
  t({
    id: 'title-outline',
    category: 'title',
    label: 'Contorno',
    description: 'Só stroke',
    defaultTitle: 'OUTLINE',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '9%',
      fontWeight: 900,
      color: 'transparent',
      letterSpacing: '0.08em',
      textShadow: '0 0 1px #fff, 0 0 1px #fff, 0 0 1px #fff, 0 0 1px #fff',
    },
    defaultInId: 'in-zoom',
  }),

  // —— Lower third ——
  t({
    id: 'lt-news',
    category: 'lower-third',
    label: 'Notícia',
    description: 'Nome + cargo',
    defaultTitle: 'JOSHUA JACKSON',
    defaultSubtitle: 'Web Developer',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3.6%',
      fontWeight: 800,
      color: '#0f172a',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.4%',
      fontWeight: 600,
      color: '#334155',
    },
    plate: {
      background: 'linear-gradient(90deg,#f8fafc,#e2e8f0)',
      paddingX: '2.5%',
      paddingY: '1.4%',
      borderRadius: '4px',
      border: '3px solid #0ea5e9',
    },
    align: 'left',
    vAlign: 'bottom',
    xPercent: 8,
    yPercent: 82,
    previewBg: 'linear-gradient(145deg,#0c4a6e,#082f49)',
    defaultInId: 'in-slide-right',
    defaultOutId: 'out-slide-left',
  }),
  t({
    id: 'lt-soft',
    category: 'lower-third',
    label: 'Suave',
    description: 'Placa translúcida',
    defaultTitle: 'Maria Silva',
    defaultSubtitle: 'Convidada especial',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3.4%',
      fontWeight: 700,
      color: '#ffffff',
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.2%',
      fontWeight: 500,
      color: '#cbd5e1',
    },
    plate: {
      background: 'rgba(15,23,42,0.72)',
      paddingX: '2.2%',
      paddingY: '1.2%',
      borderRadius: '12px',
    },
    align: 'left',
    vAlign: 'bottom',
    xPercent: 8,
    yPercent: 84,
    defaultInId: 'in-fade',
  }),
  t({
    id: 'lt-accent',
    category: 'lower-third',
    label: 'Faixa accent',
    description: 'Barra colorida',
    defaultTitle: 'LIVE',
    defaultSubtitle: 'Atlas Studio',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3.2%',
      fontWeight: 800,
      color: '#ffffff',
      textTransform: 'uppercase',
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.2%',
      fontWeight: 500,
      color: '#e2e8f0',
    },
    plate: {
      background: 'linear-gradient(90deg,#059669,#0f172a)',
      paddingX: '2%',
      paddingY: '1.1%',
      borderRadius: '0 10px 10px 0',
    },
    align: 'left',
    vAlign: 'bottom',
    xPercent: 0,
    yPercent: 80,
    defaultInId: 'in-slide-right',
  }),
  t({
    id: 'lt-pill',
    category: 'lower-third',
    label: 'Pill',
    description: 'Cápsula',
    defaultTitle: '@atlasstudio',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.8%',
      fontWeight: 700,
      color: '#0f172a',
    },
    plate: {
      background: '#f8fafc',
      paddingX: '2%',
      paddingY: '0.9%',
      borderRadius: '999px',
    },
    align: 'left',
    vAlign: 'bottom',
    xPercent: 8,
    yPercent: 88,
    defaultInId: 'in-pop',
  }),
  t({
    id: 'lt-frame',
    category: 'lower-third',
    label: 'Frame',
    description: 'Cantoneiras',
    defaultTitle: 'CAM 01',
    defaultSubtitle: 'BACKSTAGE',
    titleStyle: {
      fontFamily: 'Consolas, monospace',
      fontSize: '2.6%',
      fontWeight: 700,
      color: '#4ade80',
      letterSpacing: '0.12em',
    },
    subtitleStyle: {
      fontFamily: 'Consolas, monospace',
      fontSize: '2%',
      fontWeight: 500,
      color: '#86efac',
    },
    plate: {
      background: 'rgba(0,0,0,0.45)',
      paddingX: '1.8%',
      paddingY: '1%',
      borderRadius: '2px',
      border: '1px solid rgba(74,222,128,0.5)',
    },
    align: 'left',
    vAlign: 'top',
    xPercent: 6,
    yPercent: 8,
    previewBg: 'linear-gradient(145deg,#052e16,#022c22)',
    defaultInId: 'in-fade',
  }),

  // —— Cinético ——
  t({
    id: 'kin-glitch',
    category: 'kinetic',
    label: 'Glitch',
    description: 'Estilo RGB',
    defaultTitle: 'GLITCH',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '9%',
      fontWeight: 900,
      color: '#ffffff',
      textShadow: '-3px 0 #ff0040, 3px 0 #00e5ff',
    },
    previewBg: 'linear-gradient(145deg,#111827,#000)',
    defaultInId: 'in-pop',
  }),
  t({
    id: 'kin-typewriter',
    category: 'kinetic',
    label: 'Typewriter',
    description: 'Estilo máquina',
    defaultTitle: 'digitando...',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: '4.5%',
      fontWeight: 600,
      color: '#e2e8f0',
      textShadow: SHADOW_SOFT,
    },
    defaultInId: 'in-fade',
  }),
  t({
    id: 'kin-bounce',
    category: 'kinetic',
    label: 'Bounce',
    description: 'Entrada saltitante',
    defaultTitle: 'BOOM',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '10%',
      fontWeight: 900,
      color: '#fb923c',
      textShadow: SHADOW,
    },
    defaultInId: 'in-pop',
    defaultOutId: 'out-pop',
  }),
  t({
    id: 'kin-wave',
    category: 'kinetic',
    label: 'Wave',
    description: 'Texto fluido',
    defaultTitle: 'flow state',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '6.5%',
      fontWeight: 700,
      color: '#67e8f9',
      letterSpacing: '0.08em',
      textShadow: '0 0 20px rgba(34,211,238,0.5)',
    },
    defaultInId: 'in-slide-up',
  }),
  t({
    id: 'kin-matrix',
    category: 'kinetic',
    label: 'Matrix',
    description: 'Decode digital',
    defaultTitle: 'WAKE UP',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: 'Consolas, monospace',
      fontSize: '6%',
      fontWeight: 700,
      color: '#4ade80',
      letterSpacing: '0.2em',
      textShadow: '0 0 16px rgba(74,222,128,0.7)',
    },
    previewBg: 'linear-gradient(145deg,#022c22,#000)',
    defaultInId: 'in-fade',
  }),
  t({
    id: 'kin-stamp',
    category: 'kinetic',
    label: 'Stamp',
    description: 'Carimbo',
    defaultTitle: 'APROVADO',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Impact", sans-serif',
      fontSize: '7%',
      fontWeight: 900,
      color: '#ef4444',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      textShadow: SHADOW,
    },
    plate: {
      background: 'transparent',
      paddingX: '2%',
      paddingY: '1%',
      borderRadius: '4px',
      border: '4px solid #ef4444',
    },
    defaultInId: 'in-pop',
  }),

  // —— Social ——
  t({
    id: 'social-follow',
    category: 'social',
    label: 'Follow',
    description: 'CTA seguir',
    defaultTitle: 'SIGA',
    defaultSubtitle: '@seuusuario',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '4%',
      fontWeight: 800,
      color: '#ffffff',
      textTransform: 'uppercase',
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '5%',
      fontWeight: 700,
      color: '#38bdf8',
    },
    yPercent: 70,
    defaultInId: 'in-slide-up',
  }),
  t({
    id: 'social-like',
    category: 'social',
    label: 'Like',
    description: 'Curtir e comentar',
    defaultTitle: 'CURTA · COMENTE',
    defaultSubtitle: 'Compartilhe com um amigo',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '4.5%',
      fontWeight: 800,
      color: '#fda4af',
      textShadow: SHADOW,
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.6%',
      fontWeight: 500,
      color: '#fecdd3',
    },
    yPercent: 75,
    defaultInId: 'in-pop',
  }),
  t({
    id: 'social-handle',
    category: 'social',
    label: 'Handle',
    description: 'Arroba no canto',
    defaultTitle: '@atlas',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.8%',
      fontWeight: 700,
      color: '#ffffff',
      textShadow: SHADOW_SOFT,
    },
    plate: {
      background: 'rgba(0,0,0,0.4)',
      paddingX: '1.5%',
      paddingY: '0.7%',
      borderRadius: '999px',
    },
    align: 'right',
    vAlign: 'top',
    xPercent: 92,
    yPercent: 8,
    defaultInId: 'in-fade',
  }),
  t({
    id: 'social-story',
    category: 'social',
    label: 'Story',
    description: 'Texto de story',
    defaultTitle: 'hoje eu aprendi...',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '5%',
      fontWeight: 700,
      color: '#ffffff',
      textShadow: SHADOW,
    },
    yPercent: 78,
    defaultInId: 'in-slide-up',
  }),

  // —— Encerramento ——
  t({
    id: 'outro-thanks',
    category: 'outro',
    label: 'Thanks',
    description: 'Thanks for watching',
    defaultTitle: 'THANKS FOR WATCHING',
    defaultSubtitle: 'Se inscreva no canal',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '5.5%',
      fontWeight: 900,
      color: '#ffffff',
      letterSpacing: '0.06em',
      textShadow: SHADOW,
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3%',
      fontWeight: 600,
      color: '#94a3b8',
    },
    defaultInId: 'in-zoom',
    defaultOutId: 'out-fade',
  }),
  t({
    id: 'outro-subscribe',
    category: 'outro',
    label: 'Subscribe',
    description: 'CTA inscrição',
    defaultTitle: 'INSCREVA-SE',
    defaultSubtitle: 'Ative o sininho',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '6%',
      fontWeight: 900,
      color: '#ffffff',
      textTransform: 'uppercase',
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3%',
      fontWeight: 600,
      color: '#fecaca',
    },
    plate: {
      background: '#dc2626',
      paddingX: '3%',
      paddingY: '1.6%',
      borderRadius: '14px',
    },
    defaultInId: 'in-pop',
  }),
  t({
    id: 'outro-end',
    category: 'outro',
    label: 'Fim',
    description: 'Cartão final',
    defaultTitle: 'FIM',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: 'Georgia, serif',
      fontSize: '10%',
      fontWeight: 700,
      color: '#f8fafc',
      letterSpacing: '0.3em',
      textShadow: SHADOW,
    },
    defaultInId: 'in-fade',
  }),
  t({
    id: 'outro-credits',
    category: 'outro',
    label: 'Créditos',
    description: 'Produzido por',
    defaultTitle: 'Produzido por',
    defaultSubtitle: 'Atlas Studio',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.8%',
      fontWeight: 500,
      color: '#94a3b8',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
    },
    subtitleStyle: {
      fontFamily: 'Georgia, serif',
      fontSize: '5.5%',
      fontWeight: 600,
      color: '#f1f5f9',
      textShadow: SHADOW,
    },
    defaultInId: 'in-slide-up',
  }),

  // —— Legenda ——
  t({
    id: 'cap-box',
    category: 'caption',
    label: 'Caixa',
    description: 'Legenda em caixa',
    defaultTitle: 'Texto da legenda aparece aqui.',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3.2%',
      fontWeight: 700,
      color: '#ffffff',
      textShadow: SHADOW_SOFT,
    },
    plate: {
      background: 'rgba(0,0,0,0.65)',
      paddingX: '2%',
      paddingY: '1%',
      borderRadius: '8px',
    },
    vAlign: 'bottom',
    yPercent: 88,
    defaultInId: 'in-fade',
  }),
  t({
    id: 'cap-karaoke',
    category: 'caption',
    label: 'Karaoke',
    description: 'Destaque amarelo',
    defaultTitle: 'palavra em destaque',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '4%',
      fontWeight: 800,
      color: '#fde047',
      textShadow: '0 2px 0 #000, 0 4px 12px rgba(0,0,0,0.6)',
      textTransform: 'uppercase',
    },
    vAlign: 'bottom',
    yPercent: 86,
    defaultInId: 'in-pop',
  }),
  t({
    id: 'cap-soft',
    category: 'caption',
    label: 'Suave',
    description: 'Legenda discreta',
    defaultTitle: 'falando baixinho…',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3%',
      fontWeight: 600,
      color: '#e2e8f0',
      textShadow: SHADOW_SOFT,
    },
    vAlign: 'bottom',
    yPercent: 90,
    defaultInId: 'in-fade',
  }),
  t({
    id: 'cap-beast',
    category: 'caption',
    label: 'Beast',
    description: 'Bold highlight',
    defaultTitle: 'ISSO MUDA TUDO',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '4.2%',
      fontWeight: 900,
      color: '#000000',
      textTransform: 'uppercase',
    },
    plate: {
      background: '#facc15',
      paddingX: '1.5%',
      paddingY: '0.7%',
      borderRadius: '4px',
    },
    vAlign: 'bottom',
    yPercent: 85,
    defaultInId: 'in-pop',
  }),

  // —— Promo ——
  t({
    id: 'promo-sale',
    category: 'promo',
    label: 'Oferta',
    description: 'Desconto',
    defaultTitle: '-50%',
    defaultSubtitle: 'HOJE SÓ',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '12%',
      fontWeight: 900,
      color: '#fbbf24',
      textShadow: SHADOW,
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '4%',
      fontWeight: 800,
      color: '#ffffff',
      letterSpacing: '0.2em',
    },
    previewBg: 'linear-gradient(145deg,#7c2d12,#1c1917)',
    defaultInId: 'in-pop',
  }),
  t({
    id: 'promo-new',
    category: 'promo',
    label: 'Novo',
    description: 'Lançamento',
    defaultTitle: 'NOVIDADE',
    defaultSubtitle: 'Disponível agora',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '6%',
      fontWeight: 900,
      color: '#a7f3d0',
      letterSpacing: '0.12em',
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3%',
      fontWeight: 600,
      color: '#d1fae5',
    },
    defaultInId: 'in-slide-up',
  }),
  t({
    id: 'promo-flash',
    category: 'promo',
    label: 'Flash',
    description: 'Urgência',
    defaultTitle: 'ÚLTIMAS VAGAS',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '5.5%',
      fontWeight: 900,
      color: '#ffffff',
      textTransform: 'uppercase',
    },
    plate: {
      background: 'linear-gradient(90deg,#dc2626,#ea580c)',
      paddingX: '2.5%',
      paddingY: '1.2%',
      borderRadius: '8px',
    },
    defaultInId: 'in-pop',
  }),
  t({
    id: 'promo-price',
    category: 'promo',
    label: 'Preço',
    description: 'Valor em destaque',
    defaultTitle: 'R$ 29',
    defaultSubtitle: '/mês',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '9%',
      fontWeight: 900,
      color: '#4ade80',
      textShadow: SHADOW,
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3.5%',
      fontWeight: 600,
      color: '#86efac',
    },
    defaultInId: 'in-zoom',
  }),

  // —— Extras clássico ——
  t({
    id: 'classic-impact',
    category: 'classic',
    label: 'Impacto',
    description: 'Título curto e pesado',
    defaultTitle: 'IMPACTO',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '10%',
      fontWeight: 900,
      color: '#fff',
      letterSpacing: '0.08em',
      textShadow: SHADOW,
    },
    defaultInId: 'in-pop',
  }),
  t({
    id: 'classic-thin',
    category: 'classic',
    label: 'Fino',
    description: 'Tipografia leve',
    defaultTitle: 'Detalhe',
    defaultSubtitle: 'em destaque',
    titleStyle: {
      fontFamily: '"Segoe UI Light", "Segoe UI", sans-serif',
      fontSize: '6%',
      fontWeight: 300,
      color: '#f8fafc',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.8%',
      fontWeight: 400,
      color: '#94a3b8',
    },
    defaultInId: 'in-fade',
  }),
  t({
    id: 'classic-duo',
    category: 'classic',
    label: 'Dupla',
    description: 'Duas linhas contrastantes',
    defaultTitle: 'ANTES',
    defaultSubtitle: 'DEPOIS',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '5.5%',
      fontWeight: 800,
      color: '#f87171',
      textShadow: SHADOW_SOFT,
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '5.5%',
      fontWeight: 800,
      color: '#4ade80',
      textShadow: SHADOW_SOFT,
    },
    defaultInId: 'in-slide-up',
  }),

  // —— Extras títulos ——
  t({
    id: 'title-episode',
    category: 'title',
    label: 'Episódio',
    description: 'Número + nome do episódio',
    defaultTitle: 'EP. 01',
    defaultSubtitle: 'O começo',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3.2%',
      fontWeight: 700,
      color: '#fbbf24',
      letterSpacing: '0.25em',
    },
    subtitleStyle: {
      fontFamily: 'Georgia, serif',
      fontSize: '7%',
      fontWeight: 700,
      color: '#fff',
      textShadow: SHADOW,
    },
    yPercent: 42,
    defaultInId: 'in-fade',
  }),
  t({
    id: 'title-subtitle-bar',
    category: 'title',
    label: 'Barra',
    description: 'Título com faixa inferior',
    defaultTitle: 'ATLAS',
    defaultSubtitle: 'Studio',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '8%',
      fontWeight: 900,
      color: '#fff',
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3%',
      fontWeight: 600,
      color: '#0f172a',
    },
    plate: {
      background: 'linear-gradient(90deg,#38bdf8,#818cf8)',
      paddingX: '4%',
      paddingY: '2%',
      borderRadius: '4px',
    },
    defaultInId: 'in-slide-left',
  }),
  t({
    id: 'title-vertical',
    category: 'title',
    label: 'Vertical',
    description: 'Texto estreito para Shorts',
    defaultTitle: 'VIRAL',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '11%',
      fontWeight: 900,
      color: '#fff',
      letterSpacing: '0.35em',
      textShadow: '0 0 24px rgba(244,63,94,0.8)',
    },
    yPercent: 35,
    defaultInId: 'in-zoom',
  }),

  // —— Extras lower third ——
  t({
    id: 'lt-minimal-line',
    category: 'lower-third',
    label: 'Linha fina',
    description: 'Nome + cargo com traço',
    defaultTitle: 'Ana Costa',
    defaultSubtitle: 'Diretora criativa',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3.8%',
      fontWeight: 700,
      color: '#fff',
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.4%',
      fontWeight: 400,
      color: '#cbd5e1',
    },
    plate: {
      background: 'transparent',
      paddingX: '0%',
      paddingY: '0%',
      borderRadius: '0',
      border: '2px solid transparent',
    },
    align: 'left',
    xPercent: 8,
    yPercent: 82,
    defaultInId: 'in-slide-left',
  }),
  t({
    id: 'lt-gradient',
    category: 'lower-third',
    label: 'Gradiente',
    description: 'Placa com degradê',
    defaultTitle: 'Convidado',
    defaultSubtitle: 'Especial desta semana',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3.6%',
      fontWeight: 800,
      color: '#fff',
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.3%',
      fontWeight: 500,
      color: '#e2e8f0',
    },
    plate: {
      background: 'linear-gradient(90deg,rgba(79,70,229,0.95),rgba(14,165,233,0.85))',
      paddingX: '3%',
      paddingY: '1.6%',
      borderRadius: '10px',
    },
    align: 'left',
    xPercent: 10,
    yPercent: 80,
    defaultInId: 'in-fade',
  }),
  t({
    id: 'lt-corner',
    category: 'lower-third',
    label: 'Canto',
    description: 'Marcação no canto inferior',
    defaultTitle: 'AO VIVO',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.8%',
      fontWeight: 800,
      color: '#fff',
      letterSpacing: '0.12em',
    },
    plate: {
      background: '#ef4444',
      paddingX: '2.2%',
      paddingY: '1.1%',
      borderRadius: '4px',
    },
    align: 'left',
    xPercent: 6,
    yPercent: 90,
    defaultInId: 'in-pop',
  }),

  // —— Extras cinético ——
  t({
    id: 'kin-shake',
    category: 'kinetic',
    label: 'Shake',
    description: 'Entrada com tremer',
    defaultTitle: 'URGENTE',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '8%',
      fontWeight: 900,
      color: '#fef08a',
      textShadow: '0 0 18px rgba(250,204,21,0.7)',
    },
    defaultInId: 'in-pop',
  }),
  t({
    id: 'kin-rotate',
    category: 'kinetic',
    label: 'Giro',
    description: 'Rotação na entrada',
    defaultTitle: 'PLOT TWIST',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '6.5%',
      fontWeight: 900,
      color: '#f472b6',
      textShadow: SHADOW,
    },
    defaultInId: 'in-spin',
  }),
  t({
    id: 'kin-counter',
    category: 'kinetic',
    label: 'Contagem',
    description: 'Números grandes',
    defaultTitle: '3',
    defaultSubtitle: 'SEGUNDOS',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '18%',
      fontWeight: 900,
      color: '#fff',
      textShadow: SHADOW,
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3%',
      fontWeight: 700,
      color: '#94a3b8',
      letterSpacing: '0.3em',
    },
    defaultInId: 'in-zoom',
  }),

  // —— Extras social ——
  t({
    id: 'social-duet',
    category: 'social',
    label: 'Duet',
    description: 'Chamada para dueto',
    defaultTitle: 'FAÇA O DUETO',
    defaultSubtitle: 'comigo',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '5%',
      fontWeight: 900,
      color: '#fff',
      textShadow: SHADOW,
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3.2%',
      fontWeight: 600,
      color: '#f472b6',
    },
    yPercent: 28,
    defaultInId: 'in-pop',
  }),
  t({
    id: 'social-comment',
    category: 'social',
    label: 'Comente',
    description: 'CTA de comentário',
    defaultTitle: 'Comenta 👇',
    defaultSubtitle: 'sua opinião',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '4.5%',
      fontWeight: 800,
      color: '#fff',
      textShadow: SHADOW_SOFT,
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.8%',
      fontWeight: 500,
      color: '#cbd5e1',
    },
    yPercent: 78,
    defaultInId: 'in-slide-up',
  }),
  t({
    id: 'social-link',
    category: 'social',
    label: 'Link bio',
    description: 'Aponta para a bio',
    defaultTitle: 'Link na bio',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '4%',
      fontWeight: 800,
      color: '#0f172a',
    },
    plate: {
      background: '#fde68a',
      paddingX: '3%',
      paddingY: '1.4%',
      borderRadius: '999px',
    },
    yPercent: 88,
    defaultInId: 'in-pop',
  }),

  // —— Extras outro ——
  t({
    id: 'outro-next',
    category: 'outro',
    label: 'Próximo',
    description: 'Teaser do próximo vídeo',
    defaultTitle: 'PRÓXIMO',
    defaultSubtitle: 'Não perca',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '5.5%',
      fontWeight: 900,
      color: '#38bdf8',
      letterSpacing: '0.15em',
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3.5%',
      fontWeight: 600,
      color: '#fff',
    },
    defaultInId: 'in-slide-right',
  }),
  t({
    id: 'outro-logo',
    category: 'outro',
    label: 'Marca',
    description: 'Nome da marca no fim',
    defaultTitle: 'ATLAS',
    defaultSubtitle: 'STUDIO',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '9%',
      fontWeight: 900,
      color: '#fff',
      letterSpacing: '0.2em',
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '2.8%',
      fontWeight: 600,
      color: '#94a3b8',
      letterSpacing: '0.4em',
    },
    defaultInId: 'in-fade',
  }),

  // —— Extras legenda ——
  t({
    id: 'cap-yellow',
    category: 'caption',
    label: 'Amarelo',
    description: 'Legenda estilo meme',
    defaultTitle: 'quando você vê isso',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Impact", "Arial Black", sans-serif',
      fontSize: '4.2%',
      fontWeight: 900,
      color: '#fef08a',
      textTransform: 'uppercase',
      textShadow: '2px 2px 0 #000',
    },
    yPercent: 78,
    defaultInId: null,
  }),
  t({
    id: 'cap-center-box',
    category: 'caption',
    label: 'Caixa central',
    description: 'Legenda em placa escura',
    defaultTitle: 'ponto importante',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3.6%',
      fontWeight: 700,
      color: '#fff',
    },
    plate: {
      background: 'rgba(15,23,42,0.82)',
      paddingX: '3%',
      paddingY: '1.5%',
      borderRadius: '8px',
    },
    yPercent: 55,
    defaultInId: 'in-fade',
  }),
  t({
    id: 'cap-word',
    category: 'caption',
    label: 'Palavra',
    description: 'Uma palavra em destaque',
    defaultTitle: 'EXATO',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '7%',
      fontWeight: 900,
      color: '#22d3ee',
      textShadow: SHADOW,
    },
    yPercent: 70,
    defaultInId: 'in-pop',
  }),

  // —— Extras promo ——
  t({
    id: 'promo-limited',
    category: 'promo',
    label: 'Limitado',
    description: 'Urgência de oferta',
    defaultTitle: 'ÚLTIMAS HORAS',
    defaultSubtitle: 'Oferta termina hoje',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '5%',
      fontWeight: 900,
      color: '#fecaca',
      textShadow: SHADOW,
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3%',
      fontWeight: 600,
      color: '#fff',
    },
    defaultInId: 'in-zoom',
  }),
  t({
    id: 'promo-free',
    category: 'promo',
    label: 'Grátis',
    description: 'Chamada de frete/brinde',
    defaultTitle: 'GRÁTIS',
    defaultSubtitle: 'hoje',
    titleStyle: {
      fontFamily: '"Arial Black", sans-serif',
      fontSize: '9%',
      fontWeight: 900,
      color: '#4ade80',
      textShadow: SHADOW,
    },
    subtitleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3.5%',
      fontWeight: 700,
      color: '#bbf7d0',
    },
    defaultInId: 'in-pop',
  }),
  t({
    id: 'promo-cta',
    category: 'promo',
    label: 'CTA',
    description: 'Botão de ação',
    defaultTitle: 'COMPRAR AGORA',
    defaultSubtitle: '',
    titleStyle: {
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: '3.8%',
      fontWeight: 800,
      color: '#fff',
      letterSpacing: '0.06em',
    },
    plate: {
      background: '#ef4444',
      paddingX: '4%',
      paddingY: '1.8%',
      borderRadius: '999px',
    },
    yPercent: 72,
    defaultInId: 'in-pop',
  }),
]

type Colorway = {
  key: string
  label: string
  color: string
  sub: string
  plate?: string
  previewBg: string
}

const COLORWAYS: Colorway[] = [
  { key: 'white', label: 'Branco', color: '#ffffff', sub: '#cbd5e1', previewBg: 'linear-gradient(145deg,#1e293b,#0f172a)' },
  { key: 'yellow', label: 'Amarelo', color: '#fef08a', sub: '#fde68a', previewBg: 'linear-gradient(145deg,#422006,#1c1917)' },
  { key: 'cyan', label: 'Ciano', color: '#67e8f9', sub: '#a5f3fc', previewBg: 'linear-gradient(145deg,#083344,#0f172a)' },
  { key: 'pink', label: 'Rosa', color: '#f9a8d4', sub: '#fbcfe8', previewBg: 'linear-gradient(145deg,#500724,#1e1b4b)' },
  { key: 'lime', label: 'Limão', color: '#bef264', sub: '#d9f99d', previewBg: 'linear-gradient(145deg,#14532d,#052e16)' },
  { key: 'orange', label: 'Laranja', color: '#fdba74', sub: '#fed7aa', previewBg: 'linear-gradient(145deg,#7c2d12,#1c1917)' },
  { key: 'violet', label: 'Violeta', color: '#c4b5fd', sub: '#ddd6fe', previewBg: 'linear-gradient(145deg,#4c1d95,#1e1b4b)' },
  { key: 'red', label: 'Vermelho', color: '#fca5a5', sub: '#fecaca', previewBg: 'linear-gradient(145deg,#7f1d1d,#1c1917)' },
  { key: 'gold', label: 'Ouro', color: '#fbbf24', sub: '#fde68a', previewBg: 'linear-gradient(145deg,#78350f,#1c1917)' },
  { key: 'mint', label: 'Menta', color: '#6ee7b7', sub: '#a7f3d0', previewBg: 'linear-gradient(145deg,#064e3b,#0f172a)' },
  { key: 'sky', label: 'Céu', color: '#7dd3fc', sub: '#bae6fd', previewBg: 'linear-gradient(145deg,#0c4a6e,#0f172a)' },
  { key: 'cream', label: 'Creme', color: '#fef3c7', sub: '#fde68a', previewBg: 'linear-gradient(145deg,#44403c,#1c1917)' },
]

const IN_CYCLE = ['in-fade', 'in-slide-up', 'in-slide-left', 'in-zoom', 'in-pop', 'in-slide-right', 'in-spin', 'in-slide-down'] as const

function buildExpandedTextPack(): EditorTextTemplateDef[] {
  const pack: EditorTextTemplateDef[] = []

  // Clássicos coloridos + posições
  for (const [i, cw] of COLORWAYS.entries()) {
    pack.push(
      t({
        id: `classic-bold-${cw.key}`,
        category: 'classic',
        label: `Negrito ${cw.label}`,
        description: `Título forte em ${cw.label.toLowerCase()}`,
        defaultTitle: 'TÍTULO',
        defaultSubtitle: '',
        titleStyle: {
          fontFamily: '"Arial Black", "Segoe UI", sans-serif',
          fontSize: '8%',
          fontWeight: 900,
          color: cw.color,
          textShadow: SHADOW,
        },
        previewBg: cw.previewBg,
        defaultInId: IN_CYCLE[i % IN_CYCLE.length],
      }),
      t({
        id: `classic-top-${cw.key}`,
        category: 'classic',
        label: `Topo ${cw.label}`,
        description: 'Texto no terço superior',
        defaultTitle: 'ATENÇÃO',
        defaultSubtitle: '',
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '5.5%',
          fontWeight: 800,
          color: cw.color,
          textShadow: SHADOW_SOFT,
        },
        yPercent: 18,
        previewBg: cw.previewBg,
        defaultInId: 'in-slide-down',
      }),
      t({
        id: `classic-bottom-${cw.key}`,
        category: 'classic',
        label: `Base ${cw.label}`,
        description: 'Texto no terço inferior',
        defaultTitle: 'CONTINUE',
        defaultSubtitle: 'assistindo',
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '4.8%',
          fontWeight: 800,
          color: cw.color,
          textShadow: SHADOW,
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.8%',
          fontWeight: 500,
          color: cw.sub,
        },
        yPercent: 84,
        previewBg: cw.previewBg,
        defaultInId: 'in-slide-up',
      }),
    )
  }

  // Títulos cinematográficos / capítulos
  const titleHooks = [
    ['title-hook-1', 'Hook', 'ISSO MUDA TUDO', 'em 30 segundos'],
    ['title-hook-2', 'Segredo', 'O SEGREDO', 'que ninguém conta'],
    ['title-hook-3', 'Erro', 'PARE DE ERRAR', 'isso agora'],
    ['title-hook-4', 'Lista', '5 COISAS', 'que você precisa saber'],
    ['title-hook-5', 'Versus', 'A vs B', 'quem vence?'],
    ['title-hook-6', 'Tutorial', 'COMO FAZER', 'passo a passo'],
    ['title-hook-7', 'Reação', 'MINHA REAÇÃO', 'quando vi isso'],
    ['title-hook-8', 'História', 'A HISTÓRIA', 'por trás disso'],
    ['title-hook-9', 'Myth', 'MITO OU VERDADE', 'vamos testar'],
    ['title-hook-10', 'Update', 'NOVIDADE', 'acabou de sair'],
    ['title-hook-11', 'Review', 'REVIEW HONESTO', 'sem enrolação'],
    ['title-hook-12', 'Challenge', 'DESAFIO', 'você consegue?'],
  ] as const
  for (const [i, [id, label, title, sub]] of titleHooks.entries()) {
    const cw = COLORWAYS[i % COLORWAYS.length]
    pack.push(
      t({
        id,
        category: 'title',
        label,
        description: `Gancho: ${label.toLowerCase()}`,
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Arial Black", sans-serif',
          fontSize: '6.5%',
          fontWeight: 900,
          color: cw.color,
          textShadow: SHADOW,
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '3%',
          fontWeight: 600,
          color: cw.sub,
        },
        yPercent: 40 + (i % 3) * 8,
        previewBg: cw.previewBg,
        defaultInId: IN_CYCLE[i % IN_CYCLE.length],
      }),
    )
  }

  // Lower thirds nome/cargo
  const people = [
    ['lt-p1', 'Maria Silva', 'CEO'],
    ['lt-p2', 'João Santos', 'Editor'],
    ['lt-p3', 'Lia Ramos', 'Apresentadora'],
    ['lt-p4', 'Pedro Alves', 'Especialista'],
    ['lt-p5', 'Carla Mendes', 'Convidada'],
    ['lt-p6', 'Rafa Souza', 'Analista'],
    ['lt-p7', 'Bia Costa', 'Produtora'],
    ['lt-p8', 'Leo Dias', 'Comentarista'],
    ['lt-p9', 'Nina Prado', 'Reporter'],
    ['lt-p10', 'Hugo Lima', 'Diretor'],
  ] as const
  for (const [i, [id, name, role]] of people.entries()) {
    const cw = COLORWAYS[i % COLORWAYS.length]
    pack.push(
      t({
        id,
        category: 'lower-third',
        label: name.split(' ')[0],
        description: `${name} · ${role}`,
        defaultTitle: name,
        defaultSubtitle: role,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '3.5%',
          fontWeight: 800,
          color: '#fff',
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.3%',
          fontWeight: 500,
          color: cw.sub,
        },
        plate: {
          background: i % 2 === 0 ? 'rgba(15,23,42,0.88)' : `linear-gradient(90deg,${cw.color}cc,rgba(15,23,42,0.85))`,
          paddingX: '3%',
          paddingY: '1.4%',
          borderRadius: i % 3 === 0 ? '999px' : '8px',
        },
        align: i % 2 === 0 ? 'left' : 'right',
        xPercent: i % 2 === 0 ? 10 : 90,
        yPercent: 78 + (i % 2) * 4,
        previewBg: cw.previewBg,
        defaultInId: i % 2 === 0 ? 'in-slide-left' : 'in-slide-right',
      }),
    )
  }

  // Cinético word bursts
  const kineticWords = [
    'WOW', 'STOP', 'GO', 'YES', 'NOPE', 'BOOM', 'WAIT', 'LOOK', 'FAKE', 'REAL',
    'OMG', 'LOL', 'CAP', 'FIRE', 'VIP', 'NEW', 'HOT', 'TOP', 'WIN', 'LOSE',
  ]
  for (const [i, word] of kineticWords.entries()) {
    const cw = COLORWAYS[i % COLORWAYS.length]
    pack.push(
      t({
        id: `kin-word-${i + 1}`,
        category: 'kinetic',
        label: word,
        description: `Palavra cinética ${word}`,
        defaultTitle: word,
        defaultSubtitle: '',
        titleStyle: {
          fontFamily: '"Arial Black", sans-serif',
          fontSize: `${7 + (i % 4)}%`,
          fontWeight: 900,
          color: cw.color,
          letterSpacing: '0.08em',
          textShadow: SHADOW,
        },
        previewBg: cw.previewBg,
        defaultInId: IN_CYCLE[i % IN_CYCLE.length],
      }),
    )
  }

  // Social CTAs
  const socials = [
    ['social-x1', 'Segue aí', 'não perde nada'],
    ['social-x2', 'Salva esse', 'pra depois'],
    ['social-x3', 'Compartilha', 'com a galera'],
    ['social-x4', 'Marca alguém', 'que precisa ver'],
    ['social-x5', 'Parte 2', 'nos comentários'],
    ['social-x6', 'Live hoje', '21h'],
    ['social-x7', 'Link fixado', 'confere'],
    ['social-x8', 'Série nova', 'toda semana'],
    ['social-x9', 'Responde', 'com um emoji'],
    ['social-x10', 'Virada', 'do feed'],
    ['social-x11', 'POV', 'quando isso acontece'],
    ['social-x12', 'Trend', 'do momento'],
  ] as const
  for (const [i, [id, title, sub]] of socials.entries()) {
    const cw = COLORWAYS[i % COLORWAYS.length]
    pack.push(
      t({
        id,
        category: 'social',
        label: title,
        description: sub,
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '4.5%',
          fontWeight: 900,
          color: cw.color,
          textShadow: SHADOW_SOFT,
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.6%',
          fontWeight: 500,
          color: cw.sub,
        },
        yPercent: 22 + (i % 4) * 18,
        previewBg: cw.previewBg,
        defaultInId: IN_CYCLE[i % IN_CYCLE.length],
      }),
    )
  }

  // Outros / encerramento
  const outros = [
    ['outro-x1', 'Fim', 'até a próxima'],
    ['outro-x2', 'Obrigado', 'por assistir'],
    ['outro-x3', 'Curtir + seguir', 'ajuda demais'],
    ['outro-x4', 'Comenta', 'o que achou'],
    ['outro-x5', 'Playlist', 'completa no canal'],
    ['outro-x6', 'Episódio', 'completo'],
    ['outro-x7', 'Créditos', 'equipe Atlas'],
    ['outro-x8', 'Te vejo', 'no próximo'],
  ] as const
  for (const [i, [id, title, sub]] of outros.entries()) {
    const cw = COLORWAYS[i % COLORWAYS.length]
    pack.push(
      t({
        id,
        category: 'outro',
        label: title,
        description: sub,
        defaultTitle: title.toUpperCase(),
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '6%',
          fontWeight: 900,
          color: cw.color,
          letterSpacing: '0.12em',
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '3%',
          fontWeight: 500,
          color: cw.sub,
        },
        previewBg: cw.previewBg,
        defaultInId: 'in-fade',
        defaultOutId: 'out-fade',
      }),
    )
  }

  // Legendas / captions
  const captions = [
    'quando isso acontece',
    'ninguém: eu:',
    'espera aí...',
    'e foi assim que',
    'plot twist:',
    'spoiler free',
    'sem contexto',
    'com contexto',
    'traduzindo:',
    'resumo:',
    'dica rápida',
    'erro clássico',
    'feito certo',
    'não faça isso',
    'faça isso',
    'resultado final',
  ]
  for (const [i, line] of captions.entries()) {
    const cw = COLORWAYS[i % COLORWAYS.length]
    pack.push(
      t({
        id: `cap-line-${i + 1}`,
        category: 'caption',
        label: `Legenda ${i + 1}`,
        description: line,
        defaultTitle: line,
        defaultSubtitle: '',
        titleStyle: {
          fontFamily: i % 2 === 0 ? '"Impact", "Arial Black", sans-serif' : '"Segoe UI", sans-serif',
          fontSize: '3.8%',
          fontWeight: 800,
          color: cw.color,
          textTransform: i % 3 === 0 ? 'uppercase' : 'none',
          textShadow: i % 2 === 0 ? '2px 2px 0 #000' : SHADOW_SOFT,
        },
        plate:
          i % 4 === 0
            ? {
                background: 'rgba(0,0,0,0.72)',
                paddingX: '2.5%',
                paddingY: '1.2%',
                borderRadius: '6px',
              }
            : undefined,
        yPercent: 72 + (i % 3) * 5,
        previewBg: cw.previewBg,
        defaultInId: i % 2 === 0 ? null : 'in-fade',
      }),
    )
  }

  // Promo
  const promos = [
    ['promo-x1', '50% OFF', 'só hoje'],
    ['promo-x2', 'FRETE GRÁTIS', 'acima de R$99'],
    ['promo-x3', 'NOVIDADE', 'lançamento'],
    ['promo-x4', 'CUPOM', 'ATLAS10'],
    ['promo-x5', 'BLACK', 'descontos'],
    ['promo-x6', 'OFERTA', 'relâmpago'],
    ['promo-x7', 'KIT', 'completo'],
    ['promo-x8', 'ASSINE', 'agora'],
    ['promo-x9', 'TESTE', '7 dias grátis'],
    ['promo-x10', 'COMBO', 'imperdível'],
  ] as const
  for (const [i, [id, title, sub]] of promos.entries()) {
    const cw = COLORWAYS[i % COLORWAYS.length]
    pack.push(
      t({
        id,
        category: 'promo',
        label: title,
        description: sub,
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Arial Black", sans-serif',
          fontSize: '7%',
          fontWeight: 900,
          color: cw.color,
          textShadow: SHADOW,
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '3%',
          fontWeight: 700,
          color: cw.sub,
        },
        plate:
          i % 2 === 0
            ? {
                background: 'rgba(15,23,42,0.75)',
                paddingX: '3%',
                paddingY: '1.5%',
                borderRadius: '12px',
                border: `2px solid ${cw.color}`,
              }
            : undefined,
        previewBg: cw.previewBg,
        defaultInId: IN_CYCLE[i % IN_CYCLE.length],
      }),
    )
  }

  // Citações
  const quotes = [
    ['“O segredo do sucesso', 'é começar.”'],
    ['“Feito é melhor', 'que perfeito.”'],
    ['“Disciplina', 'vence talento.”'],
    ['“Menos desculpas', 'mais ação.”'],
    ['“Foque no processo', 'não no resultado.”'],
    ['“Consistência', 'é o jogo.”'],
    ['“Aprenda em público', 'e evolua.”'],
    ['“Corte o ruído', 'proteja o foco.”'],
    ['“Quem planta', 'colhe.”'],
    ['“Sua vibe', 'atrai sua tribo.”'],
    ['“Hoje é o dia', 'de começar.”'],
    ['“Pequenos passos', 'grandes saltos.”'],
  ] as const
  for (const [i, [title, sub]] of quotes.entries()) {
    const cw = COLORWAYS[i % COLORWAYS.length]
    pack.push(
      t({
        id: `quote-${i + 1}`,
        category: 'quote',
        label: `Citação ${i + 1}`,
        description: `${title} ${sub}`,
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: '4.8%',
          fontWeight: 700,
          color: cw.color,
          textShadow: SHADOW_SOFT,
        },
        subtitleStyle: {
          fontFamily: 'Georgia, serif',
          fontSize: '3.4%',
          fontWeight: 600,
          color: cw.sub,
        },
        previewBg: cw.previewBg,
        defaultInId: 'in-fade',
      }),
    )
  }

  // Números / stats
  for (let i = 1; i <= 20; i += 1) {
    const cw = COLORWAYS[(i - 1) % COLORWAYS.length]
    const value = i <= 10 ? String(i) : `${i * 5}%`
    pack.push(
      t({
        id: `num-${i}`,
        category: 'numbers',
        label: `Número ${value}`,
        description: 'Destaque numérico',
        defaultTitle: value,
        defaultSubtitle: i <= 10 ? `passo ${i}` : 'crescimento',
        titleStyle: {
          fontFamily: '"Arial Black", sans-serif',
          fontSize: i <= 10 ? '16%' : '10%',
          fontWeight: 900,
          color: cw.color,
          textShadow: SHADOW,
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '3%',
          fontWeight: 600,
          color: cw.sub,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        },
        previewBg: cw.previewBg,
        defaultInId: 'in-zoom',
      }),
    )
  }

  // Stickers
  const stickers = [
    ['NOVO', '#22d3ee'],
    ['HOT', '#f97316'],
    ['VIP', '#a855f7'],
    ['FREE', '#22c55e'],
    ['SALE', '#ef4444'],
    ['LIVE', '#ef4444'],
    ['PRO', '#3b82f6'],
    ['BETA', '#eab308'],
    ['ALERTA', '#f59e0b'],
    ['TOP 1', '#fbbf24'],
    ['EXCLUSIVO', '#ec4899'],
    ['TRENDING', '#06b6d4'],
    ['BREAKING', '#dc2626'],
    ['UPDATE', '#84cc16'],
    ['SOON', '#6366f1'],
    ['DROP', '#14b8a6'],
  ] as const
  for (const [i, [label, color]] of stickers.entries()) {
    pack.push(
      t({
        id: `sticker-${i + 1}`,
        category: 'sticker',
        label,
        description: `Sticker ${label}`,
        defaultTitle: label,
        defaultSubtitle: '',
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '3.2%',
          fontWeight: 900,
          color: '#0f172a',
          letterSpacing: '0.08em',
        },
        plate: {
          background: color,
          paddingX: '2.8%',
          paddingY: '1.2%',
          borderRadius: i % 2 === 0 ? '999px' : '8px',
        },
        xPercent: 18 + (i % 5) * 16,
        yPercent: 14 + (i % 4) * 18,
        previewBg: 'linear-gradient(145deg,#111827,#0f172a)',
        defaultInId: 'in-pop',
      }),
    )
  }

  // Cinema / film
  const films = [
    ['film-1', 'INT. NOITE', 'CIDADE — 02:14'],
    ['film-2', 'EXT. DIA', 'PRAIA — VERÃO'],
    ['film-3', 'FLASHBACK', '5 ANOS ANTES'],
    ['film-4', 'CUT TO:', 'CENÁRIO SEGUINTE'],
    ['film-5', 'FADE IN', ''],
    ['film-6', 'FADE OUT', ''],
    ['film-7', 'MONTAGE', ''],
    ['film-8', 'CHAPTER I', 'O ENCONTRO'],
    ['film-9', 'CHAPTER II', 'A VIRADA'],
    ['film-10', 'CHAPTER III', 'O FINAL'],
    ['film-11', 'BASED ON', 'UMA HISTÓRIA REAL'],
    ['film-12', 'ONE YEAR LATER', ''],
  ] as const
  for (const [i, [id, title, sub]] of films.entries()) {
    pack.push(
      t({
        id,
        category: 'film',
        label: title,
        description: sub || title,
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Courier New", monospace',
          fontSize: '3.6%',
          fontWeight: 700,
          color: '#f8fafc',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        },
        subtitleStyle: sub
          ? {
              fontFamily: '"Courier New", monospace',
              fontSize: '2.6%',
              fontWeight: 500,
              color: '#94a3b8',
              letterSpacing: '0.12em',
            }
          : undefined,
        yPercent: i % 2 === 0 ? 20 : 80,
        previewBg: 'linear-gradient(145deg,#09090b,#18181b)',
        defaultInId: 'in-fade',
      }),
    )
  }

  // Podcast
  const pods = [
    ['pod-1', 'EP 01', 'Começando do zero'],
    ['pod-2', 'EP 12', 'Entrevista especial'],
    ['pod-3', 'CLIP', 'melhor momento'],
    ['pod-4', 'Q&A', 'perguntas de vocês'],
    ['pod-5', 'HOST', 'com convidado'],
    ['pod-6', 'TRAILER', 'novo episódio'],
    ['pod-7', 'HIGHLIGHT', 'frase do dia'],
    ['pod-8', 'AO VIVO', 'gravação'],
  ] as const
  for (const [i, [id, title, sub]] of pods.entries()) {
    const cw = COLORWAYS[i % COLORWAYS.length]
    pack.push(
      t({
        id,
        category: 'podcast',
        label: title,
        description: sub,
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '5%',
          fontWeight: 900,
          color: cw.color,
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '3%',
          fontWeight: 500,
          color: '#e2e8f0',
        },
        plate: {
          background: 'rgba(15,23,42,0.8)',
          paddingX: '3%',
          paddingY: '1.6%',
          borderRadius: '14px',
          border: `1px solid ${cw.color}66`,
        },
        previewBg: cw.previewBg,
        defaultInId: 'in-slide-up',
      }),
    )
  }

  // Gaming
  const games = [
    ['game-1', 'LEVEL UP', ''],
    ['game-2', 'GAME OVER', ''],
    ['game-3', 'VICTORY', 'royale'],
    ['game-4', 'FAIL', 'try again'],
    ['game-5', 'BOSS FIGHT', ''],
    ['game-6', 'COMBO x10', ''],
    ['game-7', 'NEW RECORD', ''],
    ['game-8', 'CLUTCH', ''],
    ['game-9', 'NERF', 'isso aí'],
    ['game-10', 'BUFF', 'ativado'],
    ['game-11', 'SPEEDRUN', 'any%'],
    ['game-12', 'EASTER EGG', 'achou'],
  ] as const
  for (const [i, [id, title, sub]] of games.entries()) {
    const cw = COLORWAYS[i % COLORWAYS.length]
    pack.push(
      t({
        id,
        category: 'gaming',
        label: title,
        description: sub || title,
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Arial Black", sans-serif',
          fontSize: '7%',
          fontWeight: 900,
          color: cw.color,
          letterSpacing: '0.06em',
          textShadow: `0 0 18px ${cw.color}99`,
        },
        subtitleStyle: sub
          ? {
              fontFamily: '"Segoe UI", sans-serif',
              fontSize: '3%',
              fontWeight: 700,
              color: cw.sub,
            }
          : undefined,
        previewBg: 'linear-gradient(145deg,#020617,#111827)',
        defaultInId: IN_CYCLE[i % IN_CYCLE.length],
      }),
    )
  }

  // Avisos
  const warnings = [
    ['warn-1', 'ATENÇÃO', 'conteúdo sensível'],
    ['warn-2', 'AVISO', 'pode conter spoilers'],
    ['warn-3', '18+', 'público adulto'],
    ['warn-4', 'CUIDADO', 'não tente em casa'],
    ['warn-5', 'IMPORTANTE', 'leia antes'],
    ['warn-6', 'URGENTE', 'última chamada'],
    ['warn-7', 'FLASH', 'notícia rápida'],
    ['warn-8', 'CORREÇÃO', 'atualização'],
  ] as const
  for (const [i, [id, title, sub]] of warnings.entries()) {
    pack.push(
      t({
        id,
        category: 'warning',
        label: title,
        description: sub,
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '5%',
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '0.14em',
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.8%',
          fontWeight: 600,
          color: '#fee2e2',
        },
        plate: {
          background: i % 2 === 0 ? '#dc2626' : '#ea580c',
          paddingX: '3.5%',
          paddingY: '1.6%',
          borderRadius: '6px',
        },
        yPercent: 16,
        previewBg: 'linear-gradient(145deg,#450a0a,#1c1917)',
        defaultInId: 'in-pop',
      }),
    )
  }

  return pack
}

/**
 * Pack focado em clipes musicais (lyric video, now playing, drop, créditos).
 * Inspirado em padrões CapCut/FlexClip/TikTok Reels — presets próprios MIT.
 */
function buildMusicClipTextPack(): EditorTextTemplateDef[] {
  const pack: EditorTextTemplateDef[] = []
  const musicBg = [
    'linear-gradient(145deg,#0f172a,#312e81)',
    'linear-gradient(145deg,#18181b,#3f1d4d)',
    'linear-gradient(145deg,#0c0a09,#7c2d12)',
    'linear-gradient(145deg,#020617,#0e7490)',
    'linear-gradient(145deg,#111827,#14532d)',
    'linear-gradient(145deg,#1c1917,#7f1d1d)',
  ]

  // Now playing / identificação da faixa
  const nowPlaying = [
    ['music-np-1', 'Now Playing', 'ARTISTA', 'Nome da Música'],
    ['music-np-2', 'Tocando agora', 'ARTISTA', 'Título da faixa'],
    ['music-np-3', 'Spotify bar', 'Artista · Single', 'Nome da Música'],
    ['music-np-4', 'Vinyl card', 'NOVO SINGLE', 'Artista'],
    ['music-np-5', 'Wave now', '♪ NOW PLAYING', 'Artista — Faixa'],
    ['music-np-6', 'Pill play', '▶ Tocando', 'Artista'],
  ] as const
  for (const [i, [id, label, title, sub]] of nowPlaying.entries()) {
    pack.push(
      t({
        id,
        category: 'music',
        label,
        description: 'Identificação da faixa / now playing',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: i === 4 ? '3%' : '3.4%',
          fontWeight: 800,
          color: i === 2 || i === 5 ? '#0f172a' : '#fff',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '4.2%',
          fontWeight: 700,
          color: i === 2 || i === 5 ? '#0f172a' : '#e2e8f0',
        },
        plate:
          i === 2 || i === 5
            ? {
                background: i === 5 ? '#22c55e' : '#fff',
                paddingX: '3.5%',
                paddingY: '1.6%',
                borderRadius: '999px',
              }
            : {
                background: 'rgba(15,23,42,0.82)',
                paddingX: '3.2%',
                paddingY: '1.5%',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.12)',
              },
        yPercent: i % 2 === 0 ? 82 : 16,
        previewBg: musicBg[i % musicBg.length],
        defaultInId: 'in-slide-up',
      }),
    )
  }

  // Lower third música: artista + título + créditos
  const musicLt = [
    ['music-lt-1', 'Artista · Faixa', 'Nome do Artista', 'Nome da Música'],
    ['music-lt-2', 'Feat.', 'Artista Principal', 'feat. Convidado'],
    ['music-lt-3', 'Produtor', 'prod. Nome', 'beat + mix'],
    ['music-lt-4', 'Álbum', 'ÁLBUM', 'Faixa 03'],
    ['music-lt-5', 'Label', 'Gravadora', '© 2026'],
    ['music-lt-6', 'Remix', 'Remix oficial', 'by DJ Name'],
    ['music-lt-7', 'Cover', 'COVER', 'versão acústica'],
    ['music-lt-8', 'Live', 'AO VIVO', 'sessão acústica'],
    ['music-lt-9', 'Escrito por', 'letra', 'Nome do compositor'],
    ['music-lt-10', 'Mix/Master', 'mix & master', 'Engenheiro'],
  ] as const
  for (const [i, [id, label, title, sub]] of musicLt.entries()) {
    pack.push(
      t({
        id,
        category: 'music',
        label,
        description: 'Lower third de clipe musical',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '3.6%',
          fontWeight: 800,
          color: '#fff',
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.5%',
          fontWeight: 500,
          color: '#cbd5e1',
        },
        plate: {
          background:
            i % 3 === 0
              ? 'linear-gradient(90deg,rgba(124,58,237,0.95),rgba(15,23,42,0.88))'
              : i % 3 === 1
                ? 'rgba(15,23,42,0.9)'
                : 'linear-gradient(90deg,rgba(236,72,153,0.9),rgba(15,23,42,0.88))',
          paddingX: '3%',
          paddingY: '1.4%',
          borderRadius: '8px',
        },
        align: 'left',
        xPercent: 10,
        yPercent: 80,
        previewBg: musicBg[i % musicBg.length],
        defaultInId: 'in-slide-left',
      }),
    )
  }

  // Marcadores de estrutura da música
  const structure = [
    ['music-str-verse', 'VERSE', 'verso'],
    ['music-str-pre', 'PRE-CHORUS', 'pré-refrão'],
    ['music-str-chorus', 'CHORUS', 'refrão'],
    ['music-str-bridge', 'BRIDGE', 'ponte'],
    ['music-str-outro', 'OUTRO', 'final'],
    ['music-str-intro', 'INTRO', 'abertura'],
    ['music-str-drop', 'DROP', 'queda'],
    ['music-str-build', 'BUILD UP', 'subida'],
    ['music-str-break', 'BREAK', 'quebra'],
    ['music-str-hook', 'HOOK', 'gancho'],
    ['music-str-solo', 'SOLO', 'solo'],
    ['music-str-adlib', 'AD-LIB', ''],
  ] as const
  for (const [i, [id, title, sub]] of structure.entries()) {
    pack.push(
      t({
        id,
        category: 'music',
        label: title,
        description: sub ? `Marcador: ${sub}` : 'Marcador da faixa',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Arial Black", sans-serif',
          fontSize: title === 'DROP' ? '10%' : '6.5%',
          fontWeight: 900,
          color: title === 'DROP' || title === 'HOOK' ? '#f472b6' : '#fff',
          letterSpacing: '0.16em',
          textShadow: SHADOW,
        },
        subtitleStyle: sub
          ? {
              fontFamily: '"Segoe UI", sans-serif',
              fontSize: '2.6%',
              fontWeight: 600,
              color: '#94a3b8',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }
          : undefined,
        previewBg: musicBg[i % musicBg.length],
        defaultInId: title === 'DROP' ? 'in-zoom' : 'in-pop',
      }),
    )
  }

  // Linhas de letra (lyric captions) — estilo CapCut lyric video
  const lyrics = [
    ['eu só queria te dizer', 'que ainda penso em você'],
    ['na batida do coração', 'eu encontro o meu lugar'],
    ['não olha pra trás', 'o drop já vai começar'],
    ['tonight we lose control', 'feel the bass'],
    ['hands up', 'if you feel this'],
    ['você é meu refrão', 'a parte que eu repito'],
    ['between the silence', 'and the storm'],
    ['dance with me', 'até o sol nascer'],
    ['eu ouço sua voz', 'em cada eco'],
    ['run it back', 'from the top'],
    ['love on repeat', 'não sai da cabeça'],
    ['fecha os olhos', 'sente o groove'],
    ['this is our song', 'play it loud'],
    ['me encontra no baixo', 'quando o beat cair'],
    ['one more time', 'não para agora'],
    ['seu nome no ar', 'como um sample'],
    ['heart on the 808', 'não mente'],
    ['só mais um verso', 'antes do fim'],
    ['we go up', 'we don’t come down'],
    ['luzes no escuro', 'e a gente no meio'],
    ['put your hands', 'where I can see'],
    ['o tempo parou', 'nessa melodia'],
    ['sing it with me', 'todo mundo'],
    ['última chamada', 'pra pista'],
  ] as const
  for (const [i, [title, sub]] of lyrics.entries()) {
    const karaoke = i % 4 === 0
    const boxed = i % 4 === 1
    const impact = i % 4 === 2
    pack.push(
      t({
        id: `music-lyric-${i + 1}`,
        category: 'music',
        label: `Letra ${i + 1}`,
        description: 'Linha de lyric video',
        defaultTitle: title,
        defaultSubtitle: sub,
        defaultMotionId:
          i % 4 === 0 ? 'word-by-word' : i % 4 === 1 ? 'typewriter' : i % 4 === 2 ? 'split-words' : 'blur-in',
        titleStyle: {
          fontFamily: impact
            ? '"Impact", "Arial Black", sans-serif'
            : '"Segoe UI", sans-serif',
          fontSize: impact ? '5%' : '4%',
          fontWeight: 800,
          color: karaoke ? '#fef08a' : '#fff',
          textTransform: impact ? 'uppercase' : 'none',
          textShadow: impact ? '2px 2px 0 #000' : SHADOW,
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '3.2%',
          fontWeight: 600,
          color: karaoke ? '#fde68a' : '#e2e8f0',
          textShadow: SHADOW_SOFT,
        },
        plate: boxed
          ? {
              background: 'rgba(0,0,0,0.72)',
              paddingX: '3%',
              paddingY: '1.4%',
              borderRadius: '10px',
            }
          : undefined,
        yPercent: 70 + (i % 3) * 4,
        previewBg: musicBg[i % musicBg.length],
        defaultInId: i % 3 === 0 ? 'in-fade' : i % 3 === 1 ? 'in-slide-up' : 'in-pop',
      }),
    )
  }

  // Promo musical / release
  const releases = [
    ['music-rel-1', 'OUT NOW', 'já disponível'],
    ['music-rel-2', 'PRE-SAVE', 'link na bio'],
    ['music-rel-3', 'NOVO SINGLE', 'estreia hoje'],
    ['music-rel-4', 'STREAM NOW', 'todas as plataformas'],
    ['music-rel-5', 'ÁLBUM NOVO', 'ouça completo'],
    ['music-rel-6', 'CLIPE OFICIAL', 'assista'],
    ['music-rel-7', 'VISUALIZER', ''],
    ['music-rel-8', 'TEASER', 'sexta-feira'],
    ['music-rel-9', 'NEW MUSIC', 'friday'],
    ['music-rel-10', 'EXCLUSIVE', 'prévia'],
    ['music-rel-11', 'AVAILABLE', 'on all DSPs'],
    ['music-rel-12', 'ADD TO PLAYLIST', 'salva aí'],
  ] as const
  for (const [i, [id, title, sub]] of releases.entries()) {
    pack.push(
      t({
        id,
        category: 'music',
        label: title,
        description: sub || 'Promo de lançamento',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Arial Black", sans-serif',
          fontSize: '6.5%',
          fontWeight: 900,
          color: i % 2 === 0 ? '#22d3ee' : '#f472b6',
          letterSpacing: '0.1em',
          textShadow: SHADOW,
        },
        subtitleStyle: sub
          ? {
              fontFamily: '"Segoe UI", sans-serif',
              fontSize: '2.8%',
              fontWeight: 600,
              color: '#cbd5e1',
            }
          : undefined,
        plate:
          i % 3 === 0
            ? {
                background: 'rgba(15,23,42,0.78)',
                paddingX: '3.5%',
                paddingY: '1.6%',
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.2)',
              }
            : undefined,
        yPercent: i % 2 === 0 ? 78 : 22,
        previewBg: musicBg[i % musicBg.length],
        defaultInId: 'in-zoom',
      }),
    )
  }

  // Meta técnica: BPM, key, genre
  const meta = [
    ['music-meta-1', '128 BPM', 'C# minor'],
    ['music-meta-2', '140 BPM', 'F major'],
    ['music-meta-3', '92 BPM', 'A minor'],
    ['music-meta-4', 'GENRE', 'Afrobeats'],
    ['music-meta-5', 'GENRE', 'Funk / Trap'],
    ['music-meta-6', 'GENRE', 'Pop / R&B'],
    ['music-meta-7', 'KEY', 'D minor'],
    ['music-meta-8', 'TEMPO', 'slow burn'],
  ] as const
  for (const [i, [id, title, sub]] of meta.entries()) {
    pack.push(
      t({
        id,
        category: 'music',
        label: title,
        description: `Meta da faixa · ${sub}`,
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Courier New", monospace',
          fontSize: '4%',
          fontWeight: 700,
          color: '#a5f3fc',
          letterSpacing: '0.12em',
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.6%',
          fontWeight: 600,
          color: '#e2e8f0',
        },
        plate: {
          background: 'rgba(8,47,73,0.85)',
          paddingX: '2.8%',
          paddingY: '1.2%',
          borderRadius: '8px',
          border: '1px solid rgba(103,232,249,0.35)',
        },
        align: 'left',
        xPercent: 10,
        yPercent: 14,
        previewBg: musicBg[i % musicBg.length],
        defaultInId: 'in-fade',
      }),
    )
  }

  // CTAs sociais musicais
  const musicSocial = [
    ['music-soc-1', 'Link na bio', 'ouça completo'],
    ['music-soc-2', 'Salva o som', 'usa no seu vídeo'],
    ['music-soc-3', 'Duet this', 'com a letra'],
    ['music-soc-4', 'Parte 2', 'no próximo'],
    ['music-soc-5', 'Comenta a letra', 'favorita'],
    ['music-soc-6', 'Quem é o artista?', 'marca nos comments'],
    ['music-soc-7', 'Shazam', 'descobrir música'],
    ['music-soc-8', 'Full song', 'no canal'],
  ] as const
  for (const [i, [id, title, sub]] of musicSocial.entries()) {
    pack.push(
      t({
        id,
        category: 'music',
        label: title,
        description: sub,
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '4.2%',
          fontWeight: 900,
          color: '#fff',
          textShadow: SHADOW,
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.7%',
          fontWeight: 500,
          color: '#cbd5e1',
        },
        yPercent: 24,
        previewBg: musicBg[i % musicBg.length],
        defaultInId: 'in-slide-down',
      }),
    )
  }

  // Estilos festival / live / mood
  const moods = [
    ['music-mood-1', 'FESTIVAL', 'mainstage energy'],
    ['music-mood-2', 'AFTERMOVIE', 'noite sem fim'],
    ['music-mood-3', 'CHILL', 'late night vibes'],
    ['music-mood-4', 'SAD HOURS', 'playlist'],
    ['music-mood-5', 'GYM MODE', 'no skips'],
    ['music-mood-6', 'SUNSET SET', 'golden hour'],
    ['music-mood-7', 'CLUB', 'lights down'],
    ['music-mood-8', 'ACOUSTIC', 'raw session'],
    ['music-mood-9', 'LOFI', 'study beats'],
    ['music-mood-10', 'DRILL', 'dark energy'],
  ] as const
  for (const [i, [id, title, sub]] of moods.entries()) {
    pack.push(
      t({
        id,
        category: 'music',
        label: title,
        description: sub,
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Arial Black", sans-serif',
          fontSize: '7%',
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '0.14em',
          textShadow: `0 0 22px rgba(167,139,250,0.7)`,
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.8%',
          fontWeight: 600,
          color: '#c4b5fd',
        },
        previewBg: musicBg[i % musicBg.length],
        defaultInId: IN_CYCLE[i % IN_CYCLE.length],
      }),
    )
  }

  // Karaoke / highlight palavra a palavra (linha única forte)
  const karaokeHits = [
    'EU TE AMO',
    'NÃO PARA',
    'SENTE ISSO',
    'VAI DESCER',
    'SOBE O SOM',
    'REPETE COMIGO',
    'NO DROP',
    'MAIS ALTO',
    'TODO MUNDO',
    'AGORA',
  ]
  for (const [i, word] of karaokeHits.entries()) {
    pack.push(
      t({
        id: `music-kara-${i + 1}`,
        category: 'music',
        label: `Karaoke ${i + 1}`,
        description: 'Palavra em destaque no beat',
        defaultTitle: word,
        defaultSubtitle: '',
        titleStyle: {
          fontFamily: '"Arial Black", sans-serif',
          fontSize: '8%',
          fontWeight: 900,
          color: i % 2 === 0 ? '#fef08a' : '#67e8f9',
          letterSpacing: '0.06em',
          textShadow: '0 3px 0 #000, 0 0 18px rgba(0,0,0,0.55)',
        },
        yPercent: 62,
        previewBg: musicBg[i % musicBg.length],
        defaultInId: 'in-pop',
      }),
    )
  }

  return pack
}

function buildBitsTextPack(): EditorTextTemplateDef[] {
  const demos: Array<{
    id: string
    motion: string
    label: string
    title: string
    subtitle: string
    source: string
  }> = [
    { id: 'bits-split-chars', motion: 'split-chars', label: 'SplitText chars', title: 'SPLIT TEXT', subtitle: 'GSAP chars', source: 'GSAP SplitText' },
    { id: 'bits-split-words', motion: 'split-words', label: 'SplitText words', title: 'palavra por palavra', subtitle: 'GSAP words', source: 'GSAP SplitText' },
    { id: 'bits-elastic', motion: 'elastic-chars', label: 'Elastic', title: 'ELASTIC', subtitle: 'bounce GSAP', source: 'GSAP SplitText' },
    { id: 'bits-blur', motion: 'blur-in', label: 'BlurText', title: 'blur reveal', subtitle: 'React Bits', source: 'React Bits' },
    { id: 'bits-type', motion: 'typewriter', label: 'TextType', title: 'digitando agora…', subtitle: '', source: 'React Bits' },
    { id: 'bits-glitch', motion: 'glitch-in', label: 'GlitchText', title: 'GLITCH', subtitle: 'RGB split', source: 'React Bits' },
    { id: 'bits-decrypt', motion: 'decrypt', label: 'Decrypted', title: 'DECRYPT', subtitle: 'hack reveal', source: 'React Bits' },
    { id: 'bits-shuffle', motion: 'shuffle', label: 'Shuffle', title: 'SHUFFLE', subtitle: 'settle', source: 'React Bits' },
    { id: 'bits-word', motion: 'word-by-word', label: 'Word by Word', title: 'remotion bits word', subtitle: 'stagger', source: 'Remotion Bits' },
    { id: 'bits-stagger-up', motion: 'stagger-up', label: 'Stagger Char', title: 'STAGGER', subtitle: 'chars up', source: 'Remotion Bits' },
    { id: 'bits-scale', motion: 'stagger-scale', label: 'Scale Char', title: 'SCALE IN', subtitle: 'pop chars', source: 'Remotion Bits' },
    { id: 'bits-lines', motion: 'fade-lines', label: 'Fade Lines', title: 'linha um\nlinha dois', subtitle: '', source: 'Remotion Bits' },
    { id: 'bits-slide', motion: 'slide-left-words', label: 'Slide Words', title: 'slide from left', subtitle: 'words', source: 'Remotion Bits' },
    { id: 'bits-matrix', motion: 'matrix-reveal', label: 'Matrix', title: 'MATRIX', subtitle: 'cascade', source: 'Remotion Bits' },
    // Variações musicais com Bits
    { id: 'bits-music-drop', motion: 'stagger-scale', label: 'DROP Bits', title: 'DROP', subtitle: 'beat hit', source: 'Remotion Bits' },
    { id: 'bits-music-lyric', motion: 'word-by-word', label: 'Lyric Bits', title: 'sente o groove', subtitle: 'na batida', source: 'Remotion Bits' },
    { id: 'bits-music-out', motion: 'split-chars', label: 'OUT NOW Bits', title: 'OUT NOW', subtitle: 'stream', source: 'GSAP SplitText' },
    { id: 'bits-music-hook', motion: 'glitch-in', label: 'HOOK Glitch', title: 'HOOK', subtitle: 'refrão', source: 'React Bits' },
    { id: 'bits-music-type', motion: 'typewriter', label: 'Lyric Type', title: 'eu só queria te dizer', subtitle: '', source: 'React Bits' },
    { id: 'bits-music-decrypt', motion: 'decrypt', label: 'Artist Decrypt', title: 'ARTISTA', subtitle: 'revela', source: 'React Bits' },
  ]

  return demos.map((demo, index) =>
    t({
      id: demo.id,
      category: 'bits',
      label: demo.label,
      description: `${demo.source} · ${demo.motion}`,
      defaultTitle: demo.title,
      defaultSubtitle: demo.subtitle,
      titleStyle: {
        fontFamily: index % 2 === 0 ? '"Arial Black", sans-serif' : '"Segoe UI", sans-serif',
        fontSize: demo.motion === 'fade-lines' ? '4.5%' : '6%',
        fontWeight: 900,
        color: index % 3 === 0 ? '#67e8f9' : index % 3 === 1 ? '#f9a8d4' : '#fef08a',
        textShadow: SHADOW,
      },
      subtitleStyle: demo.subtitle
        ? {
            fontFamily: '"Segoe UI", sans-serif',
            fontSize: '2.8%',
            fontWeight: 600,
            color: '#cbd5e1',
          }
        : undefined,
      defaultMotionId: demo.motion,
      defaultInId: null,
      previewBg:
        index % 2 === 0
          ? 'linear-gradient(145deg,#020617,#312e81)'
          : 'linear-gradient(145deg,#0f172a,#9d174d)',
    }),
  )
}

/**
 * Tipografia cinética estilo Motion Array (minimal kinetic, gravity, hyper kinetic).
 * Presets próprios — não usa AE templates pagos.
 */
function buildMotionArrayTextPack(): EditorTextTemplateDef[] {
  const bg = [
    'linear-gradient(145deg,#09090b,#1e1b4b)',
    'linear-gradient(145deg,#0c0a09,#3f1d4d)',
    'linear-gradient(145deg,#020617,#0e7490)',
    'linear-gradient(145deg,#111827,#7f1d1d)',
    'linear-gradient(145deg,#0f172a,#14532d)',
  ]
  const kineticLines = [
    ['ma-k1', 'STOP', 'THINK', 'split-chars', 'in-pop'],
    ['ma-k2', 'MAKE', 'IT LOUD', 'stagger-scale', 'in-zoom'],
    ['ma-k3', 'NOW', 'OR NEVER', 'word-by-word', 'in-slide-up'],
    ['ma-k4', 'FOCUS', 'ON THIS', 'blur-in', 'in-fade'],
    ['ma-k5', 'RISE', 'ABOVE', 'stagger-up', 'gsap-in-back'],
    ['ma-k6', 'BREAK', 'THE RULES', 'glitch-in', 'bits-in-glitch'],
    ['ma-k7', 'MOVE', 'FASTER', 'split-words', 'gsap-in-power4'],
    ['ma-k8', 'FEEL', 'THE DROP', 'stagger-scale', 'in-pop'],
    ['ma-k9', 'PURE', 'ENERGY', 'elastic-chars', 'anime-in-elastic'],
    ['ma-k10', 'GO', 'HARD', 'matrix-reveal', 'in-zoom'],
    ['ma-k11', 'NO', 'LIMITS', 'decrypt', 'bits-in-decrypt'],
    ['ma-k12', 'OWN', 'THE MOMENT', 'word-by-word', 'motion-in-spring'],
  ] as const

  const pack: EditorTextTemplateDef[] = kineticLines.map(([id, title, sub, motion, anim], i) =>
    t({
      id,
      category: 'ma-kinetic',
      label: `${title} ${sub}`,
      description: 'Kinetic typography · Motion Array style',
      defaultTitle: title,
      defaultSubtitle: sub,
      titleStyle: {
        fontFamily: '"Arial Black", "Segoe UI", sans-serif',
        fontSize: i % 3 === 0 ? '11%' : '8%',
        fontWeight: 900,
        color: i % 2 === 0 ? '#fff' : '#fef08a',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        textShadow: SHADOW,
      },
      subtitleStyle: {
        fontFamily: '"Segoe UI", sans-serif',
        fontSize: '4%',
        fontWeight: 700,
        color: i % 2 === 0 ? '#a5f3fc' : '#f9a8d4',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
      },
      defaultMotionId: motion,
      defaultInId: anim,
      yPercent: 42 + (i % 3) * 6,
      previewBg: bg[i % bg.length],
    }),
  )

  const minimal = [
    ['ma-min-1', 'CHAPTER', '01', 18],
    ['ma-min-2', 'SCENE', 'NIGHT', 20],
    ['ma-min-3', 'LOCATION', 'DOWNTOWN', 78],
    ['ma-min-4', 'SUBJECT', 'UNKNOWN', 82],
    ['ma-min-5', 'NOTE', 'READ THIS', 50],
    ['ma-min-6', 'CUT TO', 'BLACK', 50],
    ['ma-min-7', 'URBAN', 'OVERLAY', 16],
    ['ma-min-8', 'MINIMAL', 'TITLE', 50],
  ] as const
  for (const [i, [id, title, sub, y]] of minimal.entries()) {
    pack.push(
      t({
        id,
        category: 'ma-kinetic',
        label: `Minimal ${title}`,
        description: 'Minimal kinetic title · urban overlay',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '3.2%',
          fontWeight: 600,
          color: '#e2e8f0',
          letterSpacing: '0.35em',
          textTransform: 'uppercase',
        },
        subtitleStyle: {
          fontFamily: '"Arial Black", sans-serif',
          fontSize: '6.5%',
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '0.04em',
        },
        defaultMotionId: 'blur-in',
        defaultInId: 'bits-in-blur',
        yPercent: y,
        previewBg: bg[i % bg.length],
      }),
    )
  }

  const gravity = [
    ['ma-grav-1', 'FALLING', 'WORDS'],
    ['ma-grav-2', 'HEAVY', 'TYPE'],
    ['ma-grav-3', 'PULL', 'DOWN'],
    ['ma-grav-4', 'WEIGHT', 'LESS'],
    ['ma-grav-5', 'IMPACT', 'ZONE'],
    ['ma-grav-6', 'CRASH', 'LANDING'],
  ] as const
  for (const [i, [id, title, sub]] of gravity.entries()) {
    pack.push(
      t({
        id,
        category: 'ma-kinetic',
        label: `Gravity ${title}`,
        description: 'Gravity typography kit style',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Arial Black", sans-serif',
          fontSize: '9%',
          fontWeight: 900,
          color: '#fff',
          textShadow: '0 8px 24px rgba(0,0,0,0.65)',
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '3.5%',
          fontWeight: 700,
          color: '#94a3b8',
          letterSpacing: '0.25em',
        },
        defaultMotionId: 'stagger-up',
        defaultInId: 'anime-in-bounce',
        yPercent: 55,
        previewBg: bg[i % bg.length],
      }),
    )
  }

  const editorial = [
    ['ma-ed-1', 'THE SHIFT', 'a new era'],
    ['ma-ed-2', 'IN FOCUS', 'this week'],
    ['ma-ed-3', 'EDITORIAL', 'issue 04'],
    ['ma-ed-4', 'PORTRAIT', 'of a city'],
    ['ma-ed-5', 'LOOKBOOK', 'spring'],
    ['ma-ed-6', 'COVER', 'story'],
  ] as const
  for (const [i, [id, title, sub]] of editorial.entries()) {
    pack.push(
      t({
        id,
        category: 'ma-kinetic',
        label: title,
        description: 'Editorial composition · MA style',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: '7%',
          fontWeight: 700,
          color: '#f8fafc',
          letterSpacing: '0.02em',
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.8%',
          fontWeight: 500,
          color: '#cbd5e1',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        },
        defaultMotionId: 'fade-lines',
        defaultInId: 'theatre-in-ease',
        previewBg: bg[i % bg.length],
      }),
    )
  }

  return pack
}

/**
 * Títulos cinematográficos / minimalistas / nomes de artista — estilo Envato Elements.
 */
function buildEnvatoTitlesPack(): EditorTextTemplateDef[] {
  const pack: EditorTextTemplateDef[] = []
  const cinema = [
    ['env-cin-1', 'A FILM BY', 'ATLAS STUDIO'],
    ['env-cin-2', 'PRESENTING', 'THE FEATURE'],
    ['env-cin-3', 'STARRING', 'YOUR NAME'],
    ['env-cin-4', 'DIRECTED BY', 'CREATIVE DEPT'],
    ['env-cin-5', 'IN ASSOCIATION WITH', 'THE COLLECTIVE'],
    ['env-cin-6', 'BASED ON', 'A TRUE STORY'],
    ['env-cin-7', 'ONE YEAR LATER', ''],
    ['env-cin-8', 'THE END', ''],
  ] as const
  for (const [i, [id, title, sub]] of cinema.entries()) {
    pack.push(
      t({
        id,
        category: 'envato-titles',
        label: title,
        description: 'Título cinematográfico · Envato style',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.8%',
          fontWeight: 600,
          color: '#cbd5e1',
          letterSpacing: '0.4em',
          textTransform: 'uppercase',
        },
        subtitleStyle: sub
          ? {
              fontFamily: 'Georgia, serif',
              fontSize: '6%',
              fontWeight: 700,
              color: '#fff',
              textShadow: SHADOW_SOFT,
            }
          : undefined,
        defaultMotionId: 'blur-in',
        defaultInId: 'in-fade',
        defaultOutId: 'out-fade',
        yPercent: i < 6 ? 48 : 50,
        previewBg: 'linear-gradient(145deg,#09090b,#27272a)',
      }),
    )
  }

  const minimal = [
    ['env-min-1', 'SIMPLE', ''],
    ['env-min-2', 'CLEAN', 'TYPE'],
    ['env-min-3', 'QUIET', 'POWER'],
    ['env-min-4', 'LESS', 'IS MORE'],
    ['env-min-5', 'WHITE', 'SPACE'],
    ['env-min-6', 'LINE', ''],
    ['env-min-7', 'FORM', 'FOLLOWS'],
    ['env-min-8', 'BALANCE', ''],
  ] as const
  for (const [i, [id, title, sub]] of minimal.entries()) {
    pack.push(
      t({
        id,
        category: 'envato-titles',
        label: `Minimal ${title}`,
        description: 'Tipografia minimalista · Envato',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI Light", "Segoe UI", sans-serif',
          fontSize: '7%',
          fontWeight: 300,
          color: '#fff',
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
        },
        subtitleStyle: sub
          ? {
              fontFamily: '"Segoe UI", sans-serif',
              fontSize: '2.6%',
              fontWeight: 500,
              color: '#94a3b8',
              letterSpacing: '0.35em',
            }
          : undefined,
        defaultMotionId: 'split-words',
        defaultInId: 'motion-in-layout',
        previewBg: 'linear-gradient(145deg,#18181b,#3f3f46)',
      }),
    )
  }

  const artists = [
    ['env-art-1', 'NOVA LANE', 'vocalist'],
    ['env-art-2', 'KAI RIVERS', 'producer'],
    ['env-art-3', 'MIRA SOL', 'songwriter'],
    ['env-art-4', 'DEX COLE', 'DJ / live'],
    ['env-art-5', 'ARIA WEST', 'feat. guest'],
    ['env-art-6', 'JON PARK', 'guitar'],
    ['env-art-7', 'LUNA GREY', 'keys'],
    ['env-art-8', 'THE ECHO', 'band'],
    ['env-art-9', 'VISTA', 'collective'],
    ['env-art-10', 'ORION', 'special guest'],
  ] as const
  for (const [i, [id, title, sub]] of artists.entries()) {
    pack.push(
      t({
        id,
        category: 'envato-titles',
        label: title,
        description: 'Nome de artista · Envato titles',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Arial Black", sans-serif',
          fontSize: '5.5%',
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '0.06em',
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.5%',
          fontWeight: 500,
          color: '#a5b4fc',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
        },
        plate:
          i % 2 === 0
            ? {
                background: 'rgba(15,23,42,0.75)',
                paddingX: '3%',
                paddingY: '1.5%',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.15)',
              }
            : undefined,
        align: i % 3 === 0 ? 'left' : 'center',
        xPercent: i % 3 === 0 ? 12 : 50,
        yPercent: i % 2 === 0 ? 78 : 22,
        defaultMotionId: 'word-by-word',
        defaultInId: 'in-slide-up',
        previewBg: 'linear-gradient(145deg,#0f172a,#312e81)',
      }),
    )
  }

  const modern = [
    ['env-mod-1', 'OPENING TITLE', 'sequence'],
    ['env-mod-2', 'SECTION', '02'],
    ['env-mod-3', 'COMING UP', 'next'],
    ['env-mod-4', 'BREAKING', 'moment'],
    ['env-mod-5', 'HIGHLIGHT', 'reel'],
    ['env-mod-6', 'CREDITS', 'rolling'],
  ] as const
  for (const [i, [id, title, sub]] of modern.entries()) {
    pack.push(
      t({
        id,
        category: 'envato-titles',
        label: title,
        description: 'Título moderno · Envato',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '5%',
          fontWeight: 800,
          color: '#f0f9ff',
          letterSpacing: '0.12em',
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.8%',
          fontWeight: 600,
          color: '#38bdf8',
        },
        defaultMotionId: 'slide-left-words',
        defaultInId: 'gsap-in-expo',
        previewBg: 'linear-gradient(145deg,#0c4a6e,#082f49)',
      }),
    )
  }

  return pack
}

/**
 * Essential Typography / Text Presets — estilo Mister Horse.
 * 1-line titles, text boxes, quotes, social, long text.
 */
function buildMisterHorseTextPack(): EditorTextTemplateDef[] {
  const pack: EditorTextTemplateDef[] = []

  // 1-line basic titles
  for (let i = 1; i <= 12; i += 1) {
    const align = i % 3 === 1 ? 'left' : i % 3 === 2 ? 'center' : 'right'
    pack.push(
      t({
        id: `mh-1line-${i}`,
        category: 'mh-essential',
        label: `1-Line Basic ${i}`,
        description: 'Essential Typography · 1-line title',
        defaultTitle: i % 2 === 0 ? 'BASIC TITLE' : 'Your headline here',
        defaultSubtitle: '',
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: i <= 4 ? '5%' : i <= 8 ? '4.2%' : '3.6%',
          fontWeight: i % 2 === 0 ? 800 : 600,
          color: '#fff',
          letterSpacing: i % 4 === 0 ? '0.2em' : '0.04em',
          textTransform: i % 2 === 0 ? 'uppercase' : 'none',
          textShadow: SHADOW_SOFT,
        },
        align,
        xPercent: align === 'left' ? 10 : align === 'right' ? 90 : 50,
        yPercent: 20 + ((i - 1) % 4) * 18,
        defaultMotionId: i % 3 === 0 ? 'split-chars' : i % 3 === 1 ? 'split-words' : 'fade-lines',
        defaultInId: 'in-fade',
        previewBg: 'linear-gradient(145deg,#1e293b,#0f172a)',
      }),
    )
  }

  // Text boxes fill / outline
  const boxes = [
    ['mh-box-fill-1', 'FILL BOX', 'rounded', true, '999px'],
    ['mh-box-fill-2', 'FILL BOX', 'square', true, '6px'],
    ['mh-box-fill-3', 'HIGHLIGHT', 'accent', true, '8px'],
    ['mh-box-out-1', 'OUTLINE', 'rounded', false, '999px'],
    ['mh-box-out-2', 'OUTLINE', 'square', false, '4px'],
    ['mh-box-out-3', 'FRAME', 'soft', false, '12px'],
    ['mh-box-fill-4', 'TAG', 'pill', true, '999px'],
    ['mh-box-out-4', 'LABEL', 'line', false, '2px'],
  ] as const
  for (const [i, [id, title, sub, fill, radius]] of boxes.entries()) {
    pack.push(
      t({
        id,
        category: 'mh-essential',
        label: `${title} ${sub}`,
        description: fill ? 'Text Box · Fill' : 'Text Box · Outline',
        defaultTitle: title,
        defaultSubtitle: '',
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '3.4%',
          fontWeight: 800,
          color: fill ? '#0f172a' : '#fff',
          letterSpacing: '0.1em',
        },
        plate: fill
          ? {
              background: i % 2 === 0 ? '#f8fafc' : '#38bdf8',
              paddingX: '3%',
              paddingY: '1.4%',
              borderRadius: radius,
            }
          : {
              background: 'transparent',
              paddingX: '3%',
              paddingY: '1.4%',
              borderRadius: radius,
              border: '2px solid rgba(255,255,255,0.85)',
            },
        yPercent: 70 + (i % 3) * 4,
        defaultMotionId: 'stagger-scale',
        defaultInId: 'in-pop',
        previewBg: 'linear-gradient(145deg,#0f172a,#334155)',
      }),
    )
  }

  // Text & line
  const lines = [
    ['mh-line-1', 'WITH LINE', 'underline feel'],
    ['mh-line-2', 'DIVIDER', 'section'],
    ['mh-line-3', 'RULED', 'title'],
    ['mh-line-4', 'BAR', 'accent'],
  ] as const
  for (const [, [id, title, sub]] of lines.entries()) {
    pack.push(
      t({
        id,
        category: 'mh-essential',
        label: title,
        description: 'Text & Line · Essential',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '4.5%',
          fontWeight: 800,
          color: '#fff',
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.4%',
          fontWeight: 500,
          color: '#94a3b8',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
        },
        plate: {
          background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.85),transparent)',
          paddingX: '8%',
          paddingY: '0.15%',
          borderRadius: '0',
        },
        defaultMotionId: 'slide-left-words',
        defaultInId: 'in-slide-left',
        previewBg: 'linear-gradient(145deg,#18181b,#27272a)',
      }),
    )
  }

  // Quotes
  const quotes = [
    ['mh-q-1', '“Design is\nintelligence made visible.”', '— Alina Wheeler'],
    ['mh-q-2', '“Simplicity is\nthe ultimate sophistication.”', '— Leonardo'],
    ['mh-q-3', '“Make it simple,\nbut significant.”', '— Don Draper'],
    ['mh-q-4', '“Creativity takes\ncourage.”', '— Matisse'],
    ['mh-q-5', '“Done is better\nthan perfect.”', ''],
    ['mh-q-6', '“Stay hungry.\nStay foolish.”', ''],
  ] as const
  for (const [i, [id, title, sub]] of quotes.entries()) {
    pack.push(
      t({
        id,
        category: 'mh-essential',
        label: `Quote ${i + 1}`,
        description: 'Essential Typography · Quotes',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: 'Georgia, serif',
          fontSize: '4.2%',
          fontWeight: 600,
          color: '#f8fafc',
          lineHeight: 1.35,
        },
        subtitleStyle: sub
          ? {
              fontFamily: '"Segoe UI", sans-serif',
              fontSize: '2.4%',
              fontWeight: 500,
              color: '#94a3b8',
              letterSpacing: '0.08em',
            }
          : undefined,
        defaultMotionId: 'fade-lines',
        defaultInId: 'in-fade',
        previewBg: 'linear-gradient(145deg,#1c1917,#44403c)',
      }),
    )
  }

  // Social media
  const social = [
    ['mh-soc-1', 'FOLLOW', '@atlas'],
    ['mh-soc-2', 'LIKE & SHARE', 'this video'],
    ['mh-soc-3', 'SUBSCRIBE', 'for more'],
    ['mh-soc-4', 'COMMENT', 'below'],
    ['mh-soc-5', 'SAVE THIS', 'for later'],
    ['mh-soc-6', 'LINK IN BIO', ''],
    ['mh-soc-7', 'NEW POST', 'today'],
    ['mh-soc-8', 'STORY', 'swipe up'],
  ] as const
  for (const [i, [id, title, sub]] of social.entries()) {
    pack.push(
      t({
        id,
        category: 'mh-essential',
        label: title,
        description: 'Essential Typography · Social Media',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '4%',
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '0.08em',
        },
        subtitleStyle: sub
          ? {
              fontFamily: '"Segoe UI", sans-serif',
              fontSize: '2.6%',
              fontWeight: 600,
              color: '#7dd3fc',
            }
          : undefined,
        plate: {
          background: 'rgba(15,23,42,0.8)',
          paddingX: '3%',
          paddingY: '1.5%',
          borderRadius: '14px',
        },
        yPercent: 22 + (i % 3) * 20,
        defaultMotionId: 'stagger-scale',
        defaultInId: 'in-pop',
        previewBg: 'linear-gradient(145deg,#0f172a,#1d4ed8)',
      }),
    )
  }

  // Long text / paragraphs
  const longs = [
    [
      'mh-long-1',
      'This is a longer title block for explanations and narrative beats in your edit.',
      'Long Text',
    ],
    [
      'mh-long-2',
      'Use this preset when you need two lines of clear, readable body copy on screen.',
      'Body copy',
    ],
    [
      'mh-long-3',
      'Keep it short enough to read in three seconds — then cut to the next beat.',
      'Readable',
    ],
    [
      'mh-long-4',
      'Essential Typography style: timeless, flexible, works with any font you choose.',
      'Timeless',
    ],
  ] as const
  for (const [i, [id, title, sub]] of longs.entries()) {
    pack.push(
      t({
        id,
        category: 'mh-essential',
        label: `Long Text ${i + 1}`,
        description: `Essential · ${sub}`,
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '3.2%',
          fontWeight: 600,
          color: '#f1f5f9',
          lineHeight: 1.4,
        },
        subtitleStyle: {
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: '2.2%',
          fontWeight: 700,
          color: '#64748b',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        },
        plate: {
          background: 'rgba(15,23,42,0.72)',
          paddingX: '4%',
          paddingY: '2%',
          borderRadius: '10px',
        },
        yPercent: 70,
        defaultMotionId: 'word-by-word',
        defaultInId: 'in-fade',
        previewBg: 'linear-gradient(145deg,#0f172a,#1e293b)',
      }),
    )
  }

  // Atypical / extras
  const atypical = [
    ['mh-atyp-1', '¡HEY!', ''],
    ['mh-atyp-2', 'WAIT—', ''],
    ['mh-atyp-3', 'YES!!', ''],
    ['mh-atyp-4', '…and then', ''],
    ['mh-atyp-5', 'OKAY.', ''],
    ['mh-atyp-6', 'WHAT IF', '?'],
  ] as const
  for (const [i, [id, title, sub]] of atypical.entries()) {
    pack.push(
      t({
        id,
        category: 'mh-essential',
        label: title,
        description: 'Essential Typography · Atypical',
        defaultTitle: title,
        defaultSubtitle: sub,
        titleStyle: {
          fontFamily: '"Arial Black", sans-serif',
          fontSize: '8%',
          fontWeight: 900,
          color: i % 2 === 0 ? '#f472b6' : '#67e8f9',
          textShadow: SHADOW,
        },
        defaultMotionId: 'elastic-chars',
        defaultInId: 'anime-in-elastic',
        previewBg: 'linear-gradient(145deg,#18181b,#4c1d95)',
      }),
    )
  }

  return pack
}

export const EDITOR_TEXT_TEMPLATES: EditorTextTemplateDef[] = [
  ...BASE_TEXT_TEMPLATES,
  ...buildExpandedTextPack(),
  ...buildMusicClipTextPack(),
  ...buildBitsTextPack(),
  ...buildMotionArrayTextPack(),
  ...buildEnvatoTitlesPack(),
  ...buildMisterHorseTextPack(),
]

export function editorTextTemplateById(id: string | null | undefined): EditorTextTemplateDef | undefined {
  if (!id) return undefined
  return EDITOR_TEXT_TEMPLATES.find((item) => item.id === id)
}

export function editorTextTemplatesByCategory(category: EditorTextCategory): EditorTextTemplateDef[] {
  return EDITOR_TEXT_TEMPLATES.filter((item) => item.category === category)
}
