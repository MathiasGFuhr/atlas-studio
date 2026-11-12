import { useMemo, useState } from 'react'
import { Check, ClipboardPaste, Copy, Eraser, Layers } from 'lucide-react'
import { parseFlowPromptsForImport } from '@shared/scenePromptImport'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { useToast } from '../components/Toast'
import { getAtlasApi } from '../lib/api'
import { environmentBreadcrumb } from '../lib/environments'
import { readFlowSource, writeFlowSource } from '../lib/flowPromptSource'
import { cn } from '../lib/utils'

function sceneLabel(number: number): string {
  return `Cena ${String(number).padStart(2, '0')}`
}

/**
 * Extrai prompts FLOW — IMAGEM de um documento de direção e deixa
 * copiar cena a cena para colar no Google Flow.
 */
export function FlowPromptsPage() {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const [source, setSource] = useState(readFlowSource)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const prompts = useMemo(() => parseFlowPromptsForImport(source), [source])

  function updateSource(value: string) {
    setSource(value)
    writeFlowSource(value)
  }

  async function pasteFromClipboard() {
    try {
      const text = (await api.system.readText()).trim()
      if (!text) {
        push('A área de transferência está vazia.')
        return
      }
      updateSource(text)
      const count = parseFlowPromptsForImport(text).length
      push(
        count === 0
          ? 'Texto colado. Nenhum prompt Flow reconhecido ainda.'
          : count === 1
            ? '1 prompt Flow reconhecido.'
            : `${count} prompts Flow reconhecidos.`,
        count > 0 ? 'success' : undefined,
      )
    } catch (error) {
      pushError(error, 'Não foi possível ler a área de transferência.')
    }
  }

  async function copyPrompt(number: number, text: string) {
    try {
      await api.system.copyText(text)
      const id = String(number)
      setCopiedId(id)
      window.setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current))
      }, 1600)
      push(`${sceneLabel(number)} copiada.`, 'success')
    } catch (error) {
      pushError(error, 'Não foi possível copiar o prompt.')
    }
  }

  async function copyAll() {
    if (prompts.length === 0) {
      push('Nenhum prompt Flow para copiar.')
      return
    }
    const text = prompts
      .map((entry) => `${entry.number}- ${entry.text}`)
      .join('\n\n')
    try {
      await api.system.copyText(text)
      push(
        prompts.length === 1 ? 'Prompt Flow copiado.' : `${prompts.length} prompts Flow copiados.`,
        'success',
      )
    } catch (error) {
      pushError(error, 'Não foi possível copiar os prompts.')
    }
  }

  function clearAll() {
    updateSource('')
    setCopiedId(null)
  }

  return (
    <PageShell className="flex min-h-0 flex-col">
      <PageHeader
        breadcrumb={environmentBreadcrumb('music', 'Flow')}
        title="Prompts Flow"
        subtitle="Cole o documento de direção (CENA/CORTE, com ou sem ```). Só o bloco FLOW — IMAGEM entra — Comfy e Veo ficam de fora."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          icon={<ClipboardPaste className="h-3.5 w-3.5" />}
          onClick={() => void pasteFromClipboard()}
        >
          Colar documento
        </Button>
        <Button
          type="button"
          variant="secondary"
          icon={<Copy className="h-3.5 w-3.5" />}
          disabled={prompts.length === 0}
          onClick={() => void copyAll()}
        >
          Copiar todos
        </Button>
        <Button
          type="button"
          variant="ghost"
          icon={<Eraser className="h-3.5 w-3.5" />}
          disabled={!source}
          onClick={clearAll}
        >
          Limpar
        </Button>
        <p className="text-xs text-muted">
          {prompts.length === 0
            ? 'Lista 1- 2- 3- ou documento CENA/CORTE/SCENE + bloco FLOW.'
            : prompts.length === 1
              ? '1 prompt Flow pronto para copiar.'
              : `${prompts.length} prompts Flow prontos para copiar.`}
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="flex min-h-0 flex-col rounded-2xl border border-border-soft bg-card/50 p-3 sm:p-4">
          <div className="mb-2 flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-medium text-text">Documento</h2>
          </div>
          <textarea
            value={source}
            onChange={(event) => updateSource(event.target.value)}
            spellCheck={false}
            placeholder={
              'CORTE 01 — Título\nFLOW — IMAGEM\n/closeup /documentary — Photograph…\n\nCORTE 02 — …\nou a lista:\n\n1- prompt da cena 1'
            }
            className="min-h-[280px] flex-1 resize-none rounded-xl border border-border bg-bg/40 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none xl:min-h-0"
          />
        </section>

        <section className="min-h-0 overflow-y-auto">
          {prompts.length === 0 ? (
            <div className="flex h-full min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-border-soft px-6 py-10 text-center">
              <p className="max-w-sm text-sm text-muted">
                Os prompts Flow aparecem aqui, um card por cena, com botão para copiar e colar no Google Flow.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3">
              {prompts.map((entry) => {
                const copied = copiedId === String(entry.number)
                return (
                  <li
                    key={entry.number}
                    className="rounded-2xl border border-border-soft bg-card/60 p-3 sm:p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">
                        {sceneLabel(entry.number)}
                      </p>
                      <button
                        type="button"
                        onClick={() => void copyPrompt(entry.number, entry.text)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition',
                          copied
                            ? 'text-accent'
                            : 'text-muted-2 hover:bg-elevated hover:text-text',
                        )}
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copied ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-text">
                      {entry.text}
                    </pre>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  )
}
