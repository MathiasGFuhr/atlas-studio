import { parseNumberedSceneTexts } from './songLyrics'

export type ImportedScenePrompt = { number: number; text: string }

const COMFY_MARKER = /(?:^|\n)\s*(?:\d+\.\s*)?COMFY\s*UI\b/i
const FLOW_MARKER = /(?:^|\n)\s*(?:\d+\.\s*)?FLOW\b/i
const FENCE = /```(?:text)?\s*\n([\s\S]*?)```/

export function looksLikeDirectionDoc(source: string): boolean {
  const text = source.replace(/\r\n/g, '\n')
  return /^CENA\s+\d+\b/im.test(text) && COMFY_MARKER.test(text)
}

export function looksLikeFlowDirectionDoc(source: string): boolean {
  const text = source.replace(/\r\n/g, '\n')
  return /^CENA\s+\d+\b/im.test(text) && FLOW_MARKER.test(text)
}

function fenceAfter(block: string, marker: RegExp): string {
  const start = block.search(marker)
  if (start < 0) return ''
  const match = block.slice(start).match(FENCE)
  return match?.[1]?.replace(/\r\n/g, '\n').trim() ?? ''
}

function sceneStarts(text: string): Array<{ number: number; index: number }> {
  const header = /^CENA\s+(\d+)\b/gim
  const starts: Array<{ number: number; index: number }> = []
  for (const match of text.matchAll(header)) {
    if (match.index == null) continue
    const number = Number(match[1])
    if (!Number.isInteger(number) || number < 1) continue
    starts.push({ number, index: match.index })
  }
  return starts
}

function extractPromptsFromDirectionDoc(source: string, marker: RegExp): ImportedScenePrompt[] {
  const text = source.replace(/\r\n/g, '\n')
  const starts = sceneStarts(text)
  const byNumber = new Map<number, string>()
  starts.forEach((entry, i) => {
    const end = starts[i + 1]?.index ?? text.length
    const prompt = fenceAfter(text.slice(entry.index, end), marker)
    if (prompt) byNumber.set(entry.number, prompt)
  })
  return [...byNumber.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([number, text]) => ({ number, text }))
}

/** Recorta só os prompts ComfyUI de um documento de direção por cena. */
export function extractComfyPromptsFromDirectionDoc(source: string): ImportedScenePrompt[] {
  return extractPromptsFromDirectionDoc(source, COMFY_MARKER)
}

/** Recorta só os prompts FLOW — IMAGEM de um documento de direção por cena. */
export function extractFlowPromptsFromDirectionDoc(source: string): ImportedScenePrompt[] {
  return extractPromptsFromDirectionDoc(source, FLOW_MARKER)
}

/** Lista `1- prompt` ou documento completo de direção (só o bloco ComfyUI). */
export function parseScenePromptsForImport(source: string): ImportedScenePrompt[] {
  if (looksLikeDirectionDoc(source)) return extractComfyPromptsFromDirectionDoc(source)
  return parseNumberedSceneTexts(source)
}

/** Lista `1- prompt` ou documento completo de direção (só o bloco FLOW). */
export function parseFlowPromptsForImport(source: string): ImportedScenePrompt[] {
  if (looksLikeFlowDirectionDoc(source)) return extractFlowPromptsFromDirectionDoc(source)
  return parseNumberedSceneTexts(source)
}
