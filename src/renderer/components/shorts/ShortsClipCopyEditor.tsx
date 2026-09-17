import { useEffect, useRef, useState } from 'react'
import { Copy, Loader2, RefreshCw } from 'lucide-react'
import type { ShortsClip, ShortsClipPatch, ShortsCopyFields } from '@shared/shorts'
import { formatHashtags, normalizeHashtags } from '@shared/shorts'
import { Button } from '../Button'
import { Input } from '../Input'
import { Textarea } from '../Textarea'
import { cn } from '../../lib/utils'

export function ShortsClipCopyEditor({
  clip,
  disabled,
  regenerating,
  compact,
  onPersist,
  onCopy,
  onRegenerate,
}: {
  clip: ShortsClip
  disabled?: boolean
  regenerating?: boolean
  compact?: boolean
  onPersist: (patch: ShortsClipPatch) => void
  onCopy: (part: 'title' | 'description' | 'all') => void
  onRegenerate: (fields: ShortsCopyFields) => void
}) {
  const [title, setTitle] = useState(clip.title)
  const [description, setDescription] = useState(clip.description)
  const [hashtags, setHashtags] = useState(formatHashtags(clip.hashtags))
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setTitle(clip.title)
    setDescription(clip.description)
    setHashtags(formatHashtags(clip.hashtags))
  }, [clip.id, clip.title, clip.description, clip.hashtags])

  useEffect(() => {
    if (!menuOpen) return
    function onPointer(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [menuOpen])

  function commitTitle() {
    if (title.trim() === clip.title) return
    onPersist({ title: title.trim() })
  }

  function commitDescription() {
    if (description.trim() === clip.description) return
    onPersist({ description: description.trim() })
  }

  function commitHashtags() {
    const next = normalizeHashtags(hashtags)
    const same =
      next.length === clip.hashtags.length && next.every((tag, index) => tag === clip.hashtags[index])
    if (same) return
    onPersist({ hashtags: next })
  }

  return (
    <div className="space-y-3">
      <Input
        label="Título sugerido"
        value={title}
        disabled={disabled || regenerating}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commitTitle}
      />
      <Textarea
        label="Descrição"
        value={description}
        disabled={disabled || regenerating}
        className={compact ? 'min-h-[84px]' : 'min-h-[110px]'}
        onChange={(event) => setDescription(event.target.value)}
        onBlur={commitDescription}
      />
      <Input
        label="Hashtags"
        value={hashtags}
        placeholder="#tema #artista"
        disabled={disabled || regenerating}
        onChange={(event) => setHashtags(event.target.value)}
        onBlur={commitHashtags}
      />
      {clip.reason ? (
        <p className="text-xs leading-relaxed text-muted">
          <span className="text-muted-2">Motivo do corte: </span>
          {clip.reason}
        </p>
      ) : null}
      {clip.hook ? <p className="text-xs italic text-muted-2">{clip.hook}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="h-9 px-3 text-xs" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => onCopy('title')}>
          Copiar título
        </Button>
        <Button variant="secondary" className="h-9 px-3 text-xs" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => onCopy('description')}>
          Copiar descrição
        </Button>
        <Button variant="ghost" className="h-9 px-3 text-xs" onClick={() => onCopy('all')}>
          Copiar tudo
        </Button>
        <div className="relative" ref={menuRef}>
          <Button
            variant="secondary"
            className="h-9 px-3 text-xs"
            disabled={disabled || regenerating}
            icon={
              regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />
            }
            onClick={() => setMenuOpen((open) => !open)}
          >
            Regenerar
          </Button>
          {menuOpen ? (
            <div className="absolute right-0 z-20 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-border bg-card-2 shadow-xl">
              {(
                [
                  ['title', 'Título'],
                  ['description', 'Descrição'],
                  ['all', 'Título + descrição'],
                ] as const
              ).map(([fields, label]) => (
                <button
                  key={fields}
                  type="button"
                  className={cn(
                    'block w-full px-3 py-2 text-left text-xs text-text hover:bg-white/5',
                  )}
                  onClick={() => {
                    setMenuOpen(false)
                    onRegenerate(fields)
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
