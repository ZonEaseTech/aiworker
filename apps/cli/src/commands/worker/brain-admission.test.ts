import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  closeWorkerDb,
  initWorkerDb,
  runWorkerMigrations,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

mock.module('../../context', () => ({
  buildRuntime: () => {
    throw new Error('brain admission tests must not build a worker runtime')
  },
  loadWorkerContext: async () => ({
    workerId: 'w_admission_test',
    token: 'tok',
    configVersion: 1,
    hydrated: {
      brains: [],
      brainWriteTarget: '',
      brainRetrieval: 'first-match',
      executor: { engine: 'codex', variant: 'default' },
      channels: [],
      evolution: { enabled: false, observationRetentionDays: 7 },
    },
  }),
}))

const { BrainAdmissionService } = await import('@zonease/aiworker-core')
const { resolveBrainHome } = await import('@zonease/aiworker-fs-layout')
const {
  runBrainAdmissionApply,
  runBrainAdmissionApprove,
  runBrainAdmissionList,
  runBrainAdmissionPropose,
  runBrainAdmissionReject,
  runBrainAdmissionShow,
} = await import('./brain')

interface AdmissionListOutput {
  count: number
  redacted: boolean
  proposals: Array<{ id: string, status: string, payload?: Record<string, unknown> }>
}

interface AdmissionShowOutput {
  redacted: boolean
  proposal: {
    id: string
    status: string
    evidence: unknown[]
    payload?: Record<string, unknown>
  }
  decisions: Array<{ decision: string }>
}

interface AdmissionApprovalOutput {
  decision: string
  proposal: { id: string, status: string }
}

interface AdmissionApplyOutput {
  outcome:
    | { kind: 'dry-run', target: string, diff: string }
    | { kind: 'applied', target: string }
    | { kind: 'failed', reason: string }
    | { kind: 'unsupported', proposalKind: string, reason: string }
}

function skillMd(id = 'developer.review-checklist'): string {
  return [
    '---',
    `id: ${id}`,
    'name: Review checklist',
    'description: Review code changes with project context.',
    'version: 0.1.0',
    '---',
    '# Review checklist',
  ].join('\n')
}

