/** Relógio de fuso horário exibido no Início (upload por canal/país). */
export interface WorldClock {
  id: string
  /** Nome amigável (ex.: Alemanha, EUA). */
  label: string
  /** Identificador IANA (ex.: Europe/Berlin). */
  timeZone: string
}

export interface WorldClockCatalogItem {
  label: string
  timeZone: string
  region: string
}

export const DEFAULT_WORLD_CLOCKS: WorldClock[] = [
  { id: 'de', label: 'Alemanha', timeZone: 'Europe/Berlin' },
  { id: 'us', label: 'EUA', timeZone: 'America/New_York' },
  { id: 'ca', label: 'Canadá', timeZone: 'America/Toronto' },
  { id: 'eu', label: 'Europa', timeZone: 'Europe/London' },
]

/** Opções comuns para o usuário adicionar fusos. */
export const WORLD_CLOCK_CATALOG: WorldClockCatalogItem[] = [
  { label: 'Brasil (Brasília)', timeZone: 'America/Sao_Paulo', region: 'América' },
  { label: 'Argentina', timeZone: 'America/Argentina/Buenos_Aires', region: 'América' },
  { label: 'México', timeZone: 'America/Mexico_City', region: 'América' },
  { label: 'EUA (Nova York)', timeZone: 'America/New_York', region: 'América' },
  { label: 'EUA (Chicago)', timeZone: 'America/Chicago', region: 'América' },
  { label: 'EUA (Denver)', timeZone: 'America/Denver', region: 'América' },
  { label: 'EUA (Los Angeles)', timeZone: 'America/Los_Angeles', region: 'América' },
  { label: 'Canadá (Toronto)', timeZone: 'America/Toronto', region: 'América' },
  { label: 'Canadá (Vancouver)', timeZone: 'America/Vancouver', region: 'América' },
  { label: 'Reino Unido', timeZone: 'Europe/London', region: 'Europa' },
  { label: 'Portugal', timeZone: 'Europe/Lisbon', region: 'Europa' },
  { label: 'Alemanha', timeZone: 'Europe/Berlin', region: 'Europa' },
  { label: 'França', timeZone: 'Europe/Paris', region: 'Europa' },
  { label: 'Espanha', timeZone: 'Europe/Madrid', region: 'Europa' },
  { label: 'Itália', timeZone: 'Europe/Rome', region: 'Europa' },
  { label: 'Europa Central', timeZone: 'Europe/Amsterdam', region: 'Europa' },
  { label: 'Turquia', timeZone: 'Europe/Istanbul', region: 'Europa' },
  { label: 'Índia', timeZone: 'Asia/Kolkata', region: 'Ásia' },
  { label: 'Emirados (Dubai)', timeZone: 'Asia/Dubai', region: 'Ásia' },
  { label: 'Japão', timeZone: 'Asia/Tokyo', region: 'Ásia' },
  { label: 'Coreia do Sul', timeZone: 'Asia/Seoul', region: 'Ásia' },
  { label: 'Singapura', timeZone: 'Asia/Singapore', region: 'Ásia' },
  { label: 'Austrália (Sydney)', timeZone: 'Australia/Sydney', region: 'Oceania' },
  { label: 'Nova Zelândia', timeZone: 'Pacific/Auckland', region: 'Oceania' },
]

export function isValidTimeZone(timeZone: string): boolean {
  const value = timeZone.trim()
  if (!value) return false
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function normalizeWorldClocks(value: unknown): WorldClock[] {
  if (!Array.isArray(value)) return DEFAULT_WORLD_CLOCKS.map((clock) => ({ ...clock }))

  const cleaned: WorldClock[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const timeZone = typeof raw.timeZone === 'string' ? raw.timeZone.trim() : ''
    const label = typeof raw.label === 'string' ? raw.label.trim() : ''
    if (!label || !isValidTimeZone(timeZone)) continue

    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : `wc_${timeZone.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`

    if (seen.has(id)) continue
    seen.add(id)
    cleaned.push({ id, label, timeZone })
  }

  return cleaned
}

export function createWorldClock(label: string, timeZone: string): WorldClock | null {
  const trimmedLabel = label.trim()
  const trimmedZone = timeZone.trim()
  if (!trimmedLabel || !isValidTimeZone(trimmedZone)) return null
  const slug = trimmedZone.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()
  return {
    id: `wc_${slug}_${Date.now().toString(36)}`,
    label: trimmedLabel,
    timeZone: trimmedZone,
  }
}

export function formatWorldClockTime(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
}

export function formatWorldClockDay(now: Date, timeZone: string): string {
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(now)
  return formatted.replace(/\.$/, '')
}

export function formatWorldClockOffset(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  }).formatToParts(now)
  const offset = parts.find((part) => part.type === 'timeZoneName')?.value ?? ''
  return offset.replace('GMT', 'UTC')
}

export function worldClockHour(now: Date, timeZone: string): number {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).format(now),
  )
  return Number.isFinite(hour) ? hour % 24 : 0
}

export function isWorldClockDaytime(now: Date, timeZone: string): boolean {
  const hour = worldClockHour(now, timeZone)
  return hour >= 6 && hour < 20
}
