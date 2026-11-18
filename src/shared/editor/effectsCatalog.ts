export type EditorEffectCategory =
  | 'popular'
  | 'lens'
  | 'nightclub'
  | 'retro'
  | 'color'
  | 'blur'
  | 'stylize'
  | 'bits-bg'

export type EditorEffectOverlay = {
  /** Fundo / gradiente do overlay. */
  background: string
  backgroundSize?: string
  opacity?: number
  mixBlendMode?: string
  /** Nome da animação CSS (globals). */
  animation?: string
  animationDuration?: string
}

export type EditorEffectDef = {
  id: string
  label: string
  category: EditorEffectCategory
  description: string
  /** Fragmento FFmpeg aplicado no vídeo (quando houver equivalente). */
  ffmpeg: string | null
  /** Filtro CSS aproximado para preview leve. */
  cssFilter: string | null
  /** Overlay animado (luz, vinheta, flash, partículas). */
  overlay?: EditorEffectOverlay | null
  /** Fonte inspiradora. */
  source?: 'pixi' | 'react-bits' | 'atlas'
}

/** Id validado contra o catálogo. */
export type EditorEffectId = string

export const EDITOR_EFFECT_CATEGORY_LABEL: Record<EditorEffectCategory, string> = {
  popular: 'Populares',
  lens: 'Lente & Shake',
  nightclub: 'Nightclub',
  retro: 'Retrô & Filme',
  color: 'Cor & Tom',
  blur: 'Desfoque',
  stylize: 'Estilo & Arte',
  'bits-bg': 'Luz & Overlays',
}

export const EDITOR_EFFECT_CATEGORY_ORDER: EditorEffectCategory[] = [
  'popular',
  'lens',
  'nightclub',
  'retro',
  'color',
  'blur',
  'stylize',
  'bits-bg',
]

function fx(
  id: string,
  label: string,
  category: EditorEffectCategory,
  description: string,
  cssFilter: string | null,
  ffmpeg: string | null = null,
  extra: Partial<Pick<EditorEffectDef, 'overlay' | 'source'>> = {},
): EditorEffectDef {
  return { id, label, category, description, cssFilter, ffmpeg, overlay: null, source: 'atlas', ...extra }
}

/**
 * Catálogo curado de efeitos profissionais estilo CapCut (sem duplicatas).
 * Preview: PixiJS GPU / CSS filters / overlays · Export: FFmpeg quando mapeado.
 */
