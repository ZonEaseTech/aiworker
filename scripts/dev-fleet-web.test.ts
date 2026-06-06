import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

import {
  assertExpectedHealth,
  buildManifest,
  clean,
  DEV_FLEET_TOPOLOGY,
  fleetWorkerCommandArgs,
  formatPortStatus,
  parseFleetStatus,
  resolveHarnessHost,
  shouldPurgeHome,
  shouldRejectApiPortReuse,
  shouldRejectStartupPort,
  stop,
  summarizeDaemonHealth,
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

  it('starts and stops only the fixed harness workers instead of every fleet worker', () => {
    expect(fleetWorkerCommandArgs('start')).toEqual(DEV_FLEET_TOPOLOGY.map(entry => ['start', entry.workerId]))
    expect(fleetWorkerCommandArgs('stop')).toEqual(DEV_FLEET_TOPOLOGY.map(entry => ['stop', entry.workerId]))
  })
})

describe('dev fleet web status helpers', () => {
  it('formats listener status without mutating runtime state', () => {
    expect(formatPortStatus([
      { listening: true, port: 5173, process: 'node 123 vite' },
      { listening: false, port: 5174, process: null },
    ])).toContain('5173: listening node 123 vite')
    expect(formatPortStatus([
      { listening: true, port: 5173, process: 'node 123 vite' },
      { listening: false, port: 5174, process: null },
    ])).toContain('5174: none')
  })

  it('parses fleet status JSON into app health summaries', () => {
    const parsed = parseFleetStatus(JSON.stringify({
      workers: [
        {
          app: 'google-ads',
          health: { ok: true, status: 200 },
          id: 'dev-google-ads',
          port: 9218,
          running: true,
          url: 'http://127.0.0.1:9218',
        },
      ],
    }))

    expect(parsed).toEqual([
      {
        app: 'google-ads',
        healthOk: true,
        healthStatus: 200,
        id: 'dev-google-ads',
        port: 9218,
        running: true,
        url: 'http://127.0.0.1:9218',
      },
    ])
  })

  it('summarizes daemon health from topology and probes without fleet JSON', () => {
    expect(summarizeDaemonHealth({
      entry: {
        apiPort: 9218,
        appId: 'google-ads',
        soulName: '谷歌推广',
        tmuxSession: 'aiworker-vite-google-ads',
        vitePort: 5174,
        workerId: 'dev-google-ads',
      },
      health: {
        appId: 'google-ads',
        ok: true,
        status: 200,
        workerId: 'dev-google-ads',
      },
      port: { listening: true, port: 9218, process: 'bun 123 aiworker' },
      url: 'http://127.0.0.1:9218',
    })).toEqual({
      app: 'google-ads',
      healthOk: true,
      healthStatus: 200,
      id: 'dev-google-ads',
      port: 9218,
      running: true,
      url: 'http://127.0.0.1:9218',
    })
  })
})

describe('dev fleet web health validation', () => {
  it('validates AIWORKER_HOST before embedding it in tmux commands', () => {
    expect(resolveHarnessHost({ AIWORKER_HOST: undefined })).toBe('127.0.0.1')
    expect(resolveHarnessHost({ AIWORKER_HOST: 'localhost' })).toBe('localhost')
    expect(() => resolveHarnessHost({ AIWORKER_HOST: '127.0.0.1;touch /tmp/x' }))
      .toThrow('invalid AIWORKER_HOST')
  })

  it('rejects daemon health for the wrong active app', () => {
    expect(() =>
      assertExpectedHealth({
        expectedAppId: 'google-ads',
        expectedWorkerId: 'dev-google-ads',
        health: {
          workers: [{ appId: 'hr-manager', id: 'dev-google-ads', status: 'active' }],
        },
        url: 'http://127.0.0.1:9218/health',
      }),
    ).toThrow('http://127.0.0.1:9218/health returned worker dev-google-ads/hr-manager, expected dev-google-ads/google-ads')
  })

  it('allows daemon port reuse but rejects occupied Vite ports before start', () => {
    expect(shouldRejectStartupPort({ expectedHealthy: true, kind: 'api', listening: true })).toBe(false)
    expect(shouldRejectStartupPort({ expectedHealthy: false, kind: 'api', listening: true })).toBe(true)
    expect(shouldRejectStartupPort({ expectedHealthy: false, kind: 'api', listening: false })).toBe(false)
    expect(shouldRejectStartupPort({ kind: 'vite', listening: true })).toBe(true)
    expect(shouldRejectStartupPort({ kind: 'vite', listening: false })).toBe(false)
  })

  it('rejects matching daemon health when the listener is not the current worker daemon process', () => {
    expect(shouldRejectApiPortReuse({
      expectedPort: 9218,
      healthMatchesExpected: true,
      listening: true,
      listenerProcess: 'bun 12345 ben 7u IPv4 TCP 127.0.0.1:9218 (LISTEN)',
      workerDaemon: { metadataPid: 67890, metadataPort: 9218, pid: 67890 },
    })).toBe(true)

    expect(shouldRejectApiPortReuse({
      expectedPort: 9218,
      healthMatchesExpected: true,
      listening: true,
      listenerProcess: 'bun 67890 ben 7u IPv4 TCP 127.0.0.1:9218 (LISTEN)',
      workerDaemon: { metadataPid: 67890, metadataPort: 9218, pid: 67890 },
    })).toBe(false)
  })
})

