#!/usr/bin/env bun
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'

interface NpmPackEntry {
  filename?: string
}

interface HostOptionsResponse {
  access?: { mode?: string }
  auth?: { mode?: string }
  provisioningTargets?: unknown
  soulReleases?: unknown
}

const cliDistDir = resolve(import.meta.dirname, '..', 'dist')
const requiredPackageFiles = [
  'package/aiworker-host.js',
  'package/aiworker-host-bun.js',
  'package/package.json',
  'package/README.md',
  'package/web/host/index.html',
]
// Host bundle 必须脱离 Worker：发布物绝不能含 worker-web 静态、official-apps、worker drizzle。
const forbiddenPackagePathSegments = [
  'package/web/worker',
  'package/official-apps',
  'package/drizzle',
]

async function main(): Promise<number> {
  const tempDir = await mkdtemp(join(tmpdir(), 'aiworker-host-npm-package-'))
  try {
    await assertDistPackageMetadata()
    const archivePath = await packDist(tempDir)
    const files = await listTarball(archivePath)
    for (const file of requiredPackageFiles) {
      if (!files.includes(file))
        throw new Error(`Host npm package is missing ${file}`)
    }
    for (const file of files) {
      if (file.includes('/node_modules/') || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
        throw new Error(`Host npm package includes non-release file: ${file}`)
      for (const forbidden of forbiddenPackagePathSegments) {
        if (file === forbidden || file.startsWith(`${forbidden}/`))
          throw new Error(`Host npm package leaked Worker/Soul asset: ${file}`)
      }
    }
    await assertInstalledHostRuntime(tempDir, archivePath)
    process.stdout.write('[smoke-host-npm-package] PASS: Host npm package installs, serves Host Web (/host) and the Host options API (/api/host/options) with bundled assets\n')
    return 0
  }
  finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function assertDistPackageMetadata(): Promise<void> {
  const pkg = JSON.parse(await readFile(resolve(cliDistDir, 'package.json'), 'utf8')) as {
    bin?: Record<string, unknown>
    files?: unknown
    private?: unknown
    publishConfig?: { access?: unknown }
    repository?: { type?: unknown, url?: unknown }
    scripts?: unknown
  }
  if (pkg.private)
    throw new Error('Host dist package.json must not be private')
  if (pkg.scripts)
    throw new Error('Host dist package.json must not carry scripts (avoids prepublishOnly re-running from dist)')
  if (pkg.repository?.type !== 'git' || typeof pkg.repository.url !== 'string' || !pkg.repository.url.startsWith('git+https://'))
    throw new Error('Host dist package.json must expose a public git repository for npm provenance')
  if (pkg.publishConfig?.access !== 'public')
    throw new Error('Host dist package.json must set publishConfig.access to public')
  if (pkg.bin?.['aiworker-host'] !== 'aiworker-host.js')
    throw new Error('Host dist package.json must expose bin.aiworker-host as aiworker-host.js')
  const files = Array.isArray(pkg.files) ? pkg.files : []
  for (const expected of ['aiworker-host.js', 'aiworker-host-bun.js', 'web/']) {
    if (!files.includes(expected))
      throw new Error(`Host dist package.json files must include ${expected}`)
  }
  for (const forbidden of ['drizzle/', 'official-apps/']) {
    if (files.includes(forbidden))
      throw new Error(`Host dist package.json files must not include Worker/Soul resource ${forbidden}`)
  }
}

async function packDist(tempDir: string): Promise<string> {
  const output = await run(['npm', 'pack', '--json', '--pack-destination', tempDir], { cwd: cliDistDir })
  const entries = JSON.parse(output.stdout) as NpmPackEntry[]
  const filename = entries[0]?.filename
  if (!filename)
    throw new Error(`npm pack did not return a package filename: ${output.stdout}`)
  return resolve(tempDir, basename(filename))
}

async function listTarball(archivePath: string): Promise<string[]> {
  const output = await run(['tar', '-tzf', archivePath], { cwd: process.cwd() })
  return output.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

async function assertInstalledHostRuntime(tempDir: string, archivePath: string): Promise<void> {
  const installRoot = resolve(tempDir, 'install-root')
  await mkdir(installRoot, { recursive: true })
  await run(['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', archivePath], { cwd: installRoot })
  const bin = resolve(installRoot, 'node_modules/.bin/aiworker-host')
  const dbPath = resolve(tempDir, 'host.db')
  const manifestPath = resolve(tempDir, 'dev-host.json')
  const port = await reservePort()

  // 清空根 .env 注入的 AIWORKER_HOST_* / LOGTO_* dev profile，强制 dev-admin 静态壳：
  // 否则继承的 Logto session env 会装配 sessionAuth → /host 重定向真 Logto → 探测失败。
  const env = cleanHostEnv()

  const help = await run([bin, '--help'], { cwd: installRoot, env })
  if (!help.stdout.includes('aiworker-host') || !help.stdout.includes('daemon foreground'))
    throw new Error(`Host CLI --help must describe aiworker-host commands: ${help.stdout}`)

  // 不传 --web-static-dir：bundle 必须自解析 dist/web/host（零配置产品路径就是被测对象）。
  const daemon = spawn([
    bin,
    'daemon',
    'foreground',
    '--db',
    dbPath,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--public-base-url',
    `http://127.0.0.1:${port}`,
    '--manifest',
    manifestPath,
    '--dev-admin-email',
    'admin@example.com',
  ], {
    cwd: installRoot,
    env,
    stderr: 'pipe',
    stdout: 'pipe',
  })

  try {
    await waitForReachable(`http://127.0.0.1:${port}/host`, daemon)
    const html = await assertHttpText(`http://127.0.0.1:${port}/host`, /<!doctype html>/i)
    await assertHostWebAsset(port, html)
    await assertHostOptions(port)
  }
  finally {
    daemon.kill()
    await Promise.race([
      daemon.exited.catch(() => undefined),
      new Promise(resolve => setTimeout(resolve, 2_000)),
    ])
    const stdout = await new Response(daemon.stdout).text().catch(() => '')
    const stderr = await new Response(daemon.stderr).text().catch(() => '')
    if (stdout.trim())
      process.stdout.write(`[smoke-host-npm-package] daemon stdout:\n${stdout}\n`)
    if (stderr.trim())
      process.stdout.write(`[smoke-host-npm-package] daemon stderr:\n${stderr}\n`)
  }
}

function cleanHostEnv(): Record<string, string> {
  const prefixes = ['AIWORKER_HOST_', 'LOGTO_']
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined)
      continue
    env[key] = prefixes.some(prefix => key.startsWith(prefix)) ? '' : value
  }
  return env
}

async function assertHostWebAsset(port: number, html: string): Promise<void> {
  const match = html.match(/["']\/?(assets\/[^"']+\.(?:js|css))["']/)
  if (!match?.[1])
    throw new Error(`Host Web HTML does not reference a built asset:\n${html.slice(0, 400)}`)
  const assetUrl = `http://127.0.0.1:${port}/${match[1]}`
  const res = await fetch(assetUrl)
  if (!res.ok)
    throw new Error(`Host Web asset failed: ${assetUrl} -> ${res.status} ${await res.text()}`)
}

async function assertHostOptions(port: number): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${port}/api/host/options`)
  if (!res.ok)
    throw new Error(`GET /api/host/options failed: ${res.status} ${await res.text()}`)
  const body = await res.json() as HostOptionsResponse
  if (!body.access || typeof body.access.mode !== 'string')
    throw new Error(`/api/host/options must report access.mode: ${JSON.stringify(body)}`)
  if (!body.auth || typeof body.auth.mode !== 'string')
    throw new Error(`/api/host/options must report auth.mode: ${JSON.stringify(body)}`)
  if (!Array.isArray(body.provisioningTargets))
    throw new Error(`/api/host/options must report provisioningTargets array: ${JSON.stringify(body)}`)
  if (!Array.isArray(body.soulReleases))
    throw new Error(`/api/host/options must report soulReleases array: ${JSON.stringify(body)}`)
}

async function assertHttpText(url: string, expected: RegExp | string): Promise<string> {
  const res = await fetch(url)
  const body = await res.text()
  const matches = typeof expected === 'string' ? body.includes(expected) : expected.test(body)
  if (!res.ok || !matches)
    throw new Error(`Expected ${url} to include ${expected}; got ${res.status}: ${body.slice(0, 200)}`)
  return body
}

async function reservePort(): Promise<number> {
  const server = Bun.serve({ fetch: () => new Response('ok'), hostname: '127.0.0.1', port: 0 })
  const port = server.port
  server.stop()
  return port
}

async function waitForReachable(url: string, daemon: ReturnType<typeof spawn>): Promise<void> {
  let lastError = 'not reachable'
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (daemon.exitCode !== null) {
      const stderr = await new Response(daemon.stderr).text().catch(() => '')
      throw new Error(`Host daemon exited before becoming reachable (code ${daemon.exitCode}): ${stderr}`)
    }
    try {
      const res = await fetch(url, { redirect: 'manual' })
      if (res.status >= 200 && res.status < 400)
        return
      lastError = `${res.status}`
    }
    catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Host daemon did not become reachable at ${url}: ${lastError}`)
}

async function run(cmd: string[], options: { cwd: string, env?: Record<string, string | undefined> }): Promise<{ stderr: string, stdout: string }> {
  const proc = spawn(cmd, {
    cwd: options.cwd,
    ...(options.env ? { env: options.env } : {}),
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0)
    throw new Error(`${cmd.join(' ')} failed with ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`)
  return { stderr, stdout }
}

if (import.meta.main) {
  main()
    .then(code => process.exit(code))
    .catch((err) => {
      process.stderr.write(`[smoke-host-npm-package] FAIL: ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    })
}
