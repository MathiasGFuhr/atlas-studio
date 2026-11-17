# Atlas Flow v1 — Observações do Flow

**Status:** projeto vinculado com evidência. Geração **NÃO VALIDADA**.  
**Atualizado:** 2026-11-13  
**Origem:** `https://flow.google.com`

## Projeto vinculado (preservar)

| Campo | Valor |
|---|---|
| atlasProjectId | `359ddd99-a504-40c5-86d7-c2e28658e01a` |
| flowProjectId | `d15189a6-30b9-4681-b86c-a93da144d4fe` |
| flowProjectUrl | `https://flow.google.com/project/d15189a6-30b9-4681-b86c-a93da144d4fe` |
| Seletor New project | label `addNew project`, único, pós-condição URL ok |
| Idempotência | 2ª chamada → reuse, mesmo ID |

## Sessão (home, antes do projeto)

- Conta (aria): `Google Account: Mathias gilvan Fuhr (mathiasgilvanf@gmail.com), Google membership`
- Plano: `ULTRA tier`
- Sign-in: não visível

## Controles DENTRO do projeto (observados)

URL confirmada: `/project/d15189a6-30b9-4681-b86c-a93da144d4fe`

Labels relevantes:
- `Add media menu`
- `Add ingredients to the prompt box`
- `What do you want to create?` / editor (`Editable text` / contenteditable)
- `Start generation`
- `fileInputs: []` no estado inicial (**não** prova ausência de upload)

Upload UI (0.3.5): `Upload media` + `input[type=file]` oculto, accept PNG/JPEG, multiple.

## Distinções obrigatórias

- **staged_local** = bytes no Atlas (sha/tamanho)
- **uploaded_bound** = identidade Flow (`flowMediaId`) após conclusão real do upload  
- **attached** = selecionado no draft (etapa separada)  
- FileList/change ≠ upload concluído; miniatura isolada ≠ identidade  
- Geração / marco completo: **NÃO VALIDADO** até imagem na linha

## Attach (evidência 0.3.11–0.3.12 → correção 0.3.13)

