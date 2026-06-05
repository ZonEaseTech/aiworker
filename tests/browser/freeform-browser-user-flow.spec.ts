import type { Page } from 'playwright'
import { Buffer } from 'node:buffer'
import { mkdirSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright'
import { WORKBENCH_RENDER_TIMEOUT_MS } from './workbench-render-wait'

const repoRoot = join(import.meta.dir, '..', '..')
const appId = 'aiworker-freeform'
const descriptorPath = join(repoRoot, 'souls/aiworker-freeform/dist/soul.descriptor.json')
const evidenceRoot = join(repoRoot, 'tmp', `freeform-browser-user-flow-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const desktopViewport = { height: 920, width: 1440 }
const mobileViewport = { height: 844, width: 390 }
const workRoot = await mkdtemp(join(tmpdir(), 'aiworker-freeform-browser-user-'))
const aiworkerHome = join(workRoot, 'home')
const dbPath = join(aiworkerHome, 'aiworker.db')
const binDir = join(workRoot, 'bin')
const baseEnv = {
  ...process.env,
  AIWORKER_HOME: aiworkerHome,
  PATH: `${binDir}:${process.env.PATH ?? ''}`,
  WORKER_DB_PATH: dbPath,
}
const browserEvents: string[] = []
const cliOutputs: Record<string, unknown> = {}
const layoutEvidence: Record<string, ComposerLayoutMetrics> = {}

let daemon: ReturnType<typeof Bun.spawn> | null = null
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

await mkdir(evidenceRoot, { recursive: true })
await writeFakeCodexCommand()

try {
  cliOutputs.install = runCliJson('app', 'install', descriptorPath)
  cliOutputs.enable = runCliJson('app', 'enable', appId)

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
  const baseUrl = `http://127.0.0.1:${port}`
  const health = await waitForHealth(baseUrl)
  await fetch(`${baseUrl}/api/engine/targets/rescan`, { method: 'POST' })

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: desktopViewport })
  page.on('console', (message) => {
    if (message.type() === 'error')
      browserEvents.push(`console:${message.type()}:${message.text()}`)
  })
  page.on('pageerror', error => browserEvents.push(`pageerror:${error.message}`))
  page.on('requestfailed', request => browserEvents.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? 'unknown'}`))

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('worker-studio-shell').waitFor({ state: 'attached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  await createWorkerWorkspaceAndSessionFromUi(page)
  const routeIds = readRouteIds(new URL(page.url()).pathname)

  const chatSurface = page.locator('[data-chat-surface="true"]')
  await chatSurface.waitFor({ state: 'attached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  layoutEvidence.sessionComposerDesktop = await assertComposerPinnedToMainBottom(page, 'session composer desktop')
  await page.setViewportSize(mobileViewport)
  layoutEvidence.sessionComposerMobile = await assertComposerPinnedToMainBottom(page, 'session composer mobile')
  await page.screenshot({ fullPage: true, path: join(evidenceRoot, 'freeform-browser-session-composer-mobile.png') })
  await page.setViewportSize(desktopViewport)
  if (await page.locator('micro-app').count() !== 0)
    throw new Error('Worker Workbench rendered a micro-app during the browser user flow.')

  const composerMessage = 'Run the Freeform browser user flow.'
  await chatSurface.locator('textarea').fill(composerMessage)
  await chatSurface.locator('button[type="submit"]').click()
  await page.getByText(composerMessage).waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  const sessionProof = await waitForSessionProof(page, routeIds, 2)

  await addEntryFileOverlayFromUi(page, routeIds.workerId)
  const entryFileProof = await readLocalApi(page, `/api/workers/${routeIds.workerId}/config/entry-file-overlay%3AUSER_FLOW.md/content`)
  assertEntryFileProof(entryFileProof)

  await assertSecretOverlayRejectionFromUi(page)
  await assertSettingsUserFlow(page)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-chat-surface="true"]').waitFor({ state: 'attached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  if (new URL(page.url()).pathname !== `/workers/${routeIds.workerId}/workspaces/${routeIds.workspaceId}/sessions/${routeIds.sessionId}`)
    throw new Error(`Reload changed the worker/workspace/session route: ${page.url()}`)

  await page.screenshot({ fullPage: true, path: join(evidenceRoot, 'freeform-browser-user-flow-before-archive.png') })
  const lifecycleProof = await archiveWorkspaceLifecycleFromUi(page, routeIds)
  assertLifecycleArchiveProof(lifecycleProof, routeIds)

  assertNoUnexpectedBrowserEvents(browserEvents)

  await page.screenshot({ fullPage: true, path: join(evidenceRoot, 'freeform-browser-user-flow-after-archive.png') })
  await writeEvidence('user-flow.json', {
    baseUrl,
    browserEvents,
    cliOutputs,
    entryFileProof,
    health,
    layoutEvidence,
    lifecycleProof,
    routeIds,
    routeUrl: page.url(),
    sessionProof,
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

async function createWorkerWorkspaceAndSessionFromUi(page: Page): Promise<void> {
  const main = page.getByRole('region', { name: 'Soul workspaces and sessions' })
  await main.getByRole('button', { name: 'Create worker' }).click()

  const workerDialog = page.getByRole('dialog', { name: 'Create worker' })
  await workerDialog.getByLabel('Worker name').fill('Browser User Worker')
  await workerDialog.getByRole('button', { name: 'Create worker' }).click()

  const workspaceDialog = page.getByRole('dialog', { name: 'Create workspace' })
  await workspaceDialog.getByLabel('Workspace name').fill('Browser user workspace')
  await workspaceDialog.getByTestId('create-project').click()

  await page.waitForURL(/\/workers\/[^/]+\/workspaces\/[^/]+$/, { timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  await main.getByText('No sessions in this workspace yet.').waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  layoutEvidence.emptyWorkspaceComposerDesktop = await assertComposerPinnedToMainBottom(page, 'empty workspace initial composer desktop')
  await page.screenshot({ fullPage: true, path: join(evidenceRoot, 'freeform-browser-empty-workspace-composer.png') })
  await page.setViewportSize(mobileViewport)
  layoutEvidence.emptyWorkspaceComposerMobile = await assertComposerPinnedToMainBottom(page, 'empty workspace initial composer mobile')
  await page.screenshot({ fullPage: true, path: join(evidenceRoot, 'freeform-browser-empty-workspace-composer-mobile.png') })
  await page.setViewportSize(desktopViewport)

  const firstMessage = 'Start the Freeform browser user flow from an empty workspace composer.'
  await main.locator('[data-session-slot="composer-input"]').fill(firstMessage)
  await main.locator('button[type="submit"]').click()
  await page.waitForURL(/\/workers\/[^/]+\/workspaces\/[^/]+\/sessions\/[^/]+$/, { timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  await page.getByText(firstMessage).waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  await page.getByText('Done.').waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
}

interface ComposerLayoutMetrics {
  bottomGap: number
  fieldBottom: number
  fieldHeight: number
  fieldTop: number
  label: string
  mainBottom: number
  mainHeight: number
  mainTop: number
  surfaceBottom: number | null
  surfaceHeight: number | null
  surfaceTop: number | null
}

async function assertComposerPinnedToMainBottom(page: Page, label: string): Promise<ComposerLayoutMetrics> {
  await page.locator('[data-host-slot="shell-main"]').waitFor({ state: 'attached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  await page.locator('[data-session-slot="composer-field"]').waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  const metrics = await page.evaluate((metricLabel): ComposerLayoutMetrics => {
    const main = document.querySelector('[data-host-slot="shell-main"]')
    const field = document.querySelector('[data-session-slot="composer-field"]')
    const surface = document.querySelector('[data-chat-surface="true"]')
    if (!main || !field)
      throw new Error(`Missing layout target for ${metricLabel}`)

    const mainRect = main.getBoundingClientRect()
    const fieldRect = field.getBoundingClientRect()
    const surfaceRect = surface?.getBoundingClientRect()
    return {
      bottomGap: Math.round(mainRect.bottom - fieldRect.bottom),
      fieldBottom: Math.round(fieldRect.bottom),
      fieldHeight: Math.round(fieldRect.height),
      fieldTop: Math.round(fieldRect.top),
      label: metricLabel,
      mainBottom: Math.round(mainRect.bottom),
      mainHeight: Math.round(mainRect.height),
      mainTop: Math.round(mainRect.top),
      surfaceBottom: surfaceRect ? Math.round(surfaceRect.bottom) : null,
      surfaceHeight: surfaceRect ? Math.round(surfaceRect.height) : null,
      surfaceTop: surfaceRect ? Math.round(surfaceRect.top) : null,
    }
  }, label)

  if (metrics.bottomGap < 8 || metrics.bottomGap > 56) {
    throw new Error(`${label} is not pinned near the main workbench bottom: ${JSON.stringify(metrics)}`)
  }
  if (metrics.fieldTop < metrics.mainBottom - 280) {
    throw new Error(`${label} is too high in the main workbench: ${JSON.stringify(metrics)}`)
  }
  if (metrics.surfaceBottom !== null && Math.abs(metrics.mainBottom - metrics.surfaceBottom) > 24) {
    throw new Error(`${label} chat surface does not fill the main workbench: ${JSON.stringify(metrics)}`)
  }
  return metrics
}

async function addEntryFileOverlayFromUi(page: Page, workerId: string): Promise<void> {
  await page.getByRole('button', { name: 'Configure' }).click()
  const configDialog = page.getByRole('dialog', { name: 'Worker configuration' })
  await configDialog.getByRole('button', { name: '+ Add entry file' }).click()

  const addDialog = page.getByRole('dialog', { name: 'Add entry file' })
  await addDialog.getByLabel('Name').fill('USER_FLOW.md')
  await addDialog.getByLabel('Content').fill('# Browser user flow\n\nCreated from the Workbench configuration dialog.')
  await addDialog.getByRole('button', { name: 'Add' }).click()
  await addDialog.waitFor({ state: 'detached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  const saved = await readLocalApi(page, `/api/workers/${workerId}/config/entry-file-overlay%3AUSER_FLOW.md/content`)
  assertEntryFileProof(saved)
}

async function assertSecretOverlayRejectionFromUi(page: Page): Promise<void> {
  const eventStart = browserEvents.length
  const configDialog = page.getByRole('dialog', { name: 'Worker configuration' })
  await configDialog.getByRole('button', { name: '+ Add skill' }).click()

  const addDialog = page.getByRole('dialog', { name: 'Add skill' })
  await addDialog.getByLabel('Name').fill('secret-skill')
  await addDialog.getByLabel('Content').fill('api_key = "sk-browser-user-flow-secret"')
  await addDialog.getByRole('button', { name: 'Add' }).click()

  const error = await addDialog.getByTestId('overlay-add-error').textContent({ timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  if (!error || !/secret/i.test(error))
    throw new Error(`Secret overlay rejection did not surface inline: ${error ?? '<empty>'}`)

  const rejectionEvents = browserEvents.splice(eventStart)
  browserEvents.push(...rejectionEvents.filter(event => !event.includes('status of 422')))

  await addDialog.getByRole('button', { name: 'Cancel' }).click()
  await addDialog.waitFor({ state: 'detached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  await configDialog.getByRole('button', { name: 'Close' }).click()
  await configDialog.waitFor({ state: 'detached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
}

async function assertSettingsUserFlow(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Open local Host settings/ }).click()
  const settingsDialog = page.getByRole('dialog', { name: 'Local Host Settings' })

  await settingsDialog.getByRole('button', { name: 'Rescan' }).click()
  await settingsDialog.getByRole('button', { name: 'Test' }).click()
  await settingsDialog.getByText('Codex CLI responded as codex-browser-user-flow.').waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  await settingsDialog.getByRole('tab', { name: /^Appearance / }).click()
  await settingsDialog.getByRole('group', { name: 'Appearance' }).getByRole('radio', { name: /Dark/ }).click()
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'), null, { timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  await settingsDialog.getByRole('button', { name: 'Close local Host settings' }).click()
  await settingsDialog.waitFor({ state: 'detached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
}

async function archiveWorkspaceLifecycleFromUi(
  page: Page,
  routeIds: { sessionId: string, workerId: string, workspaceId: string },
): Promise<Record<string, unknown>> {
  const eventStart = browserEvents.length
  const main = page.getByRole('region', { name: 'Soul workspaces and sessions' })
  await assertWorkerArchiveAbsentFromUi(page)

  await page.getByRole('button', { name: 'Archive session' }).click()
  await confirmArchiveDialog(page, 'Archive session?', 'Archive session')
  await page.waitForURL(new RegExp(`/workers/${escapeRegExp(routeIds.workerId)}/workspaces/${escapeRegExp(routeIds.workspaceId)}$`), {
    timeout: WORKBENCH_RENDER_TIMEOUT_MS,
  })
  await main.getByText('No sessions in this workspace yet.').waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  if (await page.getByRole('button', { name: 'Open session New session 1' }).count() !== 0)
    throw new Error('Archived session remained selectable in the workspace tree.')
  await assertWorkerArchiveAbsentFromUi(page)

  const sessionRead = await readLocalApi(page, `/api/sessions/${routeIds.sessionId}`)
  const blockedFollowUp = await callLocalApi(page, `/api/sessions/${routeIds.sessionId}/invocations`, {
    body: { input: 'This follow-up should be blocked after UI archive.' },
    method: 'POST',
  })

  await page.getByRole('button', { exact: true, name: 'Archive workspace' }).click()
  await confirmArchiveDialog(page, 'Archive workspace?', 'Archive workspace')
  await page.waitForURL(new RegExp(`/workers/${escapeRegExp(routeIds.workerId)}$`), { timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  await main.getByText('No workspaces yet').waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  if (await page.getByText('Browser user workspace').count() !== 0)
    throw new Error('Archived workspace remained visible in the workspace tree.')
  await assertWorkerArchiveAbsentFromUi(page)

  const workspaceRead = await readLocalApi(page, `/api/workspace-locators/${routeIds.workspaceId}`)
  const workerRead = await readLocalApi(page, `/api/workers/${routeIds.workerId}`)
  const replacementWorkspace = await callLocalApi(page, '/api/workspace-locators', {
    body: {
      name: 'Replacement browser workspace after workspace archive',
      type: 'freeform',
      workerId: routeIds.workerId,
    },
    method: 'POST',
  })

  const lifecycleEvents = browserEvents.splice(eventStart)
  browserEvents.push(...lifecycleEvents.filter(event => !event.includes('status of 400')))

  return {
    blockedFollowUp,
    replacementWorkspace,
    sessionRead,
    workerRead,
    workspaceRead,
  }
}

async function confirmArchiveDialog(page: Page, title: string, action: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: title })
  await dialog.getByRole('button', { name: action }).click()
  await dialog.waitFor({ state: 'detached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
}

async function assertWorkerArchiveAbsentFromUi(page: Page): Promise<void> {
  const archiveWorkerButtons = await page.getByRole('button', { name: 'Archive worker' }).count()
  if (archiveWorkerButtons !== 0)
    throw new Error('Worker archive is exposed from the Workbench UI.')
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

async function writeFakeCodexCommand(): Promise<void> {
  mkdirSync(binDir, { recursive: true })
  const commandPath = join(binDir, 'codex')
  const counterPath = shellSingleQuote(join(workRoot, 'codex-thread-counter'))
  const shFirstArg = '$' + '{1:-}'
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
    `if [ "${shFirstArg}" = "--version" ]; then printf 'codex-browser-user-flow\\n'; exit 0; fi`,
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

async function callLocalApi(
  page: Page,
  path: string,
  input: { body?: Record<string, unknown>, method?: string } = {},
): Promise<{ body: unknown, status: number }> {
  return await page.evaluate(async ({ apiPath, body, method }) => {
    const response = await fetch(apiPath, {
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      method,
    })
    const text = await response.text()
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : null
    }
    catch {
      parsed = text
    }
    return {
      body: parsed,
      status: response.status,
    }
  }, { apiPath: path, body: input.body, method: input.method ?? 'GET' })
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
  if (invocations.length === 0)
    throw new Error(`Browser user flow did not create a session invocation: ${JSON.stringify(proof.body)}`)
  if (!invocations.every(invocation => isRecord(invocation) && invocation.sessionId === routeIds.sessionId && invocation.status === 'succeeded'))
    throw new Error(`Browser user flow invocation proof is not session-scoped/succeeded: ${JSON.stringify(proof.body)}`)
  if (invocations.length < minSucceededInvocations)
    throw new Error(`Browser user flow created ${invocations.length} succeeded invocation(s), expected at least ${minSucceededInvocations}: ${JSON.stringify(proof.body)}`)
  const serialized = JSON.stringify(proof.body)
  for (const forbidden of ['/turns/', '"turn"', 'sk-browser-user-flow-secret']) {
    if (serialized.includes(forbidden))
      throw new Error(`Session proof exposed forbidden content ${forbidden}: ${serialized}`)
  }
}

function assertEntryFileProof(proof: { body: Record<string, unknown>, status: number }): void {
  if (proof.status !== 200)
    throw new Error(`Entry file overlay proof failed with ${proof.status}: ${JSON.stringify(proof.body)}`)
  if (proof.body.content !== '# Browser user flow\n\nCreated from the Workbench configuration dialog.')
    throw new Error(`Entry file overlay proof returned the wrong content: ${JSON.stringify(proof.body)}`)
  if (proof.body.source !== 'overlay' || proof.body.editable !== true)
    throw new Error(`Entry file overlay proof missed overlay/editable markers: ${JSON.stringify(proof.body)}`)
}

function assertLifecycleArchiveProof(
  proof: Record<string, unknown>,
  routeIds: { sessionId: string, workerId: string, workspaceId: string },
): void {
  const sessionRead = readRecord(proof.sessionRead)
  const workspaceRead = readRecord(proof.workspaceRead)
  const workerRead = readRecord(proof.workerRead)
  const blockedFollowUp = readRecord(proof.blockedFollowUp)
  const replacementWorkspace = readRecord(proof.replacementWorkspace)

  const session = readRecord(readRecord(sessionRead.body).session)
  if (sessionRead.status !== 200 || session.id !== routeIds.sessionId || session.status !== 'archived')
    throw new Error(`Session UI archive proof failed: ${JSON.stringify(proof)}`)
  const blockedFollowUpError = readRecord(readRecord(blockedFollowUp.body).error)
  if (blockedFollowUp.status !== 400 || blockedFollowUpError.code !== 'SESSION_ARCHIVED')
    throw new Error(`Archived session accepted a follow-up invocation: ${JSON.stringify(proof)}`)

  const workspace = readRecord(readRecord(workspaceRead.body).workspace)
  if (workspaceRead.status !== 200 || workspace.id !== routeIds.workspaceId || workspace.status !== 'archived')
    throw new Error(`Workspace UI archive proof failed: ${JSON.stringify(proof)}`)

  const worker = readRecord(readRecord(workerRead.body).worker)
  if (workerRead.status !== 200 || worker.id !== routeIds.workerId || worker.status !== 'active')
    throw new Error(`Workbench archived the Worker or returned the wrong Worker lifecycle: ${JSON.stringify(proof)}`)
  if (typeof replacementWorkspace.status !== 'number' || replacementWorkspace.status >= 400)
    throw new Error(`Active Worker rejected a replacement workspace after workspace archive: ${JSON.stringify(proof)}`)

  const serialized = JSON.stringify(proof)
  if (!serialized.includes('SESSION_ARCHIVED'))
    throw new Error(`Lifecycle archive proof missed archived-session diagnostic: ${serialized}`)
  for (const forbidden of ['/turns/', '"turn"', 'sk-browser-user-flow-secret']) {
    if (serialized.includes(forbidden))
      throw new Error(`Lifecycle archive proof exposed forbidden content ${forbidden}: ${serialized}`)
  }
}

function assertNoUnexpectedBrowserEvents(events: string[]): void {
  const unexpected = events.filter(event => !isExpectedBrowserEvent(event))
  if (unexpected.length > 0)
    throw new Error(`Unexpected browser events: ${unexpected.join('\n')}`)
}

function isExpectedBrowserEvent(event: string): boolean {
  if (event.includes('/favicon.ico'))
    return true
  return event.includes('/api/engine/invocations/')
    && event.includes('/events?after=')
    && event.includes('net::ERR_ABORTED')
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

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
