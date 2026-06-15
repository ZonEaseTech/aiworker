import { describe, expect, test } from 'bun:test'

import { adminConsoleData, loadAdminConsoleData } from '@/lib/admin-data'

describe('admin data fixtures', () => {
  const { assignments, environments, providerProfiles } = adminConsoleData

  test('exposes fixtures through an explicit admin data source boundary', () => {
    expect(loadAdminConsoleData()).toEqual(adminConsoleData)
    expect(adminConsoleData.metrics.length).toBeGreaterThan(0)
    expect(adminConsoleData.recentAuditEvents.length).toBeGreaterThan(0)
  })

  test('reference provider secrets without embedding literal API keys', () => {
    for (const profile of providerProfiles) {
      expect(profile.secretRef.startsWith('secret://')).toBe(true)
      expect(profile.secretRef).not.toContain('sk-')
    }
  })

  test('model AIWorker-owned handoff metadata without runtime transcripts', () => {
    expect(assignments.length).toBeGreaterThan(0)
    expect(environments.length).toBeGreaterThan(0)

    for (const assignment of assignments) {
      expect(assignment.handoffLabel).toMatch(/paseo|workspace|relay/i)
      expect(assignment.nextStep).toContain('AIWorker 不读取 session')
      expect(assignment.workspaceRef).not.toContain('transcript')
    }
  })
})
