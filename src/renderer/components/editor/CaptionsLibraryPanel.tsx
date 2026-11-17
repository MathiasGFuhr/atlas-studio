import { useState } from 'react'
import { Captions, Loader2 } from 'lucide-react'
import {
  MUSIC_CAPTION_LANGUAGES,
  type MusicCaptionLanguage,
} from '@shared/musicAnalysis'
import { cn } from '../../lib/utils'

export function CaptionsLibraryPanel({
  sourceName,
  busy,
  onGenerate,
}: {
  sourceName: string | null
  busy: boolean
  onGenerate: (language: MusicCaptionLanguage) => void
}) {
  const [language, setLanguage] = useState<MusicCaptionLanguage>('pt')

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-elevated text-muted">
          <Captions className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text">Legenda automática</p>
          <p className="text-[11px] leading-relaxed text-muted-2">
            Ouve o áudio da timeline e escreve cada fala no tempo certo. Português do Brasil, inglês, espanhol e alemão.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {MUSIC_CAPTION_LANGUAGES.map((item) => (
          <button
            key={item.value}
            type="button"
            disabled={busy}
            onClick={() => setLanguage(item.value)}
            className={cn(
              'rounded-lg border px-2 py-2 text-left text-[11px] font-semibold transition-colors disabled:opacity-50',
              language === item.value
                ? 'border-accent/60 bg-accent-subtle text-accent'
                : 'border-border-soft text-muted hover:border-border-strong hover:text-text',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-2">
        {sourceName ? `Fonte: ${sourceName}` : 'Coloque um áudio na timeline para gerar a legenda.'}
      </p>

      <button
        type="button"
        disabled={busy || !sourceName}
        onClick={() => onGenerate(language)}
        className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:bg-hover disabled:text-disabled"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Captions className="h-4 w-4" />}
        {busy ? 'Gerando legenda…' : 'Gerar legenda'}
      </button>

      <p className="text-[10px] leading-relaxed text-muted-2">
        A primeira vez baixa o modelo e pode demorar. Gerar de novo substitui só as legendas automáticas.
      </p>
    </div>
  )
}
