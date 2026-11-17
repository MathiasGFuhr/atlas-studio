import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { isIdeaKind, type IdeaItem, type IdeaKind } from '../../../shared/ideas'

function ideasFile(): string {
  return path.join(app.getPath('userData'), 'ideas.json')
}

function readAll(): IdeaItem[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(ideasFile(), 'utf8')) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const row = item as IdeaItem
      if (typeof row.id !== 'string' || typeof row.url !== 'string' || !isIdeaKind(row.kind)) return []
      const channelId = typeof row.channelId === 'string' && row.channelId.trim() ? row.channelId.trim() : null
      const channelName =
        channelId && typeof row.channelName === 'string' && row.channelName.trim()
          ? row.channelName.trim()
          : null
      return [{ ...row, channelId, channelName }]
    })
  } catch {
    return []
  }
}

function writeAll(items: IdeaItem[]): void {
  const file = ideasFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(items, null, 2), 'utf8')
}

async function lookupVideo(url: string): Promise<{ title: string; author: string; thumb: string | null }> {
  const endpoints = [
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
  ]
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) })
      if (!response.ok) continue
      const data = (await response.json()) as {
        title?: string
        author_name?: string
        thumbnail_url?: string
      }
      return {
        title: String(data.title || '').trim(),
        author: String(data.author_name || '').trim(),
        thumb: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null,
      }
    } catch {
      /* tenta o próximo provedor */
    }
  }
  return { title: '', author: '', thumb: null }
}

async function thumbnailDataUrl(thumbUrl: string | null): Promise<string | null> {
  if (!thumbUrl || !/^https:\/\//i.test(thumbUrl)) return null
  try {
    const response = await fetch(thumbUrl, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    const type = String(response.headers.get('content-type') || '')
    if (!type.startsWith('image/')) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length < 32 || bytes.length > 500_000) return null
    return `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

export const ideaStore = {
  list(): IdeaItem[] {
    return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async add(input: {
    url: string
    note?: string
    kind?: IdeaKind
    channelId?: string | null
    channelName?: string | null
  }): Promise<IdeaItem> {
    const url = String(input.url || '').trim()
    const meta = await lookupVideo(url)
    let host = url
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      /* mantém a url */
    }
    const channelId = String(input.channelId || '').trim() || null
    const item: IdeaItem = {
      id: randomUUID(),
      url,
      note: String(input.note || '').trim().slice(0, 500),
      kind: isIdeaKind(input.kind) ? input.kind : 'geral',
      channelId,
      channelName: channelId ? String(input.channelName || '').trim() || null : null,
      title: meta.title || host,
      author: meta.author,
      thumbDataUrl: await thumbnailDataUrl(meta.thumb),
      createdAt: new Date().toISOString(),
    }
    const items = readAll()
    items.push(item)
    writeAll(items)
    return item
  },

  update(
    id: string,
    patch: { note?: string; kind?: IdeaKind; channelId?: string | null; channelName?: string | null },
  ): IdeaItem | null {
    const items = readAll()
    const index = items.findIndex((item) => item.id === id)
    if (index < 0) return null
    const current = items[index]
    const channelId =
      patch.channelId === undefined ? current.channelId : String(patch.channelId || '').trim() || null
    const next: IdeaItem = {
      ...current,
      note: patch.note === undefined ? current.note : String(patch.note).trim().slice(0, 500),
      kind: patch.kind === undefined ? current.kind : isIdeaKind(patch.kind) ? patch.kind : current.kind,
      channelId,
      channelName:
        patch.channelId === undefined
          ? current.channelName
          : channelId
            ? String(patch.channelName || '').trim() || null
            : null,
    }
    items[index] = next
    writeAll(items)
    return next
  },

  remove(id: string): boolean {
    const items = readAll()
    const next = items.filter((item) => item.id !== id)
    if (next.length === items.length) return false
    writeAll(next)
    return true
  },
}
