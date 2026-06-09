import type { Page } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { chromium } from 'playwright'

import { devAdminHostEnv } from './host-serve-env'

const repoRoot = join(import.meta.dir, '..', '..')
const evidenceRoot = join(repoRoot, 'tmp', `host-single-serve-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const adminEmail = 'admin@zonease.org'
const LOGOUT_PATH = '/auth/logout'
const browserEvents: string[] = []
const evidence: Record<string, unknown> = {}

let hostProcess: ReturnType<typeof Bun.spawn> | null = null
let hostExitCode: null | number = null
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

await mkdir(evidenceRoot, { recursive: true })

try {
  const port = reservePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const hostUrl = new URL('/host', baseUrl).toString()
  const dbPath = join(evidenceRoot, 'host.db')
  const webStaticDir = join(repoRoot, 'apps', 'host-web', 'dist')

  hostProcess = startHostServe({ baseUrl, dbPath, port, webStaticDir })
  hostProcess.exited.then((code) => {
    hostExitCode = code
  }).catch(() => {
    hostExitCode = -1
  })

  await waitForDocument(hostUrl)
  assertHostStillRunning()

  const optionsResponse = await fetch(new URL('/api/host/options', baseUrl))
  const optionsText = await optionsResponse.text()
  if (!optionsResponse.ok)
    throw new Error(`Host options failed with HTTP ${optionsResponse.status}: ${optionsText}`)
  const options = JSON.parse(optionsText) as {
    provisioningTargets?: Array<{ adapterType?: string, displayName?: string, maturity?: string, ref?: string }>
  }
  const localTarget = options.provisioningTargets?.find(target => target.adapterType === 'local' && target.maturity === 'dev')
  if (!localTarget)
    throw new Error(`Host options did not include local dev provisioning target: ${optionsText}`)

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { height: 900, width: 1440 } })
  captureBrowserEvents(page)

  const status = await gotoDocument(page, hostUrl)
  await page.getByRole('heading', { name: 'AI Workers' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('navigation', { name: 'Host navigation' }).waitFor({ state: 'visible', timeout: 10000 })

  // P2-1 regression: the logout affordance must survive the sidebar collapsing
  // to the icon rail. The happy-dom unit tests cannot see this (it is pure
  // Tailwind CSS), so prove it in a real browser — collapse via the trigger,
  // then assert the logout control is still visible, enabled, and posts to
  // /auth/logout from inside the rail. We avoid the canonical avatar
  // DropdownMenu (radix popover) on purpose; the footer just stacks the logout
  // icon button under the avatar when collapsed.
  const logoutButton = page.getByRole('button', { name: '退出登录' })
  await logoutButton.waitFor({ state: 'visible', timeout: 10000 })
  const toggleSidebar = page.getByRole('button', { name: 'Toggle Sidebar' }).first()
  await toggleSidebar.click()
  await page.locator('[data-slot="sidebar"][data-state="collapsed"][data-collapsible="icon"]')
    .first()
    .waitFor({ state: 'attached', timeout: 10000 })
  const collapsedLogoutVisible = await logoutButton.isVisible()
  const collapsedLogoutEnabled = await logoutButton.isEnabled()
  const collapsedLogoutAction = await logoutButton.evaluate(node => node.closest('form')?.getAttribute('action') ?? null)
  if (!collapsedLogoutVisible)
    throw new Error('P2-1 regression: logout control was hidden once the sidebar collapsed to the icon rail')
  if (!collapsedLogoutEnabled)
    throw new Error('P2-1 regression: logout control was disabled once the sidebar collapsed to the icon rail')
  if (collapsedLogoutAction !== LOGOUT_PATH)
    throw new Error(`P2-1 regression: collapsed logout form action was ${String(collapsedLogoutAction)} (expected ${LOGOUT_PATH})`)
  await page.screenshot({ path: join(evidenceRoot, 'collapsed-rail-logout.png') })
  evidence.collapsedRailLogout = {
    action: collapsedLogoutAction,
    enabled: collapsedLogoutEnabled,
    visible: collapsedLogoutVisible,
  }
  // Restore the expanded layout for the remaining provisioning assertions.
  await toggleSidebar.click()
  await page.locator('[data-slot="sidebar"][data-state="expanded"]')
    .first()
    .waitFor({ state: 'attached', timeout: 10000 })

  // Provisioning is an on-demand right drawer (Sheet) now; open it before
  // asserting the create form is reachable.
  await page.getByRole('button', { name: '开通 AI Worker' }).first().click()
  await page.getByRole('dialog', { name: '开通 AI Worker' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('button', { name: '创建开通' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByLabel('provisioning target').waitFor({ state: 'visible', timeout: 10000 })
  if (await page.getByLabel('aissh server').count() !== 0)
    throw new Error('Host single serve still exposed legacy aissh server label')

  const unexpectedBrowserEvents = browserEvents.filter(event => !isExpectedBrowserEvent(event))
  if (unexpectedBrowserEvents.length > 0)
    throw new Error(`Unexpected browser errors during Host single serve proof: ${unexpectedBrowserEvents.join('\n')}`)

  evidence.proof = {
    baseUrl,
    hostProcess: {
      exitCode: hostExitCode,
      webStaticDir,
    },
    hostUrl,
    optionsStatus: optionsResponse.status,
    optionsTargets: options.provisioningTargets,
    provisioningTargetVisible: await page.getByLabel('provisioning target').isVisible(),
    sameOriginApi: new URL('/api/host/options', baseUrl).toString(),
    status,
  }

  await writeEvidence('proof.json', {
    browserEvents,
    command: displayHostServeCommand({ baseUrl, dbPath, port, webStaticDir }),
    hostExitCode,
    ...evidence,
  })
}
catch (error) {
  await writeEvidence('failure.json', {
    browserEvents,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    hostExitCode,
    ...evidence,
  })
  throw error
}
finally {
  if (browser)
    await browser.close()
  await stopProcess(hostProcess)
}

interface HostServeInput {
  baseUrl: string
  dbPath: string
  port: number
  webStaticDir: string
}

function startHostServe(input: HostServeInput) {
  return Bun.spawn({
    cmd: [
      process.execPath,
      'apps/host-cli/src/aiworker-host.ts',
      'serve',
      '--db',
      input.dbPath,
      '--dev-admin-email',
      adminEmail,
      '--host',
      '127.0.0.1',
      '--public-base-url',
      input.baseUrl,
      '--port',
      String(input.port),
      '--web-static-dir',
      input.webStaticDir,
    ],
    cwd: repoRoot,
    // dev-admin 模式（清空 Logto session env，见 ./host-serve-env），否则根 .env 的 Logto keys
    // 会让 /host 走真 Logto 登录 → 400。产品登录门不变，仅本 dev-serve 证明不配置 Logto。
    env: devAdminHostEnv(),
    stderr: 'pipe',
    stdout: 'pipe',
  })
}

function displayHostServeCommand(input: HostServeInput): string[] {
  return [
    'bun',
    'apps/host-cli/src/aiworker-host.ts',
    'serve',
    '--db',
    input.dbPath,
    '--dev-admin-email',
    adminEmail,
    '--host',
    '127.0.0.1',
    '--public-base-url',
    input.baseUrl,
    '--port',
    String(input.port),
    '--web-static-dir',
    input.webStaticDir,
  ]
}

function captureBrowserEvents(page: Page): void {
  page.on('console', (message) => {
    if (message.type() === 'error')
      browserEvents.push(`console:${message.type()}:${message.text()}`)
  })
  page.on('pageerror', error => browserEvents.push(`pageerror:${error.message}`))
  page.on('requestfailed', request => browserEvents.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? 'unknown'}`))
  page.on('response', (response) => {
    if (response.status() >= 400)
      browserEvents.push(`response:${response.status()}:${response.url()}`)
  })
}

