import type { SoulAppDefinition } from './index'

import { describe, expect, it } from 'bun:test'

import packageJson from '../package.json' with { type: 'json' }
import {
  createSoulAppClient,
  createSoulAppWebStorage,
  defineSoulApp,
  defineSoulAppEngineAssets,
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

  it('defines engine asset declarations without runtime side effects', () => {
    const assets = defineSoulAppEngineAssets({
      skills: {
        source: './engine-assets/skills',
        targets: ['codex', 'claude-code'],
      },
      workspace: {
        source: './engine-assets/workspace',
      },
    })

    expect(assets.workspace.source).toBe('./engine-assets/workspace')
    expect(assets.skills?.targets).toEqual(['codex', 'claude-code'])
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

  it('does not expose a Host broker client surface', () => {
    const client = createSoulAppClient({ appId: 'demo-soul-app' })
    expect(client).not.toHaveProperty('broker')
  })

  it('scopes browser storage keys by app, worker, workspace, and session', () => {
    const local = new MemoryStorage()
    const session = new MemoryStorage()
    const storage = createSoulAppWebStorage({
      appId: 'demo-soul-app',
      localStorage: local,
      sessionId: 'session-1',
      sessionStorage: session,
      workerId: 'worker-1',
      workspaceId: 'workspace-1',
    })

    expect(storage.local.set('filters', { status: 'open' })).toEqual({ ok: true })
    expect(storage.session.set('draft', { text: 'hello' })).toEqual({ ok: true })

    expect(local.getItem('aiworker:app:demo-soul-app:worker-1:workspace-1:local:filters')).toBe(JSON.stringify({ status: 'open' }))
    expect(session.getItem('aiworker:app:demo-soul-app:worker-1:workspace-1:session:session-1:draft')).toBe(JSON.stringify({ text: 'hello' }))
    expect(storage.local.get('filters')).toEqual({ ok: true, value: { status: 'open' } })
    expect(storage.session.get('draft')).toEqual({ ok: true, value: { text: 'hello' } })
  })

  it('clears only the active Soul App browser storage scope', () => {
    const local = new MemoryStorage()
    const storage = createSoulAppWebStorage({
      appId: 'demo-soul-app',
      localStorage: local,
      workerId: 'worker-1',
      workspaceId: 'workspace-1',
    })
    const sibling = createSoulAppWebStorage({
      appId: 'demo-soul-app',
      localStorage: local,
      workerId: 'worker-2',
      workspaceId: 'workspace-1',
    })

    expect(storage.local.set('filters', { status: 'open' })).toEqual({ ok: true })
    expect(sibling.local.set('filters', { status: 'closed' })).toEqual({ ok: true })
    local.setItem('aiworker:host:theme:mode', '"dark"')

    expect(storage.local.clearScope()).toEqual({ ok: true, removed: 1 })

    expect(storage.local.get('filters')).toEqual({ ok: true, value: null })
    expect(sibling.local.get('filters')).toEqual({ ok: true, value: { status: 'closed' } })
    expect(local.getItem('aiworker:host:theme:mode')).toBe('"dark"')
  })

  it('rejects unsafe browser storage keys before touching storage', () => {
    const local = new MemoryStorage()
    const storage = createSoulAppWebStorage({
      appId: 'demo-soul-app',
      localStorage: local,
      workerId: 'worker-1',
      workspaceId: 'workspace-1',
    })

    expect(storage.local.set('', { ready: true })).toEqual({
      code: 'invalid_key',
      message: 'Soul App browser storage key must be a non-empty relative key.',
      ok: false,
    })
    expect(storage.local.set('/absolute', { ready: true })).toEqual({
      code: 'invalid_key',
      message: 'Soul App browser storage key must be a non-empty relative key.',
      ok: false,
    })
    expect(local.length).toBe(0)
  })

  it('reports unavailable browser storage without throwing', () => {
    const local = new ThrowingStorage('unavailable')
    const storage = createSoulAppWebStorage({
      appId: 'demo-soul-app',
      localStorage: local,
      workerId: 'worker-1',
      workspaceId: 'workspace-1',
    })

    expect(storage.local.set('filters', { status: 'open' })).toEqual({
      code: 'storage_unavailable',
      message: 'Browser storage is unavailable for this Soul App scope.',
      ok: false,
    })
    expect(storage.local.get('filters')).toEqual({
      code: 'storage_unavailable',
      message: 'Browser storage is unavailable for this Soul App scope.',
      ok: false,
    })
  })

  it('reports invalid JSON values without throwing', () => {
    const local = new MemoryStorage()
    const storage = createSoulAppWebStorage({
      appId: 'demo-soul-app',
      localStorage: local,
      workerId: 'worker-1',
      workspaceId: 'workspace-1',
    })

    local.setItem(storage.local.key('filters'), '{not json')

    expect(storage.local.get('filters')).toEqual({
      code: 'parse_error',
      message: 'Browser storage value is not valid JSON.',
      ok: false,
    })
  })
})

class MemoryStorage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

class ThrowingStorage extends MemoryStorage {
  constructor(private readonly message: string) {
    super()
  }

  override getItem(_key: string): string | null {
    throw new Error(this.message)
  }

  override key(_index: number): string | null {
    throw new Error(this.message)
  }

  override removeItem(_key: string): void {
    throw new Error(this.message)
  }

  override setItem(_key: string, _value: string): void {
    throw new Error(this.message)
  }
}

describe('defineSoulApp manifest route ownership', () => {
  it('does not inject universal workbench routes into app manifests', () => {
    const demo = demoSoulApp()

    expect(demo.manifest.ui?.routes).toBeDefined()
    expect(demo.manifest.ui!.routes!.map(route => route.id)).toEqual(['demo-route'])
    expect(demo.manifest.ui!.routes!.some(route => route.id === 'universal-workbench')).toBe(false)
  })

  it('preserves explicit universal workbench route declarations', () => {
    const base = demoSoulApp()
    const app = defineSoulApp({
      ...base,
      manifest: {
        ...base.manifest,
        ui: {
          artifactPreviews: base.manifest.ui!.artifactPreviews,
          panels: base.manifest.ui!.panels,
          routes: [{
            entry: './product/web/routes/universal.tsx',
            id: 'universal-workbench',
            label: 'Custom Universal',
            path: '/custom',
            surface: { entry: '/micro-app/custom', renderer: 'micro-app' as const, scope: 'app' as const },
          }],
        },
      },
    })

    const routes = app.manifest.ui!.routes!
    expect(routes.filter(r => r.id === 'universal-workbench')).toHaveLength(1)
    expect(routes[0]!.label).toBe('Custom Universal')
  })
})

function demoSoulApp(): SoulAppDefinition {
  return defineSoulApp({
    manifest: {
      api: {
        entry: './src/domain-api.ts',
        routePrefix: '/api/local/apps/demo-soul-app',
      },
      capabilities: [{
        artifactTypes: ['demo-report'],
        description: 'Create a demo report.',
        id: 'demo-report',
        name: 'Demo Report',
        outputKind: 'demo-report',
        promptRef: './product/workflows/demo-report/prompt.md',
        version: '1.0.0',
        workspaceTypes: ['demo-workspace'],
      }],
      compatibility: {
        host: { minVersion: '0.12.0' },
        sdk: { minVersion: '0.1.0' },
      },
      connectors: { optional: [], required: [] },
      description: 'Demo Soul App for SDK boundary tests.',
      engineAssets: defineSoulAppEngineAssets({
        skills: {
          source: './engine-assets/skills',
          targets: ['codex', 'claude-code'],
        },
        workspace: {
          source: './engine-assets/workspace',
        },
      }),
      exports: {
        runtime: './host-adapter/index.ts',
        ui: './host-adapter/index.ts',
      },
      healthcheck: {
        kind: 'protocol-handler',
        ref: './src/healthcheck.ts',
        timeoutMs: 1000,
      },
      id: 'demo-soul-app',
      modes: {
        hostMounted: { entry: './host-adapter/mounted/host-mounted.ts', supported: true },
        standalone: { entry: './host-adapter/standalone/standalone.ts', supported: true },
      },
      name: 'Demo Soul App',
      pack: {
        refs: [{ id: 'demo-pack', ref: './product/profiles/demo-soul-app/SOUL.md', source: 'embedded', version: '1.0.0' }],
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
          entry: './product/web/artifact-previews/demo-preview.tsx',
          id: 'demo-preview',
          label: 'Demo preview',
          slot: 'artifact-preview',
          target: 'demo-report',
        }],
        panels: [{
          entry: './product/web/panels/demo-panel.tsx',
          id: 'demo-panel',
          label: 'Demo panel',
          slot: 'panel',
        }],
        routes: [{
          entry: './product/web/routes/demo-route.tsx',
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
