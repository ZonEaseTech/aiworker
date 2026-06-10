#!/usr/bin/env bun
// Spec §9 fleet 隔离集成 smoke：源码级（不构建 release bundle），可重复运行。
// 起两个领域 worker（freeform + hr-manager），每个落在独立 home（独立 DB + 端口 +
// daemon 进程），证明 per-worker DB 隔离——各自 /health 的 workers 数组只含自己的
// worker（appId 对得上），互不串味。start/stop --all 干净、幂等。
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'
import consola from 'consola'
import { withDevSamplingCatalogEnv } from '../../../scripts/worker-create-catalog-view'

const REPO_ROOT = resolve(import.meta.dir, '../../..')
const CLI_ENTRY = resolve(REPO_ROOT, 'apps/worker-cli/src/aiworker.ts')

interface FleetWorkerSummary {
  app: string
  home: string
  id: string
  port: number
}

interface StartedEntry {
  id: string
  port: number
  url: string
}

interface HealthBody {
  status?: string
  workers?: Array<{ appId?: string, id?: string, status?: string }>
}

export function smokeFleetWorkerCreateArgs(id: string, appId: string): string[] {
  return ['worker', 'create', id, '--app', appId]
}

async function main(): Promise<number> {
  const root = await mkdtemp(resolve(tmpdir(), 'aiworker-smoke-fleet-'))
  const env: NodeJS.ProcessEnv = { ...process.env, AIWORKER_HOME: root }
  // Per-worker isolation already holds via fleet `buildLocalPaths`/`startDaemonProcess`,
  // but drop any ambient WORKER_DB_PATH so the parent CLI never pins a single DB.
  delete env.WORKER_DB_PATH

  try {
    // 1. create two domain workers, each in its own standalone home + port.
    await runCli(smokeFleetWorkerCreateArgs('w-freeform', 'aiworker-freeform'), withDevSamplingCatalogEnv(env))
    await runCli(smokeFleetWorkerCreateArgs('w-hr', 'hr-manager'), withDevSamplingCatalogEnv(env))

    // 2. fleet list: exactly two workers, distinct ports, distinct homes.
    const listed = parseFleetList(await runCli(['fleet', 'list'], env))
    assertFleetTopology(listed)

    // 3. start --all → both daemons in the background; poll the *printed* ports
    //    (runFleetStart bind-probes/bumps, so never assume 9217/9218).
    const firstStart = parseStarted(await runCli(['start', '--all'], env))
    await assertHealthIsolation(firstStart)

    // 4. stop --all → both processes stop, ports stop responding.
    await runCli(['stop', '--all'], env)
    await assertAllStopped(firstStart)

    // 5. idempotent: start --all again succeeds (re-spawn), stop --all again.
    const secondStart = parseStarted(await runCli(['start', '--all'], env))
    await assertHealthIsolation(secondStart)
    await runCli(['stop', '--all'], env)
    await assertAllStopped(secondStart)

    consola.success('[smoke-fleet] PASS: two standalone workers each report their own DB via /health; start/stop --all clean and idempotent')
    return 0
  }
  finally {
    await bestEffortStopAll(env)
    await killStragglers(root)
    await rm(root, { force: true, recursive: true })
  }
}

function assertFleetTopology(workers: FleetWorkerSummary[]): void {
  if (workers.length !== 2)
    throw new Error(`fleet list must report exactly two workers; got ${workers.length}`)
  const byId = new Map(workers.map(worker => [worker.id, worker]))
  const freeform = byId.get('w-freeform')
  const hr = byId.get('w-hr')
  if (!freeform || !hr)
    throw new Error(`fleet list must contain w-freeform and w-hr; got ${workers.map(worker => worker.id).join(', ')}`)
  if (freeform.app !== 'aiworker-freeform')
    throw new Error(`w-freeform must bind aiworker-freeform; got ${freeform.app}`)
  if (hr.app !== 'hr-manager')
    throw new Error(`w-hr must bind hr-manager; got ${hr.app}`)
  if (freeform.port === hr.port)
    throw new Error(`fleet workers must use distinct ports; both got ${freeform.port}`)
  if (freeform.home === hr.home)
    throw new Error(`fleet workers must use distinct homes; both got ${freeform.home}`)
}

