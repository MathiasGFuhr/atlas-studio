export type EditorAspect = '9:16' | '16:9' | '1:1'

export const EDITOR_ASPECTS: EditorAspect[] = ['16:9', '9:16', '1:1']

export const EDITOR_DEFAULT_ASPECT: EditorAspect = '16:9'

export const EDITOR_ASPECT_LABEL: Record<EditorAspect, string> = {
  '9:16': 'Vertical 9:16',
  '16:9': 'Horizontal 16:9',
  '1:1': 'Quadrado 1:1',
}

export type EditorAssetKind = 'video' | 'audio' | 'image'

export type EditorAssetOrigin = 'file' | 'lipsync'

/** Pasta `lipsync` no caminho → origem lipsync (mesmo se o import veio pelo diálogo genérico). */
export function inferEditorAssetOrigin(
  filePath: string,
  preferred: EditorAssetOrigin = 'file',
): EditorAssetOrigin {
  if (preferred === 'lipsync') return 'lipsync'
  const normalized = String(filePath ?? '')
    .replace(/\\/g, '/')
    .toLowerCase()
  if (/(^|\/)lipsync(\/|$)/.test(normalized)) return 'lipsync'
  return 'file'
}

export type EditorProxyStatus = 'none' | 'pending' | 'ready' | 'failed'

export type EditorAsset = {
  id: string
  projectId: string
  kind: EditorAssetKind
  origin: EditorAssetOrigin
  name: string
  sourcePath: string
  duration: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
  proxyStatus: EditorProxyStatus
  proxyPath: string | null
  /** Tira horizontal de miniaturas cobrindo a duração inteira da fonte. */
  thumbsPath: string | null
  thumbsCount: number
  thumbsTileWidth: number
  waveformPath: string | null
  /** false quando o arquivo original sumiu do disco. Calculado na leitura. */
  available?: boolean
  /** URLs atlas-media. Calculadas na leitura. */
  url?: string | null
  proxyUrl?: string | null
  thumbsUrl?: string | null
  /** Frame único em alta resolução para cards. */
  coverUrl?: string | null
  createdAt: string
}

export type EditorClipFit = 'contain' | 'cover'

export type EditorClipRole = 'media' | 'effect' | 'text'

export type EditorTextAlign = 'left' | 'center' | 'right'

/** Overrides de tipografia (null/omit = herda do modelo). */
export type EditorTextStyleOverride = {
  fontFamily?: string | null
  /** Tamanho em % da altura do frame (ex.: 6 = 6%). */
  fontSizePercent?: number | null
  fontWeight?: number | string | null
  color?: string | null
  letterSpacing?: string | null
  textTransform?: 'none' | 'uppercase' | 'lowercase' | null
  /** `null` remove sombra do modelo. */
  textShadow?: string | null
}

/** Conteúdo de um clipe de texto (modelo CapCut-like). */
export type EditorTextContent = {
  templateId: string
  title: string
  subtitle: string
  /** Moção tipográfica (React Bits / Remotion Bits / GSAP SplitText). */
  motionId: string | null
  /** Posição X em % do frame; null = modelo. */
  xPercent: number | null
  /** Posição Y em % do frame; null = modelo. */
  yPercent: number | null
  /** Alinhamento; null = modelo. */
  align: EditorTextAlign | null
  /** Estilo do título; null = só modelo. */
  titleStyle: EditorTextStyleOverride | null
  /** Estilo do subtítulo; null = só modelo. */
  subtitleStyle: EditorTextStyleOverride | null
  /** Força placa ligada/desligada; null = modelo. */
  showPlate: boolean | null
}

export type EditorClipEffect = {
  id: string
  /** Intensidade 0.1–2 (1 = padrão). */
  intensity: number
}

/** Animações CapCut-like: entrada / saída / combinação. */
export type EditorClipAnimation = {
  inId: string | null
  outId: string | null
  comboId: string | null
  /** Duração da entrada (s). */
  inDuration: number
  /** Duração da saída (s). */
  outDuration: number
}

export const EDITOR_DEFAULT_CLIP_ANIMATION: EditorClipAnimation = {
  inId: null,
  outId: null,
  comboId: null,
  inDuration: 0.6,
  outDuration: 0.6,
}

