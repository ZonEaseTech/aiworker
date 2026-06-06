import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { closeWorkerDb, getEngineInvocation, initWorkerDb, listSessionEvents, runWorkerMigrations } from '../../packages/storage-sqlite/src/worker'
import { createExternalEngineExecutor, LocalWorkerRuntime } from '../../packages/worker-runtime/src'

interface EngineSpec {
  command: string
  id: 'claude-code' | 'codex'
  name: string
}

interface ProcessHandle {
  command?: string
  invocationId: string
  leaseId?: string
  pgid?: number
  pid?: number
  startedAt?: string
}

interface EvidenceCase {
  details: Record<string, unknown>
  engineId: string
  name: string
  ok: boolean
  sample: number
}

interface Evidence {
  cases: EvidenceCase[]
  completedAt?: string
  environment: {
    cwd: string
    gitDirty: boolean | null
    gitHead: string | null
    pid: number
    platform: NodeJS.Platform
  }
  evidencePath?: string
  root: string
  sampleCount: number
  settings: {
    drainMs: number
    shortTimeoutMs: number
    timeoutMs: number
    waitTimeoutMs: number
  }
  startedAt: string
  summary?: EvidenceSummary
}

interface EvidenceSummary {
  byEngineCase: Array<{
    averageDurationMs: number | null
    engineId: string
    failed: number
    maxDurationMs: number | null
    minDurationMs: number | null
    name: string
    passRate: number
    passed: number
    samples: number
  }>
  failedCases: number
  passedCases: number
  sampleCount: number
  totalCases: number
}

const ENGINES: EngineSpec[] = [
  { command: 'codex', id: 'codex', name: 'Codex CLI' },
  { command: 'claude', id: 'claude-code', name: 'Claude Code' },
]

const REAL_ENGINE_TIMEOUT_MS = readPositiveInteger(process.env.AIWORKER_ENGINE_REAL_TIMEOUT_MS, 120_000)
const REAL_ENGINE_SHORT_TIMEOUT_MS = readPositiveInteger(process.env.AIWORKER_ENGINE_REAL_SHORT_TIMEOUT_MS, 1)
const WAIT_TIMEOUT_MS = readPositiveInteger(process.env.AIWORKER_ENGINE_REAL_WAIT_TIMEOUT_MS, 60_000)
const DRAIN_MS = readPositiveInteger(process.env.AIWORKER_ENGINE_REAL_DRAIN_MS, 1_500)
const SAMPLE_COUNT = readPositiveInteger(process.env.AIWORKER_ENGINE_REAL_SAMPLES, 1)

if (process.argv.includes('--crash-child')) {
  await runCrashChild()
}
else {
  await runAcceptance()
}

async function runAcceptance(): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), 'aiworker-engine-real-'))
  const evidence: Evidence = {
    cases: [],
    environment: {
      cwd: process.cwd(),
      gitDirty: readGitDirty(),
      gitHead: readGitHead(),
      pid: process.pid,
      platform: process.platform,
    },
    root,
    sampleCount: SAMPLE_COUNT,
    settings: {
      drainMs: DRAIN_MS,
      shortTimeoutMs: REAL_ENGINE_SHORT_TIMEOUT_MS,
      timeoutMs: REAL_ENGINE_TIMEOUT_MS,
      waitTimeoutMs: WAIT_TIMEOUT_MS,
    },
    startedAt: new Date().toISOString(),
  }
  let failed = false

  try {
    for (let sample = 1; sample <= SAMPLE_COUNT; sample++) {
      for (const engine of ENGINES) {
        await recordCase(evidence, sample, engine, 'preflight', () => preflight(engine))
        await recordCase(evidence, sample, engine, 'start-and-parse', () => startAndParse(root, sample, engine))
        await recordCase(evidence, sample, engine, 'runtime-cancel', () => runtimeCancel(root, sample, engine))
        await recordCase(evidence, sample, engine, 'executor-timeout', () => executorTimeout(root, sample, engine))
        await recordCase(evidence, sample, engine, 'runtime-dispose', () => runtimeDispose(root, sample, engine))
        await recordCase(evidence, sample, engine, 'restart-reconcile', () => restartReconcile(root, sample, engine))
      }
    }
  }
  catch (error) {
    failed = true
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  }
  finally {
    evidence.completedAt = new Date().toISOString()
    evidence.summary = summarizeEvidence(evidence.cases)
    const evidencePath = path.join(root, 'engine-management-evidence.json')
    evidence.evidencePath = evidencePath
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    console.log(`[engine-real] evidence: ${evidencePath}`)
    if (failed || evidence.cases.some(item => !item.ok)) {
      console.error(JSON.stringify(evidence.cases.filter(item => !item.ok), null, 2))
      process.exitCode = 1
    }
    else {
      console.log(`[engine-real] ${evidence.cases.length} real engine checks passed across ${SAMPLE_COUNT} sample(s).`)
    }
  }
}

