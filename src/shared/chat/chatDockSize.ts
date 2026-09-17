/** Tamanho padrão do painel flutuante de Chat (antes do resize do usuário). */
export const CHAT_DOCK_DEFAULT_WIDTH = 540
export const CHAT_DOCK_DEFAULT_HEIGHT = 720

export const CHAT_DOCK_MIN_WIDTH = 380
export const CHAT_DOCK_MAX_WIDTH = 900
export const CHAT_DOCK_MIN_HEIGHT = 420

/** Margem horizontal do dock (`right-5` + folga à esquerda ≈ 2.5rem). */
export const CHAT_DOCK_HORIZONTAL_MARGIN = 40
/** Margem vertical do dock (FAB `bottom-20` + folga no topo ≈ 7.5rem). */
export const CHAT_DOCK_VERTICAL_MARGIN = 120

const VIEWPORT_WIDTH_RATIO = 0.8
const VIEWPORT_HEIGHT_RATIO = 0.9

export type ChatDockSize = {
  width: number
  height: number
}

export type ViewportSize = {
  width: number
  height: number
}

export function chatDockMaxWidth(viewportWidth: number): number {
  return Math.max(
    1,
    Math.min(
      CHAT_DOCK_MAX_WIDTH,
      Math.floor(viewportWidth * VIEWPORT_WIDTH_RATIO),
      viewportWidth - CHAT_DOCK_HORIZONTAL_MARGIN,
    ),
  )
}

export function chatDockMaxHeight(viewportHeight: number): number {
  return Math.max(
    1,
    Math.min(Math.floor(viewportHeight * VIEWPORT_HEIGHT_RATIO), viewportHeight - CHAT_DOCK_VERTICAL_MARGIN),
  )
}

export function clampChatDockSize(width: number, height: number, viewport: ViewportSize): ChatDockSize {
  const maxWidth = chatDockMaxWidth(viewport.width)
  const maxHeight = chatDockMaxHeight(viewport.height)
  const minWidth = Math.min(CHAT_DOCK_MIN_WIDTH, maxWidth)
  const minHeight = Math.min(CHAT_DOCK_MIN_HEIGHT, maxHeight)

  return {
    width: Math.round(Math.min(maxWidth, Math.max(minWidth, width))),
    height: Math.round(Math.min(maxHeight, Math.max(minHeight, height))),
  }
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function normalizeChatDockSize(
  width: unknown,
  height: unknown,
  viewport: ViewportSize,
): ChatDockSize {
  return clampChatDockSize(
    finiteNumber(width, CHAT_DOCK_DEFAULT_WIDTH),
    finiteNumber(height, CHAT_DOCK_DEFAULT_HEIGHT),
    viewport,
  )
}