export const EDITOR_EFFECTS: EditorEffectDef[] = [
  // —— Populares ——
  fx('glow', 'Glow', 'popular', 'Aura luminosa ao redor das altas luzes', 'brightness(1.16) contrast(1.1) saturate(1.15) drop-shadow(0 0 14px rgba(255,255,255,0.75))', 'gblur=sigma=1.5,eq=brightness=0.08', { source: 'pixi' }),
  fx('bloom', 'Bloom', 'popular', 'Brilho suave nas luzes estouradas', 'brightness(1.1) contrast(1.06) blur(0.4px) saturate(1.12)', 'gblur=sigma=2.2,eq=brightness=0.06:contrast=1.06', { source: 'pixi' }),
  fx('glitch', 'Glitch', 'popular', 'Interferência digital com divisão RGB', 'contrast(1.25) saturate(1.45)', 'rgbashift=rh=7:bh=-7', { source: 'pixi' }),
  fx('rgb-split', 'Aberração RGB', 'popular', 'Separação cromática nas bordas', 'contrast(1.22) saturate(1.4) hue-rotate(-6deg)', 'rgbashift=rh=5:bh=-5', { source: 'pixi' }),
  fx('camera-shake', 'Camera Shake', 'popular', 'Tremor energético de câmera para batidas', 'contrast(1.08) saturate(1.08)', 'crop=iw*0.94:ih*0.94:(iw-ow)/2+sin(t*28)*14:(ih-oh)/2+cos(t*34)*14,scale=iw/0.94:ih/0.94:flags=lanczos', {
    overlay: {
      background: 'radial-gradient(circle at 50% 50%, transparent 65%, rgba(255,255,255,0.08) 100%)',
      opacity: 0.45,
      mixBlendMode: 'screen',
      animation: 'atlas-anim-wobble',
      animationDuration: '0.28s',
    },
  }),
  fx('white-flash', 'Flash Branco', 'popular', 'Clarão rápido para cortes e batidas', 'brightness(1.32) contrast(1.12)', 'eq=brightness=0.22:contrast=1.1', {
    overlay: {
      background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.75), rgba(255,255,255,0.22) 70%, transparent)',
      opacity: 0.55,
      mixBlendMode: 'screen',
      animation: 'atlas-bits-rings',
      animationDuration: '0.6s',
    },
  }),
  fx('old-film', 'Filme Antigo', 'popular', 'Grão analógico, contraste e sépia leve', 'contrast(1.18) saturate(0.68) sepia(0.28)', 'noise=alls=20:allf=t+u,eq=contrast=1.15:saturation=0.7', { source: 'pixi' }),
  fx('vhs', 'VHS', 'popular', 'Fita magnética anos 90 com ruído', 'contrast(1.2) saturate(1.35) brightness(0.92) hue-rotate(-6deg)', 'eq=contrast=1.2:saturation=1.3:brightness=-0.05,noise=alls=12:allf=t'),
  fx('cinematic', 'Cinemático', 'popular', 'Contraste profundo e tom de cinema', 'contrast(1.16) saturate(0.86) brightness(0.96)', 'eq=contrast=1.16:saturation=0.86:brightness=-0.03'),
  fx('vignette-soft', 'Vinheta', 'popular', 'Bordas escuras que focam no centro', 'contrast(1.08) saturate(1.04)', 'vignette=angle=PI/4', {
    overlay: {
      background: 'radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.68) 100%)',
      opacity: 0.9,
      mixBlendMode: 'multiply',
    },
  }),

  // —— Lente & Shake ——
  fx('earthquake', 'Terremoto', 'lens', 'Tremor pesado de impacto no drop', 'contrast(1.15) saturate(1.15)', 'crop=iw*0.9:ih*0.9:(iw-ow)/2+sin(t*42)*24:(ih-oh)/2+cos(t*48)*20,scale=iw/0.9:ih/0.9:flags=lanczos'),
  fx('pixi-motion-blur', 'Motion Blur', 'lens', 'Rastro direcional de movimento rápido', 'blur(2.5px) contrast(1.05) brightness(1.02)', 'gblur=sigma=4', { source: 'pixi' }),
  fx('pixi-radial-blur', 'Radial Blur', 'lens', 'Desfoque radial em direção ao centro', 'blur(2px) brightness(1.04) contrast(1.08)', 'gblur=sigma=3', { source: 'pixi' }),
  fx('zoom-blur', 'Zoom Blur', 'lens', 'Desfoque de impacto com aproximação', 'blur(1.5px) brightness(1.03)', 'zoompan=z=1.04:d=1:s=iwxih,gblur=sigma=2.5', { source: 'pixi' }),
  fx('tilt-shift', 'Tilt-shift', 'lens', 'Foco seletivo estilo miniatura', 'blur(1.2px) contrast(1.08) saturate(1.1)', 'gblur=sigma=5', { source: 'pixi' }),
  fx('shockwave', 'Onda de Choque', 'lens', 'Pulso radial na lente', 'contrast(1.2) brightness(1.06)', null, { source: 'pixi' }),
  fx('pixi-bulge', 'Lente Grande Angular', 'lens', 'Distorção convexa tipo olho de peixe', 'contrast(1.15) saturate(1.1)', null, { source: 'pixi' }),
  fx('twist', 'Torção Espiral', 'lens', 'Redemoinho no centro do quadro', 'contrast(1.15) saturate(1.2)', null, { source: 'pixi' }),
  fx('pixi-reflection', 'Espelho D’água', 'lens', 'Reflexo espelhado na metade inferior', 'contrast(1.2) brightness(1.08) saturate(1.05)', 'eq=contrast=1.15:brightness=0.05', { source: 'pixi' }),
  fx('ripple', 'Ondulação', 'lens', 'Superfície líquida ondulando', 'contrast(1.1) saturate(1.15) brightness(1.03)', null),

  // —— Nightclub & Festa ——
  fx('strobe', 'Estrobo', 'nightclub', 'Flash estroboscópico de alto contraste', 'contrast(1.55) brightness(1.14) saturate(0.95)', 'eq=contrast=1.55:brightness=0.08:saturation=0.95', {
    overlay: {
      background: 'linear-gradient(135deg, rgba(255,255,255,0.45), rgba(56,189,248,0.22), transparent)',
      opacity: 0.6,
      mixBlendMode: 'screen',
      animation: 'atlas-bits-rings',
      animationDuration: '0.45s',
    },
  }),
  fx('party-lights', 'Luzes de Festa', 'nightclub', 'Cores vibrantes alternando na pista', 'saturate(1.65) contrast(1.18) brightness(1.06)', 'eq=saturation=1.65:contrast=1.18:brightness=0.05', {
    overlay: {
      background: 'radial-gradient(circle at 25% 25%, rgba(236,72,153,0.4), transparent 50%), radial-gradient(circle at 75% 75%, rgba(56,189,248,0.4), transparent 50%)',
      opacity: 0.65,
      mixBlendMode: 'screen',
      animation: 'atlas-bits-plasma',
      animationDuration: '2.5s',
    },
  }),
  fx('cyberpunk', 'Cyberpunk', 'nightclub', 'Neon magenta e ciano noturno', 'contrast(1.28) saturate(1.5) hue-rotate(-20deg) brightness(0.96)', 'eq=contrast=1.28:saturation=1.5:brightness=-0.03,hue=h=-20'),
  fx('neon-pink', 'Neon Rosa', 'nightclub', 'Brilho rosa elétrico', 'saturate(1.6) contrast(1.2) hue-rotate(-40deg) brightness(1.05)', 'hue=h=-40,eq=saturation=1.6:contrast=1.2'),
  fx('neon-cyan', 'Neon Ciano', 'nightclub', 'Azul elétrico de palco', 'saturate(1.55) contrast(1.2) hue-rotate(160deg) brightness(1.05)', 'hue=h=160,eq=saturation=1.55:contrast=1.2'),
  fx('club', 'Clube Noturno', 'nightclub', 'Baixa luz com contraste forte', 'brightness(0.88) contrast(1.32) saturate(1.5) hue-rotate(-25deg)', 'eq=brightness=-0.08:contrast=1.32:saturation=1.5,hue=h=-25'),
  fx('rainbow', 'Prisma Arco-íris', 'nightclub', 'Espectro de luz multicolorido', 'saturate(1.75) contrast(1.15) hue-rotate(30deg)', 'eq=saturation=1.75:contrast=1.15,hue=h=30'),
  fx('hologram', 'Holograma', 'nightclub', 'Projeção futurista translúcida', 'saturate(1.3) contrast(1.15) hue-rotate(180deg) brightness(1.1)', 'hue=h=180,eq=saturation=1.3:contrast=1.15:brightness=0.06'),

  // —— Retrô & Filme ——
  fx('film-noir', 'Noir', 'retro', 'Preto e branco dramático de cinema', 'grayscale(1) contrast(1.4) brightness(0.94)', 'hue=s=0,eq=contrast=1.4:brightness=-0.04'),
  fx('blockbuster', 'Blockbuster', 'retro', 'Contraste intenso de trailer de ação', 'contrast(1.25) saturate(1.3) brightness(0.98)', 'eq=contrast=1.25:saturation=1.3:brightness=-0.02'),
  fx('golden-hour', 'Golden Hour', 'retro', 'Luz dourada de pôr do sol', 'sepia(0.3) saturate(1.28) brightness(1.08) contrast(1.05)', 'eq=saturation=1.25:brightness=0.06:contrast=1.05,hue=h=10'),
  fx('anamorphic', 'Anamórfico', 'retro', 'Flare lateral cinematográfico', 'contrast(1.14) saturate(1.12) brightness(1.04) hue-rotate(-4deg)', 'eq=contrast=1.14:saturation=1.12:brightness=0.03', {
    overlay: {
      background: 'linear-gradient(90deg, transparent 0%, rgba(56,189,248,0.22) 50%, transparent 100%)',
      opacity: 0.6,
      mixBlendMode: 'screen',
    },
  }),
  fx('bleach-bypass', 'Bleach Bypass', 'retro', 'Prata metálica dessaturada', 'saturate(0.45) contrast(1.35) brightness(1.02)', 'eq=saturation=0.45:contrast=1.35'),
  fx('polaroid', 'Polaroid', 'retro', 'Instantâneo retrô suave', 'sepia(0.22) contrast(1.1) saturate(1.15) brightness(1.06)', 'eq=contrast=1.1:saturation=1.15:brightness=0.04'),
  fx('super8', 'Super 8', 'retro', 'Película 8mm com grão marcante', 'sepia(0.45) contrast(1.2) saturate(0.9) brightness(1.04)', 'noise=alls=22:allf=t+u,eq=contrast=1.2:saturation=0.9', { source: 'pixi' }),
  fx('crt', 'TV CRT', 'retro', 'Monitor de tubo com scanlines', 'contrast(1.25) saturate(1.35) brightness(0.94)', 'eq=contrast=1.25:saturation=1.3:brightness=-0.04,noise=alls=8:allf=t', { source: 'pixi' }),
  fx('90s-camcorder', 'Filmadora 90', 'retro', 'Vídeo caseiro anos 90', 'saturate(1.25) contrast(1.1) brightness(1.02)', 'eq=saturation=1.25:contrast=1.1,noise=alls=10:allf=t'),
  fx('day-for-night', 'Noite Americana', 'retro', 'Escurece e resfria para simular noite', 'brightness(0.55) saturate(0.6) hue-rotate(200deg) contrast(1.15)', 'eq=brightness=-0.35:saturation=0.6:contrast=1.15,hue=h=200'),

  // —— Cor & Tom ——
  fx('adjustment', 'Ajuste Vivo', 'color', 'Equilíbrio de brilho, contraste e cor', 'brightness(1.06) contrast(1.12) saturate(1.18)', 'eq=brightness=0.06:contrast=1.12:saturation=1.18', { source: 'pixi' }),
  fx('teal-orange', 'Teal & Orange', 'color', 'Grade cinematográfica azul e laranja', 'contrast(1.12) saturate(1.25) hue-rotate(-8deg)', 'eq=contrast=1.12:saturation=1.25,hue=h=-8'),
  fx('vivid', 'Vívido', 'color', 'Cores saturadas e vibrantes', 'saturate(1.55) contrast(1.12)', 'eq=saturation=1.55:contrast=1.12'),
  fx('grayscale', 'Preto & Branco', 'color', 'Escala de cinza limpa', 'grayscale(1)', 'hue=s=0', { source: 'pixi' }),
  fx('warm', 'Quente', 'color', 'Temperatura quente dourada', 'sepia(0.25) saturate(1.2) brightness(1.04)', 'eq=saturation=1.15:gamma_r=1.05:gamma_b=0.92'),
  fx('cool', 'Frio', 'color', 'Temperatura fria azulada', 'hue-rotate(12deg) saturate(1.05) brightness(1.02)', 'hue=h=12,eq=saturation=1.05'),
  fx('pastel', 'Pastel', 'color', 'Tons claros e delicados', 'saturate(0.7) brightness(1.12) contrast(0.9)', 'eq=saturation=0.7:brightness=0.08:contrast=0.9'),
  fx('high-contrast', 'Alto Contraste', 'color', 'Pretos profundos e brancos fortes', 'contrast(1.45) brightness(1.02)', 'eq=contrast=1.45:brightness=0.02'),
  fx('sepia', 'Sépia', 'color', 'Tom sépia clássico', 'sepia(0.85) contrast(1.05)', 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'),
  fx('green-matrix', 'Matrix', 'color', 'Verde digital estilo código', 'hue-rotate(90deg) saturate(1.3) contrast(1.2) brightness(0.95)', 'hue=h=90,eq=saturation=1.3:contrast=1.2:brightness=-0.04'),
  fx('invert', 'Negativo', 'color', 'Cores invertidas', 'invert(1) hue-rotate(180deg)', 'negate'),

  // —— Desfoque ——
  fx('blur', 'Desfoque Suave', 'blur', 'Desfoque limpo para fundo ou transição', 'blur(4px)', 'gblur=sigma=8', { source: 'pixi' }),
  fx('blur-heavy', 'Desfoque Forte', 'blur', 'Fora de foco intenso', 'blur(10px)', 'gblur=sigma=16', { source: 'pixi' }),
  fx('dream', 'Sonho', 'blur', 'Brilho difuso onírico', 'blur(2.5px) brightness(1.1) saturate(1.15)', 'gblur=sigma=4,eq=brightness=0.06:saturation=1.15'),
  fx('mist', 'Névoa', 'blur', 'Véu suave de neblina', 'blur(3px) brightness(1.15) contrast(0.9) saturate(0.85)', 'gblur=sigma=5,eq=brightness=0.1:contrast=0.9:saturation=0.85'),
  fx('frost', 'Vidro Fosco', 'blur', 'Textura fria translúcida', 'blur(3.5px) brightness(1.08) saturate(0.7) contrast(1.1)', 'gblur=sigma=6,eq=brightness=0.05:saturation=0.7:contrast=1.1'),

  // —— Estilo & Arte ——
  fx('pixelate', 'Pixelado', 'stylize', 'Mosaico em blocos retrô', 'contrast(1.2) saturate(0.95)', 'scale=iw/12:ih/12,scale=iw*12:ih*12:flags=neighbor', { source: 'pixi' }),
  fx('comic', 'HQ / Gibi', 'stylize', 'Cores fortes com contorno de quadrinhos', 'contrast(1.5) saturate(1.4) brightness(1.05)', 'eq=contrast=1.5:saturation=1.4:brightness=0.04'),
  fx('sketch', 'Esboço / Lápis', 'stylize', 'Hachura cruzada de desenho', 'grayscale(0.85) contrast(1.55) brightness(1.06)', 'hue=s=0,eq=contrast=1.5:brightness=0.06', { source: 'pixi' }),
  fx('halftone', 'Meio-tom', 'stylize', 'Retícula em pontos de revista', 'contrast(1.38) grayscale(0.45) brightness(1.05)', 'eq=contrast=1.35:saturation=0.5', { source: 'pixi' }),
  fx('emboss', 'Relevo 3D', 'stylize', 'Superfície esculpida em relevo', 'contrast(1.45) grayscale(0.65) brightness(1.08)', 'eq=contrast=1.4:saturation=0.35:brightness=0.05', { source: 'pixi' }),
  fx('pixi-ascii', 'ASCII', 'stylize', 'Renderização em caracteres de terminal', 'contrast(1.35) grayscale(0.85) brightness(1.05)', 'eq=contrast=1.35:saturation=0.2', { source: 'pixi' }),
  fx('pixi-outline', 'Contorno Neon', 'stylize', 'Realça bordas com contorno luminoso', 'contrast(1.2) brightness(1.05) drop-shadow(0 0 2px #fff)', 'eq=contrast=1.15', { source: 'pixi' }),
  fx('sharpen', 'Nitidez HD', 'stylize', 'Reforça detalhes e textura', 'contrast(1.2) saturate(1.05)', 'unsharp=5:5:1.2:5:5:0.0'),
  fx('noise-grain', 'Grão Cinema', 'stylize', 'Textura orgânica de película', 'contrast(1.12) brightness(1.02)', 'noise=alls=18:allf=t+u', { source: 'pixi' }),
  fx('silhouette', 'Silhueta', 'stylize', 'Contraste extremo de sombra', 'brightness(0.35) contrast(1.8) saturate(0)', 'eq=brightness=-0.4:contrast=1.8:saturation=0'),

  // —— Luz & Overlays (React Bits + Godray) ——
  fx('godray', 'Raios de Luz', 'bits-bg', 'Feixes volumétricos vindos do topo', 'brightness(1.08) contrast(1.1)', 'eq=brightness=0.08:contrast=1.1', {
    source: 'pixi',
    overlay: {
      background:
        'conic-gradient(from 210deg at 50% -10%, transparent 0deg, rgba(255,255,255,0.22) 18deg, transparent 36deg, rgba(255,255,255,0.14) 55deg, transparent 80deg, rgba(255,255,255,0.18) 110deg, transparent 140deg)',
      opacity: 0.55,
      mixBlendMode: 'screen',
      animation: 'atlas-bits-rays',
      animationDuration: '14s',
    },
  }),
  fx('bits-aurora', 'Aurora Boreal', 'bits-bg', 'Véu colorido suave no topo', 'brightness(1.04) saturate(1.15)', 'eq=brightness=0.03:saturation=1.1', {
    source: 'react-bits',
    overlay: {
      background:
        'radial-gradient(ellipse 80% 50% at 20% 0%, rgba(56,189,248,0.45), transparent 55%), radial-gradient(ellipse 70% 45% at 80% 10%, rgba(167,139,250,0.4), transparent 50%), radial-gradient(ellipse 60% 40% at 50% 0%, rgba(52,211,153,0.25), transparent 55%)',
      opacity: 0.7,
      mixBlendMode: 'screen',
      animation: 'atlas-bits-aurora',
      animationDuration: '8s',
    },
  }),
  fx('bits-particles', 'Partículas', 'bits-bg', 'Poeira luminosa flutuante', 'contrast(1.05) brightness(1.02)', null, {
    source: 'react-bits',
    overlay: {
      background:
        'radial-gradient(circle at 15% 20%, rgba(255,255,255,0.9) 0 1px, transparent 2px), radial-gradient(circle at 70% 35%, rgba(125,211,252,0.9) 0 1.5px, transparent 3px), radial-gradient(circle at 40% 80%, rgba(244,114,182,0.85) 0 1px, transparent 2px), radial-gradient(circle at 85% 70%, rgba(255,255,255,0.7) 0 1px, transparent 2px), radial-gradient(circle at 55% 15%, rgba(167,243,208,0.8) 0 1px, transparent 2px)',
      backgroundSize: '100% 100%',
      opacity: 0.75,
      mixBlendMode: 'screen',
      animation: 'atlas-bits-particles',
      animationDuration: '12s',
    },
  }),
  fx('bits-silk', 'Seda Luminosa', 'bits-bg', 'Ondas suaves de luz acetinada', 'saturate(1.15) contrast(1.08)', 'eq=saturation=1.1:contrast=1.05', {
    source: 'react-bits',
    overlay: {
      background:
        'repeating-linear-gradient(115deg, transparent 0 18px, rgba(255,255,255,0.06) 18px 20px), linear-gradient(125deg, rgba(244,114,182,0.25), rgba(56,189,248,0.2), rgba(167,139,250,0.28))',
      opacity: 0.65,
      mixBlendMode: 'overlay',
      animation: 'atlas-bits-silk',
      animationDuration: '9s',
    },
  }),
  fx('bits-plasma', 'Plasma', 'bits-bg', 'Manchas de luz colorida em movimento', 'saturate(1.35) contrast(1.12) brightness(1.03)', 'eq=saturation=1.25:contrast=1.1', {
    source: 'react-bits',
    overlay: {
      background:
        'radial-gradient(circle at 30% 40%, rgba(236,72,153,0.45), transparent 45%), radial-gradient(circle at 70% 55%, rgba(59,130,246,0.4), transparent 40%), radial-gradient(circle at 50% 80%, rgba(34,211,238,0.3), transparent 45%)',
      opacity: 0.7,
      mixBlendMode: 'screen',
      animation: 'atlas-bits-plasma',
      animationDuration: '7s',
    },
  }),
  fx('bits-liquid-ether', 'Éter Líquido', 'bits-bg', 'Brilho fluido ciano e violeta', 'saturate(1.3) brightness(1.05)', 'eq=saturation=1.2:brightness=0.03', {
    source: 'react-bits',
    overlay: {
      background:
        'radial-gradient(ellipse at 40% 50%, rgba(45,212,191,0.4), transparent 50%), radial-gradient(ellipse at 65% 45%, rgba(129,140,248,0.35), transparent 45%)',
      opacity: 0.65,
      mixBlendMode: 'screen',
      animation: 'atlas-bits-liquid',
      animationDuration: '8s',
    },
  }),
  fx('bits-dark-veil', 'Véu Escuro', 'bits-bg', 'Foco central com atmosfera dramática', 'brightness(0.92) contrast(1.1)', 'eq=brightness=-0.06:contrast=1.08', {
    source: 'react-bits',
    overlay: {
      background:
        'radial-gradient(ellipse 90% 60% at 50% 40%, rgba(255,255,255,0.18), transparent 60%), radial-gradient(circle at 30% 70%, rgba(99,102,241,0.25), transparent 45%)',
      opacity: 0.85,
      mixBlendMode: 'soft-light',
      animation: 'atlas-bits-veil',
      animationDuration: '10s',
    },
  }),
  fx('bits-magic-rings', 'Anéis Pulsantes', 'bits-bg', 'Ondas circulares luminosas', 'brightness(1.06) contrast(1.1)', null, {
    source: 'react-bits',
    overlay: {
      background:
        'repeating-radial-gradient(circle at 50% 50%, transparent 0 18px, rgba(244,114,182,0.22) 18px 20px, transparent 20px 36px)',
      opacity: 0.5,
      mixBlendMode: 'screen',
      animation: 'atlas-bits-rings',
      animationDuration: '5s',
    },
  }),
]