export type EditorClip = {
  id: string
  assetId: string
  trackId: string
  /** Posição na timeline (s). */
  start: number
  /** Corte inicial dentro da fonte (s). */
  inPoint: number
  /** Corte final dentro da fonte (s). */
  outPoint: number
  /** Duração da fonte; null para imagens/efeitos (podem esticar à vontade). */
  sourceDuration: number | null
  /** 0..2 (100% = 1). */
  volume: number
  muted: boolean
  fit: EditorClipFit
  /** Escala visual (1 = 100%). */
  scale: number
  /** Opacidade visual (0–1). */
  opacity: number
  /** Fade de entrada em segundos. */
  fadeIn: number
  /** Fade de saída em segundos. */
  fadeOut: number
  /** Efeitos visuais aplicados neste clipe de mídia. */
  effects: EditorClipEffect[]
  /** Animações de entrada/saída/combinação (vídeo/imagem/texto). */
  animation: EditorClipAnimation
  /** `effect` = bloco de efeito; `text` = modelo de texto. */
  role: EditorClipRole
  /** Id do catálogo quando `role === 'effect'`. */
  effectId: string | null
  /** Preenchido quando `role === 'text'`. */
  text: EditorTextContent | null
}

export type EditorTrackKind = 'video' | 'audio' | 'effect' | 'text'

export const EDITOR_DEFAULT_EFFECT_DURATION = 3
export const EDITOR_DEFAULT_TEXT_DURATION = 4

export type EditorTrack = {
  id: string
  kind: EditorTrackKind
  name: string
  muted: boolean
  locked: boolean
  hidden: boolean
}

export type EditorWatermarkCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export const EDITOR_WATERMARK_CORNERS: EditorWatermarkCorner[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]

export const EDITOR_WATERMARK_CORNER_LABEL: Record<EditorWatermarkCorner, string> = {
  'top-left': 'Canto superior esquerdo',
  'top-right': 'Canto superior direito',
  'bottom-left': 'Canto inferior esquerdo',
  'bottom-right': 'Canto inferior direito',
}

export type EditorWatermark = {
  id: string
  assetId: string
  corner: EditorWatermarkCorner
  /** Fração da largura do frame (0.05–0.45). */
  scale: number
  /** 0–1 */
  opacity: number
  /** Margem como fração do menor lado do frame. */
  margin: number
  /** Animação no tempo do projeto (entrada no início, saída no fim). */
  animation: EditorClipAnimation
}

/** Quantas marcas d'água o editor permite ao mesmo tempo. */
export const EDITOR_MAX_WATERMARKS = 2

export const EDITOR_DEFAULT_WATERMARK: Omit<EditorWatermark, 'id' | 'assetId'> = {
  corner: 'top-right',
  scale: 0.18,
  opacity: 0.9,
  /** ~1% do menor lado — bem perto da borda. */
  margin: 0.01,
  animation: { ...EDITOR_DEFAULT_CLIP_ANIMATION },
}

/**
 * `tracks` segue a ordem de exibição (de cima para baixo). Entre faixas de vídeo,
 * a primeira da lista fica por cima na composição.
 */
export type EditorTimeline = {
  aspect: EditorAspect
  fps: number
  tracks: EditorTrack[]
  clips: EditorClip[]
  /** Uma ou mais marcas (máx. `EDITOR_MAX_WATERMARKS`). */
  watermarks: EditorWatermark[]
}

export type EditorProject = {
  id: string
  name: string
  timeline: EditorTimeline
  /** Projeto de música/Lipsync vinculado (vídeos do Comfy caem aqui). */
  musicProjectId: string | null
  /** Faixa cujos cortes guiam a sincronização automática. */
  musicTrackId: string | null
  /** Cantor/canal dono deste projeto de edição. */
  channelId: string | null
  /** Nome do cantor (calculado na leitura). */
  channelName?: string | null
  /** Nome da faixa de música vinculada (sugestão de título). */
  musicName?: string | null
  /** Duração total da timeline. Calculada na leitura. */
  duration: number
  /** Miniatura do primeiro clipe visual. Calculada na leitura. */
  coverUrl?: string | null
  lastExportPath: string | null
  createdAt: string
  updatedAt: string
}