async function recordCase(
  evidence: Evidence,
  sample: number,
  engine: EngineSpec,
  name: string,
  fn: () => Promise<Record<string, unknown>>,
): Promise<void> {
  const startedAt = Date.now()
  try {
    const details = await fn()
    evidence.cases.push({
      details: {
        durationMs: Date.now() - startedAt,
        ...details,
      },
      engineId: engine.id,
      name,
      ok: true,
      sample,
    })
    console.log(`[engine-real] PASS sample ${sample}/${SAMPLE_COUNT} ${engine.id} ${name}`)
  }
  catch (error) {
    evidence.cases.push({
      details: {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
      engineId: engine.id,
      name,
      ok: false,
      sample,
    })
    console.error(`[engine-real] FAIL sample ${sample}/${SAMPLE_COUNT} ${engine.id} ${name}`)
    throw error
  }
}

async function preflight(engine: EngineSpec): Promise<Record<string, unknown>> {
  const commandPath = spawnSync('command', ['-v', engine.command], {
    encoding: 'utf8',
    shell: true,
  })
  assert(commandPath.status === 0, `${engine.command} is not on PATH`)
  const version = spawnSync(engine.command, ['--version'], { encoding: 'utf8' })
  assert(version.status === 0, `${engine.command} --version failed: ${version.stderr}`)
  return {
    commandPath: commandPath.stdout.trim(),
    version: version.stdout.trim() || version.stderr.trim(),
  }
}

async function startAndParse(root: string, sample: number, engine: EngineSpec): Promise<Record<string, unknown>> {
  const workspaceRoot = path.join(root, `sample-${sample}`, `${engine.id}-start-workspace`)
  const invocationRoot = path.join(workspaceRoot, '.aiworker', 'sessions', 'session-1', 'invocations', '0001')
  await mkdir(workspaceRoot, { recursive: true })
  const expected = `AIWORKER_REAL_ENGINE_OK_${engine.id.replace(/\W+/g, '_')}`
  const events: Array<Record<string, unknown>> = []
  const handles: ProcessHandle[] = []
  const executor = createExternalEngineExecutor({ timeoutMs: REAL_ENGINE_TIMEOUT_MS })

  const result = await executor.invoke({
    engineCommand: engine.command,
    engineId: engine.id,
    invocationId: `${engine.id}-start-1`,
    invocationRoot,
    onEvent: event => events.push(event),
    onProcessHandle: handle => handles.push(handle),
    prompt: [
      `Return exactly this token and no other prose: ${expected}`,
      'Do not run tools. Do not edit files.',
    ].join('\n'),
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    workspaceRoot,
    metadata: {},
  })

  assert(result.summary.includes(expected), `${engine.id} summary did not include ${expected}: ${result.summary}`)
  assert(handles.length > 0, `${engine.id} did not report a process handle`)
  return {
    eventKinds: events.map(event => event.kind),
    externalSessionRef: result.externalSessionRef,
    handle: redactHandle(handles[0]),
    summary: result.summary.slice(0, 200),
  }
}

async function runtimeCancel(root: string, sample: number, engine: EngineSpec): Promise<Record<string, unknown>> {
  const fixture = await createRuntimeFixture(root, sample, engine, 'cancel')
  let handle: ProcessHandle | null = null
  try {
    const started = await fixture.runtime.startInvocationDetached({
      engineCommand: engine.command,
      engineId: engine.id,
      input: longRunningPrompt(engine, 'cancel'),
      sessionId: fixture.sessionId,
    })
    handle = await waitForInvocationHandle(started.invocation.id)
    const cancelled = await fixture.runtime.cancelEngineInvocation(started.invocation.id, { reason: 'real-engine-stop' })
    assert(cancelled.invocation.status === 'cancelled', `${engine.id} cancel did not mark invocation cancelled`)
    if (handle.pgid)
      await waitForProcessGroupGone(handle.pgid, WAIT_TIMEOUT_MS)
    await drainRuntimeBackground()
    const processGone = handle.pgid ? !isProcessGroupAlive(handle.pgid) : null
    const events = listSessionEvents(fixture.sessionId).filter(event => event.invocationId === started.invocation.id)
    return {
      eventTypes: events.map(event => event.type),
      handle: redactHandle(handle),
      invocation: {
        processState: cancelled.invocation.processState,
        status: cancelled.invocation.status,
        summary: cancelled.invocation.summary,
      },
      processGone,
    }
  }
  finally {
    fixture.runtime.dispose()
    await fixture.cleanup()
    if (handle?.pgid)
      await killProcessGroup(handle.pgid)
  }
}

async function executorTimeout(root: string, sample: number, engine: EngineSpec): Promise<Record<string, unknown>> {
  const workspaceRoot = path.join(root, `sample-${sample}`, `${engine.id}-timeout-workspace`)
  const invocationRoot = path.join(workspaceRoot, '.aiworker', 'sessions', 'session-1', 'invocations', '0001')
  await mkdir(workspaceRoot, { recursive: true })
  const handles: ProcessHandle[] = []
  const executor = createExternalEngineExecutor({ timeoutMs: REAL_ENGINE_SHORT_TIMEOUT_MS })
  const startedAt = Date.now()

  try {
    await executor.invoke({
      engineCommand: engine.command,
      engineId: engine.id,
      invocationId: `${engine.id}-timeout-1`,
      invocationRoot,
      onProcessHandle: handle => handles.push(handle),
      prompt: longRunningPrompt(engine, 'timeout'),
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      workspaceRoot,
      metadata: {},
    })
    throw new Error(`${engine.id} unexpectedly completed before timeout`)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    assert(message.includes(`Process exceeded ${REAL_ENGINE_SHORT_TIMEOUT_MS}ms`), `${engine.id} timeout error did not include process timeout: ${message}`)
    const handle = handles[0]
    if (handle?.pgid)
      await waitForProcessGroupGone(handle.pgid, WAIT_TIMEOUT_MS)
    return {
      durationMs: Date.now() - startedAt,
      error: message.slice(0, 300),
      handle: handle ? redactHandle(handle) : null,
      processGone: handle?.pgid ? !isProcessGroupAlive(handle.pgid) : null,
    }
  }
  finally {
    const handle = handles[0]
    if (handle?.pgid)
      await killProcessGroup(handle.pgid)
  }
}

async function runtimeDispose(root: string, sample: number, engine: EngineSpec): Promise<Record<string, unknown>> {
  const fixture = await createRuntimeFixture(root, sample, engine, 'dispose')
  let handle: ProcessHandle | null = null
  try {
    const started = await fixture.runtime.startInvocationDetached({
      engineCommand: engine.command,
      engineId: engine.id,
      input: longRunningPrompt(engine, 'dispose'),
      sessionId: fixture.sessionId,
    })
    handle = await waitForInvocationHandle(started.invocation.id)
    fixture.runtime.dispose()
    if (handle.pgid)
      await waitForProcessGroupGone(handle.pgid, WAIT_TIMEOUT_MS)
    await drainRuntimeBackground()
    return {
      handle: redactHandle(handle),
      processGone: handle.pgid ? !isProcessGroupAlive(handle.pgid) : null,
    }
  }
  finally {
    await fixture.cleanup()
    if (handle?.pgid)
      await killProcessGroup(handle.pgid)
  }
}

async function restartReconcile(root: string, sample: number, engine: EngineSpec): Promise<Record<string, unknown>> {
  const dbPath = path.join(root, `sample-${sample}`, `${engine.id}-restart-worker.db`)
  const outputPath = path.join(root, `sample-${sample}`, `${engine.id}-restart-child.json`)
  const workspaceRoot = path.join(root, `sample-${sample}`, `${engine.id}-restart-workspaces`)
  await mkdir(path.dirname(outputPath), { recursive: true })
  const child = spawn(process.execPath, [process.argv[1]!, '--crash-child', engine.id, engine.command, dbPath, workspaceRoot, outputPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  const exitCode = await waitForChild(child)
  assert(exitCode === 0, `${engine.id} crash child exited with ${exitCode}`)
  assert(existsSync(outputPath), `${engine.id} crash child did not write ${outputPath}`)
  const childState = JSON.parse(readFileSync(outputPath, 'utf8')) as {
    handle: ProcessHandle
    invocationId: string
    workerId: string
  }
  const orphanProcessAliveBeforeReconcile = childState.handle.pgid ? isProcessGroupAlive(childState.handle.pgid) : null
  assert(orphanProcessAliveBeforeReconcile === true, `${engine.id} restart child did not leave an observable orphan process group`)

  closeWorkerDb()
  initWorkerDb(dbPath)
  runWorkerMigrations()
  const runtime = new LocalWorkerRuntime({
    worker: {
      appId: 'real-engine-app',
      defaultEngineId: engine.id,
      id: childState.workerId,
      name: `Real ${engine.name}`,
    },
    workspacesRoot: workspaceRoot,
  })
  try {
    await runtime.init()
    const invocation = getEngineInvocation(childState.invocationId)
    assert(invocation?.status === 'lost', `${engine.id} restart reconcile status was ${invocation?.status}`)
    assert(invocation.processState === 'lost', `${engine.id} restart reconcile processState was ${invocation.processState}`)
    return {
      handle: redactHandle(childState.handle),
      invocation: {
        failureCode: invocation.failureCode,
        processState: invocation.processState,
        status: invocation.status,
        summary: invocation.summary,
      },
      orphanProcessAliveBeforeReconcile,
    }
  }
  finally {
    runtime.dispose()
    closeWorkerDb()
    if (childState.handle.pgid)
      await killProcessGroup(childState.handle.pgid)
  }
}

async function runCrashChild(): Promise<void> {
  const [, , , engineId, command, dbPath, workspacesRoot, outputPath] = process.argv
  assert(engineId === 'codex' || engineId === 'claude-code', `Invalid crash child engine id: ${engineId}`)
  assert(command, 'Missing crash child command')
  assert(dbPath, 'Missing crash child db path')
  assert(workspacesRoot, 'Missing crash child workspace root')
  assert(outputPath, 'Missing crash child output path')
  closeWorkerDb()
  initWorkerDb(dbPath)
  runWorkerMigrations()
  const runtime = new LocalWorkerRuntime({
    worker: {
      appId: 'real-engine-app',
      defaultEngineId: engineId,
      id: `real-engine-${engineId}-restart-worker`,
      name: `Real ${engineId}`,
    },
    workspacesRoot,
  })
  await runtime.init()
  const workspace = await runtime.createWorkspace({ name: `Real ${engineId} Restart Workspace` })
  const session = await runtime.createSession({
    metadata: {
      engineCommand: command,
      engineId,
      executionMode: 'local-cli',
    },
    title: `Real ${engineId} restart session`,
    workspaceId: workspace.id,
  })
  const started = await runtime.startInvocationDetached({
    engineCommand: command,
    engineId,
    input: longRunningPrompt({ command, id: engineId, name: engineId }, 'restart'),
    sessionId: session.id,
  })
  const handle = await waitForInvocationHandle(started.invocation.id)
  writeFileSync(outputPath, `${JSON.stringify({
    handle,
    invocationId: started.invocation.id,
    workerId: runtime.workerId,
  }, null, 2)}\n`, 'utf8')
  process.exit(0)
}

async function createRuntimeFixture(root: string, sample: number, engine: EngineSpec, label: string): Promise<{
  cleanup: () => Promise<void>
  runtime: LocalWorkerRuntime
  sessionId: string
}> {
  const fixtureRoot = path.join(root, `sample-${sample}`, `${engine.id}-${label}`)
  const dbPath = path.join(fixtureRoot, 'worker.db')
  const workspacesRoot = path.join(fixtureRoot, 'workspaces')
  await mkdir(workspacesRoot, { recursive: true })
  closeWorkerDb()
  initWorkerDb(dbPath)
  runWorkerMigrations()
  const runtime = new LocalWorkerRuntime({
    worker: {
      appId: 'real-engine-app',
      defaultEngineId: engine.id,
      id: `real-engine-${engine.id}-${label}-worker`,
      name: `Real ${engine.name}`,
    },
    workspacesRoot,
  })
  await runtime.init()
  const workspace = await runtime.createWorkspace({ name: `Real ${engine.name} ${label} Workspace` })
  const session = await runtime.createSession({
    metadata: {
      engineCommand: engine.command,
      engineId: engine.id,
      executionMode: 'local-cli',
    },
    title: `Real ${engine.name} ${label} session`,
    workspaceId: workspace.id,
  })
  return {
    cleanup: async () => {
      closeWorkerDb()
    },
    runtime,
    sessionId: session.id,
  }
}

function longRunningPrompt(engine: EngineSpec, label: string): string {
  const marker = `.aiworker-real-engine-${engine.id}-${label}.started`
  return [
    'This is an AIWorker real engine process-management acceptance run.',
    'Use your shell/Bash tool to execute exactly this command, then wait for it to finish:',
    `bash -lc 'printf started > ${marker}; sleep 120'`,
    'Do not finish before the command completes.',
  ].join('\n')
}

async function waitForInvocationHandle(invocationId: string): Promise<ProcessHandle> {
  return await waitFor(async () => {
    const invocation = getEngineInvocation(invocationId)
    const handle = readProcessHandle(invocation?.metadataJson)
    return handle?.invocationId === invocationId && handle.pid && handle.pgid ? handle : null
  }, WAIT_TIMEOUT_MS, `process handle for ${invocationId}`)
}

function readProcessHandle(metadata: unknown): ProcessHandle | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return null
  const processHandle = (metadata as Record<string, unknown>).processHandle
  if (!processHandle || typeof processHandle !== 'object' || Array.isArray(processHandle))
    return null
  const record = processHandle as Record<string, unknown>
  const invocationId = typeof record.invocationId === 'string' ? record.invocationId : ''
  if (!invocationId)
    return null
  return {
    command: typeof record.command === 'string' ? record.command : undefined,
    invocationId,
    leaseId: typeof record.leaseId === 'string' ? record.leaseId : undefined,
    pgid: typeof record.pgid === 'number' ? record.pgid : undefined,
    pid: typeof record.pid === 'number' ? record.pid : undefined,
    startedAt: typeof record.startedAt === 'string' ? record.startedAt : undefined,
  }
}

function redactHandle(handle: ProcessHandle | undefined): Record<string, unknown> | null {
  if (!handle)
    return null
  return {
    command: handle.command,
    invocationId: handle.invocationId,
    leaseId: handle.leaseId,
    pgid: handle.pgid,
    pid: handle.pid,
    startedAt: handle.startedAt,
  }
}

async function waitForProcessGroupGone(pgid: number, timeoutMs: number): Promise<void> {
  await waitFor(async () => !isProcessGroupAlive(pgid), timeoutMs, `process group ${pgid} to exit`)
}

function isProcessGroupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0)
    return true
  }
  catch {
    return false
  }
}

