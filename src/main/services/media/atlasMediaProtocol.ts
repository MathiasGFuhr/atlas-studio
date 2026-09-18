import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { parseByteRange } from '../../../shared/mediaRange'
import { shortsRepository } from '../../repositories/shortsRepository'
import { getUserDataPath } from '../../paths'

export const ATLAS_MEDIA_SCHEME = 'atlas-media'

const MEDIA_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.avi': 'video/x-msvideo',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.wmv': 'video/x-ms-wmv',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export function registerAtlasMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ATLAS_MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
        bypassCSP: true,
      },
    },
  ])
}

function shortsRoot() {
  return path.join(getUserDataPath(), 'shorts')
}

function isAllowedMediaPath(filePath: string): boolean {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false
  const root = path.resolve(shortsRoot())
  if (resolved.toLowerCase().startsWith(root.toLowerCase() + path.sep)) return true
  return shortsRepository.list().some((job) => path.resolve(job.sourcePath).toLowerCase() === resolved.toLowerCase())
}

export function toAtlasMediaUrl(filePath: string): string {
  return `${ATLAS_MEDIA_SCHEME}://local/?p=${encodeURIComponent(path.resolve(filePath))}`
}

export function filePathFromAtlasMediaUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const encoded = parsed.searchParams.get('p')
    if (!encoded) return null
    return path.resolve(decodeURIComponent(encoded))
  } catch {
    return null
  }
}

function mediaContentType(filePath: string): string {
  return MEDIA_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function streamBody(nodeStream: Readable): NonNullable<ConstructorParameters<typeof Response>[0]> {
  return Readable.toWeb(nodeStream) as unknown as NonNullable<ConstructorParameters<typeof Response>[0]>
}

function serveLocalFile(filePath: string, request: Request): Response {
  const size = fs.statSync(filePath).size
  const type = mediaContentType(filePath)
  const range = parseByteRange(request.headers.get('range'), size)
  if (!range) {
    return new Response(streamBody(fs.createReadStream(filePath)), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
      },
    })
  }
  return new Response(streamBody(fs.createReadStream(filePath, { start: range.start, end: range.end })), {
    status: 206,
    headers: {
      'Content-Type': type,
      'Content-Length': String(range.end - range.start + 1),
      'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  })
}

export function registerAtlasMediaProtocol() {
  protocol.handle(ATLAS_MEDIA_SCHEME, async (request) => {
    const filePath = filePathFromAtlasMediaUrl(request.url)
    if (!filePath || !isAllowedMediaPath(filePath)) {
      return new Response('Not found', { status: 404 })
    }
    try {
      return serveLocalFile(filePath, request)
    } catch {
      return net.fetch(pathToFileURL(filePath).href)
    }
  })
}
