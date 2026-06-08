import type { Page } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { chromium } from 'playwright'

import { devAdminHostEnv } from './host-serve-env'

const repoRoot = join(import.meta.dir, '..', '..')
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const evidenceRoot = join(repoRoot, 'tmp', `host-dev-loop-${runId}`)
const adminEmail = 'admin@zonease.org'
const workerId = 'wkr_browser'
const workerSoulId = 'aiworker-freeform'
const workerVersion = '2026.06.06-browser'
const browserEvents: string[] = []
const evidence: Record<string, unknown> = {}

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
let manifestPath: string | null = null

await mkdir(evidenceRoot, { recursive: true })

try {
  const apiPort = reservePort()
  const webPort = reservePort()
  const apiUrl = `http://127.0.0.1:${apiPort}`
  const webUrl = `http://127.0.0.1:${webPort}`
  const hostUrl = new URL('/host', webUrl).toString()
  const dbPath = join(evidenceRoot, 'host.db')
  manifestPath = join(evidenceRoot, 'dev-host.json')

  const lifecycleStart = startHostDevLifecycle({ apiPort, dbPath, manifestPath, webPort })
  evidence.lifecycleStart = lifecycleStart
  await waitForDocument(new URL('/host', apiUrl).toString(), 'Host API')
  await waitForDocument(hostUrl, 'Host Web')

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { height: 900, width: 1440 } })
  captureBrowserEvents(page)

  const optionsResponsePromise = page.waitForResponse(
    response => response.url().includes('/api/host/options'),
    { timeout: 10000 },
  ).catch(() => null)
  const initialStatus = await gotoDocument(page, hostUrl, '/host')
  const optionsResponse = await optionsResponsePromise
  await page.getByRole('heading', { name: 'AI Workers' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('navigation', { name: 'Host navigation' }).waitFor({ state: 'visible', timeout: 10000 })
  // Operator identity now comes from the real /api/auth/me probe (dev-admin
  // operator in this lifecycle), and the worker-access summary is derived live —
  // both replace the old hardcoded "未接入" stubs.
  await page.getByText(adminEmail).first().waitFor({ state: 'visible', timeout: 10000 })
  await page.getByLabel('Worker access summary').waitFor({ state: 'visible', timeout: 10000 })
  // Provisioning is an on-demand right drawer (Sheet) now — open it on demand,
  // it is no longer a permanently pinned column.
  await page.getByRole('button', { name: '开通 AI Worker' }).first().click()
  await page.getByRole('dialog', { name: '开通 AI Worker' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByLabel('provisioning target').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByLabel('provisioning target').selectOption('local:default')
  await page.locator('[data-slot="field-description"]').filter({ hasText: '本机开发环境 · local · dev' }).waitFor({ state: 'visible', timeout: 10000 })
  // Only the selected target's maturity badge is shown (no wall of every target).
  await page.getByLabel('selected target maturity').getByText('local · dev').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByLabel('员工邮箱').fill('browser.employee@zonease.org')
  await fillIfFallbackInput(page, 'Soul release', 'aiworker-freeform@browser-proof')
  await page.getByRole('button', { name: '创建开通' }).click()

  const provisionToken = await commandBlockText(page, 'Provision token')
  const command = await commandBlockText(page, 'Provision command')
  if (!command)
    throw new Error('Host provision command was empty in the assignment drawer')
  if (!command.includes(`--host ${apiUrl}`))
    throw new Error(`Host provision command did not use the local Host API callback ${apiUrl}: ${redactProvisionCommand(command)}`)
  await page.getByText('等待执行 provision command').waitFor({ state: 'visible', timeout: 10000 })

  const loopbackAisshResponse = await fetch(new URL('/api/host/assignments', apiUrl), {
    body: JSON.stringify({
      adapterRuntimeControlBaseUrl: apiUrl,
      assignedEmail: 'remote-aissh-loopback@zonease.org',
      provisioningTarget: {
        adapterType: 'aissh',
        maturity: 'production',
        ref: 'srv-1',
      },
      soulReleaseRef: 'aiworker-freeform@dev',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  const loopbackAisshBody = await loopbackAisshResponse.json() as unknown
  if (loopbackAisshResponse.status !== 400 || JSON.stringify(loopbackAisshBody) !== JSON.stringify({ error: { code: 'PROVISIONING_TARGET_UNREACHABLE' } })) {
    throw new Error(`Remote aissh loopback assignment should be rejected, got ${loopbackAisshResponse.status}: ${JSON.stringify(loopbackAisshBody)}`)
  }

  const checkInBody = {
    provisionToken,
    worker: {
      health: {
        detail: 'browser proof check-in',
        ready: true,
      },
      id: workerSoulId,
      version: workerVersion,
      workerId,
      workbenchUrl: new URL(`/workers/${workerId}`, webUrl).toString(),
    },
  }
  const checkInResponse = await fetch(new URL('/api/provision/check-in', apiUrl), {
    body: JSON.stringify(checkInBody),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  const checkInText = await checkInResponse.text()
  if (!checkInResponse.ok)
    throw new Error(`Host check-in failed with HTTP ${checkInResponse.status}: ${checkInText}`)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'AI Workers' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('Worker 已报到').first().waitFor({ state: 'visible', timeout: 10000 })

  const openWorkerLinkCount = await page.getByRole('link', { name: '打开 Worker' }).count()
  if (openWorkerLinkCount !== 0)
    throw new Error(`checked_in assignment exposed 打开 Worker link before ready: ${openWorkerLinkCount}`)

  const unexpectedBrowserEvents = browserEvents.filter(event => !isExpectedBrowserEvent(event))
  if (unexpectedBrowserEvents.length > 0)
    throw new Error(`Unexpected browser errors during Host dev loop proof: ${unexpectedBrowserEvents.join('\n')}`)

  evidence.proof = {
    apiUrl,
    checkIn: {
      responseStatus: checkInResponse.status,
      workerId,
      workerSoulId,
      workerVersion,
    },
    hostUrl,
    hostShell: {
      createActionVisible: await page.getByRole('button', { name: '开通 AI Worker' }).first().isVisible(),
      navigationVisible: await page.getByRole('navigation', { name: 'Host navigation' }).isVisible(),
      operatorIdentityVisible: await page.getByText(adminEmail).first().isVisible(),
      workerAccessSummaryVisible: await page.getByLabel('Worker access summary').isVisible(),
      optionsStatus: optionsResponse?.status() ?? null,
    },
    initialStatus,
    openWorkerLinkCount,
    provisionCommand: {
      hasHost: command.includes(`--host ${apiUrl}`),
      hasToken: true,
      token: redactProvisionToken(provisionToken),
    },
    remoteAisshLoopback: {
      response: loopbackAisshBody,
      status: loopbackAisshResponse.status,
    },
    refreshMechanism: 'page.reload(domcontentloaded)',
    webUrl,
  }

  await writeEvidence('proof.json', {
    browserEvents,
    commands: {
      start: displayHostDevLifecycleCommand({ apiPort, dbPath, manifestPath, webPort }),
    },
    ...evidence,
  })
}

catch (error) {
  await writeEvidence('failure.json', {
    browserEvents,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    ...evidence,
  })
  throw error
}
finally {
  if (browser)
    await browser.close()
  if (manifestPath)
    cleanHostDevLifecycle(manifestPath)
}

async function fillIfFallbackInput(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByLabel(label)
  await field.waitFor({ state: 'visible', timeout: 10000 })
  const tagName = await field.evaluate(element => element.tagName.toLowerCase())
  if (tagName === 'input')
    await field.fill(value)
}

interface HostDevLifecycleInput {
  apiPort: number
  dbPath: string
  manifestPath: string
  webPort: number
}

function startHostDevLifecycle(input: HostDevLifecycleInput): unknown {
  const result = Bun.spawnSync({
    cmd: displayHostDevLifecycleCommand(input),
    cwd: repoRoot,
    // dev-admin 模式（清空 Logto session env，见 ./host-serve-env）；空 Logto keys 沿
    // start → dev-host.sh → daemon 全链传递，否则 daemon /host 走真 Logto 登录 → healthcheck 超时。
    env: devAdminHostEnv(),
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const stdout = new TextDecoder().decode(result.stdout)
  const stderr = new TextDecoder().decode(result.stderr)
  if (result.exitCode !== 0)
    throw new Error(`Host dev lifecycle start failed with ${result.exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`)
  return JSON.parse(stdout)
}

function cleanHostDevLifecycle(manifest: string): void {
  Bun.spawnSync({
    cmd: [process.execPath, 'apps/host-cli/src/aiworker-host.ts', 'clean', '--manifest', manifest],
    cwd: repoRoot,
    stderr: 'pipe',
    stdout: 'pipe',
  })
}

function displayHostDevLifecycleCommand(input: HostDevLifecycleInput): string[] {
  return [
    process.execPath,
    'apps/host-cli/src/aiworker-host.ts',
    'start',
    '--dev',
    '--db',
    input.dbPath,
    '--dev-admin-email',
    adminEmail,
    '--host',
    '127.0.0.1',
    '--manifest',
    input.manifestPath,
    '--port',
    String(input.apiPort),
    '--web-port',
    String(input.webPort),
  ]
}

function captureBrowserEvents(page: Page): void {
  page.on('console', (message) => {
    if (message.type() === 'error')
      browserEvents.push(`console:${message.type()}:${message.text()}`)
  })
  page.on('pageerror', error => browserEvents.push(`pageerror:${error.message}`))
  page.on('requestfailed', request => browserEvents.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? 'unknown'}`))
}

async function gotoDocument(page: Page, url: string, label: string): Promise<number> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
  if (!response?.ok())
    throw new Error(`${label} returned HTTP ${response?.status() ?? 'unknown'}`)
  return response.status()
}

async function commandBlockText(page: Page, title: string): Promise<string> {
  const text = await page.getByLabel(`command ${title}`).locator('pre').textContent({ timeout: 10000 })
  if (!text)
    throw new Error(`${title} block was empty`)
  return text.trim()
}

function redactProvisionToken(token: string): string {
  return token.startsWith('awp_') ? 'awp_[REDACTED]' : '[REDACTED]'
}

function redactProvisionCommand(command: string): string {
  return command.replace(/(--token\s+)(?:'[^']+'|"[^"]+"|\S+)/g, '$1[REDACTED]')
}

function isExpectedBrowserEvent(event: string): boolean {
  const normalized = event.toLowerCase()
  if (normalized.includes('/api/host/options') && normalized.includes('err_aborted'))
    return true
  return normalized.includes('vite') && normalized.includes('websocket')
}

function reservePort(): number {
  const probe = Bun.serve({
    fetch: () => new Response('ok'),
    hostname: '127.0.0.1',
    port: 0,
  })
  const port = probe.port
  probe.stop(true)
  if (!port)
    throw new Error('Failed to reserve a Host dev loop browser proof port')
  return port
}

async function waitForDocument(url: string, label: string): Promise<void> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok)
        return
      lastError = new Error(`HTTP ${response.status}`)
    }
    catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`${label} did not become reachable at ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function writeEvidence(name: string, value: unknown): Promise<void> {
  await writeFile(
    join(evidenceRoot, name),
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
  )
}
