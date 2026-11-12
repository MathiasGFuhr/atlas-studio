/**
 * Preparação pré-Fase 5 — validação real controlada (dry-run / aprovação).
 * Não cria recursos pagos; não inicia GPU; não altera Pods existentes.
 */

import type { LtxEnvironmentPlan } from './ltxEnvironment'
import { LTX_MINIMUM_VRAM_GB, LTX_RECOMMENDED_VRAM_GB } from './runpodLtxCompat'
import type { RunpodGpuCatalogEntry, RunpodNetworkVolumeSummary, RunpodPodSummary } from './runpod'
import { RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH_ESTIMATE } from './ltxMigration'

export type LtxModelInventoryRow = {
  role: string
  fileName: string
  folder: string
  absolutePath: string | null
  sizeBytes: number | null
  sizeGib: number | null
  versionHint: string | null
  present: boolean
  sha256: string | null
  sha256Status: 'confirmed' | 'pending_readonly_shell' | 'missing_file'
  sha256Command: string
}

export type LtxGpuPriorityOption = {
  priority: 1 | 2 | 3
  gpuId: string
  label: string
  memoryGb: number | null
  securePriceUsd: number | null
  communityPriceUsd: number | null
  catalogAvailability: string | null
  fitsVram: boolean
  dataCentersWithVolumeAndGpu: Array<{
    dataCenterId: string
    volumeTypes: string[]
    gpuAvailability: string
  }>
  notes: string[]
}

export type LtxControlledValidationPlan = {
  fetchedAt: string
  phase: 'pre5_controlled_validation'
  dryRun: true
  mutationCalls: 0
  advancedToPhase5: false
  protections: string[]
  modelInventory: {
    models: LtxModelInventoryRow[]
    totalBytes: number
    totalGib: number
    recommendedNetworkVolumeGb: number
    sha256Pending: boolean
    checksumScriptPath: string
  }
  dataCenters: {
    supportingNetworkVolumes: Array<{
      id: string
      region: string | null
      networkVolumeTypes: string[]
      compatibleGpuHits: string[]
    }>
    currentPodDataCenterId: string | null
    currentPodSupportsNetworkVolume: boolean
    recommendation: string
  }
  gpuPriorities: LtxGpuPriorityOption[]
  volumeSizing: {
    requiredGibExact: number
    recommendedGb: number
    estimatedStorageUsdPerMonth: number
    rateUsdPerGbMonth: number
  }
  backupCopyProcedure: {
    dryRun: true
    preserveOriginals: true
    steps: string[]
    forbidden: string[]
  }
  dockerfileParity: {
    matchesRuntimePins: boolean
    confirmed: string[]
    gaps: string[]
    verdict: string
  }
  lipsyncTest: {
    enabled: false
    requiresExplicitApproval: true
    sceneLimit: 1
    preferredMode: 'reuse_current_running_pod'
    preferredPodId: string | null
    workflowName: string
    maxUsdSuggested: number | null
    maxMinutesSuggested: number
    successCriteria: Array<{ id: string; description: string; verify: string }>
    blockedMessage: string
  }
  costEstimate: {
    currency: 'USD'
    scenarios: Array<{
      id: string
      title: string
      requiresNewPaidResources: boolean
      lines: Array<{ item: string; estimate: string; notes?: string }>
      totalRangeUsd: string
    }>
    notes: string[]
  }
  recoveryProcedure: {
    steps: Array<{ id: string; when: string; action: string; paid: boolean }>
  }
  paidActionsRequiringApproval: string[]
  approvalPrompt: string
}

/** Prioridades alinhadas ao Pod validado LTX (PRO 4500 32GB — não PRO 4000 / 4090). */
export const DEFAULT_LTX_GPU_PRIORITIES = [
  'NVIDIA RTX PRO 4500 Blackwell',
  'NVIDIA RTX PRO 4500 Blackwell Server Edition',
] as const

