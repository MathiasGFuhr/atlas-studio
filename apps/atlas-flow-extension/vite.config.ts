import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(rootDir, 'dist')

export default defineConfig({
  root: rootDir,
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: path.resolve(rootDir, 'src/background/serviceWorker.ts'),
        popup: path.resolve(rootDir, 'src/ui/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  plugins: [
    {
      name: 'copy-extension-static',
      async closeBundle() {
        mkdirSync(outDir, { recursive: true })
        const contractUrl = pathToFileURL(
          path.resolve(rootDir, 'src/versionContract.mjs'),
        ).href
        const contract = await import(`${contractUrl}?t=${Date.now()}`)
        const snapshot = contract.versionContractSnapshot()

        const manifestPath = path.resolve(rootDir, 'src/manifest.json')
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        if (manifest.version !== contract.PACKAGE_VERSION) {
          throw new Error(
            `versionContract.PACKAGE_VERSION (${contract.PACKAGE_VERSION}) ≠ manifest.version (${manifest.version})`,
          )
        }

        copyFileSync(manifestPath, path.resolve(outDir, 'manifest.json'))
        copyFileSync(
          path.resolve(rootDir, 'src/ui/popup.html'),
          path.resolve(outDir, 'popup.html'),
        )
        copyFileSync(
          path.resolve(rootDir, 'src/icon.png'),
          path.resolve(outDir, 'icon.png'),
        )

        // Content script: carimba SENSOR_VERSION do contrato (evita constante divergente).
        let sensorSource = readFileSync(
          path.resolve(rootDir, 'src/content/pageSensor.js'),
          'utf8',
        )
        const stamped = sensorSource.replace(
          /const SENSOR_VERSION = '[^']*'/,
          `const SENSOR_VERSION = '${contract.SENSOR_VERSION}'`,
        )
        if (stamped === sensorSource && !sensorSource.includes(`'${contract.SENSOR_VERSION}'`)) {
          throw new Error('Falha ao carimbar SENSOR_VERSION em pageSensor.js')
        }
        // Garante que o source local também esteja alinhado ao contrato.
        if (!sensorSource.includes(`const SENSOR_VERSION = '${contract.SENSOR_VERSION}'`)) {
          writeFileSync(path.resolve(rootDir, 'src/content/pageSensor.js'), stamped)
          sensorSource = stamped
        }
        writeFileSync(path.resolve(outDir, 'content.js'), stamped)

        writeFileSync(
          path.resolve(outDir, 'version-contract.json'),
          `${JSON.stringify(snapshot, null, 2)}\n`,
        )
      },
    },
  ],
})
