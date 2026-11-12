/**
 * Transições estilo Remotion + gl-transitions.
 * Preview: shaders GLSL do pacote `gl-transitions`.
 * Export: xfade FFmpeg quando houver equivalente.
 */

export type EditorTransitionId = string

export type EditorTransitionCategory =
  | 'remotion'
  | 'classic'
  | 'wipe'
  | 'glitch'
  | 'film'
  | '3d'
  | 'organic'
  | 'stylize'

export type EditorTransitionDef = {
  id: EditorTransitionId
  /** Nome exato no pacote gl-transitions (quando existir). */
  glName: string
  label: string
  description: string
  category: EditorTransitionCategory
  /** Equivalente FFmpeg xfade (quando houver). */
  ffmpegXfade: string | null
  defaultDuration: number
  source?: 'remotion' | 'gl-transitions' | 'atlas'
}

export const EDITOR_TRANSITION_CATEGORY_LABEL: Record<EditorTransitionCategory, string> = {
  remotion: 'Remotion',
  classic: 'Clássicas',
  wipe: 'Wipes',
  glitch: 'Glitch',
  film: 'Filme',
  '3d': '3D',
  organic: 'Orgânicas',
  stylize: 'Estilo',
}

export const EDITOR_TRANSITION_CATEGORY_ORDER: EditorTransitionCategory[] = [
  'remotion',
  'classic',
  'wipe',
  'glitch',
  'film',
  '3d',
  'organic',
  'stylize',
]

function tr(
  id: string,
  glName: string,
  label: string,
  description: string,
  category: EditorTransitionCategory,
  ffmpegXfade: string | null,
  defaultDuration = 0.6,
  source: EditorTransitionDef['source'] = 'gl-transitions',
): EditorTransitionDef {
  return { id, glName, label, description, category, ffmpegXfade, defaultDuration, source }
}

/**
 * Catálogo curado (Remotion-like + gl-transitions).
 * Nomes `glName` batem com o pacote instalado.
 */
