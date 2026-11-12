/**
 * Checklist da validação real de recuperação de GPU (Network Volume).
 * Nunca cria/inicia recursos — só prepara autorização.
 */

import type { ComfyAutoShutdownPlan } from './comfyAutoShutdown'
import type { ComfyConfig } from './comfy'
import type { ComfyGpuRecoveryPreview } from './comfyGpuRecovery'
import type { RunpodPodSummary } from './runpod'

export type GpuRecoveryValidationCheckId =
  | 'api_key'
  | 'dry_run_off'
  | 'budget_set'
  | 'volume_eu_ro_1'
  | 'volume_not_recreate'
  | 'gpu_unavailable_detected'
  | 'dc_gpu_catalog'
  | 'prefer_reuse_pod'
  | 'create_fallback_ready'
  | 'docker_or_template'
  | 'models_on_volume'
  | 'workflow_ltx'
  | 'scene_ready'
  | 'url_gate'
  | 'single_scene_queue'
  | 'mp4_download_path'
  | 'preserve_on_failure'
  | 'auto_shutdown_pending'
  | 'no_batch_production'

export type GpuRecoveryValidationCheck = {
  id: GpuRecoveryValidationCheckId
  ok: boolean
  required: boolean
  label: string
  detail: string
}

export type GpuRecoveryValidationPlan = {
  readyToAuthorizePaidRecovery: boolean
  dryRunStarts: boolean
  autoShutdownImplemented: false
  batchProductionAllowed: false
  estimatedCostPerHr: number | null
  preferredPod: RunpodPodSummary | null
  recovery: ComfyGpuRecoveryPreview | null
  recommendedAction: 'reuse_existing_pod' | 'create_pod_with_network_volume' | 'none'
  continuousBillingRisks: string[]
  authorizationSteps: string[]
  postSuccessReportFields: string[]
  checks: GpuRecoveryValidationCheck[]
  blockers: string[]
  warnings: string[]
  message: string
}

export type GpuRecoveryValidationBundle = {
  validation: GpuRecoveryValidationPlan
  autoShutdown: ComfyAutoShutdownPlan
  fetchedAt: string
  mutationCalls: 0
  paidOperationsExecuted: false
}

