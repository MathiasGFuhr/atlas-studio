export type NamedTarget = {
  id: string
  name: string
  aliases?: string[]
}

export function foldPersonName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function scoreLabel(label: string, needle: string): number {
  const folded = foldPersonName(label)
  if (!folded || !needle) return 0
  if (folded === needle) return 100
  const local = folded.includes('@') ? (folded.split('@')[0] ?? '') : ''
  if (local && local === needle) return 90
  const first = folded.split(' ')[0] ?? ''
  if (first === needle) return 80
  if (folded.startsWith(`${needle} `)) return 70
  const parts = folded.split(' ')
  if (parts.includes(needle)) return 60
  if (needle.length >= 3 && folded.includes(needle)) return 40
  return 0
}

function scoreTarget(target: NamedTarget, needle: string): number {
  const labels = [target.name, ...(target.aliases ?? [])]
  return labels.reduce((best, label) => Math.max(best, scoreLabel(label, needle)), 0)
}

function emptyTargetMessage(kind: string): string {
  if (kind === 'pessoa') return 'Informe o nome da pessoa.'
  if (kind === 'conversa') return 'Informe o nome da conversa.'
  return `Informe o nome do ${kind}.`
}

function missingTargetMessage(kind: string, query: string): string {
  if (kind === 'pessoa') return `Não encontrei ninguém com o nome "${query}".`
  if (kind === 'conversa') return `Não encontrei nenhuma conversa com o nome "${query}".`
  return `Não encontrei ${kind} com o nome "${query}".`
}

function tieTargetMessage(kind: string, query: string, names: string): string {
  if (kind === 'pessoa') {
    return `Há mais de uma pessoa parecida com "${query}": ${names}. Peça para escolher o nome completo.`
  }
  if (kind === 'conversa') {
    return `Há mais de uma conversa parecida com "${query}": ${names}. Peça para escolher o nome completo.`
  }
  return `Há mais de um ${kind} parecido com "${query}": ${names}. Peça para escolher o nome completo.`
}

/** Escolhe um item pelo nome, aceitando primeiro nome, e-mail e acento. */
export function matchNamedTarget<T extends NamedTarget>(
  items: T[],
  query: string,
  kind: string,
): T {
  const needle = foldPersonName(query)
  if (!needle) {
    throw new Error(emptyTargetMessage(kind))
  }

  const ranked = items
    .map((item) => ({ item, score: scoreTarget(item, needle) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'pt-BR'))

  const best = ranked[0]
  const label = query.trim()
  if (!best) {
    throw new Error(missingTargetMessage(kind, label))
  }

  const ties = ranked.filter((entry) => entry.score === best.score)
  if (ties.length > 1) {
    const names = ties
      .slice(0, 6)
      .map((entry) => entry.item.name)
      .join(', ')
    throw new Error(tieTargetMessage(kind, label, names))
  }

  return best.item
}

export function teamChatPath(roomId: string): string {
  return `/equipe?sala=${encodeURIComponent(roomId)}`
}
