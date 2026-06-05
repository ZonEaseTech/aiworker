import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

import {
  buildManifest,
  DEV_FLEET_TOPOLOGY,
  validateWorkerApp,
} from './dev-fleet-web'

const repoRoot = import.meta.dir === `${process.cwd()}/scripts`
  ? process.cwd()
  : join(import.meta.dir, '..')

describe('dev fleet web harness contracts', () => {
  it('locks one daemon and one Vite origin per official Soul', () => {
    expect(DEV_FLEET_TOPOLOGY).toEqual([
      {
        apiPort: 9217,
        appId: 'aiworker-freeform',
        soulName: 'AIWorker Freeform',
        tmuxSession: 'aiworker-vite-freeform',
        vitePort: 5173,
        workerId: 'dev-aiworker-freeform',
      },
      {
        apiPort: 9218,
        appId: 'google-ads',
        soulName: '谷歌推广',
        tmuxSession: 'aiworker-vite-google-ads',
        vitePort: 5174,
        workerId: 'dev-google-ads',
      },
      {
        apiPort: 9219,
        appId: 'hr-manager',
        soulName: '人事经理',
        tmuxSession: 'aiworker-vite-hr-manager',
        vitePort: 5175,
        workerId: 'dev-hr-manager',
      },
      {
        apiPort: 9220,
        appId: 'product-manager',
        soulName: '产品经理',
        tmuxSession: 'aiworker-vite-product-manager',
        vitePort: 5176,
        workerId: 'dev-product-manager',
      },
      {
        apiPort: 9221,
        appId: 'software-support',
        soulName: '软件客服',
        tmuxSession: 'aiworker-vite-software-support',
        vitePort: 5177,
        workerId: 'dev-software-support',
      },
    ])
  })

  it('builds the E2E-consumable manifest from the fixed topology', () => {
    const manifest = buildManifest({
      generatedAt: '2026-06-06T00:00:00.000Z',
      home: '/tmp/aiworker-dev',
      host: '127.0.0.1',
    })

    expect(manifest).toEqual({
      generatedAt: '2026-06-06T00:00:00.000Z',
      home: '/tmp/aiworker-dev',
      workers: [
        {
          apiUrl: 'http://127.0.0.1:9217',
          soul: 'aiworker-freeform',
          tmuxSession: 'aiworker-vite-freeform',
          webUrl: 'http://127.0.0.1:5173',
          workerId: 'dev-aiworker-freeform',
        },
        {
          apiUrl: 'http://127.0.0.1:9218',
          soul: 'google-ads',
          tmuxSession: 'aiworker-vite-google-ads',
          webUrl: 'http://127.0.0.1:5174',
          workerId: 'dev-google-ads',
        },
        {
          apiUrl: 'http://127.0.0.1:9219',
          soul: 'hr-manager',
          tmuxSession: 'aiworker-vite-hr-manager',
          webUrl: 'http://127.0.0.1:5175',
          workerId: 'dev-hr-manager',
        },
        {
          apiUrl: 'http://127.0.0.1:9220',
          soul: 'product-manager',
          tmuxSession: 'aiworker-vite-product-manager',
          webUrl: 'http://127.0.0.1:5176',
          workerId: 'dev-product-manager',
        },
        {
          apiUrl: 'http://127.0.0.1:9221',
          soul: 'software-support',
          tmuxSession: 'aiworker-vite-software-support',
          webUrl: 'http://127.0.0.1:5177',
          workerId: 'dev-software-support',
        },
      ],
    })
  })

  it('rejects an existing worker id bound to the wrong Soul app', () => {
    expect(() =>
      validateWorkerApp({
        expectedAppId: 'google-ads',
        row: {
          appId: 'hr-manager',
          id: 'dev-google-ads',
        },
      }),
    ).toThrow('worker id dev-google-ads already exists for app hr-manager, expected google-ads')
  })

  it('registers root package scripts for the harness', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(pkg.scripts?.['dev:fleet-web']).toBe('bun scripts/dev-fleet-web.ts start')
    expect(pkg.scripts?.['dev:fleet-web:status']).toBe('bun scripts/dev-fleet-web.ts status')
    expect(pkg.scripts?.['dev:fleet-web:clean']).toBe('bun scripts/dev-fleet-web.ts clean')
  })
})
