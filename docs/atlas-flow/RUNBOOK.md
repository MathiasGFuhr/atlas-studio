# Atlas Flow v1 — Runbook

**Atualizado:** 2026-11-13  
**Ambiente alvo:** Windows 10/11, Node 20+, npm 10+, Chrome estável

## Pré-requisitos

1. Clonar o repo e entrar na branch `feat/atlas-flow-v1`
2. `npm install`
3. Conta Google com acesso ao [Google Flow](https://labs.google/fx/tools/flow) no perfil do Chrome de teste
4. Não usar a extensão legada `extensions/atlas-flow-bridge` no caminho v1

## Desenvolvimento do Atlas

```bash
npm run dev
```

Abre Electron + Vite em `http://127.0.0.1:5173/`.

## Extensão nova (quando o build existir)

```bash
# (comandos serão preenchidos na Fase 02)
# esperado: build MV3 em apps/atlas-flow-extension/dist
```

1. Chrome → `chrome://extensions`
2. Modo desenvolvedor → Carregar sem compactação
3. Selecionar a pasta `dist` gerada da extensão **nova** (`atlas-flow-v1`)
4. Anotar o ID da extensão (deve ser estável por ambiente)

## Pareamento (quando a Fase 03 existir)

1. No Atlas, abrir a tela de status Flow v1
2. Anotar endereço `127.0.0.1:<porta>` exibido
3. Na extensão, iniciar pareamento e confirmar o código no Atlas
4. Verificar instalação vinculada + opção Desconectar

## Teste mínimo de saúde

| Passo | Esperado |
|---|---|
| App sobe | Coordinator escuta só em 127.0.0.1 |
| Extensão pareada | heartbeat ok |
| Popup fechado | vínculo permanece |
| Comando `executor.inspect` | ACK + evento persistido |

## Diagnóstico

| Sintoma | Próxima ação segura |
|---|---|
| Extensão desconectada | Reabrir Chrome/perfil; não reenviar efeitos incertos |
| Conta Flow desconhecida | Pausar gerações; confirmar conta na UI |
| Envio incerto | Abrir reconciliação assistida; não retry cego |
| Porta ocupada | Usar porta configurada pelo app; não escanear portas de terceiros |

## Recuperação

1. Não apagar IndexedDB da extensão com trabalho pendente
2. Não revogar instalação no meio de `SUBMISSION_INTENT_RECORDED` sem registrar incerteza
3. Reinício do app deve reconciliar outbox/inbox a partir do SQLite

## Observação do Flow (Fase 01)

Procedimento manual obrigatório:

1. Abrir Flow autenticado no perfil de teste
2. Criar projeto
3. Upload de duas referências
4. Anexar, gerar e baixar resultado
5. Registrar evidências em `FLOW_OBSERVATIONS.md`

Sem isso, seletores e correlação permanecem desconhecidos.
