# Relatório atualizado — Validação controlada LTX-2.3 (pré-Fase 5)

**Dry-run. Nenhuma geração nem operação paga foi executada nesta atualização.**  
Atualizado em: 2026-11-08 (pós criação do Network Volume pelo usuário)

---

## 1. Estado real dos Pods (API)

| Pod | Status | GPU | DC | US$/h | Ações |
|-----|--------|-----|----|-------|-------|
| **d3ewr3ge0uk002** | **RUNNING** | RTX PRO 4500 Blackwell SE | US-KS-2 | 0,72 | stop/restart/terminate |
| 7nx1tnnzl3ip44 | EXITED | RTX PRO 4500 Blackwell SE | US-KS-2 | 0,72 | start/terminate |
| ly57wijtaj70zx | EXITED | RTX PRO 4500 Blackwell SE | US-KS-2 | 0,72 | start/terminate |
| 22isuynozqk482 | EXITED | RTX 6000 Ada | US-WA-1 | 0,99 | start/terminate |
| e1oa4bngda886v | EXITED | RTX 6000 Ada | US-WA-1 | 0,99 | start/terminate |

**Nenhum Pod foi modificado, parado ou excluído.**

---

## 2. Pod d3ewr3ge0uk002 — pronto para LipSync?

**Sim (somente leitura confirmada):**

| Check | Resultado |
|-------|-----------|
| Status RunPod | RUNNING |
| Porta 8188 | configurada + proxy responde |
| ComfyUI | 0.30.0 |
| PyTorch | 2.10.0+cu130 |
| GPU / VRAM | RTX PRO 4500 SE · ~31,4 GB |
| Modelos IA2V 5/5 | presentes no disco do Pod |
| Nós LTX críticos | presentes em `/object_info` |

URL Comfy: `https://d3ewr3ge0uk002-8188.proxy.runpod.net`

---

## 3. Network Volume na API

| Campo | Valor |
|-------|-------|
| Nome | `inadequate_magenta_crow` |
| ID | `tjp7a4uk0y` |
| Datacenter | **EU-RO-1** |
| Tamanho | **70 GB** |
| Tipo | STANDARD |
| Custo informado (console) | **US$ 4,90/mês** |
| Outros volumes | nenhum — **não criar outro** |

Plano Atlas atualizado: `networkVolumeId=tjp7a4uk0y`, `preferredDataCenterId=EU-RO-1`, `networkVolumeSizeGb=70`.

---

## 4. Volume ainda sem modelos?

**Confirmado para o planejamento:**

- Os 5 modelos LTX (~40 GiB) estão no disco do Pod `d3ewr3ge0uk002` em  
  `/workspace/runpod-slim/ComfyUI/models/...` (US-KS-2).
- O volume `tjp7a4uk0y` está em **EU-RO-1** e **não pode ser anexado** ao Pod atual (DC diferente).
- Nenhum Pod da conta está em EU-RO-1 montando esse volume.
- Conclusão: o volume **ainda não recebeu a cópia dos modelos LTX**; está disponível para a **migração futura**, não para o teste de 1 cena.

(70 GB > 40 GiB necessários + margem — dimensionamento adequado.)

---

## 5. Dois caminhos separados (não misturar)

### Caminho A — Teste de **uma cena** (agora, após sua autorização)

- Usa o **Pod existente** `d3ewr3ge0uk002` (US-KS-2), já RUNNING.
- **Não** usa o Network Volume.
- **Não** cria Pod novo.
- **Não** copia modelos.
- Objetivo: validar Comfy + workflow + download + ffprobe com 1 cena curta LipSync.
- Dry-run permanece até você colar o bloco de autorização abaixo.

### Caminho B — Migração futura (só com aprovação **separada**)

