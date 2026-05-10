import { mkdtempSync } from 'node:fs'
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
    dir = mkdtempSync(join(tmpdir(), 'aiworker-local-api-'))
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  async function app(token?: string) {
    const boot = await bootstrapWorkerApp({
      dbPath: join(dir, 'worker.db'),
      workspace: {
        id: 'workspace-1',
        name: 'Hiring Workspace',
        rootPath: join(dir, 'workspace'),
      },
      workerId: 'worker-local',
      token,
      runtimeVersion: 'test',
      executor: {
        async run(input) {
          return {
            summary: 'done',
            artifacts: [{ path: 'reports/result.md', title: 'Result', content: `# ${input.prompt}\n` }],
            review: { verdict: 'pass', findings: [] },
            lessons: [{ statement: 'Keep evidence attached.', evidence: [{ runId: input.runId }] }],
          }
        },
      },
    })
    return boot.app
  }

  it('serves the workspace loop through /api/local routes', async () => {
    const target = await app()

    const caseRes = await target.request('/api/local/cases', {
      method: 'POST',
      body: JSON.stringify({
        body: 'Review packet',
        selectedSkillId: 'candidate-screen',
        selectedSoulId: 'hr',
        title: 'Screen candidate',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(caseRes.status).toBe(201)
    const caseBody = await caseRes.json() as { case: { id: string } }

    const runRes = await target.request('/api/local/runs', {
      method: 'POST',
      body: JSON.stringify({ caseId: caseBody.case.id }),
      headers: { 'content-type': 'application/json' },
    })
    expect(runRes.status).toBe(201)
    const runBody = await runRes.json() as { artifacts: unknown[], lessons: unknown[], run: { metadataJson: Record<string, unknown>, status: string } }
    expect(runBody.run.status).toBe('succeeded')
    expect(runBody.run.metadataJson).toMatchObject({ selectedSkillId: 'candidate-screen', selectedSoulId: 'hr' })
    expect(runBody.artifacts).toHaveLength(1)
    expect(runBody.lessons).toHaveLength(1)

    const fileRes = await target.request('/api/local/files/raw/reports/result.md')
    expect(await fileRes.text()).toContain('Review packet')

    const eventsRes = await target.request('/api/local/events')
    const eventsBody = await eventsRes.json() as { events: unknown[] }
    expect(eventsBody.events.length).toBeGreaterThan(0)
  })

  it('requires bearer auth only when a local token is configured', async () => {
    const target = await app('local-token-123456')

    expect((await target.request('/api/local/info')).status).toBe(401)
    expect((await target.request('/api/local/info', {
      headers: { authorization: 'Bearer local-token-123456' },
    })).status).toBe(200)
  })

  it('documents only the local API surface', async () => {
    const target = await app()
    const doc = await (await target.request('/openapi.json')).json() as { paths: Record<string, unknown> }
    const paths = Object.keys(doc.paths)

    expect(paths).toContain('/api/local/info')
    expect(paths).toContain('/api/local/souls')
    expect(paths).toContain('/api/local/templates')
    expect(paths).toContain('/api/local/workspace')
    expect(paths).toContain('/api/local/runs')
    expect(paths).toContain('/api/local/settings/engines/rescan')
    expect(paths.some(path => path.startsWith('/api/worker'))).toBe(false)
  })

  it('persists local settings and supports engine rescan/test actions', async () => {
    const target = await app()

    const settingsRes = await target.request('/api/local/settings')
    expect(settingsRes.status).toBe(200)
    const initial = await settingsRes.json() as { settings: { executionMode: string } }
    expect(['local-cli', 'byok']).toContain(initial.settings.executionMode)

    const patchRes = await target.request('/api/local/settings', {
      method: 'PATCH',
      body: JSON.stringify({ language: 'zh-CN' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(patchRes.status).toBe(200)
    expect((await patchRes.json() as { settings: { language: string } }).settings.language).toBe('zh-CN')

    expect((await target.request('/api/local/settings/engines/rescan', { method: 'POST' })).status).toBe(200)
    expect((await target.request('/api/local/settings/engines/test', {
      method: 'POST',
      body: JSON.stringify({ engineId: 'codex' }),
      headers: { 'content-type': 'application/json' },
    })).status).toBe(200)
  })
})
