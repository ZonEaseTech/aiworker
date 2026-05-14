import type { SoulAppDefinition } from './index'

import { describe, expect, it } from 'bun:test'

import packageJson from '../package.json' with { type: 'json' }
import {
  createSoulAppClient,
  defineSoulApp,
  namespaceSoulAppCapabilityId,
} from './index'

const now = () => '2026-05-12T23:30:00.000Z'

describe('Soul App SDK authoring boundary', () => {
  it('keeps the SDK package free from Host runtime and worker DB dependencies', () => {
    expect(packageJson.dependencies).not.toHaveProperty('@zonease/aiworker-core')
    expect(packageJson.dependencies).not.toHaveProperty('@zonease/aiworker-storage-sqlite')
  })

  it('defines one app without importing Host runtime internals', async () => {
    const app = demoSoulApp()

    expect(app.manifest.id).toBe('demo-soul-app')
    expect(namespaceSoulAppCapabilityId(app.manifest.id, app.manifest.capabilities[0]!.id)).toBe('demo-soul-app.demo-report')
    expect(await app.lifecycle?.healthcheck?.({
      appId: app.manifest.id,
      permissions: app.manifest.permissions,
    })).toMatchObject({ ok: true })
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
    await client.broker.providers.list()
    await client.broker.storage.put('records/demo', { ready: true }, { operatorId: 'operator-local', workspaceId: 'workspace-1' })
    await client.broker.connectors.readEvidence('ats', { candidateId: 'cand-1' }, { sessionId: 'session-1', workspaceId: 'workspace-1' })
    await client.broker.engine.createInvocation({ prompt: 'raw engine call should be denied by Host' }, { sessionId: 'session-1' })
    await client.broker.audit.list()

    expect(calls.map(call => call.path)).toEqual([
      '/api/local/apps/demo-soul-app/broker/permissions',
      '/api/local/apps/demo-soul-app/broker/providers',
      '/api/local/apps/demo-soul-app/broker/storage/records/demo?operatorId=operator-local&workspaceId=workspace-1',
      '/api/local/apps/demo-soul-app/broker/connectors/ats/evidence?sessionId=session-1&workspaceId=workspace-1',
      '/api/local/apps/demo-soul-app/broker/engine/invocations?sessionId=session-1',
      '/api/local/apps/demo-soul-app/broker/audit',
    ])
    expect(calls[2]?.body).toMatchObject({ valueJson: { ready: true } })
    expect(calls[3]?.body).toMatchObject({ query: { candidateId: 'cand-1' } })
  })
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
    lifecycle: {
      async disable() {
        return { message: 'disabled', ok: true }
      },
      async enable() {
        return { message: 'enabled', ok: true }
      },
      async healthcheck() {
        return { message: `ready at ${now()}`, ok: true }
      },
      async install() {
        return { message: 'installed', ok: true }
      },
      async upgrade() {
        return { message: 'upgraded', ok: true }
      },
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