export type EditorProjectPatch = {
  name?: string
  timeline?: EditorTimeline
  musicProjectId?: string | null
  musicTrackId?: string | null
  channelId?: string | null
}

/** Evento quando o Comfy grava um trecho já sincronizado no Editor. */
export type EditorProjectChangedEvent = {
  projectId: string
  reason: 'comfy-ingest'
  sceneNumber: number | null
  message: string
}

/** Lado curto do quadro (ex.: 1080 em 1920×1080). */
export type EditorExportResolution = 720 | 1080 | 1440 | 2160

export const EDITOR_EXPORT_RESOLUTIONS: EditorExportResolution[] = [720, 1080, 1440, 2160]

export const EDITOR_EXPORT_RESOLUTION_LABEL: Record<EditorExportResolution, string> = {
  720: 'HD',
  1080: 'Full HD',
  1440: '2K',
  2160: '4K',
}

export function isEditorExportResolution(value: unknown): value is EditorExportResolution {
  return value === 720 || value === 1080 || value === 1440 || value === 2160
}

export type EditorExportRequest = {
  projectId: string
  resolution: EditorExportResolution
}

export type EditorExportProgress = {
  projectId: string
  stage: 'rendering' | 'done' | 'failed'
  percent: number | null
  message: string
  outputPath?: string | null
}

export type EditorLipsyncVideo = {
  path: string
  name: string
  size: number
  modifiedAt: string
}

export type EditorLipsyncGroup = {
  projectId: string
  projectName: string
  folder: string
  videos: EditorLipsyncVideo[]
}

/** Resultado do alinhamento vídeo↔música pelo mesmo áudio do trecho. */
export type EditorAudioAlignPlacement = {
  assetId: string
  start: number
  /** Duração do trecho na música (ex.: duração do N.mp3) — o clipe deve ser cortado nisso. */
  duration: number
  score: number
  sceneNumber: number | null
  needlePath: string
}

export type EditorAudioAlignResult = {
  placements: EditorAudioAlignPlacement[]
  skipped: Array<{ assetId: string; reason: string }>
  musicAssetId: string
}

export type EditorWaveform = {
  peaksPerSecond: number
  peaks: number[]
}

export const EDITOR_VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi']
export const EDITOR_AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg']
export const EDITOR_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

export const EDITOR_DEFAULT_IMAGE_DURATION = 5

export function editorAssetKindFromPath(filePath: string): EditorAssetKind | null {
  const match = /\.([a-z0-9]+)$/i.exec(filePath.trim())
  const ext = match?.[1]?.toLowerCase()
  if (!ext) return null
  if (EDITOR_VIDEO_EXTENSIONS.includes(ext)) return 'video'
  if (EDITOR_AUDIO_EXTENSIONS.includes(ext)) return 'audio'
  if (EDITOR_IMAGE_EXTENSIONS.includes(ext)) return 'image'
  return null
}

/** Lado longo correspondente a cada resolução (16:9 / 9:16). */
const EDITOR_EXPORT_LONG_SIDE: Record<EditorExportResolution, number> = {
  720: 1280,
  1080: 1920,
  1440: 2560,
  2160: 3840,
}

export function editorOutputSize(
  aspect: EditorAspect,
  resolution: EditorExportResolution,
): { width: number; height: number } {
  const short = resolution
  const long = EDITOR_EXPORT_LONG_SIDE[resolution]
  if (aspect === '9:16') return { width: short, height: long }
  if (aspect === '16:9') return { width: long, height: short }
  return { width: short, height: short }
}

export function aspectRatioValue(aspect: EditorAspect): number {
  if (aspect === '9:16') return 9 / 16
  if (aspect === '16:9') return 16 / 9
  return 1
}

export function formatTimecode(seconds: number, fps = 30): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const totalFrames = Math.floor(safe * fps + 1e-6)
  const frames = totalFrames % fps
  const totalSeconds = Math.floor(totalFrames / fps)
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60) % 60
  const h = Math.floor(totalSeconds / 3600)
  const pad = (value: number) => String(value).padStart(2, '0')
  const base = `${pad(m)}:${pad(s)}:${pad(frames)}`
  return h > 0 ? `${h}:${base}` : base
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
