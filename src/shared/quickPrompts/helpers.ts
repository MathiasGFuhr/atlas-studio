/** Junta frases sem empilhar parágrafos vazios. */
export function joinSentences(parts: Array<string | undefined | null>): string {
  return parts
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
}

function normalizeConstraint(value: string): string {
  return value
    .trim()
    .replace(/^no\s+/i, '')
    .replace(/\.$/, '')
    .trim()
}

/** Restrições em inglês natural, sem "Avoid: no / no / no". */
export function formatAvoid(items: Array<string | undefined | null>): string {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const item of items) {
    const value = item ? normalizeConstraint(item) : ''
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(value)
  }
  if (unique.length === 0) return ''
  if (unique.length === 1) return `No ${unique[0]}.`
  if (unique.length === 2) return `No ${unique[0]} or ${unique[1]}.`
  const last = unique[unique.length - 1]
  return `No ${unique.slice(0, -1).join(', ')} or ${last}.`
}

export function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}
