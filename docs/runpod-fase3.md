# RunPod + ComfyUI — Fase 3 (ambiente persistente LTX-2.3)

## Escopo desta entrega

Configuração, auditoria com níveis de evidência, spec de template Docker, plano de armazenamento/failover de GPU e painel no Atlas — **sem** criar/excluir/iniciar Pods, **sem** criar volumes pagos e **sem** alterar o ComfyUI existente.

## Auditoria do workflow

### Situação do arquivo

| Item | Status |
|------|--------|
| `video_ltx2_3_ia2v.json` no repositório | **Ausente** |
| Stub parcial nos testes (`src/shared/comfy.test.ts`) | Confirmado no repo |
| Workflow importado no SQLite do usuário | Depende da máquina |

### Confirmado no Atlas (repo)

`class_types` do stub IA2V usado para mapeamento LipSync:

`LoadImage`, `LoadAudio`, `SaveVideo`, `RandomNoise`, `CLIPTextEncode`, `PrimitiveStringMultiline`, `PrimitiveFloat`, `PrimitiveInt`, `PrimitiveBoolean`, `TextGenerateLTX2Prompt`

O Atlas **não** altera pesos/modelos do workflow — só imagem, áudio, prompt, duração, seeds e desliga Prompt Enhance.

### Confirmado em docs oficiais Comfy (IA2V)

Fonte: [LTX-2.3 in ComfyUI](https://docs.comfy.org/tutorials/video/ltx/ltx-2-3)

- Suporte **nativo** (sem custom nodes obrigatórios para o template oficial).
- Modelos IA2V oficiais (caminhos):
  - `models/checkpoints/ltx-2.3-22b-dev-fp8.safetensors`
  - `models/loras/ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors`
  - `models/loras/gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors`
  - `models/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors`
  - `models/latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors`

### Precisa inspeção no Pod (não inventado)

- Versão exata do ComfyUI (`/system_stats`)
- Python / PyTorch / CUDA da imagem atual
- Lista real de arquivos em `models/` (nomes podem divergir do manifesto oficial)
- Custom nodes extras que o workflow **importado** do usuário possa referenciar além do stub

### VRAM

- Mínimo de planejamento: **16 GB** (FP8 + offload, docs públicos)
- Recomendado: **24 GB**
- Compatibilidade Atlas atualizada em `runpodLtxCompat` (mínimo 16)

## Template Docker (spec)

Arquivos:

- `resources/ltx-environment/Dockerfile.spec` — esqueleto comentado, sem build
- `resources/ltx-environment/template.manifest.json` — pins e evidências

Princípios:

- Software na imagem; **modelos no volume**
- Porta **8188**
- Sem tags `latest` em componentes críticos
- Tag/digest só após inspeção + autorização de build

## Armazenamento (comparativo)

| Opção | Migra com nova GPU? | Restrição | Situação da conta |
|-------|---------------------|-----------|-------------------|
| **Volume Disk do Pod** | Não (fica no host) | Perde ambiente ao criar Pod novo | Em uso hoje nos 4 Pods |
| **Network Volume** | Sim, no **mesmo datacenter** | Anexar na **criação** do Pod; DC fixo | **0 volumes** |
| **Global Volume** | Cross-DC | Menos ideal para pesos gigantes; validar API/conta | Não usado |

**Recomendação:** Docker reproduzível + **Network Volume** no DC do Pod LTX “bom”, com cópia verificada dos modelos. Disco do Pod atual permanece intacto até backup validado.

### Plano de migração (ainda não executar)

1. Com Pod parado (sem apagar): inventariar `models/` (nome, tamanho, checksum).
2. Autorizar criação de Network Volume no **mesmo** `dataCenterId` (custo de armazenamento).
3. Anexar volume a um Pod **novo** futuro (Fase 4) — não formatar o disco antigo.
4. Copiar modelos → volume; verificar checksums.
5. Softlink `/ComfyUI/models` → volume.
6. Testar 1 cena LipSync; só então considerar failover de GPU.
7. **Nunca** excluir o Pod original antes do teste A/B.

## Failover de GPU (estrutura)

Persistido em `ltxEnvironmentPlan` (settings):

- GPU principal + 2 alternativas
- VRAM mínima / recomendada
- Teto US$/h
- Cloud SECURE/COMMUNITY
- DC preferido + volume
- Diagnóstico dry-run via catálogo `GET /v2/catalog/gpus`

Fase 3 **não** cria Pods quando a GPU principal está indisponível — só avalia o plano.

## UI

Configurações → card **Ambiente LTX-2.3 (Fase 3 · dry-run)**

- Template, armazenamento, modelos, GPUs, teto de custo
- Botão **Diagnosticar (dry-run)** → evidências + blockers + estimativa de preço do catálogo

## Custos que exigem autorização futura

| Recurso | Fase 3 | Autorização necessária |
|---------|--------|------------------------|
| Consultas GET API | Sim (leitura) | — |
| Start de Pod existente | Fase 2 (dry-run padrão) | Usuário + dry-run off |
| Network Volume novo | Não | Sim (armazenamento contínuo) |
| Build/push imagem Docker | Não | Sim (registry/tempo) |
| Pod novo com outra GPU | Não (Fase 4) | Sim (compute/h) |

## Testes

```bash
npm test -- src/shared/ltxEnvironment.test.ts src/main/services/comfy/runpod
npm run typecheck
```

## Próximo passo

Aguardar autorização humana para: inspeção no Pod, pinagem do template, e/ou criação de Network Volume — **antes** da Fase 4 (provisionamento com whitelist de GPUs).
