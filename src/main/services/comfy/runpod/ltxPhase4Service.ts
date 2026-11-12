/**
 * Fase 4 — validação controlada do ambiente LTX reproduzível.
 * Dry-run / mocks / leitura apenas. Sem provisionamento pago.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { ComfyApiWorkflow } from '../../../../shared/comfy'
import {
  auditLtxWorkflowEvidence,
  buildLtxPrepReadiness,
  evaluateGpuFailover,
  LTX_IA2V_OFFICIAL_MODEL_ASSETS,
  normalizeLtxEnvironmentPlan,
  type LtxControlledLipsyncTestGate,
  type LtxEnvironmentPlan,
  type LtxEnvironmentPrepStatus,
} from '../../../../shared/ltxEnvironment'
import { buildLtxMigrationPlan } from '../../../../shared/ltxMigration'
import type { ComfyPodInventoryResult, LtxPhase4ValidationStatus } from '../../../../shared/ltxPhase4'
import { planLtxGpuRecovery } from '../../../../shared/ltxRecovery'
import type { LtxWorkflowAnalysis } from '../../../../shared/ltxWorkflowAnalysis'
import { workflowRequiredClassTypes } from '../../../../shared/runpodLtxCompat'
import { logger } from '../../logging/logger'
import { createRunpodClient } from '../runpod'
import { summarizeGpuType, summarizeNetworkVolume, summarizeV2Pod } from './mapRunpodV2'
import { inspectComfyPodReadOnly } from './comfyPodInventory'
import { exportLtxWorkflowFromSqlite } from './exportLtxWorkflow'
import { getLtxEnvironmentPlan } from './ltxEnvironmentService'

export type { LtxPhase4ValidationStatus }

export type ValidateLtxPhase4Deps = {
  getApiKey: () => string
  getPlan?: () => LtxEnvironmentPlan
  getWorkflowName: () => string
  getWorkflow: () => ComfyApiWorkflow | null
  getComfyBaseUrl: () => string
  getPreferredPodId: () => string | null
  createClient?: typeof createRunpodClient
  inspectInventory?: typeof inspectComfyPodReadOnly
  exportWorkflow?: typeof exportLtxWorkflowFromSqlite
  resourcesDir?: string
  writeExportFiles?: boolean
  log?: (event: string, data?: Record<string, unknown>) => void
}

function resourcesDir(override?: string): string {
  return override ?? path.join(process.cwd(), 'resources', 'ltx-environment')
}

function buildReproducibleEnvNotes(inventory: ComfyPodInventoryResult, analysis: LtxWorkflowAnalysis) {
  const dir = resourcesDir()
  const dockerfilePath = path.join(dir, 'Dockerfile')
  const requirementsPath = path.join(dir, 'requirements.manifest.txt')
  const manifestPath = path.join(dir, 'template.manifest.json')
  const pinsComplete = Boolean(
    inventory.accessible &&
      inventory.system.comfyuiVersion &&
      inventory.system.pytorchVersion &&
      inventory.system.pythonVersion,
  )

  const integrityChecks = [
    'Comparar nomes dos 5 assets IA2V oficiais com GET /models/{folder}.',
    'Após cópia autorizada: sha256sum (ou equivalente) no volume vs inventário de origem.',
    'Recusar boot de produção se algum modelo referenciado no workflow estiver ausente.',
  ]
  const bootValidations = [
    'GET /system_stats → ok + comfyui_version.',
    `GET /object_info contém: ${analysis.classTypes.slice(0, 8).join(', ')}${analysis.classTypes.length > 8 ? '…' : ''}.`,
    'Marcador TextGenerateLTX2Prompt presente.',
    'Porta 8188 escutando; proxy RunPod responde.',
  ]

  return {
    dockerfilePath,
    requirementsPath,
    manifestPath,
    integrityChecks,
    bootValidations,
    pinsComplete,
    notes: [
      pinsComplete
        ? 'Versões lidas do Pod — revisar Dockerfile/requirements antes de build autorizado.'
        : 'Pins de runtime ainda incompletos (Pod inacessível ou campos ausentes). Dockerfile permanece com placeholders documentados.',
      'Modelos NÃO entram na imagem — apenas no Network Volume.',
      'Nenhum docker build/push é executado nesta fase.',
    ],
  }
}

function syncManifestFromConfirmed(analysis: LtxWorkflowAnalysis, inventory: ComfyPodInventoryResult, dir: string) {
  const manifestPath = path.join(dir, 'template.manifest.json')
  let previous: Record<string, unknown> = {}
  try {
    previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  } catch {
    previous = {}
  }

  const workflowModels = analysis.modelRefs.map((ref) => ({
    nodeId: ref.nodeId,
    classType: ref.classType,
    field: ref.field,
    fileName: ref.fileName,
    official: Boolean(ref.officialMatch),
    evidence: ref.evidence,
  }))

  const next = {
    ...previous,
    id: 'atlas-ltx-2.3-ia2v',
    phase: 4,
    dryRunOnly: true,
    containerPort: 8188,
    updatedAt: new Date().toISOString(),
    workflow: {
      atlasName: 'video_ltx2_3_ia2v.json',
      exportedFile: 'exported-workflow-from-sqlite.json',
      inRepository: true,
      nodeCount: analysis.nodeCount,
      classTypeCount: analysis.classTypes.length,
      evidence: analysis.source === 'sqlite_import' ? 'confirmed_in_repo' : 'needs_user_validation',
      notes: analysis.comparisonNotes.join(' '),
    },
    workflowModelsFromSqlite: workflowModels,
    runtime: {
      python: {
        value: inventory.system.pythonVersion,
        evidence: inventory.system.pythonVersion ? 'confirmed_in_repo' : 'needs_pod_inspection',
      },
      pytorch: {
        value: inventory.system.pytorchVersion,
        evidence: inventory.system.pytorchVersion ? 'confirmed_in_repo' : 'needs_pod_inspection',
      },
      cuda: {
        value: null,
        evidence: 'needs_pod_inspection',
        notes: 'nvidia-smi no Pod — não exposto via HTTP ComfyUI.',
      },
      comfyui: {
        value: inventory.system.comfyuiVersion,
        evidence: inventory.system.comfyuiVersion ? 'confirmed_in_repo' : 'needs_pod_inspection',
      },
      gpuName: inventory.system.gpuName,
      vramTotalGb: inventory.system.vramTotalGb,
    },
    inventoryAccessible: inventory.accessible,
    pendingInventoryChecks: inventory.pendingChecks,
    modelsSeparateFromImage: true,
    modelsMountPath: '/runpod-volume/models',
    ia2vOfficialAssets: LTX_IA2V_OFFICIAL_MODEL_ASSETS.map((asset) => ({
      role: asset.role,
      path: `${asset.relativeDir}/${asset.expectedFileName}`,
      evidence: asset.evidence,
      presentOnPod:
        inventory.models.find((row) => row.expectedFileName === asset.expectedFileName)?.present ?? null,
    })),
  }

  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return manifestPath
}

function writeRequirementsManifest(inventory: ComfyPodInventoryResult, analysis: LtxWorkflowAnalysis, dir: string) {
  const lines = [
    '# Atlas Studio — manifesto de dependências LTX-2.3 (Fase 4)',
    '# NÃO instalar automaticamente. Pins preenchidos só com evidência do Pod.',
    '#',
    `# Workflow: ${analysis.nodeCount} nós · class_types: ${analysis.classTypes.length}`,
    `# Inventário acessível: ${inventory.accessible}`,
    `# ComfyUI: ${inventory.system.comfyuiVersion ?? 'PENDING_POD_INSPECTION'}`,
    `# PyTorch: ${inventory.system.pytorchVersion ?? 'PENDING_POD_INSPECTION'}`,
    `# Python: ${inventory.system.pythonVersion ?? 'PENDING_POD_INSPECTION'}`,
    `# CUDA: PENDING_POD_INSPECTION (nvidia-smi)`,
    '#',
    '# Runtime (preencher após inspeção):',
    `# torch==${inventory.system.pytorchVersion ?? 'X.Y.Z'}`,
    '# ComfyUI @ git commit SHA confirmado no Pod',
    '#',
    '# Modelos (volume, não pip):',
    ...LTX_IA2V_OFFICIAL_MODEL_ASSETS.map(
      (asset) => `# - ${asset.relativeDir}/${asset.expectedFileName}`,
    ),
    '#',
    '# class_types exigidos pelo workflow exportado:',
    ...analysis.classTypes.map((name) => `# - ${name}`),
    '',
  ]
  const out = path.join(dir, 'requirements.manifest.txt')
  fs.writeFileSync(out, lines.join('\n'), 'utf8')
  return out
}

function writeDockerfileFromConfirmed(inventory: ComfyPodInventoryResult, analysis: LtxWorkflowAnalysis, dir: string) {
  const comfy = inventory.system.comfyuiVersion ?? '<COMFYUI_VERSION_PENDING>'
  const torch = inventory.system.pytorchVersion ?? '<TORCH_VERSION_PENDING>'
  const py = inventory.system.pythonVersion ?? '<PYTHON_VERSION_PENDING>'
  const content = `# syntax=docker/dockerfile:1
# Atlas Studio — ComfyUI LTX-2.3 reproduzível (Fase 4)
# DRY-RUN / SPEC VERSIONADO — NÃO fazer build/push sem autorização explícita.
# Modelos ficam no Network Volume (/runpod-volume), NÃO nesta imagem.

# Pins observados no inventário (pode ser PENDING se o Pod estava inacessível):
#   ComfyUI: ${comfy}
#   PyTorch: ${torch}
#   Python:  ${py}
#   CUDA:    (nvidia-smi no Pod — PENDING_POD_INSPECTION)
# Workflow exportado: ${analysis.nodeCount} nós, marcador LTX=${analysis.hasLtxMarker}

ARG CUDA_TAG=12.8.0-runtime-ubuntu24.04
FROM nvidia/cuda:\${CUDA_TAG}

ENV DEBIAN_FRONTEND=noninteractive \\
    COMFY_PORT=8188 \\
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \\
      git python3 python3-pip python3-venv ffmpeg \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
# PIN: substituir TORCH_VERSION após confirmação no Pod (inventário Fase 4).
# RUN pip3 install --no-cache-dir torch==${torch === '<TORCH_VERSION_PENDING>' ? 'X.Y.Z' : torch} --index-url https://download.pytorch.org/whl/cu128

# PIN: clonar ComfyUI e checkout no commit/SHA que corresponde a ${comfy}
# RUN git clone https://github.com/comfyanonymous/ComfyUI.git /ComfyUI \\
#  && cd /ComfyUI && git checkout <COMMIT_SHA_PENDING>

# LTX-2.3: suporte nativo no ComfyUI atual (docs.comfy.org).
# Custom nodes extras: só se o inventário /object_info exigir além do core.

# Softlink de modelos → Network Volume (anexado na criação do Pod)
# RUN mkdir -p /runpod-volume/models \\
#  && rm -rf /ComfyUI/models \\
#  && ln -s /runpod-volume/models /ComfyUI/models

VOLUME ["/runpod-volume"]
EXPOSE 8188
WORKDIR /ComfyUI

# Verificações de inicialização (executar no entrypoint autorizado):
# 1) test -d /ComfyUI
# 2) python -c "import torch; print(torch.__version__)"
# 3) curl -sf localhost:8188/system_stats
# 4) validar class_types LTX + presença dos safetensors no volume

CMD ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188"]
`
  const out = path.join(dir, 'Dockerfile')
  fs.writeFileSync(out, content, 'utf8')
  // Mantém o .spec legado apontando para o Dockerfile versionado.
  fs.writeFileSync(
    path.join(dir, 'Dockerfile.spec'),
    `# Ver Dockerfile nesta pasta (Fase 4). Build/push proibidos sem autorização.\n# Pins: ComfyUI=${comfy} PyTorch=${torch} Python=${py}\n`,
    'utf8',
  )
  return out
}

/**
 * Orquestra exportação, inventário, migração, recuperação e artefatos reproduzíveis.
 */
