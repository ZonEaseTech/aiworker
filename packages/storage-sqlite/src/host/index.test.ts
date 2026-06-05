import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  __setHostAssignmentStorageTestHooks,
  closeHostDb,
  createAssignment,
  getAssignmentByWorkerId,
  getHostDb,
  initHostDb,
  listAssignments,
  markAssignmentCheckedIn,
  markAssignmentReady,
  revokeAssignment,
  runHostMigrations,
  verifyAndConsumeProvisionToken,
  hostAssignments,
} from './index'

describe('host sqlite assignment storage', () => {
  let dir = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiworker-host-db-'))
    initHostDb(join(dir, 'host.db'))
    runHostMigrations()
  })

  afterEach(async () => {
    __setHostAssignmentStorageTestHooks(null)
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

    __setHostAssignmentStorageTestHooks({
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
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
      accessReadyAt: '2026-06-06T00:02:00.000Z',
    })
    revokeAssignment(created.assignment.assignmentId, 'admin@zonease.org')

    const row = getAssignmentByWorkerId('wkr_82')
    expect(row?.status).toBe('revoked')
    expect(row?.workbenchUrl).toBe('https://aiworker.zonease.org/workers/wkr_82')
    expect(JSON.stringify(row)).not.toMatch(/sk-|Bearer |Logto|password|secret/i)
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
