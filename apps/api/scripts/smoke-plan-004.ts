/**
 * PLAN-004 5.1 — End-to-end smoke that exercises the full self-sufficient-
 * worker + manager-as-registry story without relying on docker. We boot both
 * processes via `bun src/index.ts`, scrape the worker's bootstrap token from
 * its stdout, then walk the operator journey:
 *
 *   1. Worker boots, prints its id + bootstrap token.
 *   2. Manager boots.
 *   3. Manager `POST /api/workers/register` against the worker's URL + token.
 *   4. Manager `GET /api/workers` lists the registered worker as `online`.
 *   5. Manager `PUT /api/workers/:id/proxy/worker/config` pushes a minimal
 *      config; expects `runtimeReload: 'ok'`.
 *   6. Manager `GET /api/workers/:id/proxy/worker/info` confirms the version
 *      bumped from 1 to 2.
 *   7. Manager `POST /api/workers/:id/rotate-token` — the new wrapper from
 *      PLAN-004 5.1 — rotates the bearer in BOTH the worker and the registry,
 *      then a follow-up `GET /proxy/worker/info` proves the manager's stored
 *      token was updated (otherwise it would 401).
 *   8. Manager `POST /api/workers/:id/proxy/worker/channels/web/test` sends a
 *      web-channel echo through the worker; expects `sent: true`.
 *
 * Usage:  bun run scripts/smoke-plan-004.ts
 *         (run from apps/api; needs no docker, no LINE creds, no OpenAI key)
 *
 * Exit code 0 = every assertion passed. Non-zero = the offending step is
 * printed to stderr with the response body.
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

interface BootedProcess {
  readonly child: ChildProcessWithoutNullStreams
  readonly stdout: string[]
  readonly stderr: string[]
  readonly logTag: string
  /** Resolves with the matching line, or rejects with a timeout error. */
  waitForLine: (predicate: (line: string) => boolean, timeoutMs: number) => Promise<string>
}

interface WorkerHandle extends BootedProcess {
  readonly url: string
  readonly token: string
  readonly workerId: string
}

interface ManagerHandle extends BootedProcess {
  readonly url: string
}

const REPO_API_DIR = process.cwd()
const TEMP_ROOT = mkdtempSync(join(tmpdir(), 'aiworker-smoke-plan-004-'))
function log(msg: string): void {
  console.log(`[smoke] ${msg}`)
}
function fail(msg: string, payload?: unknown): never {
  console.error(`[smoke][FAIL] ${msg}`)
  if (payload !== undefined)
    console.error(payload)
  throw new SmokeFailure(msg)
}

class SmokeFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SmokeFailure'
  }
}

function generateMasterKeyHex(): string {
  return randomBytes(32).toString('hex')
}

async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (typeof addr !== 'object' || addr === null) {
        srv.close()
        reject(new Error('failed to acquire ephemeral port'))
        return
      }
      const port = addr.port
      srv.close(() => resolve(port))
    })
  })
}

