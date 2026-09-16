import fs from 'node:fs'
import path from 'node:path'

const target = path.join(
  process.cwd(),
  'node_modules',
  'vite-plugin-electron',
  'dist',
  'index.mjs',
)

if (!fs.existsSync(target)) {
  process.exit(0)
}

const source = fs.readFileSync(target, 'utf8')
const needle = `function treeKillSync(pid) {
  if (process.platform === "win32") {
    cp.execSync(\`taskkill /pid \${pid} /T /F\`);
  } else {
    killTree(pidTree({ pid, ppid: process.pid }));
  }
}`

const replacement = `function treeKillSync(pid) {
  if (process.platform === "win32") {
    try {
      cp.execSync(\`taskkill /pid \${pid} /T /F\`, { stdio: "ignore" });
    } catch {
      // Process may already have exited (common on Windows restarts).
    }
  } else {
    killTree(pidTree({ pid, ppid: process.pid }));
  }
}`

if (source.includes('Process may already have exited')) {
  process.exit(0)
}

if (!source.includes(needle)) {
  console.warn('[patch-electron-plugin] pattern not found — skip')
  process.exit(0)
}

fs.writeFileSync(target, source.replace(needle, replacement), 'utf8')
console.log('[patch-electron-plugin] applied Windows treeKillSync fix')
