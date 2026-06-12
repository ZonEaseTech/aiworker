import type { Page } from 'playwright'
import { Buffer } from 'node:buffer'
import { mkdirSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright'
import { closeWorkerDb, createEngineInvocation, initWorkerDb, upsertFile, upsertWorkerConfigValue } from '../../packages/storage-sqlite/src/worker/index'
import { WORKBENCH_RENDER_TIMEOUT_MS } from './workbench-render-wait'

const repoRoot = join(import.meta.dir, '..', '..')
const appId = 'aiworker-freeform'
const workerId = 'freeform-cli-golden-worker'
const cancelInvocationId = 'freeform-browser-cancel-invocation'
const reconcileInvocationId = 'freeform-browser-reconcile-invocation'
const descriptorPath = join(repoRoot, 'souls/aiworker-freeform/dist/soul.descriptor.json')
const evidenceRoot = join(repoRoot, 'tmp', `freeform-cli-golden-path-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const workRoot = await mkdtemp(join(tmpdir(), 'aiworker-freeform-browser-golden-'))
const aiworkerHome = join(workRoot, 'home')
const dbPath = join(aiworkerHome, 'aiworker.db')
const binDir = join(workRoot, 'bin')
const baseEnv = {
  ...process.env,
  AIWORKER_HOME: aiworkerHome,
  PATH: `${binDir}:${process.env.PATH ?? ''}`,
  WORKER_DB_PATH: dbPath,
}
// `worker create` is fleet-aware: it builds the worker in its own per-worker home
// under `<AIWORKER_HOME>/workers/<id>` and the CLI runtime commands reach it via the
// fleet fallback in `ensureRuntime`. The worker/workspace/session therefore live in
// the sub-home DB (derived purely from home, ignoring WORKER_DB_PATH), so the
// daemon + the seed helpers must target the SAME sub-home to observe them. The CLI
// commands keep running with `baseEnv` (root home) on purpose — that is what forces
// `workspace create`/`session` through the fleet fallback this test exercises.
const subHome = join(aiworkerHome, 'workers', workerId)
const subDbPath = join(subHome, 'aiworker.db')
const daemonEnv = {
  ...baseEnv,
  AIWORKER_HOME: subHome,
  WORKER_DB_PATH: subDbPath,
}
const cliOutputs: Record<string, unknown> = {}
const browserEvents: string[] = []

await mkdir(evidenceRoot, { recursive: true })
await writeFakeCodexCommand()

let daemon: ReturnType<typeof Bun.spawn> | null = null
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

try {
  cliOutputs.install = runCliJson('app', 'install', descriptorPath)
  cliOutputs.enable = runCliJson('app', 'enable', appId)
  cliOutputs.worker = runCliJson(
    'worker',
    'create',
    workerId,
    '--name',
    'Freeform CLI Golden Worker',
    '--app',
    appId,
  )
  const workspaceResult = runCliJson<{ workspace: { id: string, rootPath: string } }>(
    'workspace',
    'create',
    '--worker',
    workerId,
    '--name',
    'Freeform CLI Golden Workspace',
    '--type',
    'freeform',
  )
  cliOutputs.workspace = workspaceResult
  const sessionResult = runCliJson<{ invocation: { id: string, inputRef: string, status: string }, session: { id: string } }>(
    'session',
    'start',
    '--worker',
    workerId,
    '--workspace',
    workspaceResult.workspace.id,
    '--title',
    'Freeform CLI browser golden path',
    '--input',
    'Start the Freeform CLI browser golden path.',
  )
  cliOutputs.sessionStart = sessionResult
  // `session invoke --session <id>` looks the session up via getSession against the
  // CLI's current home BEFORE ensureRuntime resolves a worker — there is no
  // worker id on this command to trigger the fleet fallback. The session genuinely
  // lives in the worker's per-worker home, so run this follow-up against that home
  // (the same home the daemon + browser ops use), matching the per-worker-daemon
  // model. worker/workspace/session creation above stay on the root home on purpose
  // to exercise ensureRuntime's fleet fallback.
  const followUpResult = runCliJsonWithEnv<{ invocation: { id: string, inputRef: string, sessionId: string, status: string } }>(
    daemonEnv,
    'session',
    'invoke',
    '--session',
    sessionResult.session.id,
    '--input',
    'Continue the Freeform CLI browser golden path.',
  )
  cliOutputs.followUp = followUpResult

  if (sessionResult.invocation.status !== 'succeeded')
    throw new Error(`CLI first invocation did not succeed: ${JSON.stringify(sessionResult)}`)
  if (sessionResult.invocation.inputRef !== `aiworker://sessions/${sessionResult.session.id}/invocations/${sessionResult.invocation.id}/input`)
    throw new Error(`Session start did not use session-level invocation inputRef: ${JSON.stringify(sessionResult.invocation)}`)
  if ('turn' in sessionResult)
    throw new Error(`session start returned legacy turn payload: ${JSON.stringify(sessionResult)}`)
  if (followUpResult.invocation.status !== 'succeeded')
    throw new Error(`CLI session-level follow-up invocation did not succeed: ${JSON.stringify(followUpResult)}`)
  if (followUpResult.invocation.inputRef !== `aiworker://sessions/${sessionResult.session.id}/invocations/${followUpResult.invocation.id}/input`)
    throw new Error(`Follow-up did not use session-level invocation inputRef: ${JSON.stringify(followUpResult.invocation)}`)

  seedInvocationsForBrowserEngineActions(sessionResult.session.id)
  seedWorkbenchFixtures(workspaceResult.workspace.id)

  // reservePort() frees the OS-assigned port before this child binds it, so under concurrent
  // load another process can grab it first (EADDRINUSE -> daemon never becomes healthy ->
  // "Unable to connect"). Retry the whole spawn on a fresh port to close that TOCTOU race.
  let baseUrl = ''
  let health: unknown = null
  for (let attempt = 0; ; attempt += 1) {
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
      env: daemonEnv,
      stderr: 'pipe',
      stdout: 'pipe',
    })
    baseUrl = `http://127.0.0.1:${port}`
    try {
      health = await waitForHealth(baseUrl)
      break
    }
    catch (error) {
      daemon?.kill()
      if (attempt >= 3)
        throw error
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  // Populate engine targets: the daemon's rescan scans the fake codex on PATH so
  // the Workbench has a ready engine target for the live session chat.
  await fetch(`${baseUrl}/api/engine/targets/rescan`, { method: 'POST' })
  // Materialise a workspace projection receipt so the Workbench can refresh and
  // observe a 'found' worker-overlay projection receipt.
  await fetch(`${baseUrl}/api/projections/codex/refresh`, {
    body: JSON.stringify({ workerId, workspaceId: workspaceResult.workspace.id }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.on('console', message => browserEvents.push(`console:${message.type()}:${message.text()}`))
  page.on('pageerror', error => browserEvents.push(`pageerror:${error.message}`))
  page.on('requestfailed', request => browserEvents.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? 'unknown'}`))

  // Standalone worker-owned flow: the Worker Workbench opens with Host absent on a
  // worker/workspace/session locator and renders the session chat DIRECTLY in
  // worker-web. There is no micro-app and no /api/mount/workbench.
  const routeUrl = `${baseUrl}/workers/${workerId}/workspaces/${workspaceResult.workspace.id}/sessions/${sessionResult.session.id}`
  await page.goto(routeUrl, { waitUntil: 'domcontentloaded' })

  // The worker-owned chat surface renders directly in worker-web (ChatSurface →
  // ChatComposer + ChatTranscript), marked by `data-chat-surface="true"`. There is
  // no `<micro-app>` element anywhere in the document.
  const chatSurface = page.locator('[data-chat-surface="true"]')
  await chatSurface.waitFor({ state: 'attached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  const microAppCount = await page.locator('micro-app').count()
  if (microAppCount !== 0)
    throw new Error(`Worker Workbench rendered an unexpected micro-app (${microAppCount}); v1 has no micro-app, the Worker renders chat directly.`)

  // The ChatTranscript (ChatThread) renders directly in the page light DOM — the
  // transcript log slot must be present without any micro-app shadow root.
  const transcriptLog = page.locator('[data-transcript-slot="chat-thread"]')
  await transcriptLog.waitFor({ state: 'attached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  // The employee starts a session-level follow-up from browser context: this
  // exercises POST /api/sessions/:sessionId/invocations directly from the rendered
  // Workbench, proving the worker-owned chat drives real invocations.
  const browserSessionFollowUpProof = await readSessionFollowUpProofFromBrowser(page, sessionResult.session.id)
  assertBrowserSessionFollowUpProof(browserSessionFollowUpProof, sessionResult.session.id)
  const browserFollowUpInvocationId = String(readRecord(browserSessionFollowUpProof.invocation).id)

  // Bridge events stream into the chat: the follow-up invocation's bridge events
  // are readable + reattachable, and carry the opaque external session ref. These
  // are the bridge event refs the session chat shows.
  const invocationEventProof = await readInvocationEventProofFromBrowser(page, browserFollowUpInvocationId)
  assertInvocationEventProof(invocationEventProof, browserFollowUpInvocationId)
  const invocationExternalSessionRefProof = await readInvocationExternalSessionRefProofFromBrowser(page, browserFollowUpInvocationId)
  assertInvocationExternalSessionRefProof(invocationExternalSessionRefProof, browserFollowUpInvocationId)

  // Drive the live engine loop through the rendered composer: type a message and
  // submit it. The chat surface echoes the submission as a `user-message` transcript
  // turn (proves composer → ChatThread) and renders engine-streamed transcript
  // turns mapped from the invocation's bridge events (proves broker → mapper →
  // ChatThread). Both render directly in the page — no micro-app shadow root.
  // browser-box-only: the composer textarea + submit-button (type="submit", rendered
  // by packages/ui SessionComposer) are driven live; they cannot be confirmed
  // without a browser.
  const composerMessage = 'Stream a follow-up turn from the worker Workbench chat.'
  await chatSurface.locator('textarea').first().fill(composerMessage)
  await chatSurface.locator('button[type="submit"]').first().click()
  const transcript = await page.evaluate(async (needle) => {
    // Any rendered transcript turn slot proves the chat surface mapped the
    // invocation into the ChatThread. The user-message slot echoes the composer
    // text; transcript-turn / status-message come from mapped bridge events.
    const streamedSlots = ['transcript-turn', 'status-message']
    const deadline = Date.now() + 8000
    let userText: null | string = null
    let userTexts: string[] = []
    let slots: string[] = []
    while (Date.now() < deadline) {
      const query = (selector: string) => document.querySelector(selector)
      userTexts = Array.from(document.querySelectorAll('[data-transcript-slot="user-message"]')).map(node => (node.textContent ?? '').trim())
      userText = userTexts.find(text => text.includes(needle)) ?? null
      slots = streamedSlots.filter(slot => query(`[data-transcript-slot="${slot}"]`))
      if (userText?.includes(needle) && slots.length > 0)
        return { slots, userText, userTexts }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return { slots, userText, userTexts }
  }, composerMessage)
  if (transcript.userText === null || !transcript.userText.includes(composerMessage))
    throw new Error(`Worker Workbench chat did not render the composer's user message. got=${JSON.stringify(transcript.userTexts)}`)
  if (transcript.slots.length === 0)
    throw new Error(`Worker Workbench chat rendered no engine transcript turn (transcript-turn/status-message) from the invocation, only the echoed user message.`)

  assertNoUnexpectedBrowserEvents(browserEvents)

  // Cancel a queued invocation without changing session lifecycle.
  const invocationCancelProof = await readInvocationCancelProofFromBrowser(page, cancelInvocationId)
  assertInvocationCancelProof(invocationCancelProof, cancelInvocationId, sessionResult.session.id)

  // Reattach and reconcile engine bridge events.
  const invocationReconcileProof = await readInvocationReconcileProofFromBrowser(page, reconcileInvocationId)
  assertInvocationReconcileProof(invocationReconcileProof, reconcileInvocationId, sessionResult.session.id)

  // Refresh projection receipts from the Workbench and observe a found
  // worker-overlay projection receipt.
  const projectionRefreshProof = await readProjectionRefreshProofFromBrowser(page, workerId, workspaceResult.workspace.id)
  assertProjectionRefreshProof(projectionRefreshProof, workspaceResult.workspace.id)

  // Archive the session and reject a follow-up on the archived session.
  const sessionArchiveProof = await readSessionArchiveProofFromBrowser(page, sessionResult.session.id)
  assertSessionArchiveProof(sessionArchiveProof, sessionResult.session.id)

  // Archive workspace from browser context without driving Worker archive from the Workbench.
  const workspaceLifecycleProof = await readWorkspaceLifecycleProofFromBrowser(page, workerId, workspaceResult.workspace.id)
  assertWorkspaceLifecycleProof(workspaceLifecycleProof, workerId, workspaceResult.workspace.id)

  await page.screenshot({ fullPage: true, path: join(evidenceRoot, 'freeform-cli-golden-path.png') })
  await writeEvidence('golden-path.json', {
    baseUrl,
    browserEvents,
    cliOutputs,
    health,
    chatSurfaceRendered: true,
    microAppCount,
    transcript,
    browserSessionFollowUpProof,
    invocationCancelProof,
    invocationEventProof,
    invocationExternalSessionRefProof,
    invocationReconcileProof,
    projectionRefreshProof,
    workspaceLifecycleProof,
    sessionArchiveProof,
    routeUrl,
  })
}
catch (error) {
  await writeEvidence('failure.json', {
    browserEvents,
    cliOutputs,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
  })
  throw error
}
finally {
  if (browser)
    await browser.close()
  if (daemon) {
    daemon.kill('SIGTERM')
    await daemon.exited.catch(() => undefined)
    await writeEvidence('daemon-stdout.log', await new Response(daemon.stdout).text())
    await writeEvidence('daemon-stderr.log', await new Response(daemon.stderr).text())
  }
  await rm(workRoot, { force: true, recursive: true })
}

function runCliJson<T = unknown>(...args: string[]): T {
  return runCliJsonWithEnv<T>(baseEnv, ...args)
}

// Run a CLI command under an explicit env (home). Defaults to the root home via
// `runCliJson`; session-targeting commands that resolve a per-worker-home session
// run under `daemonEnv` so getSession finds the row before ensureRuntime.
function runCliJsonWithEnv<T = unknown>(env: Record<string, string | undefined>, ...args: string[]): T {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'apps/worker-cli/src/aiworker.ts', ...args],
    cwd: repoRoot,
    env,
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

function seedInvocationsForBrowserEngineActions(sessionId: string): void {
  initWorkerDb(subDbPath)
  try {
    createEngineInvocation({
      engineCommand: 'codex',
      engineId: 'codex',
      id: cancelInvocationId,
      inputRef: `aiworker://sessions/${sessionId}/invocations/${cancelInvocationId}/input`,
      processState: 'not_spawned',
      seq: 3,
      sessionId,
      status: 'queued',
    })
    createEngineInvocation({
      engineCommand: 'codex',
      engineId: 'codex',
      id: reconcileInvocationId,
      inputRef: `aiworker://sessions/${sessionId}/invocations/${reconcileInvocationId}/input`,
      processState: 'spawned',
      seq: 4,
      sessionId,
      status: 'running',
    })
  }
  finally {
    closeWorkerDb()
  }
}

function seedWorkbenchFixtures(workspaceId: string): void {
  initWorkerDb(subDbPath)
  try {
    // Session artifacts are a workspace dimension (the invocation result never
    // carries files), so seed a workspace file the Workbench artifact strip renders.
    upsertFile({ id: 'workbench-artifact-report', kind: 'generated', path: 'output/report.md', size: 128, source: 'session', workspaceId })
    // A worker config value the Workbench configuration summary module renders.
    upsertWorkerConfigValue({
      configKey: 'engine-selection',
      configValueJson: {
        checksum: 'sha256:engine-selection',
        enabled: true,
        kind: 'engine-selection',
        options: {},
        sourceRef: 'descriptor://configuration/default-engine',
        target: 'codex',
        updatedAt: '2026-06-01T00:00:00.000Z',
        updatedBy: 'web',
      },
      source: 'web',
      workerId,
    })
  }
  finally {
    closeWorkerDb()
  }
}

async function writeFakeCodexCommand(): Promise<void> {
  mkdirSync(binDir, { recursive: true })
  const commandPath = join(binDir, 'codex')
  const counterPath = shellSingleQuote(join(workRoot, 'codex-thread-counter'))
  const shCounter = '$' + '{counter}'
  const shThreadSeq = '$' + '{thread_seq}'
  await writeFile(commandPath, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'cat >/dev/null',
    `counter=${counterPath}`,
    'thread_seq=1',
    `if [ -f "${shCounter}" ]; then thread_seq=$(( $(cat "${shCounter}") + 1 )); fi`,
    `printf '%s' "${shThreadSeq}" > "${shCounter}"`,
    `printf '%s\\n' "{\\"type\\":\\"thread.started\\",\\"thread_id\\":\\"native-thread-${shThreadSeq}\\"}"`,
    'printf \'%s\\n\' \'{"type":"turn.started"}\'',
    'printf \'%s\\n\' \'{"type":"item.started","item":{"type":"command_execution","id":"tool-1","command":"printf bridge"}}\'',
    'printf \'%s\\n\' \'{"type":"item.completed","item":{"type":"command_execution","id":"tool-1","command":"printf bridge","aggregated_output":"bridge","exit_code":0}}\'',
    'printf \'%s\\n\' \'{"type":"item.completed","item":{"type":"agent_message","text":"Done."}}\'',
    'printf \'%s\\n\' \'{"type":"turn.completed","usage":{"input_tokens":3,"output_tokens":5}}\'',
    '',
  ].join('\n'))
  await chmod(commandPath, 0o755)
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
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

async function readInvocationEventProofFromBrowser(page: Page, invocationId: string): Promise<Record<string, unknown>> {
  return await page.evaluate(async (id) => {
    const response = await fetch(`/api/engine/invocations/${id}/events?after=0&limit=20`)
    const body = await response.text()
    if (!response.ok)
      throw new Error(`invocation events request failed ${response.status}: ${body}`)
    const proof = JSON.parse(body) as Record<string, unknown>
    const events = Array.isArray(proof.events) ? proof.events : []
    const firstEvent = events.find(event =>
      event && typeof event === 'object' && 'id' in event && typeof event.id === 'number',
    ) as { id: number } | undefined
    const reattachResponse = await fetch(`/api/engine/invocations/${id}/events?after=${firstEvent?.id ?? 0}&limit=20`)
    const reattachBody = await reattachResponse.text()
    if (!reattachResponse.ok)
      throw new Error(`invocation event reattach request failed ${reattachResponse.status}: ${reattachBody}`)
    return {
      ...proof,
      reattachCursor: firstEvent?.id ?? 0,
      reattached: JSON.parse(reattachBody) as Record<string, unknown>,
    }
  }, invocationId)
}

async function readSessionFollowUpProofFromBrowser(page: Page, sessionId: string): Promise<Record<string, unknown>> {
  return await page.evaluate(async (id) => {
    const response = await fetch(`/api/sessions/${id}/invocations`, {
      body: JSON.stringify({ input: 'Continue the Freeform browser golden path from Host Web.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const body = await response.text()
    if (!response.ok)
      throw new Error(`browser session follow-up request failed ${response.status}: ${body}`)
    return JSON.parse(body) as Record<string, unknown>
  }, sessionId)
}

function assertBrowserSessionFollowUpProof(proof: Record<string, unknown>, sessionId: string): void {
  const invocation = readRecord(proof.invocation)
  const session = readRecord(proof.session)
  if (session.id !== sessionId)
    throw new Error(`Browser session follow-up returned the wrong session: ${JSON.stringify(proof)}`)
  if (invocation.sessionId !== sessionId)
    throw new Error(`Browser session follow-up returned the wrong invocation session: ${JSON.stringify(proof)}`)
  if (invocation.status !== 'succeeded')
    throw new Error(`Browser session follow-up invocation did not succeed: ${JSON.stringify(proof)}`)
  if (invocation.inputRef !== `aiworker://sessions/${sessionId}/invocations/${invocation.id}/input`)
    throw new Error(`Browser session follow-up did not use session-level inputRef: ${JSON.stringify(proof)}`)
  if (!Array.isArray(proof.events) || proof.events.length === 0)
    throw new Error(`Browser session follow-up missed invocation events: ${JSON.stringify(proof)}`)

  const serialized = JSON.stringify(proof)
  for (const forbidden of ['/turns/', '"turn"', 'sk-', 'literal-secret-value']) {
    if (serialized.includes(forbidden))
      throw new Error(`Browser session follow-up exposed forbidden content ${forbidden}: ${serialized}`)
  }
}

async function readInvocationExternalSessionRefProofFromBrowser(page: Page, invocationId: string): Promise<Record<string, unknown>> {
  return await page.evaluate(async (id) => {
    const response = await fetch(`/api/engine/invocations/${id}`)
    const body = await response.text()
    if (!response.ok)
      throw new Error(`invocation read request failed ${response.status}: ${body}`)
    return JSON.parse(body) as Record<string, unknown>
  }, invocationId)
}

function assertInvocationEventProof(proof: Record<string, unknown>, invocationId: string): void {
  if (proof.invocationId !== invocationId)
    throw new Error(`Invocation event proof returned the wrong invocation: ${JSON.stringify(proof)}`)

  const bridgeEvents = Array.isArray(proof.bridgeEvents) ? proof.bridgeEvents : []
  const storedEvents = Array.isArray(proof.events) ? proof.events : []
  const reattachCursor = typeof proof.reattachCursor === 'number' ? proof.reattachCursor : null
  const reattached = readRecord(proof.reattached)
  const reattachedBridgeEvents = Array.isArray(reattached.bridgeEvents) ? reattached.bridgeEvents : []
  const reattachedStoredEvents = Array.isArray(reattached.events) ? reattached.events : []
  if (bridgeEvents.length === 0)
    throw new Error(`Invocation event proof did not include bridge events: ${JSON.stringify(proof)}`)
  if (!bridgeEvents.every(event => isRecord(event) && event.invocationId === invocationId))
    throw new Error(`Invocation event proof leaked events for another invocation: ${JSON.stringify(proof)}`)
  if (!storedEvents.every(event => isRecord(event) && event.invocationId === invocationId))
    throw new Error(`Stored invocation events were not invocation-scoped: ${JSON.stringify(proof)}`)
  if (reattachCursor === null)
    throw new Error(`Invocation event proof missed reattach cursor: ${JSON.stringify(proof)}`)
  if (reattached.invocationId !== invocationId)
    throw new Error(`Reattached invocation event proof returned the wrong invocation: ${JSON.stringify(proof)}`)
  if (reattached.after !== reattachCursor)
    throw new Error(`Reattached invocation event proof returned the wrong cursor: ${JSON.stringify(proof)}`)
  if (!reattachedBridgeEvents.every(event => isRecord(event) && event.invocationId === invocationId))
    throw new Error(`Reattached invocation events leaked another invocation: ${JSON.stringify(proof)}`)
  if (!reattachedStoredEvents.every(event => isRecord(event) && event.invocationId === invocationId))
    throw new Error(`Reattached stored events were not invocation-scoped: ${JSON.stringify(proof)}`)
  if (!reattachedStoredEvents.every(event => isRecord(event) && typeof event.id === 'number' && event.id > reattachCursor))
    throw new Error(`Reattached stored events did not resume after the cursor: ${JSON.stringify(proof)}`)

  const bridgeEventTypes = bridgeEvents
    .filter(isRecord)
    .map(event => event.type)
  if (!bridgeEventTypes.includes('invocation.output.delta') && !bridgeEventTypes.includes('invocation.completed'))
    throw new Error(`Invocation event proof missed normalized bridge output/completion events: ${JSON.stringify(proof)}`)
  if (!bridgeEventTypes.includes('invocation.tool.observed'))
    throw new Error(`Invocation event proof missed normalized tool observation events: ${JSON.stringify(proof)}`)
  if (!bridgeEventTypes.includes('invocation.usage.observed'))
    throw new Error(`Invocation event proof missed normalized usage observation events: ${JSON.stringify(proof)}`)
  const outputEvent = bridgeEvents.filter(isRecord).find(event => event.type === 'invocation.output.delta')
  if (!isRecord(outputEvent?.data) || outputEvent.data.text !== 'Done.')
    throw new Error(`Invocation event proof missed normalized output text: ${JSON.stringify(proof)}`)
  const toolPhases = bridgeEvents
    .filter(isRecord)
    .filter(event => event.type === 'invocation.tool.observed' && isRecord(event.tool))
    .map(event => readRecord(event.tool).phase)
  if (!toolPhases.includes('use') || !toolPhases.includes('result'))
    throw new Error(`Invocation event proof missed tool use/result phases: ${JSON.stringify(proof)}`)
  const usageEvent = bridgeEvents.filter(isRecord).find(event => event.type === 'invocation.usage.observed')
  const usage = isRecord(usageEvent?.usage) ? usageEvent.usage : null
  if (usage?.inputTokens !== 3 || usage.outputTokens !== 5 || usage.costUsd !== null)
    throw new Error(`Invocation event proof missed normalized usage values: ${JSON.stringify(proof)}`)
  const reattachedIds = reattachedStoredEvents
    .filter(isRecord)
    .map(event => event.id)
    .filter((id): id is number => typeof id === 'number')
  const lastReattachedId = Math.max(...reattachedIds, reattachCursor)
  if (typeof reattached.nextAfter !== 'number' || reattached.nextAfter < lastReattachedId)
    throw new Error(`Reattached invocation event proof returned an invalid next cursor: ${JSON.stringify(proof)}`)

  const serialized = JSON.stringify(proof)
  if (serialized.includes('/turns/') || serialized.includes('"turn"'))
    throw new Error(`Invocation event proof exposed retired turn semantics: ${serialized}`)
}

function assertInvocationExternalSessionRefProof(proof: Record<string, unknown>, invocationId: string): void {
  const invocation = readRecord(proof.invocation)
  if (invocation.id !== invocationId)
    throw new Error(`Invocation external ref proof returned the wrong invocation: ${JSON.stringify(proof)}`)
  const externalSessionRef = typeof invocation.externalSessionRef === 'string' ? invocation.externalSessionRef : ''
  if (!externalSessionRef)
    throw new Error(`Invocation external ref proof missed externalSessionRef: ${JSON.stringify(proof)}`)
  const ref = readRecord(JSON.parse(externalSessionRef))
  if (ref.target !== 'codex' || typeof ref.id !== 'string' || !ref.id.startsWith('native-thread-'))
    throw new Error(`Invocation external ref proof returned a non-Codex ref: ${JSON.stringify(proof)}`)
  if (JSON.stringify(readRecord(invocation.metadataJson).externalSessionRef) !== JSON.stringify(ref))
    throw new Error(`Invocation external ref proof missed matching metadata ref: ${JSON.stringify(proof)}`)

  const serialized = JSON.stringify(proof)
  for (const forbidden of ['/turns/', '"turn"', 'sk-', 'literal-secret-value']) {
    if (serialized.includes(forbidden))
      throw new Error(`Invocation external ref proof exposed forbidden content ${forbidden}: ${serialized}`)
  }
}

async function readProjectionRefreshProofFromBrowser(page: Page, workerId: string, workspaceId: string): Promise<Record<string, unknown>> {
  return await page.evaluate(async ({ workerId, workspaceId }) => {
    const skillConfigResponse = await fetch(`/api/workers/${workerId}/config/skill-overlay%3Afreeform-session`, {
      body: JSON.stringify({
        checksum: 'sha256:freeform-browser-overlay',
        enabled: true,
        kind: 'skill-overlay',
        options: {
          replaces: 'descriptor://engine/skills/freeform-session',
        },
        sourceRef: 'descriptor://engine/skills/freeform-session',
        target: 'codex',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    const skillConfigBody = await skillConfigResponse.text()
    const entryFileConfigResponse = await fetch(`/api/workers/${workerId}/config/entry-file-overlay%3Acontext`, {
      body: JSON.stringify({
        checksum: 'sha256:freeform-browser-entry-file-overlay',
        enabled: true,
        kind: 'entry-file-overlay',
        options: {
          targetPath: 'CONTEXT.md',
        },
        sourceRef: 'descriptor://engine/workspaceAssets/AGENTS.md',
        target: 'all',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    const entryFileConfigBody = await entryFileConfigResponse.text()
    const mcpConfigResponse = await fetch(`/api/workers/${workerId}/config/mcp-overlay%3Acodex`, {
      body: JSON.stringify({
        checksum: 'sha256:freeform-browser-mcp-overlay',
        enabled: true,
        kind: 'mcp-overlay',
        options: {
          replaces: 'descriptor://engine/mcp/codex',
        },
        sourceRef: 'descriptor://engine/mcp/codex',
        target: 'codex',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    const mcpConfigBody = await mcpConfigResponse.text()
    const refreshResponse = await fetch('/api/projections/codex/refresh', {
      body: JSON.stringify({ workerId, workspaceId }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const refreshBody = await refreshResponse.text()
    const receiptResponse = await fetch(`/api/projections/receipts/${workspaceId}`)
    const receiptBody = await receiptResponse.text()
    return {
      entryFileConfig: {
        body: JSON.parse(entryFileConfigBody) as Record<string, unknown>,
        status: entryFileConfigResponse.status,
      },
      mcpConfig: {
        body: JSON.parse(mcpConfigBody) as Record<string, unknown>,
        status: mcpConfigResponse.status,
      },
      receipt: {
        body: JSON.parse(receiptBody) as Record<string, unknown>,
        status: receiptResponse.status,
      },
      refresh: {
        body: JSON.parse(refreshBody) as Record<string, unknown>,
        status: refreshResponse.status,
      },
      skillConfig: {
        body: JSON.parse(skillConfigBody) as Record<string, unknown>,
        status: skillConfigResponse.status,
      },
    }
  }, { workerId, workspaceId })
}

function assertProjectionRefreshProof(proof: Record<string, unknown>, workspaceId: string): void {
  const entryFileConfig = readRecord(proof.entryFileConfig)
  const mcpConfig = readRecord(proof.mcpConfig)
  const refresh = readRecord(proof.refresh)
  const receipt = readRecord(proof.receipt)
  const skillConfig = readRecord(proof.skillConfig)
  if (skillConfig.status !== 200 || entryFileConfig.status !== 200 || mcpConfig.status !== 200)
    throw new Error(`Worker config overlay writes failed in browser proof: ${JSON.stringify(proof)}`)
  if (refresh.status !== 200)
    throw new Error(`Projection refresh failed in browser proof: ${JSON.stringify(proof)}`)
  if (receipt.status !== 200)
    throw new Error(`Projection receipt read failed in browser proof: ${JSON.stringify(proof)}`)

  const savedConfigs = [
    readRecord(readRecord(skillConfig.body).config),
    readRecord(readRecord(entryFileConfig.body).config),
    readRecord(readRecord(mcpConfig.body).config),
  ]
  const savedValuesByKey = new Map(savedConfigs.map(config => [config.configKey, readRecord(config.value)]))
  const savedSkillValue = savedValuesByKey.get('skill-overlay:freeform-session')
  const savedEntryFileValue = savedValuesByKey.get('entry-file-overlay:context')
  const savedMcpValue = savedValuesByKey.get('mcp-overlay:codex')
  if (!savedSkillValue || !savedEntryFileValue || !savedMcpValue)
    throw new Error(`Worker config overlay proof missed config keys: ${JSON.stringify(proof)}`)
  if (savedSkillValue.kind !== 'skill-overlay' || savedSkillValue.target !== 'codex' || savedSkillValue.updatedBy !== 'web')
    throw new Error(`Skill overlay proof missed SDK-standard envelope fields: ${JSON.stringify(proof)}`)
  if (savedEntryFileValue.kind !== 'entry-file-overlay' || savedEntryFileValue.target !== 'all' || savedEntryFileValue.updatedBy !== 'web')
    throw new Error(`Entry-file overlay proof missed SDK-standard envelope fields: ${JSON.stringify(proof)}`)
  if (savedMcpValue.kind !== 'mcp-overlay' || savedMcpValue.target !== 'codex' || savedMcpValue.updatedBy !== 'web')
    throw new Error(`MCP overlay proof missed SDK-standard envelope fields: ${JSON.stringify(proof)}`)

  const refreshReceipt = readRecord(readRecord(readRecord(refresh.body).projection).receipt)
  const readBackReceipt = readRecord(readRecord(receipt.body).receipt)
  for (const candidate of [refreshReceipt, readBackReceipt]) {
    const projections = Array.isArray(candidate.projections) ? candidate.projections : []
    const hasWorkerOverlaySkill = projections.some(item =>
      isRecord(item)
      && item.engineTarget === 'codex'
      && item.kind === 'native-skill'
      && item.source === 'worker-overlay'
      && item.target === '.agents/skills/aiworker-freeform-freeform-session/SKILL.md',
    )
    const hasWorkerOverlayEntryFile = projections.some(item =>
      isRecord(item)
      && item.kind === 'workspace-file'
      && item.source === 'worker-overlay'
      && item.target === 'CONTEXT.md',
    )
    const hasWorkerOverlayMcp = projections.some(item =>
      isRecord(item)
      && item.engineTarget === 'codex'
      && item.kind === 'mcp-client'
      && item.source === 'worker-overlay'
      && item.target === '.codex/config.toml',
    )
    if (!hasWorkerOverlaySkill)
      throw new Error(`Projection proof missed worker-overlay native skill receipt entry: ${JSON.stringify(proof)}`)
    if (!hasWorkerOverlayEntryFile)
      throw new Error(`Projection proof missed worker-overlay entry-file receipt entry: ${JSON.stringify(proof)}`)
    if (!hasWorkerOverlayMcp)
      throw new Error(`Projection proof missed worker-overlay MCP receipt entry: ${JSON.stringify(proof)}`)
  }
  if (readRecord(receipt.body).receiptId !== workspaceId)
    throw new Error(`Projection receipt proof returned the wrong receipt id: ${JSON.stringify(proof)}`)

  const serialized = JSON.stringify(proof)
  for (const forbidden of ['/turns/', '"turn"', 'sk-', 'literal-secret-value', 'candidateId', 'reviewRecord', 'artifactContent']) {
    if (serialized.includes(forbidden))
      throw new Error(`Projection proof exposed forbidden content ${forbidden}: ${serialized}`)
  }
}

async function readInvocationCancelProofFromBrowser(page: Page, invocationId: string): Promise<Record<string, unknown>> {
  return await page.evaluate(async (id) => {
    const cancelResponse = await fetch(`/api/engine/invocations/${id}/cancel`, { method: 'POST' })
    const cancelBody = await cancelResponse.text()
    const invocationResponse = await fetch(`/api/engine/invocations/${id}`)
    const invocationBody = await invocationResponse.text()
    const eventsResponse = await fetch(`/api/engine/invocations/${id}/events?after=0&limit=20`)
    const eventsBody = await eventsResponse.text()
    return {
      cancel: {
        body: JSON.parse(cancelBody) as Record<string, unknown>,
        status: cancelResponse.status,
      },
      events: {
        body: JSON.parse(eventsBody) as Record<string, unknown>,
        status: eventsResponse.status,
      },
      invocation: {
        body: JSON.parse(invocationBody) as Record<string, unknown>,
        status: invocationResponse.status,
      },
    }
  }, invocationId)
}

function assertInvocationCancelProof(proof: Record<string, unknown>, invocationId: string, sessionId: string): void {
  const cancel = readRecord(proof.cancel)
  const invocationRead = readRecord(proof.invocation)
  const eventsRead = readRecord(proof.events)
  if (cancel.status !== 201)
    throw new Error(`Invocation cancel failed in browser proof: ${JSON.stringify(proof)}`)
  if (invocationRead.status !== 200)
    throw new Error(`Cancelled invocation read failed in browser proof: ${JSON.stringify(proof)}`)
  if (eventsRead.status !== 200)
    throw new Error(`Cancelled invocation events read failed in browser proof: ${JSON.stringify(proof)}`)

  const cancelledInvocation = readRecord(readRecord(cancel.body).invocation)
  const readBackInvocation = readRecord(readRecord(invocationRead.body).invocation)
  for (const candidate of [cancelledInvocation, readBackInvocation]) {
    if (candidate.id !== invocationId || candidate.sessionId !== sessionId)
      throw new Error(`Invocation cancel proof returned the wrong invocation: ${JSON.stringify(proof)}`)
    if (candidate.status !== 'cancelled' || candidate.processState !== 'not_spawned')
      throw new Error(`Invocation cancel proof missed queued cancellation state: ${JSON.stringify(proof)}`)
    if (candidate.summary !== 'Invocation cancelled.')
      throw new Error(`Invocation cancel proof missed cancellation summary: ${JSON.stringify(proof)}`)
  }
  if (readRecord(readRecord(cancel.body).session).status !== 'active')
    throw new Error(`Invocation cancel changed session lifecycle: ${JSON.stringify(proof)}`)

  const bridgeEvents = Array.isArray(readRecord(eventsRead.body).bridgeEvents) ? readRecord(eventsRead.body).bridgeEvents : []
  if (!bridgeEvents.some(event =>
    isRecord(event)
    && event.invocationId === invocationId
    && event.processState === 'not_spawned'
    && event.status === 'cancelled'
    && event.type === 'invocation.cancelled',
  )) {
    throw new Error(`Invocation cancel proof missed normalized cancellation event: ${JSON.stringify(proof)}`)
  }

  const serialized = JSON.stringify(proof)
  if (serialized.includes('/turns/') || serialized.includes('"turn"'))
    throw new Error(`Invocation cancel proof exposed retired turn semantics: ${serialized}`)
}

async function readInvocationReconcileProofFromBrowser(page: Page, invocationId: string): Promise<Record<string, unknown>> {
  return await page.evaluate(async (id) => {
    const reconcileResponse = await fetch(`/api/engine/invocations/${id}/reconcile`, {
      body: JSON.stringify({
        diagnostic: 'browser reconcile token=sk-browser-reconcile-secret',
        handle: { invocationId: id, pid: 505 },
        state: 'lost',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const reconcileBody = await reconcileResponse.text()
    const invocationResponse = await fetch(`/api/engine/invocations/${id}`)
    const invocationBody = await invocationResponse.text()
    const eventsResponse = await fetch(`/api/engine/invocations/${id}/events?after=0&limit=20`)
    const eventsBody = await eventsResponse.text()
    return {
      events: {
        body: JSON.parse(eventsBody) as Record<string, unknown>,
        status: eventsResponse.status,
      },
      invocation: {
        body: JSON.parse(invocationBody) as Record<string, unknown>,
        status: invocationResponse.status,
      },
      reconcile: {
        body: JSON.parse(reconcileBody) as Record<string, unknown>,
        status: reconcileResponse.status,
      },
    }
  }, invocationId)
}

function assertInvocationReconcileProof(proof: Record<string, unknown>, invocationId: string, sessionId: string): void {
  const reconcile = readRecord(proof.reconcile)
  const invocationRead = readRecord(proof.invocation)
  const eventsRead = readRecord(proof.events)
  if (reconcile.status !== 201)
    throw new Error(`Invocation reconcile failed in browser proof: ${JSON.stringify(proof)}`)
  if (invocationRead.status !== 200)
    throw new Error(`Reconciled invocation read failed in browser proof: ${JSON.stringify(proof)}`)
  if (eventsRead.status !== 200)
    throw new Error(`Reconciled invocation events read failed in browser proof: ${JSON.stringify(proof)}`)

  const reconciledInvocation = readRecord(readRecord(reconcile.body).invocation)
  const readBackInvocation = readRecord(readRecord(invocationRead.body).invocation)
  for (const candidate of [reconciledInvocation, readBackInvocation]) {
    if (candidate.id !== invocationId || candidate.sessionId !== sessionId)
      throw new Error(`Invocation reconcile proof returned the wrong invocation: ${JSON.stringify(proof)}`)
    if (candidate.status !== 'lost' || candidate.processState !== 'lost' || candidate.failureCode !== 'ENGINE_PROCESS_LOST')
      throw new Error(`Invocation reconcile proof missed lost process state: ${JSON.stringify(proof)}`)
    if (candidate.summary !== 'Native engine process was lost.')
      throw new Error(`Invocation reconcile proof missed lost process summary: ${JSON.stringify(proof)}`)
  }
  if (readRecord(readRecord(reconcile.body).session).status !== 'active')
    throw new Error(`Invocation reconcile changed session lifecycle: ${JSON.stringify(proof)}`)

  const bridgeEvents = Array.isArray(readRecord(eventsRead.body).bridgeEvents) ? readRecord(eventsRead.body).bridgeEvents : []
  if (!bridgeEvents.some(event =>
    isRecord(event)
    && event.invocationId === invocationId
    && event.failureCode === 'ENGINE_PROCESS_LOST'
    && event.processState === 'lost'
    && event.status === 'lost'
    && event.type === 'process.lost',
  )) {
    throw new Error(`Invocation reconcile proof missed normalized process.lost event: ${JSON.stringify(proof)}`)
  }

  const serialized = JSON.stringify(proof)
  for (const forbidden of ['/turns/', '"turn"', 'sk-browser-reconcile-secret']) {
    if (serialized.includes(forbidden))
      throw new Error(`Invocation reconcile proof exposed forbidden content ${forbidden}: ${serialized}`)
  }
}

async function readSessionArchiveProofFromBrowser(page: Page, sessionId: string): Promise<Record<string, unknown>> {
  return await page.evaluate(async (id) => {
    const archiveResponse = await fetch(`/api/sessions/${id}/archive`, { method: 'POST' })
    const archiveBody = await archiveResponse.text()
    const sessionResponse = await fetch(`/api/sessions/${id}`)
    const sessionBody = await sessionResponse.text()
    const blockedFollowUpResponse = await fetch(`/api/sessions/${id}/invocations`, {
      body: JSON.stringify({ input: 'This follow-up should be blocked after archive.' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const blockedFollowUpBody = await blockedFollowUpResponse.text()
    return {
      archive: {
        body: JSON.parse(archiveBody) as Record<string, unknown>,
        status: archiveResponse.status,
      },
      blockedFollowUp: {
        body: blockedFollowUpBody,
        status: blockedFollowUpResponse.status,
      },
      session: {
        body: JSON.parse(sessionBody) as Record<string, unknown>,
        status: sessionResponse.status,
      },
    }
  }, sessionId)
}

function assertSessionArchiveProof(proof: Record<string, unknown>, sessionId: string): void {
  const archive = readRecord(proof.archive)
  const session = readRecord(proof.session)
  const blockedFollowUp = readRecord(proof.blockedFollowUp)
  if (archive.status !== 200)
    throw new Error(`Session archive failed in browser proof: ${JSON.stringify(proof)}`)
  if (readRecord(archive.body).session === undefined)
    throw new Error(`Session archive proof missed archived session body: ${JSON.stringify(proof)}`)
  if (session.status !== 200)
    throw new Error(`Archived session read failed in browser proof: ${JSON.stringify(proof)}`)

  const archivedSession = readRecord(readRecord(session.body).session)
  if (archivedSession.id !== sessionId || archivedSession.status !== 'archived')
    throw new Error(`Browser archive proof did not persist archived lifecycle: ${JSON.stringify(proof)}`)
  if (typeof blockedFollowUp.status !== 'number' || blockedFollowUp.status < 400)
    throw new Error(`Archived session accepted a follow-up invocation: ${JSON.stringify(proof)}`)

  const serialized = JSON.stringify(proof)
  if (!serialized.includes('archived'))
    throw new Error(`Archive proof missed archived diagnostic: ${serialized}`)
  if (serialized.includes('/turns/') || serialized.includes('"turn"'))
    throw new Error(`Archive proof exposed retired turn semantics: ${serialized}`)
}

async function readWorkspaceLifecycleProofFromBrowser(page: Page, workerId: string, workspaceId: string): Promise<Record<string, unknown>> {
  return await page.evaluate(async ({ workerId, workspaceId }) => {
    const workspaceArchiveResponse = await fetch(`/api/workspace-locators/${workspaceId}/archive`, { method: 'POST' })
    const workspaceArchiveBody = await workspaceArchiveResponse.text()
    const workspaceReadResponse = await fetch(`/api/workspace-locators/${workspaceId}`)
    const workspaceReadBody = await workspaceReadResponse.text()
    const workerReadResponse = await fetch(`/api/workers/${workerId}`)
    const workerReadBody = await workerReadResponse.text()
    const replacementWorkspaceResponse = await fetch('/api/workspace-locators', {
      body: JSON.stringify({
        name: 'Replacement workspace after workspace archive',
        type: 'freeform',
        workerId,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const replacementWorkspaceBody = await replacementWorkspaceResponse.text()
    return {
      replacementWorkspace: {
        body: JSON.parse(replacementWorkspaceBody) as Record<string, unknown>,
        status: replacementWorkspaceResponse.status,
      },
      workerRead: {
        body: JSON.parse(workerReadBody) as Record<string, unknown>,
        status: workerReadResponse.status,
      },
      workspaceArchive: {
        body: JSON.parse(workspaceArchiveBody) as Record<string, unknown>,
        status: workspaceArchiveResponse.status,
      },
      workspaceRead: {
        body: JSON.parse(workspaceReadBody) as Record<string, unknown>,
        status: workspaceReadResponse.status,
      },
    }
  }, { workerId, workspaceId })
}

function assertWorkspaceLifecycleProof(proof: Record<string, unknown>, workerId: string, workspaceId: string): void {
  const workspaceArchive = readRecord(proof.workspaceArchive)
  const workspaceRead = readRecord(proof.workspaceRead)
  const workerRead = readRecord(proof.workerRead)
  const replacementWorkspace = readRecord(proof.replacementWorkspace)
  if (workspaceArchive.status !== 200 || workspaceRead.status !== 200)
    throw new Error(`Workspace lifecycle archive proof failed: ${JSON.stringify(proof)}`)
  if (workerRead.status !== 200)
    throw new Error(`Worker lifecycle read failed after workspace archive: ${JSON.stringify(proof)}`)
  if (typeof replacementWorkspace.status !== 'number' || replacementWorkspace.status >= 400)
    throw new Error(`Active Worker rejected a replacement workspace after workspace archive: ${JSON.stringify(proof)}`)

  for (const candidate of [
    readRecord(readRecord(workspaceArchive.body).workspace),
    readRecord(readRecord(workspaceRead.body).workspace),
  ]) {
    if (candidate.id !== workspaceId || candidate.status !== 'archived')
      throw new Error(`Workspace lifecycle archive proof missed archived state: ${JSON.stringify(proof)}`)
  }

  const worker = readRecord(readRecord(workerRead.body).worker)
  if (worker.id !== workerId || worker.status !== 'active')
    throw new Error(`Workspace lifecycle proof changed Worker lifecycle from browser context: ${JSON.stringify(proof)}`)

  const replacement = readRecord(readRecord(replacementWorkspace.body).workspace)
  if (replacement.workerId !== workerId || replacement.status !== 'active')
    throw new Error(`Replacement workspace proof missed active Worker continuity: ${JSON.stringify(proof)}`)

  const serialized = JSON.stringify(proof)
  for (const forbidden of ['/turns/', '"turn"', 'candidateId', 'reviewRecord', 'artifactContent', 'literal-secret-value']) {
    if (serialized.includes(forbidden))
      throw new Error(`Workspace lifecycle proof exposed forbidden content ${forbidden}: ${serialized}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value))
    throw new Error(`Expected record, received ${JSON.stringify(value)}`)
  return value
}

function assertNoUnexpectedBrowserEvents(events: string[]): void {
  // The chat transport is EventSource SSE (commit fd969a6b). Switching the active
  // invocation (e.g. on composer submit) closes the prior SSE via React effect
  // cleanup, and the browser reports that intentional client-side close as
  // ERR_ABORTED. Tolerate ONLY that exact shape: the app's bare `?after=N` events
  // stream aborted by the client. The trailing `\d+:` cannot match the test's own
  // `?after=0&limit=20` fetches (the `&` breaks it), and the `$` anchor keeps every
  // other errorText (ERR_CONNECTION_RESET, server stream failure, ...) on /events
  // fatal — so the expected-event helper adapts the proof to the SSE transport
  // without weakening it.
  const failures = events.filter(event =>
    !isExpectedBrowserEvent(event)
    && (event.startsWith('pageerror:')
      || (event.startsWith('requestfailed:') && event.includes('127.0.0.1'))),
  )
  if (failures.length > 0)
    throw new Error(`Unexpected browser errors during Freeform golden path: ${failures.join('\n')}`)
}

function isExpectedBrowserEvent(event: string): boolean {
  if (event.includes('/favicon.ico'))
    return true
  // Keep this as a function declaration (not a module-scope const) because the
  // assertion is reached by a hoisted call site before module-scope const
  // initializers would run.
  return /\/api\/engine\/invocations\/[^/]+\/events\?after=\d+:net::ERR_ABORTED$/.test(event)
}

async function writeEvidence(name: string, value: unknown): Promise<void> {
  const content = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`
  await writeFile(join(evidenceRoot, name), content)
}