describe('dev fleet web clean safety', () => {
  it('does not purge AIWORKER_HOME unless explicitly requested', () => {
    expect(shouldPurgeHome({ AIWORKER_DEV_FLEET_PURGE: undefined })).toBe(false)
    expect(shouldPurgeHome({ AIWORKER_DEV_FLEET_PURGE: '0' })).toBe(false)
    expect(shouldPurgeHome({ AIWORKER_DEV_FLEET_PURGE: '1' })).toBe(true)
  })

  it('kills only the fixed harness tmux sessions', () => {
    const commands: Array<{ args: string[], command: string }> = []

    clean({
      home: '/tmp/aiworker-dev',
      log: () => {},
      removePath: () => {},
      runCli: () => ({ stderr: '', stdout: '', status: 0 }),
      runCommand: (command, args) => {
        commands.push({ args, command })
        return { stderr: '', stdout: '', status: 0 }
      },
    })

    expect(commands).toEqual(DEV_FLEET_TOPOLOGY.map(entry => ({
      args: ['kill-session', '-t', entry.tmuxSession],
      command: 'tmux',
    })))
  })

  it('stops fleet services without removing the manifest', () => {
    const commands: Array<{ args: string[], command: string }> = []
    const removed: string[] = []
    const logs: string[] = []

    stop({
      home: '/tmp/aiworker-dev',
      log: message => logs.push(message),
      removePath: path => removed.push(path),
      runCli: () => ({ stderr: '', stdout: '', status: 0 }),
      runCommand: (command, args) => {
        commands.push({ args, command })
        return { stderr: '', stdout: '', status: 0 }
      },
    })

    expect(commands).toEqual(DEV_FLEET_TOPOLOGY.map(entry => ({
      args: ['kill-session', '-t', entry.tmuxSession],
      command: 'tmux',
    })))
    expect(removed).toEqual([])
    expect(logs).toContain('[dev:fleet-web:stop] stopped fleet services for AIWORKER_HOME=/tmp/aiworker-dev')
  })

  it('prints stop failure details before continuing idempotent cleanup', () => {
    const logs: string[] = []

    clean({
      home: '/tmp/aiworker-dev',
      log: message => logs.push(message),
      removePath: () => {},
      runCli: args => args[1] === 'dev-google-ads'
        ? { stderr: 'db locked', stdout: 'partial stop', status: 42 }
        : { stderr: '', stdout: '', status: 0 },
      runCommand: () => ({ stderr: '', stdout: '', status: 0 }),
    })

    expect(logs).toContain('[dev:fleet-web:clean] aiworker stop dev-google-ads exited with status 42')
    expect(logs).toContain('[dev:fleet-web:clean] aiworker stop dev-google-ads stdout:\npartial stop')
    expect(logs).toContain('[dev:fleet-web:clean] aiworker stop dev-google-ads stderr:\ndb locked')
    expect(logs).toContain('[dev:fleet-web:clean] kept AIWORKER_HOME=/tmp/aiworker-dev')
  })

  it('removes only the manifest and keeps home by default', () => {
    const removed: Array<{ options: { force?: boolean, recursive?: boolean }, path: string }> = []

    clean({
      env: { AIWORKER_DEV_FLEET_PURGE: undefined },
      home: '/tmp/aiworker-dev',
      log: () => {},
      removePath: (path, options) => removed.push({ options, path }),
      runCli: () => ({ stderr: '', stdout: '', status: 0 }),
      runCommand: () => ({ stderr: '', stdout: '', status: 0 }),
    })

    expect(removed).toEqual([
      {
        options: { force: true },
        path: '/tmp/aiworker-dev/dev-fleet-web.json',
      },
    ])
  })
})
