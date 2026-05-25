import type { LocalExecutor } from '@zonease/aiworker-soul-app-runtime'

import { Buffer } from 'node:buffer'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  createMountedSoulAppTestRuntime,
  createStandaloneSoulAppRuntime,
} from '@zonease/aiworker-soul-app-runtime'
import {
  namespaceSoulAppCapabilityId,
} from '@zonease/aiworker-soul-app-sdk'
import { afterEach, describe, expect, it } from 'bun:test'

import hrManifestJson from '../soul-app.manifest.json' with { type: 'json' }
import { HR_REFERENCE_APP_BOUNDARY, hrReferenceSoulApp } from './index'
import { serveHostMounted } from './mounted/host-mounted'
import { renderStandaloneHtml, serveStandalone } from './standalone/standalone'

const now = () => '2026-05-13T00:25:00.000Z'

const executor: LocalExecutor = {
  async invoke(_input) {
    return {
      summary: 'HR reference app created one people profile artifact.',
    }
  },
}

describe('HR reference Soul App', () => {
  let roots: string[] = []

  afterEach(async () => {
    for (const root of roots)
      await rm(root, { recursive: true, force: true })
    roots = []
  })

  it('declares an external package boundary and protocol handlers', async () => {
    expect(HR_REFERENCE_APP_BOUNDARY.packageName).toBe('@zonease/aiworker-hr')
    expect(hrReferenceSoulApp.manifest.id).toBe('aiworker-hr')
    expect(await hrReferenceSoulApp.connector?.declareConnectorNeeds({ appId: 'aiworker-hr', permissions: hrReferenceSoulApp.manifest.permissions })).toHaveLength(2)
    expect((await hrReferenceSoulApp.runtime?.resolveCapability({ appId: 'aiworker-hr', permissions: hrReferenceSoulApp.manifest.permissions }, { capabilityId: 'candidate-screen' }))?.id).toBe('candidate-screen')
    expect(hrManifestJson.permissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'read', kind: 'search', target: 'aiworker-hr' }),
      expect.objectContaining({ action: 'write', kind: 'search', target: 'aiworker-hr' }),
    ]))
    expect(Object.hasOwn(hrManifestJson.ui, 'workbench')).toBeFalse()
    expect(JSON.stringify(hrManifestJson.ui)).not.toContain('host-descriptor')
    expect(hrManifestJson.ui.workspaceContext?.terminal?.cwd).toEqual({ source: 'host-workspace-root' })
    expect(hrManifestJson.ui.routes.map(route => route.id)).toEqual(['universal-workbench', 'hr-home'])
    expect(hrManifestJson.ui.routes.find(route => route.id === 'universal-workbench')?.surface).toMatchObject({
      entry: '/micro-app/workbench/universal',
      renderer: 'micro-app',
      scope: 'app',
    })
    expect(hrManifestJson.ui.routes.find(route => route.id === 'hr-home')?.surface).toMatchObject({
      entry: '/micro-app/routes/hr-home',
      renderer: 'micro-app',
      requiredPermissions: ['ui:mount:hr-micro-app'],
      scope: 'app',
    })
  })

  it('requires the Host mount token for mounted service domain routes', async () => {
    const previousToken = Bun.env.AIWORKER_MOUNT_TOKEN
    Bun.env.AIWORKER_MOUNT_TOKEN = 'test-hr-mounted-token'
    const server = serveHostMounted(0)
    const baseUrl = `http://127.0.0.1:${server.port}`

    try {
      expect((await fetch(`${baseUrl}/health`)).status).toBe(200)
      expect((await fetch(`${baseUrl}/domain`)).status).toBe(401)
      const domainRes = await fetch(`${baseUrl}/domain`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(domainRes.status).toBe(200)
      expect(await domainRes.json()).toMatchObject({ appId: 'aiworker-hr', mounted: true })
      const declaredMicroAppRoutes = hrManifestJson.ui.routes.filter(route =>
        route.surface?.renderer === 'micro-app' && route.surface.entry?.startsWith('/micro-app/'),
      )
      for (const route of declaredMicroAppRoutes) {
        const routeRes = await fetch(`${baseUrl}${route.surface.entry}?workerId=hr-worker&workspaceId=workspace-1&theme=light`, {
          headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
        })
        expect(routeRes.status).toBe(200)
        const routeHtml = await routeRes.text()
        expect(routeHtml).toContain('window.microApp')
        expect(routeHtml).toContain('"appId":"aiworker-hr"')
      }
      const legacyRouteSurfaceRes = await fetch(`${baseUrl}/surfaces/routes/hr-home`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(legacyRouteSurfaceRes.status).toBe(404)
      const legacyPanelSurfaceRes = await fetch(`${baseUrl}/surfaces/panels/hr-profile-panel`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(legacyPanelSurfaceRes.status).toBe(404)
      const routeMicroAppRes = await fetch(`${baseUrl}/micro-app/routes/hr-home?workerId=hr-worker&workspaceId=workspace-1&theme=light`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(routeMicroAppRes.status).toBe(200)
      const routeMicroAppHtml = await routeMicroAppRes.text()
      expect(routeMicroAppHtml).toContain('HR People Workbench')
      expect(routeMicroAppHtml).toContain('Ben People Profile')
      expect(routeMicroAppHtml).toContain('Profile patch ready')
      expect(routeMicroAppHtml).toContain('Confirmed Facts')
      expect(routeMicroAppHtml).toContain('Primary sources')
      expect(routeMicroAppHtml).toContain('<link rel="stylesheet" href="/api/local/apps/aiworker-hr/styles.css">')
      expect(routeMicroAppHtml).toContain('<html lang="en" class="h-full" style="color-scheme:light">')
      expect(routeMicroAppHtml).toContain('<body class="h-full overflow-hidden">')
      expect(routeMicroAppHtml).toContain('<main id="aiworker-hr-root" class="h-full min-h-0"')
      expect(routeMicroAppHtml).toContain('data-slot="card"')
      expect(routeMicroAppHtml).toContain('data-slot="table"')
      expect(routeMicroAppHtml).toContain('data-soul-app-id="aiworker-hr"')
      expect(routeMicroAppHtml).toContain('id="aiworker-micro-app-host-data"')
      expect(routeMicroAppHtml).toContain('"appId":"aiworker-hr"')
      expect(routeMicroAppHtml).toContain('"routePrefix":"/api/local/apps/aiworker-hr"')
      expect(routeMicroAppHtml).toContain('"theme":"light"')
      expect(routeMicroAppHtml).toContain('"workerId":"hr-worker"')
      expect(routeMicroAppHtml).toContain('"workspaceId":"workspace-1"')
      expect(routeMicroAppHtml).toContain('window.microApp')
      expect(routeMicroAppHtml).toContain('api.addDataListener(receiveHostData, true)')
      expect(routeMicroAppHtml).toContain('api.dispatch(payload)')
      expect(routeMicroAppHtml).toContain('<script src="/api/local/apps/aiworker-hr/assets/hr-home-client.js"></script>')
      expect(routeMicroAppHtml).not.toContain('type="module"')
      expect(routeMicroAppHtml).toContain('data-slot="hr-profile-list-column"')
      expect(routeMicroAppHtml).toContain('data-slot="hr-reading-room-column"')
      expect(routeMicroAppHtml).toContain('data-slot="hr-profile-composer-column"')
      expect(routeMicroAppHtml).toContain('data-hr-child-route="/hr"')
      expect(routeMicroAppHtml).toContain('data-hr-route-action="new-profile"')
      expect(routeMicroAppHtml).toContain('data-hr-profile-id="profile-ben"')
      expect(routeMicroAppHtml).toContain('target.closest(\'[data-hr-route-path],[data-hr-route-action]\')')
      expect(routeMicroAppHtml).toContain('window.__AIWORKER_HR_CHILD_ROUTE__')
      expect(routeMicroAppHtml).toContain('data-hr-route-path="/hr/profiles/profile-ben"')
      expect(routeMicroAppHtml).toContain('data-layout="reading-room-primary"')
      expect(routeMicroAppHtml).toContain('hr-reading-room-grid')
      expect(routeMicroAppHtml).toContain('data-left-panel="open"')
      expect(routeMicroAppHtml).toContain('data-right-panel="open"')
      expect(routeMicroAppHtml).not.toContain('xl:grid-cols-[minmax(12rem,0.55fr)_minmax(0,1.85fr)_minmax(15rem,0.72fr)]')
      expect(routeMicroAppHtml).not.toContain('Host-mounted HR route surface.')
      const clientRes = await fetch(`${baseUrl}/assets/hr-home-client.js`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect([200, 503]).toContain(clientRes.status)
      if (clientRes.status === 503) {
        expect(await clientRes.text()).toContain('Soul App client asset has not been built')
      }
      else {
        expect(clientRes.headers.get('cache-control')).toBe('no-store')
        expect(clientRes.headers.get('content-type')).toContain('text/javascript')
        expect(await clientRes.text()).not.toMatch(/\b(?:export|import)\s*(?:\{|from|\*|default)/)
      }
      const darkRouteMicroAppRes = await fetch(`${baseUrl}/micro-app/routes/hr-home?theme=dark`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(darkRouteMicroAppRes.status).toBe(200)
      const darkRouteMicroAppHtml = await darkRouteMicroAppRes.text()
      expect(darkRouteMicroAppHtml).toContain('<html lang="en" class="dark h-full" style="color-scheme:dark">')
      expect(darkRouteMicroAppHtml).toContain('<body class="dark h-full overflow-hidden">')
      const microAppRes = await fetch(`${baseUrl}/micro-app/widgets/hr-people-widget`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(microAppRes.status).toBe(200)
      const microAppHtml = await microAppRes.text()
      expect(microAppHtml).toContain('Mounted HR micro-app surface')
      expect(microAppHtml).toContain('<link rel="stylesheet" href="/api/local/apps/aiworker-hr/styles.css">')
      expect(microAppHtml).toContain('id="aiworker-micro-app-host-data"')
      expect(microAppHtml).toContain('window.microApp')
      expect(microAppHtml).toContain('data-slot="card"')
      expect(microAppHtml).toContain('data-slot="item-content"')
      expect(microAppHtml).not.toContain('<h1>People Widget</h1>')
      const legacyActionRes = await fetch(`${baseUrl}/protocol/actions`, {
        body: JSON.stringify({ input: {}, protocolAction: 'peopleProfiles.create' }),
        headers: {
          'content-type': 'application/json',
          'x-aiworker-mount-token': 'test-hr-mounted-token',
        },
        method: 'POST',
      })
      expect(legacyActionRes.status).toBe(404)
      const legacyCapabilitiesRes = await fetch(`${baseUrl}/protocol/capabilities`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(legacyCapabilitiesRes.status).toBe(404)
      const actionRes = await fetch(`${baseUrl}/api/people-profiles`, {
        body: JSON.stringify({ input: {} }),
        headers: {
          'content-type': 'application/json',
          'x-aiworker-mount-token': 'test-hr-mounted-token',
        },
        method: 'POST',
      })
      expect(actionRes.status).toBe(200)
      expect(await actionRes.json()).toMatchObject({
        message: 'People profile draft opened by HR app.',
        ok: true,
        redirectTo: '/hr/profiles/new',
        refresh: true,
      })
      const wrongMethodActionRes = await fetch(`${baseUrl}/api/people-profiles`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(wrongMethodActionRes.status).toBe(404)

      const capabilitiesRes = await fetch(`${baseUrl}/api/capabilities`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(capabilitiesRes.status).toBe(200)
      expect(await capabilitiesRes.json()).toMatchObject({
        capabilities: expect.arrayContaining([
          expect.objectContaining({ id: 'person-profile' }),
        ]),
      })
      const wrongMethodCapabilitiesRes = await fetch(`${baseUrl}/api/capabilities`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
        method: 'POST',
      })
      expect(wrongMethodCapabilitiesRes.status).toBe(404)

      const searchRes = await fetch(`${baseUrl}/api/people-profiles/search?query=ada&limit=2`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(searchRes.status).toBe(200)
      expect(await searchRes.json()).toMatchObject({
        items: [expect.objectContaining({
          appId: 'aiworker-hr',
          authority: 'soul-app',
          kind: 'people-profile',
        })],
      })
      const legacySearchRes = await fetch(`${baseUrl}/protocol/search?providerId=peopleProfiles.search&query=ada&limit=2`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(legacySearchRes.status).toBe(404)
      const wrongMethodSearchRes = await fetch(`${baseUrl}/api/people-profiles/search`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
        method: 'POST',
      })
      expect(wrongMethodSearchRes.status).toBe(404)
    }
    finally {
      server.stop()
      if (previousToken === undefined)
        delete Bun.env.AIWORKER_MOUNT_TOKEN
      else
        Bun.env.AIWORKER_MOUNT_TOKEN = previousToken
    }
  })

  it('keeps people profile drafts app-owned in mounted mode', async () => {
    const previousToken = Bun.env.AIWORKER_MOUNT_TOKEN
    Bun.env.AIWORKER_MOUNT_TOKEN = 'test-hr-mounted-token'
    const server = serveHostMounted(0)
    const baseUrl = `http://127.0.0.1:${server.port}`
    const mountContext = Buffer.from(JSON.stringify({
      operatorId: 'operator-local',
      sessionId: 'session-hr',
      workerId: 'worker-hr',
      workspaceId: 'workspace-hr',
    })).toString('base64url')

    try {
      const actionRes = await fetch(`${baseUrl}/api/people-profiles`, {
        body: JSON.stringify({ input: {} }),
        headers: {
          'content-type': 'application/json',
          'x-aiworker-mount-context': mountContext,
          'x-aiworker-mount-token': 'test-hr-mounted-token',
        },
        method: 'POST',
      })

      expect(actionRes.status).toBe(200)
      expect(await actionRes.json()).toMatchObject({ ok: true, refresh: true })

      const searchRes = await fetch(`${baseUrl}/api/people-profiles/search?query=people&limit=2`, {
        headers: {
          'x-aiworker-mount-context': mountContext,
          'x-aiworker-mount-token': 'test-hr-mounted-token',
        },
      })
      expect(searchRes.status).toBe(200)
      expect(await searchRes.json()).toMatchObject({
        items: [expect.objectContaining({
          id: 'drafts/people-profile/workspace-hr',
          title: 'People profile draft',
        })],
      })
    }
    finally {
      server.stop()
      if (previousToken === undefined)
        delete Bun.env.AIWORKER_MOUNT_TOKEN
      else
        Bun.env.AIWORKER_MOUNT_TOKEN = previousToken
    }
  })

  it('runs the HR app in standalone and Host-mounted smoke paths', async () => {
    const standaloneHtml = renderStandaloneHtml()
    expect(standaloneHtml).toContain('<html lang="en" class="h-full">')
    expect(standaloneHtml).toContain('<body class="h-full overflow-hidden" data-soul-app-id="aiworker-hr">')
    expect(standaloneHtml).toContain('<main id="aiworker-hr-root" class="h-full min-h-0">')
    expect(standaloneHtml).toContain('<link rel="stylesheet" href="/styles.css">')
    expect(standaloneHtml).toContain('<script id="aiworker-micro-app-host-data" type="application/json" data-slot="micro-app-host-data">{"appId":"aiworker-hr","routePrefix":"standalone://aiworker-hr"}</script>')
    expect(standaloneHtml).toContain('<script src="/assets/hr-home-client.js"></script>')
    expect(standaloneHtml).toContain('data-slot="card"')
    expect(standaloneHtml).toContain('People Profiles')
    expect(standaloneHtml).toContain('Current Profile Summary')
    expect(standaloneHtml).toContain('Confirmed Facts')
    expect(standaloneHtml).not.toContain(`<h1>${hrManifestJson.name}</h1>`)

    const standaloneServer = serveStandalone(0)
    try {
      const clientRes = await fetch(`http://127.0.0.1:${standaloneServer.port}/assets/hr-home-client.js`)
      expect([200, 503]).toContain(clientRes.status)
      if (clientRes.status === 503) {
        expect(await clientRes.text()).toContain('Soul App client asset has not been built')
      }
      else {
        expect(clientRes.headers.get('cache-control')).toBe('no-store')
        expect(clientRes.headers.get('content-type')).toContain('text/javascript')
      }
    }
    finally {
      standaloneServer.stop()
    }

    const standaloneRoot = tempRoot('standalone')
    const standalone = await createStandaloneSoulAppRuntime(hrReferenceSoulApp, {
      appHome: standaloneRoot,
      availableConnectorIds: ['ats', 'calendar'],
      enabledConnectorIds: ['ats'],
      executor,
      hostVersion: '0.12.1',
      now,
      workerId: 'hr-reference-worker',
      workerName: 'HR Reference',
    })

    const capabilityId = namespaceSoulAppCapabilityId('aiworker-hr', 'person-profile')
    expect(standalone.snapshot().worker.soulId).toBe('aiworker-hr')
    const workspace = await standalone.runtime.createWorkspace({ name: 'Mia Chen', type: 'people-profile' })
    const session = await standalone.runtime.createSession({
      capabilityTemplateId: capabilityId,
      context: 'Build a people profile from reviewed evidence.',
      metadata: standalone.sessionMetadata(capabilityId),
      title: 'People profile',
      workspaceId: workspace.id,
    })
    const result = await standalone.runtime.startTurn({
      engineId: 'test',
      input: 'Create the profile artifact.',
      metadata: standalone.sessionMetadata(capabilityId),
      sessionId: session.id,
    })
    expect(result.turn.status).toBe('succeeded')
    expect(result.files).toEqual([])

    const mountedRoot = tempRoot('mounted')
    const mounted = await createMountedSoulAppTestRuntime(hrReferenceSoulApp, {
      availableConnectorIds: ['ats', 'calendar'],
      dbPath: path.join(mountedRoot, 'worker.db'),
      enabledConnectorIds: ['ats'],
      executor,
      hostVersion: '0.12.1',
      now,
      workerId: 'mounted-hr-reference-worker',
      workerName: 'Mounted HR Reference',
      workersRoot: path.join(mountedRoot, 'workers'),
    })
    expect(mounted.catalog.apps.map(app => app.appId)).toContain('aiworker-hr')
    expect(mounted.catalog.templates.map(template => template.id)).toContain(capabilityId)
    expect(mounted.snapshot().worker.soulId).toBe('aiworker-hr')
  })

  function tempRoot(label: string): string {
    const root = mkdtempSync(path.join(tmpdir(), `aiworker-hr-${label}-`))
    roots.push(root)
    return root
  }
})
