import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startThat = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / 86400000)

  if (diffDays === 0) {
    return `Hoje, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }
  if (diffDays === 1) return 'Ontem'
  if (diffDays < 7) return `${diffDays} dias atrás`
  return date.toLocaleDateString('pt-BR')
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'pronto':
      return 'Pronto'
    case 'em_revisao':
      return 'Em revisão'
    case 'rascunho':
      return 'Rascunho'
    case 'erro':
      return 'Erro'
    case 'colocando':
      return 'Colocando'
    case 'editando':
      return 'Editando'
    case 'agendando':
      return 'Agendando'
    case 'publicado':
      return 'Publicado'
    default:
      return status
  }
}
