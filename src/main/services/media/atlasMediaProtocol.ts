import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { LIPSYNC_AUDIO_EXTENSIONS } from '../../../shared/lipSyncRefs'
import { parseByteRange } from '../../../shared/mediaRange'
import { lipSyncRefRepository } from '../../repositories/lipSyncRefRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { shortsRepository } from '../../repositories/shortsRepository'
import { editorRepository } from '../../repositories/editorRepository'
import { isInsideEditorRoot } from '../editor/editorMedia'
import { getUserDataPath } from '../../paths'
import { ATLAS_MEDIA_SCHEME, isAllowedImagePath } from './localImageUrl'
import { getImageThumbnail, parseThumbWidth } from './imageThumbnails'

export { ATLAS_MEDIA_SCHEME, toAtlasMediaUrl } from './localImageUrl'

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
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
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

function musicRoot() {
  return path.join(getUserDataPath(), 'music')
}

function lipsyncRefsRoot() {
  return path.join(getUserDataPath(), 'lipsync-refs')
}

function isInsideRoot(filePath: string, root: string): boolean {
  const resolvedRoot = path.resolve(root).toLowerCase() + path.sep
  return path.resolve(filePath).toLowerCase().startsWith(resolvedRoot)
}

function isAudioFile(filePath: string): boolean {
  return LIPSYNC_AUDIO_EXTENSIONS.includes(path.extname(filePath).toLowerCase())
}

const ALLOWED_CACHE_TTL_MS = 3_000
type AllowedMediaCache = {
  refreshedAt: number
  lipSyncAudios: Set<string>
  projectFolders: string[]
  shortsSources: Set<string>
}
let allowedCache: AllowedMediaCache | null = null

function refreshAllowedMediaCache(): AllowedMediaCache {
  const lipSyncAudios = new Set<string>()
  const projectFolders: string[] = []
  const shortsSources = new Set<string>()
  try {
    for (const ref of lipSyncRefRepository.list({ status: 'active' })) {
      const audio = ref.audioPath?.trim()
      if (audio) lipSyncAudios.add(path.resolve(audio).toLowerCase())
    }
  } catch {
    /* repositório ainda não pronto */
  }
  try {
    for (const project of projectRepository.list()) {
      const folder = project.projectFolderPath?.trim()
      if (folder) projectFolders.push(path.resolve(folder).toLowerCase() + path.sep)
    }
  } catch {
    /* repositório ainda não pronto */
  }
  try {
    for (const source of shortsRepository.listSourcePaths()) {
      if (source) shortsSources.add(path.resolve(source).toLowerCase())
    }
  } catch {
    /* repositório ainda não pronto */
  }
  allowedCache = {
    refreshedAt: Date.now(),
    lipSyncAudios,
    projectFolders,
    shortsSources,
  }
  return allowedCache
}

function checkCachedDynamicMedia(resolved: string, isAudio: boolean, cache: AllowedMediaCache): boolean {
  const target = resolved.toLowerCase()
  if (isAudio) {
    if (cache.lipSyncAudios.has(target)) return true
    if (cache.projectFolders.some((root) => target.startsWith(root))) return true
  }
  return cache.shortsSources.has(target)
}

function isAllowedMediaPath(resolved: string): boolean {
  if (isInsideRoot(resolved, shortsRoot()) || isInsideRoot(resolved, musicRoot())) return true
  if (isAllowedImagePath(resolved)) return true
  if (isInsideEditorRoot(resolved)) return true
  try {
    if (editorRepository.isKnownSourcePath(resolved)) return true
  } catch {
    /* repositório ainda não pronto */
  }
  const isAudio = isAudioFile(resolved)
  if (isAudio && isInsideRoot(resolved, lipsyncRefsRoot())) return true

  const now = Date.now()
  if (allowedCache && now - allowedCache.refreshedAt < ALLOWED_CACHE_TTL_MS) {
    if (checkCachedDynamicMedia(resolved, isAudio, allowedCache)) return true
  }
  // Cache miss ou expirado: atualiza imediatamente para reconhecer arquivos recém-importados.
  const fresh = refreshAllowedMediaCache()
  return checkCachedDynamicMedia(resolved, isAudio, fresh)
}

function statFile(filePath: string): fs.Stats | null {
  try {
    const stats = fs.statSync(filePath)
    return stats.isFile() ? stats : null
  } catch {
    return null
  }
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

function serveLocalFile(filePath: string, size: number, request: Request): Response {
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
    const stats = filePath ? statFile(filePath) : null
    if (!filePath || !stats || !isAllowedMediaPath(filePath)) {
      return new Response('Not found', { status: 404 })
    }
    const width = parseThumbWidth(new URL(request.url).searchParams.get('w'))
    if (width && isAllowedImagePath(filePath)) {
      const thumb = await getImageThumbnail(filePath, stats, width)
      const thumbStats = thumb ? statFile(thumb) : null
      if (thumb && thumbStats) return serveLocalFile(thumb, thumbStats.size, request)
    }
    try {
      return serveLocalFile(filePath, stats.size, request)
    } catch {
      return net.fetch(pathToFileURL(filePath).href)
    }
  })
}
