import fs from 'node:fs'
import path from 'node:path'
import type { AgentModelSnapshot, AgentProviderId } from '../../../shared/agents/types'

export type CachedProviderEntry = {
  provider: AgentProviderId
  version: string | null
  authFingerprint: string
  snapshot: AgentModelSnapshot
  timestamp: string
}

type CacheFile = {
  providers: Partial<Record<AgentProviderId, CachedProviderEntry>>
}

function emptyFile(): CacheFile {
  return { providers: {} }
}

export class AgentModelCache {
  constructor(private readonly filePath: string) {}

  read(provider: AgentProviderId): CachedProviderEntry | null {
    const file = this.load()
    return file.providers[provider] ?? null
  }

  write(entry: CachedProviderEntry): void {
    const file = this.load()
    file.providers[entry.provider] = entry
    this.save(file)
  }

  invalidate(provider?: AgentProviderId): void {
    if (!provider) {
      this.save(emptyFile())
      return
    }
    const file = this.load()
    delete file.providers[provider]
    this.save(file)
  }

  isFresh(entry: CachedProviderEntry | null, version: string | null, authFingerprint: string): boolean {
    if (!entry) return false
    if ((entry.version || '') !== (version || '')) return false
    if ((entry.authFingerprint || '') !== (authFingerprint || '')) return false
    return true
  }

  private load(): CacheFile {
    try {
      if (!fs.existsSync(this.filePath)) return emptyFile()
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as CacheFile
      if (!raw || typeof raw !== 'object') return emptyFile()
      return { providers: raw.providers && typeof raw.providers === 'object' ? raw.providers : {} }
    } catch {
      return emptyFile()
    }
  }

  private save(file: CacheFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
  }
}
