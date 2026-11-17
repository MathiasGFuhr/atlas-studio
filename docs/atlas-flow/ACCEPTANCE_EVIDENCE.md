# Evidências de aceitação (atlas-flow-v1)

**Geração real:** NÃO VALIDADA  
**Atualizado:** 2026-11-13

## project.ensure — verificado pelo usuário

| Item | Valor |
|---|---|
| atlasProjectId | `359ddd99-a504-40c5-86d7-c2e28658e01a` |
| flowProjectId | `d15189a6-30b9-4681-b86c-a93da144d4fe` |
| flowProjectUrl | `https://flow.google.com/project/d15189a6-30b9-4681-b86c-a93da144d4fe` |
| linkState | `linked` |
| submissionCertainty | `accepted` |
| Seletor confirmado | `unique_aria_or_text` / label `addNew project` / matchCount=1 |
| Pós-condição | URL passou de `https://flow.google.com/?pli=1` → `/project/{id}` |
| 2ª chamada | mesmo `flowProjectId`, `created=false`, `reused=true` |

Fonte: `docs/atlas-flow/last-project-link.json` + relato do usuário.

## Referências / geração

| Etapa | Estado |
|---|---|
| Store Atlas (2 arquivos) | **feito** — `staged_local`, `attached=not_attached` (fixtures ref-a/ref-b) |
| Upload Flow + identidade real | pendente (falta inspeção UI dentro do projeto) |
| Reuso sem reupload | pendente |
| Anexação na composição ≠ upload | pendente |
| Prompt preservado com 2 anexos | pendente |
| Geração + bytes na linha | NÃO VALIDADO |

### Staging Atlas (atual, shas distintos)

- Projeto: `359ddd99-…` ↔ Flow `d15189a6-30b9-4681-b86c-a93da144d4fe` (preservado)
- ref-a: `d009f1bf-…` sha256 `ccde94e2…324c8` upload=`staged_local` attached=`not_attached`
- ref-b: `5940c6fd-…` sha256 `5a5b9ba1…bf450` upload=`staged_local` attached=`not_attached`
- Distinção: staged_local ≠ upload_attempted ≠ bound ≠ attached

### Divergências diagnosticadas

1. **sensorVersion 0.3.0 vs extensão 0.3.1:** campos independentes; constante do content script estava atrasada. Agora ambos `0.3.2` (ver `VERSIONING.md`).
2. **filePath session vs project:** o Coordinator em memória tinha sido iniciado *antes* do branch `kind===project_page`. Corrigido; probe grava `last-project-page-observation.json`. Cópia da inspeção real também foi salva nesse arquivo.
