# Atlas Flow v1 — Status de Implementação

**Branch:** `feat/atlas-flow-v1`  
**Namespace:** `atlas-flow-v1`  
**Atualizado:** 2026-11-13

## Legenda

| Marcador | Significado |
|---|---|
| NÃO INICIADO | Ainda não há código |
| EM ANDAMENTO | Trabalho aberto |
| IMPLEMENTADO | Código presente, sem prova Flow real |
| TESTE LOCAL | Testes automatizados/locais ok |
| TESTE FLOW REAL | Validado com conta/sessão Flow autenticada |
| NÃO VALIDADO | Integração real ainda sem evidência |
| BLOQUEADO | Dependência externa explícita |

## Fases

| Fase | Nome | Status | Evidência |
|---|---|---|---|
| 00 | Inventário e decisão | IMPLEMENTADO | `ARCHITECTURE_DECISION.md`, mapa abaixo |
| 01 | Observar Flow | EM ANDAMENTO | Sessão A (Chrome usuário) relatada; sessão B não autenticada; ver `FLOW_OBSERVATIONS.md` |
| 02 | Contratos e esqueleto | PARCIAL | Protocolo + migração 46 + Coordinator listen + MV3 diagnóstico; real NÃO VALIDADA |
| 03 | Pareamento/conexão | EM ANDAMENTO | health/hello/heartbeat locais; aguarda teste no Chrome do Flow |
| 03 | Pareamento e conexão | NÃO INICIADO | — |
| 04 | Aba, sessão e projeto | NÃO INICIADO | — |
| 05 | Referências reais | NÃO INICIADO | — |
| 06 | Um ciclo completo real | NÃO INICIADO | Portão obrigatório antes de lotes |
| 07 | Recuperação | NÃO INICIADO | — |
| 08 | Blocos e fila | NÃO INICIADO | — |
| 09 | Regeneração e galeria | NÃO INICIADO | — |
| 10 | Pausa/cancelamento | NÃO INICIADO | — |
| 11 | Interface final | NÃO INICIADO | — |
| 12 | Piloto e empacotamento | NÃO INICIADO | — |
| 13 | Publicação loja | NÃO INICIADO | Só após piloto |

## Mapa das interfaces do Atlas (Fase 00)

| Área | Local | Papel na integração nova |
|---|---|---|
| Electron main | `src/main` | Hospeda Coordinator `atlas-flow-v1` |
| SQLite | `src/main/db` | Migrações aditivas das tabelas `flow_*` |
| IPC | `src/main/ipc`, `src/preload` | UI Atlas ↔ Coordinator (canais novos) |
| Renderer | `src/renderer` | UI nova em `modules/atlas-flow-v1` |
| Página prompts (manual copy) | `FlowPromptsPage` | Preservar; não é o executor |
| Integração legada | `services/flow/*`, `extensions/atlas-flow-bridge` | Isolada; não importar |
| Protocolo legado | `shared/flowBridgeProtocol.ts` | Fora do caminho v1 |

## Requisitos RF rastreados

| RF | Descrição curta | Status |
|---|---|---|
| RF-01 | Projeto Atlas → vínculo Flow | NÃO VALIDADO |
| RF-02 | Anexar refs com aliases | NÃO VALIDADO |
| RF-03 | Upload único por versão | NÃO VALIDADO |
| RF-04 | Prompts em blocos → linhas | NÃO VALIDADO |
| RF-05 | Lotes de até 3 prompts | NÃO VALIDADO |
| RF-06 | Resultado na linha original | NÃO VALIDADO |
| RF-07 | Regenerar só a linha | NÃO VALIDADO |
| RF-08 | Versões + aprovação | NÃO VALIDADO |
| RF-09 | Sobrevive a reinícios | NÃO VALIDADO |
| RF-10 | Etapas/erros reais | NÃO VALIDADO |
| RF-11 | Usuário permanece no Atlas | NÃO VALIDADO |
| RF-12 | Sem troca silenciosa de projeto/conta/modelo | NÃO VALIDADO |

## Entregue (parcial)

- Protocolo Zod + migração 46 + docs de sessões/diagnóstico
- Coordinator **escutando** em `127.0.0.1:39301+` (health/hello/heartbeat)
- Extensão MV3 com popup de diagnóstico/logs: `npm run atlas-flow:extension:build`
- IPC `atlasFlowV1.status` / `openExtensionFolder`

## Pendências concretas

1. Usuário carrega a extensão no **Chrome da sessão A** e roda diagnóstico (ver `SESSIONS_AND_DIAGNOSTICS.md`).
2. Mapear controles Flow com evidência real (sessão A via extensão, ou pesquisa separada na B).
3. Ciclo completo 1 linha + 2 refs + imagem no Atlas — **não** cumprido; sem lotes até lá.

## Próximo passo (project.ensure)

1. Recarregar extensão **0.3.0** (`apps/atlas-flow-extension/dist`) + aba Flow.
2. Atualizar token de `docs/atlas-flow/coordinator-live.json` (porta atual **39303**).
3. Diagnóstico (health/hello) → **Criar/vincular projeto**.
4. Esperado: `flowProjectId` + URL `/project/{id}` em `docs/atlas-flow/last-project-link.json`.
5. Repetir o botão: deve retornar `reused` / `action: reuse` sem novo projeto.
6. Geração permanece **NÃO VALIDADA**.
