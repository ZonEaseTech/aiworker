import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { closeWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { bootstrapWorkerApp } from './worker'

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
      body: JSON.stringify({ id: 'hr-worker', soulId: 'hr', name: 'HR Recruiting' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(201)
    return (await res.json() as { worker: { id: string, soulId: string } }).worker
  }

  it('serves the session workspace loop through /api/local routes', async () => {
    const target = await app()
    const createdWorker = await createHrWorker(target)

    const workersRes = await target.request('/api/local/workers')
    expect(workersRes.status).toBe(200)
    const workersBody = await workersRes.json() as { workers: Array<{ id: string, soulId: string }> }
    const hrWorker = workersBody.workers.find(worker => worker.soulId === 'hr')
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
        capabilityTemplateId: 'candidate-screen',
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
    expect(sessionBody.session.capabilityTemplateId).toBe('candidate-screen')
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
        capabilityTemplateId: 'candidate-screen',
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
        capabilityTemplateId: 'candidate-screen',
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
    expect(body).toContain('"capabilityTemplateId":"candidate-screen"')
    expect(body.indexOf('event: session')).toBeLessThan(body.indexOf('event: turn'))
    expect(body).toContain('event: session_event')
    expect(body).toContain('event: result')
  })

  it('documents only the workspace/session API surface', async () => {
    const target = await app()
    const doc = await (await target.request('/openapi.json')).json() as { paths: Record<string, unknown> }
    const paths = Object.keys(doc.paths)

    expect(paths).toContain('/api/local/info')
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