/** Só a família PRO 4500 é válida para create/recovery LTX (não L4, PRO 4000, 4090…). */
export function isAllowedLtxGpuId(gpuId: string | null | undefined): boolean {
  if (!gpuId) return false
  return /PRO 4500/i.test(gpuId)
}

/** Placas que o auto-detect/recovery não devem promover para LTX. */
export function isRejectedLtxGpuId(gpuId: string | null | undefined): boolean {
  if (!gpuId) return false
  return !isAllowedLtxGpuId(gpuId)
}

export function resolveLtxPreferredGpuOrder(plan: {
  primaryGpuId: string | null
  alternateGpuIds: [string | null, string | null]
}): string[] {
  const ordered = [
    plan.primaryGpuId,
    plan.alternateGpuIds[0],
    plan.alternateGpuIds[1],
    ...DEFAULT_LTX_GPU_PRIORITIES,
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ordered) {
    const trimmed = id?.trim()
    if (!trimmed || seen.has(trimmed) || isRejectedLtxGpuId(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function priceOf(entry: RunpodGpuCatalogEntry | undefined, cloud: 'SECURE' | 'COMMUNITY' | null) {
  if (!entry) return null
  if (cloud === 'COMMUNITY') return entry.communityPrice
  return entry.securePrice ?? entry.communityPrice
}

export function buildLtxControlledValidationPlan(input: {
  plan: LtxEnvironmentPlan
  pods: RunpodPodSummary[]
  catalog: RunpodGpuCatalogEntry[]
  networkVolumes: RunpodNetworkVolumeSummary[]
  dataCenters: Array<{
    id: string
    region?: string | null
    networkVolumeTypes?: string[] | null
    gpuAvailability?: Array<{ id: string; availability: string }> | null
  }>
  modelInventory: {
    models: LtxModelInventoryRow[]
    totalBytes: number
    totalGib: number
    recommendedNetworkVolumeGb: number
  }
  runtime: {
    comfyuiVersion: string | null
    pytorchVersion: string | null
    pythonVersion: string | null
    gpuName: string | null
    vramTotalGb: number | null
  }
  preferredPodId: string | null
  workflowName: string
  currentComfyBaseUrl: string
}): LtxControlledValidationPlan {
  const fetchedAt = new Date().toISOString()
  const currentPod =
    input.pods.find((pod) => pod.id === input.preferredPodId) ||
    input.pods.find((pod) => pod.comfyProxyUrl && /comfy|ltx|mouse/i.test(pod.name)) ||
    input.pods.find((pod) => String(pod.status).toUpperCase() === 'RUNNING' && pod.hasComfyPort) ||
    null

  const currentDc =
    currentPod?.dataCenterId ||
    input.pods.find((pod) => /PRO 4500|ltx|mouse/i.test(`${pod.name} ${pod.gpuType}`))?.dataCenterId ||
    null

  const dcWithVolumes = input.dataCenters.filter(
    (dc) => Array.isArray(dc.networkVolumeTypes) && dc.networkVolumeTypes.length > 0,
  )
  const currentDcMeta = input.dataCenters.find((dc) => dc.id === currentDc)
  const currentPodSupportsNetworkVolume = Boolean(currentDcMeta?.networkVolumeTypes?.length)

  const priorityIds = [
    ...resolveLtxPreferredGpuOrder(input.plan),
  ]

  const gpuPriorities: LtxGpuPriorityOption[] = priorityIds.map((gpuId, index) => {
    const hit = input.catalog.find((gpu) => gpu.id === gpuId || gpu.name === gpuId)
    const memoryGb = hit?.memoryGb ?? null
    const dcs = dcWithVolumes
      .map((dc) => {
        const avail = dc.gpuAvailability?.find((row) => row.id === gpuId)
        if (!avail || avail.availability === 'NONE') return null
        return {
          dataCenterId: dc.id,
          volumeTypes: [...(dc.networkVolumeTypes ?? [])],
          gpuAvailability: avail.availability,
        }
      })
      .filter(Boolean) as LtxGpuPriorityOption['dataCentersWithVolumeAndGpu']

    const notes: string[] = []
    if (!hit) notes.push('GPU ausente do catálogo atual.')
    if (memoryGb != null && memoryGb < LTX_MINIMUM_VRAM_GB) {
      notes.push(`VRAM ${memoryGb} GB < mínimo LTX ${LTX_MINIMUM_VRAM_GB} GB.`)
    }
    if (hit?.availability === 'NONE') notes.push('Disponibilidade global NONE no catálogo.')
    if (dcs.length === 0) {
      notes.push('Nenhum DC com Network Volume + esta GPU disponível agora.')
    }
    if (currentDc && !currentPodSupportsNetworkVolume) {
      notes.push(
        `Pod LTX atual está em ${currentDc}, que neste snapshot NÃO lista networkVolumeTypes — volume novo exigiria outro DC.`,
      )
    }

    return {
      priority: (index + 1) as 1 | 2 | 3,
      gpuId,
      label: hit?.name || gpuId,
      memoryGb,
      securePriceUsd: hit?.securePrice ?? null,
      communityPriceUsd: hit?.communityPrice ?? null,
      catalogAvailability: hit?.availability ?? null,
      fitsVram: memoryGb == null ? true : memoryGb >= LTX_MINIMUM_VRAM_GB,
      dataCentersWithVolumeAndGpu: dcs,
      notes,
    }
  })

  const supportingNetworkVolumes = dcWithVolumes.map((dc) => {
    const compatibleGpuHits = (dc.gpuAvailability ?? [])
      .filter(
        (row) =>
          row.availability !== 'NONE' &&
          (priorityIds.includes(row.id) ||
            /4090|A6000|A5000|4500|6000 Ada/i.test(row.id)),
      )
      .map((row) => `${row.id} (${row.availability})`)
    return {
      id: dc.id,
      region: dc.region ?? null,
      networkVolumeTypes: [...(dc.networkVolumeTypes ?? [])],
      compatibleGpuHits,
    }
  })

  const totalGib = input.modelInventory.totalGib
  const recommendedGb = input.modelInventory.recommendedNetworkVolumeGb
  const storageMonth =
    Math.round(recommendedGb * RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH_ESTIMATE * 100) / 100

  const runningPod = input.pods.find((pod) => String(pod.status).toUpperCase() === 'RUNNING' && pod.hasComfyPort)
  const gpuHour = runningPod?.costPerHr ?? priceOf(
    input.catalog.find((g) => g.id === priorityIds[0]),
    input.plan.preferredCloud,
  )
  const testMinutes = 15
  const testGpuCost =
    gpuHour != null ? Math.round(((gpuHour * testMinutes) / 60) * 100) / 100 : null

  const dockerfileConfirmed: string[] = []
  const dockerfileGaps: string[] = []
  if (input.runtime.comfyuiVersion) {
    dockerfileConfirmed.push(`ComfyUI ${input.runtime.comfyuiVersion} (comentado no Dockerfile)`)
  } else dockerfileGaps.push('ComfyUI version ausente')
  if (input.runtime.pytorchVersion) {
    dockerfileConfirmed.push(`PyTorch ${input.runtime.pytorchVersion}`)
  } else dockerfileGaps.push('PyTorch ausente')
  if (input.runtime.pythonVersion) {
    dockerfileConfirmed.push(`Python ${input.runtime.pythonVersion.split(' ')[0]}`)
  } else dockerfileGaps.push('Python ausente')
  dockerfileGaps.push('nvidia-smi / CUDA driver exacto não confirmado')
  dockerfileGaps.push('pip freeze completo do Pod não capturado — Dockerfile não é réplica bit-a-bit das deps pip')
  dockerfileGaps.push('Commit SHA git do ComfyUI 0.30.0 não verificado no disco do Pod')
  dockerfileGaps.push('Pacotes apt extras da imagem runpod-slim não inventariados')

  const sha256Pending = input.modelInventory.models.some((m) => m.sha256Status !== 'confirmed')

  const paidActionsRequiringApproval = [
    'Executar shell read-only no Pod para sha256sum (escreve só /workspace/ltx-model-sha256.txt) — se o Pod estiver parado, start gera custo de GPU.',
    'Criar Network Volume (armazenamento mensal) — bloqueado até aprovação específica.',
    'Criar Pod novo em DC com volume (compute) — bloqueado; não excluir Pods atuais.',
    'Teste LipSync real de 1 cena no Pod atual RUNNING — custo de tempo de GPU; exige teto USD + minutos.',
    'pip freeze / nvidia-smi no Pod (read-only) para fechar paridade do Dockerfile.',
    'Não avançar para Fase 5 / failover automático sem comprovar recuperação real.',
  ]

  return {
    fetchedAt,
    phase: 'pre5_controlled_validation',
    dryRun: true,
    mutationCalls: 0,
    advancedToPhase5: false,
    protections: [
      'Não modificar nem excluir Pods existentes.',
      'Não substituir o ambiente LTX-2.3 atual.',
      'Não criar Network Volume ou Pod sem aprovação específica.',
      'Não iniciar GPU automaticamente (dry-run ativo).',
      'Não avançar failover automático sem recuperação comprovada.',
      'Preservar fila LipSync, downloads, FFmpeg e modo manual.',
    ],
    modelInventory: {
      models: input.modelInventory.models,
      totalBytes: input.modelInventory.totalBytes,
      totalGib,
      recommendedNetworkVolumeGb: recommendedGb,
      sha256Pending,
      checksumScriptPath: 'resources/ltx-environment/checksum-models-readonly.sh',
    },
    dataCenters: {
      supportingNetworkVolumes: supportingNetworkVolumes
        .filter((dc) => dc.compatibleGpuHits.length > 0 || dc.id === currentDc)
        .sort((a, b) => b.compatibleGpuHits.length - a.compatibleGpuHits.length),
      currentPodDataCenterId: currentDc,
      currentPodSupportsNetworkVolume,
      recommendation: input.plan.networkVolumeId
        ? `Usar Network Volume existente ${input.plan.networkVolumeId} em ${input.plan.preferredDataCenterId ?? 'DC do plano'} — NÃO criar outro. Teste LipSync (caminho A) no Pod atual; migração (caminho B) = Pod novo nesse DC anexando o volume.`
        : currentPodSupportsNetworkVolume
          ? `Manter Network Volume no DC atual ${currentDc}.`
          : `DC atual ${currentDc ?? '(desconhecido)'} NÃO oferece Network Volume neste catálogo. Teste LipSync no Pod atual; volume futuro em DC compatível (ex. EU-RO-1).`,
    },
    gpuPriorities,
    volumeSizing: {
      requiredGibExact: totalGib,
      recommendedGb: input.plan.networkVolumeSizeGb ?? recommendedGb,
      estimatedStorageUsdPerMonth:
        input.plan.networkVolumeSizeGb != null
          ? Math.round(input.plan.networkVolumeSizeGb * RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH_ESTIMATE * 100) /
            100
          : storageMonth,
      rateUsdPerGbMonth: RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH_ESTIMATE,
    },
    backupCopyProcedure: {
      dryRun: true,
      preserveOriginals: true,
      steps: [
        '1. Inventário + SHA-256 (shell read-only) no Pod de origem — não mover/apagar.',
        input.plan.networkVolumeId
          ? `2. Volume já existe (${input.plan.networkVolumeId}) — NÃO criar outro.`
          : '2. Após aprovação: criar Network Volume no DC alvo (tamanho recomendado).',
        '3. Anexar volume apenas em Pod NOVO no mesmo DC do volume (não reformatar disco dos Pods atuais).',
        '4. Copiar com rsync/cp -a para o volume; recalcular SHA-256 no destino.',
        '5. Comparar hashes origem×destino; só então softlink /ComfyUI/models → volume.',
        '6. Manter originais intactos nos Pods atuais; teste de 1 cena (caminho A) é independente da migração.',
      ],
      forbidden: [
        'rm / rm -rf nos diretórios de modelos de origem',
        'terminate/delete dos Pods existentes',
        'Overwrite in-place sem backup verificado',
      ],
    },
    dockerfileParity: {
      matchesRuntimePins: dockerfileGaps.length <= 4 && Boolean(input.runtime.comfyuiVersion),
      confirmed: dockerfileConfirmed,
      gaps: dockerfileGaps,
      verdict:
        'Pins principais (ComfyUI/PyTorch/Python) alinhados ao inventário HTTP, mas o Dockerfile AINDA NÃO reproduz exatamente todas as dependências do ambiente atual até pip freeze + nvidia-smi + SHA git.',
    },
    lipsyncTest: {
      enabled: false,
      requiresExplicitApproval: true,
      sceneLimit: 1,
      preferredMode: 'reuse_current_running_pod',
      preferredPodId: runningPod?.id ?? currentPod?.id ?? input.preferredPodId,
      workflowName: input.workflowName || 'video_ltx2_3_ia2v.json',
      maxUsdSuggested: testGpuCost != null ? Math.max(0.5, testGpuCost * 3) : 1,
      maxMinutesSuggested: testMinutes,
      successCriteria: [
        {
          id: 'comfy-healthy',
          description: 'ComfyUI saudável',
          verify: 'GET /system_stats → ok; comfyui_version presente; VRAM reportada',
        },
        {
          id: 'models-loaded',
          description: 'Modelos carregados',
          verify: 'GET /models/{folder} contém os 5 assets; opcionalmente hashes conferidos',
        },
        {
          id: 'workflow-ran',
          description: 'Workflow executado',
          verify: 'POST /prompt (só após aprovação) retorna prompt_id; history completed sem execution_error',
        },
        {
          id: 'video-generated',
          description: 'Vídeo gerado',
          verify: 'history.outputs do SaveVideo com filename',
        },
        {
          id: 'video-downloaded',
          description: 'Vídeo baixado',
          verify: 'Arquivo local em lipsync/ da pasta do projeto; tamanho > 0',
        },
        {
          id: 'video-validated',
          description: 'Vídeo validado',
          verify: 'ffprobe/FFmpeg: duração ≈ áudio; stream de vídeo legível; trimToAudio se habilitado',
        },
      ],
      blockedMessage:
        'Teste real bloqueado. Autorize explicitamente: pod alvo, custo máximo USD, limite de minutos, e confirme que NÃO criar volume/Pod nesta autorização (ou autorize-os em separado).',
    },
    costEstimate: {
      currency: 'USD',
      scenarios: [
        {
          id: 'A_current_pod_lipsync',
          title: 'Teste LipSync no Pod atual (sem criar volume/Pod)',
          requiresNewPaidResources: false,
          lines: [
            {
              item: 'GPU já RUNNING (custo contínuo)',
              estimate: gpuHour != null ? `US$ ${gpuHour}/h` : 'consultar Pod',
              notes: runningPod
                ? `Pod ${runningPod.id} já ligado — o teste só consome minutos adicionais.`
                : 'Se o Pod estiver EXITED, start exige aprovação (Fase 2).',
            },
            {
              item: `Tempo estimado do teste (≤${testMinutes} min, 1 cena)`,
              estimate: testGpuCost != null ? `≈ US$ ${testGpuCost}` : 'n/d',
            },
            {
              item: 'Network Volume neste cenário',
              estimate: 'US$ 0 adicional',
              notes: input.plan.networkVolumeId
                ? `Volume ${input.plan.networkVolumeId} existe mas NÃO é usado no caminho A (DC diferente do Pod atual).`
                : 'Sem uso de Network Volume no caminho A.',
            },
            {
              item: 'Transferência (download do mp4)',
              estimate: 'desprezível',
              notes: 'Proxy RunPod; vídeo curto.',
            },
          ],
          totalRangeUsd:
            testGpuCost != null
              ? `≈ US$ ${testGpuCost}–${Math.round(testGpuCost * 3 * 100) / 100} (só minutos de GPU)`
              : 'definir após preço do Pod',
        },
        {
          id: 'B_volume_plus_new_pod',
          title: 'Migração futura (volume + Pod novo) — NÃO executar agora',
          requiresNewPaidResources: true,
          lines: [
            {
              item: `Network Volume ${recommendedGb} GB`,
              estimate: `≈ US$ ${storageMonth}/mês`,
              notes: `Taxa estimada ${RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH_ESTIMATE}/GB/mês — confirmar no console.`,
            },
            {
              item: 'Pod novo com GPU LTX',
              estimate: gpuPriorities[0]?.securePriceUsd != null
                ? `a partir de US$ ${Math.min(
                    ...gpuPriorities
                      .map((g) => g.securePriceUsd)
                      .filter((v): v is number => v != null),
                  )}/h`
                : 'ver catálogo',
              notes: 'Somente após aprovação; DC deve ter volume + GPU.',
            },
            {
              item: 'Cópia dos ~40 GiB',
              estimate: 'tempo de GPU/rede se feita de dentro do Pod',
              notes: 'Não iniciar sem autorização.',
            },
          ],
          totalRangeUsd: `armazenamento ≈ US$ ${storageMonth}/mês + compute horário (aprovação separada)`,
        },
      ],
      notes: [
        'Nenhuma cobrança nova foi disparada por este relatório.',
        `Volumes na conta agora: ${input.networkVolumes.length}.`,
        `VRAM mínima planejamento LTX: ${LTX_MINIMUM_VRAM_GB} GB; recomendada: ${LTX_RECOMMENDED_VRAM_GB} GB.`,
        'URL Comfy atual: ' + (input.currentComfyBaseUrl || '(vazia)'),
      ],
    },
    recoveryProcedure: {
      steps: [
        {
          id: 'fail-inventory',
          when: 'Inventário/HTTP falhar',
          action: 'Manter Pods intactos; repetir GET; não criar recursos.',
          paid: false,
        },
        {
          id: 'fail-sha',
          when: 'SHA-256 divergir na cópia futura',
          action: 'Abortar softlink; manter originais; recopy; não apagar origem.',
          paid: false,
        },
        {
          id: 'fail-comfy-boot',
          when: 'Novo ambiente não sobe /object_info incompleto',
          action: 'Voltar ao Pod LTX atual; não terminate do antigo.',
          paid: false,
        },
        {
          id: 'fail-lipsync',
          when: 'Cena de teste falhar',
          action: 'Capturar history/error; não retry em lote; fila manual preservada.',
          paid: false,
        },
        {
          id: 'fail-gpu-gone',
          when: 'GPU original sumir do catálogo',
          action: 'Usar plano de recuperação ≤3 opções (dry-run); sem failover automático.',
          paid: false,
        },
        {
          id: 'paid-recovery-pod',
          when: 'Precisar Pod novo após falha',
          action: 'Parar e pedir aprovação explícita de custo antes de create.',
          paid: true,
        },
      ],
    },
    paidActionsRequiringApproval,
    approvalPrompt: [
      'APROVAÇÃO NECESSÁRIA ANTES DE QUALQUER GERAÇÃO.',
      'Caminho A (teste 1 cena no Pod atual — sem volume/migração):',
      'AUTORIZO teste LipSync 1 cena',
      `podId=${runningPod?.id ?? currentPod?.id ?? input.preferredPodId ?? 'd3ewr3ge0uk002'}`,
      `maxUsd=${testGpuCost != null ? Math.max(0.5, testGpuCost * 3) : 0.54}`,
      `maxMinutes=${testMinutes}`,
      'caminho=A',
      'confirmar: sem criar volume/Pod; sem copiar modelos; sem migração EU-RO-1',
      'maxMinutes=relógio de parede da sessão; maxUsd=teto incremental (não desliga o Pod sozinho).',
      'Caminho B (Pod novo + volume existente) exige autorização SEPARADA.',
    ].join('\n'),
  }
}
