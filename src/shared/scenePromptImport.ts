import { parseNumberedSceneTexts } from './songLyrics'

export type ImportedScenePrompt = { number: number; text: string }

/**
 * Cabeçalho de cena/corte, com ou sem markdown:
 * CENA 01 | CORTE 08 | SCENE 3 | CUT 12 | ## Corte #04 | **CENA 01**
 */
const SCENE_HEADER_CORE = '(?:CENA|CORTE|SCENE|CUT)'
const SCENE_HEADER_LINE = new RegExp(
  `^(?:#{1,6}\\s*)?(?:\\*{1,2}|_{1,2})?${SCENE_HEADER_CORE}(?:\\*{1,2}|_{1,2})?\\s*#?\\s*(\\d+)\\b`,
  'im',
)
const SCENE_HEADER_GLOBAL = new RegExp(
  `^(?:#{1,6}\\s*)?(?:\\*{1,2}|_{1,2})?${SCENE_HEADER_CORE}(?:\\*{1,2}|_{1,2})?\\s*#?\\s*(\\d+)\\b`,
  'gim',
)

/** ComfyUI / Comfy UI, opcionalmente numerado (2. COMFYUI — …). */
const COMFY_MARKER = /(?:^|\n)\s*(?:\d+\.\s*)?COMFY\s*UI\b/i

/**
 * Animação de banda/instrumental quando o corte não tem bloco ComfyUI.
 * Veo, Kling e Runway continuam só delimitando um bloco Comfy já encontrado.
 */
const FALLBACK_ANIMATION_MARKER =
  /(?:^|\n)\s*(?:\d+\.\s*)?(?:VEO(?:\s*\d+)?|KLING|RUNWAY)\b/i

/** Documento de direção para o LipSync: cena/corte mais Comfy ou Veo/Kling/Runway. */
const LIPSYNC_DIRECTION_MARKER =
  /(?:^|\n)\s*(?:\d+\.\s*)?(?:COMFY\s*UI|VEO(?:\s*\d+)?|KLING|RUNWAY)\b/i

/**
 * FLOW — IMAGEM / FLOW - IMAGE / Google Flow / 1. FLOW — …
 * `\bFLOW\b` sozinho também vale (documentos sem o sufixo IMAGEM).
 */
const FLOW_MARKER =
  /(?:^|\n)\s*(?:\d+\.\s*)?(?:GOOGLE\s+)?FLOW(?:\s*[—–\-:]\s*(?:IMAGEM|IMAGE|PHOTO|FOTO))?\b/i

/**
 * Próxima seção depois do bloco atual (outro motor, próximo corte, separador).
 * VEO / KLING / RUNWAY delimitam o bloco atual. No LipSync eles só entram
 * quando o corte não tem ComfyUI (banda e instrumental). No Flow ficam de fora.
 */
const NEXT_SECTION = new RegExp(
  [
    String.raw`(?:^|\n)\s*(?:\d+\.\s*)?(?:COMFY\s*UI|(?:GOOGLE\s+)?FLOW|VEO(?:\s*\d+)?|KLING|RUNWAY)\b`,
    String.raw`^(?:={3,}|#{2,})\s*$`,
    String.raw`^(?:#{1,6}\s*)?(?:\*{1,2}|_{1,2})?${SCENE_HEADER_CORE}(?:\*{1,2}|_{1,2})?\s*#?\s*\d+\b`,
  ].join('|'),
  'im',
)

const FENCE = /```(?:text)?\s*\n([\s\S]*?)```/

/** Sufixo decorativo na linha do título (— IMAGEM, — ANIMAÇÃO…). */
const TITLE_SUFFIX =
  /^[\s—–\-|:]*((?:IMAGEM|IMAGE|PHOTO|FOTO|ANIMA[CÇ][AÃ]O|LIPSYNC|SINCRONIZA(?:[CÇ][AÃ]O)?|INSTRUMENTAL)(?:[\s\wÀ-ú\-—–|/]*)?)?/i

export function looksLikeDirectionDoc(source: string): boolean {
  const text = source.replace(/\r\n/g, '\n')
  return SCENE_HEADER_LINE.test(text) && LIPSYNC_DIRECTION_MARKER.test(text)
}

export function looksLikeFlowDirectionDoc(source: string): boolean {
  const text = source.replace(/\r\n/g, '\n')
  return SCENE_HEADER_LINE.test(text) && FLOW_MARKER.test(text)
}