- Pod **novo** em **EU-RO-1**, anexando `tjp7a4uk0y` **na criação**.
- GPU prioritária no DC do volume: **NVIDIA RTX PRO 4500 Blackwell** (32 GB, avail LOW, ~US$ 0,72/h secure).
- Alternativas no EU-RO-1: RTX 4090 (24 GB, LOW); PRO 6000 (mais cara).
- Copiar modelos origem → volume (rsync + SHA-256); **sem apagar originais** nem os 5 Pods atuais.
- Só depois validar boot no novo ambiente.
- **Não** é o teste de 1 cena.

---

## 6. Custos e limites de duração (corrigidos)

### Caminho A (teste 1 cena no Pod atual)

| Item | Estimativa | Nota |
|------|------------|------|
| GPU já RUNNING | US$ **0,72/h** | Cobrança contínua enquanto o Pod estiver ligado (já ocorria antes do teste). |
| Tempo de geração da 1 cena | tipicamente poucos minutos | Depende da duração do áudio + padding do Atlas. |
| Teto sugerido `maxUsd` | **0,54** | Orçamento **incremental** do teste (≈ 45 min × 0,72/h). |
| Teto sugerido `maxMinutes` | **15** | Orçamento de **relógio de parede** da sessão de teste (do “ok” até encerrar/abortar). |
| Volume / Pod novo | **US$ 0** | Não usados no caminho A. |
| Download do mp4 | desprezível | |

**Como os limites serão aplicados (quando autorizar):**

1. `maxMinutes` — cronômetro da sessão; se estourar, o Atlas **interrompe** o fluxo de teste (não dispara lote extra).
2. `maxUsd` — teto de custo **atribuído ao teste**; se o tempo decorrido × US$/h do Pod exceder o teto, **aborta**.
3. Os limites **não** desligam automaticamente o Pod (isso seria stop pago/operacional à parte); só param a **geração do teste**.
4. O custo de manter o Pod RUNNING fora do teste **não** é “criado” pela autorização — já existe; a autorização cobre só a **janela do teste**.

### Caminho B (migração — não autorizar agora)

| Item | Estimativa |
|------|------------|
| Volume 70 GB (já criado) | **US$ 4,90/mês** (console) — custo contínuo já ativo |
| Pod novo EU-RO-1 + PRO 4500 | ~US$ 0,72/h enquanto RUNNING |
| Cópia ~40 GiB | tempo de GPU/rede — autorização separada |

---

## 7. GPUs para o volume EU-RO-1 (planejamento)

1. **NVIDIA RTX PRO 4500 Blackwell** — 32 GB · ~US$ 0,72/h · LOW em EU-RO-1 · **compatível com o volume**
2. **NVIDIA GeForce RTX 4090** — 24 GB · ~US$ 0,89/h secure · LOW em EU-RO-1
3. **NVIDIA RTX PRO 4500 Blackwell Server Edition** — 32 GB · fallback (hoje nos Pods US-KS-2; no EU-RO-1 o catálogo lista a variante sem “Server Edition”)

---

## 8. Configuração exata para autorizar o teste de **uma** cena

Copie e ajuste se quiser tetos diferentes:

```
AUTORIZO teste LipSync 1 cena
podId=d3ewr3ge0uk002
maxUsd=0.54
maxMinutes=15
caminho=A
confirmar: sem criar volume/Pod; sem copiar modelos; sem migração EU-RO-1; dry-run desliga só para esta geração autorizada
```

Critérios de sucesso (inalterados): Comfy saudável → modelos → workflow → vídeo gerado → baixado → validado (ffprobe).

**Ainda bloqueado até mensagens separadas:** SHA-256 no shell, cópia para o volume, Pod novo em EU-RO-1, Fase 5 / failover automático.

---

## Proteções respeitadas nesta atualização

- Não criar outro Network Volume  
- Não gerar cena / não POST de prompt  
- Não start/stop/terminate de Pods  
- Não alterar workflow, ComfyUI instalado nem arquivos de modelo  
- Dry-run permanece ativo até a autorização explícita do caminho A  
