export function extractJsonValue(text: string): unknown | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    /* try to extract an embedded payload */
  }

  const firstObj = trimmed.indexOf('{')
  const firstArr = trimmed.indexOf('[')
  const startCandidates = [firstObj, firstArr].filter((index) => index >= 0)
  if (startCandidates.length === 0) return null
  const start = Math.min(...startCandidates)
  const opener = trimmed[start]
  const closer = opener === '{' ? '}' : ']'
  const end = trimmed.lastIndexOf(closer)
  if (end <= start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}
