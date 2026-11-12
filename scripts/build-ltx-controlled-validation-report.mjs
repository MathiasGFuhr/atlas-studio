/**
 * Monta o relatório pré-Fase 5 a partir dos snapshots locais (dry-run).
 * Não chama create/start; não altera Pods.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'resources', 'ltx-environment')

// Carrega o builder TS via dynamic import com tsx register — fallback: lógica espelhada mínima.
// Preferimos invocar o código compilado em memória com uma cópia dos cálculos essenciais.

const inv = JSON.parse(fs.readFileSync(path.join(dir, 'model-inventory-detailed.json'), 'utf8'))
const snap = JSON.parse(fs.readFileSync(path.join(dir, 'runpod-catalog-snapshot.json'), 'utf8'))
const podInv = JSON.parse(fs.readFileSync(path.join(dir, 'pod-inventory.json'), 'utf8'))
const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'exported-comfy-config.json'), 'utf8'))

const require = createRequire(import.meta.url)

async function loadBuilder() {
  try {
    const mod = await import(pathToFileURL(path.join(root, 'src/shared/ltxControlledValidation.ts')).href)
    return mod
  } catch {
    // tsx may be needed
    const { register } = await import('node:module')
    void register
    const { spawnSync } = await import('node:child_process')
    const helper = path.join(dir, '_build_report_helper.mjs')
    // Inline build without TS import
    return null
  }
}

const RATE = 0.07
const priorities = [
  'NVIDIA RTX PRO 4500 Blackwell Server Edition',
  'NVIDIA GeForce RTX 4090',
  'NVIDIA RTX A6000',
]

const pods = (snap.pods || []).map((p) => ({
  id: p.id,
  name: p.name,
  status: p.status,
  gpuType: p.gpu?.id ?? null,
  gpuMemoryGb: p.gpu?.memory ?? null,
  dataCenterId: p.dataCenterId ?? null,
  ports: p.ports ?? [],
  costPerHr: p.cost ?? null,
  cloud: p.cloud ?? null,
  hasComfyPort: Array.isArray(p.ports) && p.ports.some((x) => String(x).includes('8188')),
  comfyProxyUrl: null,
  actions: p.actions ?? [],
  locked: Boolean(p.locked),
  image: p.image ?? null,
}))

const catalog = (snap.gpus || []).map((g) => ({
  id: g.id,
  name: g.name ?? g.id,
  memoryGb: g.memory ?? null,
  securePrice: g.price?.secure ?? null,
  communityPrice: g.price?.community ?? null,
  availability: g.availability ?? null,
}))

const dataCenters = snap.dataCenters || []
const dcWithVol = dataCenters.filter((d) => Array.isArray(d.networkVolumeTypes) && d.networkVolumeTypes.length)

function gpuOption(gpuId, priority) {
  const hit = catalog.find((g) => g.id === gpuId)
  const dcs = dcWithVol
    .map((dc) => {
      const avail = (dc.gpuAvailability || []).find((a) => a.id === gpuId)
      if (!avail || avail.availability === 'NONE') return null
      return { dataCenterId: dc.id, volumeTypes: dc.networkVolumeTypes, gpuAvailability: avail.availability }
    })
    .filter(Boolean)
  const notes = []
  if (!hit) notes.push('GPU ausente do catálogo.')
  if (hit?.availability === 'NONE') notes.push('Disponibilidade global NONE.')
  if (dcs.length === 0) notes.push('Nenhum DC com Network Volume + GPU disponível agora.')
  const ks = dataCenters.find((d) => d.id === 'US-KS-2')
  if (ks && (!ks.networkVolumeTypes || ks.networkVolumeTypes.length === 0)) {
    notes.push('US-KS-2 (Pods LTX atuais) não lista networkVolumeTypes neste snapshot.')
  }
  return {
    priority,
    gpuId,
    label: hit?.name || gpuId,
    memoryGb: hit?.memoryGb ?? null,
    securePriceUsd: hit?.securePrice ?? null,
    communityPriceUsd: hit?.communityPrice ?? null,
    catalogAvailability: hit?.availability ?? null,
    fitsVram: (hit?.memoryGb ?? 99) >= 16,
    dataCentersWithVolumeAndGpu: dcs,
    notes,
  }
}

const models = inv.models.map((m) => ({
  role: m.role,
  fileName: m.fileName,
  folder: m.folder,
  absolutePath: m.absolutePath,
  sizeBytes: m.size?.bytes ?? null,
  sizeGib: m.size?.gib ?? null,
  versionHint: m.versionHint,
  present: m.present,
  sha256: m.sha256,
  sha256Status: m.sha256Status,
  sha256Command: m.sha256Command,
}))

const totalGib = inv.totals.totalGib
const recommendedGb = inv.totals.recommendedNetworkVolumeGb
const storageMonth = Math.round(recommendedGb * RATE * 100) / 100
const running = pods.find((p) => String(p.status).toUpperCase() === 'RUNNING' && p.hasComfyPort)
const gpuHour = running?.costPerHr ?? 0.72
const testMinutes = 15
const testCost = Math.round(((gpuHour * testMinutes) / 60) * 100) / 100

const checksumScript = `#!/usr/bin/env bash
set -euo pipefail
# Read-only checksum dos modelos LTX — NÃO altera/exclui safetensors.
OUT=/workspace/ltx-model-sha256.txt
: > "$OUT"
${models.map((m) => `sha256sum -b "${m.absolutePath}" | tee -a "$OUT"`).join('\n')}
echo "DONE $(date -Is)" | tee -a "$OUT"
cat "$OUT"
`
fs.writeFileSync(path.join(dir, 'checksum-models-readonly.sh'), checksumScript)

const report = {
  fetchedAt: new Date().toISOString(),
  phase: 'pre5_controlled_validation',
  dryRun: true,
  mutationCalls: 0,
  advancedToPhase5: false,
  protections: [
    'Não modificar nem excluir Pods existentes (há 5 Pods na conta neste snapshot).',
    'Não substituir o ambiente LTX-2.3 atual.',
    'Não criar Network Volume ou Pod sem aprovação específica.',
    'Não iniciar GPU automaticamente (dry-run ativo).',
    'Não avançar failover automático sem recuperação comprovada.',
    'Preservar fila LipSync, downloads, FFmpeg e modo manual.',
  ],
  modelInventory: {
    modelsRoot: inv.modelsRootConfirmed,
    models,
    totalBytes: inv.totals.totalBytes,
    totalGib,
    recommendedNetworkVolumeGb: recommendedGb,
    sha256Pending: true,
    checksumScriptPath: 'resources/ltx-environment/checksum-models-readonly.sh',
    note: 'SHA-256 pendente: API Comfy não expõe hash; script shell read-only preparado, não executado.',
  },
  dataCenters: {
    currentPodDataCenterId: running?.dataCenterId ?? 'US-KS-2',
    currentPodSupportsNetworkVolume: false,
    supportingWithCompatibleGpus: dcWithVol
      .map((dc) => ({
        id: dc.id,
        region: dc.region,
        networkVolumeTypes: dc.networkVolumeTypes,
        compatibleGpuHits: (dc.gpuAvailability || [])
          .filter((a) => a.availability !== 'NONE' && /4090|A6000|A5000|4500|6000 Ada/i.test(a.id))
          .map((a) => `${a.id} (${a.availability})`),
      }))
      .filter((dc) => dc.compatibleGpuHits.length > 0),
    recommendation:
      'US-KS-2 (Pods LTX) NÃO oferece Network Volume neste catálogo. Teste LipSync controlado: usar Pod RUNNING atual sem criar volume. Persistência futura: DC com volume (ex. EU-RO-1 / EU-CZ-1) ou avaliar Global Volume — só após aprovação.',
  },
  gpuPriorities: priorities.map((id, i) => gpuOption(id, i + 1)),
  volumeSizing: {
    requiredGibExact: totalGib,
    recommendedGb,
    estimatedStorageUsdPerMonth: storageMonth,
    rateUsdPerGbMonth: RATE,
  },
  backupCopyProcedure: {
    dryRun: true,
    preserveOriginals: true,
    steps: [
      'Inventário + SHA-256 read-only na origem',
      'Após aprovação: criar volume no DC alvo',
      'Pod NOVO com volume anexado na criação (não apagar os atuais)',
      'rsync/cp -a → volume; rehash no destino',
      'Softlink só após hashes iguais',
      'Manter originais até validação LipSync no novo ambiente',
    ],
    forbidden: ['rm nos modelos de origem', 'terminate dos Pods atuais', 'overwrite sem backup'],
  },
  dockerfileParity: {
    confirmed: [
      `ComfyUI ${podInv.system.comfyuiVersion}`,
      `PyTorch ${podInv.system.pytorchVersion}`,
      `Python ${String(podInv.system.pythonVersion).split(' ')[0]}`,
    ],
    gaps: [
      'nvidia-smi / CUDA driver exacto',
      'pip freeze completo',
      'git commit SHA do ComfyUI no disco',
      'pacotes apt da imagem runpod-slim',
    ],
    verdict:
      'Pins principais alinhados ao inventário HTTP; Dockerfile NÃO reproduz exatamente todas as deps até fechar os gaps.',
  },
  lipsyncTest: {
    enabled: false,
    requiresExplicitApproval: true,
    sceneLimit: 1,
    preferredMode: 'reuse_current_running_pod',
    preferredPodId: running?.id ?? cfg.runpodPreferredPodId ?? null,
    comfyBaseUrl: cfg.baseUrl,
    workflowName: cfg.workflowName,
    maxUsdSuggested: Math.max(0.5, testCost * 3),
    maxMinutesSuggested: testMinutes,
    successCriteria: [
      { id: 'comfy-healthy', verify: 'GET /system_stats ok' },
      { id: 'models-loaded', verify: '5/5 assets em /models' },
      { id: 'workflow-ran', verify: 'history completed sem execution_error' },
      { id: 'video-generated', verify: 'SaveVideo output filename' },
      { id: 'video-downloaded', verify: 'arquivo local lipsync/ > 0 bytes' },
      { id: 'video-validated', verify: 'ffprobe duração≈áudio; stream ok' },
    ],
  },
  costEstimate: {
    currency: 'USD',
    scenarios: [
      {
        id: 'A_current_pod_lipsync',
        title: 'Teste LipSync no Pod atual (sem criar volume/Pod)',
        requiresNewPaidResources: false,
        lines: [
          { item: 'GPU RUNNING', estimate: `US$ ${gpuHour}/h`, notes: running ? `Pod ${running.id}` : 'n/d' },
          { item: `≤${testMinutes} min de teste`, estimate: `≈ US$ ${testCost}` },
          { item: 'Network Volume novo', estimate: 'US$ 0' },
          { item: 'Download mp4 curto', estimate: 'desprezível' },
        ],
        totalRangeUsd: `≈ US$ ${testCost}–${Math.round(testCost * 3 * 100) / 100}`,
      },
      {
        id: 'B_volume_plus_new_pod',
        title: 'Migração (volume+Pod) — NÃO executar agora',
        requiresNewPaidResources: true,
        lines: [
          { item: `Volume ${recommendedGb} GB`, estimate: `≈ US$ ${storageMonth}/mês` },
          { item: 'Pod novo', estimate: 'ver gpuPriorities ($/h)' },
          { item: 'Cópia ~40 GiB', estimate: 'tempo GPU/rede (aprovação)' },
        ],
        totalRangeUsd: `≈ US$ ${storageMonth}/mês + compute`,
      },
    ],
  },
  recoveryProcedure: [
    { when: 'Falha HTTP/inventário', action: 'Não criar recursos; repetir GET' },
    { when: 'SHA diverge na cópia', action: 'Abortar softlink; preservar origem' },
    { when: 'Novo ambiente não sobe', action: 'Voltar ao Pod LTX atual' },
    { when: 'LipSync falha', action: 'Capturar history; sem lote; fila intacta' },
    { when: 'GPU some', action: 'Plano ≤3 opções dry-run; sem failover auto' },
    { when: 'Precisar Pod novo', action: 'Parar e pedir aprovação de custo' },
  ],
  podsSnapshot: pods.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    gpuType: p.gpuType,
    dataCenterId: p.dataCenterId,
    costPerHr: p.costPerHr,
  })),
  paidActionsRequiringApproval: [
    'Shell read-only sha256sum no Pod (se EXITED, start = GPU paga)',
    'Criar Network Volume',
    'Criar Pod novo com volume',
    'Teste LipSync 1 cena (teto USD + minutos)',
    'pip freeze / nvidia-smi para fechar Dockerfile',
    'Fase 5 / failover automático',
  ],
  approvalPrompt: [
    'Para autorizar APENAS o teste LipSync no Pod atual, responda com:',
    '1) AUTORIZO teste LipSync 1 cena',
    `2) podId=${running?.id ?? '???'}`,
    `3) maxUsd=${Math.max(0.5, testCost * 3)}`,
    `4) maxMinutes=${testMinutes}`,
    '5) confirmar: sem criar volume/Pod nesta autorização',
  ].join('\n'),
}

fs.writeFileSync(path.join(dir, 'controlled-validation-report.json'), `${JSON.stringify(report, null, 2)}\n`)

const md = `# Relatório — Validação real controlada LTX-2.3 (pré-Fase 5)

**Dry-run. Nenhuma operação paga foi executada. Fase 5 não iniciada.**

Gerado em: ${report.fetchedAt}

## Inventário de modelos

| Arquivo | Caminho absoluto | Tamanho | SHA-256 |
|---------|------------------|---------|---------|
${models
  .map(
    (m) =>
      `| \`${m.fileName}\` | \`${m.absolutePath}\` | ${m.sizeGib} GiB | **pendente** (shell read-only) |`,
  )
  .join('\n')}

- **Total:** ${totalGib} GiB  
- **Volume recomendado:** ${recommendedGb} GB (margem 15%, arredondado)  
- Script checksum: \`checksum-models-readonly.sh\` (não executado)

## Datacenters × Network Volume × GPU LTX

- Pods LTX atuais em **US-KS-2** — \`networkVolumeTypes: []\` (**sem** Network Volume neste snapshot).
- DCs com volume + GPU compatível agora:  
${report.dataCenters.supportingWithCompatibleGpus.map((d) => `  - **${d.id}** (${d.networkVolumeTypes.join(', ')}): ${d.compatibleGpuHits.join('; ') || '(sem hit)'}`).join('\n') || '  - (nenhum no filtro)'}

## Três GPUs prioritárias

${report.gpuPriorities
  .map(
    (g) =>
      `### ${g.priority}. ${g.gpuId}
- VRAM: ${g.memoryGb ?? '?'} GB · Secure US$ ${g.securePriceUsd ?? '?'}/h · Community US$ ${g.communityPriceUsd ?? '?'}/h ·Avail ${g.catalogAvailability}
- DCs com volume+GPU: ${g.dataCentersWithVolumeAndGpu.map((d) => `${d.dataCenterId}(${d.gpuAvailability})`).join(', ') || 'nenhum'}
- Notas: ${g.notes.join(' ')}`,
  )
  .join('\n\n')}

## Dockerfile

${report.dockerfileParity.verdict}

Confirmado: ${report.dockerfileParity.confirmed.join('; ')}  
Gaps: ${report.dockerfileParity.gaps.join('; ')}

## Teste LipSync (bloqueado)

- Modo preferido: **Pod atual RUNNING** \`${report.lipsyncTest.preferredPodId}\`
- 1 cena curta · teto sugerido US$ ${report.lipsyncTest.maxUsdSuggested} · ≤${report.lipsyncTest.maxMinutesSuggested} min
- Critérios: Comfy saudável → modelos → workflow → vídeo gerado → baixado → validado (ffprobe)

## Custos estimados

### A — Teste no Pod atual (sem recursos novos)
${report.costEstimate.scenarios[0].lines.map((l) => `- ${l.item}: ${l.estimate}`).join('\n')}
- **Faixa:** ${report.costEstimate.scenarios[0].totalRangeUsd}

### B — Migração volume+Pod (não executar)
- Volume ${recommendedGb} GB ≈ **US$ ${storageMonth}/mês** + GPU horária  
- Exige aprovação específica separada

## Recuperação

${report.recoveryProcedure.map((s) => `- Se ${s.when}: ${s.action}`).join('\n')}

## Aprovação

\`\`\`
${report.approvalPrompt}
\`\`\`

Pods na conta (não excluir): ${pods.map((p) => `${p.id}(${p.status})`).join(', ')}
`

fs.writeFileSync(path.join(dir, 'controlled-validation-report.md'), md)
console.log(
  JSON.stringify(
    {
      ok: true,
      totalGib,
      recommendedGb,
      runningPod: running?.id,
      gpuPriorities: report.gpuPriorities.map((g) => g.gpuId),
      out: ['controlled-validation-report.json', 'controlled-validation-report.md', 'checksum-models-readonly.sh'],
    },
    null,
    2,
  ),
)

void loadBuilder
void require
