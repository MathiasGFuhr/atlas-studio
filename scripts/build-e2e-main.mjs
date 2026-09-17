import { build } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

await build({
  configFile: false,
  root: projectRoot,
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: path.join(projectRoot, 'dist-electron'),
    ssr: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      input: path.join(projectRoot, 'src/main/e2eMain.ts'),
      external: ['electron', 'electron-updater', 'sql.js', 'ffmpeg-static'],
      output: {
        entryFileNames: 'e2e-main.js',
        format: 'es',
        inlineDynamicImports: true,
      },
    },
  },
})
