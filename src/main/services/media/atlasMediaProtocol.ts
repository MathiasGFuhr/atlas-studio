import path from 'node:path'
import fs from 'node:fs'
import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { shortsRepository } from '../../repositories/shortsRepository'
import { getUserDataPath } from '../../paths'

export const ATLAS_MEDIA_SCHEME = 'atlas-media'

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

export function registerAtlasMediaProtocol() {
  protocol.handle(ATLAS_MEDIA_SCHEME, async (request) => {
    const filePath = filePathFromAtlasMediaUrl(request.url)
    if (!filePath || !isAllowedMediaPath(filePath)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(filePath).href)
  })
}
