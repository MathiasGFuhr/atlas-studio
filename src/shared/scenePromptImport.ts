import { parseNumberedSceneTexts } from './songLyrics'

export type ImportedScenePrompt = { number: number; text: string }

/**
 * Cabeçalho de cena/corte, com ou sem markdown:
 * CENA 01 | 1- CENA 01 | CORTE 08 | SCENE 3 | CUT 12 | ## Corte #04 | **CENA 01**
 */
const SCENE_HEADER_CORE = '(?:CENA|CORTE|SCENE|CUT)'
const SCENE_HEADER_PREFIX = '(?:#{1,6}\\s*)?(?:\\d+\\s*[-.)]\\s*)?'
const SCENE_HEADER_LINE = new RegExp(
  `^${SCENE_HEADER_PREFIX}(?:\\*{1,2}|_{1,2})?${SCENE_HEADER_CORE}(?:\\*{1,2}|_{1,2})?\\s*#?\\s*(\\d+)\\b`,
  'im',
)
const SCENE_HEADER_GLOBAL = new RegExp(
  `^${SCENE_HEADER_PREFIX}(?:\\*{1,2}|_{1,2})?${SCENE_HEADER_CORE}(?:\\*{1,2}|_{1,2})?\\s*#?\\s*(\\d+)\\b`,
  'gim',
)

const SECTION_PREFIX = String.raw`(?:#{1,6}\s*)?(?:\*{1,2}|_{1,2})?`

/** ComfyUI / Comfy UI, opcionalmente numerado (2. COMFYUI — …). */
const COMFY_MARKER = new RegExp(
  String.raw`(?:^|\n)\s*${SECTION_PREFIX}(?:\d+\.\s*)?COMFY\s*UI\b`,
  'i',
)

/** Bloco LTX direto quando o documento não escreve COMFYUI (ex.: 2. LTX-2.3 — ANIMAÇÃO). */
const LTX_MARKER = new RegExp(
  String.raw`(?:^|\n)\s*${SECTION_PREFIX}(?:\d+\.\s*)?LTX(?:\s*[-._]?\s*\d+(?:\.\d+)?)?\b`,
  'i',
)

/**
 * Animação de banda/instrumental quando o corte não tem bloco ComfyUI.
 * Veo, Kling e Runway continuam só delimitando um bloco Comfy já encontrado.
 */
const FALLBACK_ANIMATION_MARKER = new RegExp(
  String.raw`(?:^|\n)\s*${SECTION_PREFIX}(?:\d+\.\s*)?(?:VEO(?:\s*\d+(?:\.\d+)?)?|KLING|RUNWAY)\b`,
  'i',
)

/** Documento de direção para o LipSync: cena/corte mais Comfy, LTX ou Veo/Kling/Runway. */
const LIPSYNC_DIRECTION_MARKER = new RegExp(
  String.raw`(?:^|\n)\s*${SECTION_PREFIX}(?:\d+\.\s*)?(?:COMFY\s*UI|LTX(?:\s*[-._]?\s*\d+(?:\.\d+)?)?|VEO(?:\s*\d+(?:\.\d+)?)?|KLING|RUNWAY)\b`,
  'i',
)

/**
 * FLOW — IMAGEM / FLOW - IMAGE / Google Flow / 1. FLOW — …
 * `\bFLOW\b` sozinho também vale (documentos sem o sufixo IMAGEM).
 */
const FLOW_MARKER = new RegExp(
  String.raw`(?:^|\n)\s*${SECTION_PREFIX}(?:\d+\.\s*)?(?:GOOGLE\s+)?FLOW(?:\s*[—–\-:]\s*(?:IMAGEM|IMAGE|PHOTO|FOTO))?\b`,
  'i',
)

/**
 * Próxima seção depois do bloco atual (outro motor, próximo corte, separador).
 * VEO / KLING / RUNWAY delimitam o bloco atual. No LipSync eles só entram
 * quando o corte não tem ComfyUI (banda e instrumental). No Flow ficam de fora.
 */
const NEXT_SECTION = new RegExp(
  [
    String.raw`(?:^|\n)\s*${SECTION_PREFIX}(?:\d+\.\s*)?(?:COMFY\s*UI|LTX(?:\s*[-._]?\s*\d+(?:\.\d+)?)?|(?:GOOGLE\s+)?FLOW|VEO(?:\s*\d+(?:\.\d+)?)?|KLING|RUNWAY)\b`,
    String.raw`^(?:={3,}|#{2,})\s*$`,
    String.raw`^${SCENE_HEADER_PREFIX}(?:\*{1,2}|_{1,2})?${SCENE_HEADER_CORE}(?:\*{1,2}|_{1,2})?\s*#?\s*\d+\b`,
  ].join('|'),
  'im',
)