function sceneStarts(text: string): Array<{ number: number; index: number }> {
  const starts: Array<{ number: number; index: number }> = []
  for (const match of text.matchAll(SCENE_HEADER_GLOBAL)) {
    if (match.index == null) continue
    const number = Number(match[1])
    if (!Number.isInteger(number) || number < 1) continue
    starts.push({ number, index: match.index })
  }
  return starts
}

function stripTitleSuffix(titleRest: string): string {
  return titleRest.replace(TITLE_SUFFIX, '').replace(/^[\s—–\-|:]+/, '').trim()
}

/**
 * Texto do bloco após o marcador: fence Markdown ou corpo até a próxima seção.
 *
 * O marcador pode capturar o `\n` anterior (`(?:^|\n)`). Por isso avançamos
 * pelo fim do match da keyword e só então tratamos o restante da linha-título.
 */
function contentAfterMarker(sceneBlock: string, marker: RegExp): string {
  const match = marker.exec(sceneBlock)
  if (!match || match.index == null) return ''

  const afterKeyword = sceneBlock.slice(match.index + match[0].length)

  const fenceAfterKeyword = afterKeyword.match(FENCE)
  if (fenceAfterKeyword?.[1]?.trim()) {
    return fenceAfterKeyword[1].replace(/\r\n/g, '\n').trim()
  }

  const titleNl = afterKeyword.indexOf('\n')
  const titleRest = (titleNl < 0 ? afterKeyword : afterKeyword.slice(0, titleNl)).trim()
  const inlinePrompt = stripTitleSuffix(titleRest)

  const body = titleNl < 0 ? '' : afterKeyword.slice(titleNl + 1)
  if (!inlinePrompt && !body.trim()) return ''

  const fenceInBody = body.match(FENCE)
  if (fenceInBody?.[1]?.trim()) {
    const fenced = fenceInBody[1].replace(/\r\n/g, '\n').trim()
    return inlinePrompt ? `${inlinePrompt}\n${fenced}` : fenced
  }

  const end = body.search(NEXT_SECTION)
  const bodyPrompt = (end < 0 ? body : body.slice(0, end)).replace(/\r\n/g, '\n').trim()
  if (inlinePrompt && bodyPrompt) return `${inlinePrompt}\n${bodyPrompt}`
  return inlinePrompt || bodyPrompt
}

function extractPromptsFromDirectionDoc(
  source: string,
  marker: RegExp,
  fallbackMarker?: RegExp,
): ImportedScenePrompt[] {
  const text = source.replace(/\r\n/g, '\n')
  const starts = sceneStarts(text)
  const byNumber = new Map<number, string>()
  starts.forEach((entry, i) => {
    const end = starts[i + 1]?.index ?? text.length
    const block = text.slice(entry.index, end)
    const prompt =
      contentAfterMarker(block, marker) ||
      (fallbackMarker ? contentAfterMarker(block, fallbackMarker) : '')
    if (prompt) byNumber.set(entry.number, prompt)
  })
  return [...byNumber.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([number, promptText]) => ({ number, text: promptText }))
}

/** Recorta só os prompts ComfyUI de um documento de direção por cena/corte. */
export function extractComfyPromptsFromDirectionDoc(source: string): ImportedScenePrompt[] {
  return extractPromptsFromDirectionDoc(source, COMFY_MARKER)
}

/** Recorta só os prompts FLOW — IMAGEM de um documento de direção por cena/corte. */
export function extractFlowPromptsFromDirectionDoc(source: string): ImportedScenePrompt[] {
  return extractPromptsFromDirectionDoc(source, FLOW_MARKER)
}

/**
 * Lista `1- prompt` ou documento de direção.
 * ComfyUI tem prioridade. Corte sem Comfy (banda/instrumental) usa Veo, Kling ou Runway.
 */
export function parseScenePromptsForImport(source: string): ImportedScenePrompt[] {
  if (looksLikeDirectionDoc(source)) {
    return extractPromptsFromDirectionDoc(source, COMFY_MARKER, FALLBACK_ANIMATION_MARKER)
  }
  return parseNumberedSceneTexts(source)
}

/** Lista `1- prompt` ou documento completo de direção (só o bloco FLOW). */
export function parseFlowPromptsForImport(source: string): ImportedScenePrompt[] {
  if (looksLikeFlowDirectionDoc(source)) return extractFlowPromptsFromDirectionDoc(source)
  return parseNumberedSceneTexts(source)
}