/** Aliases para manter compatibilidade com timelines salvas anteriormente. */
const LEGACY_EFFECT_ALIASES: Record<string, string> = {
  'pixi-glow': 'glow',
  'soft-glow': 'bloom',
  'pixi-bloom-adv': 'bloom',
  'pixi-glitch': 'glitch',
  'glitch-hard': 'glitch',
  'pixi-rgb': 'rgb-split',
  'pixi-old-film': 'old-film',
  'pixi-crt': 'crt',
  'bits-crt-warp': 'crt',
  'pixi-godray': 'godray',
  'bits-light-rays': 'godray',
  'pixi-pixelate': 'pixelate',
  'pixi-grayscale': 'grayscale',
  'bw-soft': 'grayscale',
  'bw-hard': 'film-noir',
  'pixi-hsl': 'vivid',
  hsl: 'vivid',
  'pixi-adjustment': 'adjustment',
  'blur-soft': 'blur',
  'pixi-kawase': 'blur',
  'pixi-zoom-blur': 'zoom-blur',
  'pixi-tilt': 'tilt-shift',
  'pixi-shockwave': 'shockwave',
  'pixi-twist': 'twist',
  'pixi-dot': 'halftone',
  'pixi-emboss': 'emboss',
  'pixi-crosshatch': 'sketch',
  'pixi-noise': 'noise-grain',
  'mirror-feel': 'pixi-reflection',
  'bits-soft-aurora': 'bits-aurora',
  'bits-prism': 'rainbow',
  'retro-speed': 'cyberpunk',
  '80s-pop': 'neon-pink',
  chrome: 'bleach-bypass',
  bleach: 'bleach-bypass',
  muted: 'pastel',
  'low-contrast': 'pastel',
  amber: 'golden-hour',
  'cyan-wash': 'neon-cyan',
  'magenta-pop': 'neon-pink',
  disco: 'party-lights',
  'confetti-tone': 'party-lights',
  sparkle: 'bloom',
  carnival: 'vivid',
  laser: 'cyberpunk',
  uv: 'club',
  'neon-purple': 'club',
  'neon-lime': 'green-matrix',
  indie: 'cinematic',
  moonlight: 'day-for-night',
  'faded-70s': 'polaroid',
  'faded-photo': 'sepia',
  rust: 'sepia',
  washed: 'pastel',
  forest: 'warm',
  ocean: 'cool',
  desert: 'golden-hour',
  snow: 'cool',
  autumn: 'golden-hour',
  spring: 'vivid',
  foggy: 'mist',
  sunset: 'golden-hour',
  portrait: 'bloom',
  product: 'sharpen',
  news: 'high-contrast',
  documentary: 'cinematic',
  wedding: 'golden-hour',
  posterize: 'comic',
  oil: 'comic',
  watercolor: 'dream',
  'stretch-tone': 'pixi-bulge',
  'kaleido-tone': 'rainbow',
  'wave-tone': 'ripple',
  'pixi-bevel': 'emboss',
  'pixi-color-overlay': 'warm',
  'pixi-drop-shadow': 'vignette-soft',
  'bits-gradient-blinds': 'bits-silk',
  'bits-pixel-blast': 'bits-particles',
  'bits-radar': 'green-matrix',
  'bits-color-bends': 'bits-plasma',
  'bits-floating-lines': 'bits-silk',
}

