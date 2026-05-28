#!/usr/bin/env bun
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'
import consola from 'consola'

import { parseOfficialFreeformDescriptorJson } from '../src/official-freeform-descriptor'
import { assertDistOpenApiFreshness } from './smoke-dist-release-contract'

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
      officialFreeformDescriptorReady?: boolean
      workerWebReady?: boolean
    }
  }
}

interface OpenApiBrokerRouteDocument {
  paths?: Record<string, Record<string, unknown>>
}

interface ProjectionReceiptMissingResponse {
  body: string
  label: string
  secretCanary: string
  status: number
}

const officialFreeformDistRoot = resolve(import.meta.dirname, '..', 'dist', 'official-apps', 'aiworker-freeform')
const officialFreeformDescriptorPath = resolve(officialFreeformDistRoot, 'dist', 'soul.descriptor.json')

async function main(): Promise<number> {
  const cli = resolve(import.meta.dirname, '..', 'dist', 'aiworker.js')
  if (!existsSync(cli))
    throw new Error(`Dist CLI not found: ${cli}. Run bun run build:bundle first.`)
  const expectedVersion = readDistPackageVersion()
  assertDistOfficialFreeformDescriptor()

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
    await assertDaemonOpenApiWorkerConfigEnvelope(port)
    await assertDaemonOpenApiBrokerRoutes(port)
    await assertDaemonProjectionReceiptBoundary(port)
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

    consola.success('[smoke-dist-release] PASS: dist CLI starts Host Web/API, reports packaged resources, and bootstraps official Soul Apps with descriptor refs')
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

function assertDistOfficialFreeformDescriptor(): void {
  let descriptor: ReturnType<typeof parseOfficialFreeformDescriptorJson>
  try {
    descriptor = parseOfficialFreeformDescriptorJson(readFileSync(officialFreeformDescriptorPath, 'utf8'))
  }
  catch {
    throw new Error(`dist Freeform descriptor must use protocol soul/v1: ${officialFreeformDescriptorPath}`)
  }
  assertDistDescriptorRefs([
    { kind: 'file', ref: descriptor.workbench.entry },
    { kind: 'dir', ref: descriptor.engine.workspaceAssets?.source },
    { kind: 'dir', ref: descriptor.engine.skills?.source },
    ...Object.values(descriptor.engine.mcp?.targets ?? {}).map(target => ({ kind: 'file' as const, ref: target.file })),
  ])
}

function assertDistDescriptorRefs(refs: Array<{ kind: 'dir' | 'file', ref?: string }>): void {
  assertDistDescriptorRefsForRoot(officialFreeformDistRoot, refs)
}

export function assertDistDescriptorRefsForRoot(appRootPath: string, refs: Array<{ kind: 'dir' | 'file', ref?: string }>): void {
  const appRootResolved = resolve(appRootPath)
  const appRoot = realpathSync(appRootPath)
  for (const item of refs) {
    if (!item.ref)
      continue
    const resourcePath = resolve(appRootResolved, item.ref)
    const lexicalRelativeResourcePath = relative(appRootResolved, resourcePath)
    if (!lexicalRelativeResourcePath || lexicalRelativeResourcePath.startsWith('..') || isAbsolute(lexicalRelativeResourcePath))
      throw new Error(`dist Freeform descriptor reference escapes package root: ${item.ref}`)
    try {
      const relativeResourcePath = relative(appRoot, realpathSync(resourcePath))
      if (!relativeResourcePath || relativeResourcePath.startsWith('..') || isAbsolute(relativeResourcePath))
        throw new Error(`dist Freeform descriptor reference escapes package root: ${item.ref}`)
      const info = statSync(resourcePath)
      if (item.kind === 'dir' && !info.isDirectory())
        throw new Error('not a directory')
      if (item.kind === 'file' && !info.isFile())
        throw new Error('not a file')
    }
    catch (err) {
      if (err instanceof Error && err.message.includes('descriptor reference escapes package root'))
        throw err
      throw new Error(`dist Freeform descriptor references missing ${item.kind}: ${resourcePath}`)
    }
  }
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

async function assertDaemonOpenApiWorkerConfigEnvelope(port: number): Promise<void> {
  const openapi = await getJson<{ paths?: Record<string, unknown> }>(`http://127.0.0.1:${port}/openapi.json`)
  const serialized = JSON.stringify(openapi)
  for (const forbidden of ['[mcp_servers', 'mcpServers', 'literal-secret', 'sk-', 'candidateId', 'artifactContent']) {
    if (serialized.includes(forbidden))
      throw new Error(`dist daemon OpenAPI must not expose ${forbidden}`)
  }

  const workerConfigPath = openapi.paths?.['/api/workers/{workerId}/config/{configKey}'] as {
    patch?: { requestBody?: unknown }
    put?: { requestBody?: unknown }
  } | undefined
  const putBody = JSON.stringify(workerConfigPath?.put?.requestBody)
  const patchBody = JSON.stringify(workerConfigPath?.patch?.requestBody)
  assertDistOpenApiFreshness(workerConfigPath)
  if (!putBody.includes('WorkerConfigValueInput') || patchBody !== putBody)
    throw new Error(`dist daemon OpenAPI worker config routes must share WorkerConfigValueInput request bodies: ${putBody} / ${patchBody}`)
  for (const required of ['WorkerConfigValueInput', 'configValueJson envelope', 'skill-overlay', 'descriptor://engine/skills/freeform-session', 'updatedBy', 'web']) {
    if (!serialized.includes(required))
      throw new Error(`dist daemon OpenAPI worker config envelope is missing ${required}`)
  }
}

async function assertDaemonOpenApiBrokerRoutes(port: number): Promise<void> {
  const openapi = await getJson<OpenApiBrokerRouteDocument>(`http://127.0.0.1:${port}/openapi.json`)
  assertOpenApiBrokerRouteDocument(openapi)
}

export function assertOpenApiBrokerRouteDocument(openapi: OpenApiBrokerRouteDocument): void {
  const expectedBrokerRoutes = [
    'POST /api/app-installation/install',
    'GET /api/app-installation/apps',
    'GET /api/app-installation/apps/{appId}',
    'POST /api/app-installation/apps/{appId}/enable',
    'POST /api/app-installation/apps/{appId}/archive',
    'DELETE /api/app-installation/apps/{appId}',
    'GET /api/info',
    'GET /api/settings',
    'PATCH /api/settings',
    'GET /api/capabilities',
    'POST /api/workers',
    'GET /api/workers',
    'GET /api/workers/{workerId}',
    'PATCH /api/workers/{workerId}',
    'POST /api/workers/{workerId}/archive',
    'DELETE /api/workers/{workerId}',
    'GET /api/workers/{workerId}/config',
    'PUT /api/workers/{workerId}/config/{configKey}',
    'PATCH /api/workers/{workerId}/config/{configKey}',
    'POST /api/workers/{workerId}/config/{configKey}/archive',
    'POST /api/workspace-locators',
    'GET /api/workspace-locators',
    'GET /api/workspace-locators/{workspaceId}',
    'PATCH /api/workspace-locators/{workspaceId}',
    'POST /api/workspace-locators/{workspaceId}/archive',
    'DELETE /api/workspace-locators/{workspaceId}',
    'POST /api/sessions',
    'GET /api/sessions',
    'GET /api/sessions/{sessionId}',
    'PATCH /api/sessions/{sessionId}',
    'POST /api/sessions/{sessionId}/archive',
    'DELETE /api/sessions/{sessionId}',
    'POST /api/sessions/{sessionId}/invocations',
    'GET /api/engine/targets',
    'GET /api/engine/targets/{target}/readiness',
    'POST /api/engine/targets/rescan',
    'POST /api/engine/targets/{target}/test',
    'POST /api/engine/invocations',
    'GET /api/engine/invocations/{invocationId}',
    'GET /api/engine/invocations/{invocationId}/events',
    'POST /api/engine/invocations/{invocationId}/cancel',
    'POST /api/engine/invocations/{invocationId}/reconcile',
    'POST /api/projections/{target}/refresh',
    'GET /api/projections/receipts/{receiptId}',
    'POST /api/projections/receipts/{receiptId}/cleanup',
    'GET /api/mount/workbench',
    'GET /api/apps/{appId}',
    'OPTIONS /api/apps/{appId}',
    'POST /api/apps/{appId}',
    'PUT /api/apps/{appId}',
    'PATCH /api/apps/{appId}',
    'DELETE /api/apps/{appId}',
    'GET /api/apps/{appId}/{path}',
    'OPTIONS /api/apps/{appId}/{path}',
    'POST /api/apps/{appId}/{path}',
    'PUT /api/apps/{appId}/{path}',
    'PATCH /api/apps/{appId}/{path}',
    'DELETE /api/apps/{appId}/{path}',
  ]
  const missingBrokerRoutes = expectedBrokerRoutes.flatMap((route) => {
    const [method, path] = route.split(' ', 2)
    return openapi.paths?.[path]?.[method.toLowerCase()] ? [] : [route]
  })
  if (missingBrokerRoutes.length > 0)
    throw new Error(`dist daemon OpenAPI is missing canonical broker routes: ${missingBrokerRoutes.join(', ')}`)

  const retiredBrokerRouteSegments = [
    ['api', 'local', 'info'],
    ['api', 'local', 'settings'],
    ['api', 'local', 'apps', '{appId}', 'actions', '{actionId}'],
    ['api', 'local', 'workers', '{workerId}', 'engine', 'invocations'],
  ]
  for (const segments of retiredBrokerRouteSegments) {
    const retiredPath = `/${segments.join('/')}`
    if (openapi.paths?.[retiredPath])
      throw new Error(`dist daemon OpenAPI exposed retired local broker route: ${retiredPath}`)
  }
}

async function assertDaemonProjectionReceiptBoundary(port: number): Promise<void> {
  const receiptId = 'smoke-missing-receipt'
  const secretCanary = 'sk-smoke-projection-secret'
  await assertReceiptMissingResponse(
    `http://127.0.0.1:${port}/api/projections/receipts/${receiptId}?debug=${secretCanary}`,
    'read missing receipt-owned projection receipt',
    secretCanary,
  )
  await assertReceiptMissingResponse(
    `http://127.0.0.1:${port}/api/projections/receipts/${receiptId}/cleanup?debug=${secretCanary}`,
    'cleanup missing receipt-owned projection receipt',
    secretCanary,
    { method: 'POST' },
  )
}

async function assertReceiptMissingResponse(url: string, label: string, secretCanary: string, init?: RequestInit): Promise<void> {
  const res = await fetch(url, init)
  const body = await res.text()
  assertProjectionReceiptMissingResponseText({ body, label, secretCanary, status: res.status })
}

export function assertProjectionReceiptMissingResponseText(response: ProjectionReceiptMissingResponse): void {
  if (response.status !== 404 || !response.body.includes('PROJECTION_RECEIPT_MISSING'))
    throw new Error(`dist daemon projection receipt ${response.label} must return PROJECTION_RECEIPT_MISSING, got ${response.status}: ${response.body.slice(0, 500)}`)
  if (response.body.includes(response.secretCanary))
    throw new Error(`dist daemon projection receipt ${response.label} leaked secret-like request data`)
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
  if (resources?.officialFreeformDescriptorReady !== true)
    throw new Error(`dist doctor must report packaged Freeform descriptor ready: ${stdout}`)
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

if (import.meta.main) {
  main()
    .then(code => process.exit(code))
    .catch((err) => {
      consola.error(`[smoke-dist-release] FAIL: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    })
}
