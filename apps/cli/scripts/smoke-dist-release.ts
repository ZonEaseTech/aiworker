#!/usr/bin/env bun
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'
import consola from 'consola'

interface CommandResult {
  code: number
  stderr: string
  stdout: string
}

interface DoctorOutput {
  installation?: {
    resources?: {
      migrationsReady?: boolean
      officialAppsReady?: boolean
      workerWebReady?: boolean
    }
  }
}

async function main(): Promise<number> {
  const cli = resolve(import.meta.dirname, '..', 'dist', 'aiworker.js')
  if (!existsSync(cli))
    throw new Error(`Dist CLI not found: ${cli}. Run bun run build:bundle first.`)
  const expectedVersion = readDistPackageVersion()
  assertDistDescriptorV1()

  const root = mkdtempSync(join(tmpdir(), 'aiworker-dist-release-'))
  const home = join(root, 'home')
  const port = await reservePort()
  const env = {
    ...process.env,
    AIWORKER_HOME: home,
    AIWORKER_WORKER_HOST: '127.0.0.1',
    PORT: String(port),
    WORKER_DB_PATH: join(home, 'aiworker.db'),
  }
  let daemon: ReturnType<typeof spawn> | null = null

  try {
    daemon = spawn([cli, 'daemon', 'foreground', '--host', '127.0.0.1', '--port', String(port)], {
      env,
      stderr: 'pipe',
      stdout: 'pipe',
    })
    await waitForHealth(port)
    await assertDaemonRuntimeVersion(port, expectedVersion)
    const html = await assertHttpText(`http://127.0.0.1:${port}/`, /<!doctype html>/i)
    await assertWorkerWebAsset(port, html)
    const doctor = await assertCli(cli, ['doctor'], { env, label: 'doctor' })
    assertPackagedResourcesReady(doctor.stdout)

    const apps = await getJson<{ apps: Array<{ appId: string, status: string }> }>(`http://127.0.0.1:${port}/api/app-installation/apps`)
    assertCatalogApps(apps.apps)

    await assertCli(cli, ['app', 'bootstrap', 'official'], { env, label: 'app bootstrap official' })
    const list = await assertCli(cli, ['app', 'list'], { env, label: 'app list' })
    const souls = await assertCli(cli, ['soul', 'list'], { env, label: 'soul list' })
    const capabilities = await assertCli(cli, ['capability', 'list', '--soul', 'aiworker-freeform'], { env, label: 'capability list' })
    assertJsonIncludes(list.stdout, 'aiworker-freeform')
    assertJsonIncludes(souls.stdout, 'aiworker-freeform')
    assertJsonIncludes(capabilities.stdout, 'aiworker-freeform.default')
    await assertWorkbenchMountRequiresLocator(port)

    consola.success('[smoke-dist-release] PASS: dist CLI starts Host Web/API, reports packaged resources, and bootstraps the descriptor-only Freeform Soul')
    return 0
  }
  finally {
    if (daemon) {
      daemon.kill()
      await Promise.race([
        daemon.exited.catch(() => undefined),
        new Promise(resolve => setTimeout(resolve, 2_000)),
      ])
      const stdout = await new Response(daemon.stdout).text().catch(() => '')
      const stderr = await new Response(daemon.stderr).text().catch(() => '')
      if (stdout.trim())
        consola.info(`[smoke-dist-release] daemon stdout:\n${stdout}`)
      if (stderr.trim())
        consola.info(`[smoke-dist-release] daemon stderr:\n${stderr}`)
    }
    rmSync(root, { recursive: true, force: true })
  }
}

function readDistPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', 'dist', 'package.json'), 'utf8')) as { version?: unknown }
  if (typeof pkg.version !== 'string' || pkg.version.length === 0)
    throw new Error('dist package.json must include a version')
  return pkg.version
}

function assertDistDescriptorV1(): void {
  const descriptorPath = resolve(
    import.meta.dirname,
    '..',
    'dist',
    'official-apps',
    'aiworker-freeform',
    'dist',
    'soul.descriptor.json',
  )
  const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8')) as { protocol?: unknown }
  if (descriptor.protocol !== 'soul/v1')
    throw new Error(`dist Freeform descriptor must use protocol soul/v1: ${descriptorPath}`)
}