function bootProcess(opts: {
  logTag: string
  env: Record<string, string>
  cwd?: string
}): BootedProcess {
  const child = spawn('bun', ['src/index.ts'], {
    cwd: opts.cwd ?? REPO_API_DIR,
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams

  const stdout: string[] = []
  const stderr: string[] = []
  const stdoutListeners: Array<(line: string) => void> = []
  const stderrListeners: Array<(line: string) => void> = []

  let stdoutBuf = ''
  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString()
    let idx = stdoutBuf.indexOf('\n')
    while (idx !== -1) {
      const line = stdoutBuf.slice(0, idx)
      stdoutBuf = stdoutBuf.slice(idx + 1)
      stdout.push(line)
      for (const l of stdoutListeners)
        l(line)
      idx = stdoutBuf.indexOf('\n')
    }
  })

  let stderrBuf = ''
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString()
    let idx = stderrBuf.indexOf('\n')
    while (idx !== -1) {
      const line = stderrBuf.slice(0, idx)
      stderrBuf = stderrBuf.slice(idx + 1)
      stderr.push(line)
      for (const l of stderrListeners)
        l(line)
      idx = stderrBuf.indexOf('\n')
    }
  })

  function waitForLine(predicate: (line: string) => boolean, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      // Replay buffered lines first.
      for (const line of stdout) {
        if (predicate(line)) {
          resolve(line)
          return
        }
      }
      for (const line of stderr) {
        if (predicate(line)) {
          resolve(line)
          return
        }
      }
      const timer = setTimeout(() => {
        const idx = stdoutListeners.indexOf(onLine)
        if (idx !== -1)
          stdoutListeners.splice(idx, 1)
        const idx2 = stderrListeners.indexOf(onLine)
        if (idx2 !== -1)
          stderrListeners.splice(idx2, 1)
        const tail = [...stdout.slice(-20), ...stderr.slice(-20)].join('\n')
        reject(new Error(`[${opts.logTag}] timed out after ${timeoutMs}ms waiting for line; recent output:\n${tail}`))
      }, timeoutMs)
      function onLine(line: string): void {
        if (!predicate(line))
          return
        clearTimeout(timer)
        const idx = stdoutListeners.indexOf(onLine)
        if (idx !== -1)
          stdoutListeners.splice(idx, 1)
        const idx2 = stderrListeners.indexOf(onLine)
        if (idx2 !== -1)
          stderrListeners.splice(idx2, 1)
        resolve(line)
      }
      stdoutListeners.push(onLine)
      stderrListeners.push(onLine)
    })
  }

  return { child, stdout, stderr, logTag: opts.logTag, waitForLine }
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok)
        return
      lastErr = new Error(`HTTP ${res.status}`)
    }
    catch (err) {
      lastErr = err
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`timed out waiting for ${url}: ${(lastErr as Error)?.message ?? lastErr}`)
}

async function bootWorker(): Promise<WorkerHandle> {
  const port = await pickFreePort()
  const dbDir = join(TEMP_ROOT, 'worker')
  mkdirSync(dbDir, { recursive: true })

  const proc = bootProcess({
    logTag: 'worker',
    env: {
      AIWORKER_MODE: 'worker',
      INTERNAL_SHARED_SECRET: 'smoke-internal-secret-1234567890',
      AIWORKER_MASTER_KEY: generateMasterKeyHex(),
      WORKER_DB_PATH: join(dbDir, 'worker.db'),
      WORKER_MIGRATIONS_FOLDER: './drizzle/worker',
      PORT: String(port),
    },
  })

  const url = `http://127.0.0.1:${port}`

  // Bootstrap output is two lines: "[worker] id=w_..." then
  // "[worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_...".
  const idLine = await proc.waitForLine(line => line.startsWith('[worker] id='), 15_000)
  const tokenLine = await proc.waitForLine(line => line.startsWith('[worker] AIWORKER_BOOTSTRAP_TOKEN='), 15_000)
  await waitForHttp(`${url}/health`, 15_000)

  const workerId = idLine.replace('[worker] id=', '').trim()
  const token = tokenLine.replace('[worker] AIWORKER_BOOTSTRAP_TOKEN=', '').trim()
  return { ...proc, url, workerId, token }
}

async function bootManager(): Promise<ManagerHandle> {
  const port = await pickFreePort()
  const dbDir = join(TEMP_ROOT, 'manager')
  mkdirSync(dbDir, { recursive: true })

  const proc = bootProcess({
    logTag: 'manager',
    env: {
      AIWORKER_MODE: 'dashboard',
      INTERNAL_SHARED_SECRET: 'smoke-internal-secret-1234567890',
      AIWORKER_MASTER_KEY: generateMasterKeyHex(),
      FLEET_DB_PATH: join(dbDir, 'fleet.db'),
      FLEET_MIGRATIONS_FOLDER: './drizzle/fleet',
      // Disable the periodic poll — the smoke explicitly drives state changes.
      MANAGER_POLL_INTERVAL_MS: '0',
      PORT: String(port),
    },
  })

  const url = `http://127.0.0.1:${port}`
  await waitForHttp(`${url}/health`, 15_000)
  return { ...proc, url }
}

