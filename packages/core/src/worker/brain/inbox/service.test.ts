import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { agentTasks, brainAdmissionProposals, closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { BrainAdmissionService } from '../admission'
import { recordBrainJournalEvent } from '../journal'
import { BrainInboxService } from './service'

describe('BrainInboxService (PLAN-178)', () => {
  beforeEach(() => {
    closeWorkerDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-brain-inbox-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(() => {
    closeWorkerDb()
  })

  it('turns Brain Engine lesson candidates into pending admission proposals', () => {
    seedTask('task-inbox')
    recordBrainJournalEvent({
      at: '2026-05-09T04:10:00.000Z',
      kind: 'brain_engine.review',
      taskId: 'task-inbox',
      payload: {
        lessonCandidates: [
          {
            kind: 'build-release-procedure',
            summary: 'Release readiness requires check, test, build, and diff gates.',
            rationale: 'The task only became reviewable after all gates were present.',
            evidenceRefs: ['brain_journal_events:1', 'agent_tasks:task-inbox'],
            confidence: 0.8,
            risk: 'medium',
            target: 'memories/release.md',
            rollback: 'Remove the memory if release gates change.',
          },
        ],
      },
    })

    const result = new BrainInboxService().proposeFromTask('task-inbox', {
      scopeId: 'repo:aiworker',
      soulId: 'developer',
      at: '2026-05-09T04:11:00.000Z',
    })

    expect(result.candidates).toHaveLength(1)
    expect(result.proposals).toHaveLength(1)
    expect(result.skipped).toEqual([])
    const proposal = result.proposals[0]!
    expect(proposal.status).toBe('pending')
    expect(proposal.kind).toBe('memory-add')
    expect(proposal.scopeId).toBe('repo:aiworker')
    expect(proposal.payload?.body).toContain('Source task: task-inbox')
    expect(proposal.evidence.map(entry => entry.ref)).toContain('brain_journal_events:1')
  })

  it('does not mutate canonical Brain when a candidate is rejected', () => {
    seedTask('task-reject')
    recordBrainJournalEvent({
      kind: 'brain_engine.review',
      taskId: 'task-reject',
      payload: {
        lessonCandidates: [
          {
            kind: 'repo-fact',
            summary: 'Do not persist this rejected fact.',
            evidenceRefs: [],
            confidence: 0.4,
            risk: 'high',
          },
        ],
      },
    })
    const service = new BrainInboxService()
    const result = service.proposeFromTask('task-reject')
    const id = result.proposals[0]!.id

    new BrainAdmissionService().reject(id, { decidedBy: 'tester', reason: 'not durable enough' })

    const row = getWorkerDb().select().from(brainAdmissionProposals).where(eq(brainAdmissionProposals.id, id)).get()
    expect(row?.status).toBe('rejected')
    expect(row?.payload).not.toBeNull()
  })

  it('returns zero proposals when no Brain Engine lesson candidates exist', () => {
    seedTask('task-empty')

    const result = new BrainInboxService().proposeFromTask('task-empty')

    expect(result.candidates).toEqual([])
    expect(result.proposals).toEqual([])
    expect(result.skipped).toEqual([])
  })
})

function seedTask(id: string): void {
  getWorkerDb().insert(agentTasks).values({
    id,
    prompt: 'task',
    status: 'succeeded',
    createdAt: '2026-05-09T04:00:00.000Z',
    finishedAt: '2026-05-09T04:01:00.000Z',
    result: { ok: true },
  }).run()
}