export function editorEffectById(id: string): EditorEffectDef | undefined {
  const canonical = LEGACY_EFFECT_ALIASES[id] ?? id
  return EDITOR_EFFECTS.find((effect) => effect.id === canonical)
}

export function clipCssFilter(effects: Array<{ id: string; intensity?: number }> | undefined): string {
  if (!effects || effects.length === 0) return ''
  const parts: string[] = []
  for (const item of effects) {
    const def = editorEffectById(item.id)
    if (!def?.cssFilter) continue
    parts.push(def.cssFilter)
  }
  return parts.join(' ')
}

export function clipEffectOverlays(
  effects: Array<{ id: string; intensity?: number }> | undefined,
): EditorEffectOverlay[] {
  if (!effects || effects.length === 0) return []
  const overlays: EditorEffectOverlay[] = []
  for (const item of effects) {
    const def = editorEffectById(item.id)
    if (def?.overlay) overlays.push(def.overlay)
  }
  return overlays
}

export function clipFfmpegEffects(effects: Array<{ id: string; intensity?: number }> | undefined): string[] {
  if (!effects || effects.length === 0) return []
  const parts: string[] = []
  for (const item of effects) {
    const def = editorEffectById(item.id)
    if (!def?.ffmpeg) continue
    parts.push(def.ffmpeg)
  }
  return parts
}