describe('aiworker brain admission commands (PLAN-101)', () => {
  let dir: string
  let workerHome: string
  let savedAiworkerHome: string | undefined
  let service: InstanceType<typeof BrainAdmissionService>

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-cli-admission-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
    savedAiworkerHome = process.env.AIWORKER_HOME
    process.env.AIWORKER_HOME = dir
    workerHome = resolveBrainHome('w_admission_test')
    service = new BrainAdmissionService()
  })

  afterEach(async () => {
    closeWorkerDb()
    if (savedAiworkerHome === undefined)
      delete process.env.AIWORKER_HOME
    else
      process.env.AIWORKER_HOME = savedAiworkerHome
    await rm(dir, { recursive: true, force: true })
  })

  function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T, output: string }> {
    const captured: string[] = []
    const original = console.log
    console.log = ((...args: unknown[]) => {
      captured.push(args.map(arg => String(arg)).join(' '))
    }) as typeof console.log
    return fn()
      .then(result => ({ result, output: captured.join('\n') }))
      .finally(() => {
        console.log = original
      })
  }

  it('list defaults to redacting payload secret-like fields', async () => {
    service.propose({
      confidence: 0.7,
      id: 'p-1',
      kind: 'memory-add',
      payload: { body: 'note', connection: { token: 'super-secret', user: 'alice' } },
      rollback: 'manual',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })

    const { result, output } = await captureConsole(() => runBrainAdmissionList())
    expect(result).toBe(0)
    const parsed = JSON.parse(output) as AdmissionListOutput
    expect(parsed.count).toBe(1)
    expect(parsed.redacted).toBe(true)
    const payload = parsed.proposals[0]?.payload as { connection?: { token?: string } } | undefined
    expect(payload?.connection?.token).toBe('<redacted>')
  })

  it('list --show-sensitive + AIWORKER_ADMIN_REVEAL=1 returns original payload values (BUG-061 gate)', async () => {
    service.propose({
      confidence: 0.7,
      id: 'p-2',
      kind: 'memory-add',
      payload: { body: 'note', connection: { token: 'super-secret' } },
      rollback: 'm',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    const previous = process.env.AIWORKER_ADMIN_REVEAL
    process.env.AIWORKER_ADMIN_REVEAL = '1'
    try {
      const { output } = await captureConsole(() => runBrainAdmissionList({ showSensitive: true }))
      const parsed = JSON.parse(output) as AdmissionListOutput
      expect(parsed.redacted).toBe(false)
      const payload = parsed.proposals[0]?.payload as { connection?: { token?: string } } | undefined
      expect(payload?.connection?.token).toBe('super-secret')
    }
    finally {
      if (previous === undefined)
        delete process.env.AIWORKER_ADMIN_REVEAL
      else
        process.env.AIWORKER_ADMIN_REVEAL = previous
    }
  })

  it('BUG-061: list --show-sensitive without AIWORKER_ADMIN_REVEAL keeps redacted view', async () => {
    service.propose({
      confidence: 0.7,
      id: 'p-2-gate',
      kind: 'memory-add',
      payload: { body: 'note', connection: { token: 'super-secret' } },
      rollback: 'm',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    const previous = process.env.AIWORKER_ADMIN_REVEAL
    delete process.env.AIWORKER_ADMIN_REVEAL
    try {
      const { output } = await captureConsole(() => runBrainAdmissionList({ showSensitive: true }))
      const parsed = JSON.parse(output) as AdmissionListOutput
      expect(parsed.redacted).toBe(true)
      const payload = parsed.proposals[0]?.payload as { connection?: { token?: string } } | undefined
      expect(payload?.connection?.token).toBe('<redacted>')
    }
    finally {
      if (previous !== undefined)
        process.env.AIWORKER_ADMIN_REVEAL = previous
    }
  })

  it('BUG-061: payload.body secret-shaped substring is redacted by default', async () => {
    service.propose({
      confidence: 0.7,
      id: 'p-2-bodysecret',
      kind: 'memory-add',
      payload: { body: '# leak\n\napiKey=sk-LIVE-shouldnotpersist1234567' },
      rollback: 'm',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    const { output } = await captureConsole(() => runBrainAdmissionList())
    const parsed = JSON.parse(output) as AdmissionListOutput
    expect(parsed.redacted).toBe(true)
    const payload = parsed.proposals[0]?.payload as { body?: string } | undefined
    expect(payload?.body ?? '').toContain('[REDACTED:sk-token]')
    expect(payload?.body ?? '').not.toContain('sk-LIVE')
  })

  it('list filters by status / kind', async () => {
    service.propose({ confidence: 0.5, id: 'p-a', kind: 'memory-add', payload: { body: 'a' }, rollback: 'm', soulId: 'developer', summary: 's', target: '.aiworker/MEMORY.md' })
    service.propose({ confidence: 0.5, id: 'p-b', kind: 'brain-skill-add', rollback: 'm', soulId: 'developer', summary: 's', target: '.aiworker/skills/x' })
    service.approve('p-a', { decidedBy: 'op-1' })

    const { output: pending } = await captureConsole(() => runBrainAdmissionList({ status: 'pending' }))
    expect((JSON.parse(pending) as AdmissionListOutput).proposals.map(p => p.id)).toEqual(['p-b'])

    const { output: byKind } = await captureConsole(() => runBrainAdmissionList({ kind: 'memory-add' }))
    expect((JSON.parse(byKind) as AdmissionListOutput).proposals.map(p => p.id)).toEqual(['p-a'])
  })

  it('show prints proposal + empty decisions for a fresh pending proposal', async () => {
    service.propose({
      confidence: 0.7,
      id: 'p-show',
      kind: 'memory-add',
      payload: { body: 'note' },
      rollback: 'manual',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    const { result, output } = await captureConsole(() => runBrainAdmissionShow('p-show'))
    expect(result).toBe(0)
    const parsed = JSON.parse(output) as AdmissionShowOutput
    expect(parsed.proposal.id).toBe('p-show')
    expect(parsed.proposal.status).toBe('pending')
    expect(parsed.decisions).toEqual([])
  })

  it('show returns 1 for unknown id and 2 for empty id', async () => {
    expect(await runBrainAdmissionShow('not-there')).toBe(1)
    expect(await runBrainAdmissionShow('')).toBe(2)
  })

  it('approve transitions pending → approved and writes a decision row', async () => {
    service.propose({
      confidence: 0.7,
      id: 'p-approve',
      kind: 'memory-add',
      payload: { body: 'note' },
      rollback: 'm',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    const { result, output } = await captureConsole(() =>
      runBrainAdmissionApprove('p-approve', { decidedBy: 'op-1', reason: 'safe' }),
    )
    expect(result).toBe(0)
    const parsed = JSON.parse(output) as AdmissionApprovalOutput
    expect(parsed.decision).toBe('approved')
    expect(parsed.proposal.status).toBe('approved')
  })

  it('reject transitions pending → rejected', async () => {
    service.propose({
      confidence: 0.7,
      id: 'p-reject',
      kind: 'memory-add',
      payload: { body: 'note' },
      rollback: 'm',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    const { result, output } = await captureConsole(() =>
      runBrainAdmissionReject('p-reject', { decidedBy: 'op-1' }),
    )
    expect(result).toBe(0)
    const parsed = JSON.parse(output) as AdmissionApprovalOutput
    expect(parsed.decision).toBe('rejected')
    expect(parsed.proposal.status).toBe('rejected')
  })

  it('apply on approved memory-add proposal returns dry-run by default', async () => {
    await mkdir(workerHome, { recursive: true })
    service.propose({
      confidence: 0.7,
      id: 'p-dry',
      kind: 'memory-add',
      payload: { body: '- prefer dry-run\n' },
      rollback: 'remove appended line',
      soulId: 'developer',
      summary: 'append note',
      target: '.aiworker/MEMORY.md',
    })
    service.approve('p-dry', { decidedBy: 'op-1' })

    const { result, output } = await captureConsole(() => runBrainAdmissionApply('p-dry', { decidedBy: 'op-1' }))
    expect(result).toBe(0)
    const parsed = JSON.parse(output) as AdmissionApplyOutput
    expect(parsed.outcome.kind).toBe('dry-run')
    if (parsed.outcome.kind === 'dry-run')
      expect(parsed.outcome.diff).toContain('dry-run: would append')
  })

  it('apply --commit memory-add writes MEMORY.md and flips status to applied', async () => {
    await mkdir(workerHome, { recursive: true })
    await writeFile(join(workerHome, 'MEMORY.md'), '# existing\n', 'utf8')
    service.propose({
      confidence: 0.7,
      id: 'p-commit',
      kind: 'memory-add',
      payload: { body: '- prefer dry-run\n' },
      rollback: 'remove appended line',
      soulId: 'developer',
      summary: 'append note',
      target: '.aiworker/MEMORY.md',
    })
    service.approve('p-commit', { decidedBy: 'op-1' })

    const { result, output } = await captureConsole(() =>
      runBrainAdmissionApply('p-commit', { decidedBy: 'op-1', commit: true }),
    )
    expect(result).toBe(0)
    const parsed = JSON.parse(output) as AdmissionApplyOutput
    expect(parsed.outcome.kind).toBe('applied')
    const memoryContent = await readFile(join(workerHome, 'MEMORY.md'), 'utf8')
    expect(memoryContent).toContain('# existing')
    expect(memoryContent).toContain('- prefer dry-run')
    const after = service.requireById('p-commit')
    expect(after.status).toBe('applied')
  })

  it('apply --commit brain-skill-add writes SKILL.md', async () => {
    await mkdir(workerHome, { recursive: true })
    service.propose({
      confidence: 0.5,
      id: 'p-skill',
      kind: 'brain-skill-add',
      payload: { body: skillMd(), skillId: 'developer.review-checklist' },
      rollback: 'rm skills/developer.review-checklist/SKILL.md',
      soulId: 'developer',
      summary: 'add review checklist',
      target: '.aiworker/skills/developer.review-checklist/SKILL.md',
    })
    service.approve('p-skill', { decidedBy: 'op-1' })
    const { output } = await captureConsole(() =>
      runBrainAdmissionApply('p-skill', { decidedBy: 'op-1', commit: true }),
    )
    const parsed = JSON.parse(output) as AdmissionApplyOutput
    expect(parsed.outcome.kind).toBe('applied')
    const skillBody = await readFile(join(workerHome, 'skills', 'developer.review-checklist', 'SKILL.md'), 'utf8')
    expect(skillBody).toContain('id: developer.review-checklist')
    expect(skillBody).toContain('# Review checklist')
  })

  it('apply on policy-update returns unsupported and does not change status', async () => {
    await mkdir(workerHome, { recursive: true })
    service.propose({
      confidence: 0.5,
      id: 'p-unsupported',
      kind: 'policy-update',
      rollback: 'm',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/policy.json',
    })
    service.approve('p-unsupported', { decidedBy: 'op-1' })
    const { output } = await captureConsole(() =>
      runBrainAdmissionApply('p-unsupported', { decidedBy: 'op-1' }),
    )
    const parsed = JSON.parse(output) as AdmissionApplyOutput
    expect(parsed.outcome.kind).toBe('unsupported')
    expect(service.requireById('p-unsupported').status).toBe('approved')
  })

  it('apply on a proposal not in approved state returns 1', async () => {
    await mkdir(workerHome, { recursive: true })
    service.propose({
      confidence: 0.5,
      id: 'p-not-approved',
      kind: 'memory-add',
      payload: { body: 'a' },
      rollback: 'm',
      soulId: 'developer',
      summary: 's',
      target: '.aiworker/MEMORY.md',
    })
    expect(await runBrainAdmissionApply('p-not-approved', { decidedBy: 'op-1', commit: true })).toBe(1)
  })

  it('approve / reject / apply require non-empty id and return 2 otherwise', async () => {
    expect(await runBrainAdmissionApprove('', { decidedBy: 'op-1' })).toBe(2)
    expect(await runBrainAdmissionReject('', { decidedBy: 'op-1' })).toBe(2)
    expect(await runBrainAdmissionApply('', { decidedBy: 'op-1' })).toBe(2)
  })

  it('propose creates a pending proposal end-to-end (BUG-068)', async () => {
    const { result, output } = await captureConsole(() => runBrainAdmissionPropose({
      id: 'p-propose-cli',
      target: 'memories/qa-fixture',
      summary: 'CLI debug propose smoke',
      rollback: 'rm memories/qa-fixture.md',
      soulId: 'developer',
      kind: 'memory-add',
      risk: 'low',
      confidence: 0.5,
    }))
    expect(result).toBe(0)
    const parsed = JSON.parse(output) as { proposal: { id: string, status: string }, debugWarning?: string }
    expect(parsed.proposal.id).toBe('p-propose-cli')
    expect(parsed.proposal.status).toBe('pending')
    expect(parsed.debugWarning).toBeUndefined()
    expect(service.requireById('p-propose-cli').summary).toBe('CLI debug propose smoke')
  })

  it('propose returns 2 when required flags are missing', async () => {
    expect(await runBrainAdmissionPropose({})).toBe(2)
    expect(await runBrainAdmissionPropose({ id: 'p' })).toBe(2)
    expect(await runBrainAdmissionPropose({
      id: 'p',
      target: 't',
      summary: 's',
      rollback: 'r',
      soulId: 'developer',
      risk: 'urgent',
    })).toBe(2)
  })

  it('propose surfaces zod errors as exit 1', async () => {
    const exit = await runBrainAdmissionPropose({
      id: 'BAD ID WITH SPACES',
      target: 't',
      summary: 's',
      rollback: 'r',
      soulId: 'developer',
    })
    expect(exit).toBe(1)
  })
})