async function killProcessGroup(pgid: number): Promise<void> {
  if (!isProcessGroupAlive(pgid))
    return
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL'] as const) {
    try {
      process.kill(-pgid, signal)
    }
    catch {}
    await sleep(signal === 'SIGKILL' ? 50 : 250)
    if (!isProcessGroupAlive(pgid))
      return
  }
}

async function waitFor<T>(fn: () => Promise<T | null> | T | null, timeoutMs: number, label: string): Promise<T> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = await fn()
    if (value)
      return value
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

function waitForChild(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => resolve(code))
  })
}

function summarizeEvidence(cases: EvidenceCase[]): EvidenceSummary {
  const byEngineCase = new Map<string, {
    durations: number[]
    engineId: string
    failed: number
    name: string
    passed: number
    samples: Set<number>
  }>()

  for (const item of cases) {
    const key = `${item.engineId}\0${item.name}`
    const existing = byEngineCase.get(key) ?? {
      durations: [],
      engineId: item.engineId,
      failed: 0,
      name: item.name,
      passed: 0,
      samples: new Set<number>(),
    }
    existing.samples.add(item.sample)
    if (item.ok)
      existing.passed += 1
    else
      existing.failed += 1
    const durationMs = item.details.durationMs
    if (typeof durationMs === 'number' && Number.isFinite(durationMs))
      existing.durations.push(durationMs)
    byEngineCase.set(key, existing)
  }

  const passedCases = cases.filter(item => item.ok).length
  return {
    byEngineCase: [...byEngineCase.values()].map(item => {
      const total = item.passed + item.failed
      return {
        averageDurationMs: average(item.durations),
        engineId: item.engineId,
        failed: item.failed,
        maxDurationMs: item.durations.length > 0 ? Math.max(...item.durations) : null,
        minDurationMs: item.durations.length > 0 ? Math.min(...item.durations) : null,
        name: item.name,
        passRate: total > 0 ? item.passed / total : 0,
        passed: item.passed,
        samples: item.samples.size,
      }
    }),
    failedCases: cases.length - passedCases,
    passedCases,
    sampleCount: SAMPLE_COUNT,
    totalCases: cases.length,
  }
}

function average(values: number[]): number | null {
  if (values.length === 0)
    return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function readGitHead(): string | null {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  })
  return result.status === 0 ? result.stdout.trim() : null
}

function readGitDirty(): boolean | null {
  const result = spawnSync('git', ['status', '--short'], {
    encoding: 'utf8',
  })
  return result.status === 0 ? result.stdout.trim().length > 0 : null
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(message)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function drainRuntimeBackground(): Promise<void> {
  await sleep(DRAIN_MS)
}
