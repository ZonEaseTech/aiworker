import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

import { createHostLifecycle } from './host-lifecycle'

describe('Host lifecycle', () => {
  it('starts production Host API and static Web as a background Host daemon', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-host-lifecycle-'))
    const port = reservePort()
    const baseUrl = `http://127.0.0.1:${port}`
    const webStaticDir = join(dir, 'web')
    const manifestPath = join(dir, 'dev-host.json')
    mkdirSync(webStaticDir, { recursive: true })
    writeFileSync(join(webStaticDir, 'index.html'), '<!doctype html><div id="root">host lifecycle shell</div>')

    const lifecycle = createHostLifecycle()
    try {
      const started = await lifecycle.start({
        dbPath: join(dir, 'host.db'),
        host: '127.0.0.1',
        manifestPath,
        mode: 'prod',
        port,
        publicBaseUrl: baseUrl,
        webStaticDir,
      })

      expect(started).toMatchObject({
        apiUrl: baseUrl,
        daemon: { running: true, started: true },
        manifestPath,
        mode: 'prod',
        services: [
          { kind: 'host-daemon', port },
        ],
        webUrl: `${baseUrl}/host`,
      })

      const hostHtml = await fetch(`${baseUrl}/host`).then(response => response.text())
      expect(hostHtml).toContain('host lifecycle shell')

      const status = await lifecycle.status({ manifestPath })
      expect(status).toMatchObject({
        api: { reachable: true, url: baseUrl },
        mode: 'prod',
        profile: 'host',
        running: true,
        web: { reachable: true, url: `${baseUrl}/host` },
      })
      await waitForFileToContain(join(dir, 'host-daemon.log'), `"manifestPath": "${manifestPath}"`)
      const logs = await lifecycle.logs({ manifestPath, service: 'host-daemon', tail: 40 })
      expect(logs).toContain(`"manifestPath": "${manifestPath}"`)
    }
    finally {
      await lifecycle.clean({ manifestPath })
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('runs Host daemon foreground as the same API and static Web service in the current process', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-host-foreground-'))
    const port = reservePort()
    const baseUrl = `http://127.0.0.1:${port}`
    const webStaticDir = join(dir, 'web')
    const manifestPath = join(dir, 'dev-host.json')
    mkdirSync(webStaticDir, { recursive: true })
    writeFileSync(join(webStaticDir, 'index.html'), '<!doctype html><div id="root">host daemon foreground</div>')

    const lifecycle = createHostLifecycle()
    try {
      const started = await lifecycle.foreground({
        dbPath: join(dir, 'host.db'),
        host: '127.0.0.1',
        manifestPath,
        mode: 'prod',
        port,
        publicBaseUrl: baseUrl,
        webStaticDir,
      })

      expect(started).toMatchObject({
        apiUrl: baseUrl,
        daemon: { running: true, started: false },
        foreground: true,
        manifestPath,
        mode: 'prod',
        services: [
          { kind: 'host-daemon', port },
        ],
        webUrl: `${baseUrl}/host`,
      })
      const hostHtml = await fetch(`${baseUrl}/host`).then(response => response.text())
      expect(hostHtml).toContain('host daemon foreground')
    }
    finally {
      await lifecycle.clean({ manifestPath })
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('uses session auth instead of static dev admin authority in foreground server creation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-host-foreground-session-auth-'))
    const port = reservePort()
    const baseUrl = `http://127.0.0.1:${port}`
    const manifestPath = join(dir, 'dev-host.json')

    const lifecycle = createHostLifecycle()
    try {
      await lifecycle.foreground({
        dbPath: join(dir, 'host.db'),
        devAdminEmail: 'admin@zonease.org',
        host: '127.0.0.1',
        manifestPath,
        mode: 'dev',
        port,
        publicBaseUrl: baseUrl,
        sessionAuth: {
          oidc: {
            clientId: 'logto-client-id',
            clientSecret: 'literal-client-secret-value',
            endpoint: 'https://auth.zonease.org/',
            issuer: 'https://auth.zonease.org/oidc',
            redirectUri: `${baseUrl}/auth/callback`,
          },
          sessionSecret: 'literal-session-secret-value-1234567890',
        },
      })

      const response = await fetch(`${baseUrl}/api/host/options`)
      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toEqual({ error: { code: 'FORBIDDEN' } })
    }
    finally {
      await lifecycle.clean({ manifestPath })
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('propagates session auth into the background Host daemon before serving /host', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-host-background-session-auth-'))
    const port = reservePort()
    const baseUrl = `http://127.0.0.1:${port}`
    const webStaticDir = join(dir, 'web')
    const manifestPath = join(dir, 'dev-host.json')
    const previousEnv = captureLogtoSessionEnv()
    mkdirSync(webStaticDir, { recursive: true })
    writeFileSync(join(webStaticDir, 'index.html'), '<!doctype html><div id="root">host background session auth</div>')
    clearLogtoSessionEnv()

    const lifecycle = createHostLifecycle()
    try {
      const started = await lifecycle.start({
        dbPath: join(dir, 'host.db'),
        devAdminEmail: 'admin@zonease.org',
        host: '127.0.0.1',
        manifestPath,
        mode: 'prod',
        port,
        publicBaseUrl: baseUrl,
        sessionAuth: {
          oidc: {
            clientId: 'logto-client-id',
            clientSecret: 'literal-client-secret-value',
            endpoint: 'https://auth.zonease.org/',
            issuer: 'https://auth.zonease.org/oidc',
            redirectUri: `${baseUrl}/auth/callback`,
          },
          sessionSecret: 'literal-session-secret-value-1234567890',
        },
        webStaticDir,
      })

      expect(started).toMatchObject({
        apiUrl: baseUrl,
        daemon: { running: true, started: true },
        manifestPath,
        mode: 'prod',
        webUrl: `${baseUrl}/host`,
      })

      const hostResponse = await fetch(`${baseUrl}/host`, { redirect: 'manual' })
      expect(hostResponse.status).toBe(302)
      expect(hostResponse.headers.get('location')).toBe('/auth/login?returnTo=%2Fhost')

      const optionsResponse = await fetch(`${baseUrl}/api/host/options`)
      expect(optionsResponse.status).toBe(403)
      await expect(optionsResponse.json()).resolves.toEqual({ error: { code: 'FORBIDDEN' } })

      const manifestText = readFileSync(manifestPath, 'utf8')
      const logText = await lifecycle.logs({ manifestPath, service: 'host-daemon', tail: 80 })
      expect(manifestText).not.toContain('literal-session-secret-value-1234567890')
      expect(manifestText).not.toContain('literal-client-secret-value')
      expect(logText).not.toContain('literal-session-secret-value-1234567890')
      expect(logText).not.toContain('literal-client-secret-value')
    }
    finally {
      restoreLogtoSessionEnv(previousEnv)
      await lifecycle.clean({ manifestPath })
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('passes the Host websocket handler to foreground Bun.serve', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-host-foreground-websocket-'))
    const webStaticDir = join(dir, 'web')
    const manifestPath = join(dir, 'dev-host.json')
    mkdirSync(webStaticDir, { recursive: true })
    writeFileSync(join(webStaticDir, 'index.html'), '<!doctype html><div id="root">host daemon foreground websocket</div>')
    const originalServe = Bun.serve
    const serveCalls: Parameters<typeof Bun.serve>[] = []
    const mutableBun = Bun as unknown as { serve: typeof Bun.serve }
    mutableBun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
      serveCalls.push([options])
      return {
        port: 19117,
        stop() {},
      } as ReturnType<typeof Bun.serve>
    }) as typeof Bun.serve

    const lifecycle = createHostLifecycle()
    try {
      await lifecycle.foreground({
        dbPath: join(dir, 'host.db'),
        host: '127.0.0.1',
        manifestPath,
        mode: 'prod',
        port: 19117,
        publicBaseUrl: 'http://127.0.0.1:19117',
        webStaticDir,
      })

      expect(serveCalls[0]?.[0].websocket).toBeDefined()
      expect(typeof serveCalls[0]?.[0].fetch).toBe('function')
    }
    finally {
      mutableBun.serve = originalServe
      await lifecycle.clean({ manifestPath })
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('starts development Host daemon as the API service and Host Web in tmux', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-host-dev-lifecycle-'))
    const apiPort = reservePort()
    const webPort = reservePort()
    const apiUrl = `http://127.0.0.1:${apiPort}`
    const webUrl = `http://127.0.0.1:${webPort}/host`
    const manifestPath = join(dir, 'dev-host.json')
    const previousTmuxSession = process.env.AIWORKER_HOST_WEB_TMUX_SESSION
    const tmuxSession = `aiworker-vite-host-test-${Date.now()}`
    process.env.AIWORKER_HOST_WEB_TMUX_SESSION = tmuxSession

    const lifecycle = createHostLifecycle()
    try {
      const started = await lifecycle.start({
        dbPath: join(dir, 'host.db'),
        host: '127.0.0.1',
        manifestPath,
        mode: 'dev',
        port: apiPort,
        publicBaseUrl: apiUrl,
        webPort,
      })

      expect(started).toMatchObject({
        apiUrl,
        manifestPath,
        mode: 'dev',
        services: [
          { kind: 'host-daemon', port: apiPort },
          { kind: 'host-web', port: webPort, tmuxSession },
        ],
        webUrl,
      })

      await new Promise(resolve => setTimeout(resolve, 500))

      const status = await lifecycle.status({ manifestPath })
      expect(status).toMatchObject({
        api: { reachable: true, url: apiUrl },
        mode: 'dev',
        profile: 'host',
        running: true,
        services: [
          { kind: 'host-daemon', port: apiPort, running: true },
          { kind: 'host-web', port: webPort, running: true },
        ],
        web: { reachable: true, url: webUrl },
      })
    }
    finally {
      await lifecycle.clean({ manifestPath })
      if (previousTmuxSession === undefined)
        delete process.env.AIWORKER_HOST_WEB_TMUX_SESSION
      else
        process.env.AIWORKER_HOST_WEB_TMUX_SESSION = previousTmuxSession
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('reads Host service logs through the lifecycle layer with secret redaction', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-host-logs-'))
    const manifestPath = join(dir, 'dev-host.json')
    const logFile = join(dir, 'host-serve.log')
    writeFileSync(logFile, [
      'daemon ready',
      'provision token awp_secret',
      'startup token=sk-host-secret',
      'authorization = "literal-secret-value"',
      '',
    ].join('\n'))
    writeFileSync(manifestPath, JSON.stringify({
      apiUrl: 'http://127.0.0.1:9117',
      db: join(dir, 'host.db'),
      mode: 'prod',
      profile: 'host',
      services: [
        { kind: 'host-serve', logFile, port: 9117 },
      ],
      webUrl: 'http://127.0.0.1:9117/host',
    }))

    try {
      const logs = await createHostLifecycle().logs({ manifestPath, service: 'host-serve', tail: 10 })

      expect(logs).toContain('daemon ready')
      expect(logs).toContain('awp_[REDACTED]')
      expect(logs).toContain('[REDACTED]')
      expect(logs).not.toContain('awp_secret')
      expect(logs).not.toContain('sk-host-secret')
      expect(logs).not.toContain('literal-secret-value')
    }
    finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('treats api logs as Host daemon logs when the manifest uses host-daemon', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-host-daemon-logs-'))
    const manifestPath = join(dir, 'dev-host.json')
    const logFile = join(dir, 'host-daemon.log')
    writeFileSync(logFile, 'host daemon ready\n')
    writeFileSync(manifestPath, JSON.stringify({
      apiUrl: 'http://127.0.0.1:9117',
      db: join(dir, 'host.db'),
      mode: 'dev',
      profile: 'host',
      services: [
        { kind: 'host-daemon', logFile, port: 9117 },
        { kind: 'host-web', port: 5050, tmuxSession: 'aiworker-vite-host' },
      ],
      webUrl: 'http://127.0.0.1:5050/host',
    }))

    try {
      const logs = await createHostLifecycle().logs({ manifestPath, service: 'api', tail: 10 })

      expect(logs).toContain('host daemon ready')
    }
    finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('stops tmux services recorded in a custom Host lifecycle manifest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-host-dev-stop-'))
    const manifestPath = join(dir, 'dev-host.json')
    const apiTmux = `custom-host-api-test-${Date.now()}`
    const webTmux = `custom-host-web-test-${Date.now()}`
    writeFileSync(manifestPath, JSON.stringify({
      apiUrl: 'http://127.0.0.1:19117',
      db: join(dir, 'host.db'),
      mode: 'dev',
      profile: 'host',
      services: [
        { kind: 'host-api', port: 19117, tmuxSession: apiTmux },
        { kind: 'host-web', port: 15050, tmuxSession: webTmux },
      ],
      webUrl: 'http://127.0.0.1:15050/host',
    }))

    createTmuxSession(apiTmux)
    createTmuxSession(webTmux)

    try {
      const stopped = await createHostLifecycle().stop({ manifestPath })

      expect(stopped).toMatchObject({ manifestPath, profile: 'host', stopped: true })
      expect(tmuxSessionExists(apiTmux)).toBe(false)
      expect(tmuxSessionExists(webTmux)).toBe(false)
    }
    finally {
      killTmuxSession(apiTmux)
      killTmuxSession(webTmux)
      rmSync(dir, { force: true, recursive: true })
    }
  })
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
    throw new Error('Failed to reserve a Host lifecycle test port')
  return port
}

const logtoSessionEnvKeys = [
  'AIWORKER_HOST_SESSION_SECRET',
  'LOGTO_CLIENT_ID',
  'LOGTO_CLIENT_SECRET',
  'LOGTO_ENDPOINT',
  'LOGTO_ISSUER',
] as const

function captureLogtoSessionEnv(): Partial<Record<typeof logtoSessionEnvKeys[number], string>> {
  const captured: Partial<Record<typeof logtoSessionEnvKeys[number], string>> = {}
  for (const key of logtoSessionEnvKeys) {
    if (process.env[key] !== undefined)
      captured[key] = process.env[key]
  }
  return captured
}

function clearLogtoSessionEnv(): void {
  for (const key of logtoSessionEnvKeys)
    delete process.env[key]
}

function restoreLogtoSessionEnv(values: Partial<Record<typeof logtoSessionEnvKeys[number], string>>): void {
  clearLogtoSessionEnv()
  for (const key of logtoSessionEnvKeys) {
    if (values[key] !== undefined)
      process.env[key] = values[key]
  }
}

function createTmuxSession(name: string): void {
  const result = Bun.spawnSync({
    cmd: ['tmux', 'new-session', '-d', '-s', name, 'sleep 300'],
    stderr: 'pipe',
    stdout: 'pipe',
  })
  if (result.exitCode !== 0) {
    throw new Error(`failed to create tmux session ${name}: ${new TextDecoder().decode(result.stderr)}`)
  }
}

function killTmuxSession(name: string): void {
  Bun.spawnSync({
    cmd: ['tmux', 'kill-session', '-t', name],
    stderr: 'pipe',
    stdout: 'pipe',
  })
}

function tmuxSessionExists(name: string): boolean {
  return Bun.spawnSync({
    cmd: ['tmux', 'has-session', '-t', name],
    stderr: 'pipe',
    stdout: 'pipe',
  }).exitCode === 0
}

async function waitForFileToContain(filePath: string, expected: string): Promise<void> {
  const deadline = Date.now() + 2_000
  let lastText = ''
  while (Date.now() < deadline) {
    try {
      lastText = readFileSync(filePath, 'utf8')
      if (lastText.includes(expected))
        return
    }
    catch {
      // The foreground child may not have flushed its startup output yet.
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  expect(lastText).toContain(expected)
}
