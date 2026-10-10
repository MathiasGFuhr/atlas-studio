import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'src/renderer/assets/brand/logo-mark-square.png')
const outPng = path.join(root, 'build/icon.png')
const outIco = path.join(root, 'build/icon.ico')

fs.copyFileSync(src, outPng)
console.log('icon.png', fs.statSync(outPng).size)

const require = createRequire(import.meta.url)
let pngToIco
try {
  pngToIco = (await import('png-to-ico')).default
} catch {
  const packed = path.join(root, 'png-to-ico-3.0.2.tgz')
  if (fs.existsSync(packed)) {
    // fallback: use system Drawing via skipping — try require from npx cache later
  }
  pngToIco = require('png-to-ico')
}

const buf = await pngToIco(src)
fs.writeFileSync(outIco, buf)
console.log('icon.ico', buf.length)
