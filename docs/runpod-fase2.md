# RunPod + ComfyUI — Fase 2 (start de Pod existente)

## Objetivo

Permitir selecionar um Pod **já existente**, revisar GPU/custo/compatibilidade LTX-2.3, iniciar com confirmação, acompanhar até `RUNNING`, descobrir a URL `…-8188.proxy.runpod.net` e validar ComfyUI + nós do workflow — **sem criar/excluir Pods e sem reinstalar ComfyUI**.

## O que foi implementado

| Peça | Função |
|------|--------|
| `RunpodClientV2.startPod` | Único POST: `/v2/pods/{id}/action` com `{ action: "start" }` |
| `RunpodLifecycleManager` | Preview de custo, start idempotente, poll, URL, prontidão |
| `runpodLtxCompat` | Heurística GPU/porta/VRAM + checagem de nós LTX |
| `ComfyClient.listObjectInfoClassTypes` | Lê `/object_info` (não altera workflow) |
| UI Configurações | Seletor de Pod, Revisar custo, Iniciar Pod, diagnósticos |
| Dry-run | **Ligado por padrão** (`runpodDryRunStarts: true`) — sem cobrança |

## Fluxo seguro

1. **Atualizar status** (só GET).
2. Selecionar um dos Pods da conta.
3. Ver GPU, avisos/bloqueios LTX e se há porta 8188.
4. **Revisar custo** (preview).
5. **Iniciar Pod**:
   - Com dry-run: simula STARTING→RUNNING→Comfy/LTX sem POST.
   - Sem dry-run: exige checkbox de cobrança + custo confirmado idêntico ao preview; só então chama `start`.
6. Ao ficar pronto, salva a URL do Comfy nas configs (modo manual e LipSync continuam iguais).

## Restrições respeitadas

- Não cria / não exclui / não faz stop / não faz terminate.
- Não reinstala ComfyUI nem custom nodes.
- Não altera o JSON do workflow importado.
- Não mexe em `ComfyQueueService`, download local nem FFmpeg.
- Start real nunca ocorre sem `acceptBilling` e dry-run desligado.

## Testes (mocks, sem cobrança)

```bash
npm test -- src/main/services/comfy/runpod src/shared/comfy.test.ts
npm run typecheck
```

Cobertura Fase 2:

- compatibilidade LTX (ok/block)
- `POST .../action` só com `start`
- dry-run até `ready` sem POST
- bloqueio de start real sem confirmação de cobrança
- rejeição de custo divergente
- idempotência de start em voo

## Teste manual recomendado (ainda sem cobrança)

1. `npm run dev`
2. Configurações → ComfyUI (RunPod) → **Atualizar status**
3. Confirme dry-run **ligado**
4. Selecione um dos 4 Pods → **Revisar custo** → **Iniciar Pod**
5. Veja lifecycle `ready` (simulação) e diagnósticos
6. URL manual + LipSync devem continuar intactos
7. **Não** desmarque dry-run até autorizar um start real consciente

## Avaliação: preservar LTX-2.3 sem Network Volume (conta atual = 0 volumes)

Hoje cada Pod carrega o ambiente no **disco persistente local do host** (`mounts.persistent`). Esse disco **não acompanha** um Pod novo em outro host/GPU. Sem Network Volume:

1. **Curto prazo (Fase 2–3):** tratar o Pod “bom” (Comfy+LTX+modelos) como **fonte da verdade**; start/stop só desse Pod; troca de GPU = risco de ambiente vazio.
2. **Caminho recomendado (Fase 3):** criar **um** Network Volume no mesmo `dataCenterId` do Pod LTX, copiar checkpoints/custom nodes para o volume, anexar o volume aos Pods elegíveis. Assim a troca de GPU (Fase 4) reutiliza pesos sem reinstalar.
3. **Alternativa sem volume:** template Docker com versões pinadas + script de bootstrap que baixa modelos de um storage externo (S3/R2) — mais lento no cold start e exige checksums.
4. **Global Volume** (cross-DC) é opção futura se a API/conta permitir; ainda assim modelos grandes preferem Network Volume no mesmo DC.
5. **Não fazer:** apagar o Pod original antes de validar backup do volume; não assumir que Pod novo herda o disco antigo.

Enquanto não houver volume, a automação de “substituir GPU” deve **recusar** criação cega de Pod novo ou exigir confirmação explícita de que os modelos serão reinstalados.

## Próxima fase (aguardando autorização)

- **Fase 3:** template/versionamento LTX-2.3 + estratégia de Network Volume (criar/anexar com aprovação).
- Depois: whitelist de 3 GPUs, pipeline autônomo e shutdown seguro.
