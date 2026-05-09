import type { AiworkerScopeResult } from '@zonease/aiworker-fs-layout'
import type { ChildProcess } from 'node:child_process'

import { spawn } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import { runInit } from './init'

const WORKER_DAEMON_PID_FILE = 'aiworker-worker.pid'
const WORKER_DAEMON_LOG_FILE = 'aiworker-worker.log'
const WORKER_DAEMON_META_FILE = 'aiworker-worker-daemon.json'
const DEFAULT_WORKER_PORT = 9217
const DEFAULT_WORKER_HOST = '127.0.0.1'

export interface WorkerDaemonPaths {
  home: string
  logFile: string
  metaFile: string
  pidFile: string
  projectRoot?: string
  scope: AiworkerScopeResult['scope']
}

export interface WorkerDaemonMetadata {
  args: string[]
  cwd: string
  healthUrl: string
  home: string
  host: string
  logFile: string
  pid: number
  pidFile: string
  port: number
  projectRoot?: string
  schemaVersion: 1
  scope: AiworkerScopeResult['scope']
  startedAt: string
}

export interface WorkerDaemonStatus {
  logFile: string
  meta?: WorkerDaemonMetadata
  metaFile: string
  pid?: number
  pidFile: string
  running: boolean
}

export interface WorkerDaemonStartOptions {
  host?: string
  pack?: string
  port?: number
  soul?: string
}

export interface WorkerDaemonLogOptions {
  tail?: number
}

export interface WorkerDaemonCheckOptions {
  timeoutMs?: number
}

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0)
    return false
  try {
    process.kill(pid, 0)
    return true
  }
  catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function readPidFile(pidFile: string): number | null {
  if (!existsSync(pidFile))
    return null
  try {
    const raw = readFileSync(pidFile, 'utf8').trim()
    if (raw.length === 0)
      return null
    const pid = Number.parseInt(raw, 10)
    return Number.isFinite(pid) && pid > 0 ? pid : null
  }
  catch {
    return null
  }
}

export function resolveWorkerDaemonPaths(scope: AiworkerScopeResult = resolveAiworkerScope()): WorkerDaemonPaths {
  return {
    home: scope.home,
    logFile: path.join(scope.home, WORKER_DAEMON_LOG_FILE),
    metaFile: path.join(scope.home, WORKER_DAEMON_META_FILE),
    pidFile: path.join(scope.home, WORKER_DAEMON_PID_FILE),
    ...(scope.projectRoot === undefined ? {} : { projectRoot: scope.projectRoot }),
    scope: scope.scope,
  }
}

function readMetadata(metaFile: string): WorkerDaemonMetadata | undefined {
  if (!existsSync(metaFile))
    return undefined
  try {
    const parsed = JSON.parse(readFileSync(metaFile, 'utf8')) as WorkerDaemonMetadata
    if (parsed?.schemaVersion !== 1 || typeof parsed.pid !== 'number')
      return undefined
    return parsed
  }
  catch {
    return undefined
  }
}

export function getWorkerDaemonStatus(scope: AiworkerScopeResult = resolveAiworkerScope()): WorkerDaemonStatus {
  const paths = resolveWorkerDaemonPaths(scope)
  const pid = readPidFile(paths.pidFile)
  const meta = readMetadata(paths.metaFile)
  if (pid === null) {
    return {
      logFile: paths.logFile,
      ...(meta === undefined ? {} : { meta }),
      metaFile: paths.metaFile,
      pidFile: paths.pidFile,
      running: false,
    }
  }
  if (!isPidAlive(pid)) {
    try {
      unlinkSync(paths.pidFile)
    }
    catch {
      // Best-effort stale pid cleanup.
    }
    return {
      logFile: paths.logFile,
      ...(meta === undefined ? {} : { meta }),
      metaFile: paths.metaFile,
      pid,
      pidFile: paths.pidFile,
      running: false,
    }
  }
  return {
    logFile: paths.logFile,
    ...(meta === undefined ? {} : { meta }),
    metaFile: paths.metaFile,
    pid,
    pidFile: paths.pidFile,
    running: true,
  }
}

