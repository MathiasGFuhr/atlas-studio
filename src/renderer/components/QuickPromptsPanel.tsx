import { useCallback, useEffect, useState } from 'react'
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
    <div data-tour="page-actions" className="h-full min-h-0">
      <QuickPromptLibrary projectId={projectId ?? null} copied={copied} onCopied={markCopied} />
    </div>
  )
}
