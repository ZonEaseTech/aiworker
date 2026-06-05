import { Buffer } from 'node:buffer'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

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

interface CommandResult {
  stderr: string
  stdout: string
  status: number
}

interface PortStatus {
  listening: boolean
  port: number
  process: null | string
}

interface DaemonHealthProbe {
  appId: null | string
  ok: boolean
  status: null | number
  workerId: null | string
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

export function validateWorkerApp(input: {
  expectedAppId: string
  row: {
    appId: string
    id: string
  }
}): void {
  if (input.row.appId !== input.expectedAppId) {
    throw new Error(
      `worker id ${input.row.id} already exists for app ${input.row.appId}, expected ${input.expectedAppId}`,
    )
  }
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

function run(
  command: string,
  args: string[],
  options: { allowFailure?: boolean, cwd?: string, env?: Record<string, string | undefined> } = {},
): CommandResult {
  const result = Bun.spawnSync([command, ...args], {
    cwd: options.cwd ?? repoRoot(),
    env: { ...process.env, ...options.env },
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const stderr = Buffer.from(result.stderr).toString('utf8')
  const stdout = Buffer.from(result.stdout).toString('utf8')
  const status = result.exitCode ?? 1
  if (status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed (${status})\n${stderr || stdout}`)
  }

  return { stderr, stdout, status }
}

function hasTmuxSession(session: string): boolean {
  return run('tmux', ['has-session', '-t', session], { allowFailure: true }).status === 0
}

function listenerForPort(port: number): PortStatus {
  const result = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { allowFailure: true })
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean)
  if (result.status !== 0 || lines.length < 2) {
    return { listening: false, port, process: null }
  }

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

export function summarizeDaemonHealth(input: {
  entry: DevFleetEntry
  health: DaemonHealthProbe | null
  port: PortStatus
  url: string
}): FleetWorkerStatus {
  const activeWorkerId = input.health?.workerId ?? input.entry.workerId
  const activeAppId = input.health?.appId ?? input.entry.appId
  return {
    app: activeAppId,
    healthOk: input.port.listening
      && input.health?.ok === true
      && activeWorkerId === input.entry.workerId
      && activeAppId === input.entry.appId,
    healthStatus: input.health?.status ?? null,
    id: activeWorkerId,
    port: input.entry.apiPort,
    running: input.port.listening,
    url: input.url,
  }
}

async function fetchDaemonHealth(url: string): Promise<DaemonHealthProbe> {
  try {
    const response = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(1000),
    })
    const body = await response.json().catch(() => null) as null | {
      workers?: Array<{
        appId?: unknown
        id?: unknown
        status?: unknown
      }>
    }
    const activeWorker = body?.workers?.find(worker => worker.status === 'active') ?? body?.workers?.[0]
    return {
      appId: typeof activeWorker?.appId === 'string' ? activeWorker.appId : null,
      ok: response.ok,
      status: response.status,
      workerId: typeof activeWorker?.id === 'string' ? activeWorker.id : null,
    }
  }
  catch {
    return {
      appId: null,
      ok: false,
      status: null,
      workerId: null,
    }
  }
}

function formatDaemonStatus(worker: FleetWorkerStatus): string {
  return `${worker.id}: app=${worker.app} running=${worker.running} health=${worker.healthOk ? 'ok' : 'not-ok'} status=${worker.healthStatus ?? 'n/a'} url=${worker.url}`
}

async function status(): Promise<void> {
  const home = aiworkerHome()
  const host = '127.0.0.1'
  console.log(`[dev:fleet-web:status] AIWORKER_HOME=${home}`)

  console.log('\n[daemon]')
  for (const entry of DEV_FLEET_TOPOLOGY) {
    const url = `http://${host}:${entry.apiPort}`
    const port = listenerForPort(entry.apiPort)
    const health = port.listening ? await fetchDaemonHealth(url) : null
    console.log(formatDaemonStatus(summarizeDaemonHealth({ entry, health, port, url })))
  }

  console.log('\n[tmux]')
  for (const entry of DEV_FLEET_TOPOLOGY) {
    console.log(`${entry.tmuxSession}: ${hasTmuxSession(entry.tmuxSession) ? 'running' : 'missing'}`)
  }

  console.log('\n[ports]')
  console.log(formatPortStatus(DEV_FLEET_TOPOLOGY.flatMap(entry => [
    listenerForPort(entry.apiPort),
    listenerForPort(entry.vitePort),
  ])))

  const path = manifestPath(home)
  console.log('\n[manifest]')
  if (existsSync(path)) {
    console.log(readFileSync(path, 'utf8').trim())
  }
  else {
    console.log(`${path}: missing`)
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] || 'start'
  if (mode === 'status') {
    await status()
    return
  }
  if (mode !== 'start' && mode !== 'clean') {
    throw new Error(`unsupported dev fleet web command: ${mode}`)
  }

  throw new Error(`dev fleet web ${mode} command is unavailable in this incremental skeleton`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
