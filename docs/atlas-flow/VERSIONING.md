# Versionamento atlas-flow-v1

| Campo | Onde | Significado |
|---|---|---|
| `manifest.version` | `apps/atlas-flow-extension/src/manifest.json` | Versão da extensão (Chrome) |
| `sensorVersion` | `content.js` (`__ATLAS_FLOW_V1_SENSOR__.version`) | Versão do content script/sensor |

São **campos independentes**. Se divergirem, pode ser:
1. etiqueta do sensor desatualizada (constante esquecida), ou
2. content script antigo ainda injetado (aba não recarregada / inject cache).

Não presumir a causa sem checar `dist/manifest.json`, `dist/content.js` e PING (`sensorVersion`).

**Atual:** ambos alinhados em `0.3.6` (upload real → uploaded_bound → attached → gerar; NÃO VALIDADO).