async function shutdown(handle: BootedProcess): Promise<void> {
  if (handle.child.exitCode !== null)
    return
  handle.child.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      handle.child.kill('SIGKILL')
      resolve()
    }, 3_000)
    handle.child.once('exit', () => {
      clearTimeout(t)
      resolve()
    })
  })
}

interface JsonResponse {
  status: number
  body: unknown
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (text.length === 0)
    return null
  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}

async function jsonRequest(
  url: string,
  init: { method: string, headers?: Record<string, string>, body?: unknown } = { method: 'GET' },
): Promise<JsonResponse> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) }
  let body: BodyInit | undefined
  if (init.body !== undefined) {
    body = JSON.stringify(init.body)
    if (!headers['Content-Type'])
      headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(url, {
    method: init.method,
    headers,
    body,
  })
  return { status: res.status, body: await readJson(res) }
}

async function runSmoke(): Promise<void> {
  let worker: WorkerHandle | null = null
  let manager: ManagerHandle | null = null

  try {
    log('booting worker process')
    worker = await bootWorker()
    log(`worker  ready: id=${worker.workerId} url=${worker.url}`)

    log('booting manager process')
    manager = await bootManager()
    log(`manager ready: ${manager.url}`)

    // Step 1: register the worker against the manager
    log('step 1: POST /api/workers/register')
    const reg = await jsonRequest(`${manager.url}/api/workers/register`, {
      method: 'POST',
      body: {
        baseUrl: worker.url,
        apiToken: worker.token,
        displayName: 'smoke-worker',
      },
    })
    if (reg.status !== 201)
      fail(`register expected 201, got ${reg.status}`, reg.body)
    const registered = reg.body as { id: string, lastSeenState?: string }
    if (registered.id !== worker.workerId)
      fail(`register returned id=${registered.id}, expected ${worker.workerId}`)
    if (registered.lastSeenState !== 'online')
      fail(`register lastSeenState=${registered.lastSeenState}, expected 'online'`)
    log(`        ok — id=${registered.id} lastSeenState=${registered.lastSeenState}`)

    // Step 2: list confirms the row exists
    log('step 2: GET /api/workers')
    const list = await jsonRequest(`${manager.url}/api/workers`)
    if (list.status !== 200)
      fail(`list expected 200, got ${list.status}`, list.body)
    const listBody = list.body as { workers: Array<{ id: string, lastSeenState?: string }> }
    if (!Array.isArray(listBody.workers) || listBody.workers.length !== 1)
      fail(`list expected exactly 1 worker, got ${listBody.workers?.length}`, list.body)
    if (listBody.workers[0]!.id !== worker.workerId)
      fail(`list returned wrong worker id`, list.body)
    log(`        ok — workers=[${listBody.workers.map(w => w.id).join(',')}]`)

    // Step 3: PUT a real config through the proxy → expect runtimeReload=ok + version 2
    const minimalConfig = {
      brains: [],
      brainWriteTarget: '',
      brainRetrieval: 'first-match',
      executor: {
        type: 'http',
        baseUrl: 'http://127.0.0.1:65500',
        apiKey: 'fake-key',
        model: 'gpt-stub',
        timeoutMs: 30_000,
      },
      channels: [
        {
          channel: 'web',
          enabled: true,
          credentials: { channel: 'web' },
        },
      ],
      evolution: {
        enabled: false,
        observationRetentionDays: 7,
      },
    }
    log('step 3: PUT /api/workers/:id/proxy/worker/config')
    const put = await jsonRequest(
      `${manager.url}/api/workers/${encodeURIComponent(worker.workerId)}/proxy/worker/config`,
      {
        method: 'PUT',
        headers: { 'If-Match': '1' },
        body: minimalConfig,
      },
    )
    if (put.status !== 200)
      fail(`PUT config expected 200, got ${put.status}`, put.body)
    const putBody = put.body as { runtimeReload?: string, version?: number }
    if (putBody.runtimeReload !== 'ok')
      fail(`runtimeReload=${putBody.runtimeReload}, expected 'ok'`, put.body)
    if (putBody.version !== 2)
      fail(`config version=${putBody.version}, expected 2`, put.body)
    log(`        ok — runtimeReload=${putBody.runtimeReload} version=${putBody.version}`)

    // Step 4: /info reflects the new version
    log('step 4: GET /api/workers/:id/proxy/worker/info')
    const info1 = await jsonRequest(
      `${manager.url}/api/workers/${encodeURIComponent(worker.workerId)}/proxy/worker/info`,
    )
    if (info1.status !== 200)
      fail(`info expected 200, got ${info1.status}`, info1.body)
    const infoBody1 = info1.body as { configVersion?: number, channels?: Array<{ channel: string, enabled: boolean }> }
    if (infoBody1.configVersion !== 2)
      fail(`info configVersion=${infoBody1.configVersion}, expected 2`, info1.body)
    if (!infoBody1.channels?.some(c => c.channel === 'web' && c.enabled))
      fail(`info missing enabled web channel`, info1.body)
    log(`        ok — configVersion=${infoBody1.configVersion} web-channel=enabled`)

    // Step 5: rotate token via the manager wrapper, then prove subsequent
    // proxy traffic still authenticates.
    log('step 5: POST /api/workers/:id/rotate-token (manager wrapper)')
    const rotate = await jsonRequest(
      `${manager.url}/api/workers/${encodeURIComponent(worker.workerId)}/rotate-token`,
      { method: 'POST' },
    )
    if (rotate.status !== 200)
      fail(`rotate-token expected 200, got ${rotate.status}`, rotate.body)
    const rotateBody = rotate.body as { rotatedAt?: string, lastFourOfNewToken?: string }
    if (typeof rotateBody.rotatedAt !== 'string' || typeof rotateBody.lastFourOfNewToken !== 'string')
      fail('rotate-token response missing rotatedAt or lastFourOfNewToken', rotate.body)
    log(`        ok — rotatedAt=${rotateBody.rotatedAt} lastFour=${rotateBody.lastFourOfNewToken}`)

    log('step 6: GET /info again — proves manager re-encrypted the new token')
    const info2 = await jsonRequest(
      `${manager.url}/api/workers/${encodeURIComponent(worker.workerId)}/proxy/worker/info`,
    )
    if (info2.status !== 200)
      fail(`post-rotate info expected 200, got ${info2.status}; manager registry token is stale`, info2.body)
    log(`        ok — post-rotate proxy still authenticates`)

    // Step 7: web channel echo through the proxy → expect sent=true
    log('step 7: POST /api/workers/:id/proxy/worker/channels/web/test (echo)')
    const channelTest = await jsonRequest(
      `${manager.url}/api/workers/${encodeURIComponent(worker.workerId)}/proxy/worker/channels/web/test`,
      {
        method: 'POST',
        body: { chatId: 'smoke-chat-1', text: 'hello from smoke' },
      },
    )
    if (channelTest.status !== 200)
      fail(`channel/web/test expected 200, got ${channelTest.status}`, channelTest.body)
    const channelBody = channelTest.body as { sent?: boolean }
    if (channelBody.sent !== true)
      fail(`channel/web/test sent=${channelBody.sent}, expected true`, channelTest.body)
    log(`        ok — channels/web/test sent=true`)

    log('all steps passed — PLAN-004 5.1 smoke PASS')
  }
  finally {
    if (worker) {
      log('shutting down worker')
      await shutdown(worker)
    }
    if (manager) {
      log('shutting down manager')
      await shutdown(manager)
    }
    rmSync(TEMP_ROOT, { recursive: true, force: true })
  }
}

runSmoke().then(() => {
  process.exit(0)
}).catch((err) => {
  if (err instanceof SmokeFailure)
    process.exit(1)
  console.error('[smoke][CRASH]', err)
  process.exit(2)
})
