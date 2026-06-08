# Dev Fleet Web Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repeatable dev/test harness that starts five daemon-per-worker instances and five tmux-hosted Vite Workbench origins, one per official Soul.

**Architecture:** Add one Bun TypeScript script, `scripts/dev-fleet-web.ts`, with pure exported topology/manifest helpers plus side-effecting `start`, `status`, and `clean` subcommands. Unit tests lock the topology, manifest shape, package scripts, and worker-app mismatch behavior; live verification covers tmux, daemon health, and Vite HTTP readiness.

**Tech Stack:** Bun TypeScript scripts, `bun test`, tmux, existing `apps/worker-cli/src/aiworker.ts`, existing `apps/worker-web` Vite dev server.

---

## File Structure

- Create: `scripts/dev-fleet-web.ts`
  - Owns the five-Soul topology, manifest creation, tmux session lifecycle, CLI subprocess calls, port checks, health checks, status printing, and cleanup.
  - Uses `import.meta.main` so tests can import pure helpers without starting services.
- Create: `scripts/dev-fleet-web.test.ts`
  - Locks topology, manifest shape, package script registration, and worker app mismatch validation.
  - Does not spawn tmux or daemon processes.
- Modify: `package.json`
  - Adds `dev:fleet-web`, `dev:fleet-web:status`, and `dev:fleet-web:clean`.

## Task 1: Topology, Manifest, And Package Script Contracts

**Files:**
- Create: `scripts/dev-fleet-web.test.ts`
- Create: `scripts/dev-fleet-web.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for topology, manifest shape, and package scripts**

Create `scripts/dev-fleet-web.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  DEV_FLEET_TOPOLOGY,
  buildManifest,
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test scripts/dev-fleet-web.test.ts
```

Expected: FAIL because `scripts/dev-fleet-web.ts` does not exist and package scripts are not registered.

- [ ] **Step 3: Add the minimal exported topology helpers**

Create `scripts/dev-fleet-web.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface DevFleetEntry {
  apiPort: number
  appId: string
  soulName: string
  tmuxSession: string
  vitePort: number
  workerId: string
}

export interface DevFleetManifest {
  generatedAt: string
  home: string
  workers: Array<{
    apiUrl: string
    soul: string
    tmuxSession: string
    webUrl: string
    workerId: string
  }>
}

export const DEV_FLEET_TOPOLOGY: readonly DevFleetEntry[] = [
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
] as const

export function buildManifest(input: { generatedAt: string, home: string, host: string }): DevFleetManifest {
  return {
    generatedAt: input.generatedAt,
    home: input.home,
    workers: DEV_FLEET_TOPOLOGY.map(entry => ({
      apiUrl: `http://${input.host}:${entry.apiPort}`,
      soul: entry.appId,
      tmuxSession: entry.tmuxSession,
      webUrl: `http://${input.host}:${entry.vitePort}`,
      workerId: entry.workerId,
    })),
  }
}

export function validateWorkerApp(input: { expectedAppId: string, row: { appId?: unknown, id?: unknown } }): void {
  const actualId = typeof input.row.id === 'string' ? input.row.id : '<unknown>'
  const actualAppId = typeof input.row.appId === 'string' ? input.row.appId : '<unknown>'
  if (actualAppId !== input.expectedAppId)
    throw new Error(`worker id ${actualId} already exists for app ${actualAppId}, expected ${input.expectedAppId}`)
}

function repoRoot(): string {
  return resolve(import.meta.dir, '..')
}

function aiworkerHome(): string {
  return process.env.AIWORKER_HOME || join(process.env.HOME || '.', '.aiworker-dev')
}

function manifestPath(home = aiworkerHome()): string {
  return join(home, 'dev-fleet-web.json')
}

