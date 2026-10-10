import { app } from 'electron'
import { bootAtlasApp } from './boot'
import { registerAtlasMediaScheme } from './services/media/atlasMediaProtocol'

/**
 * Entrypoint exclusivo de `npm run test:e2e`.
 * O fluxo antigo de geração de roteiro foi removido — o boot valida o app.
 */
registerAtlasMediaScheme()

if (app.isPackaged) {
  app.setName('Atlas Studio')
}

app.whenReady().then(async () => {
  try {
    await bootAtlasApp()
    console.log('[atlas-e2e]', JSON.stringify({ ok: true, mode: 'boot-only' }, null, 2))
    app.exit(0)
  } catch (error) {
    console.error('[atlas-e2e] failed', error)
    app.exit(1)
  }
})
