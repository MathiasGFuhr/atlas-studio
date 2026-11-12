# RunPod + ComfyUI — Fase 1 (somente leitura)

## Objetivo

Provar comunicação segura **Atlas → RunPod REST API v2** sem ligar, criar, parar ou excluir Pods. O pipeline existente de LipSync (fila SQLite, upload, polling, download local, FFmpeg) permanece intacto.

## Arquitetura

| Peça | Onde | Papel |
|------|------|--------|
| `RunpodClientV2` | `src/main/services/comfy/runpod/RunpodClientV2.ts` | HTTP GET em `https://api.runpod.io/v2/...` |
| Mapeamento v2 | `src/main/services/comfy/runpod/mapRunpodV2.ts` | Pods/GPUs/volumes/templates → resumos |
| Status | `src/main/services/comfy/runpod/refreshRunpodStatus.ts` | Painel de estado (sem mutação) |
| Descoberta URL | `src/main/services/comfy/runpod.ts` + `discoverComfyUrl` | Lista pods v2 e monta `…-8188.proxy.runpod.net` |
| Segredo | `comfyStore` + `runpodSecretStore` | API Key via `safeStorage` (DPAPI no Windows); fallback plaintext sem descartar legado |
| Tipos de plano | `src/shared/runpod.ts` | Feature flag e interfaces para Fases 2–5 |
| UI | `ComfySettingsCard` | Status + botão **Atualizar status** |
| IPC | `comfy:getRunpodStatus` | Só leitura; chave nunca volta ao renderer |

A aba LipSync, `ComfyQueueService`, `ComfyClient`, download em `{pasta}/lipsync` e o trim FFmpeg **não** foram reescritos.

## Feature flag

`runpodAutoInfraEnabled` (config Comfy) começa **false**. Nesta fase a flag só é persistida; **não** inicia Pods na abertura do Atlas.

## Como testar com a chave já cadastrada

1. Abra o Atlas em desenvolvimento (`npm run dev`).
2. Vá em **Configurações → ComfyUI (RunPod)**.
3. Se a chave já estiver salva, o campo permanece vazio com o placeholder “Chave salva…”. **Não** cole a chave no chat nem em commits.
4. Clique em **Atualizar status**.
5. Confira:
   - API válida / inválida (mensagem útil, sem vazar segredo);
   - lista de pods (id, nome, status, GPU, datacenter);
   - URL configurada vs sugerida (se o pod da URL antiga não estiver `RUNNING`, marca URL obsoleta);
   - ComfyUI acessível ou não (`/system_stats`);
   - linha `Mutações nesta consulta: 0`.
6. Fluxo manual antigo: URL digitada + **Testar conexão** e geração LipSync continuam iguais.
7. Sem chave: o Atlas inicia normalmente; modo manual por URL funciona.

## Conferir que não há mutação

- O cliente Fase 1 só implementa GET (`/v2/pods`, `/v2/pods/{id}`, `/v2/catalog/gpus`, `/v2/network-volumes`, `/v2/templates`).
- Testes unitários em `RunpodClientV2.test.ts` assertam método GET e `mutationCalls: 0`.
- Não há endpoints de `action` start/stop nem `POST /v2/pods` nesta fase.

## Proteção da API Key

- Renderer só recebe `hasRunpodApiKey: boolean`.
- Persistência preferencial: `comfyRunpodApiKeyEnc` (base64 do `safeStorage.encryptString`).
- Se a criptografia do SO não estiver disponível, mantém `comfyRunpodApiKey` em plaintext (fallback explícito) e **não** apaga a chave antiga.
- Na leitura, plaintext legado é migrado para encrypted quando possível.
- Logs sanitizam chaves/`Authorization` via `logger`.

## Próximos marcos (não implementados)

- **Fase 2:** iniciar Pod existente, aguardar saúde ComfyUI + LTX.
- **Fase 3:** template/versionamento LTX-2.3 + Network Volume.
- **Fase 4:** whitelist de 3 GPUs + teto de preço + aprovação antes de criar.
- **Fase 5:** lifecycle manager + desligamento seguro após downloads confirmados.
- **Fase 6:** isolamento multi-usuário / tenant.

## Limitação documentada

Na listagem `GET /v2/pods`, o campo `runtime` vem `null` (métricas só em `GET /v2/pods/{id}`). A descoberta do Comfy usa as **portas configuradas** do pod (`8188/http`) + `status === RUNNING`, alinhado ao contrato v2 publicado.