async function main(): Promise<void> {
  const mode = process.argv[2] || 'start'
  if (mode !== 'start' && mode !== 'status' && mode !== 'clean')
    throw new Error(`unsupported dev fleet web command: ${mode}`)
  throw new Error(`dev fleet web ${mode} command is unavailable in this incremental skeleton`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
```

The imports include files used by later tasks. `bun test` may flag unused imports through lint later; Task 4 will consume them before final lint.

- [ ] **Step 4: Register package scripts**

Modify root `package.json` scripts block:

```json
"dev:fleet-web": "bun scripts/dev-fleet-web.ts start",
"dev:fleet-web:status": "bun scripts/dev-fleet-web.ts status",
"dev:fleet-web:clean": "bun scripts/dev-fleet-web.ts clean",
```

Insert them after `dev:clean`.

- [ ] **Step 5: Run the focused test**

Run:

```bash
bun test scripts/dev-fleet-web.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add package.json scripts/dev-fleet-web.ts scripts/dev-fleet-web.test.ts
git commit -m "test(dev): 锁 fleet web harness 拓扑"
```

## Task 2: Command Runner, Port Checks, And Read-Only Status

**Files:**
- Modify: `scripts/dev-fleet-web.ts`
- Modify: `scripts/dev-fleet-web.test.ts`

- [ ] **Step 1: Add tests for status helpers**

Append to `scripts/dev-fleet-web.test.ts`:

```ts
import {
  formatPortStatus,
  parseFleetStatus,
} from './dev-fleet-web'

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
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
bun test scripts/dev-fleet-web.test.ts
```

Expected: FAIL because `formatPortStatus` and `parseFleetStatus` are not exported.

- [ ] **Step 3: Implement command and status helpers**

Replace the temporary lower half of `scripts/dev-fleet-web.ts` after `validateWorkerApp` with:

```ts
interface CommandResult {
  stdout: string
  stderr: string
  status: number
}

interface PortStatus {
  listening: boolean
  port: number
  process: null | string
}

interface FleetWorkerStatus {
  app: string
  healthOk: boolean
  healthStatus: null | number
  id: string
  port: number
  running: boolean
  url: string
}

function repoRoot(): string {
  return resolve(import.meta.dir, '..')
}

function aiworkerHome(): string {
  return process.env.AIWORKER_HOME || join(process.env.HOME || '.', '.aiworker-dev')
}

function manifestPath(home = aiworkerHome()): string {
  return join(home, 'dev-fleet-web.json')
}

function run(command: string, args: string[], options: { cwd?: string, env?: Record<string, string | undefined>, allowFailure?: boolean } = {}): CommandResult {
  const result = Bun.spawnSync([command, ...args], {
    cwd: options.cwd ?? repoRoot(),
    env: { ...process.env, ...options.env },
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const stdout = Buffer.from(result.stdout).toString('utf8')
  const stderr = Buffer.from(result.stderr).toString('utf8')
  const status = result.exitCode ?? 1
  if (status !== 0 && !options.allowFailure)
    throw new Error(`${command} ${args.join(' ')} failed (${status})\n${stderr || stdout}`)
  return { stdout, stderr, status }
}

function cli(args: string[], options: { allowFailure?: boolean } = {}): CommandResult {
  return run('bun', ['apps/worker-cli/src/aiworker.ts', ...args], {
    allowFailure: options.allowFailure,
    cwd: repoRoot(),
    env: { AIWORKER_HOME: aiworkerHome() },
  })
}

function hasTmuxSession(session: string): boolean {
  return run('tmux', ['has-session', '-t', session], { allowFailure: true }).status === 0
}

function listenerForPort(port: number): PortStatus {
  const result = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { allowFailure: true })
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean)
  if (result.status !== 0 || lines.length < 2)
    return { listening: false, port, process: null }
  return { listening: true, port, process: lines[1] ?? null }
}

export function formatPortStatus(statuses: PortStatus[]): string {
  return statuses
    .map(status => `${status.port}: ${status.listening ? `listening ${status.process ?? ''}`.trim() : 'none'}`)
    .join('\n')
}

export function parseFleetStatus(text: string): FleetWorkerStatus[] {
  const parsed = JSON.parse(text) as {
    workers?: Array<{
      app?: unknown
      health?: { ok?: unknown, status?: unknown }
      id?: unknown
      port?: unknown
      running?: unknown
      url?: unknown
    }>
  }
  return (parsed.workers ?? []).map(worker => ({
    app: String(worker.app ?? ''),
    healthOk: worker.health?.ok === true,
    healthStatus: typeof worker.health?.status === 'number' ? worker.health.status : null,
    id: String(worker.id ?? ''),
    port: typeof worker.port === 'number' ? worker.port : 0,
    running: worker.running === true,
    url: String(worker.url ?? ''),
  }))
}

async function status(): Promise<void> {
  const home = aiworkerHome()
  console.log(`[dev:fleet-web:status] AIWORKER_HOME=${home}`)

  const fleet = cli(['fleet', 'status'], { allowFailure: true })
  if (fleet.status === 0) {
    console.log('\n[daemon]')
    for (const worker of parseFleetStatus(fleet.stdout)) {
      console.log(`${worker.id}: app=${worker.app} running=${worker.running} health=${worker.healthOk ? 'ok' : 'not-ok'} status=${worker.healthStatus ?? 'n/a'} url=${worker.url}`)
    }
  }
  else {
    console.log('\n[daemon]')
    console.log('fleet status unavailable')
  }

  console.log('\n[tmux]')
  for (const entry of DEV_FLEET_TOPOLOGY)
    console.log(`${entry.tmuxSession}: ${hasTmuxSession(entry.tmuxSession) ? 'running' : 'missing'}`)

  console.log('\n[ports]')
  console.log(formatPortStatus(DEV_FLEET_TOPOLOGY.flatMap(entry => [
    listenerForPort(entry.apiPort),
    listenerForPort(entry.vitePort),
  ])))

  const path = manifestPath(home)
  console.log('\n[manifest]')
  if (existsSync(path))
    console.log(readFileSync(path, 'utf8').trim())
  else
    console.log(`${path}: missing`)
}

async function main(): Promise<void> {
  const mode = process.argv[2] || 'start'
  if (mode === 'status') {
    await status()
    return
  }
  if (mode !== 'start' && mode !== 'clean')
    throw new Error(`unsupported dev fleet web command: ${mode}`)
  throw new Error(`dev fleet web ${mode} command is unavailable in this incremental skeleton`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
bun test scripts/dev-fleet-web.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run read-only status**

Run:

```bash
bun run dev:fleet-web:status
```

Expected: prints status sections and exits 0. It may report missing manifest/tmux sessions before start exists.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add scripts/dev-fleet-web.ts scripts/dev-fleet-web.test.ts
git commit -m "feat(dev): 添加 fleet web harness status"
```

## Task 3: Start Command

**Files:**
- Modify: `scripts/dev-fleet-web.ts`

- [ ] **Step 1: Add failing test for startup validation helpers**

Append to `scripts/dev-fleet-web.test.ts`:

```ts
import {
  assertExpectedHealth,
} from './dev-fleet-web'

describe('dev fleet web health validation', () => {
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
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test scripts/dev-fleet-web.test.ts
```

Expected: FAIL because `assertExpectedHealth` is not exported.

- [ ] **Step 3: Implement start helpers and `assertExpectedHealth`**

Add to `scripts/dev-fleet-web.ts` above `status()`:

```ts
export function assertExpectedHealth(input: {
  expectedAppId: string
  expectedWorkerId: string
  health: { workers?: Array<{ appId?: unknown, id?: unknown, status?: unknown }> }
  url: string
}): void {
  const active = input.health.workers?.[0]
  const id = typeof active?.id === 'string' ? active.id : '<missing>'
  const appId = typeof active?.appId === 'string' ? active.appId : '<missing>'
  if (id !== input.expectedWorkerId || appId !== input.expectedAppId) {
    throw new Error(`${input.url} returned worker ${id}/${appId}, expected ${input.expectedWorkerId}/${input.expectedAppId}`)
  }
}

function requireTmux(): void {
  run('tmux', ['-V'])
}

function assertPortFree(port: number): void {
  const status = listenerForPort(port)
  if (status.listening)
    throw new Error(`port ${port} is already in use:\n${status.process}`)
}

function readWorkerRow(workerId: string): null | { appId?: unknown, id?: unknown } {
  const result = cli(['worker', 'show', workerId])
  const parsed = JSON.parse(result.stdout) as { worker?: null | { appId?: unknown, id?: unknown } }
  return parsed.worker ?? null
}

function ensureWorker(entry: DevFleetEntry): void {
  const existing = readWorkerRow(entry.workerId)
  if (existing) {
    validateWorkerApp({ expectedAppId: entry.appId, row: existing })
    console.log(`[dev:fleet-web] reuse worker ${entry.workerId} (${entry.appId})`)
    return
  }
  console.log(`[dev:fleet-web] create worker ${entry.workerId} (${entry.appId})`)
  cli(['worker', 'create', entry.workerId, '--app', entry.appId, '--name', entry.soulName])
}

function restartTmuxVite(entry: DevFleetEntry, host: string): void {
  run('tmux', ['kill-session', '-t', entry.tmuxSession], { allowFailure: true })
  run('tmux', [
    'new-session',
    '-d',
    '-s',
    entry.tmuxSession,
    '-c',
    join(repoRoot(), 'apps/worker-web'),
    `AIWORKER_API_URL=http://${host}:${entry.apiPort} bun run dev --host ${host} --port ${entry.vitePort} --strictPort`,
  ])
}

async function waitForHttpOk(url: string, attempts = 60): Promise<Response> {
  let lastError: unknown = null
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url)
      if (response.ok)
        return response
      lastError = `${response.status} ${response.statusText}`
    }
    catch (error) {
      lastError = error
    }
    await Bun.sleep(500)
  }
  throw new Error(`timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function verifyDaemon(entry: DevFleetEntry, host: string): Promise<void> {
  const url = `http://${host}:${entry.apiPort}/health`
  const response = await waitForHttpOk(url)
  const health = await response.json() as { workers?: Array<{ appId?: unknown, id?: unknown, status?: unknown }> }
  assertExpectedHealth({
    expectedAppId: entry.appId,
    expectedWorkerId: entry.workerId,
    health,
    url,
  })
}

async function verifyVite(entry: DevFleetEntry, host: string): Promise<void> {
  await waitForHttpOk(`http://${host}:${entry.vitePort}/`)
}
```

- [ ] **Step 4: Implement `start()`**

Add below the helpers:

```ts
async function start(): Promise<void> {
  const host = process.env.AIWORKER_HOST || '127.0.0.1'
  const home = aiworkerHome()
  mkdirSync(home, { recursive: true })
  requireTmux()

  for (const entry of DEV_FLEET_TOPOLOGY) {
    assertPortFree(entry.apiPort)
    assertPortFree(entry.vitePort)
  }

  console.log(`[dev:fleet-web] AIWORKER_HOME=${home}`)
  cli(['app', 'bootstrap', 'official'])
  for (const entry of DEV_FLEET_TOPOLOGY)
    ensureWorker(entry)

  cli(['start', '--all'])

  for (const entry of DEV_FLEET_TOPOLOGY)
    restartTmuxVite(entry, host)

  for (const entry of DEV_FLEET_TOPOLOGY) {
    await verifyDaemon(entry, host)
    await verifyVite(entry, host)
  }

  const manifest = buildManifest({
    generatedAt: new Date().toISOString(),
    home,
    host,
  })
  writeFileSync(manifestPath(home), `${JSON.stringify(manifest, null, 2)}\n`)

  console.log('\nSoul                 Worker                    API                       Web')
  for (const worker of manifest.workers) {
    console.log(`${worker.soul.padEnd(20)} ${worker.workerId.padEnd(25)} ${worker.apiUrl.padEnd(25)} ${worker.webUrl}`)
  }

  console.log('\n[dev:fleet-web] tmux attach example: tmux attach -t aiworker-vite-freeform')
}
```

Modify `main()`:

```ts
async function main(): Promise<void> {
  const mode = process.argv[2] || 'start'
  if (mode === 'start') {
    await start()
    return
  }
  if (mode === 'status') {
    await status()
    return
  }
  if (mode !== 'clean')
    throw new Error(`unsupported dev fleet web command: ${mode}`)
  throw new Error(`dev fleet web ${mode} command is unavailable in this incremental skeleton`)
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun test scripts/dev-fleet-web.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run live start verification**

Run:

```bash
bun run dev:fleet-web
```

Expected:

- Creates/reuses 5 workers.
- Starts daemons on `9217-9221`.
- Starts tmux sessions.
- Writes `$AIWORKER_HOME/dev-fleet-web.json`.
- Prints the port table.

- [ ] **Step 7: Verify live endpoints**

Run:

```bash
for port in 9217 9218 9219 9220 9221; do curl -fsS "http://127.0.0.1:${port}/health"; echo; done
for port in 5173 5174 5175 5176 5177; do curl -fsSI "http://127.0.0.1:${port}/" | sed -n '1p'; done
```

Expected:

- Each daemon health response has `"status":"ok"` and the expected active worker.
- Each Vite origin prints `HTTP/1.1 200 OK`.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git add scripts/dev-fleet-web.ts scripts/dev-fleet-web.test.ts
git commit -m "feat(dev): 启动 1 对 1 fleet web harness"
```

## Task 4: Clean Command

**Files:**
- Modify: `scripts/dev-fleet-web.ts`

- [ ] **Step 1: Add tests for purge decision**

Append to `scripts/dev-fleet-web.test.ts`:

```ts
import {
  shouldPurgeHome,
} from './dev-fleet-web'

describe('dev fleet web clean safety', () => {
  it('does not purge AIWORKER_HOME unless explicitly requested', () => {
    expect(shouldPurgeHome({ AIWORKER_DEV_FLEET_PURGE: undefined })).toBe(false)
    expect(shouldPurgeHome({ AIWORKER_DEV_FLEET_PURGE: '0' })).toBe(false)
    expect(shouldPurgeHome({ AIWORKER_DEV_FLEET_PURGE: '1' })).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test scripts/dev-fleet-web.test.ts
```

Expected: FAIL because `shouldPurgeHome` is not exported.

- [ ] **Step 3: Implement clean helpers**

Add above `main()`:

```ts
export function shouldPurgeHome(env: { AIWORKER_DEV_FLEET_PURGE?: string }): boolean {
  return env.AIWORKER_DEV_FLEET_PURGE === '1'
}

async function clean(): Promise<void> {
  const home = aiworkerHome()
  for (const entry of DEV_FLEET_TOPOLOGY)
    run('tmux', ['kill-session', '-t', entry.tmuxSession], { allowFailure: true })

  cli(['stop', '--all'], { allowFailure: true })
  rmSync(manifestPath(home), { force: true })

  if (shouldPurgeHome(process.env)) {
    rmSync(home, { force: true, recursive: true })
    console.log(`[dev:fleet-web:clean] purged ${home}`)
  }
  else {
    console.log(`[dev:fleet-web:clean] stopped services and kept ${home}`)
  }
}
```

Modify `main()`:

```ts
async function main(): Promise<void> {
  const mode = process.argv[2] || 'start'
  if (mode === 'start') {
    await start()
    return
  }
  if (mode === 'status') {
    await status()
    return
  }
  if (mode === 'clean') {
    await clean()
    return
  }
  throw new Error(`unsupported dev fleet web command: ${mode}`)
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
bun test scripts/dev-fleet-web.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run live clean verification**

Run:

```bash
bun run dev:fleet-web:clean
bun run dev:fleet-web:status
```

Expected:

- tmux sessions are missing.
- `9217-9221` and `5173-5177` are not listening.
- `$AIWORKER_HOME` still exists.
- `$AIWORKER_HOME/dev-fleet-web.json` is missing.

- [ ] **Step 6: Verify purge mode with disposable home**

Run:

```bash
AIWORKER_HOME="$(mktemp -d)" bun run dev:fleet-web
AIWORKER_DEV_FLEET_PURGE=1 AIWORKER_HOME="$AIWORKER_HOME" bun run dev:fleet-web:clean
test ! -e "$AIWORKER_HOME"
```

Expected: final `test ! -e "$AIWORKER_HOME"` exits 0. If the shell assignment is inconvenient, set a named temporary path before running:

```bash
TMP_AIWORKER_HOME="$(mktemp -d)"
AIWORKER_HOME="$TMP_AIWORKER_HOME" bun run dev:fleet-web
AIWORKER_DEV_FLEET_PURGE=1 AIWORKER_HOME="$TMP_AIWORKER_HOME" bun run dev:fleet-web:clean
test ! -e "$TMP_AIWORKER_HOME"
```

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add scripts/dev-fleet-web.ts scripts/dev-fleet-web.test.ts
git commit -m "feat(dev): 清理 fleet web harness"
```

## Task 5: Final Verification And Review

**Files:**
- Verify: `scripts/dev-fleet-web.ts`
- Verify: `scripts/dev-fleet-web.test.ts`
- Verify: `package.json`

- [ ] **Step 1: Run unit tests**

Run:

```bash
bun test scripts/dev-fleet-web.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run canonical focused contracts for script registration**

Run:

```bash
bun run test:contracts
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript/package checks for touched script surface**

Run:

```bash
bun run typecheck
```

Expected: PASS. If this is too broad and unrelated failures appear, record the failures and run:

```bash
bun run --filter '@zonease/aiworker-worker-web' typecheck
bun run --filter '@zonease/aiworker-cli' typecheck
```

Expected: PASS for the packages touched by live commands. The root typecheck result must be reported honestly.

- [ ] **Step 4: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS. This catches unused imports in `scripts/dev-fleet-web.ts`.

- [ ] **Step 5: Run live harness acceptance**

Run:

```bash
bun run dev:fleet-web
bun run dev:fleet-web:status
for port in 9217 9218 9219 9220 9221; do curl -fsS "http://127.0.0.1:${port}/health" >/dev/null; done
for port in 5173 5174 5175 5176 5177; do curl -fsSI "http://127.0.0.1:${port}/" >/dev/null; done
test -s "${AIWORKER_HOME:-$HOME/.aiworker-dev}/dev-fleet-web.json"
bun run dev:fleet-web:clean
```

Expected:

- Start exits 0.
- Status exits 0.
- All curl checks exit 0.
- Manifest file exists before clean.
- Clean exits 0.

- [ ] **Step 6: Run code-review-graph**

Run:

```bash
bun run crg:review
```

Expected: no P0/P1 findings. Address actionable findings before final.

- [ ] **Step 7: Final commit**

If Task 5 changed files, commit:

```bash
git add package.json scripts/dev-fleet-web.ts scripts/dev-fleet-web.test.ts
git commit -m "chore(dev): 验证 fleet web harness"
```

If Task 5 changed no files, do not create an empty commit.
