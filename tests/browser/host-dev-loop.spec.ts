import type { Page } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { chromium } from 'playwright'

const repoRoot = join(import.meta.dir, '..', '..')
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const evidenceRoot = join(repoRoot, 'tmp', `host-dev-loop-${runId}`)
const adminEmail = 'admin@zonease.org'
const workerId = 'wkr_browser'
const workerSoulId = 'aiworker-freeform'
const workerVersion = '2026.06.06-browser'
const browserEvents: string[] = []
const evidence: Record<string, unknown> = {}

let apiProcess: ReturnType<typeof Bun.spawn> | null = null
let webProcess: ReturnType<typeof Bun.spawn> | null = null
let apiExitCode: number | null = null
let webExitCode: number | null = null
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

await mkdir(evidenceRoot, { recursive: true })

try {
  const apiPort = reservePort()
  const webPort = reservePort()
  const apiUrl = `http://127.0.0.1:${apiPort}`
  const webUrl = `http://127.0.0.1:${webPort}`
  const hostUrl = new URL('/host', webUrl).toString()
  const dbPath = join(evidenceRoot, 'host.db')

  apiProcess = startHostApi({ apiPort, apiUrl, dbPath })
  apiProcess.exited.then((code) => {
    apiExitCode = code
  }).catch(() => {
    apiExitCode = -1
  })

  await waitForDocument(new URL('/host', apiUrl).toString(), 'Host API')
  assertChildStillRunning('Host API', apiExitCode)

  webProcess = startHostWeb({ apiUrl, webPort })
  webProcess.exited.then((code) => {
    webExitCode = code
  }).catch(() => {
    webExitCode = -1
  })

  await waitForDocument(hostUrl, 'Host Web')
  assertChildStillRunning('Host Web', webExitCode)

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
  await page.getByRole('complementary', { name: 'Worker assignment drawer' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('Logto 未接入').first().waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('Worker Access Tunnel 未接入').first().waitFor({ state: 'visible', timeout: 10000 })
  await page.getByLabel('员工邮箱').fill('browser.employee@zonease.org')
  await fillIfFallbackInput(page, 'aissh server', 'aissh://browser-proof')
  await fillIfFallbackInput(page, 'Soul release', 'aiworker-freeform@browser-proof')
  await page.getByRole('button', { name: '创建开通' }).click()

  const command = await page.locator('pre').filter({ hasText: '--token' }).first().innerText({ timeout: 10000 })
  const provisionToken = extractProvisionToken(command)
  await page.getByText('等待执行 provision command').waitFor({ state: 'visible', timeout: 10000 })

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
      assignmentDrawerVisible: await page.getByRole('complementary', { name: 'Worker assignment drawer' }).isVisible(),
      deferredAccessVisible: await page.getByText('Worker Access Tunnel 未接入').first().isVisible(),
      deferredLogtoVisible: await page.getByText('Logto 未接入').first().isVisible(),
      navigationVisible: await page.getByRole('navigation', { name: 'Host navigation' }).isVisible(),
      optionsStatus: optionsResponse?.status() ?? null,
    },
    initialStatus,
    openWorkerLinkCount,
    provisionCommand: {
      hasHost: command.includes(`--host ${apiUrl}`),
      hasToken: true,
      token: redactProvisionToken(provisionToken),
    },
    refreshMechanism: 'page.reload(domcontentloaded)',
    webUrl,
  }

  await writeEvidence('proof.json', {
    apiExitCode,
    browserEvents,
    commands: {
      api: displayHostApiCommand({ apiPort, apiUrl, dbPath }),
      web: displayHostWebCommand({ apiUrl, webPort }),
    },
    webExitCode,
    ...evidence,
  })
}

catch (error) {
  await writeEvidence('failure.json', {
    apiExitCode,
    browserEvents,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    webExitCode,
    ...evidence,
  })
  throw error
}
finally {
  if (browser)
    await browser.close()
  await stopProcess('host-web', webProcess)
  await stopProcess('host-api', apiProcess)
}

async function fillIfFallbackInput(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByLabel(label)
  await field.waitFor({ state: 'visible', timeout: 10000 })
  const tagName = await field.evaluate(element => element.tagName.toLowerCase())
  if (tagName === 'input')
    await field.fill(value)
}

interface HostApiStartInput {
  apiPort: number
  apiUrl: string
  dbPath: string
}

interface HostWebStartInput {
  apiUrl: string
  webPort: number
}

function startHostApi(input: HostApiStartInput) {
  return Bun.spawn({
    cmd: [
      process.execPath,
      'apps/host-cli/src/aiworker-host.ts',
      'serve',
      '--db',
      input.dbPath,
      '--dev-admin-email',
      adminEmail,
      '--public-base-url',
      input.apiUrl,
      '--port',
      String(input.apiPort),
    ],
    cwd: repoRoot,
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  })
}

function startHostWeb(input: HostWebStartInput) {
  return Bun.spawn({
    cmd: [
      process.execPath,
      'run',
      '--filter',
      '@zonease/aiworker-host-web',
      'dev',
      '--',
      '--host',
      '127.0.0.1',
      '--port',
      String(input.webPort),
    ],
    cwd: repoRoot,
    env: {
      ...process.env,
      AIWORKER_HOST_API_URL: input.apiUrl,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  })
}

function displayHostApiCommand(input: HostApiStartInput): string[] {
  return [
    'bun',
    'apps/host-cli/src/aiworker-host.ts',
    'serve',
    '--db',
    input.dbPath,
    '--dev-admin-email',
    adminEmail,
    '--public-base-url',
    input.apiUrl,
    '--port',
    String(input.apiPort),
  ]
}

function displayHostWebCommand(input: HostWebStartInput): string[] {
  return [
    'AIWORKER_HOST_API_URL=<apiUrl>',
    'bun',
    'run',
    '--filter',
    '@zonease/aiworker-host-web',
    'dev',
    '--',
    '--host',
    '127.0.0.1',
    '--port',
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

function extractProvisionToken(command: string): string {
  const match = /--token\s+(?:'([^']+)'|"([^"]+)"|(\S+))/.exec(command)
  const token = match?.[1] ?? match?.[2] ?? match?.[3]
  if (!token)
    throw new Error(`Provision command did not contain a --token value: ${redactProvisionCommand(command)}`)
  return token
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

function assertChildStillRunning(name: string, exitCode: number | null): void {
  if (exitCode !== null)
    throw new Error(`${name} exited early with code ${exitCode}; see tmp/host-dev-loop-* stdout/stderr evidence.`)
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

async function stopProcess(name: string, child: ReturnType<typeof Bun.spawn> | null): Promise<void> {
  if (!child)
    return

  const alreadyExited = await Promise.race([
    child.exited.then(() => true).catch(() => true),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), 0)),
  ])
  if (!alreadyExited) {
    child.kill('SIGTERM')
    const terminated = await Promise.race([
      child.exited.then(() => true).catch(() => true),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 3000)),
    ])
    if (!terminated) {
      child.kill('SIGKILL')
      await child.exited.catch(() => undefined)
    }
  }

  await writeEvidence(`${name}-stdout.log`, await new Response(child.stdout).text())
  await writeEvidence(`${name}-stderr.log`, await new Response(child.stderr).text())
}

async function writeEvidence(name: string, value: unknown): Promise<void> {
  await writeFile(
    join(evidenceRoot, name),
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
  )
}
