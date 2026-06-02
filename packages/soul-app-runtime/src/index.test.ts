import type { SoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'
import type { LocalExecutor } from './index'

import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'bun:test'

import { createMountedSoulAppTestRuntime, createStandaloneSoulAppRuntime, mountSessionApiProxy, renderUniversalWorkbenchHtml } from './index'

const now = () => '2026-05-12T23:30:00.000Z'

const executor: LocalExecutor = {
  async invoke() {
    return {
      summary: 'Descriptor Soul produced one invocation.',
    }
  },
}

describe('descriptor Soul runtime harness', () => {
  let roots: string[] = []

  afterEach(async () => {
    for (const root of roots)
      await rm(root, { recursive: true, force: true })
    roots = []
  })

  it('runs one descriptor-defined Soul in standalone mode without Host catalog leakage', async () => {
    const root = tempRoot('standalone')
    const distRoot = path.join(root, 'dist')
    await writeDemoEngineAssets(distRoot)
    const descriptor = demoDescriptor()

    const standalone = await createStandaloneSoulAppRuntime(descriptor, {
      appDistRoot: distRoot,
      appHome: root,
      executor,
      hostVersion: '1.0.0',
      now,
      workerId: 'demo-worker',
      workerName: 'Demo Worker',
    })

    expect(standalone.descriptor.identity.appId).toBe('demo-soul-app')
    expect(standalone.catalog.apps.map(item => item.appId)).toEqual(['demo-soul-app'])
    expect(standalone.catalog.souls.map(item => item.id)).toEqual(['demo-soul-app'])
    expect(standalone.worker).toEqual({
      appId: 'demo-soul-app',
      defaultEngineId: 'codex',
      id: 'demo-worker',
      metadata: expect.objectContaining({
        domainSoulId: 'demo',
        soulAppId: 'demo-soul-app',
      }),
      name: 'Demo Worker',
    })

    const workspace = await standalone.runtime.createWorkspace({ name: 'Standalone workspace', type: 'workspace' })
    await expect(readFile(path.join(workspace.rootPath, 'AGENTS.md'), 'utf8')).resolves.toContain('# Standalone workspace')
    await expect(readFile(path.join(workspace.rootPath, '.agents', 'skills', 'demo-soul-app-default', 'SKILL.md'), 'utf8')).resolves.toContain('Default Skill')
    await expect(readFile(path.join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')).resolves.toContain('workspace-file')

    const session = await standalone.runtime.createSession({
      title: 'Standalone session',
      workspaceId: workspace.id,
    })
    const result = await standalone.runtime.startInvocation({
      engineId: 'test',
      input: 'Create standalone artifact.',
      sessionId: session.id,
    })

    expect('turn' in result).toBe(false)
    expect(result.invocation).toBeDefined()
    expect(result.session.status).toBe('active')
  })

  it('creates a mounted descriptor test runtime', async () => {
    const root = tempRoot('mounted')
    const distRoot = path.join(root, 'dist')
    await writeDemoEngineAssets(distRoot)
    const mounted = await createMountedSoulAppTestRuntime(demoDescriptor(), {
      appDistRoot: distRoot,
      dbPath: path.join(root, 'worker.db'),
      executor,
      hostVersion: '1.0.0',
      now,
      workerId: 'mounted-worker',
      workerName: 'Mounted Worker',
      workersRoot: path.join(root, 'workers'),
    })

    expect(mounted.catalog.apps.map(app => app.appId)).toEqual(['demo-soul-app'])
    expect(mounted.worker.appId).toBe('demo-soul-app')
  })

  it('renders the universal workbench with public descriptor route prefix', () => {
    const html = renderUniversalWorkbenchHtml({
      appId: 'demo-soul-app',
      appName: 'Demo Soul App',
      surfaceId: 'workbench',
      theme: 'light',
    })

    expect(html).toContain('<title>Demo Soul App · Universal Workbench</title>')
    expect(html).toContain('id="aiworker-micro-app-host-data"')
    expect(html).toContain('"appId":"demo-soul-app"')
    expect(html).toContain('"routePrefix":"/api/apps/demo-soul-app"')
    expect(html).toContain('"surfaceId":"workbench"')
    expect(html).toContain('"theme":"light"')
    expect(html).toContain('window.microApp')
  })

  it('maps mounted follow-up calls to the session-level invocation API', async () => {
    const calls: Array<{ method: string, url: string }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url: String(url) })
      return Response.json({ ok: true })
    }) as typeof fetch
    try {
      const response = await mountSessionApiProxy(new Request('http://soul.test/api/sessions/session-1/invocations', {
        body: JSON.stringify({ input: 'Continue.' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }), {
        hostApiBaseUrl: 'http://host.test',
        workerId: 'worker-1',
      })

      expect(response).not.toBeNull()
      expect(await response!.json()).toEqual({ ok: true })
      expect(calls).toEqual([{ method: 'POST', url: 'http://host.test/api/sessions/session-1/invocations' }])
      expect(mountSessionApiProxy(new Request('http://soul.test/api/sessions/session-1/turns', { method: 'GET' }), {
        hostApiBaseUrl: 'http://host.test',
        workerId: 'worker-1',
      })).toBeNull()
      expect(mountSessionApiProxy(new Request('http://soul.test/api/sessions/session-1/turns', { method: 'POST' }), {
        hostApiBaseUrl: 'http://host.test',
        workerId: 'worker-1',
      })).toBeNull()
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('maps mounted workspace collection calls to canonical workspace locator APIs', async () => {
    const calls: Array<{ body: unknown, method: string, url: string }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? await new Response(init.body).json() : null
      calls.push({ body, method: init?.method ?? 'GET', url: String(url) })
      return Response.json({ workspaces: [] })
    }) as typeof fetch
    try {
      const listResponse = await mountSessionApiProxy(new Request('http://soul.test/api/workspaces'), {
        hostApiBaseUrl: 'http://host.test',
        workerId: 'worker-1',
      })
      const createResponse = await mountSessionApiProxy(new Request('http://soul.test/api/workspaces', {
        body: JSON.stringify({ name: 'Mounted Workspace', type: 'workspace', workerId: 'client-worker' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }), {
        hostApiBaseUrl: 'http://host.test',
        workerId: 'worker-1',
      })

      expect(listResponse).not.toBeNull()
      expect(createResponse).not.toBeNull()
      expect(calls).toEqual([
        { body: null, method: 'GET', url: 'http://host.test/api/workspace-locators?workerId=worker-1' },
        {
          body: { name: 'Mounted Workspace', type: 'workspace', workerId: 'worker-1' },
          method: 'POST',
          url: 'http://host.test/api/workspace-locators',
        },
      ])
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('maps mounted session collection calls to canonical session APIs', async () => {
    const calls: Array<{ body: unknown, method: string, url: string }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? await new Response(init.body).json() : null
      calls.push({ body, method: init?.method ?? 'GET', url: String(url) })
      return Response.json({ sessions: [] })
    }) as typeof fetch
    try {
      const listResponse = await mountSessionApiProxy(new Request('http://soul.test/api/sessions'), {
        hostApiBaseUrl: 'http://host.test',
        workerId: 'worker-1',
        workspaceId: 'workspace-1',
      })
      const createResponse = await mountSessionApiProxy(new Request('http://soul.test/api/sessions', {
        body: JSON.stringify({ title: 'Mounted Session', workerId: 'client-worker' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }), {
        hostApiBaseUrl: 'http://host.test',
        workerId: 'worker-1',
        workspaceId: 'workspace-1',
      })

      expect(listResponse).not.toBeNull()
      expect(createResponse).not.toBeNull()
      expect(calls).toEqual([
        { body: null, method: 'GET', url: 'http://host.test/api/sessions?workerId=worker-1&workspaceId=workspace-1' },
        {
          body: {
            title: 'Mounted Session',
            workerId: 'worker-1',
            workspaceId: 'workspace-1',
          },
          method: 'POST',
          url: 'http://host.test/api/sessions',
        },
      ])
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('maps mounted session events through canonical session reads', async () => {
    const calls: Array<{ method: string, url: string }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url: String(url) })
      return Response.json({
        events: [
          { id: 1, type: 'start' },
          { id: 2, type: 'progress' },
          { id: '3', type: 'done' },
        ],
        session: { id: 'session-1' },
      })
    }) as typeof fetch
    try {
      const response = await mountSessionApiProxy(new Request('http://soul.test/api/sessions/session-1/events?after=1'), {
        hostApiBaseUrl: 'http://host.test',
        workerId: 'worker-1',
      })

      expect(response).not.toBeNull()
      expect(await response!.json()).toEqual({
        events: [
          { id: 2, type: 'progress' },
          { id: '3', type: 'done' },
        ],
      })
      expect(calls).toEqual([{ method: 'GET', url: 'http://host.test/api/sessions/session-1' }])
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  function tempRoot(label: string): string {
    const root = mkdtempSync(path.join(tmpdir(), `aiworker-runtime-${label}-`))
    roots.push(root)
    return root
  }
})

async function writeDemoEngineAssets(distRoot: string): Promise<void> {
  await mkdir(path.join(distRoot, 'engine-assets', 'workspace'), { recursive: true })
  await mkdir(path.join(distRoot, 'engine-assets', 'skills', 'default'), { recursive: true })
  await writeFile(path.join(distRoot, 'engine-assets', 'workspace', 'AGENTS.md'), '# {{workspaceName}}\n')
  await writeFile(path.join(distRoot, 'engine-assets', 'skills', 'default', 'SKILL.md'), '# Default Skill\n')
}

function demoDescriptor(): SoulDescriptorV1 {
  return {
    api: null,
    compatibility: {
      engines: ['codex', 'claude-code'],
      host: '>=1.0.0',
      sdk: '>=1.0.0',
    },
    configuration: {
      defaults: { engine: 'codex' },
      features: {
        engine: true,
        mcp: false,
        skills: true,
        workbench: true,
        workspaceAssets: true,
      },
      scope: 'worker',
      version: '1',
    },
    engine: {
      skills: { source: 'dist/engine-assets/skills' },
      workspaceAssets: { source: 'dist/engine-assets/workspace' },
    },
    extensions: {},
    external: {},
    health: {
      ready: true,
      type: 'static',
    },
    identity: {
      appId: 'demo-soul-app',
      description: 'Demo descriptor Soul.',
      name: 'Demo Soul App',
      soulId: 'demo',
      version: '0.1.0',
    },
    protocol: 'soul/v1',
    workbench: {
      entry: 'dist/web/workbench/index.html',
      mode: 'sdk-common',
      router: { mode: 'search' },
      type: 'micro-app',
    },
  }
}