export function buildGpuRecoveryValidationPlan(input: {
  config: ComfyConfig
  preferredPod: RunpodPodSummary | null
  volumeId: string | null
  volumeDc: string | null
  volumeSizeGb: number | null
  maxUsdPerHour: number | null
  modelsPersistentlyVerified: boolean
  workflowName: string | null
  hasWorkflowMapping: boolean
  dockerImage: string | null
  templatePinned: boolean
  gpuUnavailableDetected: boolean
  unavailableDetail: string | null
  availableGpusInDc: Array<{ gpuId: string; availability: string; priceUsd: number | null }>
  recovery: ComfyGpuRecoveryPreview | null
  scene: {
    refId: string | null
    number: string | null
    hasImage: boolean
    hasAudio: boolean
    hasPrompt: boolean
    outputDir: string | null
  }
}): GpuRecoveryValidationPlan {
  const volumeOk =
    Boolean(input.volumeId) &&
    Boolean(input.volumeDc) &&
    String(input.volumeDc).toUpperCase() === 'EU-RO-1'
  const reuse = input.recovery?.options.find((opt) => opt.kind === 'reuse_existing_pod') ?? null
  const create = input.recovery?.options.find((opt) => opt.kind === 'create_pod_with_network_volume') ?? null
  const recommended = reuse ?? create ?? null
  const imageOk = Boolean(input.dockerImage && !/pending-pin|placeholder/i.test(input.dockerImage))
  const sceneOk =
    Boolean(input.scene.refId) &&
    input.scene.hasImage &&
    input.scene.hasAudio &&
    input.scene.hasPrompt &&
    Boolean(input.scene.outputDir)

  const checks: GpuRecoveryValidationCheck[] = [
    {
      id: 'api_key',
      ok: input.config.hasRunpodApiKey,
      required: true,
      label: 'Chave RunPod',
      detail: input.config.hasRunpodApiKey ? 'Presente.' : 'Ausente nas Configurações.',
    },
    {
      id: 'dry_run_off',
      ok: !input.config.runpodDryRunStarts,
      required: true,
      label: 'Dry-run desligado para teste real',
      detail: input.config.runpodDryRunStarts
        ? 'Ainda em simulação — desligue dry-run só quando for autorizar custo.'
        : 'Starts/recovery reais habilitados (ainda exigem confirmação).',
    },
    {
      id: 'budget_set',
      ok: input.maxUsdPerHour != null && input.maxUsdPerHour > 0,
      required: true,
      label: 'Limite US$/h definido',
      detail:
        input.maxUsdPerHour != null
          ? `Teto: US$ ${input.maxUsdPerHour.toFixed(2)}/h.`
          : 'Defina maxUsdPerHour no plano LTX antes do teste real.',
    },
    {
      id: 'volume_eu_ro_1',
      ok: volumeOk,
      required: true,
      label: 'Network Volume em EU-RO-1',
      detail: volumeOk
        ? `${input.volumeId} · ${input.volumeSizeGb ?? '?'} GB · ${input.volumeDc}`
        : `volume=${input.volumeId || 'n/d'} dc=${input.volumeDc || 'n/d'}`,
    },
    {
      id: 'volume_not_recreate',
      ok: Boolean(input.volumeId),
      required: true,
      label: 'Não criar outro volume',
      detail: 'Recovery anexa o volume existente — sem novo Network Volume.',
    },
    {
      id: 'gpu_unavailable_detected',
      ok: input.gpuUnavailableDetected,
      required: true,
      label: 'Erro real de GPU indisponível detectado',
      detail: input.gpuUnavailableDetected
        ? input.unavailableDetail || 'Host/Pod sem GPU iniciável.'
        : 'Pod antigo ainda parece iniciável pela API. Recovery só se aplica quando start/capacidade falhar; se a GPU já falhou no console, tente Conectar (dry-run) para capturar o estado.',
    },
    {
      id: 'dc_gpu_catalog',
      ok: input.availableGpusInDc.length > 0,
      required: true,
      label: 'GPUs disponíveis em EU-RO-1 (catálogo)',
      detail: input.availableGpusInDc.length
        ? input.availableGpusInDc
            .slice(0, 5)
            .map(
              (gpu) =>
                `${gpu.gpuId} · ${gpu.availability}${
                  gpu.priceUsd != null ? ` · US$ ${gpu.priceUsd.toFixed(2)}/h` : ''
                }`,
            )
            .join(' | ')
        : 'Nenhuma GPU reportada como disponível no DC do volume.',
    },
    {
      id: 'prefer_reuse_pod',
      ok: Boolean(reuse) || Boolean(create),
      required: true,
      label: 'Priorizar Pod existente compatível',
      detail: reuse
        ? `Reutilizar ${reuse.existingPodId} (${reuse.gpuId}).`
        : create
          ? 'Sem Pod reutilizável — fallback: criar Pod + volume.'
          : 'Sem opções de recovery.',
    },
    {
      id: 'create_fallback_ready',
      ok: Boolean(reuse) || Boolean(create),
      required: true,
      label: 'Fallback create preparado (se necessário)',
      detail: create
        ? `${create.label} · ${create.estimatedCostPerHr != null ? `US$ ${create.estimatedCostPerHr.toFixed(2)}/h` : 'custo n/d'}`
        : reuse
          ? 'Create não necessário se o reuse for autorizado.'
          : 'Create não montado (imagem/volume/orçamento).',
    },
    {
      id: 'docker_or_template',
      ok: imageOk || input.templatePinned,
      required: true,
      label: 'Imagem/template LTX-2.3',
      detail: imageOk
        ? `Imagem: ${input.dockerImage}`
        : input.templatePinned
          ? 'Template pinado no plano.'
          : 'Imagem ainda pending-pin — pinne a imagem do Pod LTX antes do create.',
    },
    {
      id: 'models_on_volume',
      ok: input.modelsPersistentlyVerified,
      required: true,
      label: 'Cinco modelos no Network Volume',
      detail: input.modelsPersistentlyVerified
        ? 'Snapshot confirma assets oficiais — sem redownload.'
        : 'Rode detecção S3/LTX e confirme 5/5 antes do teste pago.',
    },
    {
      id: 'workflow_ltx',
      ok: input.hasWorkflowMapping,
      required: true,
      label: 'Workflow LTX-2.3 importado',
      detail: input.workflowName || 'Importe o workflow API uma vez.',
    },
    {
      id: 'scene_ready',
      ok: sceneOk,
      required: true,
      label: 'Uma cena curta pronta',
      detail: sceneOk
        ? `Cena #${input.scene.number || '?'} com imagem, áudio e prompt.`
        : 'Falta imagem/áudio/prompt ou pasta do projeto.',
    },
    {
      id: 'url_gate',
      ok: true,
      required: false,
      label: 'URL só após Comfy real',
      detail: 'Orquestrador já bloqueia URL em dry-run e só salva após ready real.',
    },
    {
      id: 'single_scene_queue',
      ok: Boolean(input.scene.refId),
      required: true,
      label: 'Fila existente (1 cena)',
      detail: input.scene.refId
        ? `Enviar só refId=${input.scene.refId} via ComfyQueueService — sem lote automático.`
        : 'Selecione a cena de teste.',
    },
    {
      id: 'mp4_download_path',
      ok: Boolean(input.scene.outputDir),
      required: true,
      label: 'Download MP4 em lipsync/',
      detail: input.scene.outputDir || 'Vincule a pasta do projeto.',
    },
    {
      id: 'preserve_on_failure',
      ok: true,
      required: false,
      label: 'Preservar Pod antigo e arquivos em falha',
      detail: 'Recovery não faz terminate/delete; em falha o Pod antigo permanece.',
    },
    {
      id: 'auto_shutdown_pending',
      ok: true,
      required: false,
      label: 'Auto-desligamento',
      detail: 'Ainda NÃO implementado — risco de cobrança contínua até STOP manual.',
    },
    {
      id: 'no_batch_production',
      ok: true,
      required: false,
      label: 'Sem produção automática de lotes',
      detail: 'Bloqueado até o teste real de 1 cena passar.',
    },
  ]

  const blockers = checks.filter((check) => check.required && !check.ok).map((check) => check.detail)
  const continuousBillingRisks = [
    'Sem auto-shutdown: GPU continua cobrando após sucesso, erro ou cancelamento até STOP manual no Atlas/RunPod.',
    'Se o Pod antigo estiver RUNNING e o novo for criado sem STOP autorizado, há risco de cobrança dupla — a UI exige aceite explícito.',
    'Network Volume (70 GB) tem custo de armazenamento contínuo mesmo com GPU desligada (não é compute).',
    'Falha após create deixa o Pod novo potencialmente RUNNING — não há terminate automático; exige STOP manual.',
  ]

  const readyToAuthorizePaidRecovery = blockers.length === 0

  return {
    readyToAuthorizePaidRecovery,
    dryRunStarts: input.config.runpodDryRunStarts,
    autoShutdownImplemented: false,
    batchProductionAllowed: false,
    estimatedCostPerHr: recommended?.estimatedCostPerHr ?? input.preferredPod?.costPerHr ?? null,
    preferredPod: input.preferredPod,
    recovery: input.recovery,
    recommendedAction: recommended?.kind ?? 'none',
    continuousBillingRisks,
    authorizationSteps: [
      'Confirmar checklist verde neste painel (GET/dry-run).',
      'Desligar dry-run nas Configurações ComfyUI.',
      'Clicar Conectar ComfyUI — se GPU indisponível, escolher opção de recovery.',
      'Conferir GPU, US$/h, Pod/volume e marcar confirmações de cobrança (e STOP do antigo se RUNNING).',
      'Autorizar recovery — Atlas cria/reutiliza Pod, valida volume/modelos/nós/workflow e só então salva a URL.',
      'Enviar 1 cena curta manualmente (refId único) pela fila existente.',
      'Validar MP4 em lipsync/ antes de declarar sucesso.',
      'STOP manual do Pod (compute) — auto-shutdown ainda não existe.',
      'Não liberar lotes automáticos até este teste passar.',
    ],
    postSuccessReportFields: [
      'custo estimado US$/h da GPU usada',
      'podId / nome / status final',
      'URL ComfyUI salva',
      'caminho do MP4 e existência do arquivo',
      'se Pod antigo foi parado (não excluído)',
      'aviso de storage do Network Volume ainda ativo',
    ],
    checks,
    blockers,
    warnings: [
      ...continuousBillingRisks.slice(0, 2),
      input.gpuUnavailableDetected
        ? null
        : 'Sem evidência local ainda de GPU indisponível — o teste real de start/recovery só após sua autorização.',
    ].filter(Boolean) as string[],
    message: readyToAuthorizePaidRecovery
      ? 'Checklist pronto para autorização de recovery pago. Nenhuma operação paga foi executada nesta preparação.'
      : `Checklist incompleto: ${blockers[0]}`,
  }
}
