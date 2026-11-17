# atlas-flow-extension (atlas-flow-v1)

Extensão Chrome MV3 **nova**. Não reutiliza `extensions/atlas-flow-bridge`.

## Build

```bash
cd apps/atlas-flow-extension
npm install
npm run build
```

Carregar `apps/atlas-flow-extension/dist` em `chrome://extensions` (modo desenvolvedor).

## Estado atual (Fase 02)

- Service worker com boot + installationId local
- Popup de status (não pareada)
- Sem adapter Flow, sem seletores, sem debugger
- Integração real: **NÃO VALIDADA**