const FENCE = /```(?:[\w-]*)?\s*\n([\s\S]*?)```/
const LEADING_FENCE = /^\s*```(?:[\w-]*)?\s*\n([\s\S]*?)```/

const SEGMENT_END = String.raw`(?=$|\s*(?:[—–|:/()]|\s-\s))`

const SUBTITLE_MODEL_SEGMENT = new RegExp(
  String.raw`^(?:LTX(?:\s*[-._]?\s*\d+(?:\.\d+)?)?|WAN(?:\s*[-._]?\s*\d+(?:\.\d+)?)?|NANO\s*BANANA(?:\s+PRO)?|IMAGEN(?:\s*\d+)?|COMFY\s*UI|(?:GOOGLE\s+)?FLOW|VEO(?:\s*\d+(?:\.\d+)?)?|KLING(?:\s*\d+(?:\.\d+)?)?|RUNWAY(?:\s*GEN[-\s]?\d+)?|IA2V|I2V|T2V)${SEGMENT_END}`,
  'i',
)

const SUBTITLE_TOPIC_WORDS = String.raw`(?:IMAGEM|IMAGE|PHOTO|FOTO|ANIMA[CÇ][AÃ]O|LIP\s*SYNC|SINCRONIZA(?:[CÇ][AÃ]O)?|INSTRUMENTAL|V[IÍ]DEO|VIDEO|PROMPT)`
const SUBTITLE_TOPIC_CONT = String.raw`(?:DA\s+MESMA\s+IMAGEM|MESMA\s+IMAGEM|DA\s+CENA|INICIAL|DO\s+MESMO\s+ENQUADRAMENTO|E\s+LIP\s*SYNC|E\s+SINCRONIZA[CÇ][AÃ]O(?:\s+PELO\s+[AÁ]UDIO)?|PELO\s+[AÁ]UDIO|SEM\s+CANTO|COM\s+[AÁ]UDIO|SEM\s+[AÁ]UDIO|INSTRUMENTAL|CANTADA|FALADA|COMFY\s*UI|DE\s+LIP\s*SYNC|FLOW|DE\s+ANIMA[CÇ][AÃ]O|DE\s+IMAGEM)`

const SUBTITLE_TOPIC_SEGMENT = new RegExp(
  String.raw`^${SUBTITLE_TOPIC_WORDS}(?:\s+${SUBTITLE_TOPIC_CONT})*${SEGMENT_END}`,
  'i',
)

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

function stripSubtitleSegments(input: string, allowAllCapsTail: boolean): string {
  let rest = input.replace(/^[\s*_—–\-|:]+/, '').trim()
  let strippedAny = false

  while (rest) {
    if (rest.startsWith('(') || rest.startsWith('[')) {
      const closeChar = rest.startsWith('(') ? ')' : ']'
      const closeIdx = rest.indexOf(closeChar)
      if (closeIdx > 0 && stripSubtitleSegments(rest.slice(1, closeIdx), true) === '') {
        rest = rest.slice(closeIdx + 1).replace(/^[\s*_—–\-|:]+/, '').trim()
        strippedAny = true
        continue
      }
    }

    const modelMatch = SUBTITLE_MODEL_SEGMENT.exec(rest)
    if (modelMatch) {
      rest = rest.slice(modelMatch[0].length).replace(/^[\s*_—–\-|:]+/, '').trim()
      strippedAny = true
      continue
    }

    const topicMatch = SUBTITLE_TOPIC_SEGMENT.exec(rest)
    if (topicMatch) {
      rest = rest.slice(topicMatch[0].length).replace(/^[\s*_—–\-|:]+/, '').trim()
      strippedAny = true
      continue
    }

    if (allowAllCapsTail || strippedAny) {
      const sepIdx = rest.search(/(?:[—–|:/]|\s-\s)/)
      const segment = (sepIdx < 0 ? rest : rest.slice(0, sepIdx)).replace(/[\s*_]+$/g, '').trim()
      if (segment && /[A-ZÀ-Ú]/.test(segment) && !/[a-zà-ú]/.test(segment)) {
        rest = (sepIdx < 0 ? '' : rest.slice(sepIdx)).replace(/^[\s*_—–\-|:]+/, '').trim()
        strippedAny = true
        continue
      }
    }

    break
  }

  return rest.trim()
}

function stripTitleSuffix(titleRest: string): string {
  return stripSubtitleSegments(titleRest, true)
}

