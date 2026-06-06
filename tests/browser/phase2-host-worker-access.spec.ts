import type { Page } from 'playwright'

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright'

import { createHostServer } from '../../apps/host-cli/src/host-server'
import { closeHostDb, createAssignment } from '../../packages/storage-sqlite/src/host'

const repoRoot = join(import.meta.dir, '..', '..')
const evidenceRoot = join(repoRoot, 'tmp', `phase2-host-worker-access-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const workerId = 'wkr_82'
const assignedEmail = 'browser.employee@zonease.org'
const browserEvents: string[] = []
const evidence: Record<string, unknown> = {}

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
let hostServer: ReturnType<typeof Bun.serve> | null = null
let workerSocket: WebSocket | null = null
let workRoot: string | null = null

await mkdir(evidenceRoot, { recursive: true })

try {
  workRoot = await mkdtemp(join(tmpdir(), 'aiworker-phase2-access-'))
  const port = reservePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const host = await createHostServer({
    authUser: { email: assignedEmail, roles: ['host:admin'], subject: 'usr_browser_employee' },
    dbPath: join(workRoot, 'host.db'),
    hostBrowserBaseUrl: baseUrl,
    hostControlBaseUrl: baseUrl,
    webStaticDir: join(repoRoot, 'apps/host-web/dist'),
  })
  hostServer = Bun.serve({
    fetch: (request, server) => host.fetch(request, server),
    hostname: '127.0.0.1',
    port,
    websocket: host.websocket,
  })

  const created = createAssignment({
    assignedEmail,
    serverRef: 'browser-proof-server',
    soulReleaseRef: 'aiworker-freeform@browser-proof',
  })
  const checkInResponse = await fetch(new URL('/api/provision/check-in', baseUrl), {
    body: JSON.stringify({
      provisionToken: created.provisionToken,
      worker: {
        health: { ready: true },
        id: 'aiworker-freeform',
        version: 'browser-proof',
        workerId,
        workbenchUrl: '/',
      },
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!checkInResponse.ok)
    throw new Error(`Worker check-in failed: ${checkInResponse.status} ${await checkInResponse.text()}`)
  const checkIn = await checkInResponse.json() as {
    access: { mode: 'worker_access', token: string }
    assignment: { assignmentId: string, workerId: string }
  }
  evidence.checkIn = {
    assignmentId: checkIn.assignment.assignmentId,
    mode: checkIn.access.mode,
    workerId: checkIn.assignment.workerId,
  }

  workerSocket = await connectFakeWorkerTunnel(baseUrl, {
    assignmentId: checkIn.assignment.assignmentId,
    token: checkIn.access.token,
    workerId,
  })
  await waitForWorkerAccess(baseUrl)

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { height: 900, width: 1440 } })
  captureBrowserEvents(page)

  const hostUrl = new URL('/host', baseUrl).toString()
  const workerUrl = new URL(`/workers/${workerId}`, baseUrl).toString()
  const hostStatus = await gotoDocument(page, hostUrl, '/host')
  await page.getByRole('heading', { name: 'AI Workers' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('navigation', { name: 'Host navigation' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('complementary', { name: 'Worker assignment drawer' }).waitFor({ state: 'visible', timeout: 10000 })
  evidence.host = {
    ...await assertNoMountContainers(page, '/host'),
    assignmentDrawerVisible: await page.getByRole('complementary', { name: 'Worker assignment drawer' }).isVisible(),
    navigationVisible: await page.getByRole('navigation', { name: 'Host navigation' }).isVisible(),
    status: hostStatus,
  }

  const workerStatus = await gotoDocument(page, workerUrl, `/workers/${workerId}`)
  await page.locator(`[data-worker-web="${workerId}"]`).waitFor({ state: 'visible', timeout: 10000 })
  const workerText = await page.locator(`[data-worker-web="${workerId}"]`).innerText()
  const postProof = await page.evaluate(async () => {
    const response = await fetch('/workers/wkr_82/api/sessions', {
      body: JSON.stringify({ title: 'Browser proof session' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    return {
      body: await response.json(),
      status: response.status,
    }
  }) as { body: unknown, status: number }
  if (postProof.status !== 201)
    throw new Error(`Worker POST through Host tunnel failed with HTTP ${postProof.status}: ${JSON.stringify(postProof.body)}`)
  evidence.worker = {
    ...await assertNoMountContainers(page, `/workers/${workerId}`),
    postProof,
    status: workerStatus,
    text: workerText,
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
  if (workerSocket)
    workerSocket.close()
  if (hostServer)
    hostServer.stop(true)
  closeHostDb()
  if (workRoot)
    await rm(workRoot, { force: true, recursive: true })
}

interface FakeWorkerIdentity {
  assignmentId: string
  token: string
  workerId: string
}

interface MountContainerProof {
  iframeCount: number
  microAppCount: number
  pathname: string
}

function captureBrowserEvents(page: Page): void {
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
}

async function connectFakeWorkerTunnel(baseUrl: string, identity: FakeWorkerIdentity): Promise<WebSocket> {
  const url = new URL('/api/provision/access', baseUrl)
  url.protocol = 'ws:'
  const socket = new WebSocket(url)

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({
      type: 'hello',
      assignmentId: identity.assignmentId,
      token: identity.token,
      workerId: identity.workerId,
    }))
  })
  socket.addEventListener('message', (event) => {
    void handleWorkerAccessFrame(socket, JSON.parse(String(event.data)))
  })
  await waitForSocketOpen(socket)
  return socket
}

async function handleWorkerAccessFrame(socket: WebSocket, frame: Record<string, unknown>): Promise<void> {
  if (frame.type === 'ping') {
    socket.send(JSON.stringify({ type: 'pong', id: frame.id }))
    return
  }
  if (frame.type !== 'request')
    return

  const method = String(frame.method)
  const path = String(frame.path)
  if (method === 'POST' && path === '/api/sessions') {
    socket.send(JSON.stringify({
      type: 'response',
      id: frame.id,
      status: 201,
      headers: { 'content-type': 'application/json' },
      bodyText: JSON.stringify({
        bodyText: frame.bodyText,
        method,
        path,
        workerId,
      }),
    }))
    return
  }

  socket.send(JSON.stringify({
    type: 'response',
    id: frame.id,
    status: 200,
    headers: { 'content-type': 'text/html' },
    bodyText: `<!doctype html><main data-worker-web="${workerId}">Worker via tunnel ${escapeHtml(path)}</main>`,
  }))
}

async function waitForSocketOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN)
    return
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Worker access websocket did not open')), 10000)
    socket.addEventListener('open', () => {
      clearTimeout(timeout)
      resolve()
    }, { once: true })
    socket.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new Error('Worker access websocket failed to open'))
    }, { once: true })
  })
}

async function waitForWorkerAccess(baseUrl: string): Promise<void> {
  let lastStatus = 0
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(new URL(`/workers/${workerId}`, baseUrl))
    lastStatus = response.status
    if (response.ok)
      return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Worker tunnel did not become reachable, last HTTP status ${lastStatus}`)
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

async function gotoDocument(page: Page, url: string, label: string): Promise<number> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
  if (!response)
    throw new Error(`${label} returned no HTTP response`)
  if (!response.ok())
    throw new Error(`${label} returned HTTP ${response.status()}`)
  return response.status()
}

function isExpectedBrowserEvent(event: string): boolean {
  const normalized = event.toLowerCase()
  if (normalized.includes('/favicon.ico') && event.startsWith('response:404:'))
    return true
  return normalized.includes('/api/host/options') && normalized.includes('err_aborted')
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

async function writeEvidence(name: string, value: unknown): Promise<void> {
  await writeFile(
    join(evidenceRoot, name),
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
