import type { LocalExecutor, SoulAppDefinition } from './index'

import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'

import {
  createMountedSoulAppTestRuntime,
  createSoulAppClient,
  createStandaloneSoulAppRuntime,
  defineSoulApp,
  namespaceSoulAppCapabilityId,
} from './index'

const now = () => '2026-05-12T23:30:00.000Z'

const executor: LocalExecutor = {
  async invoke(input) {
    return {
      artifacts: [{
        content: `# Demo artifact\n\n${input.prompt}`,
        kind: 'demo-report',
        path: `artifacts/${input.sessionId}/demo-report.md`,
        title: 'Demo Report',
      }],
      review: {
        findings: [{ message: 'Demo artifact is ready for human review.' }],
        risks: [],
        verdict: 'needs_review',
      },
      summary: 'Demo app produced one artifact.',
    }
  },
}

describe('Soul App SDK runtime boundary', () => {
  let roots: string[] = []

  afterEach(async () => {
    for (const root of roots)
      await rm(root, { recursive: true, force: true })
    roots = []
  })

  it('defines one app once and runs it in standalone mode without Host catalog leakage', async () => {
    const root = tempRoot('standalone')
    const app = demoSoulApp()

    const standalone = await createStandaloneSoulAppRuntime(app, {
      appHome: root,
      executor,
      hostVersion: '0.12.1',
      now,
      workerId: 'demo-worker',
      workerName: 'Demo Worker',
    })

    expect(standalone.app.manifest.id).toBe('demo-soul-app')
    expect(standalone.catalog.apps.map(item => item.appId)).toEqual(['demo-soul-app'])
    expect(standalone.catalog.souls.map(item => item.id)).toEqual(['demo-soul-app'])
    expect(standalone.catalog.templates.map(item => item.id)).toEqual([
      namespaceSoulAppCapabilityId('demo-soul-app', 'demo-report'),
    ])
    expect(standalone.snapshot().worker.soulId).toBe('demo-soul-app')
    expect(standalone.snapshot().worker.metadataJson.domainSoulId).toBe('demo-soul')

    const workspace = await standalone.runtime.createWorkspace({ name: 'Standalone workspace', type: 'demo-workspace' })
    const session = await standalone.runtime.createSession({
      capabilityTemplateId: standalone.catalog.templates[0]!.id,
      context: 'Standalone context',
      metadata: standalone.sessionMetadata(standalone.catalog.templates[0]!.id),
      title: 'Standalone session',
      workspaceId: workspace.id,
    })
    const result = await standalone.runtime.startTurn({
      engineId: 'test',
      input: 'Create standalone artifact.',
      metadata: standalone.sessionMetadata(standalone.catalog.templates[0]!.id),
      sessionId: session.id,
    })

    expect(result.artifacts).toHaveLength(1)
    expect(result.review?.verdict).toBe('needs_review')
    expect(standalone.snapshot().worker.metadataJson.soulAppId).toBe('demo-soul-app')
  })

  it('creates the standalone app home when it does not exist yet', async () => {
    const root = path.join(tempRoot('standalone-missing-home'), 'nested', 'app-home')
    const standalone = await createStandaloneSoulAppRuntime(demoSoulApp(), {
      appHome: root,
      executor,
      hostVersion: '0.12.1',
      now,
    })

    expect(standalone.runtime.snapshot().worker.soulId).toBe('demo-soul-app')
  })

  it('uses the same definition through mounted Host projection without changing domain logic', async () => {
    const root = tempRoot('mounted')
    const app = demoSoulApp()

    const mounted = await createMountedSoulAppTestRuntime(app, {
      dbPath: path.join(root, 'worker.db'),
      executor,
      hostVersion: '0.12.1',
      now,
      workerId: 'mounted-demo-worker',
      workerName: 'Mounted Demo Worker',
      workersRoot: path.join(root, 'workers'),
    })

    const capabilityId = namespaceSoulAppCapabilityId('demo-soul-app', 'demo-report')
    expect(mounted.hostedApp.appId).toBe(app.manifest.id)
    expect(mounted.catalog.templates.map(item => item.id)).toContain(capabilityId)
    expect(mounted.runtime.snapshot().worker.soulId).toBe(app.manifest.id)
    expect(mounted.runtime.snapshot().worker.metadataJson.domainSoulId).toBe(app.manifest.soul.id)

    const workspace = await mounted.runtime.createWorkspace({ name: 'Mounted workspace', type: 'demo-workspace' })
    const session = await mounted.runtime.createSession({
      capabilityTemplateId: capabilityId,
      context: 'Mounted context',
      metadata: mounted.sessionMetadata(capabilityId),
      title: 'Mounted session',
      workspaceId: workspace.id,
    })
    const result = await mounted.runtime.startTurn({
      engineId: 'test',
      input: 'Create mounted artifact.',
      metadata: mounted.sessionMetadata(capabilityId),
      sessionId: session.id,
    })

    expect(result.artifacts[0]?.metadataJson.soulAppId).toBe('demo-soul-app')
    expect(result.review?.findingsJson[0]?.message).toContain('Demo artifact')
  })

  it('scopes client calls to public local daemon routes for one app worker', async () => {
    const calls: Array<{ body: unknown, path: string }> = []
    const client = createSoulAppClient({
      appId: 'demo-soul-app',
      fetch: async (input, init) => {
        calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null, path: input })
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        })
      },
    })

    await client.getApp()
    await client.createWorker({ id: 'demo-worker', name: 'Demo Worker' })
    await client.createWorkspace('demo-worker', { name: 'Demo Workspace', type: 'demo-workspace' })
    await client.createSessionTurn('demo-worker', 'workspace-1', {
      capabilityTemplateId: namespaceSoulAppCapabilityId('demo-soul-app', 'demo-report'),
      input: 'Create report',
      title: 'Demo session',
    })

    expect(calls.map(call => call.path)).toEqual([
      '/api/local/apps/demo-soul-app',
      '/api/local/workers',
      '/api/local/workers/demo-worker/workspaces',
      '/api/local/workers/demo-worker/workspaces/workspace-1/sessions',
    ])
    expect(calls[1]?.body).toMatchObject({ soulId: 'demo-soul-app' })
  })

  it('scopes broker client calls to Host-owned app broker routes', async () => {
    const calls: Array<{ body: unknown, path: string }> = []
    const client = createSoulAppClient({
      appId: 'demo-soul-app',
      fetch: async (input, init) => {
        calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null, path: input })
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        })
      },
    })

    await client.broker.permissions.list()
    await client.broker.storage.put('records/demo', { ready: true }, { operatorId: 'operator-local', workspaceId: 'workspace-1' })
    await client.broker.connectors.readEvidence('ats', { candidateId: 'cand-1' }, { sessionId: 'session-1', workspaceId: 'workspace-1' })
    await client.broker.engine.createInvocation({ prompt: 'raw engine call should be denied by Host' }, { sessionId: 'session-1' })
    await client.broker.audit.list()

    expect(calls.map(call => call.path)).toEqual([
      '/api/local/apps/demo-soul-app/broker/permissions',
      '/api/local/apps/demo-soul-app/broker/storage/records/demo?operatorId=operator-local&workspaceId=workspace-1',
      '/api/local/apps/demo-soul-app/broker/connectors/ats/evidence?sessionId=session-1&workspaceId=workspace-1',
      '/api/local/apps/demo-soul-app/broker/engine/invocations?sessionId=session-1',
      '/api/local/apps/demo-soul-app/broker/audit',
    ])
    expect(calls[1]?.body).toMatchObject({ valueJson: { ready: true } })
    expect(calls[2]?.body).toMatchObject({ query: { candidateId: 'cand-1' } })
  })

  function tempRoot(label: string): string {
    const root = mkdtempSync(path.join(tmpdir(), `aiworker-sdk-${label}-`))
    roots.push(root)
    return root
  }
})

