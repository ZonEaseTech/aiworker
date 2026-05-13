import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { hrSoulAppManifest, namespaceSoulAppCapabilityId } from '@zonease/aiworker-shared'
import {
  closeWorkerDb,
  createSession,
  createWorkspace,
  initWorkerDb,
  runWorkerMigrations,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { bootstrapWorkerApp } from './worker'

const HR_APP_ID = 'aiworker-hr'
const HR_CANDIDATE_SCREEN = namespaceSoulAppCapabilityId(HR_APP_ID, 'candidate-screen')

describe('local daemon API', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-workspace-api-'))
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  async function app(token?: string, webStaticDir?: string) {
    const boot = await bootstrapWorkerApp({
      dbPath: join(dir, 'worker.db'),
      workersRoot: join(dir, 'workers'),
      token,
      webStaticDir,
      runtimeVersion: 'test',
      executor: {
        async invoke(input) {
          input.onEvent?.({ kind: 'status', label: 'test-started', detail: input.engineId })
          input.onEvent?.({ id: 'tool-1', input: { command: 'test engine' }, kind: 'tool_use', name: 'Bash' })
          input.onEvent?.({ id: 'tool-1', content: 'ok', kind: 'tool_result', name: 'Bash' })
          input.onEvent?.({ kind: 'text', text: 'done' })
          return {
            summary: 'done',
            artifacts: [{ path: `artifacts/${input.sessionId}/result.md`, title: 'Result', content: `# ${input.prompt}\n` }],
            review: { verdict: 'pass', findings: [] },
            lessons: [{ statement: 'Keep evidence attached.', evidence: [{ turnId: input.turnId }] }],
          }
        },
      },
    })
    return boot.app
  }

  async function createHrWorker(target: Awaited<ReturnType<typeof app>>) {
    const res = await target.request('/api/local/workers', {
      method: 'POST',
      body: JSON.stringify({ id: 'hr-worker', soulId: HR_APP_ID, name: 'HR Recruiting' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(201)
    return (await res.json() as { worker: { id: string, soulId: string } }).worker
  }

  function seedLegacyHrMetadata() {
    const seedNow = '2026-05-13T13:04:00.000Z'
    closeWorkerDb()
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
    upsertWorker({
      id: 'legacy-hr-worker',
      soulId: 'hr',
      name: 'Legacy HR',
      defaultEngineId: 'codex',
      at: seedNow,
    })
    createWorkspace({
      id: 'legacy-hr-workspace',
      workerId: 'legacy-hr-worker',
      name: 'Legacy HR workspace',
      rootPath: join(dir, 'workers', 'legacy-hr-worker', 'workspaces', 'legacy-hr-workspace'),
      at: seedNow,
    })
    createSession({
      id: 'legacy-hr-session',
      workerId: 'legacy-hr-worker',
      workspaceId: 'legacy-hr-workspace',
      capabilityTemplateId: 'candidate-screen',
      title: 'Legacy candidate screen',
      metadataJson: { capabilityTemplateId: 'candidate-screen', soulName: 'HR' },
      at: seedNow,
    })
    closeWorkerDb()
  }

  it('bootstraps official apps and rejects legacy built-in Soul ids', async () => {
    const target = await app()

    const soulsBody = await (await target.request('/api/local/souls')).json() as { souls: Array<{ id: string, status: string }> }
    expect(soulsBody.souls).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'aiworker-hr', status: 'available' }),
      expect.objectContaining({ id: 'aiworker-qa', status: 'available' }),
    ]))
    expect(soulsBody.souls.some(soul => soul.id === 'hr')).toBe(false)

    const legacyRes = await target.request('/api/local/workers', {
      method: 'POST',
      body: JSON.stringify({ id: 'legacy-hr-worker', soulId: 'hr', name: 'Legacy HR' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(legacyRes.status).toBe(400)
    expect(await legacyRes.json()).toMatchObject({ error: { code: 'SOUL_NOT_AVAILABLE' } })

    const appWorkerRes = await target.request('/api/local/workers', {
      method: 'POST',
      body: JSON.stringify({ id: 'official-hr-worker', soulId: HR_APP_ID, name: 'Official HR' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(appWorkerRes.status).toBe(201)
    expect(await appWorkerRes.json()).toMatchObject({ worker: { soulId: HR_APP_ID } })
  })

  it('does not re-enable disabled official apps on daemon restart', async () => {
    const target = await app()
    const disableRes = await target.request(`/api/local/apps/${HR_APP_ID}/disable`, { method: 'POST' })
    expect(disableRes.status).toBe(200)

    const restarted = await app()
    const soulsBody = await (await restarted.request('/api/local/souls')).json() as { souls: Array<{ id: string, status: string }> }
    expect(soulsBody.souls).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: HR_APP_ID, status: 'coming_soon' }),
      expect.objectContaining({ id: 'aiworker-qa', status: 'available' }),
    ]))
    const workerRes = await restarted.request('/api/local/workers', {
      method: 'POST',
      body: JSON.stringify({ id: 'disabled-hr-worker', soulId: HR_APP_ID, name: 'Disabled HR' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(workerRes.status).toBe(400)
    expect(await workerRes.json()).toMatchObject({ error: { code: 'SOUL_NOT_AVAILABLE' } })
  })

  it('discards legacy HR worker metadata during daemon bootstrap', async () => {
    seedLegacyHrMetadata()

    const target = await app()

    const workersBody = await (await target.request('/api/local/workers')).json() as { workers: Array<{ id: string, soulId: string }> }
    expect(workersBody.workers.some(worker => worker.id === 'legacy-hr-worker')).toBe(false)

    const workspacesBody = await (await target.request('/api/local/workspaces')).json() as {
      workspaces: Array<{ id: string, workerId: string }>
    }
    expect(workspacesBody.workspaces.some(workspace => workspace.id === 'legacy-hr-workspace')).toBe(false)

    const sessionsBody = await (await target.request('/api/local/sessions')).json() as {
      sessions: Array<{ id: string, workspaceId: string }>
    }
    expect(sessionsBody.sessions.some(session => session.id === 'legacy-hr-session')).toBe(false)

    const appWorkerRes = await target.request('/api/local/workers', {
      method: 'POST',
      body: JSON.stringify({ id: 'official-hr-after-discard', soulId: HR_APP_ID, name: 'Official HR' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(appWorkerRes.status).toBe(201)
  })

  it('serves the session workspace loop through /api/local routes', async () => {
    const target = await app()
    const createdWorker = await createHrWorker(target)

    const workersRes = await target.request('/api/local/workers')
    expect(workersRes.status).toBe(200)
    const workersBody = await workersRes.json() as { workers: Array<{ id: string, soulId: string }> }
    const hrWorker = workersBody.workers.find(worker => worker.soulId === HR_APP_ID)
    expect(hrWorker?.id).toBe('hr-worker')
    expect(createdWorker.id).toBe(hrWorker!.id)

    const workspaceRes = await target.request(`/api/local/workers/${hrWorker!.id}/workspaces`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Hiring workspace' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(workspaceRes.status).toBe(201)
    const workspaceBody = await workspaceRes.json() as { workspace: { id: string } }

    const sessionRes = await target.request(`/api/local/workers/${hrWorker!.id}/workspaces/${workspaceBody.workspace.id}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        capabilityTemplateId: HR_CANDIDATE_SCREEN,
        context: 'Review packet',
        input: 'Prepare a candidate screen.',
        title: 'Screen candidate',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(sessionRes.status).toBe(201)
    const sessionBody = await sessionRes.json() as {
      artifacts: unknown[]
      lessons: unknown[]
      session: { capabilityTemplateId: string, status: string }
      turn: { status: string }
    }
    expect(sessionBody.session.capabilityTemplateId).toBe(HR_CANDIDATE_SCREEN)
    expect(sessionBody.turn.status).toBe('succeeded')
    expect(sessionBody.artifacts).toHaveLength(1)
    expect(sessionBody.lessons).toHaveLength(1)

    const filesRes = await target.request(`/api/local/workspaces/${workspaceBody.workspace.id}/files`)
    const filesBody = await filesRes.json() as { files: Array<{ path: string }> }
    const filePath = filesBody.files[0]!.path
    const rawRes = await target.request(`/api/local/workspaces/${workspaceBody.workspace.id}/files/raw/${filePath}`)
    expect(await rawRes.text()).toContain('Prepare a candidate screen.')

    const eventsRes = await target.request('/api/local/events')
    const eventsBody = await eventsRes.json() as { events: unknown[] }
    expect(eventsBody.events.length).toBeGreaterThan(0)
  })

  it('mounts enabled Soul App manifests into app, soul, template, worker, and session surfaces', async () => {
    const target = await app()
    const installRes = await target.request('/api/local/apps/install', {
      method: 'POST',
      body: JSON.stringify({ manifest: hrSoulAppManifest }),
      headers: { 'content-type': 'application/json' },
    })
    expect(installRes.status).toBe(201)
    const installBody = await installRes.json() as { app: { appId: string, status: string } }
    expect(installBody.app).toMatchObject({ appId: 'aiworker-hr', status: 'installed' })

    const enableRes = await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })
    expect(enableRes.status).toBe(200)
    const enableBody = await enableRes.json() as { app: { healthStatus: string, status: string } }
    expect(enableBody.app.status).toBe('enabled')
    expect(enableBody.app.healthStatus).toBe('pass')

    const appsBody = await (await target.request('/api/local/apps')).json() as { apps: Array<{ appId: string, status: string }> }
    expect(appsBody.apps).toEqual(expect.arrayContaining([expect.objectContaining({ appId: 'aiworker-hr', status: 'enabled' })]))

    const soulsBody = await (await target.request('/api/local/souls')).json() as { souls: Array<{ id: string, status: string }> }
    expect(soulsBody.souls).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'aiworker-hr', status: 'available' })]))

    const capabilityId = HR_CANDIDATE_SCREEN
    const templatesBody = await (await target.request('/api/local/templates?soulId=aiworker-hr')).json() as { templates: Array<{ id: string, soulId: string }> }
    expect(templatesBody.templates).toEqual(expect.arrayContaining([expect.objectContaining({ id: capabilityId, soulId: 'aiworker-hr' })]))

    const workerRes = await target.request('/api/local/workers', {
      method: 'POST',
      body: JSON.stringify({ id: 'mounted-hr-worker', soulId: 'aiworker-hr', name: 'Mounted HR' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(workerRes.status).toBe(201)
    const workspaceBody = await (await target.request('/api/local/workers/mounted-hr-worker/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Mounted HR workspace', type: 'people-profile' }),
      headers: { 'content-type': 'application/json' },
    })).json() as { workspace: { id: string } }

    const sessionRes = await target.request(`/api/local/workers/mounted-hr-worker/workspaces/${workspaceBody.workspace.id}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        capabilityTemplateId: capabilityId,
        context: 'Review mounted app candidate packet',
        input: 'Prepare a mounted candidate screen.',
        title: 'Mounted candidate screen',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(sessionRes.status).toBe(201)
    const sessionBody = await sessionRes.json() as { session: { capabilityTemplateId: string, metadataJson: Record<string, unknown> } }
    expect(sessionBody.session.capabilityTemplateId).toBe(capabilityId)
    expect(sessionBody.session.metadataJson.soulAppId).toBe('aiworker-hr')

    const mountedApiRes = await target.request('/api/local/apps/aiworker-hr/domain')
    expect(mountedApiRes.status).toBe(424)
    expect(await mountedApiRes.json()).toMatchObject({ error: { code: 'SOUL_APP_SERVICE_NOT_CONFIGURED' } })

    const disableRes = await target.request('/api/local/apps/aiworker-hr/disable', { method: 'POST' })
    expect(disableRes.status).toBe(200)
    const disabledTemplatesBody = await (await target.request('/api/local/templates?soulId=aiworker-hr')).json() as { templates: unknown[] }
    expect(disabledTemplatesBody.templates).toEqual([])

    const blockedSessionRes = await target.request(`/api/local/workers/mounted-hr-worker/workspaces/${workspaceBody.workspace.id}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        capabilityTemplateId: capabilityId,
        context: 'Should be blocked',
        input: 'Try disabled app.',
        title: 'Disabled app session',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(blockedSessionRes.status).toBe(400)
    expect(await blockedSessionRes.json()).toMatchObject({ error: { code: 'TEMPLATE_NOT_AVAILABLE' } })
  })

  it('proxies enabled Soul App API calls to a mounted local service', async () => {
    const target = await app()
    const mountedService = Bun.serve({
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/health')
          return Response.json({ appId: 'aiworker-hr', status: 'ok' })
        if (url.pathname === '/domain') {
          return Response.json({
            appId: request.headers.get('x-aiworker-app-id'),
            authorization: request.headers.get('authorization'),
            cookie: request.headers.get('cookie'),
            forwardedHost: request.headers.get('x-forwarded-host'),
            hostUrl: request.headers.get('x-aiworker-host-url'),
            mountContext: request.headers.get('x-aiworker-mount-context'),
            mountSignature: request.headers.get('x-aiworker-mount-signature'),
            mounted: true,
            mountToken: request.headers.get('x-aiworker-mount-token'),
            routePrefix: request.headers.get('x-aiworker-route-prefix'),
          })
        }
        if (url.pathname === '/surfaces/routes/hr-home') {
          return Response.json({
            appId: request.headers.get('x-aiworker-app-id'),
            context: request.headers.get('x-aiworker-mount-context'),
            renderer: 'host-descriptor',
            signature: request.headers.get('x-aiworker-mount-signature'),
            title: 'HR Mounted Workbench',
            type: 'aiworker.surface.descriptor.v1',
          })
        }
        if (url.pathname === '/frames/widgets/hr-people-widget') {
          return new Response('<!doctype html><html><body><h1>HR frame</h1></body></html>', {
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })
        }
        return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
      },
      hostname: '127.0.0.1',
      port: 0,
    })

    try {
      const installRes = await target.request('/api/local/apps/install', {
        method: 'POST',
        body: JSON.stringify({
          manifest: {
            ...hrSoulAppManifest,
            api: {
              ...hrSoulAppManifest.api,
              localService: {
                baseUrl: `http://127.0.0.1:${mountedService.port}`,
                healthPath: '/health',
              },
            },
          },
        }),
        headers: { 'content-type': 'application/json' },
      })
      expect(installRes.status).toBe(201)
      expect((await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })).status).toBe(200)

      const mountedApiRes = await target.request('/api/local/apps/aiworker-hr/domain', {
        headers: {
          'authorization': 'Bearer caller-token',
          'cookie': 'session=caller',
          'x-forwarded-host': 'evil.example.com',
        },
      })
      expect(mountedApiRes.status).toBe(200)
      const mountedApiBody = await mountedApiRes.json() as {
        authorization: string | null
        cookie: string | null
        forwardedHost: string | null
        mountContext: string | null
        mountSignature: string | null
        mountToken: string | null
      }
      expect(mountedApiBody).toMatchObject({
        appId: 'aiworker-hr',
        authorization: null,
        cookie: null,
        forwardedHost: null,
        mounted: true,
        routePrefix: '/api/local/apps/aiworker-hr',
      })
      expect(mountedApiBody.mountToken).toMatch(/^[a-f0-9-]{36}$/)
      expect(mountedApiBody.mountContext).toBeTruthy()
      expect(mountedApiBody.mountSignature).toMatch(/^[a-f0-9]{64}$/)

      const surfaceRes = await target.request('/api/local/apps/aiworker-hr/surfaces/hr-home')
      expect(surfaceRes.status).toBe(200)
      const surfaceBody = await surfaceRes.json() as { context: string | null, renderer: string, signature: string | null, title: string }
      expect(surfaceBody).toMatchObject({ renderer: 'host-descriptor', title: 'HR Mounted Workbench' })
      expect(surfaceBody.context).toBeTruthy()
      expect(surfaceBody.signature).toMatch(/^[a-f0-9]{64}$/)

      const frameRes = await target.request('/api/local/apps/aiworker-hr/surfaces/hr-people-widget')
      expect(frameRes.status).toBe(200)
      const frameBody = await frameRes.json() as { frame: { sandbox: string, url: string }, surface: { renderer: string } }
      expect(frameBody.surface.renderer).toBe('sandboxed-frame')
      expect(frameBody.frame.sandbox).toBe('allow-scripts allow-forms')
      expect(frameBody.frame.url).toBe('/api/local/apps/aiworker-hr/frames/widgets/hr-people-widget')
    }
    finally {
      mountedService.stop()
    }
  })

  it('invokes declared Soul App shell actions and search through generic Host endpoints', async () => {
    const target = await app()
    const mountedService = Bun.serve({
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/health')
          return Response.json({ status: 'ok' })
        if (url.pathname === '/protocol/actions') {
          const body = await request.json() as { protocolAction?: string }
          return Response.json({
            message: 'App-owned action result',
            ok: true,
            protocolAction: body.protocolAction,
            redirectTo: '/hr/people',
            refresh: true,
          })
        }
        if (url.pathname === '/protocol/search') {
          return Response.json({
            items: [
              {
                appId: 'aiworker-hr',
                authority: 'soul-app',
                id: 'profile-draft',
                kind: 'people-profile',
                summary: url.searchParams.get('query'),
                title: 'People profile draft',
              },
            ],
            limit: url.searchParams.get('limit'),
            providerId: url.searchParams.get('providerId'),
          })
        }
        return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
      },
      hostname: '127.0.0.1',
      port: 0,
    })

    try {
      const installRes = await target.request('/api/local/apps/install', {
        method: 'POST',
        body: JSON.stringify({
          manifest: {
            ...hrSoulAppManifest,
            api: {
              ...hrSoulAppManifest.api,
              localService: {
                baseUrl: `http://127.0.0.1:${mountedService.port}`,
                healthPath: '/health',
              },
            },
            ui: {
              ...hrSoulAppManifest.ui,
              shell: {
                primaryAction: {
                  id: 'create-people-profile',
                  label: 'New people profile',
                  protocolAction: 'peopleProfiles.create',
                  slot: 'primary',
                },
                search: {
                  id: 'people-profile-search',
                  label: 'Search people profiles',
                  placeholder: 'Search people profiles',
                  protocolProvider: 'peopleProfiles.search',
                },
              },
            },
          },
        }),
        headers: { 'content-type': 'application/json' },
      })
      expect(installRes.status).toBe(201)
      expect((await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })).status).toBe(200)

      const actionRes = await target.request('/api/local/apps/aiworker-hr/actions/create-people-profile', {
        method: 'POST',
        body: JSON.stringify({ input: { source: 'test' } }),
        headers: { 'content-type': 'application/json' },
      })
      expect(actionRes.status).toBe(200)
      expect(await actionRes.json()).toMatchObject({
        action: {
          id: 'create-people-profile',
          protocolAction: 'peopleProfiles.create',
        },
        result: {
          message: 'App-owned action result',
          ok: true,
          redirectTo: '/hr/people',
          refresh: true,
        },
      })

      const searchRes = await target.request('/api/local/apps/aiworker-hr/search?providerId=peopleProfiles.search&query=ada&limit=2')
      expect(searchRes.status).toBe(200)
      expect(await searchRes.json()).toMatchObject({
        items: [
          expect.objectContaining({
            appId: 'aiworker-hr',
            authority: 'soul-app',
            kind: 'people-profile',
            summary: 'ada',
          }),
        ],
        limit: '2',
        providerId: 'peopleProfiles.search',
      })
    }
    finally {
      mountedService.stop()
    }
  })

  it('rejects undeclared Soul App shell actions and search providers', async () => {
    const target = await app()
    await target.request('/api/local/apps/install', {
      method: 'POST',
      body: JSON.stringify({ manifest: hrSoulAppManifest }),
      headers: { 'content-type': 'application/json' },
    })
    await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })

    const actionRes = await target.request('/api/local/apps/aiworker-hr/actions/delete-all-people', { method: 'POST' })
    expect(actionRes.status).toBe(404)
    expect(await actionRes.json()).toMatchObject({ error: { code: 'SOUL_APP_ACTION_NOT_DECLARED' } })

    const searchRes = await target.request('/api/local/apps/aiworker-hr/search?providerId=people.internal&query=ada')
    expect(searchRes.status).toBe(404)
    expect(await searchRes.json()).toMatchObject({ error: { code: 'SOUL_APP_SEARCH_NOT_DECLARED' } })
  })

  it('rejects action and search invocation for disabled Soul Apps', async () => {
    const target = await app()
    await target.request('/api/local/apps/install', {
      method: 'POST',
      body: JSON.stringify({ manifest: hrSoulAppManifest }),
      headers: { 'content-type': 'application/json' },
    })

    const actionRes = await target.request('/api/local/apps/aiworker-hr/actions/create-people-profile', { method: 'POST' })
    expect(actionRes.status).toBe(409)
    expect(await actionRes.json()).toMatchObject({ error: { code: 'SOUL_APP_DISABLED' } })

    const searchRes = await target.request('/api/local/apps/aiworker-hr/search?providerId=peopleProfiles.search&query=ada')
    expect(searchRes.status).toBe(409)
    expect(await searchRes.json()).toMatchObject({ error: { code: 'SOUL_APP_DISABLED' } })
  })

  it('healthchecks declared mounted service base URLs before proxying', async () => {
    const target = await app()
    const mountedService = Bun.serve({
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/health')
          return Response.json({ status: 'not-ready' }, { status: 503 })
        return Response.json({ appId: 'aiworker-hr' })
      },
      hostname: '127.0.0.1',
      port: 0,
    })

    try {
      await target.request('/api/local/apps/install', {
        method: 'POST',
        body: JSON.stringify({
          manifest: {
            ...hrSoulAppManifest,
            api: {
              ...hrSoulAppManifest.api,
              localService: {
                baseUrl: `http://127.0.0.1:${mountedService.port}`,
                healthPath: '/health',
              },
            },
          },
        }),
        headers: { 'content-type': 'application/json' },
      })
      expect((await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })).status).toBe(200)

      const mountedApiRes = await target.request('/api/local/apps/aiworker-hr/domain')
      expect(mountedApiRes.status).toBe(502)
      expect(await mountedApiRes.json()).toMatchObject({ error: { code: 'SOUL_APP_SERVICE_UNREACHABLE' } })
    }
    finally {
      mountedService.stop()
    }
  })

  it('stops Host-launched mounted Soul App services when the app is disabled', async () => {
    const target = await app()
    const servicePath = join(dir, 'mounted-service.ts')
    const stoppedPath = join(dir, 'mounted-service-stopped.txt')
    writeFileSync(servicePath, `
import { writeFileSync } from 'node:fs'
const stoppedPath = ${JSON.stringify(stoppedPath)}
const server = Bun.serve({
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/health')
      return Response.json({ status: 'ok' })
    if (url.pathname === '/domain')
      return Response.json({
        appId: request.headers.get('x-aiworker-app-id'),
        mountToken: request.headers.get('x-aiworker-mount-token'),
      })
    return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
  },
  hostname: '127.0.0.1',
  port: Number(Bun.env.PORT ?? 0),
})
process.on('SIGTERM', () => {
  writeFileSync(stoppedPath, 'stopped')
  server.stop()
  process.exit(0)
})
process.stdout.write(JSON.stringify({ url: \`http://\${server.hostname}:\${server.port}\` }) + '\\n')
`)

    const installRes = await target.request('/api/local/apps/install', {
      method: 'POST',
      body: JSON.stringify({
        manifest: {
          ...hrSoulAppManifest,
          api: {
            ...hrSoulAppManifest.api,
            localService: {
              command: ['bun', servicePath],
              healthPath: '/health',
            },
          },
        },
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(installRes.status).toBe(201)
    expect((await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })).status).toBe(200)

    const mountedApiRes = await target.request('/api/local/apps/aiworker-hr/domain')
    expect(mountedApiRes.status).toBe(200)
    expect(await mountedApiRes.json()).toMatchObject({ appId: 'aiworker-hr' })

    const disableRes = await target.request('/api/local/apps/aiworker-hr/disable', { method: 'POST' })
    expect(disableRes.status).toBe(200)
    await waitForFile(stoppedPath)
  })

  it('deduplicates concurrent mounted surface service launches per app', async () => {
    const target = await app()
    const servicePath = join(dir, 'mounted-service-concurrent.ts')
    const startedPath = join(dir, 'mounted-service-started.txt')
    writeFileSync(servicePath, `
import { writeFileSync } from 'node:fs'
const startedPath = ${JSON.stringify(startedPath)}
writeFileSync(startedPath, 'start\\n', { flag: 'a' })
const server = Bun.serve({
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/health')
      return Response.json({ status: 'ok' })
    if (url.pathname === '/surfaces/routes/hr-home' || url.pathname === '/surfaces/panels/hr-profile-panel')
      return Response.json({ renderer: 'host-descriptor', title: url.pathname })
    if (url.pathname === '/frames/widgets/hr-people-widget')
      return new Response('<!doctype html><html><body>HR frame</body></html>', { headers: { 'content-type': 'text/html' } })
    return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
  },
  hostname: '127.0.0.1',
  port: Number(Bun.env.PORT ?? 0),
})
process.on('SIGTERM', () => {
  server.stop()
  process.exit(0)
})
process.stdout.write(JSON.stringify({ url: \`http://\${server.hostname}:\${server.port}\` }) + '\\n')
`)

    await target.request('/api/local/apps/install', {
      method: 'POST',
      body: JSON.stringify({
        manifest: {
          ...hrSoulAppManifest,
          api: {
            ...hrSoulAppManifest.api,
            localService: {
              command: ['bun', servicePath],
              healthPath: '/health',
            },
          },
        },
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect((await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })).status).toBe(200)

    const responses = await Promise.all([
      target.request('/api/local/apps/aiworker-hr/surfaces/hr-home'),
      target.request('/api/local/apps/aiworker-hr/surfaces/hr-profile-panel'),
      target.request('/api/local/apps/aiworker-hr/surfaces/hr-people-widget'),
    ])

    expect(responses.map(response => response.status)).toEqual([200, 200, 200])
    const descriptorBody = await responses[0].json() as Record<string, unknown>
    expect(descriptorBody).toMatchObject({
      appId: 'aiworker-hr',
      authority: 'soul-app',
      cache: { freshness: 'non-authoritative' },
      renderer: 'host-descriptor',
      title: '/surfaces/routes/hr-home',
    })
    expect(descriptorBody).not.toHaveProperty('candidateRisk')
    expect(descriptorBody).not.toHaveProperty('profileCompleteness')
    const starts = readFileSync(startedPath, 'utf8').trim().split('\n').filter(Boolean)
    expect(starts).toHaveLength(1)
    expect((await target.request('/api/local/apps/aiworker-hr/disable', { method: 'POST' })).status).toBe(200)
  })

  it('exposes only brokered Soul App storage, connector, audit, and engine-denial routes', async () => {
    const target = await app()
    const settingsBody = await (await target.request('/api/local/settings')).json() as { settings: { connectors: Array<{ enabled: boolean, id: string, name: string, status: string }> } }
    await target.request('/api/local/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        connectors: settingsBody.settings.connectors.map(connector =>
          connector.id === 'ats' ? { ...connector, enabled: true, status: 'configured' } : connector,
        ),
      }),
      headers: { 'content-type': 'application/json' },
    })
    await target.request('/api/local/apps/install', {
      method: 'POST',
      body: JSON.stringify({ manifest: hrSoulAppManifest }),
      headers: { 'content-type': 'application/json' },
    })
    await target.request('/api/local/apps/aiworker-hr/enable', { method: 'POST' })
    const workerBody = await (await target.request('/api/local/workers', {
      method: 'POST',
      body: JSON.stringify({ id: 'broker-hr-worker', soulId: 'aiworker-hr', name: 'Broker HR' }),
      headers: { 'content-type': 'application/json' },
    })).json() as { worker: { id: string } }
    const workspaceBody = await (await target.request('/api/local/workers/broker-hr-worker/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Broker HR workspace', type: 'people-profile' }),
      headers: { 'content-type': 'application/json' },
    })).json() as { workspace: { id: string } }
    const contextQuery = `workspaceId=${workspaceBody.workspace.id}&workerId=${workerBody.worker.id}&operatorId=operator-local`

    const putRes = await target.request(`/api/local/apps/aiworker-hr/broker/storage/profiles/ada?${contextQuery}`, {
      method: 'PUT',
      body: JSON.stringify({ valueJson: { name: 'Ada', status: 'candidate' } }),
      headers: { 'content-type': 'application/json' },
    })
    expect(putRes.status).toBe(200)
    expect(await putRes.json()).toMatchObject({ record: { namespace: 'aiworker-hr', valueJson: { name: 'Ada' } } })

    const deniedStorageRes = await target.request(`/api/local/apps/aiworker-hr/broker/storage/profiles/grace?${contextQuery}`, {
      method: 'PUT',
      body: JSON.stringify({ namespace: 'aiworker-qa', valueJson: { name: 'Grace' } }),
      headers: { 'content-type': 'application/json' },
    })
    expect(deniedStorageRes.status).toBe(403)
    expect(await deniedStorageRes.json()).toMatchObject({ error: { code: 'PERMISSION_DENIED' } })

    const connectorRes = await target.request(`/api/local/apps/aiworker-hr/broker/connectors/ats/evidence?${contextQuery}`, {
      method: 'POST',
      body: JSON.stringify({ query: { candidateId: 'cand-1' } }),
      headers: { 'content-type': 'application/json' },
    })
    expect(connectorRes.status).toBe(200)
    const connectorBody = await connectorRes.json() as { evidence: unknown }
    expect(connectorBody).toMatchObject({ evidence: { connectorId: 'ats', redacted: true } })
    expect(JSON.stringify(connectorBody)).not.toContain('token')

    const engineRes = await target.request(`/api/local/apps/aiworker-hr/broker/engine/invocations?${contextQuery}`, {
      method: 'POST',
      body: JSON.stringify({ prompt: 'call engine directly' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(engineRes.status).toBe(403)
    expect(await engineRes.json()).toMatchObject({ error: { code: 'ENGINE_OWNED_BY_HOST' } })

    const auditBody = await (await target.request('/api/local/apps/aiworker-hr/broker/audit')).json() as { events: Array<{ decision: string, targetKind: string }> }
    expect(auditBody.events.map(event => event.targetKind)).toEqual(['storage', 'storage', 'connector', 'engine'])
    expect(auditBody.events.map(event => event.decision)).toEqual(['allowed', 'denied', 'allowed', 'denied'])
  })

  it('requires bearer auth only when a workspace token is configured', async () => {
    const target = await app('local-token-123456')

    expect((await target.request('/api/local/info')).status).toBe(401)
    expect((await target.request('/api/local/info', {
      headers: { authorization: 'Bearer local-token-123456' },
    })).status).toBe(200)
  })

  it('serves Worker Web font assets from the static build', async () => {
    const webStaticDir = join(dir, 'web-static')
    mkdirSync(join(webStaticDir, 'fonts'), { recursive: true })
    writeFileSync(join(webStaticDir, 'index.html'), '<html></html>')
    writeFileSync(join(webStaticDir, 'fonts', 'inter.woff2'), 'font-data')

    const target = await app(undefined, webStaticDir)
    const res = await target.request('/fonts/inter.woff2')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('font/woff2')
    expect(await res.text()).toBe('font-data')
  })

  it('serves Worker Web engine icon assets from the static build', async () => {
    const webStaticDir = join(dir, 'web-static')
    mkdirSync(join(webStaticDir, 'engine-icons'), { recursive: true })
    writeFileSync(join(webStaticDir, 'index.html'), '<html></html>')
    writeFileSync(join(webStaticDir, 'engine-icons', 'openai.svg'), '<svg></svg>')

    const target = await app(undefined, webStaticDir)
    const res = await target.request('/engine-icons/openai.svg')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(await res.text()).toBe('<svg></svg>')
  })

  it('streams session turn engine events before returning the final result', async () => {
    const target = await app()
    const hrWorker = await createHrWorker(target)
    const workspaceBody = await (await target.request(`/api/local/workers/${hrWorker.id}/workspaces`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Hiring stream workspace' }),
      headers: { 'content-type': 'application/json' },
    })).json() as { workspace: { id: string } }
    const sessionBody = await (await target.request(`/api/local/workers/${hrWorker.id}/workspaces/${workspaceBody.workspace.id}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        capabilityTemplateId: HR_CANDIDATE_SCREEN,
        context: 'Review packet',
        title: 'Screen candidate',
      }),
      headers: { 'content-type': 'application/json' },
    })).json() as { session: { id: string } }

    const streamRes = await target.request(`/api/local/workers/${hrWorker.id}/sessions/${sessionBody.session.id}/messages/stream`, {
      method: 'POST',
      body: JSON.stringify({ input: 'Prepare a streamed candidate screen.' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(streamRes.status).toBe(200)
    expect(streamRes.headers.get('content-type')).toContain('text/event-stream')
    const body = await streamRes.text()
    expect(body).toContain('event: turn')
    expect(body).toContain('"status":"running"')
    expect(body).toContain('event: session_event')
    expect(body).toContain('"kind":"tool_use"')
    expect(body).toContain('event: result')
    expect(body).toContain('"turn"')
  })

  it('streams initial workspace session creation before the engine finishes', async () => {
    const target = await app()
    const hrWorker = await createHrWorker(target)
    const workspaceBody = await (await target.request(`/api/local/workers/${hrWorker.id}/workspaces`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Hiring initial stream workspace' }),
      headers: { 'content-type': 'application/json' },
    })).json() as { workspace: { id: string } }

    const streamRes = await target.request(`/api/local/workers/${hrWorker.id}/workspaces/${workspaceBody.workspace.id}/sessions/stream`, {
      method: 'POST',
      body: JSON.stringify({
        capabilityTemplateId: HR_CANDIDATE_SCREEN,
        context: 'Review packet',
        input: 'Prepare the first streamed candidate screen.',
        title: 'Screen candidate',
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(streamRes.status).toBe(200)
    expect(streamRes.headers.get('content-type')).toContain('text/event-stream')
    const body = await streamRes.text()
    expect(body).toContain('event: session')
    expect(body).toContain(`"capabilityTemplateId":"${HR_CANDIDATE_SCREEN}"`)
    expect(body.indexOf('event: session')).toBeLessThan(body.indexOf('event: turn'))
    expect(body).toContain('event: session_event')
    expect(body).toContain('event: result')
  })

  it('documents only the workspace/session API surface', async () => {
    const target = await app()
    const doc = await (await target.request('/openapi.json')).json() as { paths: Record<string, unknown> }
    const paths = Object.keys(doc.paths)

    expect(paths).toContain('/api/local/info')
    expect(paths).toContain('/api/local/apps')
    expect(paths).toContain('/api/local/apps/install')
    expect(paths).toContain('/api/local/apps/{appId}/enable')
    expect(paths).toContain('/api/local/apps/{appId}/actions/{actionId}')
    expect(paths).toContain('/api/local/apps/{appId}/search')
    expect(paths).toContain('/api/local/workers')
    expect(paths).toContain('/api/local/workers/{workerId}')
    expect(paths).toContain('/api/local/workers/{workerId}/templates')
    expect(paths).toContain('/api/local/souls')
    expect(paths).toContain('/api/local/templates')
    expect(paths).toContain('/api/local/workers/{workerId}/workspaces')
    expect(paths).toContain('/api/local/workers/{workerId}/workspaces/{workspaceId}/sessions')
    expect(paths).toContain('/api/local/workers/{workerId}/workspaces/{workspaceId}/sessions/stream')
    expect(paths).toContain('/api/local/workers/{workerId}/sessions/{sessionId}/messages')
    expect(paths).toContain('/api/local/settings/engines/rescan')
    expect(paths.some(path => path.includes('/runs'))).toBe(false)
    expect(paths.some(path => path.startsWith('/api/worker'))).toBe(false)
  })

  it('persists settings and supports engine rescan/test actions', async () => {
    const target = await app()

    const settingsRes = await target.request('/api/local/settings')
    expect(settingsRes.status).toBe(200)
    const initial = await settingsRes.json() as { settings: { engineId: string, engines: Array<{ id: string }>, executionMode: string } }
    expect(['local-cli', 'byok']).toContain(initial.settings.executionMode)
    expect(initial.settings.engines.some(engine => engine.id === 'workspace-template')).toBe(false)

    const patchRes = await target.request('/api/local/settings', {
      method: 'PATCH',
      body: JSON.stringify({ language: 'zh-CN' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(patchRes.status).toBe(200)
    expect((await patchRes.json() as { settings: { language: string } }).settings.language).toBe('zh-CN')

    expect((await target.request('/api/local/settings/engines/rescan', { method: 'POST' })).status).toBe(200)
    const testRes = await target.request('/api/local/settings/engines/test', {
      method: 'POST',
      body: JSON.stringify({ engineId: initial.settings.engines[0]?.id ?? 'codex' }),
      headers: { 'content-type': 'application/json' },
    })
    expect([200, 404]).toContain(testRes.status)
  })
})

async function waitForFile(filePath: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (existsSync(filePath))
      return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for file: ${filePath}`)
}
