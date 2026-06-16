import {
  createAssignment,
  createAuditEvent,
  createEmptyControlPlaneSnapshot,
  createHandoff,
  createProvisionPlan,
  createProvisionReceipt,
  createWorkspaceProjectionManifest,
} from '@zonease/aiworker-control'
import { CONTROL_PLANE_SCHEMA_VERSION } from '@zonease/aiworker-control/control-plane'
import { describe, expect, test } from 'bun:test'

import { adminConsoleData, assertRedactedAdminConsoleData, createAdminDataSourceFromControlPlaneSnapshot, loadAdminConsoleData, mapControlPlaneSnapshotToAdminConsoleData } from './admin-data'

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

  test('maps a control-plane snapshot through a read-only admin data source', () => {
    const environment = {
      environmentId: 'env-alice',
      daemonEndpoint: 'unix:/run/paseo/alice.sock',
      endpointKind: 'unix' as const,
      isolation: 'os-user' as const,
      ownerEmail: 'alice@example.com',
      paseoHome: '/home/alice/.paseo',
      providerProfileIds: ['codex-default'],
      targetRef: 'aissh:server-1',
    }
    const providerProfile = {
      id: 'codex-default',
      label: 'Codex Default',
      paseoProviderId: 'paseo-codex-default',
      provider: 'codex',
      secretRef: 'secret://providers/codex/default',
    }
    const soul = {
      displayName: 'AIWorker Freeform',
      files: [{ relativePath: 'AGENTS.md', content: '# Freeform\n' }],
      id: 'aiworker-freeform',
      version: '2026.06.15',
    }
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: `${soul.id}@${soul.version}`,
      status: 'ready',
      workspaceRef: '/home/alice/workspaces/freeform',
    })
    const handoffReadyAssignment = {
      ...assignment,
      handoff: createHandoff(environment, assignment.workspaceRef),
    }
    const plan = createProvisionPlan({ assignment, environment, providerProfile, soul })
    const receipt = createProvisionReceipt(plan, { at: '2026-06-15T18:45:00.000Z', id: 'rcpt-1', status: 'applied' })
    const auditEvent = createAuditEvent({
      action: 'assignment applied',
      actor: 'admin@example.com',
      at: '2026-06-15T18:45:01.000Z',
      id: 'audit-1',
      target: assignment.assignmentId,
    })
    const projectionManifest = createWorkspaceProjectionManifest({
      files: soul.files,
      id: 'proj-1',
      soulReleaseRef: `${soul.id}@${soul.version}`,
      workspaceRef: assignment.workspaceRef,
    })
    const snapshot = {
      ...createEmptyControlPlaneSnapshot(),
      assignments: [handoffReadyAssignment],
      auditEvents: [auditEvent],
      environments: [environment],
      projectionManifests: [projectionManifest],
      providerProfiles: [providerProfile],
      receipts: [receipt],
      soulReleases: [soul],
    }
    const source = createAdminDataSourceFromControlPlaneSnapshot(snapshot)
    const data = loadAdminConsoleData(source)

    expect(Object.keys(source)).toEqual(['loadAdminConsoleData'])
    expect(data.assignments[0]?.receiptId).toBe('rcpt-1')
    expect(data.assignments[0]?.handoffLabel).toContain('paseo daemon pair')
    expect(data.assignments[0]?.handoffLabel).toContain('--home /home/alice/.paseo')
    expect(data.assignments[0]?.handoffLabel).toContain('Paseo frontend')
    expect(data.assignments[0]?.handoffLabel).not.toContain('paseo --host')
    expect(data.assignments[0]?.nextStep).toContain('AIWorker 不读取 session')
    expect(data.providerProfiles[0]?.secretRef).toBe('secret://providers/codex/default')
    expect(data.soulReleases[0]?.fileCount).toBe(1)
    expect(data.recentAuditEvents[0]?.tone).toBe('success')
  })

  test('rejects runtime fragments and literal secrets from store-shaped admin data', () => {
    const snapshot = {
      ...createEmptyControlPlaneSnapshot(),
      providerProfiles: [{
        id: 'codex-default',
        label: 'Codex Default',
        provider: 'codex',
        secretRef: 'sk-abc123456789',
      }],
    }

    expect(() => mapControlPlaneSnapshotToAdminConsoleData(snapshot)).toThrow(/secret reference/)
    expect(() => mapControlPlaneSnapshotToAdminConsoleData({
      ...createEmptyControlPlaneSnapshot(),
      auditEvents: [createAuditEvent({
        action: 'captured transcript',
        actor: 'admin@example.com',
        id: 'audit-runtime',
        target: '/api/sessions/sess-1',
      })],
    })).toThrow(/redacted/)

    expect(() => mapControlPlaneSnapshotToAdminConsoleData({
      ...createEmptyControlPlaneSnapshot(),
      auditEvents: [{
        schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
        action: 'leaked sk-abc123456789',
        actor: 'admin@example.com',
        at: '2026-06-15T20:00:00.000Z',
        id: 'audit-secret',
        kind: 'audit-event',
        target: 'asn-secret',
      }],
    })).toThrow(/literal secret/)

    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      environmentId: 'env-alice',
      providerProfileId: 'codex-default',
      soulReleaseRef: 'aiworker-freeform@2026.06.15',
      status: 'ready',
      workspaceRef: '/home/alice/workspaces/freeform',
    })
    expect(() => mapControlPlaneSnapshotToAdminConsoleData({
      ...createEmptyControlPlaneSnapshot(),
      assignments: [{
        ...assignment,
        handoff: {
          daemonEndpoint: 'unix:/run/paseo/sk-abc123456789.sock',
          instructions: 'open workspace',
          kind: 'paseo-daemon',
          workspaceRef: assignment.workspaceRef,
        },
      }],
    })).toThrow(/literal secret/)
  })
})
