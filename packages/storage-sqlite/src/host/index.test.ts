import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  bootstrapHostAdminEmails,
  closeHostDb,
  createAssignment,
  getAssignmentByWorkerId,
  getHostDb,
  hostAssignments,
  initHostDb,
  issueAssignmentAccessToken,
  listAssignments,
  listHostUserAuthorizations,
  markAssignmentAccessReady,
  markAssignmentCheckedIn,
  markAssignmentReady,
  revokeAssignment,
  runHostMigrations,
  userHasHostPermission,
  verifyAndConsumeProvisionToken,
  verifyAssignmentAccessToken,
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

  it('bootstraps Host admin authorization from normalized email addresses', () => {
    bootstrapHostAdminEmails([' Admin@Zonease.org ', 'admin@zonease.org', 'ops@example.com'], {
      now: () => '2026-06-06T00:00:00.000Z',
    })

    expect(userHasHostPermission('admin@zonease.org', 'host:admin')).toBe(true)
    expect(userHasHostPermission('ADMIN@ZONEASE.ORG', 'host:admin')).toBe(true)
    expect(userHasHostPermission('employee@zonease.org', 'host:admin')).toBe(false)
    expect(listHostUserAuthorizations()).toEqual([
      {
        createdAt: '2026-06-06T00:00:00.000Z',
        email: 'admin@zonease.org',
        permission: 'host:admin',
        source: 'bootstrap',
        updatedAt: '2026-06-06T00:00:00.000Z',
      },
      {
        createdAt: '2026-06-06T00:00:00.000Z',
        email: 'ops@example.com',
        permission: 'host:admin',
        source: 'bootstrap',
        updatedAt: '2026-06-06T00:00:00.000Z',
      },
    ])
  })

  it('stores provisioning target metadata while preserving legacy server_ref', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      metadataJson: {
        provisioningAdapterType: 'aissh',
        provisioningTargetMaturity: 'production',
        provisioningTargetRef: 'aissh://stale/server',
      },
      provisioningTarget: {
        adapterType: 'docker',
        maturity: 'preview',
        ref: 'docker://local/default',
      },
      soulReleaseRef: 'aiworker-freeform@dev',
    })

    expect(created.assignment.serverRef).toBe('docker://local/default')
    expect(created.assignment.metadataJson).toMatchObject({
      provisioningAdapterType: 'docker',
      provisioningTargetMaturity: 'preview',
      provisioningTargetRef: 'docker://local/default',
    })
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
      beforeConsumeUpdate: (assignment) => {
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

  it('does not check in assignments before the provision token is consumed', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    expect(markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: 'test',
    })).toBeNull()

    const row = listAssignments()[0]
    expect(row?.status).toBe('provisioning')
    expect(row?.provisionTokenConsumedAt).toBeNull()
  })

  it('does not mark a polluted checked-in row access-ready without a consumed token', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    getHostDb().update(hostAssignments).set({
      checkedInAt: '2026-06-06T00:01:00.000Z',
      status: 'checked_in',
      workerId: 'wkr_82',
      workerVersion: 'test',
    }).where(eq(hostAssignments.assignmentId, created.assignment.assignmentId)).run()

    expect(markAssignmentAccessReady(created.assignment.assignmentId, {
      accessReadyAt: '2026-06-06T00:02:00.000Z',
    })).toBeNull()

    const row = listAssignments()[0]
    expect(row?.status).toBe('checked_in')
    expect(row?.provisionTokenConsumedAt).toBeNull()
    expect(row?.accessReadyAt).toBeNull()
  })

  it('does not mark a polluted access-ready row ready without check-in proof', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    getHostDb().update(hostAssignments).set({
      accessReadyAt: '2026-06-06T00:02:00.000Z',
      status: 'access_ready',
      workerId: 'wkr_82',
      workerVersion: 'test',
    }).where(eq(hostAssignments.assignmentId, created.assignment.assignmentId)).run()

    expect(markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })).toBeNull()

    const row = listAssignments()[0]
    expect(row?.status).toBe('access_ready')
    expect(row?.checkedInAt).toBeNull()
    expect(row?.provisionTokenConsumedAt).toBeNull()
    expect(row?.workbenchUrl).toBeNull()
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

    verifyAndConsumeProvisionToken(created.provisionToken)
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

    // revoke deliberately clears worker_id to free the UNIQUE slot for same-machine
    // re-provision recovery, so the worker-id reader no longer resolves the revoked row.
    expect(getAssignmentByWorkerId('wkr_82')).toBeNull()
    const row = listAssignments()[0]
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

    verifyAndConsumeProvisionToken(created.provisionToken)
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

  it('issues and verifies assignment access tokens only after check-in', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    expect(issueAssignmentAccessToken(created.assignment.assignmentId)).toBeNull()
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: 'test',
    })

    const issued = issueAssignmentAccessToken(created.assignment.assignmentId)
    expect(issued?.accessToken).toMatch(/^awt_/)
    expect(JSON.stringify(listAssignments())).not.toContain(issued!.accessToken)
    expect(verifyAssignmentAccessToken({
      assignmentId: created.assignment.assignmentId,
      token: issued!.accessToken,
      workerId: 'wkr_82',
    })?.assignmentId).toBe(created.assignment.assignmentId)
  })

  it('rejects access tokens for wrong worker or revoked assignment', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: 'test',
    })
    const issued = issueAssignmentAccessToken(created.assignment.assignmentId)!

    expect(verifyAssignmentAccessToken({
      assignmentId: created.assignment.assignmentId,
      token: issued.accessToken,
      workerId: 'wkr_other',
    })).toBeNull()

    revokeAssignment(created.assignment.assignmentId, 'admin@zonease.org')
    expect(verifyAssignmentAccessToken({
      assignmentId: created.assignment.assignmentId,
      token: issued.accessToken,
      workerId: 'wkr_82',
    })).toBeNull()
  })

  it('throws when assignment metadata contains literal secrets', () => {
    expect(() => createAssignment({
      assignedEmail: 'bob@zonease.org',
      metadataJson: { apiKey: 'sk-literal-secret-abcdef123456' },
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })).toThrow(/Literal secrets are not allowed/)
  })

  it('rejects literal secrets inside provisioning target metadata', () => {
    expect(() => createAssignment({
      assignedEmail: 'bob@zonease.org',
      provisioningTarget: {
        adapterType: 'aissh',
        maturity: 'production',
        ref: 'srv-1 token=literal-secret',
      },
      soulReleaseRef: 'aiworker-freeform@dev',
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
