import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { withDevSamplingCatalogEnv } from './worker-create-catalog-view'

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

export interface WorkerDaemonIdentity {
  metadataPid: null | number
  metadataPort: null | number
  pid: null | number
}

interface CleanDependencies {
  env?: { AIWORKER_DEV_FLEET_PURGE?: string }
  home?: string
  log?: (message: string) => void
  removePath?: (path: string, options: { force?: boolean, recursive?: boolean }) => void
  runCli?: (args: string[], options?: { allowFailure?: boolean }) => CommandResult
  runCommand?: (command: string, args: string[], options?: { allowFailure?: boolean }) => CommandResult
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

interface DaemonHealthBody {
  workers?: Array<{
    appId?: unknown
    id?: unknown
    status?: unknown
  }>
}

interface VerifyViteDependencies {
  log?: (message: string) => void
  restartVite?: (entry: DevFleetEntry, host: string) => void
  waitForHttpOk?: (url: string) => Promise<Response>
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

export function fleetWorkerCommandArgs(command: 'start' | 'stop'): string[][] {
  return DEV_FLEET_TOPOLOGY.map(entry => [command, entry.workerId])
}

export function devFleetWorkerCreateArgs(entry: DevFleetEntry): string[] {
  return [
    'worker',
    'create',
    entry.workerId,
    '--app',
    entry.appId,
    '--name',
    entry.soulName,
    '--port',
    String(entry.apiPort),
  ]
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

export function workerDaemonEnvFile(): string {
  return join(repoRoot(), 'packages/worker-daemon/.env')
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

function cli(args: string[], options: { allowFailure?: boolean, env?: Record<string, string | undefined> } = {}): CommandResult {
  return run('bun', [`--env-file=${workerDaemonEnvFile()}`, 'apps/worker-cli/src/aiworker.ts', ...args], {
    allowFailure: options.allowFailure,
    cwd: repoRoot(),
    env: {
      AIWORKER_HOME: aiworkerHome(),
      WORKER_DB_PATH: undefined,
      ...options.env,
    },
  })
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

export function resolveHarnessHost(env: { AIWORKER_HOST?: string }): string {
  const host = env.AIWORKER_HOST?.trim() || '127.0.0.1'
  if (!/^[a-z0-9.-]+$/i.test(host))
    throw new Error(`invalid AIWORKER_HOST: ${host}`)
  return host
}

export function shouldRejectStartupPort(
  input: { kind: 'api', listening: boolean, expectedHealthy: boolean } | { kind: 'vite', listening: boolean },
): boolean {
  if (!input.listening)
    return false
  if (input.kind === 'api')
    return !input.expectedHealthy
  return true
}

export function parseListenerPid(processLine: null | string): null | number {
  const match = processLine?.match(/^\S+\s+(\d+)\b/)
  if (!match)
    return null
  const pid = Number.parseInt(match[1], 10)
  return Number.isFinite(pid) ? pid : null
}

export function shouldRejectApiPortReuse(input: {
  expectedPort: number
  healthMatchesExpected: boolean
  listenerProcess: null | string
  listening: boolean
  workerDaemon: WorkerDaemonIdentity
}): boolean {
  if (!input.listening)
    return false
  if (!input.healthMatchesExpected)
    return true

  const listenerPid = parseListenerPid(input.listenerProcess)
  return listenerPid === null
    || input.workerDaemon.pid === null
    || input.workerDaemon.metadataPid === null
    || input.workerDaemon.metadataPort !== input.expectedPort
    || input.workerDaemon.pid !== listenerPid
    || input.workerDaemon.metadataPid !== listenerPid
}

export function shouldPurgeHome(env: { AIWORKER_DEV_FLEET_PURGE?: string }): boolean {
  return env.AIWORKER_DEV_FLEET_PURGE === '1'
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
    const body = await response.json().catch(() => null) as DaemonHealthBody | null
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

export function assertExpectedHealth(input: {
  expectedAppId: string
  expectedWorkerId: string
  health: DaemonHealthBody
  url: string
}): void {
  const active = input.health.workers?.find(worker => worker.status === 'active') ?? input.health.workers?.[0]
  const id = typeof active?.id === 'string' ? active.id : '<missing>'
  const appId = typeof active?.appId === 'string' ? active.appId : '<missing>'
  if (id !== input.expectedWorkerId || appId !== input.expectedAppId) {
    throw new Error(
      `${input.url} returned worker ${id}/${appId}, expected ${input.expectedWorkerId}/${input.expectedAppId}`,
    )
  }
}

function requireTmux(): void {
  run('tmux', ['-V'])
}

function assertVitePortAvailable(port: number): void {
  const status = listenerForPort(port)
  if (!shouldRejectStartupPort({ kind: 'vite', listening: status.listening }))
    return

  throw new Error(`Vite port ${port} is already in use:\n${status.process ?? formatPortStatus([status])}`)
}

async function assertApiPortReusable(entry: DevFleetEntry, host: string): Promise<void> {
  const port = listenerForPort(entry.apiPort)
  if (!port.listening)
    return

  const url = `http://${host}:${entry.apiPort}/health`
  let healthMatchesExpected = false
  let healthError: unknown = null
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
    if (!response.ok)
      throw new Error(`${response.status} ${response.statusText}`)
    const health = await response.json() as DaemonHealthBody
    assertExpectedHealth({
      expectedAppId: entry.appId,
      expectedWorkerId: entry.workerId,
      health,
      url,
    })
    healthMatchesExpected = true
  }
  catch (error) {
    healthError = error
  }

  const workerDaemon = readWorkerDaemonIdentity(aiworkerHome(), entry.workerId)
  if (shouldRejectApiPortReuse({
    expectedPort: entry.apiPort,
    healthMatchesExpected,
    listenerProcess: port.process,
    listening: true,
    workerDaemon,
  })) {
    const listenerPid = parseListenerPid(port.process)
    const reason = healthMatchesExpected
      ? `listener is not the current AIWORKER_HOME worker daemon (listenerPid=${listenerPid ?? 'unknown'}, pidFile=${workerDaemon.pid ?? 'missing'}, metadataPid=${workerDaemon.metadataPid ?? 'missing'}, metadataPort=${workerDaemon.metadataPort ?? 'missing'})`
      : healthError instanceof Error ? healthError.message : String(healthError)
    throw new Error(
      `API port ${entry.apiPort} is already in use but is not the expected current fleet daemon:\n${port.process ?? formatPortStatus([port])}\n${reason}`,
    )
  }
}

function readNumberFile(path: string): null | number {
  try {
    const value = Number.parseInt(readFileSync(path, 'utf8'), 10)
    return Number.isFinite(value) ? value : null
  }
  catch {
    return null
  }
}

function readWorkerDaemonIdentity(home: string, workerId: string): WorkerDaemonIdentity {
  const workerHome = join(home, 'workers', workerId)
  let metadataPid: null | number = null
  let metadataPort: null | number = null
  try {
    const metadata = JSON.parse(readFileSync(join(workerHome, 'aiworker-daemon.json'), 'utf8')) as {
      pid?: unknown
      port?: unknown
    }
    metadataPid = typeof metadata.pid === 'number' && Number.isFinite(metadata.pid) ? metadata.pid : null
    metadataPort = typeof metadata.port === 'number' && Number.isFinite(metadata.port) ? metadata.port : null
  }
  catch {
    // Missing metadata means the fixed port cannot be proven to belong to this home.
  }

  return {
    metadataPid,
    metadataPort,
    pid: readNumberFile(join(workerHome, 'aiworker-daemon.pid')),
  }
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
  cli(devFleetWorkerCreateArgs(entry), { env: withDevSamplingCatalogEnv() })
}

function killHarnessTmuxSessions(): void {
  for (const entry of DEV_FLEET_TOPOLOGY)
    run('tmux', ['kill-session', '-t', entry.tmuxSession], { allowFailure: true })
}

function assertVitePortsAvailable(): void {
  for (const entry of DEV_FLEET_TOPOLOGY)
    assertVitePortAvailable(entry.vitePort)
}

async function assertApiPortsReusable(host: string): Promise<void> {
  for (const entry of DEV_FLEET_TOPOLOGY)
    await assertApiPortReusable(entry, host)
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
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
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
  const health = await response.json() as DaemonHealthBody
  assertExpectedHealth({
    expectedAppId: entry.appId,
    expectedWorkerId: entry.workerId,
    health,
    url,
  })
}

export async function verifyViteWithRestart(
  entry: DevFleetEntry,
  host: string,
  deps: VerifyViteDependencies = {},
): Promise<void> {
  const url = `http://${host}:${entry.vitePort}/`
  const wait = deps.waitForHttpOk ?? waitForHttpOk
  try {
    await wait(url)
    return
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const log = deps.log ?? console.log
    const restartVite = deps.restartVite ?? restartTmuxVite
    log(
      `[dev:fleet-web] Vite readiness failed for ${entry.appId} on ${entry.vitePort}; restarting ${entry.tmuxSession} once: ${message}`,
    )
    restartVite(entry, host)
  }

  await wait(url)
}

async function start(): Promise<void> {
  const host = resolveHarnessHost(process.env)
  const home = aiworkerHome()
  mkdirSync(home, { recursive: true })
  requireTmux()
  killHarnessTmuxSessions()
  assertVitePortsAvailable()
  await assertApiPortsReusable(host)

  console.log(`[dev:fleet-web] AIWORKER_HOME=${home}`)
  cli(['app', 'bootstrap', 'official'])
  for (const entry of DEV_FLEET_TOPOLOGY)
    ensureWorker(entry)

  for (const args of fleetWorkerCommandArgs('start'))
    cli(args)

  for (const entry of DEV_FLEET_TOPOLOGY)
    restartTmuxVite(entry, host)

  for (const entry of DEV_FLEET_TOPOLOGY) {
    await verifyDaemon(entry, host)
    await verifyViteWithRestart(entry, host)
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

function formatDaemonStatus(worker: FleetWorkerStatus): string {
  return `${worker.id}: app=${worker.app} running=${worker.running} health=${worker.healthOk ? 'ok' : 'not-ok'} status=${worker.healthStatus ?? 'n/a'} url=${worker.url}`
}

async function status(): Promise<void> {
  const home = aiworkerHome()
  const host = resolveHarnessHost(process.env)
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

export function stop(deps: CleanDependencies = {}): void {
  const home = deps.home ?? aiworkerHome()
  const log = deps.log ?? console.log
  const runCommand = deps.runCommand ?? run
  const runCli = deps.runCli ?? cli

  for (const entry of DEV_FLEET_TOPOLOGY)
    runCommand('tmux', ['kill-session', '-t', entry.tmuxSession], { allowFailure: true })

  for (const args of fleetWorkerCommandArgs('stop')) {
    const stopResult = runCli(args, { allowFailure: true })
    const label = args.join(' ')
    if (stopResult.status !== 0) {
      log(`[dev:fleet-web:clean] aiworker ${label} exited with status ${stopResult.status}`)
      if (stopResult.stdout.trim())
        log(`[dev:fleet-web:clean] aiworker ${label} stdout:\n${stopResult.stdout.trim()}`)
      if (stopResult.stderr.trim())
        log(`[dev:fleet-web:clean] aiworker ${label} stderr:\n${stopResult.stderr.trim()}`)
    }
  }
  log(`[dev:fleet-web:stop] stopped fleet services for AIWORKER_HOME=${home}`)
}

export function clean(deps: CleanDependencies = {}): void {
  const home = deps.home ?? aiworkerHome()
  const env = deps.env ?? process.env
  const log = deps.log ?? console.log
  const removePath = deps.removePath ?? rmSync

  stop(deps)

  removePath(manifestPath(home), { force: true })

  if (shouldPurgeHome(env)) {
    removePath(home, { force: true, recursive: true })
    log(`[dev:fleet-web:clean] purged AIWORKER_HOME=${home}`)
    return
  }

  log(`[dev:fleet-web:clean] kept AIWORKER_HOME=${home}`)
}

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
  if (mode === 'stop') {
    stop()
    return
  }
  if (mode !== 'clean') {
    throw new Error(`unsupported dev fleet web command: ${mode}`)
  }

  clean()
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
