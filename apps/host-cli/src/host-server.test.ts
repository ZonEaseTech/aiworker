import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createWorkerAccessRegistry } from '@zonease/aiworker-host-control'
import {
  createAssignment,
  markAssignmentAccessReady,
  markAssignmentCheckedIn,
  markAssignmentReady,
  verifyAndConsumeProvisionToken,
} from '@zonease/aiworker-storage-sqlite/host'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { createHostServer } from './host-server'

const adminUser = { email: 'admin@example.com', roles: ['host:admin'], subject: 'usr_admin' }
const bobUser = { email: 'bob@example.com', roles: [], subject: 'usr_bob' }
const aliceUser = { email: 'alice@example.com', roles: [], subject: 'usr_alice' }

describe('host server', () => {
  let dir = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiworker-host-server-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function dbPath() {
    return join(dir, 'host.db')
  }

  async function json(response: Response) {
    return await response.json() as Record<string, any>
  }

  function checkInBody(provisionToken: string, workerId = 'wkr_82') {
    return {
      provisionToken,
      worker: {
        health: { ready: true },
        id: 'aiworker-freeform',
        version: '1.0.0',
        workerId,
        workbenchUrl: `http://127.0.0.1:9217/workers/${workerId}`,
      },
    }
  }

  it('allows repeated server creation for the same dbPath', async () => {
    const path = dbPath()

    await createHostServer({
      authUser: adminUser,
      dbPath: path,
      publicBaseUrl: 'https://aiworker.zonease.org',
    })

    await expect(createHostServer({
      authUser: bobUser,
      dbPath: path,
      publicBaseUrl: 'https://aiworker.zonease.org',
    })).resolves.toBeDefined()
  })

  it('throws when creating servers for different active dbPaths in one process', async () => {
    await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })

    await expect(createHostServer({
      authUser: bobUser,
      dbPath: join(dir, 'other-host.db'),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })).rejects.toThrow('different Host dbPath')
  })

  it('allows an admin to create and list assignments without leaking stored token fields', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })

    const created = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'Bob@Example.com',
        serverRef: 'host-main',
        soulReleaseRef: 'soul_release_1',
      }),
      method: 'POST',
    })))

    expect(created.provisionToken).toStartWith('awp_')
    expect(created.assignment.assignedEmail).toBe('bob@example.com')
    expect(created.assignment.provisionTokenHash).toBeUndefined()

    const listed = await json(await server.fetch(new Request('http://host/api/host/assignments')))
    expect(listed.assignments).toHaveLength(1)
    expect(JSON.stringify(listed)).not.toContain(created.provisionToken)
    expect(JSON.stringify(listed)).not.toContain('provisionTokenHash')
  })

  it('blocks non-admin users from listing or creating assignments', async () => {
    const server = await createHostServer({
      authUser: bobUser,
      dbPath: dbPath(),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })

    const listResponse = await server.fetch(new Request('http://host/api/host/assignments'))
    const createResponse = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@example.com',
        serverRef: 'host-main',
        soulReleaseRef: 'soul_release_1',
      }),
      method: 'POST',
    }))

    expect(listResponse.status).toBe(403)
    expect(createResponse.status).toBe(403)
  })

  it('uses an injected auth provider for admin assignment access', async () => {
    const server = await createHostServer({
      authProvider: {
        async authenticateRequest({ headers }) {
          return headers.get('x-auth-test-user') === 'admin' ? adminUser : null
        },
      },
      authUser: null,
      dbPath: dbPath(),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })

    const forbidden = await server.fetch(new Request('http://host/api/host/assignments'))
    const allowed = await server.fetch(new Request('http://host/api/host/assignments', {
      headers: { 'x-auth-test-user': 'admin' },
    }))

    expect(forbidden.status).toBe(403)
    expect(allowed.status).toBe(200)
  })

  it('rejects assignment creation before storage when assignedEmail is not an email', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })

    const response = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'not-an-email',
        serverRef: 'host-main',
        soulReleaseRef: 'soul_release_1',
      }),
      method: 'POST',
    }))

    expect(response.status).toBe(400)
  })

  it('consumes a provision token exactly once and returns a worker_access receipt', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })
    const created = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@example.com',
        serverRef: 'host-main',
        soulReleaseRef: 'soul_release_1',
      }),
      method: 'POST',
    })))

    const first = await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(created.provisionToken)),
      method: 'POST',
    }))
    const receipt = await json(first)

    expect(first.status).toBe(200)
    expect(receipt.access.mode).toBe('worker_access')
    expect(receipt.access.token).toStartWith('awt_')
    expect(receipt.access.url).toBeUndefined()
    expect(receipt.assignment).toEqual({
      assignedEmail: 'bob@example.com',
      assignmentId: created.assignment.assignmentId,
      soulReleaseRef: 'soul_release_1',
      workerId: 'wkr_82',
    })

    const second = await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(created.provisionToken)),
      method: 'POST',
    }))
    expect(second.status).toBe(401)
  })

  it('leaves an assignment not ready after check-in until worker access is ready', async () => {
    const adminServer = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })
    const created = await json(await adminServer.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@example.com',
        serverRef: 'host-main',
        soulReleaseRef: 'soul_release_1',
      }),
      method: 'POST',
    })))
    await adminServer.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify(checkInBody(created.provisionToken)),
      method: 'POST',
    }))

    const employeeServer = await createHostServer({
      authUser: bobUser,
      dbPath: dbPath(),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })
    const response = await employeeServer.fetch(new Request('http://host/workers/wkr_82'))

    expect(response.status).toBe(503)
    expect(await json(response)).toEqual({ error: { code: 'WORKER_ACCESS_NOT_READY' } })
  })

  it('blocks users who are not assigned to a ready worker', async () => {
    const server = await createHostServer({
      authUser: aliceUser,
      dbPath: dbPath(),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: 'soul_release_1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })
    markAssignmentAccessReady(created.assignment.assignmentId)
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })

    const response = await server.fetch(new Request('http://host/workers/wkr_82'))

    expect(response.status).toBe(403)
  })

  it('returns not-ready for an assigned ready worker without a registered access connection', async () => {
    const server = await createHostServer({
      authUser: bobUser,
      dbPath: dbPath(),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: 'soul_release_1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })
    markAssignmentAccessReady(created.assignment.assignmentId)
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })

    const response = await server.fetch(new Request('http://host/workers/wkr_82'))

    expect(response.status).toBe(503)
    expect(await json(response)).toEqual({ error: { code: 'WORKER_ACCESS_NOT_READY' } })
  })

  it('routes an assigned ready worker when access registry has the connection', async () => {
    const accessRegistry = createWorkerAccessRegistry()
    const server = await createHostServer({
      accessRegistry,
      authUser: bobUser,
      dbPath: dbPath(),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })
    const created = createAssignment({
      assignedEmail: 'bob@example.com',
      serverRef: 'host-main',
      soulReleaseRef: 'soul_release_1',
    })
    verifyAndConsumeProvisionToken(created.provisionToken)
    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: '1.0.0',
    })
    markAssignmentAccessReady(created.assignment.assignmentId)
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })
    accessRegistry.register({
      close() {},
      workerId: 'wkr_82',
    })

    const response = await server.fetch(new Request('http://host/workers/wkr_82'))

    expect(response.status).toBe(200)
    expect(await json(response)).toEqual({ routed: true, workerId: 'wkr_82' })
  })

  it('returns upgrade required for worker access before websocket support exists', async () => {
    const server = await createHostServer({
      authUser: null,
      dbPath: dbPath(),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })

    const response = await server.fetch(new Request('http://host/api/provision/access'))

    expect(response.status).toBe(426)
    expect(await json(response)).toEqual({ error: { code: 'WORKER_ACCESS_UPGRADE_REQUIRED' } })
  })
})
