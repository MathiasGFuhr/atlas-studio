/**
 * Checklist do primeiro teste real LipSync (1 cena curta).
 * Não inicia GPU nem enfileira — só prepara/valida condições.
 */

import type { ComfyConfig } from './comfy'
import type { RunpodPodSummary } from './runpod'

export type LipsyncControlledTestCheckId =
  | 'api_key'
  | 'dry_run_off'
  | 'preferred_pod'
  | 'pod_volume_dc'
  | 'pod_stopped_or_ready'
  | 'workflow'
  | 'models_verified'
  | 'scene_image'
  | 'scene_audio'
  | 'scene_prompt'
  | 'output_folder'
  | 'auto_shutdown_absent'

export type LipsyncControlledTestCheck = {
  id: LipsyncControlledTestCheckId
  ok: boolean
  required: boolean
  label: string
  detail: string
}

export type LipsyncControlledTestPlan = {
  readyToAuthorizeStart: boolean
  readyToGenerateAfterConnect: boolean
  dryRunStarts: boolean
  autoShutdownImplemented: false
  estimatedCostPerHr: number | null
  preferredPod: RunpodPodSummary | null
  scene: {
    refId: string | null
    label: string | null
    number: string | null
    imagePath: string | null
    audioPath: string | null
    promptPreview: string | null
    outputDir: string | null
  }
  checks: LipsyncControlledTestCheck[]
  blockers: string[]
  warnings: string[]
  authorizationSteps: string[]
  message: string
}

