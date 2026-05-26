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

interface SoulAppMountedActionResponse {
  message?: string
  ok?: boolean
}

async function main(): Promise<number> {
  const cli = resolve(import.meta.dirname, '..', 'dist', 'aiworker.js')
  if (!existsSync(cli))
    throw new Error(`Dist CLI not found: ${cli}. Run bun run build:bundle first.`)
  const expectedVersion = readDistPackageVersion()

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

    const apps = await getJson<{ apps: Array<{ appId: string, status: string }> }>(`http://127.0.0.1:${port}/api/local/apps`)
    assertCatalogApps(apps.apps)

    await assertCli(cli, ['app', 'bootstrap', 'official'], { env, label: 'app bootstrap official' })
    const list = await assertCli(cli, ['app', 'list'], { env, label: 'app list' })
    const souls = await assertCli(cli, ['soul', 'list'], { env, label: 'soul list' })
    const templates = await assertCli(cli, ['template', 'list', '--soul', 'aiworker-hr'], { env, label: 'template list' })
    assertJsonIncludes(list.stdout, 'aiworker-hr')
    assertJsonIncludes(souls.stdout, 'aiworker-qa')
    assertJsonIncludes(templates.stdout, 'aiworker-hr.person-profile')
    await assertMountedAppAction(port, 'aiworker-hr', '/api/people-profiles', 'People profile draft opened by HR app.')
    await assertMountedAppAction(port, 'aiworker-qa', '/api/release-gates', 'Release gate draft opened by QA app.')

    consola.success('[smoke-dist-release] PASS: dist CLI starts Host Web/API, bootstraps official Soul Apps, and reaches app-owned mounted APIs')
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
  const info = await getJson<{ runtimeVersion: string }>(`http://127.0.0.1:${port}/api/local/info`)
  if (info.runtimeVersion !== expectedVersion)
    throw new Error(`Expected daemon runtimeVersion ${expectedVersion}, got ${info.runtimeVersion}`)
}

function assertCatalogApps(apps: Array<{ appId: string, status: string }>): void {
  for (const appId of ['aiworker-hr', 'aiworker-qa', 'aiworker-custom']) {
    const app = apps.find(item => item.appId === appId)
    if (!app)
      throw new Error(`Catalog is missing ${appId}: ${JSON.stringify(apps)}`)
    if (app.status !== 'enabled')
      throw new Error(`${appId} should be enabled, got ${app.status}`)
  }
}

async function assertMountedAppAction(port: number, appId: string, appPath: string, expectedMessage: string): Promise<void> {
  const url = `http://127.0.0.1:${port}/api/local/apps/${appId}${appPath}`
  const res = await fetch(url, {
    body: JSON.stringify({ input: { source: 'smoke-dist-release' } }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  const bodyText = await res.text()
  if (!res.ok)
    throw new Error(`Mounted app action failed: POST ${url} -> ${res.status} ${bodyText.slice(0, 500)}`)

  let body: SoulAppMountedActionResponse
  try {
    body = JSON.parse(bodyText) as SoulAppMountedActionResponse
  }
  catch {
    throw new Error(`Mounted app action returned non-JSON: POST ${url} -> ${bodyText.slice(0, 500)}`)
  }

  if (body.ok !== true || body.message !== expectedMessage)
    throw new Error(`Mounted app action returned unexpected body for ${appId}${appPath}: ${bodyText.slice(0, 500)}`)
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
