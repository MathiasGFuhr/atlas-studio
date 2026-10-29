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

/** Se a seleção se perdeu, tira a primeira ocorrência do trecho. */
export function removeExcerptFallback(value: string, excerpt: string): string {
  const needle = excerpt.replace(/\r\n/g, '\n').trim()
  if (!needle) return tidyLyricsRemainder(value)
  const index = value.replace(/\r\n/g, '\n').indexOf(needle)
  if (index < 0) return tidyLyricsRemainder(value)
  return removeSelectedRange(value.replace(/\r\n/g, '\n'), index, index + needle.length)
}
