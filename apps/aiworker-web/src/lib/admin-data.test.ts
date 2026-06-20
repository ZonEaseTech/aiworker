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

import {
  adminConsoleData,
  applyApprovalDecisionRecords,
  assertRedactedAdminConsoleData,
  createAdminDataSourceFromControlPlaneSnapshot,
  getApprovalForAssignment,
  getAssignmentForPlan,
  getTraceEventsForAssignment,
  loadAdminConsoleData,
  mapControlPlaneSnapshotToAdminConsoleData,
} from './admin-data'

describe('admin data fixtures', () => {
  const { assignments, environments, providerProfiles } = adminConsoleData

  test('exposes fixtures through an explicit admin data source boundary', () => {
    expect(loadAdminConsoleData()).toEqual(adminConsoleData)
    expect(adminConsoleData.metrics.length).toBeGreaterThan(0)
    expect(adminConsoleData.recentAuditEvents.length).toBeGreaterThan(0)
  })

  test('exposes approval queue and trace events tied to known assignments', () => {
    const assignmentIds = new Set(assignments.map(assignment => assignment.id))
    const assignmentTuples = new Set(assignments.map(assignment =>
      `${assignment.environmentId}/${assignment.soulReleaseId}/${assignment.providerProfileId}`,
    ))

    expect(adminConsoleData.approvals.length).toBe(assignments.length)
    expect(assignmentTuples.size).toBe(assignments.length)
    expect(adminConsoleData.traceEvents.length).toBeGreaterThan(assignments.length)
    expect(adminConsoleData.metrics.some(metric => metric.label === '待审批')).toBe(true)
    expect(adminConsoleData.approvals.some(approval => approval.status === 'pending')).toBe(true)

    for (const approval of adminConsoleData.approvals) {
      expect(assignmentIds.has(approval.assignmentId), approval.id).toBe(true)
      expect(approval.controlApiState).toBe('not_implemented')
      expect(approval.previewCommand).toContain('aiworker plan')
      expect(approval.previewCommand).toContain(`--target-owner ${environments.find(environment => environment.id === assignments.find(assignment => assignment.id === approval.assignmentId)?.environmentId)?.ownerEmail}`)
      if (environments.find(environment => environment.id === assignments.find(assignment => assignment.id === approval.assignmentId)?.environmentId)?.dedication)
        expect(approval.previewCommand).toContain('--dedicated-target-user')
      expect(approval.previewCommand).not.toContain('apply --yes')
      expect(getApprovalForAssignment(approval.assignmentId)?.id).toBe(approval.id)
    }

    for (const traceEvent of adminConsoleData.traceEvents) {
      expect(assignmentIds.has(traceEvent.assignmentId), traceEvent.id).toBe(true)
      expect(traceEvent.evidenceRef).toMatch(/^(assignment|approval|receipt|audit|handoff):/)
    }

    expect(getTraceEventsForAssignment(assignments[0].id).map(event => event.evidenceRef)).toContain(`receipt:${assignments[0].receiptId}`)
  })

  test('reference provider secrets without embedding literal API keys', () => {
    for (const profile of providerProfiles) {
      expect(profile.secretRef.startsWith('secret://')).toBe(true)
      expect(profile.secretRef).not.toContain('literal')
    }
  })

  test('overlays persisted approval decisions without leaking runtime data', () => {
    const assignment = adminConsoleData.assignments[0]
    const updated = applyApprovalDecisionRecords(adminConsoleData, [{
      schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
      id: 'appr-decision-1',
      kind: 'approval-decision',
      at: '2026-06-16T16:00:00.000Z',
      assignmentId: assignment.id,
      note: '可以交付；provider 后续在 Paseo 内处理。',
      reviewer: 'ops@example.com',
      status: 'approved',
    }])
    const approval = getApprovalForAssignment(assignment.id, updated)!

    expect(approval.status).toBe('approved')
    expect(approval.controlApiState).toBe('persisted')
    expect(approval.reviewer).toBe('ops@example.com')
    expect(approval.riskSummary).toContain('审批备注')
    expect(updated.traceEvents.some(event => event.evidenceRef === `approval:${approval.id}`)).toBe(true)
  })

  test('rejects unsafe persisted approval decisions', () => {
    const assignment = adminConsoleData.assignments[0]

    expect(() => applyApprovalDecisionRecords(adminConsoleData, [{
      schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
      id: 'appr-bad',
      kind: 'approval-decision',
      at: '2026-06-16T16:00:00.000Z',
      assignmentId: assignment.id,
      note: 'raw offer=https://paseo.example/pair?offer=abc',
      reviewer: 'ops@example.com',
      status: 'approved',
    }])).toThrow(/redacted/)
  })

  test('model AIWorker-owned handoff metadata without runtime transcripts', () => {
    expect(assignments.length).toBeGreaterThan(0)
    expect(environments.length).toBeGreaterThan(0)

    for (const assignment of assignments) {
      expect(assignment.handoffLabel).toMatch(/员工|Paseo|AIWorker/)
      expect(assignment.handoffLabel).not.toContain(assignment.workspaceRef)
      expect(assignment.nextStep).toMatch(/员工|开通|入口|AIWorker/)
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
        const assignment = {
          ...assignments[0],
          workspaceRef: '/workspace/transcript/raw',
        }
        return {
          ...adminConsoleData,
          assignments: [assignment],
          approvals: adminConsoleData.approvals.filter(approval => approval.assignmentId === assignment.id),
          traceEvents: adminConsoleData.traceEvents.filter(traceEvent => traceEvent.assignmentId === assignment.id),
        }
      },
    })).toThrow(/redacted/)
  })

  test('validates a redacted payload directly before UI consumption', () => {
    expect(assertRedactedAdminConsoleData(adminConsoleData)).toBe(adminConsoleData)
  })

  test('rejects approvals and trace events that point outside known assignments', () => {
    expect(() => assertRedactedAdminConsoleData({
      ...adminConsoleData,
      approvals: [{
        ...adminConsoleData.approvals[0],
        assignmentId: 'missing-assignment',
      }],
    })).toThrow(/known assignment/)

    expect(() => assertRedactedAdminConsoleData({
      ...adminConsoleData,
      traceEvents: [{
        ...adminConsoleData.traceEvents[0],
        assignmentId: 'missing-assignment',
      }],
    })).toThrow(/known assignment/)
  })

  test('reports ambiguous assignment tuples and rejects schema-invalid approval or trace references', () => {
    const assignment = assignments[0]
    const approval = adminConsoleData.approvals.find(item => item.assignmentId === assignment.id)!
    const traceEvent = adminConsoleData.traceEvents.find(item => item.assignmentId === assignment.id && item.evidenceRef.startsWith('receipt:'))!

    const ambiguousData = assertRedactedAdminConsoleData({
      ...adminConsoleData,
      assignments: [
        ...adminConsoleData.assignments,
        {
          ...assignment,
          id: `${assignment.id}-duplicate`,
          assignedEmail: 'duplicate@example.com',
        },
      ],
    })
    expect(() => getAssignmentForPlan(
      assignment.environmentId,
      assignment.soulReleaseId,
      assignment.providerProfileId,
      ambiguousData,
    )).toThrow(/requires assignmentId/)

    expect(() => assertRedactedAdminConsoleData({
      ...adminConsoleData,
      environments: [{
        ...adminConsoleData.environments.find(environment => environment.endpointKind === 'relay-offer')!,
        daemonEndpoint: 'https://paseo.example/pair/raw-code',
      }],
    })).toThrow(/relay endpoint must be a redacted pairing reference/)

    expect(() => assertRedactedAdminConsoleData({
      ...adminConsoleData,
      approvals: [{
        ...approval,
        previewCommand: approval.previewCommand.replace(`--provider ${assignment.providerProfileId}`, '--provider wrong-provider'),
      }],
    })).toThrow(/preview command must stay scoped/)

    expect(() => assertRedactedAdminConsoleData({
      ...adminConsoleData,
      approvals: [{
        ...approval,
        controlApiState: 'implemented' as never,
      }],
    })).toThrow(/unsupported control API state/)

    expect(() => assertRedactedAdminConsoleData({
      ...adminConsoleData,
      traceEvents: [{
        ...traceEvent,
        evidenceRef: 'receipt:other-receipt',
      }],
    })).toThrow(/trace evidence .* receipt/)
  })

  test('rejects approval and trace fields that leak runtime, provider payloads, pairing offers, or secrets', () => {
    const approval = adminConsoleData.approvals[0]
    const check = approval.checks[0]
    const traceEvent = adminConsoleData.traceEvents[0]
    const withApproval = (updatedApproval: typeof approval) => ({
      ...adminConsoleData,
      approvals: adminConsoleData.approvals.map(item => item.id === updatedApproval.id ? updatedApproval : item),
    })
    const withTraceEvent = (updatedTraceEvent: typeof traceEvent) => ({
      ...adminConsoleData,
      traceEvents: adminConsoleData.traceEvents.map(item => item.id === updatedTraceEvent.id ? updatedTraceEvent : item),
    })

    const cases = [
      {
        label: 'approval riskSummary raw pairing',
        data: withApproval({ ...approval, riskSummary: 'raw pairing offer=https://paseo.example/pair?token=abc' }),
      },
      {
        label: 'approval check provider models payload',
        data: withApproval({ ...approval, checks: [{ ...check, detail: 'provider models payload: gpt-secret' }] }),
      },
      {
        label: 'approval preview command shell script body',
        data: withApproval({ ...approval, previewCommand: 'shell script body: export OPENAI_API_KEY=sk-abc123456789' }),
      },
      {
        label: 'trace title engine invocation',
        data: withTraceEvent({ ...traceEvent, title: 'engine_invocation started' }),
      },
      {
        label: 'trace detail session transcript',
        data: withTraceEvent({ ...traceEvent, detail: 'captured transcript from /api/sessions/sess-1' }),
      },
      {
        label: 'trace evidence raw QR',
        data: withTraceEvent({ ...traceEvent, evidenceRef: 'qr:base64:abc123' }),
      },
    ]

    for (const { label, data } of cases) {
      expect(() => assertRedactedAdminConsoleData(data), label).toThrow(/redacted|literal secret|preview command|trace evidence/)
    }
  })

  test('maps a control-plane snapshot through a read-only admin data source', () => {
    const environment = {
      environmentId: 'env-alice',
      daemonEndpoint: '127.0.0.1:42057',
      daemonHostRef: '127.0.0.1:42057',
      daemonListenRef: '127.0.0.1:42057',
      endpointKind: 'tcp' as const,
      isolation: 'os-user' as const,
      ownerEmail: 'ops-admin@example.com',
      paseoHome: '$HOME/.aiworker/alice-example.com/.paseo',
      providerProfileIds: ['codex-default'],
      targetRef: 'aissh:server-1',
      topologyKind: 'owner-scoped-paseo-home-v1' as const,
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
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/freeform',
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
    expect(data.assignments[0]?.handoffLabel).toContain('Paseo 客户端')
    expect(data.assignments[0]?.handoffLabel).not.toContain('--home "$PASEO_HOME"')
    expect(data.assignments[0]?.handoffLabel).not.toContain(data.assignments[0]?.workspaceRef ?? 'missing-workspace')
    expect(data.assignments[0]?.projectRef).toBe('$HOME/.aiworker/alice-example.com/projects/freeform')
    expect(data.assignments[0]?.handoffLabel).not.toContain('paseo --host')
    expect(data.environments[0]?.daemonEndpoint).toBe('127.0.0.1:42057')
    expect(data.approvals[0]?.checks.some(check => check.id.endsWith('-owner-scope') && check.status === 'warning')).toBe(true)
    expect(data.assignments[0]?.nextStep).toContain('AIWorker')
    expect(data.providerProfiles[0]?.secretRef).toBe('secret://providers/codex/default')
    expect(data.soulReleases[0]?.fileCount).toBe(1)
    expect(data.approvals[0]?.assignmentId).toBe(data.assignments[0]?.id)
    expect(data.traceEvents.some(event => event.evidenceRef === 'receipt:rcpt-1')).toBe(true)
    expect(data.recentAuditEvents[0]?.tone).toBe('success')
  })

  test('maps a live snapshot whose soul carries a descriptor path without falling back to fixtures', () => {
    const environment = {
      environmentId: 'env-bob',
      daemonEndpoint: '127.0.0.1:51022',
      endpointKind: 'relay-offer' as const,
      isolation: 'os-user' as const,
      ownerEmail: 'bob@example.com',
      paseoHome: '$HOME/.aiworker/bob-example.com/.paseo',
      providerProfileIds: ['codex-default'],
      targetRef: 'aissh:server-bob',
    }
    const providerProfile = {
      id: 'codex-default',
      label: 'Codex Default',
      paseoProviderId: 'paseo-codex-default',
      provider: 'codex',
      secretRef: 'secret://providers/codex/default',
    }
    const soul = {
      descriptorRef: 'souls/hr-manager/dist/soul.descriptor.json',
      displayName: 'HR Manager',
      files: [{ relativePath: 'AGENTS.md', content: '# HR\n' }],
      id: 'hr-manager',
      version: '0.0.0',
    }
    const assignment = createAssignment({
      assignedEmail: 'bob@example.com',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: `${soul.id}@${soul.version}`,
      status: 'ready',
      workspaceRef: '$HOME/.aiworker/bob-example.com/projects/hr',
    })
    const handoffReadyAssignment = {
      ...assignment,
      handoff: createHandoff(environment, assignment.workspaceRef),
    }
    const snapshot = {
      ...createEmptyControlPlaneSnapshot(),
      assignments: [handoffReadyAssignment],
      environments: [environment],
      providerProfiles: [providerProfile],
      soulReleases: [soul],
    }

    expect(() => mapControlPlaneSnapshotToAdminConsoleData(snapshot)).not.toThrow()

    const data = mapControlPlaneSnapshotToAdminConsoleData(snapshot)
    const liveAssignment = data.assignments.find(item => item.assignedEmail === 'bob@example.com')
    expect(liveAssignment).toBeDefined()
    expect(liveAssignment?.soulReleaseId).toBe(`${soul.id}@${soul.version}`)
    const approval = data.approvals.find(item => item.assignmentId === liveAssignment?.id)
    expect(approval?.previewCommand).toContain(`--soul ${soul.descriptorRef}`)
    expect(approval?.previewCommand).toContain(`--user ${assignment.assignedEmail}`)
    expect(approval?.previewCommand).toContain(`--provider ${providerProfile.id}`)
    expect(approval?.previewCommand).toContain(`--environment ${environment.environmentId}`)
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
      workspaceRef: '$HOME/.aiworker/alice-example.com/freeform',
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
