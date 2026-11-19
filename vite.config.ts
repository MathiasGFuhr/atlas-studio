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
      // Só remove artefatos e2e. Não apagar chunks do main (index-*.js, etc.)
      // — main.js importa esses arquivos e o Electron falha sem eles.
      for (const name of fs.readdirSync(dir)) {
        const isE2e = name.startsWith('e2e-main')
        if (!isE2e) continue
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

/** Em serve, o Vite injeta script inline (@react-refresh). CSP script-src 'self' deixa a janela preta. */
function relaxCspForViteDevPlugin(): Plugin {
  return {
    name: 'atlas-relax-csp-vite-dev',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        /script-src 'self'/g,
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      )
    },
  }
}

export default defineConfig(({ command }) => ({
  // Em serve, '/' evita VITE_DEV_SERVER_URL inválida (…5173./) do vite-plugin-electron.
  // No build, './' continua obrigatório para loadFile() no Electron empacotado.
  base: command === 'serve' ? '/' : './',
  plugins: [
    react(),
    tailwindcss(),
    relaxCspForViteDevPlugin(),
    electron({
      main: {
        entry: 'src/main/index.ts',
        vite: {
          plugins: [stripE2eArtifactsPlugin(), copySplashPlugin()],
          build: {
            outDir: 'dist-electron',
            emptyOutDir: false,
            rollupOptions: {
              external: ['electron', 'electron-updater', 'sql.js', 'ffmpeg-static'],
              // Array de propósito: no modo lib o Vite descarta output.format
              // quando output é um objeto e usa lib.formats ("es", porque
              // package.json tem "type": "module"). O entry precisa ser .js.
              output: [
                {
                  entryFileNames: 'main.js',
                  format: 'es',
                },
              ],
            },
          },
        },
      },
      preload: {
        input: 'src/preload/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            emptyOutDir: false,
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
  optimizeDeps: {
    // Evita varrer '**/*.html' nas dezenas de pastas release-* na raiz durante o boot do dev server.
    entries: ['index.html'],
  },
  build: {
    outDir: 'dist',
    // Electron 37 = Chromium 138: sem transpilar sintaxe moderna → bundle menor e mais rápido de parsear.
    target: 'chrome130',
    reportCompressedSize: false,
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    // Não abrir o navegador — o Atlas Studio real é a janela Electron.
    open: false,
    watch: {
      // Evita EBUSY e varredura pesada em pastas de build/artefatos fora do renderer.
      ignored: [
        '**/release',
        '**/release/**',
        '**/release-*',
        '**/release-*/**',
        '**/dist-electron',
        '**/dist-electron/**',
        '**/docs',
        '**/docs/**',
        '**/resources',
        '**/resources/**',
        '**/workspace',
        '**/workspace/**',
        '**/extensions',
        '**/extensions/**',
        '**/apps',
        '**/apps/**',
      ],
    },
  },
}))
