import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  closeHostDb,
  createAssignment,
  getAssignmentByWorkerId,
  getHostDb,
  initHostDb,
  listAssignments,
  markAssignmentAccessReady,
  markAssignmentCheckedIn,
  markAssignmentReady,
  revokeAssignment,
  runHostMigrations,
  verifyAndConsumeProvisionToken,
  hostAssignments,
} from './index'
import { setHostAssignmentStorageTestHooks } from './test-hooks'

describe('host sqlite assignment storage', () => {
  let dir = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiworker-host-db-'))
    initHostDb(join(dir, 'host.db'))
    runHostMigrations()
  })

  afterEach(async () => {
    setHostAssignmentStorageTestHooks(null)
    closeHostDb()
    await rm(dir, { recursive: true, force: true })
  })

  it('creates a pending assignment without persisting the plaintext provision token', () => {
    const created = createAssignment({
      assignedEmail: 'Bob@Zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
      now: () => '2026-06-06T00:00:00.000Z',
    })

    expect(created.assignment.assignedEmail).toBe('bob@zonease.org')
    expect(created.assignment.status).toBe('provisioning')
    expect(created.provisionToken).toMatch(/^awp_/)
    expect(JSON.stringify(listAssignments())).not.toContain(created.provisionToken)
  })

  it('consumes a provision token exactly once', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    const first = verifyAndConsumeProvisionToken(created.provisionToken)
    expect(first?.assignmentId).toBe(created.assignment.assignmentId)
    expect(verifyAndConsumeProvisionToken(created.provisionToken)).toBeNull()
  })

  it('returns null when the conditional consume update changes no rows', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })
    const racedAt = '2026-06-06T00:03:00.000Z'

    setHostAssignmentStorageTestHooks({
      beforeConsumeUpdate: assignment => {
        getHostDb().update(hostAssignments).set({
          provisionTokenConsumedAt: racedAt,
          updatedAt: racedAt,
        }).where(eq(hostAssignments.assignmentId, assignment.assignmentId)).run()
      },
    })

    expect(verifyAndConsumeProvisionToken(created.provisionToken, {
      now: () => racedAt,
    })).toBeNull()
  })

  it('rejects expired provision tokens', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      expiresAt: '2026-06-06T00:00:00.000Z',
      now: () => '2026-06-05T00:00:00.000Z',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    expect(verifyAndConsumeProvisionToken(created.provisionToken, {
      now: () => '2026-06-06T00:00:00.001Z',
    })).toBeNull()
  })

  it('does not consume provision tokens after assignment revocation', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    revokeAssignment(created.assignment.assignmentId, 'admin@zonease.org')

    expect(verifyAndConsumeProvisionToken(created.provisionToken)).toBeNull()
    expect(listAssignments()[0]?.status).toBe('revoked')
  })

  it('does not advance revoked assignments back into readiness states', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    revokeAssignment(created.assignment.assignmentId, 'admin@zonease.org')

    expect(markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: 'test',
    })).toBeNull()
    expect(markAssignmentAccessReady(created.assignment.assignmentId)).toBeNull()
    expect(markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })).toBeNull()

    expect(listAssignments()[0]?.status).toBe('revoked')
  })

  it('requires checked-in and access-ready prerequisites before later readiness states', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    expect(markAssignmentAccessReady(created.assignment.assignmentId)).toBeNull()
    expect(markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })).toBeNull()
    expect(listAssignments()[0]?.status).toBe('provisioning')
  })

  it('moves through checked_in, access_ready, ready, and revoked without leaking secrets', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: 'test',
      checkInAt: '2026-06-06T00:01:00.000Z',
    })
    markAssignmentAccessReady(created.assignment.assignmentId, {
      accessReadyAt: '2026-06-06T00:02:00.000Z',
    })
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })
    revokeAssignment(created.assignment.assignmentId, 'admin@zonease.org')

    const row = getAssignmentByWorkerId('wkr_82')
    expect(row?.status).toBe('revoked')
    expect(row?.workbenchUrl).toBe('https://aiworker.zonease.org/workers/wkr_82')
    expect(JSON.stringify(row)).not.toMatch(/sk-|Bearer |Logto|password|secret/i)
  })

  it('keeps checked-in assignments out of ready until access and URL readiness complete', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    const checkedIn = markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: 'test',
      checkInAt: '2026-06-06T00:01:00.000Z',
    })
    expect(checkedIn?.status).toBe('checked_in')
    expect(checkedIn?.workbenchUrl).toBeNull()

    const accessReady = markAssignmentAccessReady(created.assignment.assignmentId, {
      accessReadyAt: '2026-06-06T00:02:00.000Z',
    })
    expect(accessReady?.status).toBe('access_ready')
    expect(accessReady?.accessReadyAt).toBe('2026-06-06T00:02:00.000Z')
    expect(accessReady?.workbenchUrl).toBeNull()

    const ready = markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })
    expect(ready?.status).toBe('ready')
    expect(ready?.accessReadyAt).toBe('2026-06-06T00:02:00.000Z')
    expect(ready?.workbenchUrl).toBe('https://aiworker.zonease.org/workers/wkr_82')
  })

  it('throws when assignment metadata contains literal secrets', () => {
    expect(() => createAssignment({
      assignedEmail: 'bob@zonease.org',
      metadataJson: { apiKey: 'sk-literal-secret-abcdef123456' },
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })).toThrow(/Literal secrets are not allowed/)
  })

  it('throws when checked-in fields contain literal secrets', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    expect(() => markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: 'Bearer abcdefghijklmnop',
    })).toThrow(/Literal secrets are not allowed/)
  })

  it('throws when ready fields contain literal secrets', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    expect(() => markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82?token=literal-secret',
    })).toThrow(/Literal secrets are not allowed/)
  })

  it('throws when revoked fields contain literal secrets', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    expect(() => revokeAssignment(created.assignment.assignmentId, 'admin@zonease.org password="literal-secret"')).toThrow(/Literal secrets are not allowed/)
  })

  it('requires initialization before use', () => {
    closeHostDb()
    expect(() => getHostDb()).toThrow('Host database not initialized')
  })
})
