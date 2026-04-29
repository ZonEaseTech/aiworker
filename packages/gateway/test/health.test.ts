import type { GatewayConfig } from '../src/config'
import type { GatewayContext } from '../src/router/context'

import { describe, expect, it } from 'bun:test'

import { startGatewayServer } from '../src/server'

function testConfig(): GatewayConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    fleetDbPath: ':memory:',
    canLaunch: false,
    enrollOtpTtlSec: 300,
    nodeEnv: 'test',
    supervisor: {
      dockerHost: '/var/run/docker.sock',
      network: 'aiworker_test',
      launchBaseUrlTemplate: 'http://{containerName}:9217',
    },
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
})
