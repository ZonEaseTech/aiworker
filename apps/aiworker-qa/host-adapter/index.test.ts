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

import qaManifestJson from '../soul-app.manifest.json' with { type: 'json' }
import { QA_REFERENCE_APP_BOUNDARY, qaReferenceSoulApp } from './index'
import { serveHostMounted } from './mounted/host-mounted'
import { renderStandaloneHtml } from './standalone/standalone'

const now = () => '2026-05-13T00:26:00.000Z'

const executor: LocalExecutor = {
  async invoke(_input) {
    return {
      summary: 'QA reference app created one release gate artifact.',
    }
  },
}

describe('QA reference Soul App', () => {
  let roots: string[] = []

  afterEach(async () => {
    for (const root of roots)
      await rm(root, { recursive: true, force: true })
    roots = []
  })

  it('declares a release-focused external package boundary and app-owned mounted surfaces', async () => {
    expect(QA_REFERENCE_APP_BOUNDARY.packageName).toBe('@zonease/aiworker-qa')
    expect(qaReferenceSoulApp.manifest.id).toBe('aiworker-qa')
    expect(await qaReferenceSoulApp.connector?.declareConnectorNeeds({ appId: 'aiworker-qa', permissions: qaReferenceSoulApp.manifest.permissions })).toHaveLength(2)
    expect((await qaReferenceSoulApp.runtime?.resolveCapability({ appId: 'aiworker-qa', permissions: qaReferenceSoulApp.manifest.permissions }, { capabilityId: 'release-gate' }))?.id).toBe('release-gate')
    expect(qaManifestJson.permissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'read', kind: 'search', target: 'aiworker-qa' }),
      expect.objectContaining({ action: 'write', kind: 'search', target: 'aiworker-qa' }),
      expect.objectContaining({ action: 'mount', kind: 'ui', target: 'qa-micro-app' }),
    ]))
    expect(qaManifestJson.permissions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'mount', kind: 'ui', target: 'qa-workbench' }),
    ]))
    expect('workbench' in qaManifestJson.ui).toBe(false)
    expect(JSON.stringify(qaManifestJson.ui)).not.toContain('host-descriptor')
    expect(JSON.stringify(qaManifestJson.ui)).not.toContain('/surfaces/')
    expect(qaManifestJson.ui.routes.map(route => route.id)).toEqual(['universal-workbench'])
    expect(qaManifestJson.ui.routes.find(route => route.id === 'universal-workbench')?.surface).toMatchObject({
      entry: '/micro-app/workbench/universal',
      renderer: 'micro-app',
      scope: 'app',
    })
    expect(qaManifestJson.ui.workspaceContext?.terminal?.cwd).toEqual({ source: 'host-workspace-root' })
  })

  it('requires the Host mount token for mounted service domain routes', async () => {
    const previousToken = Bun.env.AIWORKER_MOUNT_TOKEN
    Bun.env.AIWORKER_MOUNT_TOKEN = 'test-qa-mounted-token'
    const server = serveHostMounted(0)
    const baseUrl = `http://127.0.0.1:${server.port}`

    try {
      expect((await fetch(`${baseUrl}/health`)).status).toBe(200)
      expect((await fetch(`${baseUrl}/domain`)).status).toBe(401)
      const domainRes = await fetch(`${baseUrl}/domain`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
      })
      expect(domainRes.status).toBe(200)
      expect(await domainRes.json()).toMatchObject({ appId: 'aiworker-qa', mounted: true })
      const declaredMicroAppRoutes = qaManifestJson.ui.routes.filter(route =>
        route.surface?.renderer === 'micro-app' && route.surface.entry?.startsWith('/micro-app/'),
      )
      for (const route of declaredMicroAppRoutes) {
        const routeRes = await fetch(`${baseUrl}${route.surface.entry}?workerId=qa-worker&workspaceId=workspace-1&theme=light`, {
          headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
        })
        expect(routeRes.status).toBe(200)
        const routeHtml = await routeRes.text()
        expect(routeHtml).toContain('window.microApp')
        expect(routeHtml).toContain('"appId":"aiworker-qa"')
      }
      const oldRouteSurfaceRes = await fetch(`${baseUrl}/surfaces/routes/qa-home`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
      })
      expect(oldRouteSurfaceRes.status).toBe(404)
      const oldPanelSurfaceRes = await fetch(`${baseUrl}/surfaces/panels/qa-release-panel`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
      })
      expect(oldPanelSurfaceRes.status).toBe(404)
      const routeMicroAppRes = await fetch(`${baseUrl}/micro-app/workbench/universal`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
      })
      expect(routeMicroAppRes.status).toBe(200)
      const routeMicroAppHtml = await routeMicroAppRes.text()
      expect(routeMicroAppHtml).toContain('Universal Workbench')
      expect(routeMicroAppHtml).toContain('"surfaceId":"universal-workbench"')
      expect(routeMicroAppHtml).toContain('<link rel="stylesheet" href="/api/local/apps/aiworker-qa/styles.css">')
      expect(routeMicroAppHtml).toContain('<script src="/api/local/apps/aiworker-qa/assets/universal-workbench-client.js"></script>')
      expect(routeMicroAppHtml).not.toContain('type="module"')
      expect(routeMicroAppHtml).not.toContain('This app-owned micro-app surface receives worker, workspace, session, and theme context from the Host mount bridge.')
      const universalClientRes = await fetch(`${baseUrl}/assets/universal-workbench-client.js`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
      })
      expect(universalClientRes.status).toBe(200)
      const universalClientJs = await universalClientRes.text()
      expect(universalClientJs).toContain('/api/workspaces')
      // BUG-151: 'Engine bridge ready' 是已删除的硬编码 false-positive 串,
      // client 现用 loadMountedEngineReadiness() 计算真实就绪,故改断言稳定的 fetch 路径常量。
      expect(universalClientJs).toContain('/api/local/settings')
      expect(universalClientJs).not.toMatch(/\b(?:export|import)\s*(?:\{|from|\*|default)/)
      const microAppRes = await fetch(`${baseUrl}/micro-app/widgets/qa-release-widget`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
      })
      expect(microAppRes.status).toBe(200)
      const microAppHtml = await microAppRes.text()
      expect(microAppHtml).toContain('Mounted QA micro-app surface')
      expect(microAppHtml).toContain('<link rel="stylesheet" href="/api/local/apps/aiworker-qa/styles.css">')
      expect(microAppHtml).toContain('data-slot="card"')
      expect(microAppHtml).toContain('data-slot="item-content"')
      expect(microAppHtml).not.toContain('<h1>Release Widget</h1>')
      const darkMicroAppRes = await fetch(`${baseUrl}/micro-app/widgets/qa-release-widget?theme=dark`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
      })
      expect(darkMicroAppRes.status).toBe(200)
      const darkMicroAppHtml = await darkMicroAppRes.text()
      expect(darkMicroAppHtml).toContain('<html lang="en" class="dark" style="color-scheme:dark">')
      const capabilitiesRes = await fetch(`${baseUrl}/api/capabilities`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
      })
      expect(capabilitiesRes.status).toBe(200)
      expect(await capabilitiesRes.json()).toMatchObject({
        capabilities: [expect.objectContaining({ id: 'regression-matrix' }), expect.objectContaining({ id: 'release-gate' })],
      })
      const wrongMethodCapabilitiesRes = await fetch(`${baseUrl}/api/capabilities`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
        method: 'POST',
      })
      expect(wrongMethodCapabilitiesRes.status).toBe(404)
      const actionRes = await fetch(`${baseUrl}/api/release-gates`, {
        body: JSON.stringify({ input: {} }),
        headers: {
          'content-type': 'application/json',
          'x-aiworker-mount-token': 'test-qa-mounted-token',
        },
        method: 'POST',
      })
      expect(actionRes.status).toBe(200)
      expect(await actionRes.json()).toMatchObject({
        message: 'Release gate draft opened by QA app.',
        ok: true,
        redirectTo: '/qa/release',
        refresh: true,
      })
      const wrongMethodActionRes = await fetch(`${baseUrl}/api/release-gates`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
      })
      expect(wrongMethodActionRes.status).toBe(404)

      const searchRes = await fetch(`${baseUrl}/api/release-gates/search?query=release&limit=2`, {
        headers: {
          'x-aiworker-mount-token': 'test-qa-mounted-token',
        },
      })
      expect(searchRes.status).toBe(200)
      const searchBody = await searchRes.json()
      expect(searchBody).toMatchObject({
        items: [expect.objectContaining({
          appId: 'aiworker-qa',
          authority: 'soul-app',
          kind: 'release-gate',
        })],
      })
      expect(searchBody).not.toHaveProperty('providerId')
      const wrongMethodSearchRes = await fetch(`${baseUrl}/api/release-gates/search`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
        method: 'POST',
      })
      expect(wrongMethodSearchRes.status).toBe(404)
      for (const oldPath of ['/protocol/actions', '/protocol/search', '/protocol/capabilities']) {
        const oldRes = await fetch(`${baseUrl}${oldPath}`, {
          headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
          method: oldPath === '/protocol/actions' ? 'POST' : 'GET',
        })
        expect(oldRes.status).toBe(404)
      }
    }
    finally {
      server.stop()
      if (previousToken === undefined)
        delete Bun.env.AIWORKER_MOUNT_TOKEN
      else
        Bun.env.AIWORKER_MOUNT_TOKEN = previousToken
    }
  })

  it('keeps release gate drafts app-owned in mounted mode', async () => {
    const previousToken = Bun.env.AIWORKER_MOUNT_TOKEN
    Bun.env.AIWORKER_MOUNT_TOKEN = 'test-qa-mounted-token'
    const server = serveHostMounted(0)
    const baseUrl = `http://127.0.0.1:${server.port}`
    const mountContext = Buffer.from(JSON.stringify({
      operatorId: 'operator-local',
      sessionId: 'session-qa',
      workerId: 'worker-qa',
      workspaceId: 'workspace-qa',
    })).toString('base64url')

    try {
      const actionRes = await fetch(`${baseUrl}/api/release-gates`, {
        body: JSON.stringify({ input: {} }),
        headers: {
          'content-type': 'application/json',
          'x-aiworker-mount-context': mountContext,
          'x-aiworker-mount-token': 'test-qa-mounted-token',
        },
        method: 'POST',
      })

      expect(actionRes.status).toBe(200)
      expect(await actionRes.json()).toMatchObject({ ok: true, refresh: true })

      const searchRes = await fetch(`${baseUrl}/api/release-gates/search?query=release&limit=2`, {
        headers: {
          'x-aiworker-mount-context': mountContext,
          'x-aiworker-mount-token': 'test-qa-mounted-token',
        },
      })
      expect(searchRes.status).toBe(200)
      const searchBody = await searchRes.json()
      expect(searchBody).toMatchObject({
        items: [expect.objectContaining({
          id: 'drafts/release-gate/workspace-qa',
          title: 'Release gate draft',
        })],
      })
      expect(searchBody).not.toHaveProperty('providerId')
    }
    finally {
      server.stop()
      if (previousToken === undefined)
        delete Bun.env.AIWORKER_MOUNT_TOKEN
      else
        Bun.env.AIWORKER_MOUNT_TOKEN = previousToken
    }
  })

  it('runs the QA app in standalone and Host-mounted smoke paths', async () => {
    const standaloneHtml = renderStandaloneHtml()
    expect(standaloneHtml).toContain('<link rel="stylesheet" href="/styles.css">')
    expect(standaloneHtml).toContain('data-slot="card"')
    expect(standaloneHtml).toContain('Standalone')
    expect(standaloneHtml).not.toContain(`<h1>${qaManifestJson.name}</h1>`)

    const standaloneRoot = tempRoot('standalone')
    const standalone = await createStandaloneSoulAppRuntime(qaReferenceSoulApp, {
      appHome: standaloneRoot,
      availableConnectorIds: ['ci', 'issue-tracker'],
      enabledConnectorIds: ['ci'],
      executor,
      hostVersion: '0.12.1',
      now,
      workerId: 'qa-reference-worker',
      workerName: 'QA Reference',
    })

    const capabilityId = namespaceSoulAppCapabilityId('aiworker-qa', 'release-gate')
    expect(standalone.snapshot().worker.soulId).toBe('aiworker-qa')
    const workspace = await standalone.runtime.createWorkspace({ name: 'Release 1.2', type: 'release' })
    const session = await standalone.runtime.createSession({
      capabilityTemplateId: capabilityId,
      context: 'Review release readiness from CI and defect evidence.',
      metadata: standalone.sessionMetadata(capabilityId),
      title: 'Release gate',
      workspaceId: workspace.id,
    })
    const result = await standalone.runtime.startTurn({
      engineId: 'test',
      input: 'Create the release gate artifact.',
      metadata: standalone.sessionMetadata(capabilityId),
      sessionId: session.id,
    })
    expect(result.turn.status).toBe('succeeded')
    expect(result.files).toEqual([])

    const mountedRoot = tempRoot('mounted')
    const mounted = await createMountedSoulAppTestRuntime(qaReferenceSoulApp, {
      availableConnectorIds: ['ci', 'issue-tracker'],
      dbPath: path.join(mountedRoot, 'worker.db'),
      enabledConnectorIds: ['ci'],
      executor,
      hostVersion: '0.12.1',
      now,
      workerId: 'mounted-qa-reference-worker',
      workerName: 'Mounted QA Reference',
      workersRoot: path.join(mountedRoot, 'workers'),
    })
    expect(mounted.catalog.apps.map(app => app.appId)).toContain('aiworker-qa')
    expect(mounted.catalog.templates.map(template => template.id)).toContain(capabilityId)
    expect(mounted.snapshot().worker.soulId).toBe('aiworker-qa')
  })

  function tempRoot(label: string): string {
    const root = mkdtempSync(path.join(tmpdir(), `aiworker-qa-${label}-`))
    roots.push(root)
    return root
  }
})
