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

const now = () => '2026-05-13T00:26:00.000Z'

const executor: LocalExecutor = {
  async invoke(input) {
    return {
      artifacts: [{
        content: `# Release gate\n\n${input.prompt}`,
        kind: 'release-gate',
        path: `artifacts/${input.sessionId}/release-gate.md`,
        title: 'QA Release Gate',
      }],
      review: {
        findings: [{ message: 'QA release gate requires human go/no-go review.' }],
        risks: [{ message: 'Residual release risk must be accepted by the operator.' }],
        verdict: 'warn',
      },
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

  it('declares a release-focused external package boundary and protocol handlers', async () => {
    expect(QA_REFERENCE_APP_BOUNDARY.packageName).toBe('@zonease/aiworker-qa')
    expect(qaReferenceSoulApp.manifest.id).toBe('aiworker-qa')
    expect(await qaReferenceSoulApp.connector?.declareConnectorNeeds({ appId: 'aiworker-qa', permissions: qaReferenceSoulApp.manifest.permissions })).toHaveLength(2)
    expect((await qaReferenceSoulApp.runtime?.resolveCapability({ appId: 'aiworker-qa', permissions: qaReferenceSoulApp.manifest.permissions }, { capabilityId: 'release-gate' }))?.id).toBe('release-gate')
    expect(qaManifestJson.permissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'read', kind: 'search', target: 'aiworker-qa' }),
      expect.objectContaining({ action: 'write', kind: 'search', target: 'aiworker-qa' }),
    ]))
    expect(qaManifestJson.ui.shell?.primaryAction?.protocolAction).toBe('releaseGates.create')
    expect(qaManifestJson.ui.shell?.primaryAction?.requiredPermissions).toContain('storage:write:aiworker-qa')
    expect(qaManifestJson.ui.shell?.primaryAction?.requiredPermissions).toContain('search:write:aiworker-qa')
    expect(qaManifestJson.ui.shell?.search?.protocolProvider).toBe('releases.search')
    expect(qaManifestJson.ui.shell?.search?.requiredPermissions).toContain('search:read:aiworker-qa')
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
      const surfaceRes = await fetch(`${baseUrl}/surfaces/routes/qa-home`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
      })
      expect(surfaceRes.status).toBe(200)
      expect(await surfaceRes.json()).toMatchObject({
        authority: 'soul-app',
        cache: { freshness: 'non-authoritative' },
        renderer: 'host-descriptor',
        title: 'QA Mounted Workbench',
      })
      const frameRes = await fetch(`${baseUrl}/frames/widgets/qa-release-widget`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
      })
      expect(frameRes.status).toBe(200)
      expect(await frameRes.text()).toContain('Mounted QA frame surface')
      const actionRes = await fetch(`${baseUrl}/protocol/actions`, {
        body: JSON.stringify({ input: {}, protocolAction: 'releaseGates.create' }),
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
      const wrongMethodActionRes = await fetch(`${baseUrl}/protocol/actions`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
      })
      expect(wrongMethodActionRes.status).toBe(404)

      const searchRes = await fetch(`${baseUrl}/protocol/search?providerId=releases.search&query=release&limit=2`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
      })
      expect(searchRes.status).toBe(200)
      expect(await searchRes.json()).toMatchObject({
        items: [expect.objectContaining({
          appId: 'aiworker-qa',
          authority: 'soul-app',
          kind: 'release-gate',
        })],
        providerId: 'releases.search',
      })
      const wrongMethodSearchRes = await fetch(`${baseUrl}/protocol/search`, {
        headers: { 'x-aiworker-mount-token': 'test-qa-mounted-token' },
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

  it('persists release gate drafts through Host broker storage when mounted context is present', async () => {
    const previousToken = Bun.env.AIWORKER_MOUNT_TOKEN
    Bun.env.AIWORKER_MOUNT_TOKEN = 'test-qa-mounted-token'
    const storageCalls: Array<{ body: Record<string, unknown>, mountToken: string | null, path: string, search: URLSearchParams }> = []
    const searchQueryCalls: Array<{ mountToken: string | null, path: string, search: URLSearchParams }> = []
    const searchUpsertCalls: Array<{ body: Record<string, unknown>, mountToken: string | null, path: string, search: URLSearchParams }> = []
    const host = Bun.serve({
      async fetch(request) {
        const url = new URL(request.url)
        if (request.method === 'PUT' && url.pathname === '/api/local/apps/aiworker-qa/broker/storage/drafts/release-gate/workspace-qa') {
          storageCalls.push({
            body: await request.json() as Record<string, unknown>,
            mountToken: request.headers.get('x-aiworker-mount-token'),
            path: url.pathname,
            search: url.searchParams,
          })
          return Response.json({ record: { appId: 'aiworker-qa', key: 'drafts/release-gate/workspace-qa' } })
        }
        if (request.method === 'PUT' && url.pathname === '/api/local/apps/aiworker-qa/broker/search/drafts/release-gate/workspace-qa') {
          searchUpsertCalls.push({
            body: await request.json() as Record<string, unknown>,
            mountToken: request.headers.get('x-aiworker-mount-token'),
            path: url.pathname,
            search: url.searchParams,
          })
          return Response.json({ record: { appId: 'aiworker-qa', id: 'drafts/release-gate/workspace-qa' } })
        }
        if (request.method === 'GET' && url.pathname === '/api/local/apps/aiworker-qa/broker/search') {
          searchQueryCalls.push({
            mountToken: request.headers.get('x-aiworker-mount-token'),
            path: url.pathname,
            search: url.searchParams,
          })
          return Response.json({
            authority: 'soul-app',
            items: [{
              appId: 'aiworker-qa',
              authority: 'soul-app',
              id: 'drafts/release-gate/workspace-qa',
              kind: 'release-gate',
              summary: 'Broker-indexed QA release descriptor',
              title: 'Indexed Release Gate',
              workspaceId: 'workspace-qa',
            }],
            query: url.searchParams.get('query') ?? '',
          })
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
      sessionId: 'session-qa',
      workerId: 'worker-qa',
      workspaceId: 'workspace-qa',
    })).toString('base64url')

    try {
      const actionRes = await fetch(`${baseUrl}/protocol/actions`, {
        body: JSON.stringify({ input: {}, protocolAction: 'releaseGates.create' }),
        headers: {
          'content-type': 'application/json',
          'x-aiworker-host-url': `http://127.0.0.1:${host.port}`,
          'x-aiworker-mount-context': mountContext,
          'x-aiworker-mount-token': 'test-qa-mounted-token',
        },
        method: 'POST',
      })

      expect(actionRes.status).toBe(200)
      expect(await actionRes.json()).toMatchObject({ ok: true, refresh: true })
      const storageCall = storageCalls[0]
      expect(storageCall).toBeDefined()
      expect(storageCall!.mountToken).toBe('test-qa-mounted-token')
      expect(storageCall!.path).toBe('/api/local/apps/aiworker-qa/broker/storage/drafts/release-gate/workspace-qa')
      expect(storageCall!.search.get('operatorId')).toBe('operator-local')
      expect(storageCall!.search.get('sessionId')).toBe('session-qa')
      expect(storageCall!.search.get('workerId')).toBe('worker-qa')
      expect(storageCall!.search.get('workspaceId')).toBe('workspace-qa')
      expect(storageCall!.body).toMatchObject({
        valueJson: {
          appId: 'aiworker-qa',
          kind: 'release-gate',
          source: 'qa-mounted-action',
          status: 'draft',
          workspaceId: 'workspace-qa',
        },
      })
      const searchUpsertCall = searchUpsertCalls[0]
      expect(searchUpsertCall).toBeDefined()
      expect(searchUpsertCall!.mountToken).toBe('test-qa-mounted-token')
      expect(searchUpsertCall!.path).toBe('/api/local/apps/aiworker-qa/broker/search/drafts/release-gate/workspace-qa')
      expect(searchUpsertCall!.search.get('operatorId')).toBe('operator-local')
      expect(searchUpsertCall!.search.get('sessionId')).toBe('session-qa')
      expect(searchUpsertCall!.search.get('workerId')).toBe('worker-qa')
      expect(searchUpsertCall!.search.get('workspaceId')).toBe('workspace-qa')
      expect(searchUpsertCall!.body).toMatchObject({
        kind: 'release-gate',
        reference: {
          id: 'workspace-qa',
          type: 'workspace',
        },
        sessionId: 'session-qa',
        summary: 'QA app-owned release gate draft for workspace workspace-qa.',
        title: 'Release gate draft',
        workspaceId: 'workspace-qa',
      })

      const searchRes = await fetch(`${baseUrl}/protocol/search?providerId=releases.search&query=release&limit=2`, {
        headers: {
          'x-aiworker-host-url': `http://127.0.0.1:${host.port}`,
          'x-aiworker-mount-context': mountContext,
          'x-aiworker-mount-token': 'test-qa-mounted-token',
        },
      })
      expect(searchRes.status).toBe(200)
      expect(await searchRes.json()).toMatchObject({
        items: [expect.objectContaining({
          id: 'drafts/release-gate/workspace-qa',
          title: 'Indexed Release Gate',
        })],
        providerId: 'releases.search',
      })
      const searchQueryCall = searchQueryCalls[0]
      expect(searchQueryCall).toBeDefined()
      expect(searchQueryCall!.mountToken).toBe('test-qa-mounted-token')
      expect(searchQueryCall!.path).toBe('/api/local/apps/aiworker-qa/broker/search')
      expect(searchQueryCall!.search.get('operatorId')).toBe('operator-local')
      expect(searchQueryCall!.search.get('query')).toBe('release')
      expect(searchQueryCall!.search.get('workspaceId')).toBe('workspace-qa')
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

  it('runs the QA app in standalone and Host-mounted smoke paths', async () => {
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
    expect(result.artifacts[0]?.metadataJson.soulAppId).toBe('aiworker-qa')
    expect(result.review?.verdict).toBe('warn')

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
