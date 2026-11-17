# Atlas Flow v1 — Decisão de Arquitetura

**Data:** 2026-11-13  
**Namespace:** `atlas-flow-v1`  
**Fase:** 00 — Inventário e decisão  
**Status:** Decisão registrada

## Inventário do Atlas real

| Aspecto | Achado |
|---|---|
| Runtime | Desktop Electron (Windows), Vite + React renderer |
| Processo de serviço | Electron main (`src/main`) |
| Banco | SQLite via `sql.js` (`src/main/db`), migrações aditivas |
| Storage | Arquivos no workspace + diretórios de mídia locais |
| Auth Atlas | App desktop local; sem backend cloud obrigatório para o core |
| UI candidata | Nova UI em `src/renderer/modules/atlas-flow-v1` (não reutilizar telas antigas de geração) |
| Extensão legada | `extensions/atlas-flow-bridge` + `FlowBridgeServer` + `FlowProjectService` |
| IPC legado | Canais `flowProjects:*` ainda registrados |

## Decisão obrigatória (seção 04)

**Atlas é desktop.** O Coordinator será hospedado no processo main do Electron.

### Transporte único escolhido

**Local loopback autenticado: HTTP REST + WebSocket em `127.0.0.1`.**

- Bind exclusivo em `127.0.0.1` (nunca `0.0.0.0` por padrão)
- Porta configurada pelo app e exibida na UI de pareamento
- REST para claim, ACK, eventos, leases, uploads e reconciliação
- WebSocket para avisos/eventos em tempo real (não é fila nem banco)
- Fallback de polling HTTP (≤ 20s) se WS cair, sem invalidar trabalhos
- Credencial própria da instalação (pareamento device-auth); localhost ≠ autenticação
- Validação de `Host`/`Origin` em toda requisição

### O que NÃO será feito nesta entrega

- Segundo transporte cloud “por precaução”
- Fila exclusiva no frontend
- Reuso de `FlowBridgeServer`, `flowBridgeProtocol`, extensão `atlas-flow-bridge` ou seletores antigos
- Cópia de código de concorrentes
- Vídeo Flow, n8n, Selenium/Playwright como executor de produção

## Componentes lógicos

```
A. Atlas UI (renderer)     → projetos, refs, linhas, imagens, status
B. Coordinator (main)      → API loopback, SQLite, scheduler, leases, ingestão
C. Extensão MV3 nova       → apps/atlas-flow-extension (conexão, journal, aba)
D. Flow Adapter versionado → apps/atlas-flow-extension/src/flow
```

## Isolamento da integração legada

- Código antigo permanece no disco (sem limpeza destrutiva).
- Caminho novo (`atlas-flow-v1`) não importa módulos do bridge antigo.
- IPC/UI antigos de geração Flow não serão o caminho de execução da nova fila.
- Dados `google_flow_*` não serão migrados automaticamente nesta entrega.

## Organização de arquivos (adaptada ao repo)

| Manual | Neste repo |
|---|---|
| `packages/atlas-flow-protocol/` | `packages/atlas-flow-protocol/` |
| `apps/atlas-flow-extension/` | `apps/atlas-flow-extension/` |
| `server/modules/atlas-flow/` | `src/main/services/atlas-flow-v1/` |
| `ui/modules/atlas-flow/` | `src/renderer/modules/atlas-flow-v1/` |
| `docs/atlas-flow/` | `docs/atlas-flow/` |

## Persistência

- Estado durável da fila: SQLite do Atlas (tabelas novas `flow_*` do contrato v1)
- Artefatos: diretório de arquivos do app (não JSON gigante)
- Extensão: IndexedDB `atlas-flow-executor-v1` + `chrome.storage.local/session`

## Justificativa

O Atlas já é um app Electron com SQLite local. Um Coordinator no main com HTTP/WS em loopback atende o manual sem inventar backend cloud, mantém a extensão independente da aba do Atlas e preserva fila/leases no servidor (não no popup).
