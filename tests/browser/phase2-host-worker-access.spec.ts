import type { Page } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { chromium } from 'playwright'

const repoRoot = join(import.meta.dir, '..', '..')
const evidenceRoot = join(repoRoot, 'tmp', `phase2-host-worker-access-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const suppliedBaseUrl = process.env.AIWORKER_PHASE2_URL
const suppliedWorkerUrl = process.env.AIWORKER_PHASE2_WORKER_URL
const browserEvents: string[] = []
const evidence: Record<string, unknown> = {}

let preview: ReturnType<typeof Bun.spawn> | null = null
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

await mkdir(evidenceRoot, { recursive: true })

try {
  const baseUrl = suppliedBaseUrl ?? await startHostPreview()
  const hostUrl = new URL('/host', baseUrl).toString()
  const workerUrl = suppliedWorkerUrl ?? new URL('/workers/wkr_82', new URL(baseUrl).origin).toString()

  await waitForDocument(hostUrl)

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { height: 900, width: 1440 } })
  page.on('console', (message) => {
    if (message.type() !== 'error')
      return
    const text = message.text()
    if (text.startsWith('Failed to load resource:'))
      return
    browserEvents.push(`console:${message.type()}:${text}`)
  })
  page.on('pageerror', error => browserEvents.push(`pageerror:${error.message}`))
  page.on('requestfailed', request => browserEvents.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? 'unknown'}`))
  page.on('response', (response) => {
    if (response.status() >= 400)
      browserEvents.push(`response:${response.status()}:${response.url()}`)
  })

  const hostStatus = await gotoDocument(page, hostUrl, '/host')
  await page.getByRole('heading', { name: 'AI Workers' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('navigation', { name: 'Host navigation' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('complementary', { name: 'Worker assignment drawer' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('button', { name: '创建开通' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('Worker Access Tunnel 未接入').first().waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('Logto 未接入').first().waitFor({ state: 'visible', timeout: 10000 })
  evidence.host = {
    ...await assertNoMountContainers(page, '/host'),
    assignmentDrawerVisible: await page.getByRole('complementary', { name: 'Worker assignment drawer' }).isVisible(),
    deferredAccessVisible: await page.getByText('Worker Access Tunnel 未接入').first().isVisible(),
    deferredLogtoVisible: await page.getByText('Logto 未接入').first().isVisible(),
    navigationVisible: await page.getByRole('navigation', { name: 'Host navigation' }).isVisible(),
    status: hostStatus,
  }

  const workerPathname = new URL(workerUrl).pathname
  const workerStatus = await gotoDocument(page, workerUrl, workerPathname, { allowNonOk: true })
  evidence.worker = {
    ...await assertNoMountContainers(page, workerPathname),
    status: workerStatus,
  }

  const unexpectedBrowserEvents = browserEvents.filter(event => !isExpectedBrowserEvent(event))
  if (unexpectedBrowserEvents.length > 0)
    throw new Error(`Unexpected browser errors during Phase 2 host/worker access proof: ${unexpectedBrowserEvents.join('\n')}`)

  await writeEvidence('proof.json', {
    baseUrl,
    browserEvents,
    hostUrl,
    workerUrl,
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
  if (preview) {
    preview.kill('SIGTERM')
    await preview.exited.catch(() => undefined)
    await writeEvidence('preview-stdout.log', await new Response(preview.stdout).text())
    await writeEvidence('preview-stderr.log', await new Response(preview.stderr).text())
  }
}

interface MountContainerProof {
  iframeCount: number
  microAppCount: number
  pathname: string
}

async function assertNoMountContainers(page: Page, pathname: string): Promise<MountContainerProof> {
  const microAppCount = await page.locator('micro-app').count()
  const iframeCount = await page.locator('iframe').count()
  if (microAppCount !== 0 || iframeCount !== 0) {
    throw new Error(
      `${pathname} rendered Host-mounted Worker UI containers: micro-app=${microAppCount}, iframe=${iframeCount}.`,
    )
  }
  return { iframeCount, microAppCount, pathname }
}

async function gotoDocument(
  page: Page,
  url: string,
  label: string,
  options: { allowNonOk?: boolean } = {},
): Promise<number> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
  if (!response)
    throw new Error(`${label} returned no HTTP response`)
  if (!options.allowNonOk && !response.ok())
    throw new Error(`${label} returned HTTP ${response?.status() ?? 'unknown'}`)
  return response.status()
}

function isExpectedBrowserEvent(event: string): boolean {
  const normalized = event.toLowerCase()
  if (normalized.startsWith('response:404:') && normalized.includes('/api/host/options'))
    return true
  if (normalized.startsWith('response:404:') && normalized.includes('/workers/wkr_82'))
    return true
  return event.includes('server responded with a status of 502')
}

async function startHostPreview(): Promise<string> {
  const port = reservePort()
  const baseUrl = `http://127.0.0.1:${port}`
  preview = Bun.spawn({
    cmd: [
      process.execPath,
      'run',
      '--filter',
      '@zonease/aiworker-host-web',
      'preview',
      '--',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    cwd: repoRoot,
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  return baseUrl
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
    throw new Error('Failed to reserve a Phase 2 browser proof port')
  return port
}

async function waitForDocument(url: string): Promise<void> {
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
  throw new Error(`Host preview did not become reachable at ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function writeEvidence(name: string, value: unknown): Promise<void> {
  await writeFile(
    join(evidenceRoot, name),
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
  )
}