export const EDITOR_TRANSITIONS: EditorTransitionDef[] = [
  // —— Remotion-style essentials ——
  tr('fade', 'Fade', 'Fade', 'Dissolução clássica Remotion', 'remotion', 'fade', 0.5, 'remotion'),
  tr('fade-color', 'FadeColor', 'Fade Color', 'Fade com cor sólida', 'remotion', 'fadeblack', 0.55, 'remotion'),
  tr('fade-grayscale', 'FadeGrayscale', 'Fade P&B', 'Dissolve em escala de cinza', 'remotion', 'fadegrays', 0.6, 'remotion'),
  tr('slide-left', 'LeftRight', 'Slide ←', 'Desliza horizontal', 'remotion', 'slideleft', 0.5, 'remotion'),
  tr('slide-up', 'TopBottom', 'Slide ↑', 'Desliza vertical', 'remotion', 'slideup', 0.5, 'remotion'),
  tr('wipe-left', 'ZoomWipeLeft', 'Wipe ←', 'Varre para a esquerda', 'remotion', 'wipeleft', 0.5, 'remotion'),
  tr('wipe-right', 'ZoomWipeRight', 'Wipe →', 'Varre para a direita', 'remotion', 'wiperight', 0.5, 'remotion'),
  tr('wipe-up', 'TopBottom', 'Wipe ↑', 'Varre para cima', 'remotion', 'wipeup', 0.5, 'remotion'),
  tr('wipe-down', 'Directional', 'Wipe ↓', 'Varre para baixo', 'remotion', 'wipedown', 0.5, 'remotion'),
  tr('clock-wipe', 'ClockWipe', 'Clock Wipe', 'Varredura de relógio', 'remotion', 'clockwipe', 0.7, 'remotion'),
  tr('circle-open', 'CircleOpen', 'Circle Open', 'Abre em círculo', 'remotion', 'circleopen', 0.65, 'remotion'),
  tr('circle-iris', 'CircleIris', 'Circle Iris', 'Íris circular', 'remotion', 'circlecrop', 0.65, 'remotion'),
  tr('cross-zoom', 'CrossZoom', 'Cross Zoom', 'Zoom cruzado', 'remotion', null, 0.65, 'remotion'),
  tr('cross-warp', 'CrossWarp', 'Cross Warp', 'Distorção cruzada', 'remotion', null, 0.7, 'remotion'),
  tr('dissolve', 'DitherDissolve', 'Dissolve', 'Mistura granulada', 'remotion', 'dissolve', 0.6, 'remotion'),
  tr('pixelize', 'Pixelize', 'Pixelize', 'Pixeliza na troca', 'remotion', 'pixelize', 0.7, 'remotion'),
  tr('morph', 'morph', 'Morph', 'Morph orgânico', 'remotion', null, 0.7, 'remotion'),
  tr('ripple', 'ripple', 'Ripple', 'Ondulação na troca', 'remotion', null, 0.8, 'remotion'),
  tr('directional', 'Directional', 'Directional', 'Wipe direcional', 'remotion', 'diagtl', 0.55, 'remotion'),
  tr('directional-wipe', 'DirectionalWipe', 'Directional Wipe', 'Varredura direcionada', 'remotion', 'diagtl', 0.55, 'remotion'),
  tr('simple-zoom', 'SimpleZoom', 'Simple Zoom', 'Zoom simples', 'remotion', null, 0.55, 'remotion'),
  tr('dreamy', 'Dreamy', 'Dreamy', 'Sonho suave', 'remotion', null, 0.8, 'remotion'),
  tr('dreamy-zoom', 'DreamyZoom', 'Dreamy Zoom', 'Zoom onírico', 'remotion', null, 0.75, 'remotion'),
  tr('doorway', 'Doorway', 'Doorway', 'Abre como porta', 'remotion', null, 0.7, 'remotion'),
  tr('swap', 'swap', 'Swap', 'Troca em perspectiva', 'remotion', null, 0.6, 'remotion'),
  tr('flyeye', 'FlyEye', 'Flyeye', 'Olho de inseto', 'remotion', null, 0.7, 'remotion'),
  tr('heart', 'HeartWipe', 'Heart', 'Máscara de coração', 'remotion', null, 0.7, 'remotion'),
  tr('cube', 'Cube', 'Cube', 'Cubo 3D', 'remotion', null, 0.75, 'remotion'),
  tr('book-flip', 'BookFlip', 'Book Flip', 'Virar página', 'remotion', null, 0.75, 'remotion'),
  tr('whip-pan', 'WhipPan', 'Whip Pan', 'Pan rápido', 'remotion', null, 0.45, 'remotion'),

  // —— Clássicas ——
  tr('circle-crop', 'CircleBurst', 'Círculo crop', 'Fecha/abre circular', 'classic', 'circlecrop', 0.7),
  tr('polka', 'PolkaDotsCurtain', 'Polka Curtain', 'Cortina de bolinhas', 'classic', null, 0.7),
  tr('wind', 'Wind', 'Wind', 'Vento lateral', 'classic', null, 0.65),
  tr('pinwheel', 'Pinwheel', 'Pinwheel', 'Cata-vento', 'classic', null, 0.7),
  tr('radial-wipe', 'RadialWipe', 'Radial Wipe', 'Wipe radial', 'classic', 'radial', 0.65),
  tr('star-wipe', 'StarWipe', 'Star Wipe', 'Estrela', 'classic', null, 0.7),
  tr('diamond-wipe', 'DiamondWipe', 'Diamond', 'Losango', 'classic', null, 0.65),
  tr('random-squares', 'RandomSquares', 'Random Squares', 'Quadrados aleatórios', 'classic', 'hblur', 0.7),

  // —— Wipes ——
  tr('band-wipe', 'BandWipe', 'Band Wipe', 'Faixas', 'wipe', null, 0.6),
  tr('arrow-wipe', 'ArrowWipe', 'Arrow Wipe', 'Seta', 'wipe', null, 0.6),
  tr('brush-wipe', 'BrushWipe', 'Brush Wipe', 'Pincel', 'wipe', null, 0.65),
  tr('curtain-rise', 'CurtainRise', 'Curtain', 'Cortina sobe', 'wipe', null, 0.7),
  tr('curtains', 'Curtains', 'Curtains', 'Cortinas laterais', 'wipe', null, 0.7),
  tr('horizontal-open', 'HorizontalOpen', 'Open H', 'Abre horizontal', 'wipe', 'horzopen', 0.55),
  tr('vertical-open', 'VerticalOpen', 'Open V', 'Abre vertical', 'wipe', 'vertopen', 0.55),
  tr('luma-wipe', 'LumaWipe', 'Luma Wipe', 'Wipe por luminância', 'wipe', null, 0.65),
  tr('wave-wipe', 'WaveWipe', 'Wave Wipe', 'Onda', 'wipe', null, 0.65),
  tr('gooey-wipe', 'GooeyWipe', 'Gooey', 'Wipe viscoso', 'wipe', null, 0.7),
  tr('flower-wipe', 'FlowerWipe', 'Flower', 'Flor', 'wipe', null, 0.7),
  tr('keyhole-wipe', 'KeyholeWipe', 'Keyhole', 'Fechadura', 'wipe', null, 0.7),

  // —— Glitch / digital ——
  tr('glitch-displace', 'GlitchDisplace', 'Glitch Displace', 'Deslocamento glitch', 'glitch', null, 0.55),
  tr('glitch-bands', 'GlitchBands', 'Glitch Bands', 'Faixas glitch', 'glitch', null, 0.55),
  tr('glitch-flicker', 'GlitchFlicker', 'Glitch Flicker', 'Flicker digital', 'glitch', null, 0.5),
  tr('glitch-memories', 'GlitchMemories', 'Glitch Memories', 'Memória corrompida', 'glitch', null, 0.65),
  tr('tv-static', 'TvStatic', 'TV Static', 'Estática de TV', 'glitch', null, 0.55),
  tr('tv-roll', 'TvRoll', 'TV Roll', 'Rolagem de TV', 'glitch', null, 0.6),
  tr('tv-turn-off', 'TvTurnOff', 'TV Off', 'Desliga CRT', 'glitch', null, 0.6),
  tr('vhs-tracking', 'VhsTracking', 'VHS Tracking', 'Tracking VHS', 'glitch', null, 0.65),
  tr('datamosh', 'StripDatamoshGlitch', 'Datamosh', 'Datamosh strips', 'glitch', null, 0.7),
  tr('code-rain', 'CodeRain', 'Code Rain', 'Chuva de código', 'glitch', null, 0.75),
  tr('hologram', 'Hologram', 'Hologram', 'Holograma', 'glitch', null, 0.7),

  // —— Filme ——
  tr('film-burn', 'FilmBurn', 'Film Burn', 'Queima de película', 'film', null, 0.7),
  tr('film-dissolve', 'FilmDissolve', 'Film Dissolve', 'Dissolve cinematográfico', 'film', 'dissolve', 0.65),
  tr('film-strip', 'FilmStrip', 'Film Strip', 'Tira de filme', 'film', null, 0.7),
  tr('photo-develop', 'PhotoDevelop', 'Photo Develop', 'Revelação', 'film', null, 0.8),
  tr('overexposure', 'Overexposure', 'Overexposure', 'Superexposição', 'film', 'fadewhite', 0.55),
  tr('flash-fade', 'FlashFade', 'Flash Fade', 'Flash branco', 'film', 'fadewhite', 0.45),
  tr('bokeh-dissolve', 'BokehDissolve', 'Bokeh Dissolve', 'Dissolve bokeh', 'film', null, 0.75),
  tr('bloom-dissolve', 'BloomDissolve', 'Bloom Dissolve', 'Dissolve com bloom', 'film', null, 0.7),
  tr('defocus', 'DefocusBlur', 'Defocus', 'Fora de foco', 'film', null, 0.65),

  // —— 3D / movimento ——
  tr('cube-inside', 'InsideCube', 'Inside Cube', 'Cubo interno', '3d', null, 0.75),
  tr('grid-flip', 'GridFlip', 'Grid Flip', 'Grade 3D', '3d', null, 0.7),
  tr('sphere', 'Sphere', 'Sphere', 'Esfera', '3d', null, 0.8),
  tr('tunnel', 'Tunnel', 'Tunnel', 'Túnel', '3d', null, 0.75),
  tr('revolve', 'Revolve', 'Revolve', 'Revolução', '3d', null, 0.7),
  tr('tumble', 'Tumble', 'Tumble', 'Tombo 3D', '3d', null, 0.7),
  tr('simple-flip', 'SimpleFlip', 'Flip', 'Flip simples', '3d', null, 0.55),
  tr('page-curl', 'InvertedPageCurl', 'Page Curl', 'Curva de página', '3d', null, 0.8),
  tr('paper-fold', 'PaperFold', 'Paper Fold', 'Dobra de papel', '3d', null, 0.7),
  tr('rotate-scale', 'RotateScaleFade', 'Rotate Scale', 'Gira e some', '3d', null, 0.65),

  // —— Orgânicas ——
  tr('water-drop', 'WaterDrop', 'Water Drop', 'Gota d’água', 'organic', null, 0.7),
  tr('swirl', 'Swirl', 'Swirl', 'Redemoinho', 'organic', null, 0.7),
  tr('vortex', 'Vortex', 'Vortex', 'Vórtice', 'organic', null, 0.75),
  tr('heat-haze', 'HeatHaze', 'Heat Haze', 'Ondulação de calor', 'organic', null, 0.7),
  tr('ink-bleed', 'InkBleed', 'Ink Bleed', 'Tinta espalhando', 'organic', null, 0.75),
  tr('smoke', 'SmokeDissolve', 'Smoke', 'Fumaça', 'organic', null, 0.75),
  tr('plasma-dissolve', 'PlasmaDissolve', 'Plasma', 'Plasma dissolve', 'organic', null, 0.7),
  tr('perlin', 'PerlinDissolve', 'Perlin', 'Dissolve Perlin', 'organic', null, 0.7),
  tr('liquid-fill', 'LiquidFill', 'Liquid Fill', 'Preenchimento líquido', 'organic', null, 0.75),
  tr('butterfly', 'ButterflyWaveScrawler', 'Butterfly', 'Onda borboleta', 'organic', null, 0.75),

  // —— Estilo ——
  tr('mosaic', 'Mosaic', 'Mosaic', 'Mosaico', 'stylize', null, 0.7),
  tr('kaleidoscope', 'Kaleidoscope', 'Kaleidoscope', 'Caleidoscópio', 'stylize', null, 0.75),
  tr('prisms', 'Prisms', 'Prisms', 'Prismas', 'stylize', null, 0.7),
  tr('halftone', 'Halftone', 'Halftone', 'Meio-tom', 'stylize', null, 0.7),
  tr('ascii', 'Ascii', 'ASCII', 'Transição ASCII', 'stylize', null, 0.7),
  tr('comic-panels', 'ComicPanels', 'Comic Panels', 'Painéis de HQ', 'stylize', null, 0.7),
  tr('led-wall', 'LedWall', 'LED Wall', 'Parede de LED', 'stylize', null, 0.7),
  tr('honeycomb', 'Honeycomb', 'Honeycomb', 'Colmeia', 'stylize', null, 0.7),
  tr('chessboard', 'Chessboard', 'Chessboard', 'Tabuleiro', 'stylize', null, 0.65),
  tr('split-flap', 'SplitFlap', 'Split Flap', 'Painel flip', 'stylize', null, 0.7),
  tr('spotlight', 'SpotlightWipe', 'Spotlight', 'Holofote', 'stylize', null, 0.65),
  tr('lens-flare', 'LensFlare', 'Lens Flare', 'Flare de lente', 'stylize', null, 0.6),
  tr('edge-glow', 'EdgeGlow', 'Edge Glow', 'Brilho nas bordas', 'stylize', null, 0.65),
  tr('zoom-circles', 'ZoomInCircles', 'Zoom Circles', 'Círculos em zoom', 'stylize', null, 0.7),
]

export function editorTransitionById(id: string): EditorTransitionDef | undefined {
  return EDITOR_TRANSITIONS.find((item) => item.id === id)
}

export function editorTransitionsByCategory(category: EditorTransitionCategory): EditorTransitionDef[] {
  return EDITOR_TRANSITIONS.filter((item) => item.category === category)
}
