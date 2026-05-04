import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { closeWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BrainAdmissionService } from './service'

const NOW = '2026-05-04T16:15:00.000Z'

interface FreshDb {
  service: BrainAdmissionService
  brainHome: string
}

function freshContext(brainSubdir: string): FreshDb {
  closeWorkerDb()
  const dir = mkdtempSync(join(tmpdir(), 'aiworker-admission-'))
  initWorkerDb(join(dir, 'worker.db'))
  runWorkerMigrations()
  const brainHome = join(dir, brainSubdir)
  return { brainHome, service: new BrainAdmissionService() }
}

describe('BrainAdmissionService propose / approve / reject (PLAN-101)', () => {
  let ctx: FreshDb

  beforeEach(() => {
    ctx = freshContext('brain')
  })
  afterEach(() => {
    closeWorkerDb()
  })

  it('propose creates a pending row with default risk=high when not set', () => {
    const proposal = ctx.service.propose({
      confidence: 0.5,
      id: 'p-default-risk',
      kind: 'memory-add',
      payload: { body: 'note line' },
      rollback: 'remove last appended line',
      soulId: 'developer',
      summary: 'should default to high risk',
      target: '.aiworker/MEMORY.md',
    }, NOW)
    expect(proposal.status).toBe('pending')
    expect(proposal.risk).toBe('high')
    expect(proposal.confidence).toBe(0.5)
  })

  it('propose preserves explicit low risk', () => {
    const proposal = ctx.service.propose({
      confidence: 0.9,
      id: 'p-low-risk',
      kind: 'memory-add',
      risk: 'low',
      payload: { body: 'note' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 'low risk',
      target: '.aiworker/MEMORY.md',
    }, NOW)
    expect(proposal.risk).toBe('low')
  })

  it('propose rejects duplicate ids', () => {
    ctx.service.propose({
      confidence: 0.5,
      id: 'p-dup',
      kind: 'memory-add',
      payload: { body: 'a' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 'first',
      target: '.aiworker/MEMORY.md',
    })
    expect(() => ctx.service.propose({
      confidence: 0.5,
      id: 'p-dup',
      kind: 'memory-add',
      payload: { body: 'b' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 'second',
      target: '.aiworker/MEMORY.md',
    })).toThrow(/already exists/)
  })

  it('approve moves pending → approved and writes a decision row', () => {
    ctx.service.propose({
      confidence: 0.5,
      id: 'p-approve',
      kind: 'memory-add',
      payload: { body: 'a' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 'approve me',
      target: '.aiworker/MEMORY.md',
    }, NOW)
    const approved = ctx.service.approve('p-approve', { decidedBy: 'operator-1', reason: 'looks safe', at: NOW })
    expect(approved.status).toBe('approved')
    const decisions = ctx.service.listDecisions('p-approve')
    expect(decisions.length).toBe(1)
    expect(decisions[0]).toMatchObject({ decision: 'approved', decidedBy: 'operator-1', reason: 'looks safe' })
  })

  it('approve fails when proposal is not pending', () => {
    ctx.service.propose({
      confidence: 0.5,
      id: 'p-already',
      kind: 'memory-add',
      payload: { body: 'a' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    }, NOW)
    ctx.service.approve('p-already', { decidedBy: 'op-1', at: NOW })
    expect(() => ctx.service.approve('p-already', { decidedBy: 'op-1', at: NOW })).toThrow(/cannot approve/)
  })

  it('reject moves pending → rejected and writes a decision row', () => {
    ctx.service.propose({
      confidence: 0.4,
      id: 'p-reject',
      kind: 'memory-add',
      payload: { body: 'a' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 'reject me',
      target: '.aiworker/MEMORY.md',
    }, NOW)
    const rejected = ctx.service.reject('p-reject', { decidedBy: 'op-1', reason: 'too speculative', at: NOW })
    expect(rejected.status).toBe('rejected')
    const decisions = ctx.service.listDecisions('p-reject')
    expect(decisions[0]?.decision).toBe('rejected')
  })

  it('reject fails when proposal is already approved', () => {
    ctx.service.propose({
      confidence: 0.4,
      id: 'p-already-approved',
      kind: 'memory-add',
      payload: { body: 'a' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    }, NOW)
    ctx.service.approve('p-already-approved', { decidedBy: 'op-1', at: NOW })
    expect(() => ctx.service.reject('p-already-approved', { decidedBy: 'op-1', at: NOW })).toThrow(/cannot reject/)
  })

  it('list filters by status and kind, count matches', () => {
    ctx.service.propose({ confidence: 0.5, id: 'p-a', kind: 'memory-add', payload: { body: 'a' }, rollback: 'm', soulId: 'developer', summary: 's', target: '.aiworker/MEMORY.md' })
    ctx.service.propose({ confidence: 0.5, id: 'p-b', kind: 'memory-add', payload: { body: 'b' }, rollback: 'm', soulId: 'developer', summary: 's', target: '.aiworker/MEMORY.md' })
    ctx.service.propose({ confidence: 0.5, id: 'p-c', kind: 'brain-skill-add', rollback: 'm', soulId: 'developer', summary: 's', target: '.aiworker/skills/x' })
    ctx.service.approve('p-a', { decidedBy: 'op-1' })

    expect(ctx.service.count({ status: 'pending' })).toBe(2)
    expect(ctx.service.count({ status: 'approved' })).toBe(1)
    expect(ctx.service.list({ status: 'pending' }).map(p => p.id).sort()).toEqual(['p-b', 'p-c'])
    expect(ctx.service.list({ kind: 'brain-skill-add' }).map(p => p.id)).toEqual(['p-c'])
  })

  it('list redacts payload secret-like fields by default', () => {
    ctx.service.propose({
      confidence: 0.5,
      id: 'p-redact',
      kind: 'memory-add',
      payload: { body: 'a', connection: { token: 'super-secret', user: 'alice' } },
      rollback: 'm',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    const [defaultView] = ctx.service.list()
    const [unlocked] = ctx.service.list(undefined, { redactSensitive: false })
    expect(((defaultView?.payload as { connection?: { token?: string } } | undefined)?.connection?.token)).toBe('<redacted>')
    expect(((unlocked?.payload as { connection?: { token?: string } } | undefined)?.connection?.token)).toBe('super-secret')
  })
})

describe('BrainAdmissionService.apply (PLAN-101 MVP materializer)', () => {
  let ctx: FreshDb

  beforeEach(() => {
    ctx = freshContext('brain')
  })
  afterEach(() => {
    closeWorkerDb()
  })

  it('throws when proposal is not in approved state', async () => {
    ctx.service.propose({
      confidence: 0.5,
      id: 'p-unapproved',
      kind: 'memory-add',
      payload: { body: 'a' },
      rollback: 'm',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    await expect(ctx.service.apply('p-unapproved', { brainHome: ctx.brainHome, decidedBy: 'op-1' })).rejects.toThrow(/must be "approved"/)
  })

  it('memory-add dry-run returns a diff and does not write filesystem state', async () => {
    await mkdir(ctx.brainHome, { recursive: true })
    ctx.service.propose({
      confidence: 0.5,
      id: 'p-dry',
      kind: 'memory-add',
      payload: { body: 'before next reload, prefer dry-run for shell\n' },
      rollback: 'remove appended line',
      soulId: 'developer',
      summary: 'dry-run preview',
      target: '.aiworker/MEMORY.md',
    })
    ctx.service.approve('p-dry', { decidedBy: 'op-1' })
    const result = await ctx.service.apply('p-dry', { brainHome: ctx.brainHome, decidedBy: 'op-1' })
    expect(result.kind).toBe('dry-run')
    if (result.kind === 'dry-run') {
      expect(result.diff).toContain('dry-run: would append')
      expect(result.target.endsWith('MEMORY.md')).toBe(true)
    }
    const after = ctx.service.requireById('p-dry')
    expect(after.status).toBe('approved')
  })

  it('memory-add commit appends to MEMORY.md and flips status to applied', async () => {
    await mkdir(ctx.brainHome, { recursive: true })
    await writeFile(join(ctx.brainHome, 'MEMORY.md'), '# existing\n', 'utf8')
    ctx.service.propose({
      confidence: 0.5,
      id: 'p-commit',
      kind: 'memory-add',
      payload: { body: '- prefer dry-run\n' },
      rollback: 'remove appended line',
      soulId: 'developer',
      summary: 'append prefer dry-run',
      target: '.aiworker/MEMORY.md',
    })
    ctx.service.approve('p-commit', { decidedBy: 'op-1' })
    const result = await ctx.service.apply('p-commit', {
      at: NOW,
      brainHome: ctx.brainHome,
      commit: true,
      decidedBy: 'op-1',
    })
    expect(result.kind).toBe('applied')
    const memoryContent = await readFile(join(ctx.brainHome, 'MEMORY.md'), 'utf8')
    expect(memoryContent).toContain('# existing')
    expect(memoryContent).toContain('- prefer dry-run')
    const after = ctx.service.requireById('p-commit')
    expect(after.status).toBe('applied')
    const decisions = ctx.service.listDecisions('p-commit')
    expect(decisions.find(d => d.decision === 'applied')?.appliedAt).toBe(NOW)
  })

  it('memory-add with topic writes memories/<topic>.md and optional MEMORY.md index entry', async () => {
    await mkdir(ctx.brainHome, { recursive: true })
    ctx.service.propose({
      confidence: 0.5,
      id: 'p-topic',
      kind: 'memory-add',
      payload: {
        body: '# Dry-run policy\n\nPrefer dry-run before destructive shell.\n',
        indexEntry: '- [Dry-run policy](dry-run-policy.md) — operator must approve destructive shell',
        topic: 'dry-run-policy',
      },
      rollback: 'delete memories/dry-run-policy.md and MEMORY.md index entry',
      soulId: 'developer',
      summary: 'dry-run policy memory',
      target: '.aiworker/memories/dry-run-policy.md',
    })
    ctx.service.approve('p-topic', { decidedBy: 'op-1' })
    const result = await ctx.service.apply('p-topic', {
      brainHome: ctx.brainHome,
      commit: true,
      decidedBy: 'op-1',
    })
    expect(result.kind).toBe('applied')
    const topicFile = await readFile(join(ctx.brainHome, 'memories', 'dry-run-policy.md'), 'utf8')
    expect(topicFile).toContain('# Dry-run policy')
    const indexFile = await readFile(join(ctx.brainHome, 'MEMORY.md'), 'utf8')
    expect(indexFile).toContain('- [Dry-run policy](dry-run-policy.md)')
  })

  it('non-memory-add proposal returns unsupported and does not change status', async () => {
    await mkdir(ctx.brainHome, { recursive: true })
    ctx.service.propose({
      confidence: 0.5,
      id: 'p-unsupported',
      kind: 'brain-skill-add',
      payload: { body: 'should not apply' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 'brain-skill MVP not materialized',
      target: '.aiworker/skills/x',
    })
    ctx.service.approve('p-unsupported', { decidedBy: 'op-1' })
    const result = await ctx.service.apply('p-unsupported', {
      brainHome: ctx.brainHome,
      commit: true,
      decidedBy: 'op-1',
    })
    expect(result.kind).toBe('unsupported')
    if (result.kind === 'unsupported')
      expect(result.proposalKind).toBe('brain-skill-add')
    const after = ctx.service.requireById('p-unsupported')
    expect(after.status).toBe('approved')
  })

  it('memory-add with malformed payload returns failed', async () => {
    await mkdir(ctx.brainHome, { recursive: true })
    ctx.service.propose({
      confidence: 0.5,
      id: 'p-bad-payload',
      kind: 'memory-add',
      payload: {},
      rollback: 'manual',
      soulId: 'developer',
      summary: 'missing body',
      target: '.aiworker/MEMORY.md',
    })
    ctx.service.approve('p-bad-payload', { decidedBy: 'op-1' })
    const result = await ctx.service.apply('p-bad-payload', {
      brainHome: ctx.brainHome,
      commit: true,
      decidedBy: 'op-1',
    })
    expect(result.kind).toBe('failed')
    if (result.kind === 'failed')
      expect(result.reason).toContain('memory-add schema')
  })
})
