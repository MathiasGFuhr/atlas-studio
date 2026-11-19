import type { EditorAsset, EditorWaveform } from '@shared/editor/types'
import { getAtlasApi } from '../api'

export const EDITOR_ASSET_DRAG_TYPE = 'application/x-atlas-editor-asset'
export const EDITOR_EFFECT_DRAG_TYPE = 'application/x-atlas-editor-effect'

/**
 * Preview usa o arquivo original (qualidade cheia).
 * Proxy só entra se o original sumiu — ele existe para scrub/miniaturas leves.
 */
export function assetPlaybackUrl(asset: EditorAsset | undefined): string | null {
  if (!asset) return null
  return asset.url || asset.proxyUrl || null
}

const MAX_WAVEFORM_CACHE = 50
const waveformCache = new Map<string, Promise<EditorWaveform | null>>()

export function loadWaveform(asset: EditorAsset): Promise<EditorWaveform | null> {
  if (!asset.waveformPath) return Promise.resolve(null)
  const key = `${asset.id}|${asset.waveformPath}`
  let pending = waveformCache.get(key)
  if (pending) {
    // Marca como usado recentemente (LRU)
    waveformCache.delete(key)
    waveformCache.set(key, pending)
    return pending
  }
  pending = getAtlasApi()
    .editor.waveform(asset.id)
    .then((result) => {
      if (!result && waveformCache.get(key) === pending) {
        waveformCache.delete(key)
      }
      return result
    })
    .catch(() => {
      if (waveformCache.get(key) === pending) waveformCache.delete(key)
      return null
    })
  waveformCache.set(key, pending)
  if (waveformCache.size > MAX_WAVEFORM_CACHE) {
    const oldest = waveformCache.keys().next().value
    if (oldest !== undefined) waveformCache.delete(oldest)
  }
  return pending
}

export function dirnameOf(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return index > 0 ? filePath.slice(0, index) : filePath
}

export function formatBytes(bytes: number): string {
  if (!(bytes > 0)) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