export async function validateLtxPhase4(deps: ValidateLtxPhase4Deps): Promise<LtxPhase4ValidationStatus> {
  const fetchedAt = new Date().toISOString()
  const plan = deps.getPlan?.() ?? getLtxEnvironmentPlan()
  const workflow = deps.getWorkflow()
  const workflowName = deps.getWorkflowName()
  const log = deps.log ?? ((event, data) => logger.info(event, data))
  const dir = resourcesDir(deps.resourcesDir)

  log('ltx.phase4.validate.start', { dryRun: true })

  const exportWorkflow = deps.exportWorkflow ?? exportLtxWorkflowFromSqlite
  const workflowExport = exportWorkflow({
    workflow,
    workflowName,
    resourcesDir: dir,
    writeFiles: deps.writeExportFiles !== false,
  })
  const workflowAnalysis = workflowExport.analysis

  const inventory = await (deps.inspectInventory ?? inspectComfyPodReadOnly)(
    deps.getComfyBaseUrl(),
    workflow,
  )

  writeDockerfileFromConfirmed(inventory, workflowAnalysis, dir)
  writeRequirementsManifest(inventory, workflowAnalysis, dir)
  syncManifestFromConfirmed(workflowAnalysis, inventory, dir)

  let pods: ReturnType<typeof summarizeV2Pod>[] = []
  let gpuCatalog = [] as ReturnType<typeof summarizeGpuType>[]
  let networkVolumes = [] as ReturnType<typeof summarizeNetworkVolume>[]
  const apiKey = deps.getApiKey().trim()

  if (apiKey) {
    try {
      const client = (deps.createClient ?? createRunpodClient)(apiKey)
      const [podsV2, gpus, volumes] = await Promise.all([
        client.listPods(),
        client.listGpuTypes({ includeAvailability: true }).catch(() => []),
        client.listNetworkVolumes().catch(() => []),
      ])
      pods = podsV2.filter((pod) => pod.id).map(summarizeV2Pod)
      gpuCatalog = gpus.map(summarizeGpuType)
      networkVolumes = volumes.map(summarizeNetworkVolume)
    } catch (error) {
      log('ltx.phase4.api_failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const migration = buildLtxMigrationPlan({
    plan,
    pods,
    networkVolumes,
    workflowAnalysis,
  })

  const recovery = planLtxGpuRecovery({
    plan,
    preferredPodId: deps.getPreferredPodId(),
    pods,
    catalog: gpuCatalog,
  })

  const evidence = auditLtxWorkflowEvidence(workflow, workflowName)
  evidence.unshift({
    id: 'workflow-exported-phase4',
    label: 'Exportação Fase 4 do SQLite',
    value: workflowExport.ok
      ? `${workflowExport.nodeCount} nós → ${workflowExport.exportPath ?? 'memória'}`
      : workflowExport.message,
    evidence: workflowExport.ok ? 'confirmed_in_repo' : 'needs_user_validation',
  })
  if (inventory.accessible) {
    evidence.push({
      id: 'pod-inventory',
      label: 'Inventário ComfyUI',
      value: `ComfyUI ${inventory.system.comfyuiVersion ?? '?'} · torch ${inventory.system.pytorchVersion ?? '?'}`,
      evidence: 'confirmed_in_repo',
    })
  } else {
    evidence.push({
      id: 'pod-inventory',
      label: 'Inventário ComfyUI',
      value: 'pendente (Pod inacessível)',
      evidence: 'needs_pod_inspection',
      notes: inventory.pendingChecks.join(' | '),
    })
  }

  const gpuFailover = evaluateGpuFailover(plan, gpuCatalog)
  const accountHasNetworkVolume = networkVolumes.length > 0
  const preferredDataCenterId =
    plan.preferredDataCenterId ||
    pods.find((pod) => /comfy|ltx/i.test(`${pod.name} ${pod.image ?? ''}`))?.dataCenterId ||
    pods[0]?.dataCenterId ||
    null

  let dataCenterConflict = false
  if (plan.networkVolumeId && preferredDataCenterId) {
    const vol = networkVolumes.find((entry) => entry.id === plan.networkVolumeId)
    if (vol?.dataCenterId && vol.dataCenterId !== preferredDataCenterId) {
      dataCenterConflict = true
    }
  }

  const templateBlockers: string[] = []
  if (!plan.templateTagPinned || plan.templateImage.includes('pending-pin')) {
    templateBlockers.push('Imagem/tag ainda não pinadas após inspeção do Pod.')
  }

  const readiness = buildLtxPrepReadiness({
    plan,
    accountHasNetworkVolume,
    workflowPresent: Boolean(workflow),
    gpuFailover,
    templatePinned: plan.templateTagPinned && !plan.templateImage.includes('pending-pin'),
  })

  if (workflowExport.ok && inventory.accessible && readiness.level === 'planned') {
    readiness.nextSteps.push(
      'Fase 4: inventário OK — autorizar operações pagas (volume/Pod) antes da Fase 5.',
    )
  }

  const prep: LtxEnvironmentPrepStatus = {
    fetchedAt,
    dryRun: true,
    mutationCalls: 0,
    plan: normalizeLtxEnvironmentPlan(plan),
    evidence,
    models: LTX_IA2V_OFFICIAL_MODEL_ASSETS,
    workflowName,
    workflowClassTypes: workflowRequiredClassTypes(workflow),
    storage: {
      strategy: plan.storageStrategy,
      networkVolumes,
      accountHasNetworkVolume,
      preferredDataCenterId,
      dataCenterConflict,
      recommendation: migration.steps.find((step) => step.id === 'create-network-volume')?.detail ?? '',
    },
    template: {
      image: plan.templateImage,
      pinned: plan.templateTagPinned && !plan.templateImage.includes('pending-pin'),
      port: plan.containerPort,
      readyForPublish: templateBlockers.length === 0 && inventory.accessible,
      blockers: templateBlockers,
    },
    gpuFailover,
    costEstimate: {
      currency: 'USD',
      maxUsdPerHour: plan.maxUsdPerHour,
      cheapestCompatibleUsd:
        recovery.options
          .map((opt) => opt.estimatedComputeUsdPerHour)
          .filter((value): value is number => typeof value === 'number')
          .sort((a, b) => a - b)[0] ?? null,
      notes: [
        ...migration.storageCost.notes,
        recovery.consoleMigrateCaveat,
      ],
    },
    readiness:
      workflowExport.ok && !readiness.blockers.some((line) => /importe o workflow/i.test(line))
        ? {
            ...readiness,
            level:
              readiness.level === 'ready_for_phase4_auth'
                ? 'phase4_validated_awaiting_paid_ops'
                : readiness.level,
            summary:
              readiness.level === 'ready_for_phase4_auth'
                ? 'Fase 4 validada em dry-run — operações pagas ainda exigem aprovação.'
                : readiness.summary,
          }
        : readiness,
    podsSnapshot: pods.map((pod) => ({
      id: pod.id,
      name: pod.name,
      status: pod.status,
      gpuType: pod.gpuType,
      dataCenterId: pod.dataCenterId,
      costPerHr: pod.costPerHr,
    })),
  }

  const controlledLipsyncTest: LtxControlledLipsyncTestGate = {
    enabled: false,
    requiresExplicitApproval: true,
    maxUsd: null,
    maxMinutes: null,
    sceneLimit: 1,
    status: 'blocked_until_approval',
    message:
      'Teste real de uma cena curta LipSync preparado, mas bloqueado. Informe custo máximo (USD), limite de minutos e confirme autorização explícita para liberar.',
  }

  const paidActionsRequiringApproval = [
    ...new Set([
      ...migration.paidActionsRequiringApproval,
      ...recovery.paidActionsRequiringApproval,
      'Não avançar automaticamente para a Fase 5 (provisionamento real).',
    ]),
  ]

  const reproducibleEnv = buildReproducibleEnvNotes(inventory, workflowAnalysis)

  log('ltx.phase4.validate.done', {
    workflowOk: workflowExport.ok,
    inventoryAccessible: inventory.accessible,
    recoveryOptions: recovery.options.length,
    paidPending: paidActionsRequiringApproval.length,
  })

  return {
    fetchedAt,
    phase: 4,
    dryRun: true,
    mutationCalls: 0,
    advancedToPhase5: false,
    workflowExport,
    workflowAnalysis,
    inventory,
    migration,
    recovery,
    reproducibleEnv,
    controlledLipsyncTest,
    paidActionsRequiringApproval,
    prep,
  }
}
