import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(root, '..')

const child = spawn('npx', ['electron', '.'], {
  cwd: projectRoot,
  env: { ...process.env, ATLAS_E2E: '1' },
  stdio: 'inherit',
  shell: true,
  windowsHide: false,
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
