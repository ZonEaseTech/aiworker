import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { sql } from 'drizzle-orm'

import { BrainArtifactRegistry } from './registry'

function freshRegistry(): BrainArtifactRegistry {
  return new BrainArtifactRegistry()
}

describe('BrainArtifactRegistry (PLAN-099)', () => {
  beforeEach(() => {
    closeWorkerDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-brain-artifacts-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })
  afterEach(() => {
    closeWorkerDb()
  })

  it('registers an artifact and returns it without redaction by default for register()', () => {
    const registry = freshRegistry()
    const artifact = registry.register({
      id: 'src-orchestrator',
      ref: 'packages/core/src/worker/orchestrator/service.ts',
      source: 'operator',
      type: 'code-module',
    }, '2026-05-04T15:00:00.000Z')

    expect(artifact.id).toBe('src-orchestrator')
    expect(artifact.sensitivity).toBe('internal')
    expect(artifact.status).toBe('active')
    expect(artifact.ref).toBe('packages/core/src/worker/orchestrator/service.ts')
    expect(artifact.evidenceRefs).toEqual([])
  })

  it('rejects duplicate ids', () => {
    const registry = freshRegistry()
    registry.register({ id: 'a', ref: 'r', source: 'operator', type: 'note' })
    expect(() => registry.register({ id: 'a', ref: 'r2', source: 'operator', type: 'note' })).toThrow(/already registered/)
  })

  it('list defaults to redacting confidential / secret artifacts', () => {
    const registry = freshRegistry()
    registry.register({
      id: 'candidate-c-001',
      ref: 'candidates/resumes/c-001.pdf',
      sensitivity: 'confidential',
      source: 'channel-import',
      summary: 'Backend candidate',
      type: 'candidate-resume',
    })
    registry.register({
      id: 'src-bus',
      ref: 'packages/core/src/worker/events/bus.ts',
      sensitivity: 'internal',
      source: 'operator',
      type: 'code-module',
    })

    const all = registry.list()
    const candidate = all.find(a => a.id === 'candidate-c-001')
    const code = all.find(a => a.id === 'src-bus')
    expect(candidate?.ref).toBe('<redacted>')
    expect(candidate?.summary).toBe('Backend candidate')
    expect(code?.ref).toBe('packages/core/src/worker/events/bus.ts')
  })

  it('list({ redactSensitive: false }) returns ref + hash for confidential', () => {
    const registry = freshRegistry()
    registry.register({
      hash: 'a'.repeat(64),
      id: 'candidate-c-001',
      ref: 'candidates/resumes/c-001.pdf',
      sensitivity: 'confidential',
      source: 'channel-import',
      type: 'candidate-resume',
    })
    const [artifact] = registry.list(undefined, { redactSensitive: false })
    expect(artifact?.ref).toBe('candidates/resumes/c-001.pdf')
    expect(artifact?.hash).toBe('a'.repeat(64))
  })

  it('filters by scopeId, type, status', () => {
    const registry = freshRegistry()
    registry.register({
      id: 'a',
      ref: 'a.md',
      scopeId: 'hire-q3',
      source: 'operator',
      type: 'candidate-resume',
    })
    registry.register({
      id: 'b',
      ref: 'b.md',
      scopeId: 'hire-q3',
      source: 'operator',
      type: 'screening-decision',
    })
    registry.register({
      id: 'c',
      ref: 'c.md',
      scopeId: 'hire-q4',
      source: 'operator',
      type: 'candidate-resume',
    })
    registry.setStatus('a', 'archived')

    const q3 = registry.list({ scopeId: 'hire-q3' })
    expect(q3.map(a => a.id).sort()).toEqual(['a', 'b'])

    const resumes = registry.list({ type: 'candidate-resume' })
    expect(resumes.map(a => a.id).sort()).toEqual(['a', 'c'])

    const archived = registry.list({ status: 'archived' })
    expect(archived.map(a => a.id)).toEqual(['a'])
  })

  it('applies minSensitivity filter', () => {
    const registry = freshRegistry()
    registry.register({ id: 'p', ref: 'p', sensitivity: 'public', source: 'operator', type: 't' })
    registry.register({ id: 'i', ref: 'i', sensitivity: 'internal', source: 'operator', type: 't' })
    registry.register({ id: 'c', ref: 'c', sensitivity: 'confidential', source: 'operator', type: 't' })
    registry.register({ id: 's', ref: 's', sensitivity: 'secret', source: 'operator', type: 't' })

    const confidentialPlus = registry.list({ minSensitivity: 'confidential' })
    expect(confidentialPlus.map(a => a.id).sort()).toEqual(['c', 's'])
  })

  it('setStatus returns redacted view for confidential by default', () => {
    const registry = freshRegistry()
    registry.register({
      id: 'r',
      ref: 'private/path',
      sensitivity: 'confidential',
      source: 'operator',
      type: 'note',
    })
    const archived = registry.setStatus('r', 'archived')
    expect(archived.status).toBe('archived')
    expect(archived.ref).toBe('<redacted>')

    const visible = registry.setStatus('r', 'active', undefined, { redactSensitive: false })
    expect(visible.ref).toBe('private/path')
  })

  it('count works for filtered queries', () => {
    const registry = freshRegistry()
    registry.register({ id: 'a', ref: 'a', scopeId: 's1', source: 'operator', type: 't1' })
    registry.register({ id: 'b', ref: 'b', scopeId: 's1', source: 'operator', type: 't2' })
    registry.register({ id: 'c', ref: 'c', scopeId: 's2', source: 'operator', type: 't1' })

    expect(registry.count()).toBe(3)
    expect(registry.count({ scopeId: 's1' })).toBe(2)
    expect(registry.count({ type: 't1' })).toBe(2)
  })

  it('persists evidenceRefs and metadata round-trip', () => {
    const registry = freshRegistry()
    registry.register({
      evidenceRefs: ['interview-2026-05-04.md', 'reference-call-1.md'],
      id: 'e',
      metadata: { workflowState: 'screening-passed', interviewerIds: ['user-1', 'user-2'] },
      ref: 'candidates/c-001.pdf',
      sensitivity: 'confidential',
      source: 'operator',
      type: 'candidate-resume',
    })
    const stored = registry.get('e', { redactSensitive: false })
    expect(stored?.evidenceRefs).toEqual(['interview-2026-05-04.md', 'reference-call-1.md'])
    expect(stored?.metadata).toEqual({ workflowState: 'screening-passed', interviewerIds: ['user-1', 'user-2'] })
  })

  it('uses a sane row count via the live db', () => {
    const registry = freshRegistry()
    registry.register({ id: 'x', ref: 'x', source: 'operator', type: 't' })
    const rows = getWorkerDb().all<{ count: number }>(sql`SELECT count(*) as count FROM brain_artifacts`)
    expect(rows[0]?.count).toBe(1)
  })
})
