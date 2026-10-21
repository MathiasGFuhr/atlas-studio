import fs from 'node:fs'
import crypto from 'node:crypto'

const version = process.argv[2]
const dir = process.argv[3] || `release-${version}`
if (!version) {
  console.error('Usage: node scripts/write-latest-yml-dir.mjs <version> [dir]')
  process.exit(1)
}

const fileName = `AtlasStudio-Setup-${version}.exe`
const filePath = `${dir}/${fileName}`
const buf = fs.readFileSync(filePath)
const sha512 = crypto.createHash('sha512').update(buf).digest('base64')
const size = buf.length
const yml = [
  `version: ${version}`,
  'files:',
  `  - url: ${fileName}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${fileName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  '',
].join('\n')

fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(`${dir}/latest.yml`, yml)
console.log(yml)
