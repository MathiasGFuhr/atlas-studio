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
  /** Código ISO 3166-1 alpha-2 (ou `eu`) para bandeira de fundo. */
  countryCode: string
}

export const DEFAULT_WORLD_CLOCKS: WorldClock[] = [
  { id: 'de', label: 'Alemanha', timeZone: 'Europe/Berlin' },
  { id: 'us', label: 'EUA', timeZone: 'America/New_York' },
  { id: 'ca', label: 'Canadá', timeZone: 'America/Toronto' },
  { id: 'eu', label: 'Europa', timeZone: 'Europe/London' },
]

/** Opções comuns para o usuário adicionar fusos. */
export const WORLD_CLOCK_CATALOG: WorldClockCatalogItem[] = [
  { label: 'Brasil (Brasília)', timeZone: 'America/Sao_Paulo', region: 'América', countryCode: 'br' },
  { label: 'Argentina', timeZone: 'America/Argentina/Buenos_Aires', region: 'América', countryCode: 'ar' },
  { label: 'México', timeZone: 'America/Mexico_City', region: 'América', countryCode: 'mx' },
  { label: 'EUA (Nova York)', timeZone: 'America/New_York', region: 'América', countryCode: 'us' },
  { label: 'EUA (Chicago)', timeZone: 'America/Chicago', region: 'América', countryCode: 'us' },
  { label: 'EUA (Denver)', timeZone: 'America/Denver', region: 'América', countryCode: 'us' },
  { label: 'EUA (Los Angeles)', timeZone: 'America/Los_Angeles', region: 'América', countryCode: 'us' },
  { label: 'Canadá (Toronto)', timeZone: 'America/Toronto', region: 'América', countryCode: 'ca' },
  { label: 'Canadá (Vancouver)', timeZone: 'America/Vancouver', region: 'América', countryCode: 'ca' },
  { label: 'Reino Unido', timeZone: 'Europe/London', region: 'Europa', countryCode: 'gb' },
  { label: 'Portugal', timeZone: 'Europe/Lisbon', region: 'Europa', countryCode: 'pt' },
  { label: 'Alemanha', timeZone: 'Europe/Berlin', region: 'Europa', countryCode: 'de' },
  { label: 'França', timeZone: 'Europe/Paris', region: 'Europa', countryCode: 'fr' },
  { label: 'Espanha', timeZone: 'Europe/Madrid', region: 'Europa', countryCode: 'es' },
  { label: 'Itália', timeZone: 'Europe/Rome', region: 'Europa', countryCode: 'it' },
  { label: 'Europa Central', timeZone: 'Europe/Amsterdam', region: 'Europa', countryCode: 'eu' },
  { label: 'Turquia', timeZone: 'Europe/Istanbul', region: 'Europa', countryCode: 'tr' },
  { label: 'Índia', timeZone: 'Asia/Kolkata', region: 'Ásia', countryCode: 'in' },
  { label: 'Emirados (Dubai)', timeZone: 'Asia/Dubai', region: 'Ásia', countryCode: 'ae' },
  { label: 'Japão', timeZone: 'Asia/Tokyo', region: 'Ásia', countryCode: 'jp' },
  { label: 'Coreia do Sul', timeZone: 'Asia/Seoul', region: 'Ásia', countryCode: 'kr' },
  { label: 'Singapura', timeZone: 'Asia/Singapore', region: 'Ásia', countryCode: 'sg' },
  { label: 'Austrália (Sydney)', timeZone: 'Australia/Sydney', region: 'Oceania', countryCode: 'au' },
  { label: 'Nova Zelândia', timeZone: 'Pacific/Auckland', region: 'Oceania', countryCode: 'nz' },
]

/** Resolve o código de país da bandeira a partir do fuso (e rótulo opcional). */
export function getWorldClockCountryCode(timeZone: string, label?: string): string | null {
  const zone = timeZone.trim()
  if (!zone) return null

  const fromCatalog = WORLD_CLOCK_CATALOG.find((item) => item.timeZone === zone)
  if (fromCatalog) {
    const normalizedLabel = label?.trim().toLowerCase() ?? ''
    // "Europa" genérico usa bandeira da UE em vez da do Reino Unido.
    if (normalizedLabel === 'europa' && zone === 'Europe/London') return 'eu'
    return fromCatalog.countryCode
  }

  return null
}

export function worldClockFlagUrl(countryCode: string): string {
  return `https://flagcdn.com/w640/${countryCode.toLowerCase()}.png`
}

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
