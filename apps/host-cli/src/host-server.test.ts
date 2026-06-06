import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

  function hostUrls(hostControlBaseUrl = 'https://aiworker.zonease.org') {
    return {
      hostBrowserBaseUrl: 'http://127.0.0.1:5050',
      hostControlBaseUrl,
    }
  }

  function localProvisioningTarget(ref = 'local://default') {
    return {
      adapterType: 'local' as const,
      maturity: 'dev' as const,
      ref,
    }
  }

  function createHostWebDist() {
    const webStaticDir = join(dir, 'host-web-dist')
    mkdirSync(join(webStaticDir, 'assets'), { recursive: true })
    writeFileSync(join(webStaticDir, 'index.html'), [
      '<!DOCTYPE html>',
      '<html>',
      '<head><title>AIWorker Host Web</title><link rel="icon" href="/favicon.svg"></head>',
      '<body><div id="root">host web shell</div><script type="module" src="/assets/app.js"></script></body>',
      '</html>',
    ].join(''))
    writeFileSync(join(webStaticDir, 'assets', 'app.js'), 'window.__AIWORKER_HOST_WEB__ = true;')
    writeFileSync(join(webStaticDir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    return webStaticDir
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
      ...hostUrls(),
    })

    await expect(createHostServer({
      authUser: bobUser,
      dbPath: path,
      ...hostUrls(),
    })).resolves.toBeDefined()
  })

  it('throws when creating servers for different active dbPaths in one process', async () => {
    await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    await expect(createHostServer({
      authUser: bobUser,
      dbPath: join(dir, 'other-host.db'),
      ...hostUrls(),
    })).rejects.toThrow('different Host dbPath')
  })

  it('allows an admin to create and list assignments without leaking stored token fields', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    const created = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'Bob@Example.com',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: 'soul_release_1',
      }),
      method: 'POST',
    })))

    expect(created.provisionToken).toStartWith('awp_')
    expect(created.provisionCommand).toBe('bun apps/worker-cli/src/aiworker.ts provision --host https://aiworker.zonease.org --token \'awp_[REDACTED]\'')
    expect(created.assignment.assignedEmail).toBe('bob@example.com')
    expect(created.assignment.provisioningTargetRef).toBe('local://default')
    expect(created.assignment.provisionTokenHash).toBeUndefined()

    const listed = await json(await server.fetch(new Request('http://host/api/host/assignments')))
    expect(listed.assignments).toHaveLength(1)
    expect(JSON.stringify(listed)).not.toContain(created.provisionToken)
    expect(JSON.stringify(listed)).not.toContain('provisionToken')
    expect(JSON.stringify(listed)).not.toContain('provisionTokenHash')
    expect(JSON.stringify(listed)).not.toContain('provisionCommand')
  })

  it('creates assignment through provisioning target and URL contract', async () => {
    const server = await createHostServer({
      authUser: { email: 'admin@zonease.org', roles: ['host:admin'], subject: 'usr_admin_zonease' },
      dbPath: ':memory:',
      hostBrowserBaseUrl: 'http://127.0.0.1:5050',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
    })

    const response = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@zonease.org',
        provisioningTarget: {
          adapterType: 'local',
          maturity: 'dev',
          ref: 'local://default',
        },
        soulReleaseRef: 'aiworker-freeform@dev',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.assignment.provisioningTargetRef).toBe('local://default')
    expect(body.assignment.provisioningAdapterType).toBe('local')
    expect(body.assignment.provisioningTargetMaturity).toBe('dev')
    expect(body.provisionCommand).toContain('--host http://127.0.0.1:9117')
    expect(body.deliveryReceipt.command).not.toContain(body.provisionToken)
  })

  it('rejects remote aissh assignment when callback URL is loopback', async () => {
    const server = await createHostServer({
      authUser: { email: 'admin@zonease.org', roles: ['host:admin'], subject: 'usr_admin_zonease' },
      dbPath: ':memory:',
      hostBrowserBaseUrl: 'http://127.0.0.1:5050',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
    })

    const response = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        adapterRuntimeControlBaseUrl: 'http://127.0.0.1:9117',
        assignedEmail: 'bob@zonease.org',
        provisioningTarget: {
          adapterType: 'aissh',
          maturity: 'production',
          ref: 'srv-1',
        },
        soulReleaseRef: 'aiworker-freeform@dev',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'PROVISIONING_TARGET_UNREACHABLE' } })

    const listed = await json(await server.fetch(new Request('http://host/api/host/assignments')))
    expect(listed.assignments).toHaveLength(0)
  })

  it('maps storage validation errors without leaking literal secrets', async () => {
    const server = await createHostServer({
      authUser: { email: 'admin@zonease.org', roles: ['host:admin'], subject: 'usr_admin_zonease' },
      dbPath: ':memory:',
      hostBrowserBaseUrl: 'http://127.0.0.1:5050',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
    })

    const response = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@zonease.org',
        provisioningTarget: {
          adapterType: 'local',
          maturity: 'dev',
          ref: 'local://default?token=literal-secret',
        },
        soulReleaseRef: 'aiworker-freeform@dev',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))
    const responseText = await response.text()

    expect(response.status).toBe(400)
    expect(JSON.parse(responseText)).toEqual({ error: { code: 'INVALID_ASSIGNMENT_REQUEST' } })
    expect(responseText).not.toContain('literal-secret')
    expect(responseText).not.toContain('token=')

    const listed = await json(await server.fetch(new Request('http://host/api/host/assignments')))
    expect(listed.assignments).toHaveLength(0)
  })

  it('rejects invalid provisioning target shape before storage', async () => {
    const server = await createHostServer({
      authUser: { email: 'admin@zonease.org', roles: ['host:admin'], subject: 'usr_admin_zonease' },
      dbPath: ':memory:',
      hostBrowserBaseUrl: 'http://127.0.0.1:5050',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
    })

    const response = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@zonease.org',
        provisioningTarget: {
          adapterType: 'kubernetes',
          maturity: 'dev',
          ref: 'k8s://default',
        },
        soulReleaseRef: 'aiworker-freeform@dev',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'INVALID_ASSIGNMENT_REQUEST' } })

    const listed = await json(await server.fetch(new Request('http://host/api/host/assignments')))
    expect(listed.assignments).toHaveLength(0)
  })

  it('quotes unsafe host values in one-time provision commands', async () => {
    const hostControlBaseUrl = 'https://aiworker.zonease.org/~host'
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(hostControlBaseUrl),
    })

    const created = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'Bob@Example.com',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: 'soul_release_1',
      }),
      method: 'POST',
    })))

    expect(created.provisionToken).toStartWith('awp_')
    expect(created.provisionCommand).toBe(`bun apps/worker-cli/src/aiworker.ts provision --host '${hostControlBaseUrl}' --token 'awp_[REDACTED]'`)
  })

  it('blocks non-admin users from listing or creating assignments', async () => {
    const server = await createHostServer({
      authUser: bobUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    const listResponse = await server.fetch(new Request('http://host/api/host/assignments'))
    const createResponse = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@example.com',
        provisioningTarget: localProvisioningTarget(),
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
      ...hostUrls(),
    })

    const forbidden = await server.fetch(new Request('http://host/api/host/assignments'))
    const allowed = await server.fetch(new Request('http://host/api/host/assignments', {
      headers: { 'x-auth-test-user': 'admin' },
    }))

    expect(forbidden.status).toBe(403)
    expect(allowed.status).toBe(200)
  })

  it('returns a dev landing that points developers to the Host Web URL', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      hostBrowserBaseUrl: 'http://127.0.0.1:5050',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
      webBaseUrl: 'http://127.0.0.1:5050',
    })

    const response = await server.fetch(new Request('http://host/'))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('Host API is running')
    expect(body).toContain('http://127.0.0.1:5050/host')
    expect(body).toContain('/api/host/options')
  })

  it('serves Host Web static assets from the Host API process when webStaticDir is configured', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      optionsProvider: async () => ({
        access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
        auth: { mode: 'dev-static', status: 'deferred-logto' },
        provisioningTargets: [{
          adapterType: 'aissh',
          capabilities: ['remote-delivery'],
          displayName: 'aiwork',
          health: 'ready',
          id: 'aissh:srv-1',
          maturity: 'production',
          ref: 'srv-1',
        }],
        soulReleases: [],
      }),
      ...hostUrls(),
      webStaticDir: createHostWebDist(),
    })

    const hostResponse = await server.fetch(new Request('http://host/host'))
    const hostBody = await hostResponse.text()
    expect(hostResponse.status).toBe(200)
    expect(hostResponse.headers.get('content-type')).toContain('text/html')
    expect(hostBody).toContain('host web shell')

    const assetResponse = await server.fetch(new Request('http://host/assets/app.js'))
    expect(assetResponse.status).toBe(200)
    expect(assetResponse.headers.get('content-type')).toContain('application/javascript')
    expect(await assetResponse.text()).toContain('__AIWORKER_HOST_WEB__')

    const faviconResponse = await server.fetch(new Request('http://host/favicon.svg'))
    expect(faviconResponse.status).toBe(200)
    expect(faviconResponse.headers.get('content-type')).toContain('image/svg+xml')

    const optionsResponse = await server.fetch(new Request('http://host/api/host/options'))
    const optionsBody = await json(optionsResponse)
    expect(optionsResponse.status).toBe(200)
    expect(optionsBody.provisioningTargets[0].id).toBe('aissh:srv-1')
  })

  it('does not serve files outside the Host Web static directory', async () => {
    writeFileSync(join(dir, 'secret.txt'), 'do-not-leak')

    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
      webStaticDir: createHostWebDist(),
    })

    const response = await server.fetch(new Request('http://host/assets/%2e%2e/secret.txt'))
    const body = await response.text()

    expect(response.status).toBe(404)
    expect(body).not.toContain('do-not-leak')
  })

  it('returns Host options for Web and CLI without credentials', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      optionsProvider: async () => ({
        access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
        auth: { mode: 'dev-static', status: 'deferred-logto' },
        provisioningTargets: [{
          adapterType: 'aissh',
          capabilities: ['remote-delivery'],
          displayName: 'aiwork',
          health: 'ready',
          id: 'aissh:srv-1',
          maturity: 'production',
          ref: 'srv-1',
        }],
        soulReleases: [{
          descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json',
          id: 'aiworker-freeform',
          name: 'AIWorker Freeform',
          releaseRef: 'aiworker-freeform@dev',
          source: 'official',
        }],
      }),
      ...hostUrls(),
    })

    const response = await server.fetch(new Request('http://host/api/host/options'))
    const body = await json(response)

    expect(response.status).toBe(200)
    expect(body.provisioningTargets[0].id).toBe('aissh:srv-1')
    expect(body.soulReleases[0].releaseRef).toBe('aiworker-freeform@dev')
    expect(JSON.stringify(body)).not.toContain('token')
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it('rejects assignment creation before storage when assignedEmail is not an email', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })

    const response = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'not-an-email',
        provisioningTarget: localProvisioningTarget(),
        soulReleaseRef: 'soul_release_1',
      }),
      method: 'POST',
    }))

    expect(response.status).toBe(400)
  })

  it('includes an aissh exec command in assignment creation', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls('https://aiworker.zonease.org'),
    })

    const created = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        adapterRuntimeControlBaseUrl: 'https://aiworker.zonease.org',
        assignedEmail: 'bob@example.com',
        provisioningTarget: {
          adapterType: 'aissh',
          maturity: 'production',
          ref: 'srv-1',
        },
        soulReleaseRef: 'aiworker-freeform@dev',
      }),
      method: 'POST',
    })))

    expect(created.deliveryReceipt.command).toContain('aissh exec srv-1')
    expect(created.deliveryReceipt.command).not.toContain(created.provisionToken)
    expect(created.deliveryReceipt.command).toContain('--reason=')
  })

  it('consumes a provision token exactly once and returns a worker_access receipt', async () => {
    const server = await createHostServer({
      authUser: adminUser,
      dbPath: dbPath(),
      ...hostUrls(),
    })
    const created = await json(await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@example.com',
        provisioningTarget: localProvisioningTarget(),
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
      ...hostUrls(),
    })
    const created = await json(await adminServer.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@example.com',
        provisioningTarget: localProvisioningTarget(),
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
      ...hostUrls(),
    })
    const response = await employeeServer.fetch(new Request('http://host/workers/wkr_82'))

    expect(response.status).toBe(503)
    expect(await json(response)).toEqual({ error: { code: 'WORKER_ACCESS_NOT_READY' } })
  })

  it('blocks users who are not assigned to a ready worker', async () => {
    const server = await createHostServer({
      authUser: aliceUser,
      dbPath: dbPath(),
      ...hostUrls(),
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
      ...hostUrls(),
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
      ...hostUrls(),
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
      assignmentId: created.assignment.assignmentId,
      close() {},
      async sendRequest() {
        throw new Error('sendRequest should not be called by the placeholder route')
      },
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
      ...hostUrls(),
    })

    const response = await server.fetch(new Request('http://host/api/provision/access'))

    expect(response.status).toBe(426)
    expect(await json(response)).toEqual({ error: { code: 'WORKER_ACCESS_UPGRADE_REQUIRED' } })
  })
})
