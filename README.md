# Atlas Studio

Sistema de roteiros com IA para desktop (Windows).

Repositório: [github.com/MathiasGFuhr/atlas-studio](https://github.com/MathiasGFuhr/atlas-studio)

Escolha o **nicho**, o **idioma**, escreva o **tema** e clique em **Gerar roteiro**.  
O Atlas resolve a skill correta, conversa com o Codex nos bastidores e entrega o texto final.

## Requisitos

- Windows 10/11
- Node.js 20+
- npm 10+
- [Codex CLI](https://github.com/openai/codex) instalado e autenticado (para geração real)

## Instalação

```bash
npm install
```

O `postinstall` aplica um patch local do plugin Electron do Vite.

## Desenvolvimento

```bash
npm run dev
```

Abre o Vite + Electron. A interface roda em `http://localhost:5173` dentro da janela do app.

## Scripts úteis

| Comando | Descrição |
|---|---|
| `npm run dev` | App em desenvolvimento |
| `npm run typecheck` | TypeScript (main + renderer) |
| `npm run lint` | ESLint |
| `npm run build` | Build de produção (renderer + electron) |
| `npm run electron:build` | Gera instalador Windows (`.exe` via NSIS) |

## Estrutura

```
src/
  main/                 # Electron main process
    db/                 # SQLite schema + seed
    repositories/       # niches, scripts, settings
    services/codex/     # CodexService (app-server / CLI)
    services/storage/   # arquivos .md dos roteiros
    ipc/                # handlers IPC seguros
  preload/              # bridge contextIsolation
  renderer/             # React UI
  shared/               # tipos + canais IPC
workspace/
  skills/<nicho>/SKILL.md
  projects/<nicho>/scripts/...
  memory/<nicho>/
mocks/                  # fallback UI sem Electron
design-references/      # referências oficiais de UI
```

## Fluxo principal

1. Usuário escolhe **nicho** (não a skill)
2. Escolhe **idioma**
3. Escreve **tema**
4. Clica **Gerar roteiro**
5. Main process:
   - carrega `SKILL.md` do nicho
   - consulta memória/roteiros anteriores do nicho
   - chama Codex (`app-server` se disponível, senão `codex exec`)
   - salva no SQLite + filesystem
6. UI mostra progresso e abre **Roteiro pronto**

## Codex

Camada: `src/main/services/codex/CodexService.ts`

Métodos:

- `connect()` / `disconnect()` / `healthCheck()` / `getStatus()`
- `createThread()`
- `generateScript()`
- `adjustScript()`
- `cancel()`

Detecção:

1. Procura o binário `codex` (PATH ou locais comuns no Windows)
2. Se `--help` listar `app-server`, usa JSON-RPC via stdio
3. Caso contrário, usa `codex exec`

Variável opcional:

```bash
set CODEX_PATH=C:\caminho\para\codex.exe
```

## Skills por nicho

Cada nicho aponta para uma pasta:

```
workspace/skills/historia-alemanha/SKILL.md
```

Associação fica no SQLite (`niches.skill_path`).  
Regras de um nicho **não** contaminam outro.

### Como criar um nicho

1. Abra **Nichos** → **Novo nicho**
2. Informe nome, idioma, descrição
3. Selecione a pasta da skill existente
4. Salve

### Como associar skill

No formulário do nicho, o campo **Skill associada** deve apontar para a pasta que contém `SKILL.md`.

## SQLite

Banco local em `%APPDATA%/atlas-studio/atlas-studio.db` (userData do Electron).

Implementação V1: **sql.js** (SQLite via WASM), sem necessidade de Visual Studio / node-gyp.
A API permanece a mesma; é possível trocar por `better-sqlite3` depois se preferir binding nativo.

Tabelas:

- `niches`
- `scripts`
- `script_versions`
- `generation_runs`
- `settings`

## Arquivos legíveis

Além do banco, cada geração grava:

```
workspace/projects/<nicho>/scripts/001-titulo/
  script-v1.md
  script-v2.md
  metadata.json
```

## Ajustes e versões

Na tela **Roteiro pronto**:

- escreva o ajuste em linguagem natural
- ou use chips (Mais emoção / Mais retenção / Mais curto)
- cada ajuste cria `v2`, `v3`, ... com prompt registrado

Métricas de qualidade (Originalidade, Retenção, Naturalidade, Similaridade) só aparecem quando houver auditoria real. Sem auditoria: **Não analisado** (sem números aleatórios).

## Gerar instalador Windows

```bash
npm run electron:build
```

Saída em `release/AtlasStudio-Setup-<versão>.exe` (a versão atual está em `package.json`).

## Design

As imagens em `design-references/` são a autoridade visual do produto.  
Tema dark + accent `#35E58B`, tipografia Inter, layout respirável.

## Observações

- O renderer **nunca** executa shell diretamente — tudo passa por IPC.
- Sem Codex instalado, a UI funciona; a geração real exige o CLI autenticado.
- Escopo V1: Criar roteiro, Nichos, Roteiros, Roteiro pronto, Configurações.