- Clique no tile com nome/`flowMediaId` na **timeline** abre `/project/.../edit/<id>` (viewer/editor). **Não** anexa ingredient.
- Caminho observado para anexar: `Add ingredients to the prompt box` → painel (`Search assets` / `Upload media`) → selecionar asset **no painel**.
- `ATTACH_OPENED_MEDIA_EDIT` + `panelRootPresent:false` (0.3.12): painel “presente” por labels, mas sem root escopável → name-hit caiu na timeline.
- Regra 0.3.13: **sem `panelRoot` não clica**; recovery de `/edit/` via Finished/Back/`history.back`/assign do projeto.
- Evidência 0.3.13: painel abriu (`Search assets`, `Asset list`, `atlas-ref-*.pngImage`, `Add to prompt`), mas root era só o toolbar → `ATTACH_TARGET_NOT_IN_PANEL` (`scopedHitCount=0`).
- Regra 0.3.14: expandir root até **Asset list** / **Add to prompt**; selecionar item da lista; clicar **Add to prompt**.
- Evidência 0.3.14: search `atlas-ref-a` → um `atlas-ref-a.pngImage` visível, mas `ATTACH_TARGET_AMBIGUOUS` (2 nós aninhados). Ref-b: search sem wait → lista ainda com a.
- Regra 0.3.15: setter nativo no Search + wait até label filtrada; dedupe ancestral/folha; preferir label exata `*.pngImage`.
- Evidência 0.3.15: **ref-a `attached`** (newLabels `Ingredient`/`Clear prompt`). Ref-b clique OK na UI (2 chips no prompt), mas timeout — `collectAccessibleLabels` deduplica o 2º `"Ingredient"`.
- Regra 0.3.16: confirmar attach por **delta de chips/controles Ingredient** (sem dedupe), não só newLabels.
- Evidência 0.3.16: **2 refs attached** no draft (`ingredientControls` 0→1 e 1→2; chips media/buttons 0→1→2). Sem reenvio. `didAttach=true`. Geração ainda **NÃO VALIDADA**.
- 0.3.17: ação isolada **Prompt + gerar (2 attached)** — escreve prompt, clica Start generation; `realFlowValidated=false` até imagem na linha.
- Evidência 0.3.17: `prompt_generate_clicked` OK (`Start generation` único/utilizável; `certainty=may_have_sent`). Marco ainda **NÃO VALIDADO**.
- 0.3.18: **Observar resultado da geração** — espera tile/label de mídia nova (≠ refs conhecidas); não valida bytes.
- Evidência: clique `Start generation` sem mudança de estado (before≈after) → geração **não iniciou**. Hipótese: texto ia para o contenteditable do **título** (`Editable text`), não o composer.
- 0.3.19: `findPromptEditor` ancorado no composer; `insertText`; exige sinal pós-clique (`GENERATE_NO_EFFECT` se nada mudar).
- Evidência 0.3.19: prompt OK no composer (`editorTop≈781`, `insertText`), mas `GENERATE_NO_EFFECT` após clique em Start generation (before≈after).
- 0.3.20: hard-click pointer/mouse, paste no prompt, retries Ctrl/Meta+Enter + 2º clique.
- Evidência 0.3.20: prompt OK; `GENERATE_NO_EFFECT` após hard-click + Ctrl/Meta+Enter. Usuário: **clique manual na setinha gera**. Hipótese: Flow exige gesto `isTrusted`.
- 0.3.21 / sensor 0.3.19: `Start generation` via `chrome.debugger` CDP `Input.dispatchMouseEvent` (clique trusted); fallback sintético só se debugger falhar. Banner amarelo breve ao anexar debugger é esperado.
- Evidência 0.3.21: **geração iniciou** após Prompt+gerar (usuário: “deu certo”). UI: prompt Atlas Flow v1 + 2 ingredients (atlas-ref-a/b) + tiles ~99% / retrato na linha. Clique trusted desbloqueou o que o sintético não fazia. Marco de bytes na linha ainda depende de **Observar resultado**.
- Evidência observe 0.3.21: `observed_scene_delta_weak` (scene 7→9) mas labelsSample já tinha `Atlas Flow v1 portrait` / `Portrait in window light` / `Reuse prompt` / `Download batch` — detector só via `.png` + baseline pós-gerar (presença ignorada).
- 0.3.22 / sensor 0.3.20: observe por **presença** de título de tile / UI de batch (não só delta); títulos sem extensão contam como evidência. `realFlowValidated` continua false até bytes.
- Evidência observe 0.3.22: `certainty=observed_generation_tile_present` — `Atlas Flow v1 portrait`, `Portrait in window light`, `Close-up portrait of Atlas Flow` + batch UI (`Reuse prompt`, `Download batch`). Projeto `d15189a6…`. Marco de **bytes** ainda aberto.
- 0.3.23 / sensor 0.3.21: ação **Capturar bytes do resultado** — lê imgs grandes na linha (fetch/canvas), POST `/results/stage`, grava `docs/atlas-flow/results/` + `last-generation-result.json` com sha256.
- 0.3.24: poll de jobs (`commands/claim`) na extensão — mesmo adaptador do popup (attachBound → prompt+gerar → observe → capture com `attemptId`). Bancada Atlas (rota Flow) enfileira via IPC/`flow_*`. Token do Coordinator **reutilizado** de `coordinator-pairing.local.json`.
- Validação local 2026-11-13: Coordinator `39305` com token estável; `GET /commands/claim` → `{command:null}`; vínculo `d15189a6…` restaurado; bancada UI na rota Flow. Ciclo completo Atlas→imagem na linha **aguarda** extensão 0.3.24 pareada + Gerar na UI.
- 0.3.25: persistência de pareamento — causa: `ensureBoot` sem hello; health falho marcava `paired=false`; alarm RECOVERY sem handler; hop de porta. Correção: `pairingStore` + auto-reconnect/backoff; token em userData; porta preferida fixa; código de uso único (`pairing/claim`); campo token vazio mantém credencial; Desconectar explícito.

## Refs staged para ciclo (0.3.6)

Ver `last-real-refs-stage.json` (`atlas-ref-a` / `atlas-ref-b`, PNGs 96×96). Coordinator atual: endpoint em `coordinator-live.json` (sem token).
