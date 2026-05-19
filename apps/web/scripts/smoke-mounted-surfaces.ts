import type { Locator, Page } from 'playwright'

import { existsSync, mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { chromium } from 'playwright'

import { bootstrapWorkerApp } from '../../api/src/modes/worker'

const repoRoot = path.resolve(import.meta.dir, '..', '..', '..')
const webStaticDir = path.join(repoRoot, 'apps/web/dist/worker')

if (!existsSync(path.join(webStaticDir, 'index.html'))) {
  console.error(`Worker Web build is missing: ${webStaticDir}. Run bun run --filter '@zonease/aiworker-web' build first.`)
  process.exit(1)
}

const root = mkdtempSync(path.join(tmpdir(), 'aiworker-mounted-surface-smoke-'))
const boot = await bootstrapWorkerApp({
  dbPath: path.join(root, 'worker.db'),
  executor: {
    async invoke(input) {
      input.onEvent?.({ kind: 'text', text: 'smoke' })
      return {
        artifacts: [],
        lessons: [],
        review: { findings: [], verdict: 'pass' },
        summary: 'smoke',
      }
    },
  },
  runtimeVersion: 'mounted-surface-smoke',
  webStaticDir,
  workersRoot: path.join(root, 'workers'),
})
const server = Bun.serve({
  fetch: boot.app.fetch,
  hostname: '127.0.0.1',
  port: 0,
})
const host = `http://${server.hostname}:${server.port}`

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
try {
  await assertMountedSurfaces(host)

  browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { height: 900, width: 1280 } })
  await page.goto(`${host}/`, { waitUntil: 'networkidle' })

  await page.getByRole('heading', { name: 'Choose a Soul App to start' }).waitFor({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Start AIWorker HR' }).click()
  const createWorkerDialog = page.getByRole('dialog', { name: 'Create worker' })
  await createWorkerDialog.waitFor({ timeout: 10_000 })
  await assertLocatorWithinViewport(page, createWorkerDialog, 'create worker dialog')
  await createWorkerDialog.getByRole('button', { name: 'Create worker' }).click()
  await page.getByTestId('hr-people-workbench').waitFor({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Soul Apps' }).click()
  const settingsDialog = page.getByRole('dialog', { name: 'Platform Settings' })
  await settingsDialog.waitFor({ timeout: 10_000 })
  await assertLocatorWithinViewport(page, settingsDialog, 'settings dialog')
  await settingsDialog.getByRole('button', { name: /Execution/ }).click()
  await assertEngineIconSurface(page)
  await settingsDialog.getByRole('button', { name: /Soul Apps/ }).click()
  await page.getByText('API /api/local/apps/aiworker-hr').waitFor({ timeout: 10_000 })
  await page.getByText('4 mounted contributions').first().waitFor({ timeout: 10_000 })

  console.log(JSON.stringify({
    appId: 'aiworker-hr',
    firstRun: 'pass',
    frameSurface: 'pass',
    host,
    status: 'pass',
    settings: 'pass',
    surfaceDescriptor: 'pass',
  }))
}
finally {
  await browser?.close().catch(() => undefined)
  for (const service of boot.state.mountedAppServices.values()) {
    if (service.process && !service.process.killed)
      service.process.kill('SIGTERM')
  }
  server.stop(true)
  await rm(root, { force: true, recursive: true })
}

async function launchBrowser(): Promise<Awaited<ReturnType<typeof chromium.launch>>> {
  try {
    return await chromium.launch({
      args: ['--no-sandbox'],
      channel: 'chrome',
      headless: true,
    })
  }
  catch {
    return await chromium.launch({
      args: ['--no-sandbox'],
      headless: true,
    })
  }
}

async function assertMountedSurfaces(host: string): Promise<void> {
  const descriptor = await fetchJson<{
    renderer?: string
    title?: string
    type?: string
  }>(`${host}/api/local/apps/aiworker-hr/surfaces/hr-home`)
  if (descriptor.title !== 'HR Mounted Workbench' || descriptor.renderer !== 'host-descriptor' || descriptor.type !== 'aiworker.surface.descriptor.v1')
    throw new Error('HR mounted descriptor surface did not resolve through the Host API.')

  const widget = await fetchJson<{
    frame?: { title?: string, url?: string }
  }>(`${host}/api/local/apps/aiworker-hr/surfaces/hr-people-widget`)
  if (widget.frame?.title !== 'People widget' || !widget.frame.url)
    throw new Error('HR mounted frame surface did not resolve through the Host API.')

  const frame = await fetch(new URL(widget.frame.url, host))
  const html = await frame.text()
  if (!frame.ok || !html.includes('Mounted HR frame surface'))
    throw new Error(`HR mounted frame content did not load: ${frame.status}`)
}

async function assertLocatorWithinViewport(page: Page, locator: Locator, name: string): Promise<void> {
  const [box, viewport] = await Promise.all([
    locator.boundingBox(),
    page.viewportSize(),
  ])
  if (!box)
    throw new Error(`${name} is not visible.`)
  if (!viewport)
    throw new Error(`Viewport is unavailable while checking ${name}.`)
  const outsideViewport = box.x < 0
    || box.y < 0
    || box.x + box.width > viewport.width + 1
    || box.y + box.height > viewport.height + 1
  if (outsideViewport)
    throw new Error(`${name} is outside the viewport: ${JSON.stringify({ box, viewport })}`)
}

async function assertEngineIconSurface(page: Page): Promise<void> {
  const icon = page.locator('[data-engine-icon="codex"] .agent-icon-shape').first()
  await icon.waitFor({ timeout: 10_000 })
  const state = await icon.evaluate((element) => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return {
      background: style.backgroundColor,
      height: box.height,
      maskImage: style.maskImage,
      webkitMaskImage: style.webkitMaskImage,
      width: box.width,
    }
  })
  if (state.width <= 0 || state.height <= 0)
    throw new Error(`Engine icon has no visible box: ${JSON.stringify(state)}`)
  if ((!state.maskImage || state.maskImage === 'none') && (!state.webkitMaskImage || state.webkitMaskImage === 'none'))
    throw new Error(`Engine icon mask is missing: ${JSON.stringify(state)}`)

  const asset = await fetch(new URL('/engine-icons/openai.svg', page.url()))
  if (!asset.ok)
    throw new Error(`Engine icon asset is unavailable: ${asset.status}`)
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`Request failed ${response.status}: ${url}`)
  return await response.json() as T
}
