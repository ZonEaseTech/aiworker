import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeWorkerDb, evolutionObservations, executionLogs, getWorkerDb, initWorkerDb, runWorkerMigrations, skillBindings, skillDrafts } from '@aiworker/storage-sqlite/worker'

import { beforeEach, describe, expect, it } from 'bun:test'
import { parseEvolutionMeta, runProposerOnce } from './proposer'

function seedConversation(convId: string, tools: string[]) {
  const db = getWorkerDb()
  db.insert(evolutionObservations).values({
    conversationId: convId,
    kind: 'orchestrator.tool_call',
    payload: { conversationId: convId },
  }).run()
  for (const toolName of tools) {
    db.insert(executionLogs).values({
      conversationId: convId,
      toolName,
    }).run()
  }
}

describe('runProposerOnce', () => {
  beforeEach(() => {
    closeWorkerDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-proposer-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  it('writes a draft when a tool sequence repeats across conversations', async () => {
    seedConversation('conv-a', ['search', 'read', 'write'])
    seedConversation('conv-b', ['search', 'read', 'write'])
    seedConversation('conv-c', ['search', 'read', 'write'])

    const result = await runProposerOnce({ windowSize: 50, maxDraftsPerRun: 5 })
    expect(result.drafts).toBeGreaterThanOrEqual(1)

    const drafts = getWorkerDb().select().from(skillDrafts).all()
    const triple = drafts.find((d) => {
      const meta = parseEvolutionMeta(d.bodyMarkdown)
      return meta?.allowedTools.join('|') === 'search|read|write'
    })
    expect(triple).toBeDefined()
    expect(triple?.source).toBe('evolution')
    expect(triple?.status).toBe('pending')
    expect(triple?.proposedName.startsWith('auto-search-write-')).toBe(true)
    expect(triple?.bodyMarkdown).toContain('search → read → write')
    expect(triple?.rationale).toContain('3×')
  })

  it('skips sequences already covered by a skill_bindings config', async () => {
    seedConversation('conv-a', ['plan', 'execute'])
    seedConversation('conv-b', ['plan', 'execute'])
    seedConversation('conv-c', ['plan', 'execute'])

    getWorkerDb().insert(skillBindings).values({
      source: 'local',
      skillName: 'existing-skill',
      enabled: true,
      priority: 0,
      config: { allowedTools: ['plan', 'execute'] },
    }).run()

    const result = await runProposerOnce({ windowSize: 50, maxDraftsPerRun: 5 })
    expect(result.drafts).toBe(0)
    const drafts = getWorkerDb().select().from(skillDrafts).all()
    expect(drafts).toHaveLength(0)
  })

  it('respects maxDraftsPerRun when multiple patterns qualify', async () => {
    seedConversation('conv-a1', ['alpha', 'beta'])
    seedConversation('conv-a2', ['alpha', 'beta'])
    seedConversation('conv-a3', ['alpha', 'beta'])
    seedConversation('conv-b1', ['gamma', 'delta'])
    seedConversation('conv-b2', ['gamma', 'delta'])
    seedConversation('conv-b3', ['gamma', 'delta'])

    const result = await runProposerOnce({ windowSize: 50, maxDraftsPerRun: 1 })
    expect(result.drafts).toBe(1)
    const drafts = getWorkerDb().select().from(skillDrafts).all()
    expect(drafts).toHaveLength(1)
  })

  it('returns zero drafts when no observations exist', async () => {
    const result = await runProposerOnce({ windowSize: 50, maxDraftsPerRun: 5 })
    expect(result.drafts).toBe(0)
  })

  it('skips sequences already present in skill_drafts from a prior run', async () => {
    seedConversation('conv-a', ['alpha', 'beta'])
    seedConversation('conv-b', ['alpha', 'beta'])
    seedConversation('conv-c', ['alpha', 'beta'])

    const first = await runProposerOnce({ windowSize: 50, maxDraftsPerRun: 5 })
    const second = await runProposerOnce({ windowSize: 50, maxDraftsPerRun: 5 })
    expect(first.drafts).toBe(1)
    expect(second.drafts).toBe(0)
  })
})
