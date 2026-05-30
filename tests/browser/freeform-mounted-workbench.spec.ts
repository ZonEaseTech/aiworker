import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

import { parseSoulDescriptorV1 } from '../../packages/soul-protocol/src/index'
import { MOUNT_TIMEOUT_MS } from './mount-wait'

const repoRoot = join(import.meta.dir, '..', '..')
const workerId = 'freeform-worker'
const workspaceId = 'freeform-workspace'
const sessionId = 'freeform-session'
const descriptor = parseSoulDescriptorV1(JSON.parse(readFileSync(join(repoRoot, 'souls/aiworker-freeform/dist/soul.descriptor.json'), 'utf8')))
const workbenchHtml = readFileSync(join(repoRoot, 'souls/aiworker-freeform', descriptor.workbench.entry), 'utf8')
const microAppRuntime = readFileSync(join(repoRoot, 'node_modules/.bun/@micro-zoe+micro-app@1.0.0-rc.30/node_modules/@micro-zoe/micro-app/lib/index.esm.js'), 'utf8')

function hostPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AIWorker Freeform Host Mount Proof</title>
</head>
<body>
  <main data-host-web="true" data-worker-id="${workerId}" data-workspace-id="${workspaceId}" data-session-id="${sessionId}">
    <h1>AIWorker Host Web</h1>
    <div id="mount-root"></div>
  </main>
  <script>
    globalThis.process = { env: { NODE_ENV: 'production' } }
  </script>
  <script type="module">
    import microApp from '/vendor/micro-app.esm.js'

    microApp.start({
      'disable-sandbox': false,
      'disable-scopecss': false,
      iframe: false,
    })

    const response = await fetch('/api/mount/workbench?workerId=${workerId}&workspaceId=${workspaceId}&sessionId=${sessionId}')
    const resolved = await response.json()
    window.__AIWORKER_MOUNT_PROOF__ = resolved

    const mount = document.createElement('micro-app')
    mount.setAttribute('data-slot', 'soul-app-mounted-micro-app')
    mount.setAttribute('name', resolved.mount.appId + '--' + resolved.mount.surfaceId)
    mount.setAttribute('router-mode', resolved.routerMode)
    mount.setAttribute('url', resolved.mount.entry + '?workerId=' + resolved.locator.workerId + '&workspaceId=' + resolved.locator.workspaceId + '&sessionId=' + resolved.locator.sessionId)
    mount.data = {
      appId: resolved.mount.appId,
      sessionId: resolved.locator.sessionId,
      surfaceId: resolved.mount.surfaceId,
      workerId: resolved.locator.workerId,
      workspaceId: resolved.locator.workspaceId,
    }
    document.querySelector('#mount-root').append(mount)
  </script>
</body>
</html>
`
}

const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === `/workers/${workerId}/workspaces/${workspaceId}/sessions/${sessionId}`) {
      return new Response(hostPage(), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    if (url.pathname === '/vendor/micro-app.esm.js') {
      return new Response(microAppRuntime, {
        headers: { 'content-type': 'text/javascript; charset=utf-8' },
      })
    }

    if (url.pathname === '/api/mount/workbench') {
      const locator = {
        sessionId: url.searchParams.get('sessionId'),
        workerId: url.searchParams.get('workerId'),
        workspaceId: url.searchParams.get('workspaceId'),
      }
      return Response.json({
        locator,
        mount: {
          appId: descriptor.identity.appId,
          entry: `/api/apps/${descriptor.identity.appId}/${descriptor.workbench.entry}`,
          surfaceId: 'workbench',
          type: descriptor.workbench.type,
        },
        routerMode: descriptor.workbench.router.mode,
      })
    }

    if (url.pathname === `/api/apps/${descriptor.identity.appId}/${descriptor.workbench.entry}`) {
      return new Response(workbenchHtml, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    return new Response('Not found', { status: 404 })
  },
})

try {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const browserEvents: string[] = []
    page.on('console', message => browserEvents.push(`console:${message.type()}:${message.text()}`))
    page.on('pageerror', error => browserEvents.push(`pageerror:${error.message}`))
    page.on('requestfailed', request => browserEvents.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? 'unknown'}`))
    await page.goto(`http://127.0.0.1:${server.port}/workers/${workerId}/workspaces/${workspaceId}/sessions/${sessionId}`)
    const microApp = page.locator('micro-app[data-slot="soul-app-mounted-micro-app"]')
    await microApp.waitFor({ state: 'attached', timeout: MOUNT_TIMEOUT_MS })

    const mountAttributes = await microApp.evaluate(element => ({
      data: (element as HTMLElement & { data?: unknown }).data,
      routerMode: element.getAttribute('router-mode'),
      url: element.getAttribute('url'),
    }))
    if (mountAttributes.routerMode !== 'search')
      throw new Error(`Expected router-mode=search, received ${mountAttributes.routerMode}`)
    if (!mountAttributes.url?.includes(`/api/apps/${descriptor.identity.appId}/dist/web/workbench/index.html`))
      throw new Error(`Mounted URL did not point to Freeform workbench entry: ${mountAttributes.url}`)

    try {
      await page.waitForFunction(() => {
        const text = document.body.textContent ?? ''
        const microApp = document.querySelector('micro-app') as (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null
        return text.includes('AIWorker Common Workbench')
          || text.includes('Bridge event refs')
          || Boolean(document.querySelector('[data-aiworker-common-workbench="true"]'))
          || Boolean(microApp?.shadowRoot?.querySelector('[data-aiworker-common-workbench="true"]'))
          || Boolean(document.querySelector('micro-app[data-slot="soul-app-mounted-micro-app"][data-child-ready="true"]'))
      }, undefined, { timeout: MOUNT_TIMEOUT_MS })
    }
    catch (error) {
      const diagnostics = await page.evaluate(() => {
        const microApp = document.querySelector('micro-app') as (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null
        return {
          bodyText: document.body.textContent,
          microAppHtml: microApp?.outerHTML,
          shadowHtml: microApp?.shadowRoot?.innerHTML,
        }
      })
      throw new Error(`Freeform workbench did not render within micro-app: ${JSON.stringify({ browserEvents, diagnostics, error: error instanceof Error ? error.message : String(error) })}`)
    }

    const commonWorkbenchRendered = await page.evaluate(() => {
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
    if (!commonWorkbenchRendered.commonRoot)
      throw new Error(`Freeform common workbench root did not render: ${commonWorkbenchRendered.text}`)
    if (!commonWorkbenchRendered.bridgeRefs || !commonWorkbenchRendered.text.includes('Bridge event refs'))
      throw new Error(`Bridge event refs were not visible to the mounted surface: ${commonWorkbenchRendered.text}`)

    const proof = await page.evaluate(() => (window as unknown as { __AIWORKER_MOUNT_PROOF__?: unknown }).__AIWORKER_MOUNT_PROOF__)
    const proofText = JSON.stringify(proof)
    if (!proofText.includes(workerId) || !proofText.includes(workspaceId) || !proofText.includes(sessionId))
      throw new Error(`Mount proof did not preserve locator context: ${proofText}`)
  }
  finally {
    await browser.close()
  }
}
finally {
  server.stop(true)
}
