# Atlas Flow v1 — Matriz de Aceitação

**Atualizado:** 2026-11-13  
**Legenda de resultado:** `pendente` | `simulado` | `local` | `real` | `incompatível`

| ID | Requisito | Teste planejado | Tipo | Resultado | Evidência |
|---|---|---|---|---|---|
| RF-01 | Criar projeto Atlas e vínculo Flow | ensure projeto 2x sem duplicar | real | pendente | — |
| RF-02 | Anexar refs com aliases | upload + rename alias | real | pendente | — |
| RF-03 | Upload único por versão | 2 prompts reutilizam binding | real | pendente | — |
| RF-04 | Blocos → linhas estáveis | import multiline com preview | local | pendente | — |
| RF-05 | Lote ≤ 3 prompts | 6 prompts / 2 lotes | real | pendente | — |
| RF-06 | Resultado na linha original | fora de ordem | real | pendente | — |
| RF-07 | Regenerar uma linha | demais intactas | real | pendente | — |
| RF-08 | Versões + aprovação | fixar aprovada | real | pendente | — |
| RF-09 | Sobrevive reinícios | kill worker/Chrome/app | real | pendente | — |
| RF-10 | Etapas/erros reais | falha forçada + UI | real | pendente | — |
| RF-11 | Usuário no Atlas | gerar com Flow em background | real | pendente | — |
| RF-12 | Sem troca silenciosa | conta/projeto/modelo divergente | real | pendente | — |
| INV-04 | Sem retry cego de efeito incerto | desconectar pós-intent | real | pendente | — |
| INV-05 | Concluído = asset no Atlas | bytes + hash + vínculo | real | pendente | — |
| SEC-01 | Token não vaza na página Flow | inspeção DevTools | real | pendente | — |
| SEC-02 | Bind só 127.0.0.1 | checagem de listen | local | pendente | — |
| PAIR-01 | Pareamento + revoke | popup fechado mantém vínculo | real | pendente | — |

Nenhum item acima pode ser marcado `real` sem evidência registrada em `FLOW_OBSERVATIONS.md` ou relatório de teste.
