import { useEffect, useState } from 'react'
import { Clapperboard, FileJson, PlugZap, Save } from 'lucide-react'
import type { ComfyConfig, ComfyConnectionInfo } from '@shared/comfy'
import { COMFY_DURATION_PADDING_MAX, COMFY_QUEUE_SIZE_MAX, DEFAULT_COMFY_CONFIG } from '@shared/comfy'
import { Button } from '../Button'
import { Card } from '../Card'
import { Input } from '../Input'
import { getAtlasApi } from '../../lib/api'
import { useToast } from '../Toast'
import { useComfyQueue } from '../../hooks/useComfyQueue'

export function ComfySettingsCard() {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const queue = useComfyQueue()
  const [config, setConfig] = useState<ComfyConfig>(DEFAULT_COMFY_CONFIG)
  const [baseUrl, setBaseUrl] = useState('')
  const [queueSize, setQueueSize] = useState(String(DEFAULT_COMFY_CONFIG.queueSize))
  const [padding, setPadding] = useState(String(DEFAULT_COMFY_CONFIG.durationPadding))
  const [trimToAudio, setTrimToAudio] = useState(DEFAULT_COMFY_CONFIG.trimToAudio)
  const [connection, setConnection] = useState<ComfyConnectionInfo | null>(null)
  const [runpodApiKey, setRunpodApiKey] = useState('')
  const [busy, setBusy] = useState(false)

  function apply(next: ComfyConfig) {
    setConfig(next)
    setBaseUrl(next.baseUrl)
    setQueueSize(String(next.queueSize))
    setPadding(String(next.durationPadding))
    setTrimToAudio(next.trimToAudio)
  }

  useEffect(() => {
    void api.comfy.getConfig().then(apply)
  }, [api])

  const dirty =
    baseUrl.trim() !== config.baseUrl ||
    Number(queueSize) !== config.queueSize ||
    Number(padding) !== config.durationPadding ||
    trimToAudio !== config.trimToAudio

  async function save(): Promise<ComfyConfig | null> {
    try {
      const next = await api.comfy.saveConfig({
        baseUrl,
        queueSize: Number(queueSize),
        durationPadding: Number(padding),
        trimToAudio,
        ...(runpodApiKey.trim() ? { runpodApiKey: runpodApiKey.trim() } : {}),
      })
      setRunpodApiKey('')
      apply(next)
      queue.setConfig(next)
      return next
    } catch (error) {
      pushError(error, 'Não foi possível salvar a configuração do ComfyUI.')
      return null
    }
  }

  async function testConnection() {
    setBusy(true)
    setConnection(null)
    try {
      const saved = dirty || runpodApiKey.trim() ? await save() : config
      if (!saved) return
      setConnection(await api.comfy.testConnection(saved.baseUrl))
    } finally {
      setBusy(false)
    }
  }

  async function importWorkflow() {
    setBusy(true)
    try {
      const next = await api.comfy.importWorkflow()
      if (!next) return
      apply(next)
      queue.setConfig(next)
      push(`Workflow ${next.workflowName} importado.`, 'success')
    } catch (error) {
      pushError(error, 'Não foi possível importar o workflow.')
    } finally {
      setBusy(false)
    }
  }

  const mapping = config.workflowMapping

  return (
    <Card id="comfy">
      <div className="mb-4 flex items-center gap-2">
        <Clapperboard className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-text">ComfyUI (RunPod)</h3>
      </div>

      <div className="space-y-4">
        <Input
          label="Chave da API do RunPod"
          type="password"
          value={runpodApiKey}
          onChange={(event) => setRunpodApiKey(event.target.value)}
          placeholder={
            config.hasRunpodApiKey ? 'Chave salva — cole outra para trocar' : 'Cole uma vez; a URL passa a ser puxada sozinha'
          }
          autoComplete="off"
          spellCheck={false}
        />
        <Input
          label="URL do ComfyUI"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://<id-do-pod>-8188.proxy.runpod.net"
          spellCheck={false}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Cenas na fila"
            type="number"
            min={1}
            max={COMFY_QUEUE_SIZE_MAX}
            value={queueSize}
            onChange={(event) => setQueueSize(event.target.value)}
          />
          <Input
            label="Folga na duração (s)"
            type="number"
            min={0}
            max={COMFY_DURATION_PADDING_MAX}
            value={padding}
            onChange={(event) => setPadding(event.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
            checked={trimToAudio}
            onChange={(event) => setTrimToAudio(event.target.checked)}
          />
          <span>
            Cortar o vídeo no tempo do áudio ao baixar
            <span className="mt-0.5 block text-xs font-normal text-muted-2">
              O Comfy continua recebendo a duração com folga. Ligado, o arquivo gravado fica no tempo
              exato da cena (28,9 s em vez de 29 s).
            </span>
          </span>
        </label>
        <p className="text-xs leading-relaxed text-muted-2">
          A chave fica em Settings → API Keys no site do RunPod e não muda quando o pod reinicia. Com ela, a
          aba Lipsync puxa sozinha o endereço <span className="font-mono">…-8188.proxy.runpod.net</span>. Com
          uma GPU, o ComfyUI renderiza 1 cena por vez. A duração enviada é a parte inteira do áudio mais a
          folga (21,4 s com folga 1 → 22), para nada ficar de fora.
        </p>

        <div className="rounded-xl border border-border bg-bg/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted">Workflow (formato API)</p>
              <p className="truncate text-sm text-text">{config.workflowName || 'Nenhum importado'}</p>
            </div>
            <Button
              variant="secondary"
              className="h-9 px-3 py-0 text-xs"
              icon={<FileJson className="h-3.5 w-3.5" />}
              disabled={busy}
              onClick={() => void importWorkflow()}
            >
              Importar
            </Button>
          </div>
          {mapping ? (
            <ul className="mt-2 space-y-0.5 text-[11px] text-muted">
              <li>Imagem → nó {mapping.imageNode} · Áudio → nó {mapping.audioNode}</li>
              <li>Prompt → nó {mapping.promptNode} · Duração → nó {mapping.durationNode}</li>
              <li>
                Vídeo → nó {mapping.saveNode} · {mapping.seedNodes.length} seed(s) por cena
                {mapping.enhanceNode ? ' · Prompt Enhance sempre desligado' : ''}
              </li>
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-muted-2">
              No ComfyUI: Workflow → Export (API). O Atlas encontra os nós de imagem, áudio, prompt e duração.
            </p>
          )}
        </div>

        {connection ? (
          <p className={connection.ok ? 'text-xs text-accent' : 'text-xs text-danger'}>
            {connection.ok
              ? [
                  connection.message,
                  connection.gpu,
                  connection.vramTotalGb ? `${connection.vramTotalGb} GB` : '',
                  connection.comfyVersion ? `ComfyUI ${connection.comfyVersion}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
              : connection.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            icon={<PlugZap className="h-4 w-4" />}
            disabled={busy || !baseUrl.trim()}
            onClick={() => void testConnection()}
          >
            Testar conexão
          </Button>
          <Button
            icon={<Save className="h-4 w-4" />}
            disabled={busy || (!dirty && !runpodApiKey.trim())}
            onClick={() => {
              void save().then((next) => {
                if (next) push('Configuração do ComfyUI salva.', 'success')
              })
            }}
          >
            Salvar
          </Button>
        </div>
      </div>
    </Card>
  )
}