async function ensureProjectScopeForDaemon(options: WorkerDaemonStartOptions): Promise<AiworkerScopeResult | { code: number }> {
  const initial = resolveAiworkerScope()
  if (initial.scope !== 'user')
    return initial

  if (existsSync(path.join(initial.home, '.env')) || existsSync(path.join(initial.home, 'worker.db')))
    return initial

  if (options.soul === undefined && options.pack === undefined)
    return { code: usageError('daemon start in a brand-new workspace requires --soul <preset> or --pack <id>; run aiworker init --soul <preset> first if you want to prepare state separately') }

  const initCode = await runInit({
    ...(options.soul === undefined ? {} : { soul: options.soul }),
    ...(options.pack === undefined ? {} : { pack: options.pack }),
  })
  if (initCode !== 0)
    return { code: initCode }
  return resolveAiworkerScope()
}

function usageError(message: string): number {
  process.stderr.write(`[aiworker daemon] ${message}\n`)
  return 2
}

function buildChildArgs(port: number, host: string): string[] {
  return [
    'daemon',
    'foreground',
    '--port',
    String(port),
    '--host',
    host,
    '--no-open',
  ]
}

export async function startWorkerDaemon(options: WorkerDaemonStartOptions = {}): Promise<number> {
  const scoped = await ensureProjectScopeForDaemon(options)
  if ('code' in scoped)
    return scoped.code

  const status = getWorkerDaemonStatus(scoped)
  if (status.running) {
    process.stderr.write(`[aiworker daemon] worker daemon already running pid=${status.pid}\n`)
    process.stderr.write(`pidFile: ${status.pidFile}\n`)
    process.stderr.write(`logFile: ${status.logFile}\n`)
    return 1
  }

  const port = options.port ?? Number.parseInt(process.env.PORT ?? String(DEFAULT_WORKER_PORT), 10)
  if (!Number.isFinite(port) || port <= 0 || port > 65_535)
    return usageError(`invalid port: ${port}`)
  const host = options.host ?? process.env.AIWORKER_WORKER_HOST ?? DEFAULT_WORKER_HOST
  const paths = resolveWorkerDaemonPaths(scoped)
  await mkdir(paths.home, { recursive: true })

  const selfScript = process.argv[1]
  if (!selfScript || selfScript.length === 0) {
    process.stderr.write('[aiworker daemon] cannot locate current CLI script path\n')
    return 1
  }

  const out = openSync(paths.logFile, 'a')
  const err = openSync(paths.logFile, 'a')
  const args = buildChildArgs(port, host)
  const child: ChildProcess = spawn(process.execPath, [selfScript, ...args], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      AIWORKER_WORKER_HOST: host,
    },
    stdio: ['ignore', out, err],
  })

  try {
    closeSync(out)
  }
  catch {
    // Some runtimes close inherited fds for us.
  }
  if (err !== out) {
    try {
      closeSync(err)
    }
    catch {
      // Same as above.
    }
  }

  if (child.pid === undefined) {
    process.stderr.write('[aiworker daemon] child process started without pid\n')
    return 1
  }
  child.unref()

  const metadata: WorkerDaemonMetadata = {
    args,
    cwd: process.cwd(),
    healthUrl: `http://${host}:${port}/health`,
    home: paths.home,
    host,
    logFile: paths.logFile,
    pid: child.pid,
    pidFile: paths.pidFile,
    port,
    ...(paths.projectRoot === undefined ? {} : { projectRoot: paths.projectRoot }),
    schemaVersion: 1,
    scope: paths.scope,
    startedAt: new Date().toISOString(),
  }
  writeFileSync(paths.pidFile, `${child.pid}\n`, 'utf8')
  writeFileSync(paths.metaFile, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')

  process.stdout.write(`worker daemon started pid=${child.pid} port=${port}\n`)
  process.stdout.write(`pidFile: ${paths.pidFile}\n`)
  process.stdout.write(`logFile: ${paths.logFile}\n`)
  process.stdout.write('Run `aiworker daemon check` to verify HTTP readiness.\n')
  return 0
}

