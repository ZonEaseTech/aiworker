import { describe, expect, test } from 'bun:test'

import {
  canAdvanceAssignment,
  createAssignmentView,
  normalizeAssignedEmail,
  userCanOpenWorker,
} from './assignment'
import { isProvisionTokenLike, redactProvisionToken } from './provision-token'

describe('host-control assignment boundary', () => {
  test('normalizes assigned email exactly by trimming and lowercasing', () => {
    expect(normalizeAssignedEmail('  Alice.Example+Ops@Example.COM  ')).toBe('alice.example+ops@example.com')
  })

  test('creates assignment views with normalized assigned email', () => {
    expect(createAssignmentView({
      assignedEmail: '  BEN@Example.COM ',
      assignmentId: 'assign-1',
      serverRef: 'srv-1',
      soulReleaseRef: 'soul-release-1',
      status: 'draft',
    }).assignedEmail).toBe('ben@example.com')
  })

  test('allows only the assigned user to open a ready assignment', () => {
    const assignment = createAssignmentView({
      assignedEmail: 'worker@example.com',
      assignmentId: 'assign-1',
      serverRef: 'srv-1',
      soulReleaseRef: 'soul-release-1',
      status: 'ready',
    })

    expect(userCanOpenWorker({ email: '  WORKER@example.com ' }, assignment)).toBe(true)
    expect(userCanOpenWorker({ email: 'other@example.com' }, assignment)).toBe(false)
  })

  test('does not allow revoked assignments to be opened', () => {
    const assignment = createAssignmentView({
      assignedEmail: 'worker@example.com',
      assignmentId: 'assign-1',
      serverRef: 'srv-1',
      soulReleaseRef: 'soul-release-1',
      status: 'revoked',
    })

    expect(userCanOpenWorker({ email: 'worker@example.com' }, assignment)).toBe(false)
  })

  test('checks assignment status transitions', () => {
    expect(canAdvanceAssignment('draft', 'provisioning')).toBe(true)
    expect(canAdvanceAssignment('provisioning', 'checked_in')).toBe(true)
    expect(canAdvanceAssignment('checked_in', 'access_ready')).toBe(true)
    expect(canAdvanceAssignment('access_ready', 'ready')).toBe(true)
    expect(canAdvanceAssignment('ready', 'revoked')).toBe(true)
    expect(canAdvanceAssignment('archived', 'ready')).toBe(false)
    expect(canAdvanceAssignment('ready', 'checked_in')).toBe(false)
  })

  test('redacts provision-token-shaped values only', () => {
    expect(isProvisionTokenLike('awp_abc-DEF_123')).toBe(true)
    expect(redactProvisionToken('awp_abc-DEF_123')).toBe('awp_[REDACTED]')
    expect(isProvisionTokenLike(' bearer awp_abc ')).toBe(false)
    expect(redactProvisionToken('not-a-token')).toBe('not-a-token')
  })
})
