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

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
try {
  browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { height: 900, width: 1280 } })
  await page.goto(`http://${server.hostname}:${server.port}/`, { waitUntil: 'networkidle' })

  await page.getByText('Soul Apps (2)').waitFor({ timeout: 10_000 })
  await page.getByText('API /api/local/apps/aiworker-hr').waitFor({ timeout: 10_000 })
  await page.getByText('4 mounted slots').first().waitFor({ timeout: 10_000 })
  await page.getByText('HR Mounted Workbench').waitFor({ timeout: 10_000 })

  const frameElement = page.frameLocator('iframe[title="People widget"]')
  await frameElement.getByText('Mounted HR frame surface').waitFor({ timeout: 10_000 })

  console.log(JSON.stringify({
    appId: 'aiworker-hr',
    frame: 'pass',
    host: `http://${server.hostname}:${server.port}`,
    status: 'pass',
    surface: 'pass',
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