// The core isolation proof: each worker's daemon reads only its own per-home DB,
// so its /health workers array must contain exactly its own worker with the
// matching appId. If w-hr ever reports aiworker-freeform (or vice-versa), the
// DBs leaked into each other.
async function assertHealthIsolation(started: StartedEntry[]): Promise<void> {
  const expected: Record<string, string> = {
    'w-freeform': 'aiworker-freeform',
    'w-hr': 'hr-manager',
  }
  for (const entry of started) {
    const expectedAppId = expected[entry.id]
    if (!expectedAppId)
      throw new Error(`unexpected started worker id: ${entry.id}`)
    const health = await pollHealth(entry.url)
    if (health.status !== 'ok')
      throw new Error(`worker ${entry.id} /health must report status ok; got ${health.status ?? '<none>'}`)
    const appIds = (health.workers ?? []).map(worker => worker.appId)
    if (appIds.length !== 1 || appIds[0] !== expectedAppId) {
      throw new Error(
        `worker ${entry.id} /health must expose exactly its own DB worker (${expectedAppId}); got [${appIds.join(', ')}] — per-worker DB isolation broke`,
      )
    }
    consola.info(`[smoke-fleet] ${entry.id} @ ${entry.url}/health → DB workers=[${appIds.join(', ')}] (isolated, matches ${expectedAppId})`)
  }
}

async function assertAllStopped(started: StartedEntry[]): Promise<void> {
  for (const entry of started)
    await pollUntilUnreachable(entry.url)
}

async function pollHealth(url: string, attempts = 30, delayMs = 300): Promise<HealthBody> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(`${url}/health`)
      if (res.ok)
        return await res.json() as HealthBody
      lastError = new Error(`status ${res.status}`)
    }
    catch (error) {
      lastError = error
    }
    await delay(delayMs)
  }
  throw new Error(`worker /health never became ready at ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function pollUntilUnreachable(url: string, attempts = 30, delayMs = 300): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fetch(`${url}/health`)
    }
    catch {
      return
    }
    await delay(delayMs)
  }
  throw new Error(`daemon at ${url} still responds after stop`)
}

function parseFleetList(stdout: string): FleetWorkerSummary[] {
  const body = parseJson(stdout) as { workers?: FleetWorkerSummary[] }
  if (!Array.isArray(body.workers))
    throw new Error(`fleet list output missing workers array: ${stdout}`)
  return body.workers
}

function parseStarted(stdout: string): StartedEntry[] {
  const body = parseJson(stdout) as { started?: StartedEntry[] }
  if (!Array.isArray(body.started) || body.started.length === 0)
    throw new Error(`start output missing started array: ${stdout}`)
  return body.started
}

// Extract the JSON object from stdout defensively: any non-JSON noise (update
// notices, consola lines that escaped stderr) outside the outermost braces is
// tolerated by slicing from the first `{` to the last `}`.
function parseJson(stdout: string): unknown {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start)
    throw new Error(`expected JSON object in CLI output: ${stdout}`)
  return JSON.parse(stdout.slice(start, end + 1))
}

async function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  const proc = spawn(['bun', CLI_ENTRY, ...args], {
    cwd: REPO_ROOT,
    env,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0)
    throw new Error(`aiworker ${args.join(' ')} failed with ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`)
  return stdout
}

async function bestEffortStopAll(env: NodeJS.ProcessEnv): Promise<void> {
  try {
    await runCli(['stop', '--all'], env)
  }
  catch {
    // ignore — cleanup is best-effort; straggler kill below is the backstop
  }
}

// Backstop cleanup: read each per-home pid file under the temp root and SIGKILL
// any daemon that outlived `stop --all` (e.g. a mid-test throw).
async function killStragglers(root: string): Promise<void> {
  const pidFiles = [
    resolve(root, 'aiworker-daemon.pid'),
    resolve(root, 'workers/w-freeform/aiworker-daemon.pid'),
    resolve(root, 'workers/w-hr/aiworker-daemon.pid'),
  ]
  for (const pidFile of pidFiles) {
    let pid: number | null = null
    try {
      pid = Number.parseInt((await readFile(pidFile, 'utf8')).trim(), 10)
    }
    catch {
      continue
    }
    if (!Number.isInteger(pid) || pid <= 0)
      continue
    try {
      process.kill(pid, 'SIGKILL')
    }
    catch {
      // already gone
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms))
}

if (import.meta.main) {
  main()
    .then(code => process.exit(code))
    .catch((err) => {
      consola.error(`[smoke-fleet] FAIL: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    })
}
