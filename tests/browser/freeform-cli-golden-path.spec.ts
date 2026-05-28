import type { Page } from 'playwright'
import { Buffer } from 'node:buffer'
import { mkdirSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright'
import { namespaceSoulAppCapabilityId } from '../../packages/soul-protocol/src/index'

const repoRoot = join(import.meta.dir, '..', '..')
const appId = 'aiworker-freeform'
const workerId = 'freeform-cli-golden-worker'
const capabilityId = namespaceSoulAppCapabilityId(appId, 'default')
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
    '--id',
    workerId,
    '--name',
    'Freeform CLI Golden Worker',
    '--soul',
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
    '--capability',
    capabilityId,
    '--title',
    'Freeform CLI browser golden path',
    '--input',
    'Start the Freeform CLI browser golden path.',
  )
  cliOutputs.sessionStart = sessionResult
  const followUpResult = runCliJson<{ invocation: { id: string, inputRef: string, sessionId: string, status: string } }>(
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

  const port = reservePort()
  daemon = Bun.spawn({
    cmd: [
      process.execPath,
      'apps/cli/src/aiworker.ts',
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
  const baseUrl = `http://127.0.0.1:${port}`
  const health = await waitForHealth(baseUrl)
  const mountProof = await fetchJson(`${baseUrl}/api/mount/workbench?workerId=${workerId}&workspaceId=${workspaceResult.workspace.id}&sessionId=${sessionResult.session.id}&theme=light`)
  await writeEvidence('mount-proof.json', mountProof)

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.on('console', message => browserEvents.push(`console:${message.type()}:${message.text()}`))
  page.on('pageerror', error => browserEvents.push(`pageerror:${error.message}`))
  page.on('requestfailed', request => browserEvents.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? 'unknown'}`))

  const routeUrl = `${baseUrl}/workers/${workerId}/workspaces/${workspaceResult.workspace.id}/sessions/${sessionResult.session.id}`
  await page.goto(routeUrl, { waitUntil: 'domcontentloaded' })
  const microApp = page.locator('micro-app[data-slot="soul-app-mounted-micro-app"]')
  await microApp.waitFor({ state: 'attached', timeout: 15_000 })

  const mountAttributes = await microApp.evaluate(element => ({
    data: (element as HTMLElement & { data?: unknown }).data,
    routerMode: element.getAttribute('router-mode'),
    url: element.getAttribute('url'),
  }))
  if (mountAttributes.routerMode !== 'search')
    throw new Error(`Expected router-mode=search, received ${mountAttributes.routerMode}`)
  const mountedUrl = mountAttributes.url ?? ''
  for (const expected of [
    `/api/apps/${appId}/micro-app/workbench`,
    `workerId=${workerId}`,
    `workspaceId=${workspaceResult.workspace.id}`,
    `sessionId=${sessionResult.session.id}`,
  ]) {
    if (!mountedUrl.includes(expected))
      throw new Error(`Mounted URL missed ${expected}: ${mountedUrl}`)
  }

  await waitForFreeformWorkbench(page)
  const mountedSurface = await readMountedSurface(page)
  if (!mountedSurface.commonRoot)
    throw new Error(`Freeform common workbench root did not render: ${mountedSurface.text}`)
  if (!mountedSurface.bridgeRefs || !mountedSurface.text.includes('Bridge event refs'))
    throw new Error(`Bridge event refs were not visible to the mounted surface: ${mountedSurface.text}`)
  const invocationEventProof = await readInvocationEventProofFromBrowser(page, followUpResult.invocation.id)
  assertInvocationEventProof(invocationEventProof, followUpResult.invocation.id)
  for (const expectedSection of [
    'Worker configuration summary',
    'Session controls',
    'Projection receipt status',
    'Archive controls',
  ]) {
    if (!mountedSurface.text.includes(expectedSection))
      throw new Error(`Mounted Freeform workbench missed ${expectedSection}: ${mountedSurface.text}`)
  }
  assertNoUnexpectedBrowserEvents(browserEvents)

  const sessionArchiveProof = await readSessionArchiveProofFromBrowser(page, sessionResult.session.id)
  assertSessionArchiveProof(sessionArchiveProof, sessionResult.session.id)

  await page.screenshot({ fullPage: true, path: join(evidenceRoot, 'freeform-cli-golden-path.png') })
  await writeEvidence('golden-path.json', {
    baseUrl,
    browserEvents,
    cliOutputs,
    health,
    mountAttributes,
    mountProof,
    mountedSurface,
    invocationEventProof,
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
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'apps/cli/src/aiworker.ts', ...args],
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

async function writeFakeCodexCommand(): Promise<void> {
  mkdirSync(binDir, { recursive: true })
  const commandPath = join(binDir, 'codex')
  await writeFile(commandPath, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'cat >/dev/null',
    'printf \'%s\\n\' \'{"type":"item.completed","item":{"type":"agent_message","text":"Done."}}\'',
    '',
  ].join('\n'))
  await chmod(commandPath, 0o755)
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

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  const body = await response.text()
  if (!response.ok)
    throw new Error(`${url} failed ${response.status}: ${body}`)
  return JSON.parse(body)
}

async function waitForFreeformWorkbench(page: Page): Promise<void> {
  try {
    await page.waitForFunction(() => {
      const text = document.body.textContent ?? ''
      const microApp = document.querySelector('micro-app') as (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null
      return text.includes('AIWorker Common Workbench')
        || text.includes('Bridge event refs')
        || Boolean(document.querySelector('[data-aiworker-common-workbench="true"]'))
        || Boolean(microApp?.shadowRoot?.querySelector('[data-aiworker-common-workbench="true"]'))
    }, undefined, { timeout: 15_000 })
  }
  catch (error) {
    throw new Error(`Freeform workbench did not render: ${JSON.stringify({
      browserEvents,
      diagnostics: await readBrowserDiagnostics(page),
      error: error instanceof Error ? error.message : String(error),
    })}`)
  }
}

async function readMountedSurface(page: Page): Promise<{ bridgeRefs: boolean, commonRoot: boolean, text: string }> {
  return await page.evaluate(() => {
    const microApp = document.querySelector('micro-app') as (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null
    const hostText = document.body.textContent ?? ''
    const shadowText = microApp?.shadowRoot?.textContent ?? ''
    return {
      bridgeRefs: Boolean(
        document.querySelector('[data-aiworker-bridge-event-refs="engine-invocations,engine-invocation-events"]')
        || microApp?.shadowRoot?.querySelector('[data-aiworker-bridge-event-refs="engine-invocations,engine-invocation-events"]'),
      ),
      commonRoot: Boolean(
        document.querySelector('[data-aiworker-common-workbench="true"]')
        || microApp?.shadowRoot?.querySelector('[data-aiworker-common-workbench="true"]'),
      ),
      text: `${hostText}\n${shadowText}`,
    }
  })
}

async function readInvocationEventProofFromBrowser(page: Page, invocationId: string): Promise<Record<string, unknown>> {
  return await page.evaluate(async (id) => {
    const response = await fetch(`/api/engine/invocations/${id}/events?after=0&limit=20`)
    const body = await response.text()
    if (!response.ok)
      throw new Error(`invocation events request failed ${response.status}: ${body}`)
    return JSON.parse(body) as Record<string, unknown>
  }, invocationId)
}

function assertInvocationEventProof(proof: Record<string, unknown>, invocationId: string): void {
  if (proof.invocationId !== invocationId)
    throw new Error(`Invocation event proof returned the wrong invocation: ${JSON.stringify(proof)}`)

  const bridgeEvents = Array.isArray(proof.bridgeEvents) ? proof.bridgeEvents : []
  const storedEvents = Array.isArray(proof.events) ? proof.events : []
  if (bridgeEvents.length === 0)
    throw new Error(`Invocation event proof did not include bridge events: ${JSON.stringify(proof)}`)
  if (!bridgeEvents.every(event => isRecord(event) && event.invocationId === invocationId))
    throw new Error(`Invocation event proof leaked events for another invocation: ${JSON.stringify(proof)}`)
  if (!storedEvents.every(event => isRecord(event) && event.invocationId === invocationId))
    throw new Error(`Stored invocation events were not invocation-scoped: ${JSON.stringify(proof)}`)

  const bridgeEventTypes = bridgeEvents
    .filter(isRecord)
    .map(event => event.type)
  if (!bridgeEventTypes.includes('invocation.output.delta') && !bridgeEventTypes.includes('invocation.completed'))
    throw new Error(`Invocation event proof missed normalized bridge output/completion events: ${JSON.stringify(proof)}`)

  const serialized = JSON.stringify(proof)
  if (serialized.includes('/turns/') || serialized.includes('"turn"'))
    throw new Error(`Invocation event proof exposed retired turn semantics: ${serialized}`)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value))
    throw new Error(`Expected record, received ${JSON.stringify(value)}`)
  return value
}

async function readBrowserDiagnostics(page: Page): Promise<unknown> {
  return await page.evaluate(() => {
    const microApp = document.querySelector('micro-app') as (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null
    return {
      bodyText: document.body.textContent,
      microAppHtml: microApp?.outerHTML,
      shadowHtml: microApp?.shadowRoot?.innerHTML,
    }
  })
}

function assertNoUnexpectedBrowserEvents(events: string[]): void {
  const failures = events.filter(event =>
    event.startsWith('pageerror:')
    || (event.startsWith('requestfailed:') && event.includes('127.0.0.1')),
  )
  if (failures.length > 0)
    throw new Error(`Unexpected browser errors during Freeform golden path: ${failures.join('\n')}`)
}

async function writeEvidence(name: string, value: unknown): Promise<void> {
  const content = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`
  await writeFile(join(evidenceRoot, name), content)
}
