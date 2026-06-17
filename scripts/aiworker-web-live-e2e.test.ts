import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import { createAssignment, createEmptyControlPlaneSnapshot, createProvisionPlan, createProvisionReceipt, LocalFileControlPlaneStore } from '../packages/aiworker-control/src/index'
import { assertApplyCompleted, assertPersistedControlPlaneHasNoTransientPairing, liveE2eConfigFromEnv, runLiveE2e } from './aiworker-web-live-e2e'

describe('aiworker-web live E2E gate', () => {
  test('skips unless the live environment flag is explicit', () => {
    expect(liveE2eConfigFromEnv({})).toEqual({
      kind: 'skip',
      reason: 'set AIWORKER_WEB_LIVE_E2E=1 to run the real Web approval/apply/pair E2E gate',
    })
  })

  test('requires live credentials and assignment selection before touching a real target', () => {
    expect(() => liveE2eConfigFromEnv({ AIWORKER_WEB_LIVE_E2E: '1' })).toThrow('AIWORKER_CONTROL_PLANE_DIR')
    expect(() =>
      liveE2eConfigFromEnv({
        AIWORKER_CONTROL_PLANE_DIR: '/tmp/control-plane',
        AIWORKER_WEB_ADMIN_TOKEN: 'admin-token',
        AIWORKER_WEB_E2E_ASSIGNMENT_ID: 'asn-live',
        AIWORKER_WEB_LIVE_E2E: '1',
      })).toThrow('AISSH_TOKEN')
    expect(() =>
      liveE2eConfigFromEnv({
        AISSH_TOKEN: 'aissh-token',
        AIWORKER_CONTROL_PLANE_DIR: '/tmp/control-plane',
        AIWORKER_WEB_ADMIN_TOKEN: 'admin-token',
        AIWORKER_WEB_E2E_ASSIGNMENT_ID: 'asn-live',
        AIWORKER_WEB_LIVE_E2E: '1',
      })).toThrow('AIWORKER_WEB_LIVE_E2E_DEDICATED_TARGET=1')
    expect(liveE2eConfigFromEnv({
      AISSH_TOKEN: 'aissh-token',
      AIWORKER_CONTROL_PLANE_DIR: '/tmp/control-plane',
      AIWORKER_WEB_ADMIN_TOKEN: 'admin-token',
      AIWORKER_WEB_E2E_ASSIGNMENT_ID: 'asn-live',
      AIWORKER_WEB_LIVE_E2E: '1',
      AIWORKER_WEB_LIVE_E2E_DEDICATED_TARGET: '1',
      AIWORKER_WEB_LIVE_E2E_PROJECT_SMOKE: '1',
    })).toMatchObject({
      assignmentId: 'asn-live',
      dedicatedTarget: true,
      kind: 'run',
      projectSmoke: true,
    })
  })

  test('rejects persisted transient pairing or literal secret material', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-web-live-e2e-'))
    await writeFile(path.join(root, 'approvals.jsonl'), '{"note":"offer=raw"}\n')

    await expect(assertPersistedControlPlaneHasNoTransientPairing(root)).rejects.toThrow('approvals.jsonl')
  })

  test('reports nested apply remediation codes from failed Web jobs', () => {
    expect(() =>
      assertApplyCompleted({
        job: {
          remediation: { code: 'provider_auth_required' },
          status: 'failed',
        },
      })).toThrow('provider_auth_required')
  })

  test('sends the admin bearer token on the initial authenticated admin-data read', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aiworker-web-live-e2e-auth-'))
    const descriptorRef = path.join(root, 'soul.descriptor.json')
    await writeFile(descriptorRef, '{"protocol":"soul/v1","identity":{"id":"aiworker-freeform","version":"1.0.0"},"workspaceTemplate":{"files":[]}}\n')
    const environment = {
      daemonEndpoint: '127.0.0.1:42057',
      daemonHostRef: '127.0.0.1:42057',
      daemonListenRef: '127.0.0.1:42057',
      endpointKind: 'tcp' as const,
      environmentId: 'env-live',
      isolation: 'os-user' as const,
      ownerEmail: 'ops-admin@example.com',
      paseoHome: '$HOME/.aiworker/alice-example.com/.paseo',
      providerProfileIds: ['deepseek'],
      targetRef: 'aissh:vm-node',
      topologyKind: 'owner-scoped-paseo-home-v1' as const,
    }
    const providerProfile = {
      id: 'deepseek',
      label: 'DeepSeek',
      provider: 'opencode',
      secretRef: 'secret://provider/deepseek',
    }
    const soul = {
      descriptorRef,
      displayName: 'AIWorker Freeform',
      files: [{ content: '# Freeform\n', relativePath: 'AGENTS.md' }],
      id: 'aiworker-freeform',
      version: '1.0.0',
    }
    const assignment = createAssignment({
      assignedEmail: 'alice@example.com',
      assignmentId: 'asn-live-auth',
      environmentId: environment.environmentId,
      providerProfileId: providerProfile.id,
      soulReleaseRef: `${soul.id}@${soul.version}`,
      status: 'handoff_ready',
      workspaceRef: '$HOME/.aiworker/alice-example.com/projects/aiworker-freeform',
    })
    const plan = createProvisionPlan({ assignment, environment, providerProfile, soul })
    const store = new LocalFileControlPlaneStore(root)
    await store.saveSnapshot({
      ...createEmptyControlPlaneSnapshot(),
      assignments: [{ ...assignment, handoff: plan.assignment.handoff }],
      environments: [environment],
      providerProfiles: [providerProfile],
      receipts: [createProvisionReceipt(plan, { status: 'applied' })],
      soulReleases: [soul],
    })

    const seenAuthHeaders: string[] = []
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/healthz')
          return Response.json({ ok: true })
        if (url.pathname === '/api/admin-data') {
          seenAuthHeaders.push(request.headers.get('authorization') ?? '')
          if (request.headers.get('authorization') !== 'Bearer admin-token')
            return Response.json({ error: 'admin_auth_required' }, { status: 401 })
          return Response.json({ source: 'control-plane', snapshot: await store.loadSnapshot() })
        }
        if (url.pathname.startsWith('/api/approvals/')) {
          expect(request.headers.get('authorization')).toBe('Bearer admin-token')
          expect(request.headers.get('x-aiworker-admin-action')).toBe('1')
          return Response.json({ approval: { assignmentId: assignment.assignmentId, status: 'approved' } })
        }
        if (url.pathname.endsWith('/apply')) {
          expect(request.headers.get('authorization')).toBe('Bearer admin-token')
          expect(request.headers.get('x-aiworker-admin-action')).toBe('1')
          return Response.json({
            job: {
              status: 'completed',
              steps: [
                { id: 'approval', label: 'Approval', status: 'done' },
                { id: 'target', label: 'Target', status: 'done' },
                { id: 'paseo', label: 'Paseo', status: 'done' },
                { id: 'workspace', label: 'Workspace', status: 'done' },
                { id: 'provider', label: 'Provider', status: 'done' },
                { id: 'handoff', label: 'Handoff', status: 'done' },
              ],
            },
          })
        }
        if (url.pathname.endsWith('/pair')) {
          expect(request.headers.get('authorization')).toBe('Bearer admin-token')
          expect(request.headers.get('x-aiworker-admin-action')).toBe('1')
          return Response.json({ pair: { assignmentId: assignment.assignmentId, pairingOutput: 'transient pairing output', status: 'paired' } })
        }
        return new Response('not found', { status: 404 })
      },
    })

    try {
      await runLiveE2e({
        adminToken: 'admin-token',
        assignmentId: assignment.assignmentId,
        baseUrl: `http://127.0.0.1:${server.port}`,
        controlPlaneDir: root,
        dedicatedTarget: true,
        kind: 'run',
        projectSmoke: false,
      })
      expect(seenAuthHeaders).toEqual(['Bearer admin-token'])
    }
    finally {
      server.stop(true)
    }
  })
})
