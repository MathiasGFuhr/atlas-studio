# RunPod + ComfyUI — Fase 4 (preparação e validação controlada)

## Escopo

Transformar o plano das Fases 1–3 em infraestrutura **tecnicamente verificável**, sem provisionamento pago:

- Exportar o workflow real do SQLite (API JSON)
- Inventário **somente leitura** do Pod (quando acessível)
- Dockerfile + manifesto de dependências versionados
- Procedimento de migração + apresentação de custos
- Recuperação quando a GPU original estiver indisponível (≤3 opções)
- Testes dry-run/mocks; teste LipSync real **bloqueado** até aprovação explícita

**Não** avança para a Fase 5. **Não** cria/exclui Pods, volumes ou templates. **Não** altera ComfyQueueService, cards LipSync, FFmpeg ou downloads.

## Workflow exportado

Fonte: chave `comfyWorkflowJson` no SQLite do Atlas (`%APPDATA%\Atlas Studio\atlas-studio.db`).

Artefatos:

- `resources/ltx-environment/exported-workflow-from-sqlite.json`
- `resources/ltx-environment/workflow-analysis.json`
- Script CLI: `scripts/export-comfy-workflow-from-db.mjs`
- Serviço: `exportLtxWorkflowFromSqlite` + IPC `comfy:exportLtxWorkflow`

Análise (máquina de desenvolvimento do usuário, exportação real):

| Item | Valor |
|------|-------|
| Nós | 55 |
| class_types únicos | 40 |
| Marcador | `TextGenerateLTX2Prompt` presente |
| Checkpoint | `ltx-2.3-22b-dev-fp8.safetensors` |
| LoRA distilled | `ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors` |
| LoRA Gemma | `gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors` |
| Text encoder | `gemma_3_12B_it_fp4_mixed.safetensors` |
| Upscaler | `ltx-2.3-spatial-upscaler-x2-1.1.safetensors` |

Comparação com docs oficiais IA2V ([LTX-2.3 in ComfyUI](https://docs.comfy.org/tutorials/video/ltx/ltx-2-3)):

- Os **5 assets oficiais** aparecem no workflow importado.
- Nós `LTXV*` / `LTXAV*` são **nativos** do ComfyUI atual (docs: sem custom nodes obrigatórios para o template oficial).
- `LTXVAudioVAELoader` neste JSON usa o mesmo arquivo FP8 do checkpoint — validar no disco do Pod se há VAE de áudio separado.

## Inventário do Pod (read-only)

Endpoints HTTP usados (GET only):

- `/system_stats` — ComfyUI / PyTorch / Python / VRAM
- `/object_info` — class_types
- `/models` e `/models/{folder}` — nomes de arquivos

Snapshot: `resources/ltx-environment/pod-inventory.json`

### Confirmado neste ambiente (2026-11-08)

| Item | Valor |
|------|-------|
| ComfyUI | **0.30.0** |
| PyTorch | **2.10.0+cu130** |
| Python | **3.12.3** |
| GPU | NVIDIA RTX PRO 4500 Blackwell · **~31.4 GB** |
| Modelos IA2V (5/5) | **presentes** via GET `/models/{folder}` |
| Nós críticos do workflow | **todos presentes** em `/object_info` (1071 class_types) |

### Ainda pendente

- `nvidia-smi` / driver CUDA exacto (não exposto no HTTP)
- Checksums sha256 e tamanhos em disco dos safetensors

**Não** cobre: instalação de pacotes, escrita no container. Se o Pod estiver inacessível, o Atlas lista pendências e segue com dry-run.

## Ambiente reproduzível

| Arquivo | Função |
|---------|--------|
| `resources/ltx-environment/Dockerfile` | Imagem versionada com pins documentados (placeholders se inventário incompleto) |
| `resources/ltx-environment/requirements.manifest.txt` | Dependências e class_types exigidos |
| `resources/ltx-environment/template.manifest.json` | Evidências + modelos + runtime |

Princípios: software na imagem; **modelos no Network Volume**; porta **8188**; sem `docker build/push` automático.

## Migração e custos

Procedimento em `buildLtxMigrationPlan`:

1. Inventário read-only  
2. Export do workflow  
3. **Criar Network Volume** (pago — aprovação) no mesmo DC  
4. **Criar Pod novo** anexando o volume na criação (pago — aprovação)  
5. Copiar modelos + checksum (bloqueado até autorização)  
6. Validar boot  
7. Teste LipSync de 1 cena (bloqueado)

Estimativa de armazenamento: ~`US$ 0.07/GB/mês` (ordem de grandeza; confirmar no console).

Os **quatro Pods atuais não são excluídos**.

### Caveat de API

O painel RunPod pode oferecer “Migrate”. A REST v2 usada pelo Atlas **não** tem operação equivalente confirmada na documentação. Recuperação = Pod novo (ou outro Pod existente) + volume no mesmo DC.

## Recuperação de GPU

`planLtxGpuRecovery` detecta TERMINATED / indisponibilidade no catálogo / VRAM / teto de preço e propõe até **3** opções:

1. Reutilizar Pod existente compatível (sem criar recurso)  
2–3. Propor GPU do plano/catálogo para Pod **novo** (dry-run)

## Teste LipSync controlado

Gate `controlledLipsyncTest`:

- `enabled: false`
- `sceneLimit: 1`
- Exige custo máximo USD + limite de minutos + aprovação explícita

Nesta fase o teste **não** dispara.

## UI / IPC

- Botão **Validar Fase 4** no card Ambiente LTX  
- `comfy:validateLtxPhase4` / `comfy:exportLtxWorkflow`

## Ações pagas que ainda precisam de aprovação

- Criar Network Volume  
- Criar Pod novo com volume (sem apagar os atuais)  
- Build/push de imagem Docker pinada  
- Cópia de modelos / possível tempo de GPU  
- Teste LipSync real de uma cena  
- **Não** avançar automaticamente para a Fase 5

## Testes

- `src/shared/ltxWorkflowAnalysis.test.ts`
- `src/shared/ltxRecovery.test.ts`
- `src/shared/ltxMigration.test.ts`
- `src/main/services/comfy/runpod/comfyPodInventory.test.ts`
- `src/main/services/comfy/runpod/ltxPhase4Service.test.ts`
