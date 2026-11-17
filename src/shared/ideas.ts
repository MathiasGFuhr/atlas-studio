export const IDEA_KINDS = ['clipe', 'musica', 'geral'] as const

export type IdeaKind = (typeof IDEA_KINDS)[number]

export type IdeaItem = {
  id: string
  url: string
  note: string
  kind: IdeaKind
  /** Canal do Atlas. `null` quando a ideia ainda não foi vinculada. */
  channelId: string | null
  channelName: string | null
  title: string
  author: string
  thumbDataUrl: string | null
  createdAt: string
}

export function isIdeaKind(value: unknown): value is IdeaKind {
  return value === 'clipe' || value === 'musica' || value === 'geral'
}

/** Tira pontuação colada no fim de um link copiado. */
function tidyUrl(raw: string): string {
  return raw.replace(/[)\].,;]+$/g, '').trim()
}

/**
 * Aceita um link ou vários colados juntos.
 * Sem http, assume https.
 */
export function parseIdeaLinks(raw: string): string[] {
  const source = String(raw || '').trim()
  if (!source) return []
  const found = source.match(/https?:\/\/[^\s<>"']+/gi) || []
  const candidates = found.length > 0 ? found : [source]
  const urls: string[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`
    let parsed: URL
    try {
      parsed = new URL(tidyUrl(withScheme))
    } catch {
      continue
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
    const url = parsed.toString()
    const key = url.replace(/\/$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    urls.push(url)
  }
  return urls
}
