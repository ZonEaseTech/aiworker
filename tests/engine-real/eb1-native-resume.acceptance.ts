import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { closeWorkerDb, initWorkerDb, runWorkerMigrations } from '../../packages/storage-sqlite/src/worker'
import { createExternalEngineExecutor, LocalWorkerRuntime } from '../../packages/worker-runtime/src'

// EB-1 acceptance: prove multi-turn follow-up carries context via NATIVE RESUME through the
// real AIWorker stack (capture -> store -> resolve -> thread -> buildArgs -> engine resume),
// using REAL claude/codex CLIs — not fake adapters. Turn 1 plants a number; turn 2 must recall
// it, which is only possible if the prior native session was resumed.

const MEMORY_NUMBER = '4729'
const TIMEOUT_MS = 240_000

interface EngineSpec { command: string, id: 'claude-code' | 'codex', name: string }

const ENGINES: EngineSpec[] = [
  { command: 'codex', id: 'codex', name: 'Codex CLI' },
  { command: 'claude', id: 'claude-code', name: 'Claude Code' },
]

function assert(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(message)
}

function engineAvailable(command: string): boolean {
  return spawnSync('which', [command], { encoding: 'utf8' }).status === 0
}

async function runEngineResume(engine: EngineSpec, root: string): Promise<void> {
  const fixtureRoot = path.join(root, engine.id)
  const workspacesRoot = path.join(fixtureRoot, 'workspaces')
  await mkdir(workspacesRoot, { recursive: true })
  closeWorkerDb()
  initWorkerDb(path.join(fixtureRoot, 'worker.db'))
  runWorkerMigrations()
  const runtime = new LocalWorkerRuntime({
    executor: createExternalEngineExecutor({ timeoutMs: TIMEOUT_MS }),
    worker: { appId: 'eb1-resume-app', defaultEngineId: engine.id, id: `eb1-${engine.id}-worker`, name: `EB1 ${engine.name}` },
    workspacesRoot,
  })
  await runtime.init()
  const workspace = await runtime.createWorkspace({ name: `EB1 ${engine.name} Workspace` })
  const session = await runtime.createSession({
    metadata: { engineCommand: engine.command, engineId: engine.id, executionMode: 'local-cli' },
    title: `EB1 ${engine.name} resume`,
    workspaceId: workspace.id,
  })

  const turn1 = await runtime.startInvocation({
    engineCommand: engine.command,
    engineId: engine.id,
    input: `Remember this number for later: ${MEMORY_NUMBER}. Reply with just: ok`,
    metadata: { executionMode: 'local-cli' },
    sessionId: session.id,
  })
  assert(turn1.invocation.status === 'succeeded', `${engine.id} turn1 not succeeded: ${turn1.invocation.status} — ${turn1.invocation.summary}`)
  assert(!!turn1.invocation.externalSessionRef, `${engine.id} turn1 captured NO externalSessionRef (capture broken)`)

  const turn2 = await runtime.startInvocation({
    engineCommand: engine.command,
    engineId: engine.id,
    input: 'What number did I ask you to remember? Reply with just the number, nothing else.',
    metadata: { executionMode: 'local-cli' },
    sessionId: session.id,
  })
  assert(turn2.invocation.status === 'succeeded', `${engine.id} turn2 not succeeded: ${turn2.invocation.status} — ${turn2.invocation.summary}`)
  assert(
    turn2.invocation.summary.includes(MEMORY_NUMBER),
    `${engine.id} turn2 did NOT recall ${MEMORY_NUMBER} — multi-turn amnesia still present: "${turn2.invocation.summary}"`,
  )

  console.warn(`  ✓ ${engine.name}: turn1 captured ref, turn2 recalled ${MEMORY_NUMBER} via native resume`)
  console.warn(`    turn1 externalSessionRef: ${turn1.invocation.externalSessionRef}`)
  console.warn(`    turn2 summary: ${turn2.invocation.summary.slice(0, 120)}`)
  closeWorkerDb()
}

async function main(): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), 'eb1-resume-'))
  let failed = false
  let ran = 0
  for (const engine of ENGINES) {
    if (!engineAvailable(engine.command)) {
      console.warn(`  - ${engine.name}: SKIP (not installed/logged in)`)
      continue
    }
    ran += 1
    console.warn(`Running EB-1 native-resume acceptance: ${engine.name} ...`)
    try {
      await runEngineResume(engine, root)
    }
    catch (error) {
      failed = true
      console.error(`  ✗ ${engine.name}: ${(error as Error).message}`)
    }
  }
  await rm(root, { force: true, recursive: true })
  if (ran === 0) {
    console.error('EB-1 native-resume acceptance: no engines available to test')
    process.exit(2)
  }
  if (failed) {
    console.error('EB-1 native-resume acceptance FAILED')
    process.exit(1)
  }
  console.warn('EB-1 native-resume acceptance PASSED')
}

void main()
