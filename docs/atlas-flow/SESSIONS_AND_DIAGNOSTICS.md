# Sessões e diagnóstico atlas-flow-v1

## Duas sessões distintas (não misturar)

| Sessão | Onde | Papel |
|---|---|---|
| **A — Chrome do usuário** | Navegador do computador com Flow já aberto (projetos, avatar, ULTRA) | Sessão de **produção/teste da extensão**. É onde o produto final opera. |
| **B — Browser interno do Cursor** | Painel Browser do agente | Sessão de **pesquisa de UI** apenas. Login ali ≠ login na sessão A. |

Relato do usuário (print): Flow autenticado na sessão A com selo ULTRA.  
**Agente:** isso **não** confirma autenticação na sessão B e **não** valida geração Atlas→extensão→Flow.

Ferramentas MCP do Cursor **não inspecionam** o Chrome do sistema do usuário. Não copiamos cookies nem exportamos credenciais Google.

## Objetivo

Validar: **Atlas → extensão (sessão A) → Flow → imagem no Atlas**.  
Não avançar para lotes até 1 imagem real com 2 refs na linha correta.

## Procedimento concreto (sessão A)

### 1. Build da extensão nova

```bash
npm run atlas-flow:extension:build
```

Pasta a carregar: `apps/atlas-flow-extension/dist`  
**Não** carregar `extensions/atlas-flow-bridge` (legado).

### 2. Instalar no Chrome do Flow

1. Abra `chrome://extensions` **no mesmo perfil** onde o Flow já está logado.
2. Modo desenvolvedor → **Carregar sem compactação**.
3. Selecione `apps/atlas-flow-extension/dist`.
4. Confirme o nome **Atlas Flow v1**.

### 3. Subir o Coordinator

Opção A — só Coordinator (diagnóstico rápido):

```bash
npm run atlas-flow:coordinator
```

Opção B — Atlas completo:

```bash
npm run dev
```

Arquivo gerado (cole no popup): `docs/atlas-flow/coordinator-live.json`  
Campos: `endpoint` + `pairingToken` (local, **não** é senha Google).

### 4. Diagnóstico pela extensão

1. Clique no ícone **Atlas Flow v1**.
2. Cole o **pairing token** do Atlas.
3. (Opcional) endpoint `http://127.0.0.1:39301` — se vazio, a extensão varre 39301–39305.
4. **Rodar diagnóstico**.
5. Esperado para conexão mínima:
   - `health.ok: true`
   - `hello.ok: true` / badge `hello ok`
   - logs locais no popup
6. Isso **ainda não** valida geração Flow nem imagem no Atlas.

### 4b. Inspecionar sessão Flow (próximo passo após hello OK)

1. Com o Flow aberto em `https://flow.google.com/...` **neste mesmo Chrome**.
2. Em `chrome://extensions`, **Recarregar** Atlas Flow v1 (após atualizar o dist).
3. Recarregar a aba do Flow (content script).
4. No popup: **Inspecionar sessão Flow**.
5. A observação é postada ao Coordinator e gravada em  
   `docs/atlas-flow/last-session-observation.json`.
6. Continua **NÃO VALIDADA** a geração; só evidência passiva de UI/URL.

### 5. Se health falhar

| Sintoma | Verificação |
|---|---|
| Coordinator não encontrado | Atlas aberto? log mostra porta? |
| 401 no hello | Token errado / token de outra execução do app |
| 403 Host | URL deve ser `127.0.0.1`, não IP da LAN |
| Extensão antiga | Remova atlas-flow-bridge do caminho de teste |

### 6. Sessão B (pesquisa de controles)

Só se precisarmos mapear seletores da UI Flow: autenticar **no Browser do Cursor**, separado, e registrar em `FLOW_OBSERVATIONS.md` sem transferir cookies da sessão A.

## Estado atual

- Coordinator: escuta real em `127.0.0.1` (código novo).
- Extensão: health/hello/heartbeat + logs locais.
- Integração real Flow: **NÃO VALIDADA**.
- Marco imagem: **não cumprido**.
