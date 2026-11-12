/**
 * Inventário read-only dos modelos LTX via ComfyUI HTTP.
 * Não modifica arquivos. SHA-256 exige shell no Pod (comando preparado, não executado aqui).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'resources', 'ltx-environment')
const cfg = JSON.parse(fs.readFileSync(path.join(outDir, 'exported-comfy-config.json'), 'utf8'))
const base = String(cfg.baseUrl || '').replace(/\/+$/, '')

const TARGETS = [
  { folder: 'checkpoints', fileName: 'ltx-2.3-22b-dev-fp8.safetensors', role: 'checkpoint', versionHint: 'LTX-2.3 22B FP8' },
  {
    folder: 'loras',
    fileName: 'ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors',
    role: 'lora',
    versionHint: 'distilled 1.1',
  },
  {
    folder: 'loras',
    fileName: 'gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors',
    role: 'lora',
    versionHint: 'gemma abliterated rank64 bf16',
  },
  {
    folder: 'text_encoders',
    fileName: 'gemma_3_12B_it_fp4_mixed.safetensors',
    role: 'text_encoder',
    versionHint: 'Gemma 3 12B FP4 mixed',
  },
  {
    folder: 'latent_upscale_models',
    fileName: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
    role: 'upscaler',
    versionHint: 'spatial upscaler x2 1.1',
  },
]

async function getJson(route) {
  const response = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`${route} → HTTP ${response.status}`)
  return response.json()
}

function formatBytes(n) {
  if (n == null) return null
  const gb = n / 1024 ** 3
  return { bytes: n, gib: Math.round(gb * 1000) / 1000 }
}

const folderMeta = await getJson('/experiment/models')
const folderMap = Object.fromEntries(
  (Array.isArray(folderMeta) ? folderMeta : []).map((row) => [row.name, row]),
)

const models = []
for (const target of TARGETS) {
  const meta = folderMap[target.folder]
  const listed = await getJson(`/experiment/models/${encodeURIComponent(target.folder)}`)
  const hit = (Array.isArray(listed) ? listed : []).find(
    (row) => row.name === target.fileName || String(row.name).endsWith(`/${target.fileName}`),
  )
  const pathIndex = hit?.pathIndex ?? 0
  const absDir = meta?.folders?.[pathIndex] ?? null
  const absolutePath = absDir ? `${absDir.replace(/\/+$/, '')}/${target.fileName}` : null
  models.push({
    role: target.role,
    fileName: target.fileName,
    folder: target.folder,
    versionHint: target.versionHint,
    absolutePath,
    pathIndex,
    size: formatBytes(typeof hit?.size === 'number' ? hit.size : null),
    modifiedUnix: hit?.modified ?? null,
    createdUnix: hit?.created ?? null,
    present: Boolean(hit),
    sha256: null,
    sha256Status: 'pending_readonly_shell',
    sha256Command: absolutePath
      ? `sha256sum -b "${absolutePath}"`
      : `sha256sum -b "/workspace/runpod-slim/ComfyUI/models/${target.folder}/${target.fileName}"`,
  })
}

const totalBytes = models.reduce((sum, row) => sum + (row.size?.bytes ?? 0), 0)
const overheadFactor = 1.15 // margem cópia + filesystem
const recommendedVolumeGb = Math.ceil((totalBytes * overheadFactor) / 1024 ** 3 / 5) * 5 // arredonda p/ 5 GB

const report = {
  inspectedAt: new Date().toISOString(),
  dryRun: true,
  mutationCalls: 0,
  baseUrl: base,
  modelsRootConfirmed: '/workspace/runpod-slim/ComfyUI/models',
  models,
  totals: {
    fileCount: models.length,
    presentCount: models.filter((m) => m.present).length,
    totalBytes,
    totalGib: Math.round((totalBytes / 1024 ** 3) * 1000) / 1000,
    recommendedNetworkVolumeGb: recommendedVolumeGb,
    overheadFactor,
    notes: [
      'Tamanhos e caminhos via GET /experiment/models (somente leitura).',
      'SHA-256 não é exposto pela API HTTP do ComfyUI; requer comando read-only no shell do Pod (não executado nesta etapa).',
      'Originais não foram alterados nem excluídos.',
    ],
  },
  checksumScript: {
    purpose: 'Calcular SHA-256 sem alterar arquivos (autorização futura de shell read-only)',
    shell: 'bash',
    script: [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'OUT=/workspace/ltx-model-sha256.txt',
      ': > "$OUT"',
      ...models.map((m) => `sha256sum -b "${m.absolutePath}" | tee -a "$OUT"`),
      'echo "DONE" >> "$OUT"',
      'cat "$OUT"',
    ].join('\n'),
    writesOnly: '/workspace/ltx-model-sha256.txt (novo arquivo de relatório; não toca nos modelos)',
  },
}

fs.writeFileSync(path.join(outDir, 'model-inventory-detailed.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(
  JSON.stringify(
    {
      present: report.totals.presentCount,
      totalGib: report.totals.totalGib,
      recommendedVolumeGb: report.totals.recommendedNetworkVolumeGb,
      sha256: 'pending_readonly_shell',
      out: 'resources/ltx-environment/model-inventory-detailed.json',
    },
    null,
    2,
  ),
)
