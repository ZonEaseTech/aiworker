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
  await page.locator('micro-app[data-slot="soul-app-mounted-micro-app"][router-mode="pure"]').waitFor({ timeout: 10_000 })
  await selectHrRouteThroughWorkerConfiguration(page)
  await page.getByText('Profile patch ready').waitFor({ timeout: 10_000 })
  await page.getByText('Confirmed Facts').waitFor({ timeout: 10_000 })
  await assertHrMountedReadingRoomLayout(page, 'desktop')
  await page.setViewportSize({ height: 900, width: 760 })
  await assertHrMountedReadingRoomLayout(page, 'narrow')
  await page.setViewportSize({ height: 900, width: 1280 })
  await page.getByRole('button', { name: /Platform settings/ }).click()
  const settingsDialog = page.getByRole('dialog', { name: 'Local Host Settings' })
  await settingsDialog.waitFor({ timeout: 10_000 })
  await assertLocatorWithinViewport(page, settingsDialog, 'settings dialog')
  await settingsDialog.getByRole('tab', { name: /Execution/ }).click()
  await assertEngineIconSurface(page)
  await settingsDialog.getByRole('tab', { name: /Soul Apps/ }).click()
  await page.getByText('API /api/local/apps/aiworker-hr').waitFor({ timeout: 10_000 })
  await page.getByText('3 mounted contributions').first().waitFor({ timeout: 10_000 })

  console.log(JSON.stringify({
    appId: 'aiworker-hr',
    firstRun: 'pass',
    host,
    microAppSurface: 'pass',
    routeMicroApp: 'pass',
    status: 'pass',
    settings: 'pass',
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
  const route = await fetchJson<{
    microApp?: { name?: string, url?: string }
  }>(`${host}/api/local/apps/aiworker-hr/surfaces/hr-home`)
  if (route.microApp?.name !== 'aiworker-hr--hr-home' || !route.microApp.url)
    throw new Error('HR mounted route micro-app surface did not resolve through the Host API.')

  const routeMicroApp = await fetch(new URL(route.microApp.url, host))
  const routeHtml = await routeMicroApp.text()
  const requiredRouteContent = [
    'data-slot="hr-profile-list-column"',
    'data-slot="hr-reading-room-column"',
    'data-slot="hr-profile-composer-column"',
    '候选人',
    '在职员工',
    '离职归档',
    '候选人档案草案',
    'Ben People Profile',
    'Confirmed Facts',
    'Primary sources',
  ]
  if (!routeMicroApp.ok || requiredRouteContent.some(marker => !routeHtml.includes(marker)))
    throw new Error(`HR mounted route micro-app content did not load: ${routeMicroApp.status}`)

  const widget = await fetchJson<{
    microApp?: { name?: string, url?: string }
  }>(`${host}/api/local/apps/aiworker-hr/surfaces/hr-people-widget`)
  if (widget.microApp?.name !== 'aiworker-hr--hr-people-widget' || !widget.microApp.url)
    throw new Error('HR mounted micro-app surface did not resolve through the Host API.')

  const microApp = await fetch(new URL(widget.microApp.url, host))
  const html = await microApp.text()
  if (!microApp.ok || !html.includes('Mounted HR micro-app surface'))
    throw new Error(`HR mounted micro-app content did not load: ${microApp.status}`)
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

async function assertHrMountedReadingRoomLayout(page: Page, mode: 'desktop' | 'narrow'): Promise<void> {
  const surface = page.locator('[data-slot="hr-route-surface"]').first()
  await surface.waitFor({ timeout: 10_000 })
  const state = await surface.evaluate((element) => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return {
      box: {
        height: box.height,
        width: box.width,
      },
      childCount: element.children.length,
      gridTemplateColumns: style.gridTemplateColumns,
      leftPanel: element.getAttribute('data-left-panel'),
      rightPanel: element.getAttribute('data-right-panel'),
    }
  })
  const trackCount = countGridTracks(state.gridTemplateColumns)
  if (state.childCount !== 3 || state.leftPanel !== 'open' || state.rightPanel !== 'open' || state.box.width <= 0 || state.box.height <= 0)
    throw new Error(`HR mounted reading room layout is not visible/open in ${mode} mode: ${JSON.stringify(state)}`)
  if (mode === 'desktop' && trackCount < 3)
    throw new Error(`HR mounted reading room desktop layout did not resolve to at least 3 grid tracks: ${JSON.stringify({ ...state, trackCount })}`)
  if (mode === 'narrow' && trackCount !== 1)
    throw new Error(`HR mounted reading room narrow layout did not resolve to 1 grid track: ${JSON.stringify({ ...state, trackCount })}`)
}

async function selectHrRouteThroughWorkerConfiguration(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Configure / }).first().click()
  const workerConfigDialog = page.getByRole('dialog', { name: 'Worker configuration' })
  await workerConfigDialog.waitFor({ timeout: 10_000 })
  await assertLocatorWithinViewport(page, workerConfigDialog, 'worker configuration dialog')
  await workerConfigDialog.getByRole('button', { name: /^Workbench/ }).click()
  await workerConfigDialog.getByRole('tab', { name: 'HR' }).click()
  await page.waitForFunction(() => {
    const microApp = document.querySelector('micro-app[data-slot="soul-app-mounted-micro-app"][router-mode="pure"]')
    return microApp?.getAttribute('url')?.includes('/micro-app/routes/hr-home') ?? false
  }, undefined, { timeout: 10_000 })
  await workerConfigDialog.getByRole('button', { name: 'Close' }).click()
}

function countGridTracks(value: string): number {
  let depth = 0
  let count = 0
  let inTrack = false
  for (const char of value.trim()) {
    if (char === '(')
      depth += 1
    else if (char === ')' && depth > 0)
      depth -= 1

    if (depth === 0 && /\s/.test(char)) {
      if (inTrack) {
        count += 1
        inTrack = false
      }
      continue
    }

    inTrack = true
  }
  return inTrack ? count + 1 : count
}

async function assertEngineIconSurface(page: Page): Promise<void> {
  const icon = page.locator('[data-engine-icon="codex"]').first()
  await icon.waitFor({ timeout: 10_000 })
  const state = await icon.evaluate((element) => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return {
      background: style.backgroundColor,
      dataSlot: element.getAttribute('data-slot'),
      iconSrc: element.getAttribute('data-engine-icon-src'),
      height: box.height,
      maskImage: style.maskImage,
      webkitMaskImage: style.webkitMaskImage,
      width: box.width,
    }
  })
  if (state.width <= 0 || state.height <= 0)
    throw new Error(`Engine icon has no visible box: ${JSON.stringify(state)}`)
  if (state.dataSlot !== 'item-media' || !state.iconSrc?.includes('/engine-icons/openai.svg'))
    throw new Error(`Engine icon does not use the shadcn ItemMedia asset surface: ${JSON.stringify(state)}`)
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
