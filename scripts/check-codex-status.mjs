import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const child = spawn('npx', ['electron', '.'], {
  cwd: root,
  env: { ...process.env, ATLAS_STATUS_CHECK: '1' },
  stdio: 'inherit',
  shell: true,
  windowsHide: false,
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
