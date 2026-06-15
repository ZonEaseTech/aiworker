import { describe, expect, test } from 'bun:test'

import { adminConsoleData, assertRedactedAdminConsoleData, loadAdminConsoleData } from './admin-data'

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
      expect(profile.secretRef).not.toContain('literal')
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

  test('rejects live data sources that cross the redaction boundary', () => {
    expect(() => loadAdminConsoleData({
      loadAdminConsoleData() {
        return {
          ...adminConsoleData,
          providerProfiles: [
            {
              ...providerProfiles[0],
              secretRef: 'literal-provider-key' as never,
            },
          ],
        }
      },
    })).toThrow(/secret reference/)

    expect(() => loadAdminConsoleData({
      loadAdminConsoleData() {
        return {
          ...adminConsoleData,
          assignments: [
            {
              ...assignments[0],
              workspaceRef: '/workspace/transcript/raw',
            },
          ],
        }
      },
    })).toThrow(/redacted/)
  })

  test('validates a redacted payload directly before UI consumption', () => {
    expect(assertRedactedAdminConsoleData(adminConsoleData)).toBe(adminConsoleData)
  })
})
