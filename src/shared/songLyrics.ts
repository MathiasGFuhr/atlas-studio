export function excerptFromTextarea(el: {
  value: string
  selectionStart: number | null
  selectionEnd: number | null
}): string {
  const start = el.selectionStart
  const end = el.selectionEnd
  if (start == null || end == null || start === end) return ''
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  return el.value.slice(from, to).replace(/\r\n/g, '\n').trim()
}

export function tidyLyricsRemainder(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')
}

export function removeSelectedRange(value: string, start: number, end: number): string {
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  if (from === to) return tidyLyricsRemainder(value)
  const left = value.slice(0, from).replace(/\n+$/, '')
  const right = value.slice(to).replace(/^\n+/, '')
  return tidyLyricsRemainder([left, right].filter((part) => part.length > 0).join('\n'))
}

/** Lista textos das cenas, numerados na ordem da fila: `1- texto`. */
export function formatNumberedSceneTexts(
  values: string[],
  options?: { includeEmpty?: boolean },
): string {
  return values
    .map((value, index) => {
      const text = value.replace(/\r\n/g, '\n').trim()
      if (!text) return options?.includeEmpty ? `${index + 1}-` : ''
      return `${index + 1}- ${text}`
    })
    .filter((line) => options?.includeEmpty || Boolean(line))
    .join('\n\n')
}

const NUMBERED_SCENE_LINE = /^(\d+)\s*[-.)]\s*(.*)$/

/** Lê `1- texto` e devolve o número da cena com o texto. Cenas vazias ficam de fora. */
export function parseNumberedSceneTexts(source: string): Array<{ number: number; text: string }> {
  const items: Array<{ number: number; lines: string[] }> = []
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    const match = line.match(NUMBERED_SCENE_LINE)
    if (match) {
      items.push({ number: Number(match[1]), lines: [match[2] ?? ''] })
      continue
    }
    const current = items.at(-1)
    if (current) current.lines.push(line)
  }
  const byNumber = new Map<number, string>()
  for (const item of items) {
    if (!Number.isInteger(item.number) || item.number < 1) continue
    const text = item.lines.join('\n').trim()
    if (!text) continue
    byNumber.set(item.number, text)
  }
  return [...byNumber.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([number, text]) => ({ number, text }))
}

/** Se a seleção se perdeu, tira a primeira ocorrência do trecho. */
export function removeExcerptFallback(value: string, excerpt: string): string {
  const needle = excerpt.replace(/\r\n/g, '\n').trim()
  if (!needle) return tidyLyricsRemainder(value)
  const index = value.replace(/\r\n/g, '\n').indexOf(needle)
  if (index < 0) return tidyLyricsRemainder(value)
  return removeSelectedRange(value.replace(/\r\n/g, '\n'), index, index + needle.length)
}
