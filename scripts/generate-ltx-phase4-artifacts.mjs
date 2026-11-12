/**
 * Gera artefatos Fase 4 a partir do workflow já exportado (offline / dry-run).
 * Não cria Pods, volumes nem inicia cobranças.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'resources', 'ltx-environment')
const workflow = JSON.parse(fs.readFileSync(path.join(dir, 'exported-workflow-from-sqlite.json'), 'utf8'))
const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'exported-comfy-config.json'), 'utf8'))

const OFFICIAL = [
  'ltx-2.3-22b-dev-fp8.safetensors',
  'ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors',
  'gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors',
  'gemma_3_12B_it_fp4_mixed.safetensors',
  'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
]

const classTypes = [...new Set(Object.values(workflow).map((n) => n.class_type).filter(Boolean))].sort()
const modelRefs = []
for (const [nodeId, node] of Object.entries(workflow)) {
  for (const [field, value] of Object.entries(node.inputs || {})) {
    if (typeof value === 'string' && /\.(safetensors|ckpt|pt|bin)$/i.test(value)) {
      modelRefs.push({
        nodeId,
        classType: node.class_type,
        field,
        fileName: value.replace(/^.*[\\/]/, ''),
      })
    }
  }
}
const files = [...new Set(modelRefs.map((r) => r.fileName))]
const matched = OFFICIAL.filter((name) => files.includes(name))
const analysis = {
  source: 'sqlite_import',
  nodeCount: Object.keys(workflow).length,
  classTypes,
  hasLtxMarker: classTypes.includes('TextGenerateLTX2Prompt'),
  modelRefs,
  officialModelsMatched: matched,
  officialModelsMissingInWorkflow: OFFICIAL.filter((name) => !files.includes(name)),
  extraModelFiles: files.filter((name) => !OFFICIAL.includes(name)),
  nativeLtxClassTypes: classTypes.filter((name) => /^LTX/i.test(name)),
  comparisonNotes: [
    'Comparado com docs.comfy.org LTX-2.3 IA2V.',
    `Workflow real: ${Object.keys(workflow).length} nós, ${classTypes.length} class_types.`,
    `Assets oficiais no workflow: ${matched.length}/5.`,
  ],
}

fs.writeFileSync(
  path.join(dir, 'workflow-analysis.json'),
  `${JSON.stringify({ exportedAt: new Date().toISOString(), workflowName: cfg.workflowName, analysis }, null, 2)}\n`,
)

fs.writeFileSync(
  path.join(dir, 'Dockerfile'),
  `# syntax=docker/dockerfile:1
# Atlas Studio — ComfyUI LTX-2.3 reproduzível (Fase 4)
# DRY-RUN / SPEC VERSIONADO — NÃO fazer build/push sem autorização explícita.
# Modelos ficam no Network Volume (/runpod-volume), NÃO nesta imagem.

# Pins: PENDING_POD_INSPECTION (Pod inacessível na geração offline dos artefatos)
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
# PIN após inventário: torch / ComfyUI commit SHA
# RUN pip3 install --no-cache-dir torch==X.Y.Z --index-url https://download.pytorch.org/whl/cu128
# RUN git clone https://github.com/comfyanonymous/ComfyUI.git /ComfyUI \\
#  && cd /ComfyUI && git checkout <COMMIT_SHA_PENDING>

VOLUME ["/runpod-volume"]
EXPOSE 8188
WORKDIR /ComfyUI

# Boot checks (após autorização): /system_stats, /object_info (LTX), modelos no volume

CMD ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188"]
`,
)

fs.writeFileSync(
  path.join(dir, 'Dockerfile.spec'),
  `# Ver Dockerfile nesta pasta (Fase 4). Build/push proibidos sem autorização.\n# Workflow: ${analysis.nodeCount} nós · LTX marker=${analysis.hasLtxMarker}\n`,
)

fs.writeFileSync(
  path.join(dir, 'requirements.manifest.txt'),
  [
    '# Atlas Studio — manifesto de dependências LTX-2.3 (Fase 4)',
    '# NÃO instalar automaticamente. Pins após inspeção do Pod.',
    `# Workflow: ${analysis.nodeCount} nós · class_types: ${classTypes.length}`,
    '# ComfyUI / PyTorch / Python / CUDA: PENDING_POD_INSPECTION',
    '#',
    '# Modelos (volume):',
    ...OFFICIAL.map((name) => `# - ${name}`),
    '#',
    '# class_types do workflow exportado:',
    ...classTypes.map((name) => `# - ${name}`),
    '',
  ].join('\n'),
)

const manifest = {
  id: 'atlas-ltx-2.3-ia2v',
  phase: 4,
  dryRunOnly: true,
  containerPort: 8188,
  updatedAt: new Date().toISOString(),
  image: {
    repository: 'atlas-studio/comfyui-ltx2.3',
    tag: 'pending-pin',
    digest: null,
    evidence: 'needs_pod_inspection',
    notes: 'Não usar latest. Pinar digest após build autorizado.',
  },
  runtime: {
    python: { value: null, evidence: 'needs_pod_inspection' },
    pytorch: { value: null, evidence: 'needs_pod_inspection' },
    cuda: { value: null, evidence: 'needs_pod_inspection' },
    comfyui: { value: null, evidence: 'needs_pod_inspection' },
  },
  workflow: {
    atlasName: cfg.workflowName || 'video_ltx2_3_ia2v.json',
    exportedFile: 'exported-workflow-from-sqlite.json',
    inRepository: true,
    nodeCount: analysis.nodeCount,
    classTypeCount: classTypes.length,
    evidence: 'confirmed_in_repo',
    notes: analysis.comparisonNotes.join(' '),
  },
  workflowModelsFromSqlite: modelRefs,
  modelsSeparateFromImage: true,
  modelsMountPath: '/runpod-volume/models',
  ia2vOfficialAssets: [
    {
      role: 'checkpoint',
      path: 'models/checkpoints/ltx-2.3-22b-dev-fp8.safetensors',
      evidence: 'confirmed_official_docs',
      presentOnPod: null,
    },
    {
      role: 'lora',
      path: 'models/loras/ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors',
      evidence: 'confirmed_official_docs',
      presentOnPod: null,
    },
    {
      role: 'lora',
      path: 'models/loras/gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors',
      evidence: 'confirmed_official_docs',
      presentOnPod: null,
    },
    {
      role: 'text_encoder',
      path: 'models/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors',
      evidence: 'confirmed_official_docs',
      presentOnPod: null,
    },
    {
      role: 'upscaler',
      path: 'models/latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
      evidence: 'confirmed_official_docs',
      presentOnPod: null,
    },
  ],
  vram: { minimumGb: 16, recommendedGb: 24, evidence: 'confirmed_official_docs' },
  inventoryAccessible: false,
  pendingInventoryChecks: [
    'Pod/ComfyUI inacessível na geração offline dos artefatos',
    'GET /system_stats',
    'GET /object_info',
    'GET /models/{folder}',
    'nvidia-smi no shell do Pod',
  ],
}
fs.writeFileSync(path.join(dir, 'template.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(
  JSON.stringify(
    {
      nodes: analysis.nodeCount,
      classTypes: classTypes.length,
      officialMatched: matched.length,
      written: [
        'workflow-analysis.json',
        'Dockerfile',
        'requirements.manifest.txt',
        'template.manifest.json',
      ],
    },
    null,
    2,
  ),
)
