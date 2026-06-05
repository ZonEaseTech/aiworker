import { describe, expect, it } from 'bun:test'

import { buildCheckInBody, checkInToHost } from './provision-client'

describe('worker provision check-in client', () => {
  it('builds the exact worker check-in request body', () => {
    const body = buildCheckInBody({
      id: 'aiworker-freeform',
      provisionToken: 'awp_secret',
      version: '1.2.3',
      workerId: 'worker-1',
      workbenchUrl: '/',
    })

    expect(body).toEqual({
      provisionToken: 'awp_secret',
      worker: {
        health: { ready: true },
        id: 'aiworker-freeform',
        version: '1.2.3',
        workerId: 'worker-1',
        workbenchUrl: '/',
      },
    })
    expect(Object.keys(body).sort()).toEqual(['provisionToken', 'worker'])
    expect(Object.keys(body.worker).sort()).toEqual(['health', 'id', 'version', 'workbenchUrl', 'workerId'])
    expect('sessionId' in body).toBe(false)
    expect('sessionId' in body.worker).toBe(false)
  })

  it('posts check-in JSON to the host and parses the worker access response', async () => {
    const calls: Array<{ body: unknown, headers: unknown, method: string, url: string }> = []
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({
        body: JSON.parse(String(init?.body)),
        headers: init?.headers,
        method: init?.method ?? 'GET',
        url: String(url),
      })
      return Response.json({
        access: { mode: 'worker_access', token: 'awt_token' },
        assignment: {
          assignedEmail: 'alice@example.com',
          assignmentId: 'assignment-1',
          soulReleaseRef: 'soul-release-1',
          workerId: 'worker-1',
        },
      })
    }

    const response = await checkInToHost({
      fetch: fakeFetch,
      host: 'https://host.example/base',
      id: 'aiworker-freeform',
      provisionToken: 'awp_secret',
      version: '1.2.3',
      workerId: 'worker-1',
      workbenchUrl: '/',
    })

    expect(calls).toEqual([{
      body: {
        provisionToken: 'awp_secret',
        worker: {
          health: { ready: true },
          id: 'aiworker-freeform',
          version: '1.2.3',
          workerId: 'worker-1',
          workbenchUrl: '/',
        },
      },
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      url: 'https://host.example/api/provision/check-in',
    }])
    expect(response.access).toEqual({ mode: 'worker_access', token: 'awt_token' })
    expect(response.assignment.workerId).toBe('worker-1')
  })

  it('throws status-only errors for non-ok responses without leaking the provision token', async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ error: 'bad awp_secret' }), { status: 403 })

    await expect(checkInToHost({
      fetch: fakeFetch,
      host: 'https://host.example',
      id: 'aiworker-freeform',
      provisionToken: 'awp_secret',
      version: '1.2.3',
      workerId: 'worker-1',
      workbenchUrl: '/',
    })).rejects.toThrow('Worker check-in failed: 403')

    try {
      await checkInToHost({
        fetch: fakeFetch,
        host: 'https://host.example',
        id: 'aiworker-freeform',
        provisionToken: 'awp_secret',
        version: '1.2.3',
        workerId: 'worker-1',
        workbenchUrl: '/',
      })
    }
    catch (error) {
      expect(String(error)).not.toContain('awp_secret')
    }
  })
})
