import type { SoulAppDefinition } from '@zonease/aiworker-soul-app-sdk'
import type { LocalExecutor } from './index'

import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { defineSoulApp, namespaceSoulAppCapabilityId } from '@zonease/aiworker-soul-app-sdk'
import { afterEach, describe, expect, it } from 'bun:test'

import { createMountedSoulAppTestRuntime, createStandaloneSoulAppRuntime, mountSessionApiProxy, renderUniversalWorkbenchHtml } from './index'

const now = () => '2026-05-12T23:30:00.000Z'

const executor: LocalExecutor = {
  async invoke(_input) {
    return {
      summary: 'Demo app produced one artifact.',
    }
  },
}

describe('Soul App runtime harness', () => {
  let roots: string[] = []

  afterEach(async () => {
    for (const root of roots)
      await rm(root, { recursive: true, force: true })
    roots = []
  })

  it('runs one SDK-defined app in standalone mode without Host catalog leakage', async () => {
    const root = tempRoot('standalone')
    const appRoot = path.join(root, 'app')
    await writeDemoEngineAssets(appRoot)
    const app = demoSoulApp()

    const standalone = await createStandaloneSoulAppRuntime(app, {
      appHome: root,
      appSourceRoot: appRoot,
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
    expect(standalone.worker).toEqual({
      defaultEngineId: 'codex',
      id: 'demo-worker',
      metadata: expect.objectContaining({
        defaultTemplates: [namespaceSoulAppCapabilityId('demo-soul-app', 'demo-report')],
        domainSoulId: 'demo-soul',
        soulAppId: 'demo-soul-app',
      }),
      name: 'Demo Worker',
      soulId: 'demo-soul-app',
    })
    expect(standalone.worker).not.toHaveProperty('metadataJson')
    expect(standalone.snapshot().worker.soulId).toBe('demo-soul-app')
    expect(standalone.snapshot().worker.metadataJson.domainSoulId).toBe('demo-soul')

    const workspace = await standalone.runtime.createWorkspace({ name: 'Standalone workspace', type: 'demo-workspace' })
    await expect(readFile(path.join(workspace.rootPath, 'README.md'), 'utf8')).resolves.toContain('# Standalone workspace')
    await expect(readFile(path.join(workspace.rootPath, '.agents', 'skills', 'demo-soul-app-demo-report', 'SKILL.md'), 'utf8')).resolves.toContain('Demo Report Skill')
    await expect(readFile(path.join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')).resolves.toContain('workspace-file')
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

    expect(result.turn).toBeDefined()
    expect(result.invocation).toBeDefined()
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

  it('renders the universal workbench as an interactive mounted client shell', () => {
    const html = renderUniversalWorkbenchHtml({
      appId: 'demo-soul-app',
      appName: 'Demo Soul App',
      routePrefix: '/api/local/apps/demo-soul-app',
      surfaceId: 'universal-workbench',
      theme: 'light',
    })

    expect(html).toContain('<title>Demo Soul App · Universal Workbench</title>')
    expect(html).toContain('id="aiworker-micro-app-host-data"')
    expect(html).toContain('"appId":"demo-soul-app"')
    expect(html).toContain('"routePrefix":"/api/local/apps/demo-soul-app"')
    expect(html).toContain('"surfaceId":"universal-workbench"')
    expect(html).toContain('"theme":"light"')
    expect(html).toContain('window.microApp')
    expect(html).toContain('api.addDataListener(receiveHostData, true)')
    expect(html).toContain('api.dispatch({ type: "ready" })')
    expect(html).toContain('<main id="root"')
    expect(html).toContain('<script src="/api/local/apps/demo-soul-app/assets/universal-workbench-client.js"></script>')
    expect(html).not.toContain('type="module"')
    expect(html).not.toContain('This app-owned micro-app surface receives worker, workspace, session, and theme context from the Host mount bridge.')
  })

  it('proxies mounted universal workbench session streams to Host stream endpoints', async () => {
    const originalFetch = globalThis.fetch
    const proxiedRequests: Array<{ body: string, method: string, url: string }> = []
    globalThis.fetch = (async (input, init) => {
      proxiedRequests.push({
        body: await new Response(init?.body).text(),
        method: init?.method ?? 'GET',
        url: String(input),
      })
      return new Response('event: session\ndata: {"id":"session-1"}\n\n', {
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
        status: 200,
      })
    }) as typeof fetch

    try {
      const createResponse = await mountSessionApiProxy(new Request('http://mounted.local/api/sessions/stream?workerId=worker-1&workspaceId=workspace-1', {
        body: JSON.stringify({ input: 'Start from mounted composer' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }), {
        hostApiBaseUrl: 'http://host.local',
        workerId: 'fallback-worker',
      })

      const turnResponse = await mountSessionApiProxy(new Request('http://mounted.local/api/sessions/session-1/turns/stream?workerId=worker-1', {
        body: JSON.stringify({ input: 'Continue from mounted composer' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }), {
        hostApiBaseUrl: 'http://host.local',
        workerId: 'fallback-worker',
      })

      expect(createResponse?.headers.get('content-type')).toContain('text/event-stream')
      expect(turnResponse?.headers.get('content-type')).toContain('text/event-stream')
      expect(proxiedRequests).toEqual([
        {
          body: '{"input":"Start from mounted composer"}',
          method: 'POST',
          url: 'http://host.local/api/local/workers/worker-1/workspaces/workspace-1/sessions/stream',
        },
        {
          body: '{"input":"Continue from mounted composer"}',
          method: 'POST',
          url: 'http://host.local/api/local/workers/worker-1/sessions/session-1/messages/stream',
        },
      ])
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('uses the same SDK definition through mounted Host projection without changing domain logic', async () => {
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

    expect(result.turn).toBeDefined()
    expect(result.invocation).toBeDefined()
  })

  function tempRoot(label: string): string {
    const root = mkdtempSync(path.join(tmpdir(), `aiworker-runtime-${label}-`))
    roots.push(root)
    return root
  }
})

async function writeDemoEngineAssets(appRoot: string): Promise<void> {
  await mkdir(path.join(appRoot, 'engine-assets', 'workspace'), { recursive: true })
  await mkdir(path.join(appRoot, 'engine-assets', 'skills', 'demo-report'), { recursive: true })
  await writeFile(path.join(appRoot, 'engine-assets', 'workspace', 'README.md'), '# {{workspaceName}}\n')
  await writeFile(path.join(appRoot, 'engine-assets', 'workspace', 'AGENTS.md'), '# {{workerName}}\n')
  await writeFile(path.join(appRoot, 'engine-assets', 'workspace', 'CLAUDE.md'), '@AGENTS.md\n')
  await writeFile(path.join(appRoot, 'engine-assets', 'workspace', '.gitignore'), '.aiworker/projections.json\n')
  await writeFile(path.join(appRoot, 'engine-assets', 'skills', 'demo-report', 'SKILL.md'), '# Demo Report Skill\n')
}

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
      engineAssets: {
        skills: {
          source: './engine-assets/skills',
          targets: ['codex', 'claude-code'],
        },
        workspace: {
          source: './engine-assets/workspace',
        },
      },
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
        { action: 'write', kind: 'storage', reason: 'Create demo artifacts.', target: 'demo-soul-app' },
        { action: 'read', kind: 'storage', reason: 'Read demo records.', target: 'demo-soul-app' },
        { action: 'write', kind: 'storage', reason: 'Write demo records.', target: 'demo-soul-app' },
        { action: 'serve', kind: 'api', reason: 'Serve demo API.', target: '/api/local/apps/demo-soul-app' },
      ],
      protocol: 'soul-app/v1',
      soul: {
        description: 'Demo vertical Soul.',
        domain: 'demo',
        id: 'demo-soul',
        name: 'Demo',
        version: '1.0.0',
      },
      storage: {
        migrations: [],
        namespace: 'demo-soul-app',
      },
      ui: {
        artifactPreviews: [],
        panels: [],
        routes: [{ entry: './product/web/routes/demo-home.tsx', id: 'demo-home', label: 'Demo', path: '/demo' }],
        workspaceWidgets: [],
      },
      version: '1.0.0',
      workspaceTypes: [{
        artifactTypes: ['demo-report'],
        defaultCapabilityIds: ['demo-report'],
        description: 'Demo workspace.',
        id: 'demo-workspace',
        name: 'Demo Workspace',
      }, {
        artifactTypes: ['demo-report'],
        defaultCapabilityIds: ['demo-report'],
        description: 'Demo duplicate-default workspace.',
        id: 'demo-workspace-duplicate-default',
        name: 'Demo Duplicate Default Workspace',
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
  })
}
