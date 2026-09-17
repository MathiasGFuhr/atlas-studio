import { app } from 'electron'
import { bootAtlasApp } from './boot'
import { runRealFlowTest } from './services/e2e/runRealFlowTest'
import { registerAtlasMediaScheme } from './services/media/atlasMediaProtocol'

/**
 * Entrypoint exclusivo de `npm run test:e2e`.
 * Não é importado pelo main de produção e não entra no instalador.
 */
registerAtlasMediaScheme()

if (app.isPackaged) {
  app.setName('Atlas Studio')
}

app.whenReady().then(async () => {
  try {
    const { codexService } = await bootAtlasApp()
    const result = await runRealFlowTest(codexService)
    console.log('[atlas-e2e]', JSON.stringify(result, null, 2))
    app.exit(result.ok ? 0 : 1)
  } catch (error) {
    console.error('[atlas-e2e] failed', error)
    app.exit(1)
  }
})