export function buildLipsyncControlledTestPlan(input: {
  config: ComfyConfig
  preferredPod: RunpodPodSummary | null
  volumeDataCenterId: string | null
  modelsPersistentlyVerified: boolean
  scene: {
    refId: string | null
    label: string | null
    number: string | null
    imagePath: string | null
    audioPath: string | null
    prompt: string | null
    outputDir: string | null
  }
}): LipsyncControlledTestPlan {
  const pod = input.preferredPod
  const status = String(pod?.status || '').toUpperCase()
  const sameDc =
    Boolean(pod?.dataCenterId) &&
    Boolean(input.volumeDataCenterId) &&
    pod!.dataCenterId === input.volumeDataCenterId

  const checks: LipsyncControlledTestCheck[] = [
    {
      id: 'api_key',
      ok: input.config.hasRunpodApiKey,
      required: true,
      label: 'Chave RunPod',
      detail: input.config.hasRunpodApiKey
        ? 'Chave presente na conta do Atlas.'
        : 'Salve a chave da API do RunPod nas Configurações.',
    },
    {
      id: 'dry_run_off',
      ok: !input.config.runpodDryRunStarts,
      required: true,
      label: 'Dry-run desligado',
      detail: input.config.runpodDryRunStarts
        ? 'Simulação ainda ligada — desligue "Dry-run starts" nas Configurações ComfyUI para teste real.'
        : 'Starts reais habilitados (ainda exigem confirmação de cobrança).',
    },
    {
      id: 'preferred_pod',
      ok: Boolean(pod?.id && pod.hasComfyPort),
      required: true,
      label: 'Pod preferencial com porta 8188',
      detail: pod
        ? `${pod.name} · ${pod.gpuType || 'GPU n/d'} · ${pod.status}`
        : 'Nenhum Pod com ComfyUI identificado na conta.',
    },
    {
      id: 'pod_volume_dc',
      ok: sameDc,
      required: true,
      label: 'Mesmo datacenter do Network Volume (EU-RO-1)',
      detail: sameDc
        ? `Pod e volume em ${pod?.dataCenterId}.`
        : `Pod DC=${pod?.dataCenterId || 'n/d'} · Volume DC=${input.volumeDataCenterId || 'n/d'}.`,
    },
    {
      id: 'pod_stopped_or_ready',
      ok: Boolean(pod && (status === 'EXITED' || status === 'RUNNING' || status === 'STARTING' || status === 'PROVISIONING')),
      required: true,
      label: 'Pod desligado ou iniciável',
      detail: pod
        ? status === 'EXITED'
          ? 'Pod desligado — start real após autorização de custo.'
          : status === 'RUNNING'
            ? 'Pod já RUNNING — conexão real sem novo POST start.'
            : `Status atual: ${pod.status}.`
        : 'Pod ausente.',
    },
    {
      id: 'workflow',
      ok: Boolean(input.config.workflowMapping),
      required: true,
      label: 'Workflow LTX-2.3 importado',
      detail: input.config.workflowName
        ? `Workflow: ${input.config.workflowName}`
        : 'Importe o workflow API do LTX-2.3 uma vez.',
    },
    {
      id: 'models_verified',
      ok: input.modelsPersistentlyVerified,
      required: true,
      label: 'Cinco modelos LTX-2.3 verificados',
      detail: input.modelsPersistentlyVerified
        ? 'Snapshot/detecção confirma os 5 assets oficiais no volume.'
        : 'Rode a detecção LTX (com S3 se necessário) antes do teste real.',
    },
    {
      id: 'scene_image',
      ok: Boolean(input.scene.imagePath?.trim()),
      required: true,
      label: 'Cena com imagem',
      detail: input.scene.imagePath || 'Selecione/importe uma cena com imagem.',
    },
    {
      id: 'scene_audio',
      ok: Boolean(input.scene.audioPath?.trim()),
      required: true,
      label: 'Cena com áudio',
      detail: input.scene.audioPath || 'A cena precisa de áudio curto para o teste.',
    },
    {
      id: 'scene_prompt',
      ok: Boolean(input.scene.prompt?.trim()),
      required: true,
      label: 'Prompt da cena',
      detail: input.scene.prompt?.trim()
        ? input.scene.prompt.trim().slice(0, 120)
        : 'Preencha o prompt da cena de teste.',
    },
    {
      id: 'output_folder',
      ok: Boolean(input.scene.outputDir?.trim()),
      required: true,
      label: 'Pasta lipsync do projeto',
      detail: input.scene.outputDir
        ? `MP4 esperado em ${input.scene.outputDir}`
        : 'Vincule a pasta do projeto (Puxar da pasta).',
    },
    {
      id: 'auto_shutdown_absent',
      ok: true,
      required: false,
      label: 'Desligamento automático',
      detail:
        'Ainda NÃO implementado — acompanhe o custo no RunPod e desligue o Pod manualmente após o teste.',
    },
  ]

  const blockers = checks.filter((check) => check.required && !check.ok).map((check) => check.detail)
  const warnings = [
    'Desligamento automático ainda não foi implementado. A GPU continua cobrando até você parar o Pod no RunPod ou no Atlas (quando existir stop).',
    'Este plano não inicia GPU nem envia cenas — só valida condições.',
  ]

  const readyToAuthorizeStart = blockers.length === 0
  const readyToGenerateAfterConnect = readyToAuthorizeStart

  return {
    readyToAuthorizeStart,
    readyToGenerateAfterConnect,
    dryRunStarts: input.config.runpodDryRunStarts,
    autoShutdownImplemented: false,
    estimatedCostPerHr: pod?.costPerHr ?? null,
    preferredPod: pod,
    scene: {
      refId: input.scene.refId,
      label: input.scene.label,
      number: input.scene.number,
      imagePath: input.scene.imagePath,
      audioPath: input.scene.audioPath,
      promptPreview: input.scene.prompt?.trim() ? input.scene.prompt.trim().slice(0, 160) : null,
      outputDir: input.scene.outputDir,
    },
    checks,
    blockers,
    warnings,
    authorizationSteps: [
      'Desligar dry-run nas Configurações ComfyUI (RunPod).',
      'Clicar Conectar ComfyUI na aba LipSync.',
      'Conferir GPU, Pod e US$/h na confirmação.',
      'Marcar “Confirmo a cobrança…” e autorizar o start.',
      'Aguardar ComfyUI real (/system_stats + /object_info + modelos).',
      'Só então enviar 1 cena curta pela fila existente — não gerar automaticamente daqui.',
      'Após o MP4 na pasta lipsync, desligar o Pod manualmente (sem auto-shutdown).',
    ],
    message: readyToAuthorizeStart
      ? 'Checklist ok — você pode autorizar o start real com custo controlado. A geração NÃO será disparada automaticamente.'
      : `Checklist incompleto: ${blockers[0]}`,
  }
}
