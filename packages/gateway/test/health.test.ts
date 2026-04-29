import type { GatewayConfig } from '../src/config'
import type { GatewayContext } from '../src/router/context'

import { describe, expect, it } from 'bun:test'

import { startGatewayServer } from '../src/server'

function testConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    adminExternalAuthAcknowledged: false,
    fleetDbPath: ':memory:',
    canLaunch: false,
    enrollOtpTtlSec: 300,
    nodeEnv: 'test',
    supervisor: {
      dockerHost: '/var/run/docker.sock',
      network: 'aiworker_test',
      launchBaseUrlTemplate: 'http://{containerName}:9217',
    },
    ...overrides,
  }
}

function testContext(): GatewayContext {
  return {
    forwards: { dispose: () => {} },
  } as unknown as GatewayContext
}

describe('gateway /health', () => {
  it('serves GET and rejects POST with Allow: GET', async () => {
    const started = startGatewayServer({ config: testConfig(), context: testContext() })
    try {
      const base = `http://127.0.0.1:${started.port}/health`
      const get = await fetch(base)
      expect(get.status).toBe(200)
      expect(await get.json()).toMatchObject({ ok: true, service: 'aiworker-gateway' })

      const post = await fetch(base, { method: 'POST' })
      expect(post.status).toBe(405)
      expect(post.headers.get('Allow')).toBe('GET')
      expect(await post.text()).toBe('method not allowed')
    }
    finally {
      await started.stop()
    }
  })

  it('refuses public fleet admin serving without external-auth acknowledgement', () => {
    expect(() => {
      startGatewayServer({
        config: testConfig({
          host: '0.0.0.0',
          internalSharedSecret: 'shared-secret-1234567890',
        }),
        context: {
          ...testContext(),
          webStaticDir: '/tmp/aiworker-web-static-test',
        },
      })
    }).toThrow(/AIWORKER_ADMIN_EXTERNAL_AUTH=1/)
  })

  it('refuses public worker bridge without external-auth acknowledgement', () => {
    expect(() => {
      startGatewayServer({
        config: testConfig({
          host: '0.0.0.0',
          internalSharedSecret: 'shared-secret-1234567890',
        }),
        context: testContext(),
      })
    }).toThrow(/\/w\/\*/)
  })

  it('allows public fleet admin serving with external-auth acknowledgement', async () => {
    const started = startGatewayServer({
      config: testConfig({
        host: '0.0.0.0',
        internalSharedSecret: 'shared-secret-1234567890',
        adminExternalAuthAcknowledged: true,
      }),
      context: {
        ...testContext(),
        webStaticDir: '/tmp/aiworker-web-static-test',
      },
    })
    try {
      expect(started.port).toBeGreaterThan(0)
    }
    finally {
      await started.stop()
    }
  })
})
