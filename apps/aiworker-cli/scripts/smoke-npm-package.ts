import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

interface PackFile {
  path: string
}

interface PackResult {
  files: PackFile[]
  name: string
  version: string
}

const packageRoot = path.resolve(import.meta.dirname, '..')
const distDir = path.join(packageRoot, 'dist')
const sourcePackage = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as { name: string, version: string }
const distPackage = JSON.parse(readFileSync(path.join(distDir, 'package.json'), 'utf8')) as { files?: string[], name: string, optionalDependencies?: Record<string, string>, version: string }

if (!existsSync(path.join(distDir, 'aiworker.js')))
  throw new Error('dist/aiworker.js missing; run build first')
if (!existsSync(path.join(distDir, 'web/server.js')))
  throw new Error('dist/web/server.js missing; run build first')
if (!existsSync(path.join(distDir, 'web/static/index.html')))
  throw new Error('dist/web/static/index.html missing; run build first')
if (distPackage.name !== sourcePackage.name || distPackage.version !== sourcePackage.version)
  throw new Error(`dist package identity drift: source=${sourcePackage.name}@${sourcePackage.version} dist=${distPackage.name}@${distPackage.version}`)
if (JSON.stringify(distPackage.files) !== JSON.stringify(['aiworker.js', 'README.md', 'web/**']))
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
for (const required of ['package.json', 'README.md', 'aiworker.js', 'web/server.js', 'web/static/index.html']) {
  if (!paths.includes(required))
    throw new Error(`npm package missing ${required}; files=${paths.join(', ')}`)
}
const readme = readFileSync(path.join(distDir, 'README.md'), 'utf8')
for (const required of ['aiworker plan --help', 'aiworker apply --help', 'aiworker web --help', 'aiworker doctor --help']) {
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
for (const required of ['plan', 'apply', 'web', 'doctor']) {
  if (!helpText.includes(required))
    throw new Error(`dist aiworker --help missing command ${required}`)
}
for (const forbidden of ['describe', 'plan-provision']) {
  if (helpText.includes(forbidden))
    throw new Error(`dist aiworker --help still exposes retired command ${forbidden}`)
}
for (const forbidden of [/^web\/src\//, /^web\/.*\/src\//, /worker-(?:cli|web|daemon|runtime)/i, /workbench/i, /engine-bridge/i, /engine-projection/i, /storage-sqlite/i]) {
  const offender = paths.find(file => forbidden.test(file))
  if (offender)
    throw new Error(`npm package contains retired artifact ${offender}`)
}
const tempRoot = mkdtempSync(path.join(tmpdir(), 'aiworker-dist-smoke-'))
try {
  const packDestination = path.join(tempRoot, 'pack')
  const appRoot = path.join(tempRoot, 'app')
  const packFile = packPackage(packDestination)
  installPackage(appRoot, packFile)
  await smokeInstalledWeb(appRoot)
}
finally {
  rmSync(tempRoot, { force: true, recursive: true })
}
console.log(`aiworker dist smoke ok: ${sourcePackage.name}@${sourcePackage.version} files=${paths.join(',')}`)

function packPackage(packDestination: string): string {
  ensureDir(packDestination)
  const pack = Bun.spawnSync(['npm', 'pack', '--json', '--pack-destination', packDestination], {
    cwd: distDir,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  if (pack.exitCode !== 0)
    throw new Error(`npm pack failed: ${pack.stderr.toString()}`)
  const [result] = JSON.parse(pack.stdout.toString()) as Array<PackResult & { filename: string }>
  if (!result?.filename)
    throw new Error('npm pack produced no tarball')
  return path.join(packDestination, result.filename)
}

function installPackage(appRoot: string, packFile: string): void {
  const init = Bun.spawnSync(['npm', 'init', '-y'], {
    cwd: ensureDir(appRoot),
    stderr: 'pipe',
    stdout: 'pipe',
  })
  if (init.exitCode !== 0)
    throw new Error(`npm init failed: ${init.stderr.toString()}`)

  const install = Bun.spawnSync(['npm', 'install', '--ignore-scripts', '--omit=optional', packFile], {
    cwd: appRoot,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  if (install.exitCode !== 0)
    throw new Error(`npm install packed aiworker failed: ${install.stderr.toString()}`)
}

function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true })
  return dir
}

async function smokeInstalledWeb(appRoot: string): Promise<void> {
  const port = '20992'
  const bin = path.join(appRoot, 'node_modules/.bin/aiworker')
  const child = Bun.spawn([bin, 'web', '--browser', 'none', '--port', port], {
    cwd: appRoot,
    detached: true,
    env: {
      ...process.env,
      AIWORKER_WEB_ADMIN_TOKEN: 'dist-smoke-token',
    },
    stderr: 'ignore',
    stdin: 'ignore',
    stdout: 'ignore',
  })
  try {
    await waitForHealthyWeb(Number(port), child)
  }
  finally {
    await stopSpawnedWeb(child)
  }
}

async function waitForHealthyWeb(port: number, child: ReturnType<typeof Bun.spawn>): Promise<void> {
  const deadline = Date.now() + 15000
  let exitCode: number | null = null
  child.exited.then((code) => {
    exitCode = code
  }).catch(() => {
    exitCode = 1
  })
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`)
      if (response.ok)
        return
    }
    catch {
      // server may still be starting
    }
    if (exitCode !== null)
      throw new Error(`installed aiworker web exited before health check (code ${exitCode})`)
    await Bun.sleep(250)
  }
  throw new Error(`installed aiworker web did not become healthy on port ${port}`)
}

async function stopSpawnedWeb(child: ReturnType<typeof Bun.spawn>): Promise<void> {
  try {
    process.kill(-child.pid, 'SIGTERM')
  }
  catch {
    child.kill()
  }

  const exited = await Promise.race([
    child.exited.then(() => true).catch(() => true),
    Bun.sleep(2000).then(() => false),
  ])
  if (exited)
    return

  try {
    process.kill(-child.pid, 'SIGKILL')
  }
  catch {
    child.kill('SIGKILL')
  }
  await child.exited.catch(() => {})
}
