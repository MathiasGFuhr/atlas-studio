# Validação real controlada LTX-2.3 (pré-Fase 5)

Relatório em dry-run. **Nenhuma geração nem operação paga nesta preparação.**

Artefatos: `resources/ltx-environment/controlled-validation-report.md` (+ JSON / inventário / snapshot).

No Atlas: **Ambiente LTX → Plano teste real**.

## Network Volume já criado (não recriar)

| Campo | Valor |
|-------|-------|
| Nome | inadequate_magenta_crow |
| ID | `tjp7a4uk0y` |
| DC | **EU-RO-1** |
| Tamanho | 70 GB |
| Custo console | US$ 4,90/mês |

Pods LTX atuais permanecem em **US-KS-2** (sem NV). O volume é para **migração futura** (caminho B).  
Teste de 1 cena (caminho A) = Pod `d3ewr3ge0uk002` RUNNING, sem usar o volume.

GPU prioritária no EU-RO-1 com o volume: **NVIDIA RTX PRO 4500 Blackwell** (32 GB).

## Como autorizar o teste (caminho A)

```
AUTORIZO teste LipSync 1 cena
podId=d3ewr3ge0uk002
maxUsd=0.54
maxMinutes=15
caminho=A
confirmar: sem criar volume/Pod; sem copiar modelos; sem migração EU-RO-1
```

`maxMinutes` = relógio de parede da sessão; `maxUsd` = teto incremental do teste (não desliga o Pod sozinho).