async function assertCli(cli: string, args: string[], options: { env: NodeJS.ProcessEnv, label: string }): Promise<CommandResult> {
  const result = await runCli(cli, args, options.env)
  if (result.code !== 0)
    throw new Error(`${options.label} failed with ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  return result
}

async function runCli(cli: string, args: string[], env: NodeJS.ProcessEnv): Promise<CommandResult> {
  const proc = spawn([cli, ...args], {
    env,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stderr, stdout }
}

async function reservePort(): Promise<number> {
  const server = Bun.serve({ fetch: () => new Response('ok'), hostname: '127.0.0.1', port: 0 })
  const port = server.port
  server.stop()
  return port
}

async function waitForHealth(port: number): Promise<void> {
  let lastError = ''
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok)
        return
      lastError = `${res.status} ${await res.text()}`
    }
    catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`daemon health did not become ready on port ${port}: ${lastError}`)
}

async function assertHttpText(url: string, expected: RegExp | string): Promise<string> {
  const res = await fetch(url)
  const body = await res.text()
  const matches = typeof expected === 'string' ? body.includes(expected) : expected.test(body)
  if (!res.ok || !matches)
    throw new Error(`Expected ${url} to include ${expected}; got ${res.status}: ${body.slice(0, 200)}`)
  return body
}

async function assertWorkerWebAsset(port: number, html: string): Promise<void> {
  const match = html.match(/["']\/?(assets\/[^"']+\.(?:js|css))["']/)
  if (!match?.[1])
    throw new Error(`Worker Web HTML does not reference a built asset:\n${html.slice(0, 400)}`)
  const assetUrl = `http://127.0.0.1:${port}/${match[1]}`
  const res = await fetch(assetUrl)
  if (!res.ok)
    throw new Error(`Worker Web asset failed: ${assetUrl} -> ${res.status} ${await res.text()}`)
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok)
    throw new Error(`GET ${url} failed: ${res.status} ${await res.text()}`)
  return await res.json() as T
}

async function assertDaemonRuntimeVersion(port: number, expectedVersion: string): Promise<void> {
  const info = await getJson<{ runtimeVersion: string }>(`http://127.0.0.1:${port}/api/info`)
  if (info.runtimeVersion !== expectedVersion)
    throw new Error(`Expected daemon runtimeVersion ${expectedVersion}, got ${info.runtimeVersion}`)
}

function assertCatalogApps(apps: Array<{ appId: string, status: string }>): void {
  const app = apps.find(item => item.appId === 'aiworker-freeform')
  if (!app)
    throw new Error(`Catalog is missing aiworker-freeform: ${JSON.stringify(apps)}`)
  if (app.status !== 'enabled')
    throw new Error(`aiworker-freeform should be enabled, got ${app.status}`)
}

function assertPackagedResourcesReady(stdout: string): void {
  const body = JSON.parse(stdout) as DoctorOutput
  const resources = body.installation?.resources
  if (resources?.officialAppsReady !== true)
    throw new Error(`dist doctor must report packaged official apps ready: ${stdout}`)
  if (resources?.workerWebReady !== true)
    throw new Error(`dist doctor must report packaged Worker Web ready: ${stdout}`)
  if (resources?.migrationsReady !== true)
    throw new Error(`dist doctor must report packaged migrations ready: ${stdout}`)
}

async function assertWorkbenchMountRequiresLocator(port: number): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${port}/api/mount/workbench`)
  const body = await res.text()
  if (res.status !== 400 || !body.includes('MOUNT_CONTEXT_INVALID'))
    throw new Error(`Workbench mount should require locator context, got ${res.status}: ${body.slice(0, 500)}`)
}

function assertJsonIncludes(stdout: string, expected: string): void {
  if (!stdout.includes(expected))
    throw new Error(`Expected CLI output to include ${expected}:\n${stdout}`)
}

main()
  .then(code => process.exit(code))
  .catch((err) => {
    consola.error(`[smoke-dist-release] FAIL: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
