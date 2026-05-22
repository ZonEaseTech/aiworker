import type { LocalExecutor } from '@zonease/aiworker-soul-app-runtime'

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

import customManifestJson from '../soul-app.manifest.json' with { type: 'json' }
import { CUSTOM_REFERENCE_APP_BOUNDARY, customReferenceSoulApp } from './index'
import { serveHostMounted } from './mounted/host-mounted'
import { renderStandaloneHtml } from './standalone/standalone'

const now = () => '2026-05-22T00:00:00.000Z'

const executor: LocalExecutor = {
  async invoke(_input) {
    return {
      summary: 'Custom Soul App exploration session completed.',
    }
  },
}

describe('Custom reference Soul App', () => {
  let roots: string[] = []

  afterEach(async () => {
    for (const root of roots)
      await rm(root, { recursive: true, force: true })
    roots = []
  })

  it('declares a free-form exploration boundary', async () => {
    expect(CUSTOM_REFERENCE_APP_BOUNDARY.packageName).toBe('@zonease/aiworker-custom')
    expect(customReferenceSoulApp.manifest.id).toBe('aiworker-custom')
    expect(await customReferenceSoulApp.connector?.declareConnectorNeeds({ appId: 'aiworker-custom', permissions: customReferenceSoulApp.manifest.permissions })).toEqual([])
    expect((await customReferenceSoulApp.runtime?.resolveCapability({ appId: 'aiworker-custom', permissions: customReferenceSoulApp.manifest.permissions }, { capabilityId: 'explore' }))?.id).toBe('explore')
    expect(customManifestJson.permissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'read', kind: 'storage', target: 'aiworker-custom' }),
      expect.objectContaining({ action: 'write', kind: 'storage', target: 'aiworker-custom' }),
      expect.objectContaining({ action: 'mount', kind: 'ui', target: 'custom-micro-app' }),
    ]))
    expect(customManifestJson.workspaceTypes[0]?.id).toBe('sandbox')
    expect(customManifestJson.capabilities[0]?.id).toBe('explore')
    expect(customManifestJson.connectors.required).toEqual([])
    expect(customManifestJson.connectors.optional).toEqual([])
  })

  it('serves standalone HTML with Custom proof component', () => {
    const standaloneHtml = renderStandaloneHtml()
    expect(standaloneHtml).toContain('<link rel="stylesheet" href="/styles.css">')
    expect(standaloneHtml).toContain('Standalone')
    expect(standaloneHtml).toContain('AIWorker Custom')
  })

  it('requires the Host mount token for mounted service domain routes', async () => {
    const previousToken = Bun.env.AIWORKER_MOUNT_TOKEN
    Bun.env.AIWORKER_MOUNT_TOKEN = 'test-custom-mounted-token'
    const server = serveHostMounted(0)
    const baseUrl = `http://127.0.0.1:${server.port}`

    try {
      expect((await fetch(`${baseUrl}/health`)).status).toBe(200)
      expect((await fetch(`${baseUrl}/domain`)).status).toBe(401)
      const domainRes = await fetch(`${baseUrl}/domain`, {
        headers: { 'x-aiworker-mount-token': 'test-custom-mounted-token' },
      })
      expect(domainRes.status).toBe(200)
      expect(await domainRes.json()).toMatchObject({ appId: 'aiworker-custom', mounted: true, soul: 'custom' })
      const capabilitiesRes = await fetch(`${baseUrl}/api/capabilities`, {
        headers: { 'x-aiworker-mount-token': 'test-custom-mounted-token' },
      })
      expect(capabilitiesRes.status).toBe(200)
      expect(await capabilitiesRes.json()).toMatchObject({
        capabilities: [expect.objectContaining({ id: 'explore' })],
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

  it('runs the Custom app in standalone and Host-mounted smoke paths', async () => {
    const standaloneRoot = tempRoot('standalone')
    const standalone = await createStandaloneSoulAppRuntime(customReferenceSoulApp, {
      appHome: standaloneRoot,
      availableConnectorIds: [],
      enabledConnectorIds: [],
      executor,
      hostVersion: '0.19.0',
      now,
      workerId: 'custom-reference-worker',
      workerName: 'Custom Reference',
    })

    const capabilityId = namespaceSoulAppCapabilityId('aiworker-custom', 'explore')
    expect(standalone.snapshot().worker.soulId).toBe('aiworker-custom')
    const workspace = await standalone.runtime.createWorkspace({ name: 'Sandbox', type: 'sandbox' })
    const session = await standalone.runtime.createSession({
      capabilityTemplateId: capabilityId,
      context: 'Explore free-form workspace capabilities.',
      metadata: standalone.sessionMetadata(capabilityId),
      title: 'Exploration',
      workspaceId: workspace.id,
    })
    const result = await standalone.runtime.startTurn({
      engineId: 'test',
      input: 'Explore the workspace.',
      metadata: standalone.sessionMetadata(capabilityId),
      sessionId: session.id,
    })
    expect(result.turn.status).toBe('succeeded')
    expect(result.files).toEqual([])

    const mountedRoot = tempRoot('mounted')
    const mounted = await createMountedSoulAppTestRuntime(customReferenceSoulApp, {
      availableConnectorIds: [],
      dbPath: path.join(mountedRoot, 'worker.db'),
      enabledConnectorIds: [],
      executor,
      hostVersion: '0.19.0',
      now,
      workerId: 'mounted-custom-reference-worker',
      workerName: 'Mounted Custom Reference',
      workersRoot: path.join(mountedRoot, 'workers'),
    })
    expect(mounted.catalog.apps.map(app => app.appId)).toContain('aiworker-custom')
    expect(mounted.catalog.templates.map(template => template.id)).toContain(capabilityId)
    expect(mounted.snapshot().worker.soulId).toBe('aiworker-custom')
  })

  function tempRoot(label: string): string {
    const root = mkdtempSync(path.join(tmpdir(), `aiworker-custom-${label}-`))
    roots.push(root)
    return root
  }
})
