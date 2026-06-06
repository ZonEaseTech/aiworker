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
      '--host',
      '127.0.0.1',
      '--port',
      '4321',
      '--web-static-dir',
      '/tmp/host-web-dist',
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
        webStaticDir: '/tmp/host-web-dist',
      },
    })
    expect(calls[1].type).toBe('serve')
    expect(calls[1].options.hostname).toBe('127.0.0.1')
    expect(calls[1].options.port).toBe(4321)
    expect(JSON.parse(output)).toEqual({
      host: '127.0.0.1',
      listening: true,
      port: 4321,
      publicBaseUrl: 'https://aiworker.zonease.org',
      webStaticDir: '/tmp/host-web-dist',
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

  it('accepts browser and control base URL options on serve', async () => {
    const calls: any[] = []
    const code = await runHostCli([
      'serve',
      '--db',
      '/tmp/aiworker-host.db',
      '--public-base-url',
      'https://aiworker.zonease.org',
      '--browser-base-url',
      'https://host.zonease.app',
      '--control-base-url',
      'https://control.zonease.app',
      '--host',
      '127.0.0.1',
      '--port',
      '4321',
      '--web-static-dir',
      '/tmp/host-web-dist',
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
        hostBrowserBaseUrl: 'https://host.zonease.app',
        hostControlBaseUrl: 'https://control.zonease.app',
        publicBaseUrl: 'https://aiworker.zonease.org',
        webStaticDir: '/tmp/host-web-dist',
      },
    })
    expect(calls[1]).toEqual({
      type: 'serve',
      options: {
        hostname: '127.0.0.1',
        port: 4321,
        fetch: expect.any(Function),
      },
    })
    expect(JSON.parse(output).publicBaseUrl).toBe('https://aiworker.zonease.org')
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
      const landing = await fetch(`${apiUrl}/host`).then(response => response.text())
      expect(landing).toContain('Host API is running')
      expect(landing).toContain('http://127.0.0.1:5050/host')

      await new Promise(resolve => setTimeout(resolve, 1000))
      expect(child.exitCode).toBeNull()
      const secondLanding = await fetch(`${apiUrl}/host`).then(response => response.text())
      expect(secondLanding).toContain('Host API is running')
    }
    finally {
      child.kill('SIGTERM')
      await child.exited.catch(() => undefined)
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('starts Host dev lifecycle through the Host CLI start command', async () => {
    const calls: Array<{ input: Record<string, unknown>, method: string }> = []
    const hostLifecycle = {
      async start(input: Record<string, unknown>) {
        calls.push({ input, method: 'start' })
        return {
          apiUrl: 'http://127.0.0.1:9117',
          mode: input.mode,
          webUrl: 'http://127.0.0.1:5050/host',
        }
      },
    }

    const code = await runHostCli([
      'start',
      '--dev',
      '--host',
      '127.0.0.1',
      '--port',
      '9117',
      '--web-port',
      '5050',
      '--db',
      '/tmp/host.db',
      '--dev-admin-email',
      'admin@zonease.org',
    ], { hostLifecycle } as any)

    expect(code).toBe(0)
    expect(calls).toEqual([{
      input: {
        dbPath: '/tmp/host.db',
        devAdminEmail: 'admin@zonease.org',
        host: '127.0.0.1',
        mode: 'dev',
        port: 9117,
        webPort: 5050,
      },
      method: 'start',
    }])
    expect(JSON.parse(output)).toEqual({
      apiUrl: 'http://127.0.0.1:9117',
      mode: 'dev',
      webUrl: 'http://127.0.0.1:5050/host',
    })
  })

  it('starts Host production lifecycle as a background Host daemon with static Web', async () => {
    const calls: Array<{ input: Record<string, unknown>, method: string }> = []
    const hostLifecycle = {
      async start(input: Record<string, unknown>) {
        calls.push({ input, method: 'start' })
        return {
          apiUrl: 'https://aiworker.zonease.org',
          mode: input.mode,
          webUrl: 'https://aiworker.zonease.org/host',
        }
      },
    }

    const code = await runHostCli([
      'start',
      '--host',
      '0.0.0.0',
      '--port',
      '9117',
      '--db',
      '/srv/aiworker/host.db',
      '--public-base-url',
      'https://aiworker.zonease.org',
      '--web-static-dir',
      '/srv/aiworker/host-web/dist',
    ], { hostLifecycle } as any)

    expect(code).toBe(0)
    expect(calls).toEqual([{
      input: {
        dbPath: '/srv/aiworker/host.db',
        host: '0.0.0.0',
        mode: 'prod',
        port: 9117,
        publicBaseUrl: 'https://aiworker.zonease.org',
        webStaticDir: '/srv/aiworker/host-web/dist',
      },
      method: 'start',
    }])
    expect(JSON.parse(output)).toEqual({
      apiUrl: 'https://aiworker.zonease.org',
      mode: 'prod',
      webUrl: 'https://aiworker.zonease.org/host',
    })
  })

  it('accepts browser and control base URL options on start and keeps public-base-url behavior', async () => {
    const calls: Array<{ input: Record<string, unknown>, method: string }> = []
    const hostLifecycle = {
      async start(input: Record<string, unknown>) {
        calls.push({ input, method: 'start' })
        return {
          apiUrl: 'https://aiworker.zonease.org',
          mode: input.mode,
          webUrl: 'https://aiworker.zonease.org/host',
        }
      },
    }

    const code = await runHostCli([
      'start',
      '--host',
      '0.0.0.0',
      '--port',
      '9117',
      '--db',
      '/srv/aiworker/host.db',
      '--public-base-url',
      'https://aiworker.zonease.org',
      '--browser-base-url',
      'https://host.zonease.app',
      '--control-base-url',
      'https://control.zonease.app',
      '--web-static-dir',
      '/srv/aiworker/host-web/dist',
    ], { hostLifecycle } as any)

    expect(code).toBe(0)
    expect(calls).toEqual([{
      input: {
        dbPath: '/srv/aiworker/host.db',
        host: '0.0.0.0',
        mode: 'prod',
        port: 9117,
        publicBaseUrl: 'https://aiworker.zonease.org',
        webStaticDir: '/srv/aiworker/host-web/dist',
      },
      method: 'start',
    }])
    expect(JSON.parse(output)).toEqual({
      apiUrl: 'https://aiworker.zonease.org',
      mode: 'prod',
      webUrl: 'https://aiworker.zonease.org/host',
    })
  })

  it('routes Host daemon start through the same product startup lifecycle as top-level start', async () => {
    const calls: Array<{ input: Record<string, unknown>, method: string }> = []
    const hostLifecycle = {
      async start(input: Record<string, unknown>) {
        calls.push({ input, method: 'start' })
        return {
          apiUrl: 'https://aiworker.zonease.org',
          daemon: { pid: 1234, running: true, started: true },
          mode: input.mode,
          webUrl: 'https://aiworker.zonease.org/host',
        }
      },
    }

    const code = await runHostCli([
      'daemon',
      'start',
      '--host',
      '0.0.0.0',
      '--port',
      '9117',
      '--db',
      '/srv/aiworker/host.db',
      '--public-base-url',
      'https://aiworker.zonease.org',
      '--web-static-dir',
      '/srv/aiworker/host-web/dist',
    ], { hostLifecycle } as any)

    expect(code).toBe(0)
    expect(calls).toEqual([{
      input: {
        dbPath: '/srv/aiworker/host.db',
        host: '0.0.0.0',
        mode: 'prod',
        port: 9117,
        publicBaseUrl: 'https://aiworker.zonease.org',
        webStaticDir: '/srv/aiworker/host-web/dist',
      },
      method: 'start',
    }])
    expect(JSON.parse(output)).toEqual({
      apiUrl: 'https://aiworker.zonease.org',
      daemon: { pid: 1234, running: true, started: true },
      mode: 'prod',
      webUrl: 'https://aiworker.zonease.org/host',
    })
  })

  it('routes Host daemon foreground to the foreground lifecycle without spawning a background process', async () => {
    const calls: Array<{ input: Record<string, unknown>, method: string }> = []
    const hostLifecycle = {
      async foreground(input: Record<string, unknown>) {
        calls.push({ input, method: 'foreground' })
        return {
          apiUrl: 'https://aiworker.zonease.org',
          foreground: true,
          mode: input.mode,
          webUrl: 'https://aiworker.zonease.org/host',
        }
      },
    }

    const code = await runHostCli([
      'daemon',
      'foreground',
      '--host',
      '0.0.0.0',
      '--port',
      '9117',
      '--db',
      '/srv/aiworker/host.db',
      '--public-base-url',
      'https://aiworker.zonease.org',
      '--web-static-dir',
      '/srv/aiworker/host-web/dist',
    ], { hostLifecycle } as any)

    expect(code).toBe(0)
    expect(calls).toEqual([{
      input: {
        dbPath: '/srv/aiworker/host.db',
        host: '0.0.0.0',
        mode: 'prod',
        port: 9117,
        publicBaseUrl: 'https://aiworker.zonease.org',
        webStaticDir: '/srv/aiworker/host-web/dist',
      },
      method: 'foreground',
    }])
    expect(JSON.parse(output)).toEqual({
      apiUrl: 'https://aiworker.zonease.org',
      foreground: true,
      mode: 'prod',
      webUrl: 'https://aiworker.zonease.org/host',
    })
  })

  it('routes Host restart aliases through the daemon lifecycle', async () => {
    const calls: Array<{ input: Record<string, unknown>, method: string }> = []
    const hostLifecycle = {
      async restart(input: Record<string, unknown>) {
        calls.push({ input, method: 'restart' })
        return {
          restarted: true,
          started: { apiUrl: 'http://127.0.0.1:9117', webUrl: 'http://127.0.0.1:9117/host' },
        }
      },
    }

    expect(await runHostCli(['restart', '--host', '127.0.0.1', '--port', '9117'], { hostLifecycle } as any)).toBe(0)
    expect(JSON.parse(output)).toEqual({
      restarted: true,
      started: { apiUrl: 'http://127.0.0.1:9117', webUrl: 'http://127.0.0.1:9117/host' },
    })

    output = ''
    expect(await runHostCli(['daemon', 'restart', '--host', '127.0.0.1', '--port', '9117'], { hostLifecycle } as any)).toBe(0)
    expect(JSON.parse(output)).toEqual({
      restarted: true,
      started: { apiUrl: 'http://127.0.0.1:9117', webUrl: 'http://127.0.0.1:9117/host' },
    })

    expect(calls).toEqual([
      { input: { dbPath: `${process.env.HOME ?? '.'}/.aiworker-dev/host.db`, host: '127.0.0.1', mode: 'prod', port: 9117 }, method: 'restart' },
      { input: { dbPath: `${process.env.HOME ?? '.'}/.aiworker-dev/host.db`, host: '127.0.0.1', mode: 'prod', port: 9117 }, method: 'restart' },
    ])
  })

  it('exposes Host lifecycle status stop clean and logs as first-class CLI commands', async () => {
    const calls: Array<{ input: Record<string, unknown>, method: string }> = []
    const hostLifecycle = {
      async clean(input: Record<string, unknown>) {
        calls.push({ input, method: 'clean' })
        return { cleaned: true, manifestPath: '/tmp/dev-host.json' }
      },
      async logs(input: Record<string, unknown>) {
        calls.push({ input, method: 'logs' })
        return 'host api log\n'
      },
      async status(input: Record<string, unknown>) {
        calls.push({ input, method: 'status' })
        return { api: { reachable: true }, profile: 'host' }
      },
      async stop(input: Record<string, unknown>) {
        calls.push({ input, method: 'stop' })
        return { stopped: true }
      },
    }

    expect(await runHostCli(['status'], { hostLifecycle } as any)).toBe(0)
    expect(JSON.parse(output)).toEqual({ api: { reachable: true }, profile: 'host' })

    output = ''
    expect(await runHostCli(['logs', '--service', 'api', '--tail', '5'], { hostLifecycle } as any)).toBe(0)
    expect(output).toBe('host api log\n')

    output = ''
    expect(await runHostCli(['stop'], { hostLifecycle } as any)).toBe(0)
    expect(JSON.parse(output)).toEqual({ stopped: true })

    output = ''
    expect(await runHostCli(['clean'], { hostLifecycle } as any)).toBe(0)
    expect(JSON.parse(output)).toEqual({ cleaned: true, manifestPath: '/tmp/dev-host.json' })

    expect(calls).toEqual([
      { input: { manifestPath: undefined }, method: 'status' },
      { input: { manifestPath: undefined, service: 'api', tail: 5 }, method: 'logs' },
      { input: { manifestPath: undefined }, method: 'stop' },
      { input: { manifestPath: undefined }, method: 'clean' },
    ])
  })

  it('exposes Host daemon status stop clean and logs as explicit daemon commands', async () => {
    const calls: Array<{ input: Record<string, unknown>, method: string }> = []
    const hostLifecycle = {
      async clean(input: Record<string, unknown>) {
        calls.push({ input, method: 'clean' })
        return { cleaned: true, manifestPath: '/tmp/dev-host.json' }
      },
      async logs(input: Record<string, unknown>) {
        calls.push({ input, method: 'logs' })
        return 'host daemon log\n'
      },
      async status(input: Record<string, unknown>) {
        calls.push({ input, method: 'status' })
        return { daemon: { running: true }, profile: 'host' }
      },
      async stop(input: Record<string, unknown>) {
        calls.push({ input, method: 'stop' })
        return { stopped: true }
      },
    }

    expect(await runHostCli(['daemon', 'status'], { hostLifecycle } as any)).toBe(0)
    expect(JSON.parse(output)).toEqual({ daemon: { running: true }, profile: 'host' })

    output = ''
    expect(await runHostCli(['daemon', 'logs', '--service', 'host-daemon', '--tail', '7'], { hostLifecycle } as any)).toBe(0)
    expect(output).toBe('host daemon log\n')

    output = ''
    expect(await runHostCli(['daemon', 'stop'], { hostLifecycle } as any)).toBe(0)
    expect(JSON.parse(output)).toEqual({ stopped: true })

    output = ''
    expect(await runHostCli(['daemon', 'clean'], { hostLifecycle } as any)).toBe(0)
    expect(JSON.parse(output)).toEqual({ cleaned: true, manifestPath: '/tmp/dev-host.json' })

    expect(calls).toEqual([
      { input: { manifestPath: undefined }, method: 'status' },
      { input: { manifestPath: undefined, service: 'host-daemon', tail: 7 }, method: 'logs' },
      { input: { manifestPath: undefined }, method: 'stop' },
      { input: { manifestPath: undefined }, method: 'clean' },
    ])
  })

  it('creates an assignment through the Host API', async () => {
    const requests: Request[] = []
    let fetchBody: unknown
    const code = await runHostCli([
      'assignment',
      'create',
      '--email',
      'Bob@Zonease.org',
      '--target',
      'docker://local/default',
      '--adapter',
      'docker',
      '--maturity',
      'preview',
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
        fetchBody = await request.json()
        expect(fetchBody).toMatchObject({
          assignedEmail: 'Bob@Zonease.org',
          provisioningTarget: {
            adapterType: 'docker',
            maturity: 'preview',
            ref: 'docker://local/default',
          },
          soulReleaseRef: 'aiworker-freeform@dev',
        })
        return new Response(JSON.stringify({
          assignment: {
            assignedEmail: 'bob@zonease.org',
            assignmentId: 'asn_1',
            soulReleaseRef: 'aiworker-freeform@dev',
            status: 'provisioning',
            workerId: null,
            workbenchUrl: null,
          },
          provisionToken: 'awp_secret',
          provisionCommand: 'bun apps/worker-cli/src/aiworker.ts provision --host http://127.0.0.1:9117 --token <redacted>',
        }), { headers: { 'content-type': 'application/json' }, status: 201 })
      }),
    })

    expect(code).toBe(0)
    expect(requests).toHaveLength(1)
    const parsed = JSON.parse(output)
    expect(parsed.assignment.assignedEmail).toBe('bob@zonease.org')
    expect(parsed.provisionCommand).toContain('--token <redacted>')
    expect(parsed.provisionToken).toBe('awp_secret')
  })

  it('passes callback URL when creating an assignment', async () => {
    let fetchBody: any
    const code = await runHostCli([
      'assignment',
      'create',
      '--email',
      'bob@zonease.org',
      '--target',
      'docker://local/default',
      '--adapter',
      'docker',
      '--maturity',
      'preview',
      '--callback-url',
      'https://host.example.com',
      '--soul',
      'aiworker-freeform@dev',
    ], {
      fetch: testFetch(async (input, init) => {
        const request = new Request(input, init)
        fetchBody = await request.json()
        return new Response(JSON.stringify({
          assignment: {
            assignedEmail: 'bob@zonease.org',
            assignmentId: 'asn_1',
            soulReleaseRef: 'aiworker-freeform@dev',
            status: 'provisioning',
            workerId: null,
            workbenchUrl: null,
          },
          provisionCommand: 'bun aiworker provision --token <redacted>',
          provisionToken: 'awp_secret',
        }), { headers: { 'content-type': 'application/json' }, status: 201 })
      }),
    })

    expect(code).toBe(0)
    expect(fetchBody.adapterRuntimeControlBaseUrl).toBe('https://host.example.com')
  })

  it('projects safe fields from assignment create responses', async () => {
    const code = await runHostCli([
      'assignment',
      'create',
      '--email',
      'bob@zonease.org',
      '--target',
      'srv-1',
      '--adapter',
      'aissh',
      '--maturity',
      'production',
      '--soul',
      'aiworker-freeform@dev',
    ], {
      fetch: testFetch(async () => {
        return new Response(JSON.stringify({
          aisshCommand: 'aissh exec srv-1 "bun aiworker provision --token awp_secret" --reason=test',
          assignment: {
            assignedEmail: 'bob@zonease.org',
            assignmentId: 'asn_1',
            soulReleaseRef: 'aiworker-freeform@dev',
            status: 'provisioning',
            workerId: null,
            workbenchUrl: null,
          },
          deliveryReceipt: {
            command: 'bun aiworker provision --token <redacted>',
          },
          deliveryStatus: 'pending',
          expectedCheckInDeadline: '2026-06-06T12:00:00.000Z',
          ignoredSecret: 'secret',
          operatorHint: 'Run the command on the selected target.',
          provisionCommand: 'bun aiworker provision --token <redacted>',
          provisionToken: 'awp_secret',
        }), { headers: { 'content-type': 'application/json' }, status: 201 })
      }),
    })

    expect(code).toBe(0)
    const parsed = JSON.parse(output)
    expect(parsed.aisshCommand).toBeUndefined()
    expect(parsed.deliveryReceipt.command).toContain('<redacted>')
    expect(parsed.deliveryStatus).toBe('pending')
    expect(parsed.expectedCheckInDeadline).toBe('2026-06-06T12:00:00.000Z')
    expect(parsed.operatorHint).toBe('Run the command on the selected target.')
    expect(parsed.provisionCommand).toContain('<redacted>')
    expect(parsed.provisionToken).toBe('awp_secret')
    expect(parsed.ignoredSecret).toBeUndefined()
  })

  it('projects provisioning targets from option list', async () => {
    const code = await runHostCli(['option', 'list', '--host', 'http://host.test'], {
      fetch: testFetch(async () => new Response(JSON.stringify({
        access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
        auth: { mode: 'dev-static', status: 'deferred-logto' },
        provisioningTargets: [{
          adapterType: 'docker',
          capabilities: ['clean-container'],
          displayName: 'Docker 预发布环境',
          health: 'ready',
          id: 'docker:local-default',
          maturity: 'preview',
          ref: 'docker://local/default',
        }],
        soulReleases: [],
      }), { headers: { 'content-type': 'application/json' } })),
    })

    expect(code).toBe(0)
    const parsed = JSON.parse(output)
    expect(parsed.provisioningTargets[0]).toMatchObject({
      adapterType: 'docker',
      displayName: 'Docker 预发布环境',
      maturity: 'preview',
    })
    expect('servers' in parsed).toBe(false)
  })

  it('lists Host options through the Host API', async () => {
    const code = await runHostCli(['option', 'list', '--host', 'http://127.0.0.1:9117'], {
      fetch: testFetch(async (input, init) => {
        const request = new Request(input, init)
        expect(request.method).toBe('GET')
        expect(request.url).toBe('http://127.0.0.1:9117/api/host/options')
        return new Response(JSON.stringify({
          access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
          auth: { mode: 'dev-static', status: 'deferred-logto' },
          provisioningTargetSourceError: 'no remote env',
          provisioningTargets: [{
            id: 'aissh:srv-1',
            adapterType: 'aissh',
            capabilities: ['remote-delivery', 'worker-check-in', 'worker-access'],
            description: 'from new backend',
            displayName: 'aiwork',
            health: 'ready',
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
        }), { headers: { 'content-type': 'application/json' } })
      }),
    })

    expect(code).toBe(0)
    const parsed = JSON.parse(output)
    expect(parsed.provisioningTargets[0].id).toBe('aissh:srv-1')
    expect(parsed.provisioningTargetSourceError).toBe('no remote env')
    expect(parsed.soulReleases[0].releaseRef).toBe('aiworker-freeform@dev')
    expect(output).not.toContain('secret')
    expect('servers' in parsed).toBe(false)
  })

  it('maps old Host option shape servers into compatibility provisioning targets', async () => {
    const code = await runHostCli(['option', 'list', '--host', 'http://127.0.0.1:9117'], {
      fetch: testFetch(async (input, init) => {
        const request = new Request(input, init)
        expect(request.method).toBe('GET')
        expect(request.url).toBe('http://127.0.0.1:9117/api/host/options')
        return new Response(JSON.stringify({
          access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
          auth: { mode: 'dev-static', status: 'deferred-logto' },
          servers: [{ id: 'srv-1', name: 'aiwork', notes: 'aiwork project', source: 'aissh', token: 'secret' }],
          soulReleases: [{
            descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json',
            id: 'aiworker-freeform',
            name: 'AIWorker Freeform',
            releaseRef: 'aiworker-freeform@dev',
            source: 'official',
          }],
        }), { headers: { 'content-type': 'application/json' } })
      }),
    })

    expect(code).toBe(0)
    const parsed = JSON.parse(output)
    expect(parsed.provisioningTargets).toEqual([{
      adapterType: 'aissh',
      capabilities: ['remote-delivery', 'worker-check-in', 'worker-access'],
      description: 'aiwork project',
      displayName: 'aiwork',
      health: 'ready',
      id: 'aissh:srv-1',
      maturity: 'production',
      ref: 'srv-1',
    }])
    expect('servers' in parsed).toBe(false)
    expect(output).not.toContain('secret')
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
      '--target',
      'aissh://server/ap-sg-01',
      '--adapter',
      'aissh',
      '--maturity',
      'production',
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
