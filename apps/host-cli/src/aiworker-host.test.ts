import { Buffer } from 'node:buffer'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { createWorkerRegistry } from '@zonease/aiworker-host-control'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { runHostCli } from './aiworker-host'

describe('aiworker-host control CLI', () => {
  const originalWrite = process.stdout.write
  let output = ''

  function testFetch(impl: (...args: Parameters<typeof fetch>) => Promise<Response>): typeof fetch {
    return Object.assign(impl, { preconnect: (() => {}) as typeof fetch.preconnect }) as typeof fetch
  }

  beforeEach(() => {
    output = ''
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as typeof process.stdout.write
  })

  afterEach(() => {
    process.stdout.write = originalWrite
  })

  function reservePort(): number {
    const probe = Bun.serve({
      fetch: () => new Response('ok'),
      hostname: '127.0.0.1',
      port: 0,
    })
    const port = probe.port
    probe.stop(true)
    if (!port)
      throw new Error('Failed to reserve a Host CLI test port')
    return port
  }

  async function waitForHostApiOrExit(url: string, child: ReturnType<typeof Bun.spawn>): Promise<'exited' | 'ready'> {
    let exited = false
    child.exited.then(() => {
      exited = true
    }).catch(() => {
      exited = true
    })

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (exited)
        return 'exited'
      try {
        const response = await fetch(url)
        if (response.ok)
          return 'ready'
      }
      catch {
        // Server may still be starting.
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return exited ? 'exited' : 'ready'
  }

  it('lists workers from the injected host-control registry', async () => {
    const registry = createWorkerRegistry()
    registry.register({ workerId: 'w1', id: 'aiworker-freeform', endpoint: 'http://127.0.0.1:9217', health: { ready: true } })
    const code = await runHostCli(['worker', 'list'], { registry })
    expect(code).toBe(0)
    const parsed = JSON.parse(output) as { workers: { workerId: string }[] }
    expect(parsed.workers.map(worker => worker.workerId)).toEqual(['w1'])
  })

  it('returns an empty worker list by default (in-memory registry, no persistence)', async () => {
    const code = await runHostCli(['worker', 'list'])
    expect(code).toBe(0)
    const parsed = JSON.parse(output) as { workers: unknown[] }
    expect(parsed.workers).toEqual([])
  })

  it('returns exit code 1 on an unknown command', async () => {
    const code = await runHostCli(['nope'])
    expect(code).toBe(1)
  })

  it('serves with no admin user by default', async () => {
    const calls: any[] = []
    const code = await runHostCli([
      'serve',
      '--db',
      '/tmp/aiworker-host.db',
      '--public-base-url',
      'https://aiworker.zonease.org',
      '--port',
      '4321',
    ], {
      async serverFactory(options) {
        calls.push({ type: 'factory', options })
        return {
          async fetch() {
            return new Response('ok')
          },
        }
      },
      bunServe(options) {
        calls.push({ type: 'serve', options })
        return {} as ReturnType<typeof Bun.serve>
      },
    })

    expect(code).toBe(0)
    expect(calls[0]).toEqual({
      type: 'factory',
      options: {
        authUser: null,
        dbPath: '/tmp/aiworker-host.db',
        publicBaseUrl: 'https://aiworker.zonease.org',
      },
    })
    expect(calls[1].type).toBe('serve')
    expect(calls[1].options.port).toBe(4321)
    expect(JSON.parse(output)).toEqual({
      listening: true,
      port: 4321,
      publicBaseUrl: 'https://aiworker.zonease.org',
    })
  })

  it('serves with an explicit dev admin user when requested', async () => {
    const calls: any[] = []
    const code = await runHostCli([
      'serve',
      '--db',
      '/tmp/aiworker-host.db',
      '--dev-admin-email',
      'admin@example.com',
    ], {
      async serverFactory(options) {
        calls.push({ type: 'factory', options })
        return {
          async fetch() {
            return new Response('ok')
          },
        }
      },
      bunServe(options) {
        calls.push({ type: 'serve', options })
        return {} as ReturnType<typeof Bun.serve>
      },
    })

    expect(code).toBe(0)
    expect(calls[0].options.authUser).toEqual({
      email: 'admin@example.com',
      roles: ['host:admin'],
      subject: 'dev-admin',
    })
  })

  it('keeps the foreground serve command running and reachable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-host-cli-serve-'))
    const port = reservePort()
    const apiUrl = `http://127.0.0.1:${port}`
    const child = Bun.spawn({
      cmd: [
        process.execPath,
        'apps/host-cli/src/aiworker-host.ts',
        'serve',
        '--db',
        join(dir, 'host.db'),
        '--dev-admin-email',
        'admin@example.com',
        '--public-base-url',
        apiUrl,
        '--port',
        String(port),
      ],
      cwd: join(import.meta.dir, '..', '..', '..'),
      stderr: 'pipe',
      stdout: 'pipe',
    })

    try {
      await expect(waitForHostApiOrExit(`${apiUrl}/host`, child)).resolves.toBe('ready')
      expect(await fetch(`${apiUrl}/host`).then(response => response.text())).toBe('AIWorker Host')
    }
    finally {
      child.kill('SIGTERM')
      await child.exited.catch(() => undefined)
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('creates an assignment through the Host API', async () => {
    const requests: Request[] = []
    const code = await runHostCli([
      'assignment',
      'create',
      '--email',
      'Bob@Zonease.org',
      '--server',
      'aissh://server/ap-sg-01',
      '--soul',
      'aiworker-freeform@dev',
      '--host',
      'http://127.0.0.1:9117',
    ], {
      fetch: testFetch(async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        expect(request.method).toBe('POST')
        expect(request.url).toBe('http://127.0.0.1:9117/api/host/assignments')
        expect(await request.json()).toEqual({
          assignedEmail: 'Bob@Zonease.org',
          serverRef: 'aissh://server/ap-sg-01',
          soulReleaseRef: 'aiworker-freeform@dev',
        })
        return new Response(JSON.stringify({
          assignment: {
            assignedEmail: 'bob@zonease.org',
            assignmentId: 'asn_1',
            serverRef: 'aissh://server/ap-sg-01',
            soulReleaseRef: 'aiworker-freeform@dev',
            status: 'provisioning',
            workerId: null,
            workbenchUrl: null,
          },
          provisionToken: 'awp_secret',
          provisionCommand: 'bun apps/worker-cli/src/aiworker.ts provision --host http://127.0.0.1:9117 --token awp_secret',
        }), { headers: { 'content-type': 'application/json' }, status: 201 })
      }),
    })

    expect(code).toBe(0)
    expect(requests).toHaveLength(1)
    const parsed = JSON.parse(output)
    expect(parsed.assignment.assignedEmail).toBe('bob@zonease.org')
    expect(parsed.provisionCommand).toContain('--token awp_secret')
    expect(output).not.toContain('"provisionToken"')
  })

  it('lists assignments through the Host API without printing tokens', async () => {
    const code = await runHostCli([
      'assignment',
      'list',
      '--host',
      'http://127.0.0.1:9117',
    ], {
      fetch: testFetch(async (input, init) => {
        const request = new Request(input, init)
        expect(request.method).toBe('GET')
        expect(request.url).toBe('http://127.0.0.1:9117/api/host/assignments')
        return new Response(JSON.stringify({
          assignments: [{
            assignedEmail: 'bob@zonease.org',
            assignmentId: 'asn_1',
            serverRef: 'aissh://server/ap-sg-01',
            soulReleaseRef: 'aiworker-freeform@dev',
            status: 'checked_in',
            workerId: 'wkr_82',
            workbenchUrl: null,
            provisionCommand: 'bun apps/worker-cli/src/aiworker.ts provision --host http://127.0.0.1:9117 --token awp_secret',
            provisionToken: 'awp_secret',
            provisionTokenHash: 'hash_secret',
          }],
        }), { headers: { 'content-type': 'application/json' } })
      }),
    })

    expect(code).toBe(0)
    expect(output).toContain('bob@zonease.org')
    expect(output).not.toContain('awp_')
    expect(output).not.toContain('provisionCommand')
    expect(output).not.toContain('provisionToken')
    expect(output).not.toContain('provisionTokenHash')
  })

  it('returns exit code 1 when assignment create receives a Host API error', async () => {
    const code = await runHostCli([
      'assignment',
      'create',
      '--email',
      'bad',
      '--server',
      'aissh://server/ap-sg-01',
      '--soul',
      'aiworker-freeform@dev',
    ], {
      fetch: testFetch(async () => {
        return new Response(JSON.stringify({ error: { code: 'INVALID_ASSIGNMENT_REQUEST' } }), {
          headers: { 'content-type': 'application/json' },
          status: 400,
        })
      }),
    })

    expect(code).toBe(1)
  })

  it('returns exit code 1 when assignment list receives a non-JSON success response', async () => {
    const code = await runHostCli(['assignment', 'list'], {
      fetch: testFetch(async () => {
        return new Response('ok', {
          headers: { 'content-type': 'text/plain' },
          status: 200,
        })
      }),
    })

    expect(code).toBe(1)
    expect(output).toBe('')
  })
})
