import { mkdtempSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { OpenAPIHono } from '@hono/zod-openapi'
import { BrainAdmissionService, BrainArtifactRegistry } from '@zonease/aiworker-core'
import { closeWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { buildBrainRoutes } from './routes'

const TEST_WORKER_ID = 'w_brain_routes_test'

function buildApp() {
  const app = new OpenAPIHono()
  app.route('/api/worker/brain', buildBrainRoutes({ getWorkerId: () => TEST_WORKER_ID }))
  return app
}

describe('buildBrainRoutes (PLAN-103)', () => {
  let dir: string
  let savedAiworkerHome: string | undefined
  let admissionService: BrainAdmissionService
  let artifactRegistry: BrainArtifactRegistry

  beforeEach(async () => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-brain-routes-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
    savedAiworkerHome = process.env.AIWORKER_HOME
    process.env.AIWORKER_HOME = dir
    admissionService = new BrainAdmissionService()
    artifactRegistry = new BrainArtifactRegistry()
  })

  afterEach(async () => {
    closeWorkerDb()
    if (savedAiworkerHome === undefined)
      delete process.env.AIWORKER_HOME
    else
      process.env.AIWORKER_HOME = savedAiworkerHome
    await rm(dir, { recursive: true, force: true })
  })

  it('GET /summary returns aggregated brain state including admissions/artifacts/scope', async () => {
    artifactRegistry.register({
      id: 'src-bus',
      ref: 'packages/core/src/worker/events/bus.ts',
      sensitivity: 'internal',
      source: 'operator',
      type: 'code-module',
    })
    admissionService.propose({
      confidence: 0.5,
      id: 'p-1',
      kind: 'memory-add',
      payload: { body: 'note' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    const app = buildApp()
    const res = await app.fetch(new Request('http://w/api/worker/brain/summary'))
    expect(res.status).toBe(200)
    const json = await res.json() as {
      workerId: string
      brainSummary: {
        admissions: { byStatus: Record<string, number> }
        artifacts: { total: number }
        scopeManifest: { status: string }
      }
    }
    expect(json.workerId).toBe(TEST_WORKER_ID)
    expect(json.brainSummary.admissions.byStatus.pending).toBe(1)
    expect(json.brainSummary.artifacts.total).toBe(1)
    expect(['ok', 'missing', 'not-applicable']).toContain(json.brainSummary.scopeManifest.status)
  })

  it('GET /admission lists pending proposals and redacts payload secret-like values by default', async () => {
    admissionService.propose({
      confidence: 0.5,
      id: 'p-redact',
      kind: 'memory-add',
      payload: { body: 'note', auth: { token: 'super-secret' } },
      rollback: 'manual',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    const app = buildApp()
    const res = await app.fetch(new Request('http://w/api/worker/brain/admission?status=pending'))
    expect(res.status).toBe(200)
    const json = await res.json() as {
      count: number
      redacted: boolean
      proposals: Array<{ payload?: Record<string, unknown> }>
    }
    expect(json.count).toBe(1)
    expect(json.redacted).toBe(true)
    const auth = json.proposals[0]?.payload?.auth as { token?: string } | undefined
    expect(auth?.token).toBe('<redacted>')
  })

  it('GET /admission?showSensitive=true exposes raw payload secret-like values', async () => {
    admissionService.propose({
      confidence: 0.5,
      id: 'p-unlock',
      kind: 'memory-add',
      payload: { body: 'note', token: 'super-secret' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    const app = buildApp()
    const res = await app.fetch(new Request('http://w/api/worker/brain/admission?showSensitive=true'))
    const json = await res.json() as { redacted: boolean, proposals: Array<{ payload?: { token?: string } }> }
    expect(json.redacted).toBe(false)
    expect(json.proposals[0]?.payload?.token).toBe('super-secret')
  })

  it('GET /admission/:id returns 404 for unknown id', async () => {
    const app = buildApp()
    const res = await app.fetch(new Request('http://w/api/worker/brain/admission/not-there'))
    expect(res.status).toBe(404)
  })

  it('POST /admission/:id/approve transitions state and returns the updated proposal', async () => {
    admissionService.propose({
      confidence: 0.5,
      id: 'p-approve',
      kind: 'memory-add',
      payload: { body: 'note' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    const app = buildApp()
    const res = await app.fetch(new Request('http://w/api/worker/brain/admission/p-approve/approve', {
      body: JSON.stringify({ decidedBy: 'op-1', reason: 'safe' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))
    expect(res.status).toBe(200)
    const json = await res.json() as { decision: string, proposal: { status: string } }
    expect(json.decision).toBe('approved')
    expect(json.proposal.status).toBe('approved')
  })

  it('POST /admission/:id/approve with malformed body returns 400', async () => {
    const app = buildApp()
    const res = await app.fetch(new Request('http://w/api/worker/brain/admission/missing/approve', {
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))
    expect(res.status).toBe(400)
  })

  it('POST /admission/:id/reject moves pending → rejected', async () => {
    admissionService.propose({
      confidence: 0.5,
      id: 'p-reject',
      kind: 'memory-add',
      payload: { body: 'note' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    const app = buildApp()
    const res = await app.fetch(new Request('http://w/api/worker/brain/admission/p-reject/reject', {
      body: JSON.stringify({ decidedBy: 'op-1' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))
    const json = await res.json() as { decision: string, proposal: { status: string } }
    expect(json.decision).toBe('rejected')
    expect(json.proposal.status).toBe('rejected')
  })

  it('POST /admission/:id/apply defaults to dry-run and only writes filesystem when commit=true', async () => {
    const brainHome = join(dir, 'workers', TEST_WORKER_ID, 'brain')
    await mkdir(brainHome, { recursive: true })
    admissionService.propose({
      confidence: 0.7,
      id: 'p-apply',
      kind: 'memory-add',
      payload: { body: '- prefer dry-run\n' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    admissionService.approve('p-apply', { decidedBy: 'op-1' })

    const app = buildApp()
    const dry = await app.fetch(new Request('http://w/api/worker/brain/admission/p-apply/apply', {
      body: JSON.stringify({ decidedBy: 'op-1' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))
    const dryJson = await dry.json() as { outcome: { kind: string } }
    expect(dryJson.outcome.kind).toBe('dry-run')

    const committed = await app.fetch(new Request('http://w/api/worker/brain/admission/p-apply/apply', {
      body: JSON.stringify({ commit: true, decidedBy: 'op-1' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))
    const committedJson = await committed.json() as { outcome: { kind: string } }
    expect(committedJson.outcome.kind).toBe('applied')
  })

  it('GET /artifacts default-redacts confidential ref + hash', async () => {
    artifactRegistry.register({
      hash: 'a'.repeat(64),
      id: 'candidate-c-001',
      ref: 'candidates/resumes/c-001.pdf',
      sensitivity: 'confidential',
      source: 'channel-import',
      summary: 'Backend candidate',
      type: 'candidate-resume',
    })
    const app = buildApp()
    const res = await app.fetch(new Request('http://w/api/worker/brain/artifacts'))
    const json = await res.json() as { redacted: boolean, artifacts: Array<{ ref: string, hash?: string, summary?: string }> }
    expect(json.redacted).toBe(true)
    expect(json.artifacts[0]?.ref).toBe('<redacted>')
    expect(json.artifacts[0]?.hash).toBe('<redacted>')
    expect(json.artifacts[0]?.summary).toBe('Backend candidate')
  })

  it('GET /artifacts/:id returns 404 for unknown id', async () => {
    const app = buildApp()
    const res = await app.fetch(new Request('http://w/api/worker/brain/artifacts/not-there'))
    expect(res.status).toBe(404)
  })

  it('write endpoints surface 409 on invalid state transition (approve already-approved)', async () => {
    admissionService.propose({
      confidence: 0.5,
      id: 'p-already',
      kind: 'memory-add',
      payload: { body: 'a' },
      rollback: 'm',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    admissionService.approve('p-already', { decidedBy: 'op-1' })
    const app = buildApp()
    const res = await app.fetch(new Request('http://w/api/worker/brain/admission/p-already/approve', {
      body: JSON.stringify({ decidedBy: 'op-2' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))
    expect(res.status).toBe(409)
  })

  it('summary reflects scope manifest when project scope is set up', async () => {
    // simulate a project scope by initializing a scope.json in a project root
    const projectRoot = join(dir, 'project-root')
    await mkdir(join(projectRoot, '.aiworker', 'local'), { recursive: true })
    await writeFile(join(projectRoot, '.aiworker', 'AGENT.md'), '# agent', 'utf8')
    await writeFile(join(projectRoot, '.aiworker', 'SOUL.md'), '# soul', 'utf8')
    await writeFile(join(projectRoot, '.aiworker', 'scope.json'), JSON.stringify({
      kind: 'developer-repo',
      primarySoul: 'developer',
      privacy: 'private',
      schemaVersion: 1,
    }, null, 2), 'utf8')
    delete process.env.AIWORKER_HOME
    const savedCwd = process.cwd()
    process.chdir(projectRoot)
    try {
      const app = buildApp()
      const res = await app.fetch(new Request('http://w/api/worker/brain/summary'))
      const json = await res.json() as { brainSummary: { scopeManifest: { status: string, kind?: string, primarySoul?: string } } }
      expect(json.brainSummary.scopeManifest.status).toBe('ok')
      expect(json.brainSummary.scopeManifest.kind).toBe('developer-repo')
      expect(json.brainSummary.scopeManifest.primarySoul).toBe('developer')
    }
    finally {
      process.chdir(savedCwd)
      process.env.AIWORKER_HOME = dir
    }
  })
})
