/**
 * Nome local ao copiar um prompt público. Evita colidir com o que já existe.
 */
export function nextSharedCopyName(name: string, existingNames: string[]): string {
  const taken = new Set(
    existingNames.map((item) => item.trim().toLowerCase()).filter(Boolean),
  )
  const base = name.trim() || 'Prompt'
  if (!taken.has(base.toLowerCase())) return base

  const first = `${base} (cópia)`
  if (!taken.has(first.toLowerCase())) return first

  let index = 2
  let candidate = `${base} (cópia ${index})`
  while (taken.has(candidate.toLowerCase())) {
    index += 1
    candidate = `${base} (cópia ${index})`
  }
  return candidate
}
