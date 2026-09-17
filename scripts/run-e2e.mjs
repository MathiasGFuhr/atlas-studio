import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(root, '..')

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
      shell: true,
      windowsHide: false,
    })
    child.on('exit', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 1}`))
    })
    child.on('error', reject)
  })
}

await run('npm', ['run', 'build'])
await run('node', [path.join(root, 'build-e2e-main.mjs')])

const electron = spawn('npx', ['electron', 'dist-electron/e2e-main.js'], {
  cwd: projectRoot,
  env: { ...process.env, ATLAS_E2E: '1' },
  stdio: 'inherit',
  shell: true,
  windowsHide: false,
})

electron.on('exit', (code) => {
  process.exit(code ?? 1)
})
