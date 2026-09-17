import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function stripE2eArtifactsPlugin(): Plugin {
  return {
    name: 'strip-atlas-e2e-artifacts',
    apply: 'build',
    closeBundle() {
      const dir = path.resolve('dist-electron')
      if (!fs.existsSync(dir)) return
      const keep = new Set(['main.js', 'preload.js', 'preload.cjs', 'splash'])
      for (const name of fs.readdirSync(dir)) {
        if (keep.has(name)) continue
        fs.rmSync(path.join(dir, name), { force: true, recursive: true })
      }
    },
  }
}

function copySplashPlugin(): Plugin {
  return {
    name: 'copy-atlas-splash',
    closeBundle() {
      const src = path.resolve('src/splash')
      const dest = path.resolve('dist-electron/splash')
      if (!fs.existsSync(src)) return
      fs.mkdirSync(dest, { recursive: true })
      fs.cpSync(src, dest, { recursive: true })
    },
  }
}

export default defineConfig({
  // Relativo obrigatório para loadFile() no Electron empacotado
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'src/main/index.ts',
        vite: {
          plugins: [stripE2eArtifactsPlugin(), copySplashPlugin()],
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'electron-updater', 'sql.js', 'ffmpeg-static'],
              output: {
                entryFileNames: 'main.js',
                format: 'es',
              },
            },
          },
        },
      },
      preload: {
        input: 'src/preload/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                // .cjs obrigatório: package.json tem "type": "module"
                entryFileNames: 'preload.cjs',
                format: 'cjs',
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url)), 'src/renderer'),
      '@shared': path.resolve(import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url)), 'src/shared'),
      '@mocks': path.resolve(import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url)), 'mocks'),
    },
  },
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    // Não abrir o navegador — o Atlas Studio real é a janela Electron.
    open: false,
  },
})
