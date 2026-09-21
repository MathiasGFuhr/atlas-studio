import { useCallback, useEffect, useState } from 'react'
import { Bookmark } from 'lucide-react'
import { Card } from './Card'
import { QuickPromptLibrary } from './QuickPromptLibrary'

/**
 * Meus prompts — biblioteca do ambiente Música.
 *
 * Sem presets de imagem/animação: o usuário organiza o que criou
 * (ou pediu para a IA salvar) em sub-abas livres.
 *
 * `projectId` é opcional: sem projeto, só os prompts globais aparecem.
 */
export function QuickPromptsPanel({ projectId }: { projectId?: string | null }) {
  const [copied, setCopied] = useState<string | null>(null)

  const markCopied = useCallback((key: string) => {
    setCopied(key)
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800)
  }, [])

  useEffect(() => {
    return () => setCopied(null)
  }, [])

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-dark text-accent">
            <Bookmark className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text">Meus prompts</h2>
            <p className="text-xs text-muted">
              Crie abas para organizar como quiser — lipsync, ângulos de câmera ou qualquer outro grupo.
            </p>
          </div>
        </div>

        <QuickPromptLibrary
          embedded
          projectId={projectId ?? null}
          copied={copied}
          onCopied={markCopied}
        />
      </Card>
    </div>
  )
}
