// T3.2: BYOK path browser proof
// Starts a stub OpenAI-compatible server, configures the daemon into BYOK mode,
// sends a chat turn through the browser UI, and asserts:
//   • The stub provider's real answer text is visible (not the fallback placeholder).
//   • The invocation status is 'succeeded' via the daemon API.
//   • No literal API key value appears in the DOM or session API response.
// Zero real API key spend — the stub server runs entirely in-process via Bun.serve.

import type { Page } from 'playwright'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright'
import { WORKBENCH_RENDER_TIMEOUT_MS } from './workbench-render-wait'

const repoRoot = join(import.meta.dir, '..', '..')
const appId = 'aiworker-freeform'
const descriptorPath = join(repoRoot, 'souls/aiworker-freeform/dist/soul.descriptor.json')
const evidenceRoot = join(repoRoot, 'tmp', `byok-chat-proof-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const workRoot = await mkdtemp(join(tmpdir(), 'aiworker-byok-chat-proof-'))
const aiworkerHome = join(workRoot, 'home')
const dbPath = join(aiworkerHome, 'aiworker.db')

// Stub constants — distinctive enough that incidental DOM content won't match.
const STUB_ANSWER = 'BYOK_STUB_ANSWER_xq7'
const STUB_API_KEY_ENV_VALUE = 'test-byok-key-not-real'
const FORBIDDEN_PLACEHOLDER = 'Generated response with BYOK provider.'

const browserEvents: string[] = []

await mkdir(evidenceRoot, { recursive: true })

const baseEnv = {
  ...process.env,
  AIWORKER_HOME: aiworkerHome,
  // Daemon env carries the key so env:STUB_API_KEY resolves inside runByokExecutor.
  STUB_API_KEY: STUB_API_KEY_ENV_VALUE,
  WORKER_DB_PATH: dbPath,
}

let stubServer: ReturnType<typeof Bun.serve> | null = null
let daemon: ReturnType<typeof Bun.spawn> | null = null
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
let page: Page | null = null

try {
  // 1. Stub OpenAI-compatible endpoint — responds to any POST /chat/completions.
  const stubPort = reservePort()
  stubServer = Bun.serve({
    hostname: '127.0.0.1',
    port: stubPort,
    fetch(req) {
      if (req.method === 'POST' && new URL(req.url).pathname === '/chat/completions') {
        return Response.json({
          choices: [{ message: { content: STUB_ANSWER, role: 'assistant' } }],
          model: 'stub-gpt-001',
          object: 'chat.completion',
          usage: { completion_tokens: 5, prompt_tokens: 20, total_tokens: 25 },
        })
      }
      return new Response('stub: not found', { status: 404 })
    },
  })
  const stubBaseUrl = `http://127.0.0.1:${stubPort}`

  // 2. Install + enable freeform soul before daemon starts.
  runCliJson('app', 'install', descriptorPath)
  runCliJson('app', 'enable', appId)

  // 3. Start daemon.
  const port = reservePort()
  daemon = Bun.spawn({
    cmd: [
      process.execPath,
      'apps/worker-cli/src/aiworker.ts',
      'daemon',
      'foreground',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    cwd: repoRoot,
    env: baseEnv,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const daemonUrl = `http://127.0.0.1:${port}`
  await waitForHealth(daemonUrl)

  // 4. Configure BYOK via PATCH /api/settings.
  //    apiKeyRef uses the env: prefix; daemon resolves STUB_API_KEY from its own env.
  const patchRes = await fetch(`${daemonUrl}/api/settings`, {
    body: JSON.stringify({
      byok: {
        apiKeyRef: 'env:STUB_API_KEY',
        baseUrl: stubBaseUrl,
        model: 'stub-gpt-001',
        provider: 'openai-compatible',
      },
      executionMode: 'byok',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  })
  if (!patchRes.ok)
    throw new Error(`BYOK PATCH /api/settings failed: HTTP ${patchRes.status} ${await patchRes.text()}`)

  // 5. Open browser.
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { height: 920, width: 1440 } })
  page.on('console', (msg) => {
    browserEvents.push(`console:${msg.type()}:${msg.text()}`)
  })
  page.on('pageerror', err => browserEvents.push(`pageerror:${err.message}`))
  page.on('requestfailed', req => browserEvents.push(`requestfailed:${req.url()}:${req.failure()?.errorText ?? 'unknown'}`))

  await page.goto(daemonUrl, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('worker-studio-shell').waitFor({ state: 'attached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  // 6. Create workspace + initial session — response comes from BYOK stub (not 'Done.').
  await createByokWorkspaceAndSession(page)
  const routeIds = readRouteIds(new URL(page.url()).pathname)

  // 7. Stub answer is visible in the transcript.
  await page.getByText(STUB_ANSWER).first().waitFor({ state: 'visible', timeout: 40_000 })
  await page.screenshot({ fullPage: true, path: join(evidenceRoot, 'byok-chat-proof.png') })

  // 8. Invocation succeeded via daemon API.
  const sessionProof = await waitForSessionProof(page, routeIds, 1)

  // 9. No literal key value in DOM or API response.
  const bodyText = await page.evaluate(() => document.body.textContent ?? '')
  if (bodyText.includes(STUB_API_KEY_ENV_VALUE))
    throw new Error(`Literal API key value leaked into DOM: "${STUB_API_KEY_ENV_VALUE}"`)
  if (bodyText.includes(FORBIDDEN_PLACEHOLDER))
    throw new Error(`BYOK placeholder found in DOM — runByokExecutor regression: "${FORBIDDEN_PLACEHOLDER}"`)

  await writeEvidence('byok-proof.json', {
    browserEvents,
    daemonUrl,
    routeIds,
    sessionProof,
    stubAnswer: STUB_ANSWER,
    stubBaseUrl,
  })
}
catch (error) {
  const domBodyText = await page?.evaluate(() => document.body.textContent ?? '').catch(() => '')
  await page?.screenshot({ fullPage: true, path: join(evidenceRoot, 'failure-state.png') }).catch(() => undefined)
  // Fetch actual session events to capture the real error message from event.payloadJson.message
  const sessionId = page?.url().match(/sessions\/([^/]+)/)?.[1] ?? null
  const sessionData = sessionId
    ? await page?.evaluate(async (id) => {
        try {
          const r = await fetch(`/api/sessions/${encodeURIComponent(id)}`)
          return r.ok ? r.json() : { fetchStatus: r.status }
        }
        catch (e) {
          return { fetchError: String(e) }
        }
      }, sessionId).catch(() => null)
    : null
  await writeEvidence('failure.json', {
    browserEvents,
    currentUrl: page?.url() ?? '',
    domBodyText,
    sessionData,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
  }).catch(() => undefined)
  throw error
}
finally {
  if (browser)
    await browser.close()
  if (daemon) {
    daemon.kill('SIGTERM')
    await daemon.exited.catch(() => undefined)
    await writeEvidence('daemon-stdout.log', await new Response(daemon.stdout).text().catch(() => ''))
    await writeEvidence('daemon-stderr.log', await new Response(daemon.stderr).text().catch(() => ''))
  }
  stubServer?.stop(true)
  await rm(workRoot, { force: true, recursive: true })
}

// --- helpers ---

async function createByokWorkspaceAndSession(page: Page): Promise<void> {
  const main = page.getByRole('region', { name: 'Soul workspaces and sessions' })
  if (await main.getByRole('button', { name: 'Create worker' }).count() !== 0)
    throw new Error('Worker Workbench exposed a create-worker flow; BYOK chat proof must start from the bound Worker.')

  await main.getByRole('button', { name: 'Create workspace' }).click()
  const workspaceDialog = page.getByRole('dialog', { name: 'Create workspace' })
  await workspaceDialog.getByLabel('Workspace name').fill('BYOK chat workspace')
  await workspaceDialog.getByTestId('create-project').click()

  await page.waitForURL(/\/workers\/[^/]+\/workspaces\/[^/]+$/, { timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  await main.getByText('No sessions in this workspace yet.').waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  const firstMessage = 'BYOK stub: produce a test response.'
  await main.locator('[data-session-slot="composer-input"]').fill(firstMessage)
  await main.locator('button[type="submit"]').click()
  await page.waitForURL(/\/workers\/[^/]+\/workspaces\/[^/]+\/sessions\/[^/]+$/, { timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  await page.getByText(firstMessage).waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  // BYOK response — stub answer, not fake codex 'Done.'.
  // Capture state before waiting so we can diagnose failures.
  await page.screenshot({ fullPage: true, path: join(evidenceRoot, 'pre-stub-wait.png') })
  await page.getByText(STUB_ANSWER).first().waitFor({ state: 'visible', timeout: 40_000 })
}

function runCliJson<T = unknown>(...args: string[]): T {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'apps/worker-cli/src/aiworker.ts', ...args],
    cwd: repoRoot,
    env: baseEnv,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const stdout = Buffer.from(result.stdout).toString('utf8')
  const stderr = Buffer.from(result.stderr).toString('utf8')
  if (result.exitCode !== 0) {
    throw new Error([
      `CLI command failed: aiworker ${args.join(' ')}`,
      `exit=${result.exitCode}`,
      `stdout=${stdout}`,
      `stderr=${stderr}`,
    ].join('\n'))
  }
  return JSON.parse(stdout) as T
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

async function waitForHealth(baseUrl: string): Promise<unknown> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok)
        return await response.json()
      lastError = new Error(`health status ${response.status}`)
    }
    catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`daemon did not become healthy: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function readLocalApi(page: Page, path: string): Promise<{ body: Record<string, unknown>, status: number }> {
  return await page.evaluate(async (apiPath) => {
    const response = await fetch(apiPath)
    const text = await response.text()
    return {
      body: JSON.parse(text) as Record<string, unknown>,
      status: response.status,
    }
  }, path)
}

async function waitForSessionProof(
  page: Page,
  routeIds: { sessionId: string, workerId: string, workspaceId: string },
  minSucceededInvocations: number,
): Promise<{ body: Record<string, unknown>, status: number }> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const proof = await readLocalApi(page, `/api/sessions/${routeIds.sessionId}`)
    try {
      assertSessionProof(proof, routeIds, { minSucceededInvocations })
      return proof
    }
    catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Session proof did not settle: ${String(lastError)}`)
}

function readRouteIds(pathname: string): { sessionId: string, workerId: string, workspaceId: string } {
  const match = pathname.match(/^\/workers\/([^/]+)\/workspaces\/([^/]+)\/sessions\/([^/]+)$/)
  if (!match)
    throw new Error(`Expected worker/workspace/session route, got ${pathname}`)
  return {
    sessionId: decodeURIComponent(match[3]!),
    workerId: decodeURIComponent(match[1]!),
    workspaceId: decodeURIComponent(match[2]!),
  }
}

function assertSessionProof(
  proof: { body: Record<string, unknown>, status: number },
  routeIds: { sessionId: string, workerId: string, workspaceId: string },
  options: { minSucceededInvocations?: number } = {},
): void {
  const minSucceededInvocations = options.minSucceededInvocations ?? 1
  if (proof.status !== 200)
    throw new Error(`Session proof failed with ${proof.status}: ${JSON.stringify(proof.body)}`)
  const session = readRecord(proof.body.session)
  const invocations = Array.isArray(proof.body.invocations) ? proof.body.invocations : []
  if (session.id !== routeIds.sessionId || session.workerId !== routeIds.workerId || session.workspaceId !== routeIds.workspaceId)
    throw new Error(`Session proof returned the wrong locator: ${JSON.stringify(proof.body)}`)
  if (invocations.length < minSucceededInvocations)
    throw new Error(`BYOK chat proof created ${invocations.length} invocation(s), expected at least ${minSucceededInvocations}: ${JSON.stringify(proof.body)}`)
  if (!invocations.every(inv => isRecord(inv) && inv.sessionId === routeIds.sessionId && inv.status === 'succeeded'))
    throw new Error(`BYOK chat proof invocations not all session-scoped/succeeded: ${JSON.stringify(proof.body)}`)
  // Literal key value must never appear in the serialized session response.
  const serialized = JSON.stringify(proof.body)
  if (serialized.includes(STUB_API_KEY_ENV_VALUE))
    throw new Error(`Literal API key value appeared in session API response: "${STUB_API_KEY_ENV_VALUE}"`)
}

async function writeEvidence(name: string, value: unknown): Promise<void> {
  const path = join(evidenceRoot, name)
  const content = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`
  await writeFile(path, content)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value))
    throw new Error(`Expected object, got ${JSON.stringify(value)}`)
  return value
}
