import { useEffect, useRef, useState } from 'react'
import { FileJson, PlugZap, RefreshCw } from 'lucide-react'
import type { ComfyConfig, ComfyConnectionInfo } from '@shared/comfy'
import { DEFAULT_COMFY_CONFIG } from '@shared/comfy'
import { Button } from '../Button'
import { getAtlasApi } from '../../lib/api'
import { useToast } from '../Toast'
import { useComfyQueue } from '../../hooks/useComfyQueue'
import { cn } from '../../lib/utils'

/** Barra da aba Lipsync: a URL do RunPod muda a cada reinício do pod. */
export function ComfyRunpodBar() {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const queue = useComfyQueue()
  const [config, setConfig] = useState<ComfyConfig>(queue.config ?? DEFAULT_COMFY_CONFIG)
  const [baseUrl, setBaseUrl] = useState(queue.config?.baseUrl ?? '')
  const [connection, setConnection] = useState<ComfyConnectionInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const dirty = baseUrl.trim() !== config.baseUrl
  const autoTried = useRef(false)

  useEffect(() => {
    if (!queue.config) return
    setConfig(queue.config)
    if (!dirty) setBaseUrl(queue.config.baseUrl)
  }, [queue.config, dirty])

  async function saveUrl(nextUrl = baseUrl): Promise<ComfyConfig | null> {
    try {
      const next = await api.comfy.saveConfig({
        baseUrl: nextUrl,
        queueSize: config.queueSize,
        durationPadding: config.durationPadding,
        trimToAudio: config.trimToAudio,
      })
      setConfig(next)
      setBaseUrl(next.baseUrl)
      queue.setConfig(next)
      return next
    } catch (error) {
      pushError(error, 'Não foi possível salvar a URL do ComfyUI.')
      return null
    }
  }

  async function discoverUrl(fromAuto = false) {
    setBusy(true)
    setConnection(null)
    try {
      const result = await api.comfy.discoverUrl()
      const next = await api.comfy.getConfig()
      setConfig(next)
      setBaseUrl(next.baseUrl)
      queue.setConfig(next)
      setConnection(result.connection)
      if (result.changed) push(result.message, result.ok ? 'success' : 'error')
      else if (!fromAuto && result.ok) push('ComfyUI conectado.', 'success')
      else if (!fromAuto && !result.ok) push(result.message, 'error')
    } catch (error) {
      if (!fromAuto) pushError(error, 'Não foi possível puxar a URL do RunPod.')
      else setConnection({ ok: false, message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (autoTried.current || dirty || !queue.config?.hasRunpodApiKey) return
    autoTried.current = true
    void discoverUrl(true)
    // Só na primeira carga da aba, quando a chave já está salva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.config?.hasRunpodApiKey, dirty])

  async function testConnection() {
    setBusy(true)
    setConnection(null)
    try {
      const saved = dirty ? await saveUrl() : config
      if (!saved) return
      const result = await api.comfy.testConnection(saved.baseUrl)
      setConnection(result)
      if (result.ok) push('ComfyUI conectado.', 'success')
    } finally {
      setBusy(false)
    }
  }

  async function importWorkflow() {
    setBusy(true)
    try {
      const next = await api.comfy.importWorkflow()
      if (!next) return
      setConfig(next)
      setBaseUrl(next.baseUrl)
      queue.setConfig(next)
      push(`Workflow ${next.workflowName} importado.`, 'success')
    } catch (error) {
      pushError(error, 'Não foi possível importar o workflow.')
    } finally {
      setBusy(false)
    }
  }

  const hint = connection
    ? connection.ok
      ? [connection.message, connection.gpu, connection.vramTotalGb ? `${connection.vramTotalGb} GB` : '']
          .filter(Boolean)
          .join(' · ')
      : connection.message
    : config.hasRunpodApiKey
      ? `A URL é puxada sozinha quando o pod liga. Workflow: ${config.workflowName || 'importe uma vez'}`
      : config.workflowName
        ? 'Cole a chave da API do RunPod nas Configurações (uma vez) para puxar a URL sozinha.'
        : 'Cole a URL do pod, ou a chave da API nas Configurações, e importe o workflow uma vez.'

  return (
    <div className="mb-3 rounded-2xl border border-border bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[16rem] flex-1 items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-muted">RunPod</span>
          <input
            value={baseUrl}
            onChange={(event) => {
              setBaseUrl(event.target.value)
              setConnection(null)
            }}
            onBlur={() => {
              if (dirty) void saveUrl()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void (config.hasRunpodApiKey ? discoverUrl() : testConnection())
              }
            }}
            placeholder="https://<id-do-pod>-8188.proxy.runpod.net"
            spellCheck={false}
            className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-bg/50 px-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
          />
        </label>
        {config.hasRunpodApiKey ? (
          <Button
            variant="secondary"
            className="h-9 px-3 py-0 text-xs"
            icon={<RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />}
            disabled={busy}
            onClick={() => void discoverUrl()}
          >
            Atualizar
          </Button>
        ) : null}
        <Button
          variant="secondary"
          className="h-9 px-3 py-0 text-xs"
          icon={<PlugZap className="h-3.5 w-3.5" />}
          disabled={busy || !baseUrl.trim()}
          onClick={() => void testConnection()}
        >
          Testar
        </Button>
        {!config.workflowMapping ? (
          <Button
            variant="secondary"
            className="h-9 px-3 py-0 text-xs"
            icon={<FileJson className="h-3.5 w-3.5" />}
            disabled={busy}
            onClick={() => void importWorkflow()}
          >
            Workflow
          </Button>
        ) : null}
      </div>
      <p className={cn('mt-1.5 text-[11px]', connection && !connection.ok ? 'text-danger' : 'text-muted-2')}>
        {hint}
      </p>
    </div>
  )
}
