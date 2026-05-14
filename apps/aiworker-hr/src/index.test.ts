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
import { serveHostMounted } from './host-mounted'
import { HR_REFERENCE_APP_BOUNDARY, hrReferenceSoulApp } from './index'

const now = () => '2026-05-13T00:25:00.000Z'

const executor: LocalExecutor = {
  async invoke(input) {
    return {
      artifacts: [{
        content: `# HR profile\n\n${input.prompt}`,
        kind: 'person-profile',
        path: `artifacts/${input.sessionId}/person-profile.md`,
        title: 'HR People Profile',
      }],
      review: {
        findings: [{ message: 'HR artifact requires human review before memory promotion.' }],
        risks: [],
        verdict: 'needs_review',
      },
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
    expect(hrManifestJson.ui.shell?.primaryAction?.protocolAction).toBe('peopleProfiles.create')
    expect(hrManifestJson.ui.shell?.primaryAction?.requiredPermissions).toContain('storage:write:aiworker-hr')
    expect(hrManifestJson.ui.shell?.search?.protocolProvider).toBe('peopleProfiles.search')
    expect(hrManifestJson.ui.shell?.search?.requiredPermissions).toContain('storage:read:aiworker-hr')
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
      const surfaceRes = await fetch(`${baseUrl}/surfaces/routes/hr-home`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(surfaceRes.status).toBe(200)
      expect(await surfaceRes.json()).toMatchObject({
        authority: 'soul-app',
        cache: { freshness: 'non-authoritative' },
        renderer: 'host-descriptor',
        title: 'HR Mounted Workbench',
      })
      const frameRes = await fetch(`${baseUrl}/frames/widgets/hr-people-widget`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(frameRes.status).toBe(200)
      expect(await frameRes.text()).toContain('Mounted HR frame surface')
      const actionRes = await fetch(`${baseUrl}/protocol/actions`, {
        body: JSON.stringify({ input: {}, protocolAction: 'peopleProfiles.create' }),
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
        redirectTo: '/hr/people',
        refresh: true,
      })
      const wrongMethodActionRes = await fetch(`${baseUrl}/protocol/actions`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(wrongMethodActionRes.status).toBe(404)

      const searchRes = await fetch(`${baseUrl}/protocol/search?providerId=peopleProfiles.search&query=ada&limit=2`, {
        headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
      })
      expect(searchRes.status).toBe(200)
      expect(await searchRes.json()).toMatchObject({
        items: [expect.objectContaining({
          appId: 'aiworker-hr',
          authority: 'soul-app',
          kind: 'people-profile',
        })],
        providerId: 'peopleProfiles.search',
      })
      const wrongMethodSearchRes = await fetch(`${baseUrl}/protocol/search`, {
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

  it('persists people profile drafts through Host broker storage when mounted context is present', async () => {
    const previousToken = Bun.env.AIWORKER_MOUNT_TOKEN
    Bun.env.AIWORKER_MOUNT_TOKEN = 'test-hr-mounted-token'
    const storageCalls: Array<{ body: Record<string, unknown>, path: string, search: URLSearchParams }> = []
    const host = Bun.serve({
      async fetch(request) {
        const url = new URL(request.url)
        if (request.method === 'PUT' && url.pathname === '/api/local/apps/aiworker-hr/broker/storage/drafts/people-profile/workspace-hr') {
          storageCalls.push({
            body: await request.json() as Record<string, unknown>,
            path: url.pathname,
            search: url.searchParams,
          })
          return Response.json({ record: { appId: 'aiworker-hr', key: 'drafts/people-profile/workspace-hr' } })
        }
        return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
      },
      hostname: '127.0.0.1',
      port: 0,
    })
    const server = serveHostMounted(0)
    const baseUrl = `http://127.0.0.1:${server.port}`
    const mountContext = Buffer.from(JSON.stringify({
      operatorId: 'operator-local',
      sessionId: 'session-hr',
      workerId: 'worker-hr',
      workspaceId: 'workspace-hr',
    })).toString('base64url')

    try {
      const actionRes = await fetch(`${baseUrl}/protocol/actions`, {
        body: JSON.stringify({ input: {}, protocolAction: 'peopleProfiles.create' }),
        headers: {
          'content-type': 'application/json',
          'x-aiworker-host-url': `http://127.0.0.1:${host.port}`,
          'x-aiworker-mount-context': mountContext,
          'x-aiworker-mount-token': 'test-hr-mounted-token',
        },
        method: 'POST',
      })

      expect(actionRes.status).toBe(200)
      expect(await actionRes.json()).toMatchObject({ ok: true, refresh: true })
      const storageCall = storageCalls[0]
      expect(storageCall).toBeDefined()
      expect(storageCall!.path).toBe('/api/local/apps/aiworker-hr/broker/storage/drafts/people-profile/workspace-hr')
      expect(storageCall!.search.get('operatorId')).toBe('operator-local')
      expect(storageCall!.search.get('sessionId')).toBe('session-hr')
      expect(storageCall!.search.get('workerId')).toBe('worker-hr')
      expect(storageCall!.search.get('workspaceId')).toBe('workspace-hr')
      expect(storageCall!.body).toMatchObject({
        valueJson: {
          appId: 'aiworker-hr',
          kind: 'people-profile',
          source: 'hr-mounted-action',
          status: 'draft',
          workspaceId: 'workspace-hr',
        },
      })
    }
    finally {
      server.stop()
      host.stop()
      if (previousToken === undefined)
        delete Bun.env.AIWORKER_MOUNT_TOKEN
      else
        Bun.env.AIWORKER_MOUNT_TOKEN = previousToken
    }
  })

  it('runs the HR app in standalone and Host-mounted smoke paths', async () => {
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
    expect(result.artifacts[0]?.metadataJson.soulAppId).toBe('aiworker-hr')
    expect(result.review?.verdict).toBe('needs_review')

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