async function gotoDocument(page: Page, url: string): Promise<number> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
  if (!response)
    throw new Error(`${url} returned no HTTP response`)
  if (!response.ok())
    throw new Error(`${url} returned HTTP ${response.status()}`)
  return response.status()
}

function isExpectedBrowserEvent(event: string): boolean {
  const normalized = event.toLowerCase()
  return normalized.includes('/api/host/options') && normalized.includes('err_aborted')
}

function assertHostStillRunning(): void {
  if (hostExitCode !== null)
    throw new Error(`Host serve exited early with code ${hostExitCode}`)
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
    throw new Error('Failed to reserve a Host single serve browser proof port')
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
    assertHostStillRunning()
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Host single serve did not become reachable at ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function stopProcess(child: ReturnType<typeof Bun.spawn> | null): Promise<void> {
  if (!child)
    return

  const alreadyExited = await Promise.race([
    child.exited.then(() => true).catch(() => true),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), 0)),
  ])
  if (!alreadyExited) {
    child.kill('SIGTERM')
    const terminated = await Promise.race([
      child.exited.then(() => true).catch(() => true),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 3000)),
    ])
    if (!terminated) {
      child.kill('SIGKILL')
      await child.exited.catch(() => undefined)
    }
  }

  await writeEvidence('host-stdout.log', await new Response(child.stdout).text())
  await writeEvidence('host-stderr.log', await new Response(child.stderr).text())
}

async function writeEvidence(name: string, value: unknown): Promise<void> {
  await writeFile(
    join(evidenceRoot, name),
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
  )
}