function demoSoulApp(): SoulAppDefinition {
  return defineSoulApp({
    manifest: {
      api: {
        entry: './src/domain-api.ts',
        routePrefix: '/api/local/apps/demo-soul-app',
      },
      artifactTypes: [{
        description: 'Demo report artifact.',
        id: 'demo-report',
        name: 'Demo Report',
        schemaRef: './schemas/demo-report.json',
        version: '1.0.0',
      }],
      capabilities: [{
        artifactTypes: ['demo-report'],
        description: 'Create a demo report.',
        id: 'demo-report',
        name: 'Demo Report',
        outputKind: 'demo-report',
        promptRef: './capabilities/demo-report/prompt.md',
        version: '1.0.0',
        workspaceTypes: ['demo-workspace'],
      }],
      compatibility: {
        host: { minVersion: '0.12.0' },
        sdk: { minVersion: '0.1.0' },
      },
      connectors: { optional: [], required: [] },
      description: 'Demo Soul App for SDK boundary tests.',
      exports: {
        runtime: './src/runtime.ts',
        ui: './src/ui.ts',
      },
      healthcheck: {
        kind: 'protocol-handler',
        ref: './src/healthcheck.ts',
        timeoutMs: 1000,
      },
      id: 'demo-soul-app',
      memory: {
        admissionPolicy: 'manual-review',
        namespace: 'demo-soul-app',
      },
      modes: {
        hostMounted: { entry: './src/host-mounted.ts', supported: true },
        standalone: { entry: './src/standalone.ts', supported: true },
      },
      name: 'Demo Soul App',
      pack: {
        refs: [{ id: 'demo-pack', ref: './pack', source: 'embedded', version: '1.0.0' }],
      },
      permissions: [
        {
          action: 'write',
          kind: 'storage',
          reason: 'Persist demo app metadata in its namespace.',
          target: 'demo-soul-app',
        },
        {
          action: 'serve',
          kind: 'api',
          reason: 'Serve demo app scoped API.',
          target: '/api/local/apps/demo-soul-app',
        },
      ],
      protocol: 'soul-app/v1',
      soul: {
        description: 'Demo vertical workspace.',
        domain: 'demo-domain',
        id: 'demo-soul',
        name: 'Demo Soul',
        version: '1.0.0',
      },
      storage: {
        migrations: [],
        namespace: 'demo-soul-app',
      },
      ui: {
        artifactPreviews: [{
          entry: './src/ui/demo-preview.tsx',
          id: 'demo-preview',
          label: 'Demo preview',
          slot: 'artifact-preview',
          target: 'demo-report',
        }],
        panels: [{
          entry: './src/ui/demo-panel.tsx',
          id: 'demo-panel',
          label: 'Demo panel',
          slot: 'panel',
        }],
        reviewPanels: [],
        routes: [{
          entry: './src/ui/demo-route.tsx',
          id: 'demo-route',
          label: 'Demo',
          path: '/demo',
        }],
        workspaceWidgets: [],
      },
      version: '1.0.0',
      workspaceTypes: [{
        artifactTypes: ['demo-report'],
        defaultCapabilityIds: ['demo-report'],
        description: 'Demo workspace type.',
        id: 'demo-workspace',
        name: 'Demo Workspace',
      }],
    },
    runtime: {
      async prepareSessionContext(_context, input) {
        return {
          artifactTypes: ['demo-report'],
          capabilityId: input.capabilityId,
          contextMarkdown: 'Demo context.',
          promptFragments: ['Use the demo app domain logic.'],
          reviewRubric: ['Demo output must separate evidence and next action.'],
        }
      },
      async resolveCapability(_context, input) {
        const capability = demoSoulApp().manifest.capabilities.find(item => item.id === input.capabilityId || !input.capabilityId)
        if (!capability)
          throw new Error('demo capability not found')
        return capability
      },
    },
  })
}
