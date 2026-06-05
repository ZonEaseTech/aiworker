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
    if (message.type() === 'error')
      browserEvents.push(`console:${message.type()}:${message.text()}`)
  })
  page.on('pageerror', error => browserEvents.push(`pageerror:${error.message}`))

  await page.goto(hostUrl, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'AI Workers' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('button', { name: '开通 AI Worker' }).waitFor({ state: 'visible', timeout: 10000 })
  evidence.host = await assertNoMountContainers(page, '/host')

  await page.goto(workerUrl, { waitUntil: 'domcontentloaded' })
  evidence.worker = await assertNoMountContainers(page, new URL(workerUrl).pathname)

  if (browserEvents.length > 0)
    throw new Error(`Unexpected browser errors during Phase 2 host/worker access proof: ${browserEvents.join('\n')}`)

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