/** Remove subtítulos decorativos no topo de um bloco de prompt (ex.: `LTX-2.3 — ANIMAÇÃO DA MESMA IMAGEM`). */
export function stripLeadingSubtitleLines(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  while (lines.length > 0) {
    const trimmed = lines[0]?.trim() ?? ''
    if (!trimmed || /^[-_=*•:\s]+$/.test(trimmed)) {
      lines.shift()
      continue
    }
    const candidate = trimmed.replace(/^(?:#{1,6}\s*|[-*•]\s+)/, '').trim()
    const stripped = stripSubtitleSegments(candidate, false)
    if (!stripped) {
      lines.shift()
      continue
    }
    if (stripped !== candidate) {
      lines[0] = stripped
    }
    break
  }
  return lines.join('\n').trim()
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
  const titleNl = afterKeyword.indexOf('\n')
  const titleRest = (titleNl < 0 ? afterKeyword : afterKeyword.slice(0, titleNl)).trim()

  if (/^```/.test(titleRest)) {
    const fence = afterKeyword.match(FENCE)
    return fence?.[1]?.replace(/\r\n/g, '\n').trim() ?? ''
  }

  const inlinePrompt = stripTitleSuffix(titleRest)
  const body = titleNl < 0 ? '' : stripLeadingSubtitleLines(afterKeyword.slice(titleNl + 1))
  if (!inlinePrompt && !body) return ''

  const fenceAtStart = body.match(LEADING_FENCE)
  if (fenceAtStart?.[1]?.trim()) {
    const fenced = fenceAtStart[1].replace(/\r\n/g, '\n').trim()
    return inlinePrompt ? `${inlinePrompt}\n${fenced}` : fenced
  }

  const end = body.search(NEXT_SECTION)
  const sectionBody = (end < 0 ? body : body.slice(0, end)).trim()
  const fenceInSection = sectionBody.match(FENCE)
  if (fenceInSection?.[1]?.trim()) {
    const fenced = fenceInSection[1].replace(/\r\n/g, '\n').trim()
    return inlinePrompt ? `${inlinePrompt}\n${fenced}` : fenced
  }

  if (inlinePrompt && sectionBody) return `${inlinePrompt}\n${sectionBody}`
  return inlinePrompt || sectionBody
}

function extractPromptsFromDirectionDoc(
  source: string,
  markers: RegExp[],
): ImportedScenePrompt[] {
  const text = source.replace(/\r\n/g, '\n')
  const starts = sceneStarts(text)
  const byNumber = new Map<number, string>()
  starts.forEach((entry, i) => {
    const end = starts[i + 1]?.index ?? text.length
    const block = text.slice(entry.index, end)
    let prompt = ''
    for (const marker of markers) {
      prompt = contentAfterMarker(block, marker)
      if (prompt) break
    }
    if (prompt) byNumber.set(entry.number, prompt)
  })
  return [...byNumber.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([number, promptText]) => ({ number, text: promptText }))
}

/** Recorta só os prompts ComfyUI de um documento de direção por cena/corte. */
export function extractComfyPromptsFromDirectionDoc(source: string): ImportedScenePrompt[] {
  return extractPromptsFromDirectionDoc(source, [COMFY_MARKER, LTX_MARKER])
}

/** Recorta só os prompts FLOW — IMAGEM de um documento de direção por cena/corte. */
export function extractFlowPromptsFromDirectionDoc(source: string): ImportedScenePrompt[] {
  return extractPromptsFromDirectionDoc(source, [FLOW_MARKER])
}

/**
 * Lista `1- prompt` ou documento de direção.
 * ComfyUI tem prioridade. Corte sem Comfy (banda/instrumental) usa Veo, Kling ou Runway.
 */
export function parseScenePromptsForImport(source: string): ImportedScenePrompt[] {
  if (looksLikeDirectionDoc(source)) {
    return extractPromptsFromDirectionDoc(source, [
      COMFY_MARKER,
      LTX_MARKER,
      FALLBACK_ANIMATION_MARKER,
    ])
  }
  return parseNumberedSceneTexts(source)
    .map((entry) => ({ number: entry.number, text: stripLeadingSubtitleLines(entry.text) }))
    .filter((entry) => Boolean(entry.text))
}

/** Lista `1- prompt` ou documento completo de direção (só o bloco FLOW). */
export function parseFlowPromptsForImport(source: string): ImportedScenePrompt[] {
  if (looksLikeFlowDirectionDoc(source)) return extractFlowPromptsFromDirectionDoc(source)
  return parseNumberedSceneTexts(source)
}
