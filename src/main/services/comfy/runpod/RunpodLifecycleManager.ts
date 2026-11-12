import {
  COMFY_RUNPOD_PORT,
  comfyRunpodProxyUrl,
  podIdFromComfyUrl,
  type ComfyApiWorkflow,
  type ComfyConnectionInfo,
} from '../../../../shared/comfy'
import type {
  RunpodPodLifecycleState,
  RunpodPodSummary,
  RunpodStartPodRequest,
  RunpodStartPreview,
  RunpodStopPodRequest,
  RunpodStopPodResult,
} from '../../../../shared/runpod'
import { assessLtxPodCompatibility } from '../../../../shared/runpodLtxCompat'
import { summarizeV2Pod } from './mapRunpodV2'
import { probeComfyLtxReadiness } from './comfyReadiness'
import { RunpodApiError, type RunpodClientV2, type RunpodV2Pod } from './RunpodClientV2'

export type RunpodLifecycleDeps = {
  createClient: (apiKey: string) => RunpodClientV2
  getApiKey: () => string
  getWorkflow: () => ComfyApiWorkflow | null
  saveBaseUrl: (url: string) => void
  getDryRunDefault: () => boolean
  sleep?: (ms: number) => Promise<void>
  now?: () => string
  /** Limites injetáveis nos testes. */
  podReadyTimeoutMs?: number
  comfyReadyTimeoutMs?: number
  pollIntervalMs?: number
  log?: (event: string, data?: Record<string, unknown>) => void
  probeComfy?: typeof probeComfyLtxReadiness
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function costMatches(expected: number | null, confirmed: number | null): boolean {
  if (expected == null && confirmed == null) return true
  if (expected == null || confirmed == null) return false
  return Math.abs(expected - confirmed) < 0.0001
}

/**
 * Fase 2: start/stop de Pod existente + espera Comfy/LTX.
 * Stop = action "stop" apenas (nunca terminate/delete). Idempotente por podId.
 */
export class RunpodLifecycleManager {
  private readonly deps: RunpodLifecycleDeps
  private readonly inFlight = new Map<string, Promise<RunpodPodLifecycleState>>()
  private latest: RunpodPodLifecycleState | null = null

  constructor(deps: RunpodLifecycleDeps) {
    this.deps = deps
  }

  getLatest(): RunpodPodLifecycleState | null {
    return this.latest
  }

  private stamp(
    partial: Omit<RunpodPodLifecycleState, 'startedAt' | 'updatedAt'> & {
      startedAt?: string
    },
  ): RunpodPodLifecycleState {
    const now = (this.deps.now ?? (() => new Date().toISOString()))()
    const state: RunpodPodLifecycleState = {
      ...partial,
      startedAt: partial.startedAt ?? now,
      updatedAt: now,
    }
    this.latest = state
    return state
  }

  async previewStart(podId: string): Promise<RunpodStartPreview> {
    const apiKey = this.deps.getApiKey().trim()
    if (!apiKey) throw new Error('Cole a chave da API do RunPod nas Configurações.')
    const client = this.deps.createClient(apiKey)
    const raw = await client.getPod(podId)
    const pod = summarizeV2Pod(raw)
    const compatibility = assessLtxPodCompatibility(pod)
    const costPerHr = pod.costPerHr
    const dryRunDefault = this.deps.getDryRunDefault()
    const costLabel = costPerHr != null ? `US$ ${costPerHr.toFixed(2)}/h` : 'custo horário indisponível'
    return {
      pod: { ...pod, ltxCompat: compatibility },
      costPerHr,
      currency: 'USD',
      dryRunDefault,
      compatibility,
      confirmationMessage: compatibility.canStart
        ? `Iniciar o Pod "${pod.name}" (${pod.gpuType ?? 'GPU'}) cobrará cerca de ${costLabel} enquanto estiver ligado.`
        : `Este Pod não está pronto para start: ${compatibility.reasons.join(' ')}`,
    }
  }

  async startExistingPod(request: RunpodStartPodRequest): Promise<RunpodPodLifecycleState> {
    const podId = request.podId.trim()
    if (!podId) throw new Error('Selecione um Pod.')
    const existing = this.inFlight.get(podId)
    if (existing) return existing

    const run = this.runStart(podId, request).finally(() => {
      this.inFlight.delete(podId)
    })
    this.inFlight.set(podId, run)
    return run
  }

  private async runStart(
    podId: string,
    request: RunpodStartPodRequest,
  ): Promise<RunpodPodLifecycleState> {
    const log = this.deps.log
    const sleep = this.deps.sleep ?? defaultSleep
    const apiKey = this.deps.getApiKey().trim()
    if (!apiKey) {
      return this.stamp({
        podId,
        podName: podId,
        phase: 'error',
        dryRun: request.dryRun,
        message: 'Chave da API do RunPod ausente.',
        diagnostics: ['Salve a chave em Configurações antes de iniciar.'],
        podStatus: null,
        baseUrl: null,
        costPerHr: null,
        comfy: null,
        nodeReadiness: null,
        compatibility: null,
        error: 'Chave da API do RunPod ausente.',
      })
    }

    const client = this.deps.createClient(apiKey)
    let raw: RunpodV2Pod
    try {
      raw = await client.getPod(podId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return this.stamp({
        podId,
        podName: podId,
        phase: 'error',
        dryRun: request.dryRun,
        message,
        diagnostics: ['Falha ao ler o Pod (GET /v2/pods/{id}).'],
        podStatus: null,
        baseUrl: null,
        costPerHr: null,
        comfy: null,
        nodeReadiness: null,
        compatibility: null,
        error: message,
      })
    }

    let pod = summarizeV2Pod(raw)
    const statusPeek = String(pod.status).toUpperCase()
    const alreadyUp =
      statusPeek === 'RUNNING' || statusPeek === 'PROVISIONING' || statusPeek === 'STARTING'
    // Cobrança só quando vamos disparar POST start em Pod parado.
    if (!request.dryRun && !request.acceptBilling && !alreadyUp) {
      return this.stamp({
        podId,
        podName: pod.name,
        phase: 'error',
        dryRun: false,
        message: 'Start real bloqueado: confirme a cobrança da GPU.',
        diagnostics: [
          'Marque a confirmação de cobrança ou use simulação (dry-run) sem custo.',
        ],
        podStatus: pod.status,
        baseUrl: null,
        costPerHr: pod.costPerHr,
        comfy: null,
        nodeReadiness: null,
        compatibility: assessLtxPodCompatibility(pod),
        error: 'Confirmação de cobrança obrigatória para start real.',
      })
    }

    const compatibility = assessLtxPodCompatibility(pod)
    if (!costMatches(pod.costPerHr, request.confirmedCostPerHr)) {
      return this.stamp({
        podId,
        podName: pod.name,
        phase: 'error',
        dryRun: request.dryRun,
        message: 'O custo confirmado não confere com o Pod atual. Atualize o status e confirme de novo.',
        diagnostics: [
          `Custo atual: ${pod.costPerHr ?? 'n/d'}`,
          `Confirmado: ${request.confirmedCostPerHr ?? 'n/d'}`,
        ],
        podStatus: pod.status,
        baseUrl: null,
        costPerHr: pod.costPerHr,
        comfy: null,
        nodeReadiness: null,
        compatibility,
        error: 'Custo divergente — start cancelado por segurança.',
      })
    }

    if (!compatibility.canStart) {
      return this.stamp({
        podId,
        podName: pod.name,
        phase: 'error',
        dryRun: request.dryRun,
        message: 'Pod incompatível ou não iniciável para LTX-2.3.',
        diagnostics: [...compatibility.reasons, ...compatibility.warnings],
        podStatus: pod.status,
        baseUrl: null,
        costPerHr: pod.costPerHr,
        comfy: null,
        nodeReadiness: null,
        compatibility,
        error: compatibility.reasons[0] ?? 'Pod bloqueado.',
      })
    }

    let state = this.stamp({
      podId,
      podName: pod.name,
      phase: 'starting',
      dryRun: request.dryRun,
      message: request.dryRun
        ? 'Simulação: start sem chamada de cobrança (dry-run).'
        : 'Enviando start do Pod (POST /v2/pods/{id}/action).',
      diagnostics: compatibility.warnings,
      podStatus: pod.status,
      baseUrl: null,
      costPerHr: pod.costPerHr,
      comfy: null,
      nodeReadiness: null,
      compatibility,
      error: null,
    })

    const statusUpper = String(pod.status).toUpperCase()
    const alreadyRunning = statusUpper === 'RUNNING'
    const alreadyBooting = statusUpper === 'PROVISIONING' || statusUpper === 'STARTING'

    if (!alreadyRunning && !alreadyBooting) {
      try {
        if (request.dryRun) {
          log?.('runpod.lifecycle.dry_run_start', { podId })
          raw = {
            ...raw,
            status: 'STARTING',
            actions: ['stop', 'terminate'],
          }
        } else {
          log?.('runpod.lifecycle.start_post', { podId })
          raw = await client.startPod(podId)
        }
        pod = summarizeV2Pod(raw)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const diagnostics = [
          error instanceof RunpodApiError ? `HTTP ${error.status}` : 'Erro de rede/API',
          message,
        ]
        return this.stamp({
          ...state,
          phase: 'error',
          message: 'Falha ao iniciar o Pod.',
          diagnostics,
          podStatus: pod.status,
          error: message,
        })
      }
    }

    state = this.stamp({
      ...state,
      phase: 'waiting_pod',
      message: 'Aguardando o Pod chegar em RUNNING…',
      podStatus: pod.status,
      diagnostics: [...state.diagnostics, `Status após start: ${pod.status}`],
    })

    const podTimeout = this.deps.podReadyTimeoutMs ?? 180_000
    const pollEvery = this.deps.pollIntervalMs ?? 2_000
    const podDeadline = Date.now() + podTimeout
    while (String(pod.status).toUpperCase() !== 'RUNNING') {
      if (Date.now() > podDeadline) {
        return this.stamp({
          ...state,
          phase: 'error',
          message: 'Tempo esgotado aguardando o Pod ficar RUNNING.',
          diagnostics: [
            ...state.diagnostics,
            `Último status: ${pod.status}`,
            'GPU do host pode estar indisponível; tente outro Pod.',
          ],
          podStatus: pod.status,
          error: 'Timeout no provisionamento do Pod.',
        })
      }
      await sleep(pollEvery)
      if (request.dryRun) {
        raw = { ...raw, status: 'RUNNING', ports: raw.ports?.length ? raw.ports : ['8188/http', '22/tcp'] }
      } else {
        raw = await client.getPod(podId)
      }
      pod = summarizeV2Pod(raw)
      state = this.stamp({
        ...state,
        phase: 'waiting_pod',
        message: `Pod em ${pod.status}…`,
        podStatus: pod.status,
      })
      if (String(pod.status).toUpperCase() === 'ERROR') {
        return this.stamp({
          ...state,
          phase: 'error',
          message: 'O Pod entrou em ERROR após o start.',
          diagnostics: [...state.diagnostics, 'Verifique logs no painel RunPod.'],
          error: 'Pod em ERROR.',
        })
      }
    }

    if (!pod.hasComfyPort || !pod.comfyProxyUrl) {
      return this.stamp({
        ...state,
        phase: 'error',
        message: `Pod RUNNING, mas sem porta ${COMFY_RUNPOD_PORT}/http configurada.`,
        diagnostics: [
          ...state.diagnostics,
          `Portas: ${pod.ports.join(', ') || '(nenhuma)'}`,
          'Não reinstalo ComfyUI nesta fase — ajuste a porta no Pod manualmente se necessário.',
        ],
        podStatus: pod.status,
        error: 'Porta ComfyUI ausente.',
      })
    }

    const baseUrl = pod.comfyProxyUrl || comfyRunpodProxyUrl(pod.id, COMFY_RUNPOD_PORT)
    state = this.stamp({
      ...state,
      phase: 'waiting_comfy',
      message: request.dryRun
        ? 'Simulação: aguardando ComfyUI (sem GPU real)…'
        : 'Pod RUNNING. Aguardando ComfyUI em /system_stats…',
      // Dry-run não expõe URL como se estivesse conectado de verdade.
      baseUrl: request.dryRun ? null : baseUrl,
      podStatus: pod.status,
    })

    const comfyTimeout = this.deps.comfyReadyTimeoutMs ?? 180_000
    const comfyDeadline = Date.now() + comfyTimeout
    let connection: ComfyConnectionInfo | null = null
    const probe = this.deps.probeComfy ?? probeComfyLtxReadiness
    const workflow = this.deps.getWorkflow()

    while (Date.now() <= comfyDeadline) {
      try {
        if (request.dryRun) {
          connection = {
            ok: true,
            message: 'Simulação: ComfyUI acessível.',
            gpu: pod.gpuType ?? undefined,
            vramTotalGb: compatibility.vramGb ?? undefined,
            comfyVersion: 'dry-run',
          }
          break
        }
        const readiness = await probe(baseUrl, workflow)
        connection = readiness.connection
        if (connection.ok) {
          state = this.stamp({
            ...state,
            phase: 'checking_nodes',
            message: 'ComfyUI respondeu. Verificando nós LTX-2.3…',
            comfy: connection,
            baseUrl,
          })
          if (!readiness.nodes.ok) {
            return this.stamp({
              ...state,
              phase: 'error',
              message: readiness.nodes.message,
              diagnostics: [
                ...state.diagnostics,
                readiness.nodes.message,
                `Presentes: ${readiness.nodes.present.slice(0, 12).join(', ') || '(nenhum)'}`,
                `Ausentes: ${readiness.nodes.missing.slice(0, 12).join(', ') || '(nenhum)'}`,
                'O Atlas não reinstala custom nodes nesta fase.',
              ],
              comfy: connection,
              nodeReadiness: readiness.nodes,
              error: readiness.nodes.message,
            })
          }
          // Dry-run nunca persiste URL como conexão real.
          if (!request.dryRun) this.deps.saveBaseUrl(baseUrl)
          return this.stamp({
            ...state,
            phase: 'ready',
            message: request.dryRun
              ? 'Simulação concluída — nenhuma GPU iniciada'
              : 'Pod ligado, ComfyUI acessível e nós LTX-2.3 disponíveis.',
            diagnostics: [
              ...state.diagnostics,
              ...compatibility.warnings,
              request.dryRun
                ? `URL simulada (não salva): ${baseUrl}`
                : `URL salva: ${baseUrl}`,
            ],
            comfy: connection,
            nodeReadiness: readiness.nodes,
            baseUrl: request.dryRun ? null : baseUrl,
            error: null,
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        state = this.stamp({
          ...state,
          phase: 'waiting_comfy',
          message: `Aguardando ComfyUI… (${message})`,
          diagnostics: [...state.diagnostics.filter((line) => !line.startsWith('Último erro Comfy:')), `Último erro Comfy: ${message}`],
          baseUrl: request.dryRun ? null : baseUrl,
        })
      }
      await sleep(pollEvery)
    }

    if (request.dryRun && connection?.ok) {
      const nodes = {
        ok: true,
        present: ['LoadImage', 'LoadAudio', 'SaveVideo', 'TextGenerateLTX2Prompt'],
        missing: [] as string[],
        hasLtxMarker: true,
        message: 'Simulação: nós LTX-2.3 presentes.',
      }
      return this.stamp({
        ...state,
        phase: 'ready',
        message: 'Simulação concluída — nenhuma GPU iniciada',
        diagnostics: [
          ...state.diagnostics,
          `URL simulada (não salva): ${baseUrl}`,
        ],
        comfy: connection,
        nodeReadiness: nodes,
        baseUrl: null,
        error: null,
      })
    }

    return this.stamp({
      ...state,
      phase: 'error',
      message: 'Pod ligado, mas o ComfyUI não respondeu a tempo na porta 8188.',
      diagnostics: [
        ...state.diagnostics,
        `URL testada: ${baseUrl}`,
        'Confira se o ComfyUI iniciou no container (sem reinstalar daqui).',
        connection?.message ? `Última resposta: ${connection.message}` : 'Sem resposta /system_stats.',
      ],
      comfy: connection,
      baseUrl,
      error: 'Timeout aguardando ComfyUI.',
    })
  }

  /**
   * POST /v2/pods/{id}/action { action: "stop" }.
   * Nunca terminate/delete. Limpa URL Comfy se apontava para este Pod.
   */
  async stopExistingPod(
    request: RunpodStopPodRequest,
    options?: { currentBaseUrl?: string | null },
  ): Promise<RunpodStopPodResult> {
    const podId = request.podId.trim()
    if (!podId) {
      throw new Error('Informe o ID do Pod para parar.')
    }
    if (this.inFlight.has(podId)) {
      throw new Error('Já há uma operação em andamento neste Pod. Aguarde.')
    }

    const run = async (): Promise<RunpodStopPodResult> => {
      const apiKey = this.deps.getApiKey().trim()
      if (!apiKey) throw new Error('Cole a chave da API do RunPod nas Configurações.')

      const client = this.deps.createClient(apiKey)
      let raw: RunpodV2Pod
      try {
        raw = await client.getPod(podId)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const lifecycle = this.stamp({
          podId,
          podName: podId,
          phase: 'error',
          dryRun: request.dryRun,
          message: `Não foi possível ler o Pod antes do stop: ${message}`,
          diagnostics: [message],
          podStatus: null,
          baseUrl: null,
          costPerHr: null,
          comfy: null,
          nodeReadiness: null,
          compatibility: null,
          error: message,
        })
        return {
          podId,
          podName: podId,
          dryRun: request.dryRun,
          phase: 'error',
          podStatus: null,
          message: lifecycle.message,
          diagnostics: lifecycle.diagnostics,
          error: message,
          clearedBaseUrl: false,
          lifecycle,
        }
      }

      const pod = summarizeV2Pod(raw)
      const actions = (pod.actions ?? []).map((a) => String(a).toLowerCase())
      const status = String(pod.status || '').toUpperCase()
      const canStop =
        actions.includes('stop') ||
        status === 'RUNNING' ||
        status === 'STARTING' ||
        status === 'PROVISIONING'

      const stopping = this.stamp({
        podId: pod.id,
        podName: pod.name,
        phase: 'stopping',
        dryRun: request.dryRun,
        message: request.dryRun
          ? `Simulação: pararia o Pod "${pod.name}" (sem POST).`
          : `Parando Pod "${pod.name}"…`,
        diagnostics: [
          `status=${status}`,
          `actions=${actions.join(',') || '(vazio)'}`,
          'Ação: stop (nunca terminate/delete).',
        ],
        podStatus: pod.status,
        baseUrl: null,
        costPerHr: pod.costPerHr,
        comfy: null,
        nodeReadiness: null,
        compatibility: assessLtxPodCompatibility(pod),
        error: null,
      })

      if (!canStop) {
        const lifecycle = this.stamp({
          ...stopping,
          phase: 'stopped',
          message:
            status === 'EXITED' || status === 'TERMINATED'
              ? `Pod "${pod.name}" já está parado (${status}).`
              : `Pod "${pod.name}" não aceita stop no status ${status}.`,
          diagnostics: [
            ...stopping.diagnostics,
            'Nenhum POST enviado — compute já não deveria estar cobrando.',
          ],
        })
        return {
          podId: pod.id,
          podName: pod.name,
          dryRun: request.dryRun,
          phase: 'stopped',
          podStatus: pod.status,
          message: lifecycle.message,
          diagnostics: lifecycle.diagnostics,
          error: null,
          clearedBaseUrl: false,
          lifecycle,
        }
      }

      if (request.dryRun) {
        const lifecycle = this.stamp({
          ...stopping,
          phase: 'stopped',
          message: `Simulação concluída — Pod "${pod.name}" não foi parado de verdade.`,
          diagnostics: [...stopping.diagnostics, 'Dry-run: POST /action stop não enviado.'],
        })
        return {
          podId: pod.id,
          podName: pod.name,
          dryRun: true,
          phase: 'stopped',
          podStatus: pod.status,
          message: lifecycle.message,
          diagnostics: lifecycle.diagnostics,
          error: null,
          clearedBaseUrl: false,
          lifecycle,
        }
      }

      try {
        this.deps.log?.('runpod.stop.request', { podId: pod.id })
        const stoppedRaw = await client.stopPod(pod.id)
        const stopped = summarizeV2Pod(stoppedRaw)
        const urlPodId = podIdFromComfyUrl(options?.currentBaseUrl || '')
        const clearedBaseUrl = Boolean(urlPodId && urlPodId === pod.id)
        if (clearedBaseUrl) {
          this.deps.saveBaseUrl('')
        }
        const lifecycle = this.stamp({
          ...stopping,
          phase: 'stopped',
          message: `Pod "${stopped.name}" parado. Compute da GPU deixou de cobrar (volume/storage pode continuar).`,
          diagnostics: [
            ...stopping.diagnostics,
            `novoStatus=${stopped.status}`,
            clearedBaseUrl ? 'URL Comfy limpa (apontava para este Pod).' : 'URL Comfy preservada.',
          ],
          podStatus: stopped.status,
          costPerHr: stopped.costPerHr,
          error: null,
        })
        this.deps.log?.('runpod.stop.ok', { podId: pod.id, status: stopped.status })
        return {
          podId: pod.id,
          podName: pod.name,
          dryRun: false,
          phase: 'stopped',
          podStatus: stopped.status,
          message: lifecycle.message,
          diagnostics: lifecycle.diagnostics,
          error: null,
          clearedBaseUrl,
          lifecycle,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.deps.log?.('runpod.stop.failed', { podId: pod.id, message })
        const lifecycle = this.stamp({
          ...stopping,
          phase: 'error',
          message: `Falha ao parar o Pod: ${message}`,
          diagnostics: [
            ...stopping.diagnostics,
            error instanceof RunpodApiError ? `HTTP ${error.status}` : 'erro de rede/API',
            'A GPU pode continuar cobrando — tente de novo ou pare no console RunPod.',
          ],
          error: message,
        })
        return {
          podId: pod.id,
          podName: pod.name,
          dryRun: false,
          phase: 'error',
          podStatus: pod.status,
          message: lifecycle.message,
          diagnostics: lifecycle.diagnostics,
          error: message,
          clearedBaseUrl: false,
          lifecycle,
        }
      }
    }

    const promise = run().finally(() => {
      this.inFlight.delete(podId)
    })
    this.inFlight.set(podId, promise.then((result) => result.lifecycle))
    return promise
  }
}

export function summarizePodsWithCompat(pods: RunpodPodSummary[], catalog?: Parameters<typeof assessLtxPodCompatibility>[1]) {
  return pods.map((pod) => ({ ...pod, ltxCompat: assessLtxPodCompatibility(pod, catalog) }))
}
