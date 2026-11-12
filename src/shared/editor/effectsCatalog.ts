export type EditorEffectCategory =
  | 'popular'
  | 'color'
  | 'blur'
  | 'stylize'
  | 'film'
  | 'vintage'
  | 'neon'
  | 'party'
  | 'nature'
  | 'classic'
  | 'distort'
  | 'pixi'
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
  /** Overlay animado (React Bits backgrounds / véus). */
  overlay?: EditorEffectOverlay | null
  /** Fonte inspiradora. */
  source?: 'pixi' | 'react-bits' | 'atlas'
}

/** Id validado contra o catálogo. */
export type EditorEffectId = string

export const EDITOR_EFFECT_CATEGORY_LABEL: Record<EditorEffectCategory, string> = {
  popular: 'Populares',
  color: 'Cor',
  blur: 'Desfoque',
  stylize: 'Estilo',
  film: 'Filme',
  vintage: 'Vintage',
  neon: 'Neon',
  party: 'Festa',
  nature: 'Natureza',
  classic: 'Clássico',
  distort: 'Distorção',
  pixi: 'PixiJS Filters',
  'bits-bg': 'React Bits BG',
}

export const EDITOR_EFFECT_CATEGORY_ORDER: EditorEffectCategory[] = [
  'popular',
  'pixi',
  'bits-bg',
  'color',
  'blur',
  'stylize',
  'film',
  'vintage',
  'neon',
  'party',
  'nature',
  'classic',
  'distort',
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
 * Catálogo amplo de efeitos (estilo CapCut).
 * Preview: CSS filters · Export: FFmpeg quando mapeado.
 * Efeitos proprietários/3D do CapCut não são clonados; estes são looks reais via filtro.
 */
export const EDITOR_EFFECTS: EditorEffectDef[] = [
  // —— Populares ——
  fx('glow', 'Glow', 'popular', 'Contorno luminoso', 'brightness(1.18) contrast(1.1) saturate(1.15) drop-shadow(0 0 14px rgba(255,255,255,0.75))', 'gblur=sigma=1.5,eq=brightness=0.08'),
  fx('glitch', 'Glitch', 'popular', 'Interferência digital', 'contrast(1.2) saturate(1.4)', 'rgbashift=rh=6:bh=-6'),
  fx('pixelate', 'Pixelado', 'popular', 'Resolução em blocos', 'contrast(1.2) saturate(0.9)', 'scale=iw/12:ih/12,scale=iw*12:ih*12:flags=neighbor'),
  fx('old-film', 'Filme antigo', 'popular', 'Grão e película', 'contrast(1.15) saturate(0.7) sepia(0.25)', 'noise=alls=20:allf=t+u,eq=contrast=1.15:saturation=0.7'),
  fx('rgb-split', 'RGB Split', 'popular', 'Canais de cor separados', 'contrast(1.25) saturate(1.5) hue-rotate(-8deg)', 'rgbashift=rh=4:bh=-4'),
  fx('bloom', 'Bloom', 'popular', 'Brilho nas altas luzes', 'brightness(1.08) contrast(1.05) blur(0.4px)', 'gblur=sigma=2,eq=brightness=0.05:contrast=1.05'),
  fx('vhs', 'VHS', 'popular', 'Fita analógica', 'contrast(1.2) saturate(1.35) brightness(0.92) hue-rotate(-6deg)', 'eq=contrast=1.2:saturation=1.3:brightness=-0.05,noise=alls=12:allf=t'),
  fx('cinematic', 'Cinemático', 'popular', 'Look de cinema', 'contrast(1.15) saturate(0.85) brightness(0.96)', 'eq=contrast=1.15:saturation=0.85:brightness=-0.03'),
  fx('duotone-blue', 'Duotone azul', 'popular', 'Contraste frio em dois tons', 'grayscale(0.85) contrast(1.2) brightness(1.05) sepia(0.35) hue-rotate(180deg) saturate(1.4)', 'hue=s=0,eq=contrast=1.2,colorchannelmixer=rr=0.2:rg=0.3:rb=0.7:gr=0.1:gg=0.4:gb=0.8'),
  fx('soft-glow', 'Brilho suave', 'popular', 'Luz difusa romântica', 'brightness(1.12) contrast(0.95) saturate(1.1) blur(0.6px)', 'gblur=sigma=1.2,eq=brightness=0.06:contrast=0.95'),
  fx('chrome', 'Disco cromado', 'popular', 'Metal espelhado', 'contrast(1.4) saturate(0.4) brightness(1.1)', 'eq=contrast=1.4:saturation=0.4:brightness=0.08'),
  fx('retro-speed', 'Velocidade retrô', 'popular', 'Saturação alta anos 80', 'saturate(1.6) contrast(1.15) hue-rotate(-12deg)', 'eq=saturation=1.6:contrast=1.15,hue=h=-12'),

  // —— Cor ——
  fx('adjustment', 'Ajuste', 'color', 'Brilho, contraste e saturação', 'brightness(1.06) contrast(1.1) saturate(1.15)', 'eq=brightness=0.06:contrast=1.1:saturation=1.15'),
  fx('hsl', 'HSL', 'color', 'Matiz e saturação', 'saturate(1.2) hue-rotate(8deg)', 'hue=s=1.2'),
  fx('grayscale', 'P&B', 'color', 'Escala de cinza', 'grayscale(1)', 'hue=s=0'),
  fx('warm', 'Quente', 'color', 'Tons amarelos e laranja', 'sepia(0.25) saturate(1.2) brightness(1.04)', 'eq=saturation=1.15:gamma_r=1.05:gamma_b=0.92'),
  fx('cool', 'Frio', 'color', 'Tons azuis', 'hue-rotate(12deg) saturate(1.05) brightness(1.02)', 'hue=h=12,eq=saturation=1.05'),
  fx('vivid', 'Vívido', 'color', 'Cores explosivas', 'saturate(1.55) contrast(1.12)', 'eq=saturation=1.55:contrast=1.12'),
  fx('muted', 'Suave', 'color', 'Cores dessaturadas', 'saturate(0.55) contrast(1.05)', 'eq=saturation=0.55:contrast=1.05'),
  fx('high-contrast', 'Alto contraste', 'color', 'Pretos e brancos fortes', 'contrast(1.45) brightness(1.02)', 'eq=contrast=1.45:brightness=0.02'),
  fx('low-contrast', 'Baixo contraste', 'color', 'Imagem achatada', 'contrast(0.75) brightness(1.05)', 'eq=contrast=0.75:brightness=0.04'),
  fx('bleach', 'Bleach', 'color', 'Looks desbotado', 'saturate(0.35) contrast(1.2) brightness(1.08)', 'eq=saturation=0.35:contrast=1.2:brightness=0.06'),
  fx('teal-orange', 'Teal & Orange', 'color', 'Grade hollywoodiana', 'contrast(1.1) saturate(1.2) hue-rotate(-8deg)', 'eq=contrast=1.1:saturation=1.2,hue=h=-8'),
  fx('magenta-pop', 'Magenta pop', 'color', 'Rosa e magenta', 'hue-rotate(-25deg) saturate(1.4) contrast(1.08)', 'hue=h=-25,eq=saturation=1.4:contrast=1.08'),
  fx('green-matrix', 'Matrix', 'color', 'Verde digital', 'hue-rotate(90deg) saturate(1.3) contrast(1.2) brightness(0.95)', 'hue=h=90,eq=saturation=1.3:contrast=1.2:brightness=-0.04'),
  fx('sepia', 'Sépia', 'color', 'Tom sépia clássico', 'sepia(0.85) contrast(1.05)', 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'),
  fx('invert', 'Invertido', 'color', 'Cores invertidas', 'invert(1) hue-rotate(180deg)', 'negate'),
  fx('pastel', 'Pastel', 'color', 'Cores claras e suaves', 'saturate(0.7) brightness(1.12) contrast(0.9)', 'eq=saturation=0.7:brightness=0.08:contrast=0.9'),
  fx('amber', 'Âmbar', 'color', 'Luz dourada', 'sepia(0.4) saturate(1.15) brightness(1.06) contrast(1.05)', 'eq=saturation=1.1:brightness=0.05:contrast=1.05,hue=h=8'),
  fx('cyan-wash', 'Ciano', 'color', 'Lavagem azul-verde', 'hue-rotate(160deg) saturate(0.9) brightness(1.04)', 'hue=h=160,eq=saturation=0.9'),

  // —— Desfoque ——
  fx('blur', 'Desfoque', 'blur', 'Desfoque suave', 'blur(4px)', 'gblur=sigma=8'),
  fx('blur-soft', 'Desfoque leve', 'blur', 'Suavização discreta', 'blur(2px)', 'gblur=sigma=3'),
  fx('blur-heavy', 'Desfoque forte', 'blur', 'Fora de foco intenso', 'blur(10px)', 'gblur=sigma=16'),
  fx('tilt-shift', 'Tilt-shift', 'blur', 'Foco central', 'blur(1.5px) contrast(1.05)', 'gblur=sigma=6'),
  fx('zoom-blur', 'Zoom blur', 'blur', 'Desfoque radial', 'blur(1px) brightness(1.02)', 'zoompan=z=1.04:d=1:s=iwxih,gblur=sigma=2'),
  fx('dream', 'Sonho', 'blur', 'Neblina onírica', 'blur(2.5px) brightness(1.1) saturate(1.15)', 'gblur=sigma=4,eq=brightness=0.06:saturation=1.15'),
  fx('mist', 'Névoa', 'blur', 'Véu esbranquiçado', 'blur(3px) brightness(1.15) contrast(0.9) saturate(0.85)', 'gblur=sigma=5,eq=brightness=0.1:contrast=0.9:saturation=0.85'),
  fx('frost', 'Gelo', 'blur', 'Vidro fosco', 'blur(3.5px) brightness(1.08) saturate(0.7) contrast(1.1)', 'gblur=sigma=6,eq=brightness=0.05:saturation=0.7:contrast=1.1'),

  // —— Estilo ——
  fx('crt', 'CRT', 'stylize', 'TV antiga', 'contrast(1.2) saturate(1.3) brightness(0.95)', 'eq=contrast=1.2:saturation=1.3,noise=alls=8:allf=t'),
  fx('godray', 'Raios de luz', 'stylize', 'Feixes luminosos', 'brightness(1.08) contrast(1.1)', 'eq=brightness=0.08:contrast=1.1'),
  fx('posterize', 'Posterizar', 'stylize', 'Poucos níveis de cor', 'contrast(1.35) saturate(1.2) brightness(1.05)', 'eq=contrast=1.35:saturation=1.2'),
  fx('comic', 'HQ', 'stylize', 'Contornos de gibi', 'contrast(1.5) saturate(1.4) brightness(1.05)', 'eq=contrast=1.5:saturation=1.4:brightness=0.04'),
  fx('sketch', 'Esboço', 'stylize', 'Traço de desenho', 'grayscale(1) contrast(1.6) brightness(1.1)', 'hue=s=0,eq=contrast=1.6:brightness=0.08'),
  fx('oil', 'Óleo', 'stylize', 'Pintura a óleo', 'contrast(1.2) saturate(1.35) brightness(1.04)', 'eq=contrast=1.2:saturation=1.35'),
  fx('watercolor', 'Aquarela', 'stylize', 'Tintas diluídas', 'saturate(1.25) contrast(0.9) brightness(1.08) blur(0.5px)', 'gblur=sigma=1,eq=saturation=1.25:contrast=0.9:brightness=0.05'),
  fx('halftone', 'Meio-tom', 'stylize', 'Pontilhado impresso', 'contrast(1.3) grayscale(0.4) brightness(1.05)', 'eq=contrast=1.3:saturation=0.6'),
  fx('noise-grain', 'Grão', 'stylize', 'Textura de filme', 'contrast(1.1) brightness(1.02)', 'noise=alls=18:allf=t+u'),
  fx('sharpen', 'Nitidez', 'stylize', 'Detalhe reforçado', 'contrast(1.2) saturate(1.05)', 'unsharp=5:5:1.2:5:5:0.0'),
  fx('emboss', 'Relevo', 'stylize', 'Superfície em relevo', 'contrast(1.4) grayscale(0.7) brightness(1.1)', 'eq=contrast=1.4:saturation=0.3:brightness=0.08'),
  fx('silhouette', 'Silhueta', 'stylize', 'Formas escuras', 'brightness(0.35) contrast(1.8) saturate(0)', 'eq=brightness=-0.4:contrast=1.8:saturation=0'),

  // —— Filme ——
  fx('film-noir', 'Noir', 'film', 'Drama em preto e branco', 'grayscale(1) contrast(1.35) brightness(0.95)', 'hue=s=0,eq=contrast=1.35:brightness=-0.04'),
  fx('blockbuster', 'Blockbuster', 'film', 'Trailer de ação', 'contrast(1.25) saturate(1.3) brightness(0.98)', 'eq=contrast=1.25:saturation=1.3:brightness=-0.02'),
  fx('indie', 'Indie', 'film', 'Cinema independente', 'saturate(0.8) contrast(1.08) brightness(1.03)', 'eq=saturation=0.8:contrast=1.08'),
  fx('anamorphic', 'Anamórfico', 'film', 'Flare cinematográfico', 'contrast(1.12) saturate(1.1) brightness(1.04) hue-rotate(-4deg)', 'eq=contrast=1.12:saturation=1.1:brightness=0.03'),
  fx('day-for-night', 'Dia por noite', 'film', 'Simula noite', 'brightness(0.55) saturate(0.6) hue-rotate(200deg) contrast(1.15)', 'eq=brightness=-0.35:saturation=0.6:contrast=1.15,hue=h=200'),
  fx('golden-hour', 'Golden hour', 'film', 'Luz do fim de tarde', 'sepia(0.3) saturate(1.25) brightness(1.08) contrast(1.05)', 'eq=saturation=1.2:brightness=0.06:contrast=1.05,hue=h=10'),
  fx('moonlight', 'Clarão da lua', 'film', 'Noite azulada', 'brightness(0.85) saturate(0.7) hue-rotate(190deg) contrast(1.1)', 'eq=brightness=-0.1:saturation=0.7:contrast=1.1,hue=h=190'),
  fx('bleach-bypass', 'Bleach bypass', 'film', 'Prata metálica', 'saturate(0.45) contrast(1.35) brightness(1.02)', 'eq=saturation=0.45:contrast=1.35'),

  // —— Vintage ——
  fx('polaroid', 'Polaroid', 'vintage', 'Instantâneo anos 70', 'sepia(0.2) contrast(1.1) saturate(1.15) brightness(1.06)', 'eq=contrast=1.1:saturation=1.15:brightness=0.04'),
  fx('faded-70s', 'Anos 70', 'vintage', 'Cores desbotadas', 'sepia(0.35) saturate(0.85) contrast(0.95) brightness(1.05)', 'eq=saturation=0.85:contrast=0.95:brightness=0.04'),
  fx('80s-pop', 'Anos 80', 'vintage', 'Neon retrô', 'saturate(1.5) contrast(1.2) hue-rotate(-15deg)', 'eq=saturation=1.5:contrast=1.2,hue=h=-15'),
  fx('90s-camcorder', 'Filmadora 90', 'vintage', 'Vídeo caseiro', 'saturate(1.25) contrast(1.1) brightness(1.02)', 'eq=saturation=1.25:contrast=1.1,noise=alls=10:allf=t'),
  fx('super8', 'Super 8', 'vintage', 'Película caseira', 'sepia(0.45) contrast(1.2) saturate(0.9) brightness(1.04)', 'noise=alls=22:allf=t+u,eq=contrast=1.2:saturation=0.9'),
  fx('faded-photo', 'Foto antiga', 'vintage', 'Papel amarelado', 'sepia(0.55) contrast(1.05) brightness(1.08) saturate(0.8)', 'eq=saturation=0.8:contrast=1.05:brightness=0.06'),
  fx('rust', 'Ferrugem', 'vintage', 'Tons oxidados', 'sepia(0.5) hue-rotate(-10deg) saturate(1.1) contrast(1.15)', 'eq=contrast=1.15:saturation=1.05,hue=h=-10'),
  fx('washed', 'Lavado', 'vintage', 'Alto key desbotado', 'brightness(1.2) contrast(0.85) saturate(0.65)', 'eq=brightness=0.12:contrast=0.85:saturation=0.65'),

  // —— Neon ——
  fx('neon-pink', 'Neon rosa', 'neon', 'Rosa elétrico', 'saturate(1.6) contrast(1.2) hue-rotate(-40deg) brightness(1.05)', 'hue=h=-40,eq=saturation=1.6:contrast=1.2'),
  fx('neon-cyan', 'Neon ciano', 'neon', 'Azul elétrico', 'saturate(1.55) contrast(1.2) hue-rotate(160deg) brightness(1.05)', 'hue=h=160,eq=saturation=1.55:contrast=1.2'),
  fx('neon-lime', 'Neon lima', 'neon', 'Verde fluorescente', 'saturate(1.7) contrast(1.15) hue-rotate(80deg)', 'hue=h=80,eq=saturation=1.7:contrast=1.15'),
  fx('neon-purple', 'Neon roxo', 'neon', 'Violeta nightclub', 'saturate(1.5) contrast(1.25) hue-rotate(-60deg) brightness(0.98)', 'hue=h=-60,eq=saturation=1.5:contrast=1.25'),
  fx('laser', 'Laser', 'neon', 'Luzes de laser', 'contrast(1.3) saturate(1.8) brightness(1.08)', 'eq=contrast=1.3:saturation=1.8:brightness=0.05'),
  fx('cyberpunk', 'Cyberpunk', 'neon', 'Cidade neon', 'contrast(1.25) saturate(1.45) hue-rotate(-20deg) brightness(0.96)', 'eq=contrast=1.25:saturation=1.45:brightness=-0.03,hue=h=-20'),
  fx('uv', 'UV', 'neon', 'Luz negra', 'brightness(0.9) saturate(1.4) hue-rotate(250deg) contrast(1.2)', 'hue=h=250,eq=brightness=-0.08:saturation=1.4:contrast=1.2'),
  fx('hologram', 'Holograma', 'neon', 'Projeção holográfica', 'saturate(1.3) contrast(1.15) hue-rotate(180deg) brightness(1.1)', 'hue=h=180,eq=saturation=1.3:contrast=1.15:brightness=0.06'),

  // —— Festa ——
  fx('disco', 'Disco', 'party', 'Luzes da pista', 'saturate(1.7) contrast(1.2) hue-rotate(20deg)', 'eq=saturation=1.7:contrast=1.2,hue=h=20'),
  fx('party-lights', 'Luzes de festa', 'party', 'Cores piscantes', 'saturate(1.6) contrast(1.15) brightness(1.08)', 'eq=saturation=1.6:contrast=1.15:brightness=0.05'),
  fx('confetti-tone', 'Confete', 'party', 'Alegria saturada', 'saturate(1.45) contrast(1.1) brightness(1.06) hue-rotate(8deg)', 'eq=saturation=1.45:contrast=1.1:brightness=0.04'),
  fx('sparkle', 'Brilho', 'party', 'Cintilante', 'brightness(1.15) contrast(1.1) saturate(1.2)', 'eq=brightness=0.1:contrast=1.1:saturation=1.2'),
  fx('rainbow', 'Arco-íris', 'party', 'Prismas de cor', 'saturate(1.8) contrast(1.15) hue-rotate(30deg)', 'eq=saturation=1.8:contrast=1.15,hue=h=30'),
  fx('club', 'Clube', 'party', 'Baixa luz + neon', 'brightness(0.88) contrast(1.3) saturate(1.5) hue-rotate(-25deg)', 'eq=brightness=-0.08:contrast=1.3:saturation=1.5,hue=h=-25'),
  fx('carnival', 'Carnaval', 'party', 'Cores quentes intensas', 'saturate(1.65) contrast(1.18) hue-rotate(-5deg) brightness(1.05)', 'eq=saturation=1.65:contrast=1.18:brightness=0.04'),
  fx('strobe', 'Estrobo', 'party', 'Alto contraste flash', 'contrast(1.6) brightness(1.12) saturate(0.9)', 'eq=contrast=1.6:brightness=0.08:saturation=0.9'),

  // —— Natureza ——
  fx('forest', 'Floresta', 'nature', 'Verdes profundos', 'hue-rotate(25deg) saturate(1.25) contrast(1.1) brightness(0.97)', 'hue=h=25,eq=saturation=1.25:contrast=1.1'),
  fx('ocean', 'Oceano', 'nature', 'Azuis profundos', 'hue-rotate(175deg) saturate(1.2) brightness(1.02) contrast(1.08)', 'hue=h=175,eq=saturation=1.2:contrast=1.08'),
  fx('desert', 'Deserto', 'nature', 'Areia e calor', 'sepia(0.35) saturate(1.2) brightness(1.08) contrast(1.1)', 'eq=saturation=1.15:brightness=0.06:contrast=1.1,hue=h=12'),
  fx('snow', 'Neve', 'nature', 'Frio e branco', 'brightness(1.18) contrast(1.05) saturate(0.55)', 'eq=brightness=0.12:contrast=1.05:saturation=0.55'),
  fx('autumn', 'Outono', 'nature', 'Folhas douradas', 'sepia(0.25) hue-rotate(-5deg) saturate(1.3) contrast(1.1)', 'eq=saturation=1.25:contrast=1.1,hue=h=-5'),
  fx('spring', 'Primavera', 'nature', 'Verdes frescos', 'hue-rotate(40deg) saturate(1.2) brightness(1.06) contrast(1.05)', 'hue=h=40,eq=saturation=1.2:brightness=0.04'),
  fx('foggy', 'Neblina', 'nature', 'Manhã úmida', 'blur(1.5px) brightness(1.12) contrast(0.88) saturate(0.75)', 'gblur=sigma=2.5,eq=brightness=0.08:contrast=0.88:saturation=0.75'),
  fx('sunset', 'Pôr do sol', 'nature', 'Laranja e rosa', 'sepia(0.3) saturate(1.4) hue-rotate(-15deg) contrast(1.1)', 'eq=saturation=1.35:contrast=1.1,hue=h=-15'),

  // —— Clássico ——
  fx('bw-soft', 'P&B suave', 'classic', 'Preto e branco suave', 'grayscale(1) contrast(1.05) brightness(1.04)', 'hue=s=0,eq=contrast=1.05:brightness=0.03'),
  fx('bw-hard', 'P&B duro', 'classic', 'Contraste jornal', 'grayscale(1) contrast(1.5) brightness(1.0)', 'hue=s=0,eq=contrast=1.5'),
  fx('vignette-soft', 'Vinheta', 'classic', 'Bordas escuras leves', 'brightness(0.95) contrast(1.08) saturate(1.05)', 'eq=brightness=-0.04:contrast=1.08:saturation=1.05'),
  fx('portrait', 'Retrato', 'classic', 'Pele suave e clara', 'brightness(1.06) contrast(0.95) saturate(1.08)', 'eq=brightness=0.04:contrast=0.95:saturation=1.08'),
  fx('product', 'Produto', 'classic', 'Limpo e nítido', 'contrast(1.15) saturate(1.1) brightness(1.03)', 'eq=contrast=1.15:saturation=1.1:brightness=0.02'),
  fx('news', 'Notícia', 'classic', 'TV jornalística', 'contrast(1.2) saturate(0.95) brightness(1.02)', 'eq=contrast=1.2:saturation=0.95'),
  fx('documentary', 'Documentário', 'classic', 'Natural e sóbrio', 'saturate(0.9) contrast(1.08) brightness(1.01)', 'eq=saturation=0.9:contrast=1.08'),
  fx('wedding', 'Casamento', 'classic', 'Romântico claro', 'brightness(1.1) contrast(0.92) saturate(1.05) sepia(0.08)', 'eq=brightness=0.07:contrast=0.92:saturation=1.05'),

  // —— Distorção ——
  fx('shockwave', 'Onda de choque', 'distort', 'Onda radial', 'contrast(1.2) brightness(1.05)', null),
  fx('twist', 'Torção', 'distort', 'Espiral', 'contrast(1.15) saturate(1.2)', null),
  fx('ripple', 'Ondulação', 'distort', 'Água ondulada', 'contrast(1.1) saturate(1.15) brightness(1.03)', null),
  fx('mirror-feel', 'Espelho', 'distort', 'Reflexo intenso', 'contrast(1.25) brightness(1.08) saturate(1.1)', 'eq=contrast=1.25:brightness=0.05:saturation=1.1'),
  fx('stretch-tone', 'Esticado', 'distort', 'Alongamento visual', 'contrast(1.15) saturate(1.05) brightness(1.02)', 'eq=contrast=1.15'),
  fx('kaleido-tone', 'Caleidoscópio', 'distort', 'Cores fractais', 'saturate(1.6) contrast(1.2) hue-rotate(45deg)', 'eq=saturation=1.6:contrast=1.2,hue=h=45'),
  fx('wave-tone', 'Onda', 'distort', 'Distorção suave', 'contrast(1.12) brightness(1.04) saturate(1.1)', 'eq=contrast=1.12:brightness=0.03'),
  fx('glitch-hard', 'Glitch hard', 'distort', 'Quebra digital forte', 'contrast(1.4) saturate(1.6) hue-rotate(-30deg)', 'rgbashift=rh=10:bh=-10,eq=contrast=1.35:saturation=1.5'),

  // —— PixiJS Filters (GPU preview via pixi-filters) ——
  fx('pixi-ascii', 'ASCII', 'pixi', 'Renderização em caracteres', 'contrast(1.35) grayscale(0.85) brightness(1.05)', 'eq=contrast=1.35:saturation=0.2', { source: 'pixi' }),
  fx('pixi-dot', 'Dot screen', 'pixi', 'Meio-tom em pontos', 'contrast(1.4) grayscale(0.5) brightness(1.05)', 'eq=contrast=1.35:saturation=0.5', { source: 'pixi' }),
  fx('pixi-emboss', 'Emboss', 'pixi', 'Relevo 3D', 'contrast(1.45) grayscale(0.65) brightness(1.08)', 'eq=contrast=1.4:saturation=0.35:brightness=0.05', { source: 'pixi' }),
  fx('pixi-outline', 'Outline', 'pixi', 'Contorno luminoso', 'contrast(1.2) brightness(1.05) drop-shadow(0 0 2px #fff)', 'eq=contrast=1.15', { source: 'pixi' }),
  fx('pixi-bevel', 'Bevel', 'pixi', 'Bisel / chanfro', 'contrast(1.25) brightness(1.06)', 'eq=contrast=1.2:brightness=0.04', { source: 'pixi' }),
  fx('pixi-motion-blur', 'Motion blur', 'pixi', 'Rastro de movimento', 'blur(2.5px) contrast(1.05) brightness(1.02)', 'gblur=sigma=4', { source: 'pixi' }),
  fx('pixi-radial-blur', 'Radial blur', 'pixi', 'Desfoque radial', 'blur(2px) brightness(1.04) contrast(1.08)', 'gblur=sigma=3', { source: 'pixi' }),
  fx('pixi-bulge', 'Bulge / Pinch', 'pixi', 'Lente convexa/côncava', 'contrast(1.15) saturate(1.1)', null, { source: 'pixi' }),
  fx('pixi-reflection', 'Reflection', 'pixi', 'Reflexo espelhado', 'contrast(1.2) brightness(1.08) saturate(1.05)', 'eq=contrast=1.15:brightness=0.05', { source: 'pixi' }),
  fx('pixi-crosshatch', 'Crosshatch', 'pixi', 'Hachura cruzada', 'grayscale(0.8) contrast(1.5) brightness(1.05)', 'hue=s=0,eq=contrast=1.45', { source: 'pixi' }),
  fx('pixi-noise', 'Simplex noise', 'pixi', 'Grão procedural', 'contrast(1.12) brightness(1.02)', 'noise=alls=16:allf=t+u', { source: 'pixi' }),
  fx('pixi-color-overlay', 'Color overlay', 'pixi', 'Véu de cor sólida', 'sepia(0.35) saturate(1.3) hue-rotate(-20deg)', 'colorchannelmixer=rr=0.85:rg=0.15:rb=0.2:aa=0.35', { source: 'pixi' }),
  fx('pixi-drop-shadow', 'Drop shadow', 'pixi', 'Sombra projetada', 'drop-shadow(6px 8px 10px rgba(0,0,0,0.55))', null, { source: 'pixi' }),
  fx('pixi-bloom-adv', 'Advanced bloom', 'pixi', 'Bloom avançado Pixi', 'brightness(1.12) contrast(1.08) blur(0.5px) saturate(1.15)', 'gblur=sigma=2.5,eq=brightness=0.07:contrast=1.08', { source: 'pixi' }),
  fx('pixi-godray', 'Godray', 'pixi', 'Raios volumétricos Pixi', 'brightness(1.1) contrast(1.12) saturate(1.05)', 'eq=brightness=0.08:contrast=1.1', { source: 'pixi' }),
  fx('pixi-crt', 'CRT Pixi', 'pixi', 'Curvatura + scanlines', 'contrast(1.25) saturate(1.35) brightness(0.94)', 'eq=contrast=1.25:saturation=1.3:brightness=-0.04,noise=alls=8:allf=t', { source: 'pixi' }),
  fx('pixi-old-film', 'Old film Pixi', 'pixi', 'Película + vinheta', 'contrast(1.18) saturate(0.65) sepia(0.3)', 'noise=alls=22:allf=t+u,eq=contrast=1.15:saturation=0.65', { source: 'pixi' }),
  fx('pixi-glitch', 'Glitch Pixi', 'pixi', 'Slices RGB Pixi', 'contrast(1.3) saturate(1.5)', 'rgbashift=rh=8:bh=-8', { source: 'pixi' }),
  fx('pixi-rgb', 'RGB Split Pixi', 'pixi', 'Aberração cromática', 'contrast(1.25) saturate(1.45) hue-rotate(-6deg)', 'rgbashift=rh=5:bh=-5', { source: 'pixi' }),
  fx('pixi-twist', 'Twist Pixi', 'pixi', 'Torção espiral', 'contrast(1.15) saturate(1.2)', null, { source: 'pixi' }),
  fx('pixi-shockwave', 'Shockwave Pixi', 'pixi', 'Onda de choque', 'contrast(1.2) brightness(1.06)', null, { source: 'pixi' }),
  fx('pixi-zoom-blur', 'Zoom blur Pixi', 'pixi', 'Desfoque de zoom', 'blur(1.5px) brightness(1.03)', 'gblur=sigma=2.5', { source: 'pixi' }),
  fx('pixi-tilt', 'Tilt-shift Pixi', 'pixi', 'Miniatura / foco', 'blur(1.2px) contrast(1.08) saturate(1.1)', 'gblur=sigma=5', { source: 'pixi' }),
  fx('pixi-pixelate', 'Pixelate Pixi', 'pixi', 'Blocos pixel', 'contrast(1.2)', 'scale=iw/14:ih/14,scale=iw*14:ih*14:flags=neighbor', { source: 'pixi' }),
  fx('pixi-glow', 'Glow Pixi', 'pixi', 'Aura luminosa', 'brightness(1.15) contrast(1.1) drop-shadow(0 0 16px rgba(255,255,255,0.8))', 'gblur=sigma=1.8,eq=brightness=0.08', { source: 'pixi' }),
  fx('pixi-grayscale', 'Grayscale Pixi', 'pixi', 'P&B GPU', 'grayscale(1)', 'hue=s=0', { source: 'pixi' }),
  fx('pixi-hsl', 'HSL Pixi', 'pixi', 'Ajuste HSL GPU', 'saturate(1.25) hue-rotate(12deg)', 'hue=h=12:s=1.2', { source: 'pixi' }),
  fx('pixi-adjustment', 'Adjustment Pixi', 'pixi', 'Brilho/contraste/sat', 'brightness(1.08) contrast(1.12) saturate(1.18)', 'eq=brightness=0.06:contrast=1.12:saturation=1.18', { source: 'pixi' }),
  fx('pixi-kawase', 'Kawase blur', 'pixi', 'Blur performático', 'blur(5px)', 'gblur=sigma=9', { source: 'pixi' }),

  // —— React Bits Backgrounds (overlays animados no preview) ——
  fx('bits-aurora', 'Aurora', 'bits-bg', 'Aurora boreal suave', 'brightness(1.04) saturate(1.15)', 'eq=brightness=0.03:saturation=1.1', {
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
  fx('bits-dark-veil', 'Dark Veil', 'bits-bg', 'Véu de luz no escuro', 'brightness(0.92) contrast(1.1)', 'eq=brightness=-0.06:contrast=1.08', {
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
  fx('bits-particles', 'Particles', 'bits-bg', 'Campo de partículas', 'contrast(1.05) brightness(1.02)', null, {
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
  fx('bits-silk', 'Silk', 'bits-bg', 'Dobras de seda luminosa', 'saturate(1.15) contrast(1.08)', 'eq=saturation=1.1:contrast=1.05', {
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
  fx('bits-plasma', 'Plasma', 'bits-bg', 'Plasma satinado', 'saturate(1.35) contrast(1.12) brightness(1.03)', 'eq=saturation=1.25:contrast=1.1', {
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
  fx('bits-light-rays', 'Light Rays', 'bits-bg', 'Raios volumétricos', 'brightness(1.08) contrast(1.1)', 'eq=brightness=0.05:contrast=1.08', {
    source: 'react-bits',
    overlay: {
      background:
        'conic-gradient(from 210deg at 50% -10%, transparent 0deg, rgba(255,255,255,0.22) 18deg, transparent 36deg, rgba(255,255,255,0.14) 55deg, transparent 80deg, rgba(255,255,255,0.18) 110deg, transparent 140deg)',
      opacity: 0.55,
      mixBlendMode: 'screen',
      animation: 'atlas-bits-rays',
      animationDuration: '14s',
    },
  }),
  fx('bits-gradient-blinds', 'Gradient Blinds', 'bits-bg', 'Persianas em gradiente', 'contrast(1.08) saturate(1.2)', null, {
    source: 'react-bits',
    overlay: {
      background:
        'repeating-linear-gradient(90deg, rgba(99,102,241,0.35) 0 12px, rgba(236,72,153,0.25) 12px 24px, rgba(34,211,238,0.3) 24px 36px)',
      opacity: 0.45,
      mixBlendMode: 'overlay',
      animation: 'atlas-bits-blinds',
      animationDuration: '6s',
    },
  }),
  fx('bits-pixel-blast', 'Pixel Blast', 'bits-bg', 'Nuvem de pixels', 'contrast(1.15) saturate(1.25)', 'noise=alls=10:allf=t', {
    source: 'react-bits',
    overlay: {
      background:
        'repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.15) 0 8deg, transparent 8deg 16deg), radial-gradient(circle at 40% 40%, rgba(250,204,21,0.25), transparent 50%)',
      opacity: 0.5,
      mixBlendMode: 'soft-light',
      animation: 'atlas-bits-pixels',
      animationDuration: '5s',
    },
  }),
  fx('bits-liquid-ether', 'Liquid Ether', 'bits-bg', 'Líquido luminoso', 'saturate(1.3) brightness(1.05)', 'eq=saturation=1.2:brightness=0.03', {
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
  fx('bits-prism', 'Prism', 'bits-bg', 'Prisma espectral', 'saturate(1.5) contrast(1.1) hue-rotate(20deg)', 'eq=saturation=1.4:contrast=1.08,hue=h=15', {
    source: 'react-bits',
    overlay: {
      background:
        'conic-gradient(from 0deg at 50% 50%, #ef4444, #f59e0b, #84cc16, #06b6d4, #8b5cf6, #ec4899, #ef4444)',
      opacity: 0.28,
      mixBlendMode: 'overlay',
      animation: 'atlas-bits-prism',
      animationDuration: '10s',
    },
  }),
  fx('bits-radar', 'Radar', 'bits-bg', 'Varredura radar', 'brightness(0.95) contrast(1.15) hue-rotate(90deg)', 'eq=brightness=-0.04:contrast=1.12,hue=h=90', {
    source: 'react-bits',
    overlay: {
      background:
        'conic-gradient(from 0deg at 50% 50%, rgba(34,197,94,0.35), transparent 40deg, transparent 360deg), repeating-radial-gradient(circle at 50% 50%, transparent 0 28px, rgba(34,197,94,0.12) 28px 30px)',
      opacity: 0.55,
      mixBlendMode: 'screen',
      animation: 'atlas-bits-radar',
      animationDuration: '4s',
    },
  }),
  fx('bits-crt-warp', 'CRT Warp', 'bits-bg', 'Plasma em CRT', 'contrast(1.25) saturate(1.4) brightness(0.92)', 'eq=contrast=1.2:saturation=1.3:brightness=-0.05,noise=alls=6:allf=t', {
    source: 'react-bits',
    overlay: {
      background:
        'repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0 2px, transparent 2px 4px), radial-gradient(ellipse at center, rgba(74,222,128,0.2), transparent 65%)',
      opacity: 0.6,
      mixBlendMode: 'overlay',
      animation: 'atlas-bits-crt',
      animationDuration: '3s',
    },
  }),
  fx('bits-color-bends', 'Color Bends', 'bits-bg', 'Curvas de cor fluidas', 'saturate(1.45) contrast(1.12)', 'eq=saturation=1.35:contrast=1.1', {
    source: 'react-bits',
    overlay: {
      background:
        'linear-gradient(120deg, rgba(244,63,94,0.35), rgba(59,130,246,0.3), rgba(16,185,129,0.3), rgba(245,158,11,0.28))',
      opacity: 0.55,
      mixBlendMode: 'soft-light',
      animation: 'atlas-bits-bends',
      animationDuration: '9s',
    },
  }),
  fx('bits-floating-lines', 'Floating Lines', 'bits-bg', 'Linhas flutuantes', 'contrast(1.08)', null, {
    source: 'react-bits',
    overlay: {
      background:
        'repeating-linear-gradient(100deg, transparent 0 26px, rgba(255,255,255,0.14) 26px 27px), repeating-linear-gradient(80deg, transparent 0 34px, rgba(125,211,252,0.12) 34px 35px)',
      opacity: 0.55,
      mixBlendMode: 'screen',
      animation: 'atlas-bits-lines',
      animationDuration: '11s',
    },
  }),
  fx('bits-soft-aurora', 'Soft Aurora', 'bits-bg', 'Aurora Perlin suave', 'brightness(1.05) saturate(1.2)', 'eq=brightness=0.03:saturation=1.15', {
    source: 'react-bits',
    overlay: {
      background:
        'radial-gradient(ellipse 100% 55% at 10% 0%, rgba(165,243,252,0.4), transparent 55%), radial-gradient(ellipse 90% 50% at 90% 5%, rgba(196,181,253,0.35), transparent 50%)',
      opacity: 0.75,
      mixBlendMode: 'screen',
      animation: 'atlas-bits-aurora',
      animationDuration: '12s',
    },
  }),
  fx('bits-magic-rings', 'Magic Rings', 'bits-bg', 'Anéis pulsantes', 'brightness(1.06) contrast(1.1)', null, {
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

export function editorEffectById(id: string): EditorEffectDef | undefined {
  return EDITOR_EFFECTS.find((effect) => effect.id === id)
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
