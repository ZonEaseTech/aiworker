import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

interface PackFile {
  path: string
}

interface PackResult {
  files: PackFile[]
  name: string
  version: string
}

const distDir = path.resolve('dist')
const sourcePackage = JSON.parse(readFileSync('package.json', 'utf8')) as { name: string, version: string }
const distPackage = JSON.parse(readFileSync(path.join(distDir, 'package.json'), 'utf8')) as { files?: string[], name: string, optionalDependencies?: Record<string, string>, version: string }

if (!existsSync(path.join(distDir, 'aiworker.js')))
  throw new Error('dist/aiworker.js missing; run build first')
if (distPackage.name !== sourcePackage.name || distPackage.version !== sourcePackage.version)
  throw new Error(`dist package identity drift: source=${sourcePackage.name}@${sourcePackage.version} dist=${distPackage.name}@${distPackage.version}`)
if (JSON.stringify(distPackage.files) !== JSON.stringify(['aiworker.js', 'README.md']))
  throw new Error(`dist package files must stay whitelisted; got ${JSON.stringify(distPackage.files)}`)
if (distPackage.optionalDependencies?.['aissh-cli'] !== 'github:tubnt/aissh-cli#v0.8.0')
  throw new Error(`dist package must keep pinned optional aissh-cli; got ${JSON.stringify(distPackage.optionalDependencies)}`)

const pack = Bun.spawnSync(['npm', 'pack', '--dry-run', '--json'], {
  cwd: distDir,
  stderr: 'pipe',
  stdout: 'pipe',
})
if (pack.exitCode !== 0)
  throw new Error(`npm pack dry-run failed: ${pack.stderr.toString()}`)

const [result] = JSON.parse(pack.stdout.toString()) as PackResult[]
if (!result)
  throw new Error('npm pack dry-run produced no package result')
if (result.name !== sourcePackage.name || result.version !== sourcePackage.version)
  throw new Error(`npm pack identity drift: ${result.name}@${result.version}`)

const paths = result.files.map(file => file.path).sort()
for (const required of ['package.json', 'README.md', 'aiworker.js']) {
  if (!paths.includes(required))
    throw new Error(`npm package missing ${required}; files=${paths.join(', ')}`)
}
const readme = readFileSync(path.join(distDir, 'README.md'), 'utf8')
for (const required of ['aiworker plan --help', 'aiworker apply --help', 'aiworker doctor --help']) {
  if (!readme.includes(required))
    throw new Error(`dist README missing CLI command ${required}`)
}
for (const forbidden of ['aiworker describe', 'plan-provision', 'provision --dry-run']) {
  if (readme.includes(forbidden))
    throw new Error(`dist README still documents retired CLI command ${forbidden}`)
}
const help = Bun.spawnSync(['bun', path.join(distDir, 'aiworker.js'), '--help'], {
  stderr: 'pipe',
  stdout: 'pipe',
})
if (help.exitCode !== 0)
  throw new Error(`dist aiworker --help failed: ${help.stderr.toString()}`)
const helpText = help.stdout.toString()
for (const required of ['plan', 'apply', 'doctor']) {
  if (!helpText.includes(required))
    throw new Error(`dist aiworker --help missing command ${required}`)
}
for (const forbidden of ['describe', 'plan-provision']) {
  if (helpText.includes(forbidden))
    throw new Error(`dist aiworker --help still exposes retired command ${forbidden}`)
}
for (const forbidden of [/^web\//, /worker-(?:cli|web|daemon|runtime)/i, /workbench/i, /engine-bridge/i, /engine-projection/i, /storage-sqlite/i]) {
  const offender = paths.find(file => forbidden.test(file))
  if (offender)
    throw new Error(`npm package contains retired artifact ${offender}`)
}
console.log(`aiworker dist smoke ok: ${sourcePackage.name}@${sourcePackage.version} files=${paths.join(',')}`)
