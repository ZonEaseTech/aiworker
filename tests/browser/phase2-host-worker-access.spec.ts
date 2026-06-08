import type { Page } from 'playwright'
import type { WorkerAccessLocalFetch, WorkerAccessTunnelHandle } from '../../packages/worker-daemon/src/modes/worker/provision-client'

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright'

import { createHostServer } from '../../apps/host-cli/src/host-server'
import { closeHostDb, createAssignment, getAssignmentByWorkerId } from '../../packages/storage-sqlite/src/host'
import { connectWorkerAccessTunnel } from '../../packages/worker-daemon/src/modes/worker/provision-client'

const repoRoot = join(import.meta.dir, '..', '..')
const evidenceRoot = join(repoRoot, 'tmp', `phase2-host-worker-access-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const workerId = 'wkr_82'
const assignedEmail = 'browser.employee@zonease.org'
const browserEvents: string[] = []
const evidence: Record<string, unknown> = {}

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
let hostServer: ReturnType<typeof Bun.serve> | null = null
let primaryTunnel: WorkerAccessTunnelHandle | null = null
let workRoot: string | null = null

await mkdir(evidenceRoot, { recursive: true })

try {
  workRoot = await mkdtemp(join(tmpdir(), 'aiworker-phase2-access-'))
  const port = reservePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const dbPath = join(workRoot, 'host.db')
  // Restartable Host process bound to a fixed port + durable host.db. Restarting wipes
  // the in-memory access registry while the persisted access token survives — exactly a
  // production Host restart, which the worker tunnel must auto-recover from.
  const startHostServer = async (): Promise<ReturnType<typeof Bun.serve>> => {
    const host = await createHostServer({
      authUser: { email: assignedEmail, roles: ['host:admin'], subject: 'usr_browser_employee' },
      dbPath,
      hostBrowserBaseUrl: baseUrl,
      hostControlBaseUrl: baseUrl,
      webStaticDir: join(repoRoot, 'apps/host-web/dist'),
    })
    return Bun.serve({
      fetch: (request, server) => host.fetch(request, server),
      hostname: '127.0.0.1',
      port,
      websocket: host.websocket,
    })
  }
  hostServer = await startHostServer()

  const primaryCheckIn = await provisionWorker(baseUrl, { assignedEmail, workerId })
  evidence.checkIn = {
    assignmentId: primaryCheckIn.assignment.assignmentId,
    mode: primaryCheckIn.access.mode,
    workerId: primaryCheckIn.assignment.workerId,
  }

  // Real-loopback tunnel: the real connectWorkerAccessTunnel client opens a real
  // ws://127.0.0.1 socket to the real Host and proxies frames into a real Worker
  // fetch handler. No fabricated response envelope exists anywhere in this proof.
  primaryTunnel = await connectRealWorkerTunnel(baseUrl, primaryCheckIn)
  await waitForWorkerAccess(baseUrl, workerId)

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
  const workerText = (await page.locator(`[data-worker-web="${workerId}"]`).textContent()) ?? ''
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

  evidence.concurrency = await runConcurrentRealLoopbackGate(baseUrl)

  evidence.hostRestartReconnect = await runHostRestartReconnectGate(baseUrl, async () => {
    if (hostServer)
      hostServer.stop(true)
    hostServer = await startHostServer()
  })

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
  if (primaryTunnel)
    primaryTunnel.close()
  if (hostServer)
    hostServer.stop(true)
  closeHostDb()
  if (workRoot)
    await rm(workRoot, { force: true, recursive: true })
}

interface WorkerCheckInIdentity {
  access: { mode: 'worker_access', token: string }
  assignment: { assignedEmail: string, assignmentId: string, soulReleaseRef: string, workerId: string }
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

async function provisionWorker(
  baseUrl: string,
  identity: { assignedEmail: string, workerId: string },
): Promise<WorkerCheckInIdentity> {
  const created = createAssignment({
    assignedEmail: identity.assignedEmail,
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
        workerId: identity.workerId,
        workbenchUrl: '/',
      },
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!checkInResponse.ok)
    throw new Error(`Worker check-in failed: ${checkInResponse.status} ${await checkInResponse.text()}`)
  return await checkInResponse.json() as WorkerCheckInIdentity
}

// A real Worker-side fetch handler. It routes on the Worker-local path, which the
// Host has already stripped of the /workers/:id prefix via mapWorkerAccessPath, so
// it sees `/`, `/api/sessions`, `/probe`. Each handler closes over its own workerId
// so its body is self-identifying and cross-attribution is observable.
function createWorkerLocalFetch(boundWorkerId: string): WorkerAccessLocalFetch {
  return async (request) => {
    const { method } = request
    const { pathname } = new URL(request.url)
    if (method === 'POST' && pathname === '/api/sessions') {
      const bodyText = await request.text()
      return new Response(JSON.stringify({ bodyText, method, path: pathname, workerId: boundWorkerId }), {
        headers: { 'content-type': 'application/json' },
        status: 201,
      })
    }
    if (method === 'GET' && pathname === '/probe') {
      return new Response(`worker=${boundWorkerId}`, {
        headers: { 'content-type': 'text/plain' },
        status: 200,
      })
    }
    return new Response(
      `<!doctype html><main data-worker-web="${boundWorkerId}">Worker via tunnel ${escapeHtml(pathname)}</main>`,
      { headers: { 'content-type': 'text/html' }, status: 200 },
    )
  }
}

async function connectRealWorkerTunnel(
  baseUrl: string,
  identity: WorkerCheckInIdentity,
  overrides: Partial<{ reconnectBaseDelayMs: number, reconnectMaxDelayMs: number }> = {},
): Promise<WorkerAccessTunnelHandle> {
  const handle = await connectWorkerAccessTunnel({
    access: identity.access,
    assignment: identity.assignment,
    env: { AIWORKER_HOST_URL: baseUrl },
    localFetch: createWorkerLocalFetch(identity.assignment.workerId),
    ...overrides,
  })
  if (!handle)
    throw new Error(`connectWorkerAccessTunnel returned no handle for ${identity.assignment.workerId}`)
  return handle
}

// Host-restart resilience proof: a real worker tunnel must auto-reconnect after the
// real Host process restarts, reusing the durable access token persisted in host.db —
// no re-provision, no second check-in. This closes the operational gap where a Host
// restart used to strand the worker until it was manually re-provisioned.
async function runHostRestartReconnectGate(
  baseUrl: string,
  restartHost: () => Promise<void>,
): Promise<Record<string, unknown>> {
  const restartWorkerId = 'wkr_restart'
  const checkIn = await provisionWorker(baseUrl, {
    assignedEmail: 'restart.employee@zonease.org',
    workerId: restartWorkerId,
  })
  const assignmentId = checkIn.assignment.assignmentId
  // Fast backoff keeps the proof quick and deterministic.
  const tunnel = await connectRealWorkerTunnel(baseUrl, checkIn, {
    reconnectBaseDelayMs: 50,
    reconnectMaxDelayMs: 200,
  })
  try {
    await waitForWorkerAccess(baseUrl, restartWorkerId)
    const before = getAssignmentByWorkerId(restartWorkerId)
    const consumedBefore = before?.provisionTokenConsumedAt ?? null
    const checkedInBefore = before?.checkedInAt ?? null

    // Restart the Host: in-memory access registry is wiped, host.db survives.
    await restartHost()

    // The worker must auto-reconnect and become routable again with no human action.
    await waitForWorkerAccess(baseUrl, restartWorkerId)
    const probe = await fetchWorkerProbe(baseUrl, restartWorkerId)
    if (probe.status !== 200 || probe.body !== `worker=${restartWorkerId}`)
      throw new Error(`Worker not routable after Host restart: HTTP ${probe.status} body ${JSON.stringify(probe.body)}`)

    const after = getAssignmentByWorkerId(restartWorkerId)
    if (!after || after.assignmentId !== assignmentId)
      throw new Error('Host restart reconnect bound a different assignment — expected the same durable assignment')
    if ((after.provisionTokenConsumedAt ?? null) !== consumedBefore)
      throw new Error('Provision token was re-consumed after Host restart — reconnect must not re-provision')
    if ((after.checkedInAt ?? null) !== checkedInBefore)
      throw new Error('Worker re-checked-in after Host restart — reconnect must reuse the durable access token')

    return {
      assignmentId,
      reconnectedWithoutReprovision: true,
      restartWorkerId,
      routableAfterRestartStatus: probe.status,
    }
  }
  finally {
    tunnel.close()
  }
}

interface ForwardLog {
  localPath: string
  requestId: string
  responseStatus: number
  workerId: string
}

async function runConcurrentRealLoopbackGate(baseUrl: string): Promise<Record<string, unknown>> {
  const workerA = 'wkr_alpha'
  const workerB = 'wkr_beta'
  const emailA = 'alpha.employee@zonease.org'
  const emailB = 'beta.employee@zonease.org'

  const checkInA = await provisionWorker(baseUrl, { assignedEmail: emailA, workerId: workerA })
  const checkInB = await provisionWorker(baseUrl, { assignedEmail: emailB, workerId: workerB })
  if (checkInA.assignment.workerId !== workerA || checkInB.assignment.workerId !== workerB)
    throw new Error('Concurrent gate provisioning returned mismatched worker ids')

  const forwardLogs: ForwardLog[] = []
  const restoreConsoleInfo = captureForwardLogs(forwardLogs)

  const tunnelA = await connectRealWorkerTunnel(baseUrl, checkInA)
  const tunnelB = await connectRealWorkerTunnel(baseUrl, checkInB)

  try {
    // Each hello registers exactly one connection keyed by its own workerId.
    await waitForWorkerAccess(baseUrl, workerA)
    await waitForWorkerAccess(baseUrl, workerB)

    // Interleaved concurrent burst across both workers. Distinguishable probe path
    // per worker proves the body that comes back was produced by the right handler.
    const burst: Array<Promise<{ body: string, status: number, target: string }>> = []
    for (let i = 0; i < 12; i += 1) {
      const target = i % 2 === 0 ? workerA : workerB
      burst.push(fetchWorkerProbe(baseUrl, target))
    }
    const results = await Promise.all(burst)

    for (const result of results) {
      if (result.status !== 200)
        throw new Error(`Concurrent probe to ${result.target} returned HTTP ${result.status}`)
      // Frame correlation: the response body must come from the targeted worker's
      // own handler, never the sibling's — interleaved frames must not cross.
      if (result.body !== `worker=${result.target}`)
        throw new Error(`Routing crossed: /workers/${result.target} returned ${JSON.stringify(result.body)}`)
    }

    // Interleaved POST /api/sessions per worker: the 201 JSON workerId field must
    // match the targeted worker (response envelope paired to the right request).
    const sessionResults = await Promise.all([
      postWorkerSession(baseUrl, workerA),
      postWorkerSession(baseUrl, workerB),
      postWorkerSession(baseUrl, workerA),
      postWorkerSession(baseUrl, workerB),
    ])
    for (const result of sessionResults) {
      if (result.status !== 201)
        throw new Error(`Concurrent POST to ${result.target} returned HTTP ${result.status}`)
      if (result.workerId !== result.target)
        throw new Error(`POST routing crossed: ${result.target} got workerId ${result.workerId}`)
    }

    // US-001 forwarding log: every worker_route_forwarded entry for a worker must
    // carry that worker's id — zero cross-attribution under the interleaved burst.
    const logsForA = forwardLogs.filter(log => log.localPath === '/probe' && log.workerId === workerA)
    const logsForB = forwardLogs.filter(log => log.localPath === '/probe' && log.workerId === workerB)
    if (logsForA.length === 0 || logsForB.length === 0)
      throw new Error(`Missing forwarding logs: A=${logsForA.length} B=${logsForB.length}`)
    const requestIds = new Set<string>()
    for (const log of forwardLogs) {
      if (log.localPath !== '/probe')
        continue
      if (log.workerId !== workerA && log.workerId !== workerB)
        throw new Error(`Forwarding log carried foreign workerId ${log.workerId}`)
      if (requestIds.has(log.requestId))
        throw new Error(`Duplicate forwarding requestId ${log.requestId} — frame ids must not collide across workers`)
      requestIds.add(log.requestId)
    }

    // N2 negative: disconnect A's real socket. After the close propagates to the
    // Host, /workers/:A must return 503 (accessRegistry.has(A) === false) while B
    // remains routable — no residual hit on B's registered connection.
    tunnelA.close()
    await waitForWorkerUnavailable(baseUrl, workerA)
    const afterDisconnectA = await fetchWorkerProbe(baseUrl, workerA)
    if (afterDisconnectA.status !== 503)
      throw new Error(`Disconnected worker A returned HTTP ${afterDisconnectA.status}, expected 503`)
    if (afterDisconnectA.body.includes(`worker=${workerB}`))
      throw new Error('Disconnected worker A response leaked worker B content')
    const bStillRoutable = await fetchWorkerProbe(baseUrl, workerB)
    if (bStillRoutable.status !== 200 || bStillRoutable.body !== `worker=${workerB}`)
      throw new Error(`Worker B no longer routable after A disconnect: HTTP ${bStillRoutable.status} body ${JSON.stringify(bStillRoutable.body)}`)

    return {
      forwardLogCount: forwardLogs.length,
      logsForA: logsForA.length,
      logsForB: logsForB.length,
      n2DisconnectedStatus: afterDisconnectA.status,
      probeResults: results.map(result => ({ body: result.body, status: result.status, target: result.target })),
      sessionResults,
      siblingStillRoutableStatus: bStillRoutable.status,
      uniqueForwardRequestIds: requestIds.size,
    }
  }
  finally {
    restoreConsoleInfo()
    tunnelA.close()
    tunnelB.close()
  }
}

function captureForwardLogs(sink: ForwardLog[]): () => void {
  const original = console.warn
  console.warn = (...args: unknown[]): void => {
    const [first] = args
    if (typeof first === 'string') {
      try {
        const parsed = JSON.parse(first) as Partial<ForwardLog> & { event?: string }
        if (parsed.event === 'worker_route_forwarded'
          && typeof parsed.workerId === 'string'
          && typeof parsed.requestId === 'string'
          && typeof parsed.localPath === 'string'
          && typeof parsed.responseStatus === 'number') {
          sink.push({
            localPath: parsed.localPath,
            requestId: parsed.requestId,
            responseStatus: parsed.responseStatus,
            workerId: parsed.workerId,
          })
        }
      }
      catch {
        // not a forwarding log; ignore
      }
    }
    original(...(args as []))
  }
  return () => {
    console.warn = original
  }
}

async function fetchWorkerProbe(baseUrl: string, targetWorkerId: string): Promise<{ body: string, status: number, target: string }> {
  const response = await fetch(new URL(`/workers/${targetWorkerId}/probe`, baseUrl))
  return { body: await response.text(), status: response.status, target: targetWorkerId }
}

async function postWorkerSession(baseUrl: string, targetWorkerId: string): Promise<{ status: number, target: string, workerId: unknown }> {
  const response = await fetch(new URL(`/workers/${targetWorkerId}/api/sessions`, baseUrl), {
    body: JSON.stringify({ title: `session-${targetWorkerId}` }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  const body = await response.json() as { workerId?: unknown }
  return { status: response.status, target: targetWorkerId, workerId: body.workerId }
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

async function waitForWorkerAccess(baseUrl: string, targetWorkerId: string): Promise<void> {
  let lastStatus = 0
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(new URL(`/workers/${targetWorkerId}`, baseUrl))
    lastStatus = response.status
    if (response.ok)
      return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Worker ${targetWorkerId} tunnel did not become reachable, last HTTP status ${lastStatus}`)
}

async function waitForWorkerUnavailable(baseUrl: string, targetWorkerId: string): Promise<void> {
  let lastStatus = 0
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(new URL(`/workers/${targetWorkerId}/probe`, baseUrl))
    lastStatus = response.status
    await response.text()
    if (response.status === 503)
      return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Worker ${targetWorkerId} did not become unavailable after disconnect, last HTTP status ${lastStatus}`)
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
