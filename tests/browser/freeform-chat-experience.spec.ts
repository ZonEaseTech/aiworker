import type { Page } from 'playwright'
import { Buffer } from 'node:buffer'
import { mkdirSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright'
import { MOUNT_TIMEOUT_MS as WORKBENCH_RENDER_TIMEOUT_MS } from './mount-wait'

const repoRoot = join(import.meta.dir, '..', '..')
const appId = 'aiworker-freeform'
const descriptorPath = join(repoRoot, 'souls/aiworker-freeform/dist/soul.descriptor.json')
const evidenceRoot = join(repoRoot, 'tmp', `freeform-chat-experience-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const desktopViewport = { height: 920, width: 1440 }
const mobileViewport = { height: 844, width: 390 }
const workRoot = await mkdtemp(join(tmpdir(), 'aiworker-freeform-chat-experience-'))
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
const chatEvidence: Record<string, ChatRhythmMetrics | ComposerLayoutMetrics | KeyboardRoutingMetrics | Record<string, unknown> | string> = {}

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
  await createWorkspaceAndInitialSessionFromUi(page)
  const routeIds = readRouteIds(new URL(page.url()).pathname)

  const chatSurface = page.locator('[data-chat-surface="true"]')
  await chatSurface.waitFor({ state: 'attached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  chatEvidence.sessionComposerDesktop = await assertComposerPinnedToMainBottom(page, 'session composer desktop')
  await page.setViewportSize(mobileViewport)
  chatEvidence.sessionComposerMobile = await assertComposerPinnedToMainBottom(page, 'session composer mobile')
  await page.screenshot({ fullPage: true, path: join(evidenceRoot, 'freeform-chat-experience-mobile.png') })
  await page.setViewportSize(desktopViewport)
  chatEvidence.keyboardRouting = await assertPlainKeyRoutesToComposer(page)
  if (await page.locator('micro-app').count() !== 0)
    throw new Error('Worker Workbench rendered a micro-app during the session chat experience proof.')

  const followUpMessage = 'Run the Freeform Codex-like chat experience proof.'
  await chatSurface.locator('textarea').fill(followUpMessage)
  await chatSurface.locator('button[type="submit"]').click()
  await page.getByText(followUpMessage).waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  chatEvidence.sessionFollowUp = await assertSessionChatRhythm(page, followUpMessage, { requireComposerFocus: true })
  chatEvidence.sessionProof = await waitForSessionProof(page, routeIds, 2)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-chat-surface="true"]').waitFor({ state: 'attached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  if (new URL(page.url()).pathname !== `/workers/${routeIds.workerId}/workspaces/${routeIds.workspaceId}/sessions/${routeIds.sessionId}`)
    throw new Error(`Reload changed the worker/workspace/session route: ${page.url()}`)
  await page.getByText(followUpMessage).waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  chatEvidence.refreshRestore = await assertSessionChatRhythm(page, followUpMessage, { requireComposerFocus: false })
  await page.screenshot({ fullPage: true, path: join(evidenceRoot, 'freeform-chat-experience-refresh-restore.png') })

  assertNoUnexpectedBrowserEvents(browserEvents)

  await writeEvidence('chat-experience.json', {
    baseUrl,
    browserEvents,
    chatEvidence,
    cliOutputs,
    health,
    routeIds,
    routeUrl: page.url(),
  })
}
catch (error) {
  await writeEvidence('failure.json', {
    browserEvents,
    chatEvidence,
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

interface ComposerLayoutMetrics {
  bottomGap: number
  composerGradientPresent: boolean
  composerInsideScroller: boolean
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
  stickyFooterBottom: number | null
  stickyFooterPosition: string | null
  threadOverflowAnchor: string | null
  threadScrollPaddingBottom: string | null
}

interface ChatRhythmMetrics {
  activeElementSlot: string | null
  composerFocused: boolean
  latestBottom: number | null
  latestText: string | null
  latestTop: number | null
  latestVisible: boolean
  scrollBottom: number | null
  scrollClientHeight: number | null
  scrollHeight: number | null
  scrollTop: number | null
  submittedUserVisible: boolean
  turnCount: number
}

interface KeyboardRoutingMetrics {
  activeElementSlot: string | null
  composerFocused: boolean
  routedValue: string
}

async function createWorkspaceAndInitialSessionFromUi(page: Page): Promise<void> {
  const main = page.getByRole('region', { name: 'Soul workspaces and sessions' })
  if (await main.getByRole('button', { name: 'Create worker' }).count() !== 0)
    throw new Error('Worker Workbench exposed a create-worker flow; v1 chat proof must start from the bound Worker.')

  await main.getByRole('button', { name: 'Create workspace' }).click()
  const workspaceDialog = page.getByRole('dialog', { name: 'Create workspace' })
  await workspaceDialog.getByLabel('Workspace name').fill('Browser chat workspace')
  await workspaceDialog.getByTestId('create-project').click()

  await page.waitForURL(/\/workers\/[^/]+\/workspaces\/[^/]+$/, { timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  await main.getByText('No sessions in this workspace yet.').waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  const firstMessage = 'Start the Freeform Codex-like chat experience from an empty workspace composer.'
  await main.locator('[data-session-slot="composer-input"]').fill(firstMessage)
  await main.locator('button[type="submit"]').click()
  await page.waitForURL(/\/workers\/[^/]+\/workspaces\/[^/]+\/sessions\/[^/]+$/, { timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  await page.getByText(firstMessage).waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  await page.getByText('Done.').first().waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
}

async function assertComposerPinnedToMainBottom(page: Page, label: string): Promise<ComposerLayoutMetrics> {
  await page.getByRole('region', { name: 'Soul workspaces and sessions' }).waitFor({ state: 'attached', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  await page.locator('[data-chat-surface="true"] [data-session-slot="composer-field"]').waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  const metrics = await page.evaluate((metricLabel): ComposerLayoutMetrics => {
    const main = document.querySelector('[data-chat-surface="true"]')?.closest('[role="region"][aria-label="Soul workspaces and sessions"]')
    const field = document.querySelector('[data-chat-surface="true"] [data-session-slot="composer-field"]')
    const surface = document.querySelector('[data-chat-surface="true"]')
    const scroller = document.querySelector<HTMLElement>('[data-chat-transcript-scroll="true"]')
    const stickyFooter = document.querySelector<HTMLElement>('[data-chat-composer-footer="true"]')
    const gradient = document.querySelector('[data-chat-composer-gradient="true"]')
    if (!main || !field)
      throw new Error(`Missing layout target for ${metricLabel}`)

    const mainRect = main.getBoundingClientRect()
    const fieldRect = field.getBoundingClientRect()
    const surfaceRect = surface?.getBoundingClientRect()
    const stickyFooterRect = stickyFooter?.getBoundingClientRect()
    const scrollerStyle = scroller ? getComputedStyle(scroller) : null
    const stickyFooterStyle = stickyFooter ? getComputedStyle(stickyFooter) : null
    return {
      bottomGap: Math.round(mainRect.bottom - fieldRect.bottom),
      composerGradientPresent: gradient !== null,
      composerInsideScroller: scroller?.contains(field) ?? false,
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
      stickyFooterBottom: stickyFooterRect ? Math.round(stickyFooterRect.bottom) : null,
      stickyFooterPosition: stickyFooterStyle?.position ?? null,
      threadOverflowAnchor: scrollerStyle?.overflowAnchor ?? null,
      threadScrollPaddingBottom: scrollerStyle?.scrollPaddingBottom ?? null,
    }
  }, label)

  if (!metrics.composerInsideScroller)
    throw new Error(`${label} composer is not inside the Codex-style thread scroll viewport: ${JSON.stringify(metrics)}`)
  if (metrics.stickyFooterPosition !== 'sticky')
    throw new Error(`${label} composer footer is not a sticky bottom footer: ${JSON.stringify(metrics)}`)
  if (!metrics.composerGradientPresent)
    throw new Error(`${label} is missing the sticky composer gradient layer: ${JSON.stringify(metrics)}`)
  if (metrics.threadOverflowAnchor !== 'none')
    throw new Error(`${label} thread scroll viewport does not disable overflow anchoring: ${JSON.stringify(metrics)}`)
  if (metrics.bottomGap < 8 || metrics.bottomGap > 56)
    throw new Error(`${label} is not pinned near the main workbench bottom: ${JSON.stringify(metrics)}`)
  if (metrics.fieldTop < metrics.mainBottom - 280)
    throw new Error(`${label} is too high in the main workbench: ${JSON.stringify(metrics)}`)
  if (metrics.surfaceBottom !== null && Math.abs(metrics.mainBottom - metrics.surfaceBottom) > 24)
    throw new Error(`${label} chat surface does not fill the main workbench: ${JSON.stringify(metrics)}`)
  return metrics
}

async function assertPlainKeyRoutesToComposer(page: Page): Promise<KeyboardRoutingMetrics> {
  const composer = page.locator('[data-chat-surface="true"] [data-codex-composer="true"]').first()
  await composer.waitFor({ state: 'visible', timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  await composer.fill('')
  await page.evaluate(() => {
    const activeElement = document.activeElement as HTMLElement | null
    activeElement?.blur()
  })

  await page.keyboard.press('z')
  await page.waitForFunction(() => {
    const composer = document.querySelector<HTMLTextAreaElement>('[data-chat-surface="true"] [data-codex-composer="true"]')
    return composer?.value === 'z' && document.activeElement === composer
  }, undefined, { timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  const metrics = await page.evaluate((): KeyboardRoutingMetrics => {
    const activeElement = document.activeElement as HTMLElement | null
    const composer = document.querySelector<HTMLTextAreaElement>('[data-chat-surface="true"] [data-codex-composer="true"]')
    return {
      activeElementSlot: activeElement?.getAttribute('data-session-slot') ?? activeElement?.getAttribute('data-slot') ?? null,
      composerFocused: document.activeElement === composer,
      routedValue: composer?.value ?? '',
    }
  })

  if (!metrics.composerFocused || metrics.routedValue !== 'z')
    throw new Error(`Plain key did not route into the session composer: ${JSON.stringify(metrics)}`)

  await composer.fill('')
  return metrics
}

async function assertSessionChatRhythm(
  page: Page,
  expectedUserText: string,
  options: { requireComposerFocus: boolean },
): Promise<ChatRhythmMetrics> {
  await page.waitForFunction((message) => {
    const scroller = document.querySelector('[data-chat-transcript-scroll="true"]')
    if (!scroller)
      return false
    const turns = scroller.querySelectorAll('[data-transcript-slot="transcript-turn"]')
    const userMessages = Array.from(scroller.querySelectorAll('[data-transcript-slot="user-message"]'))
    return turns.length >= 4 && userMessages.some(messageNode => messageNode.textContent?.includes(message))
  }, expectedUserText, { timeout: WORKBENCH_RENDER_TIMEOUT_MS })

  if (options.requireComposerFocus) {
    await page.waitForFunction(() => {
      return document.activeElement?.matches('[data-chat-surface="true"] [data-session-slot="composer-input"]') === true
    }, undefined, { timeout: WORKBENCH_RENDER_TIMEOUT_MS })
  }

  const metrics = await page.evaluate((message): ChatRhythmMetrics => {
    const activeElement = document.activeElement as HTMLElement | null
    const scroller = document.querySelector<HTMLElement>('[data-chat-transcript-scroll="true"]')
    const activeElementSlot = activeElement?.getAttribute('data-session-slot') ?? activeElement?.getAttribute('data-slot') ?? null
    if (!scroller) {
      return {
        activeElementSlot,
        composerFocused: false,
        latestBottom: null,
        latestText: null,
        latestTop: null,
        latestVisible: false,
        scrollBottom: null,
        scrollClientHeight: null,
        scrollHeight: null,
        scrollTop: null,
        submittedUserVisible: false,
        turnCount: 0,
      }
    }

    const turns = Array.from(scroller.querySelectorAll<HTMLElement>('[data-transcript-slot="transcript-turn"]'))
    const latestTurn = turns.at(-1) ?? null
    const scrollerRect = scroller.getBoundingClientRect()
    const latestRect = latestTurn?.getBoundingClientRect() ?? null
    const submittedUserVisible = Array.from(scroller.querySelectorAll<HTMLElement>('[data-transcript-slot="user-message"]'))
      .some((messageNode) => {
        if (!messageNode.textContent?.includes(message))
          return false
        const rect = messageNode.getBoundingClientRect()
        return rect.bottom <= scrollerRect.bottom + 2 && rect.top >= scrollerRect.top - 2
      })

    return {
      activeElementSlot,
      composerFocused: activeElement?.matches('[data-chat-surface="true"] [data-session-slot="composer-input"]') ?? false,
      latestBottom: latestRect ? Math.round(latestRect.bottom) : null,
      latestText: latestTurn?.textContent?.trim() ?? null,
      latestTop: latestRect ? Math.round(latestRect.top) : null,
      latestVisible: latestRect ? latestRect.bottom <= scrollerRect.bottom + 2 && latestRect.top >= scrollerRect.top - 2 : false,
      scrollBottom: Math.round(scrollerRect.bottom),
      scrollClientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
      submittedUserVisible,
      turnCount: turns.length,
    }
  }, expectedUserText)

  if (options.requireComposerFocus && !metrics.composerFocused)
    throw new Error(`Session composer did not restore keyboard focus after submit: ${JSON.stringify(metrics)}`)
  if (!metrics.submittedUserVisible)
    throw new Error(`Submitted user message is not visible in the transcript viewport: ${JSON.stringify(metrics)}`)
  if (!metrics.latestVisible)
    throw new Error(`Latest transcript turn is not visible after submit/refresh: ${JSON.stringify(metrics)}`)
  return metrics
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
    `if [ "${shFirstArg}" = "--version" ]; then printf 'codex-browser-chat-experience\n'; exit 0; fi`,
    `printf '%s\n' "{\"type\":\"thread.started\",\"thread_id\":\"native-thread-${shThreadSeq}\"}"`,
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
    throw new Error(`Browser chat flow created ${invocations.length} invocation(s), expected at least ${minSucceededInvocations}: ${JSON.stringify(proof.body)}`)
  if (!invocations.every(invocation => isRecord(invocation) && invocation.sessionId === routeIds.sessionId && invocation.status === 'succeeded'))
    throw new Error(`Browser chat flow invocation proof is not session-scoped/succeeded: ${JSON.stringify(proof.body)}`)
  const serialized = JSON.stringify(proof.body)
  for (const forbidden of ['/turns/', '"turn"', 'sk-browser-chat-experience-secret']) {
    if (serialized.includes(forbidden))
      throw new Error(`Session proof exposed forbidden content ${forbidden}: ${serialized}`)
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
