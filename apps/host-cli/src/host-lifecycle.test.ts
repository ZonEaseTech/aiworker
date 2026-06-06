import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

import { createHostLifecycle } from './host-lifecycle'

describe('Host lifecycle', () => {
  it('starts production Host API and static Web as one detached serve process', async () => {
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
        manifestPath,
        mode: 'prod',
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
    }
    finally {
      await lifecycle.clean({ manifestPath })
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
