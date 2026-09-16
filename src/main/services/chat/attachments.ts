import fs from 'node:fs'
import path from 'node:path'
import type { ChatAttachment, ChatAttachmentKind } from '../../../shared/chat/types'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma', '.aiff'])
const TEXT_EXT = new Set(['.txt', '.md', '.json', '.csv', '.html', '.xml', '.log', '.srt', '.vtt'])
const MAX_TEXT_CHARS = 60_000
const MAX_ATTACHMENTS = 8

function kindFromExt(ext: string): ChatAttachmentKind {
  if (IMAGE_EXT.has(ext)) return 'image'
  if (AUDIO_EXT.has(ext)) return 'audio'
  if (TEXT_EXT.has(ext)) return 'text'
  return 'file'
}

export function prepareChatAttachments(paths: string[]): ChatAttachment[] {
  const unique = [...new Set(paths.map((item) => item.trim()).filter(Boolean))]
  const attachments: ChatAttachment[] = []
  for (const filePath of unique.slice(0, MAX_ATTACHMENTS)) {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue
    const stat = fs.statSync(resolved)
    const ext = path.extname(resolved).toLowerCase()
    const kind = kindFromExt(ext)
    const item: ChatAttachment = {
      name: path.basename(resolved),
      path: resolved,
      kind,
      size: stat.size,
    }
    if (kind === 'text' && stat.size < 2_000_000) {
      try {
        const raw = fs.readFileSync(resolved, 'utf8')
        item.textExcerpt = raw.length > MAX_TEXT_CHARS ? `${raw.slice(0, MAX_TEXT_CHARS)}…` : raw
      } catch {
        /* binário disfarçado de texto */
      }
    }
    attachments.push(item)
  }
  return attachments
}

export function formatAttachmentsForPrompt(attachments: ChatAttachment[]): string {
  if (attachments.length === 0) return ''
  const blocks = attachments.map((item) => {
    const lines = [
      `- ${item.kind}: ${item.name}`,
      `  caminho: ${item.path}`,
      `  tamanho: ${item.size} bytes`,
    ]
    if (item.textExcerpt) {
      lines.push('  conteúdo:', '```', item.textExcerpt, '```')
    }
    return lines.join('\n')
  })
  return `\nAnexos enviados pelo usuário (use o conteúdo/caminho; não invente arquivos):\n${blocks.join('\n')}`
}

export function attachmentParentDirs(attachments: ChatAttachment[]): string[] {
  return [...new Set(attachments.map((item) => path.dirname(item.path)))]
}
