# Atualizações do Atlas Studio

O Atlas usa **electron-updater** com o **electron-builder** (instalador NSIS para Windows). Os dados do usuário ficam em `userData` (`atlas-studio.db` e `workspace/`) e **não** são substituídos pelo instalador.

Provider oficial: **GitHub Releases** (`provider: github`).

Repositório público:

`https://github.com/MathiasGFuhr/atlas-studio`

Owner: `MathiasGFuhr`  
Repo: `atlas-studio`

Futuras Releases (instalador, `latest.yml` e blockmap) serão publicadas nesse repositório. O electron-updater consulta as GitHub Releases de `MathiasGFuhr/atlas-studio`.

O cliente instalado consulta as Releases públicas. **Não há GH_TOKEN no computador do usuário** nem no binário. Token só entra no ambiente que **publica** (sua máquina de release ou CI futuro).

Se o repositório GitHub for outro, altere `repository` e `build.publish.owner` / `build.publish.repo` em `package.json` **antes** de gerar o primeiro instalador que deve receber updates.

`npm run electron:build` gera os artefatos com `--publish never` e **não publica**.  
`npm run electron:release` publica para GitHub Releases quando `GH_TOKEN` ou `GITHUB_TOKEN` estiver definido. **Não rode o release por acidente.**

Não há workflow de GitHub Actions nesta etapa; a configuração de `publish` já está pronta para um CI depois.

## 1. Alterar a versão no package.json

Edite `version` (semver). Exemplo: `1.5.0` → `1.6.0`.

Essa string vira:

- a versão em Configurações > Sistema > Atualizações
- o arquivo `AtlasStudio-Setup-1.6.0.exe`
- o campo `version` em `latest.yml`
- a tag GitHub `v1.6.0` (`vPrefixedTagName: true`)

Não reutilize um número já publicado.

## 2. Gerar o build (sem publicar)

```bash
npm run electron:build
```

Faz typecheck, Vite e electron-builder Windows **sem upload**.

Saída em `release/`:

- `AtlasStudio-Setup-<versão>.exe` — instalador NSIS
- `AtlasStudio-Setup-<versão>.exe.blockmap` — progresso/delta
- `latest.yml` — manifesto do electron-updater
- `win-unpacked/` — debug local, **não anexar na Release**

## 3. Criar tag / release

Tag e nome da release:

`v1.6.0`

Caminho manual (primeira vez, recomendado):

1. Suba o código para o repositório público.
2. No GitHub: **Releases → Draft a new release**.
3. Tag: `v1.6.0` (igual à versão do `package.json`, com prefixo `v`).
4. Título: `Atlas Studio 1.6.0`.
5. Cole as notas da versão (o updater mostra um resumo).
6. **Não** marque como pre-release.
7. **Não** deixe em draft se quiser que instalações antigas atualizem. Drafts **não** entram no canal estável.

Caminho com electron-builder (quando o token de publicação existir):

```bash
set GH_TOKEN=ghp_...   # só nesta sessão / CI; nunca no código
npm run electron:release
```

Isso cria a release **publicada** (`releaseType: "release"`), a tag `v<version>` e envia os artefatos. Use só quando a versão estiver pronta.

## 4. Quais arquivos anexar

Na Release GitHub, anexe **juntos**:

1. `AtlasStudio-Setup-<versão>.exe`
2. `latest.yml`
3. `AtlasStudio-Setup-<versão>.exe.blockmap`

O `latest.yml` aponta para o nome exato do `.exe`. Não renomeie depois de gerar.

Não anexe `win-unpacked/`, código-fonte extra nem pastas de build.

## 5. Publicar a release

No GitHub, publique a release (não draft, não pre-release).

O electron-updater no Windows busca o canal `latest` nas Releases **públicas** do owner/repo gravados no `app-update.yml` da instalação. Com repositório público isso é HTTP anônimo.

Pre-releases e drafts são ignorados (`allowPrerelease: false` no updater).

## 6. Como instalações antigas detectam a nova versão

1. App empacotado (`app.isPackaged`).
2. Se “Verificar automaticamente” estiver ligado, espera ~8 s após abrir.
3. Consulta GitHub Releases do `MathiasGFuhr/atlas-studio`.
4. Lê `latest.yml` da release estável mais nova.
5. Compara com `app.getVersion()`.
6. Se for maior: notificação “Nova versão do Atlas Studio disponível.” e o painel em Configurações.
7. O usuário escolhe **Baixar atualização** (progresso real 0–100%).
8. **Reiniciar e atualizar** chama `quitAndInstall`. **Depois** deixa o trabalho aberto.

Em `npm run electron:dev` o atualizador **não** consulta a rede sozinho.

Falha de rede não impede o Atlas de abrir.

Dados, migrações e backup:

- Banco: `%APPDATA%/Atlas Studio/atlas-studio.db`
- Workspace: `%APPDATA%/Atlas Studio/workspace`
- `deleteAppDataOnUninstall` está `false`
- Schema incremental em `src/main/db/migrations.ts`. A versão do app **não** recria o banco.
- Backup do `.db` só quando um passo de migração marcar `backup: true` e o backup estiver ativo.

## 7. Como testar 1.5.0 → 1.6.0

A build **antiga** já precisa ter o updater com provider GitHub (esta configuração). A primeira instalação com GitHub Releases é a linha de base.

1. `package.json` em `1.5.0`. `npm run electron:build`. Instale o `.exe`. Crie projetos/dados.
2. Publique no GitHub a release **v1.5.0** com exe + `latest.yml` + blockmap (opcional, mas útil como âncora).
3. Suba `version` para `1.6.0`. `npm run electron:build` de novo.
4. Crie a release **pública** `v1.6.0` com os três arquivos da 1.6.0. Sem draft, sem pre-release.
5. Abra o Atlas **1.5.0** → Configurações → Verificar atualizações → Baixar → Reiniciar e atualizar.
6. Confirme versão `1.6.0` e que banco, projetos, canais, tarefas, prompts e pastas vinculadas continuam iguais.

Override **só para teste local** (não é o provider de produção):

```bash
set ATLAS_UPDATE_FEED_URL=http://127.0.0.1:8787
```

Isso força um feed generic no processo já instalado. Instalações oficiais usam GitHub Releases.

## Token de publicação (não vai no app)

- Crie um PAT com permissão de contents/releases no repositório.
- Defina `GH_TOKEN` ou `GITHUB_TOKEN` apenas na sessão de `npm run electron:release` ou no secret de um GitHub Actions futuro.
- Nunca coloque token em `package.json`, no renderer ou no instalador.

## Primeira release manual (checklist)

1. Confirme o repositório público `MathiasGFuhr/atlas-studio` e os campos `repository` / `build.publish` em `package.json`.
2. Confirme `version` em `package.json`.
3. `npm run electron:build`
4. GitHub → Releases → tag `v1.5.0` → anexe exe, `latest.yml` e blockmap → Publish release.
5. Instalações seguintes com este `publish` passam a achar updates nessa Release.