export function runWorkerDaemonStatus(): number {
  const status = getWorkerDaemonStatus()
  if (status.running) {
    process.stdout.write(`worker daemon running pid=${status.pid}\n`)
    process.stdout.write(`pidFile: ${status.pidFile}\n`)
    process.stdout.write(`logFile: ${status.logFile}\n`)
    if (status.meta)
      process.stdout.write(`health: ${status.meta.healthUrl}\n`)
    return 0
  }
  process.stdout.write('worker daemon is not running\n')
  process.stdout.write(`pidFile: ${status.pidFile}\n`)
  process.stdout.write(`logFile: ${status.logFile}\n`)
  return 1
}

export async function stopWorkerDaemon(options: { timeoutMs?: number } = {}): Promise<number> {
  const status = getWorkerDaemonStatus()
  if (!status.running || status.pid === undefined) {
    process.stdout.write('worker daemon is not running\n')
    return 0
  }

  const pid = status.pid
  const timeoutMs = options.timeoutMs ?? 5_000
  const deadline = Date.now() + timeoutMs
  try {
    process.kill(pid, 'SIGTERM')
  }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
      try {
        unlinkSync(status.pidFile)
      }
      catch {
        // Best-effort stale pid cleanup.
      }
      process.stdout.write('worker daemon was already stopped\n')
      return 0
    }
    throw err
  }

  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      try {
        unlinkSync(status.pidFile)
      }
      catch {
        // Best-effort cleanup.
      }
      process.stdout.write(`worker daemon stopped pid=${pid}\n`)
      return 0
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  try {
    process.kill(pid, 'SIGKILL')
  }
  catch {
    // Best effort.
  }
  try {
    unlinkSync(status.pidFile)
  }
  catch {
    // Best effort.
  }
  process.stdout.write(`worker daemon forced stopped pid=${pid}\n`)
  return 0
}

export function tailText(text: string, lines: number): string {
  const limit = Number.isFinite(lines) && lines > 0 ? Math.floor(lines) : 80
  const parts = text.split(/\r?\n/)
  const hasTrailingNewline = parts.at(-1) === ''
  const body = hasTrailingNewline ? parts.slice(0, -1) : parts
  const selected = body.slice(-limit)
  return `${selected.join('\n')}${selected.length > 0 ? '\n' : ''}`
}

export function runWorkerDaemonLogs(options: WorkerDaemonLogOptions = {}): number {
  const status = getWorkerDaemonStatus()
  if (!existsSync(status.logFile)) {
    process.stderr.write(`[aiworker daemon] log file not found: ${status.logFile}\n`)
    return 1
  }
  process.stdout.write(tailText(readFileSync(status.logFile, 'utf8'), options.tail ?? 80))
  return 0
}

export async function runWorkerDaemonCheck(options: WorkerDaemonCheckOptions = {}): Promise<number> {
  const status = getWorkerDaemonStatus()
  if (!status.running) {
    process.stderr.write('[aiworker daemon] worker daemon is not running\n')
    return 1
  }
  if (!status.meta) {
    process.stderr.write('[aiworker daemon] worker daemon metadata missing; restart the daemon to enable health checks\n')
    return 1
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 2_000)
  try {
    const res = await fetch(status.meta.healthUrl, { signal: controller.signal })
    if (!res.ok) {
      process.stderr.write(`[aiworker daemon] health check failed: HTTP ${res.status}\n`)
      return 1
    }
    process.stdout.write(`worker daemon healthy: ${status.meta.healthUrl}\n`)
    return 0
  }
  catch (err) {
    process.stderr.write(`[aiworker daemon] health check failed: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }
  finally {
    clearTimeout(timeout)
  }
}

export function runWorkerDaemonInspect(): number {
  const status = getWorkerDaemonStatus()
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`)
  return status.running ? 0 : 1
}
