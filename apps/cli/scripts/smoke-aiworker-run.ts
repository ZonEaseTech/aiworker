#!/usr/bin/env bun
import type { WorkerConfig } from '@zonease/aiworker-shared'

import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { recordBrainJournalEvent, SecretsVault } from '@zonease/aiworker-core'
import {
  closeWorkerDb,
  getWorkerDb,
  initWorkerDb,
  workerConfig,
} from '@zonease/aiworker-storage-sqlite/worker'
import { spawn } from 'bun'
import consola from 'consola'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const CLI_TIMEOUT_MS = 30_000
const DAEMON_TIMEOUT_MS = 20_000
const STUB_API_KEY = 'smoke-api-key'

interface CommandResult {
  code: number
  stderr: string
  stdout: string
}

async function main(): Promise<number> {
  const workdir = mkdtempSync(join(tmpdir(), 'aiworker-smoke-'))
  const projectDir = join(workdir, 'project')
  const homeDir = join(workdir, 'home')
  mkdirSync(join(projectDir, '.git'), { recursive: true })
  mkdirSync(homeDir, { recursive: true })

  const stub = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async req => handleOpenAiCompatStub(req),
  })
  const daemonPort = await reservePort()
  const env = buildSmokeEnv(homeDir, daemonPort)
  const entry = new URL('../src/aiworker.ts', import.meta.url).pathname
  let daemon: ReturnType<typeof spawn> | null = null

  consola.info(`[smoke-aiworker-run] using tmp project ${projectDir}`)
  consola.info(`[smoke-aiworker-run] stub executor http://127.0.0.1:${stub.port}`)

  try {
    await assertCli(entry, ['init', '--soul', 'developer'], { cwd: projectDir, env, label: 'init' })
    const workerDbPath = join(projectDir, '.aiworker', 'local', 'worker.db')
    await configureWorker(workerDbPath, `http://127.0.0.1:${stub.port}`)

    daemon = spawn([
      'bun',
      entry,
      'daemon',
      'foreground',
      '--host',
      '127.0.0.1',
      '--port',
      String(daemonPort),
      '--no-open',
    ], {
      cwd: projectDir,
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    await waitForHealth(daemonPort)

    await assertCli(entry, ['run', '--message', 'Create a smoke artifact and review it.', '--timeout-ms', '20000'], {
      cwd: projectDir,
      env,
      label: 'run',
      timeoutMs: 25_000,
    })

    const runs = await assertCli(entry, ['runs', 'list', '--limit', '1'], { cwd: projectDir, env, label: 'runs list' })
    const runId = readLatestRunId(runs.stdout)
    if (runId === null)
      throw new Error(`runs list did not return a run id:\n${runs.stdout}`)

    const artifacts = await assertCli(entry, ['artifacts', 'list', '--run', runId], { cwd: projectDir, env, label: 'artifacts list' })
    assertJsonArrayHas(artifacts.stdout, 'artifacts', 'assistant-output')

    seedLessonCandidate(workerDbPath, runId)

    const review = await assertCli(entry, ['review', 'show', runId], { cwd: projectDir, env, label: 'review show' })
    assertJsonIncludes(review.stdout, 'smoke lesson promotion stays attached to the originating run')

    const promotion = await assertCli(entry, ['lessons', 'promote', runId, '--soul', 'developer', '--scope', 'smoke-project'], {
      cwd: projectDir,
      env,
      label: 'lessons promote',
    })
    assertJsonIncludes(promotion.stdout, 'pending')

    consola.success(`[smoke-aiworker-run] PASS: run ${runId} produced artifact, review, and pending lesson proposal`)
    return 0
  }
  catch (err) {
    consola.error(`[smoke-aiworker-run] FAIL: ${err instanceof Error ? err.message : String(err)}`)
    if (daemon !== null) {
      daemon.kill()
      await Promise.race([
        daemon.exited.catch(() => undefined),
        new Promise(resolve => setTimeout(resolve, 2_000)),
      ])
      const stdout = await new Response(daemon.stdout).text().catch(() => '')
      const stderr = await new Response(daemon.stderr).text().catch(() => '')
      if (stdout.trim())
        consola.error(`[smoke-aiworker-run] daemon stdout:\n${stdout}`)
      if (stderr.trim())
        consola.error(`[smoke-aiworker-run] daemon stderr:\n${stderr}`)
    }
    return 1
  }
  finally {
    if (daemon !== null) {
      daemon.kill()
      await Promise.race([
        daemon.exited.catch(() => undefined),
        new Promise(resolve => setTimeout(resolve, 2_000)),
      ])
    }
    stub.stop(true)
    closeWorkerDb()
    rmSync(workdir, { recursive: true, force: true })
  }
}

function buildSmokeEnv(homeDir: string, daemonPort: number): NodeJS.ProcessEnv {
  const env = { ...process.env }
  env.HOME = homeDir
  env.AIW_LOCAL_WORKER_HOST = '127.0.0.1'
  env.AIWORKER_WORKER_HOST = '127.0.0.1'
  env.AIWORKER_MASTER_KEY = MASTER_KEY
  env.PORT = String(daemonPort)
  delete env.AIWORKER_HOME
  delete env.INTERNAL_SHARED_SECRET
  delete env.WORKER_DB_PATH
  delete env.WORKER_DATA_ROOT
  return env
}

async function assertCli(
  entry: string,
  args: string[],
  options: { cwd: string, env: NodeJS.ProcessEnv, label: string, timeoutMs?: number },
): Promise<CommandResult> {
  const result = await runCli(entry, args, options)
  if (result.code !== 0) {
    throw new Error(`${options.label} exited ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  }
  return result
}

async function runCli(
  entry: string,
  args: string[],
  options: { cwd: string, env: NodeJS.ProcessEnv, timeoutMs?: number },
): Promise<CommandResult> {
  const proc = spawn(['bun', entry, ...args], {
    cwd: options.cwd,
    env: options.env,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const timer = setTimeout(() => proc.kill(), options.timeoutMs ?? CLI_TIMEOUT_MS)
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]).finally(() => clearTimeout(timer))
  return { code, stdout, stderr }
}

async function configureWorker(workerDbPath: string, baseUrl: string): Promise<void> {
  closeWorkerDb()
  initWorkerDb(workerDbPath)
  const db = getWorkerDb()
  const row = db.select().from(workerConfig).get()
  if (row === undefined)
    throw new Error('worker_config.default was not seeded by init')

  const config = row.configJson as WorkerConfig
  const next: WorkerConfig = {
    ...config,
    executor: {
      engine: 'http',
      variant: 'default',
      overrides: {
        baseUrl,
        apiKey: '',
        model: 'smoke-model',
        timeoutMs: 10_000,
      },
    },
    orchestrator: {
      ...config.orchestrator,
      decisionPipeline: {
        ...config.orchestrator?.decisionPipeline,
        qualityGate: {
          evaluator: 'llm',
          mode: 'observe',
          budgetMs: 5_000,
        },
      },
    },
  }
  db.update(workerConfig)
    .set({
      configJson: next,
      updatedAt: new Date().toISOString(),
      updatedBy: 'smoke-aiworker-run',
      version: row.version + 1,
    })
    .run()
  await new SecretsVault(MASTER_KEY, db).put('executor.overrides.apiKey', STUB_API_KEY)
  closeWorkerDb()
}

function seedLessonCandidate(workerDbPath: string, runId: string): void {
  closeWorkerDb()
  initWorkerDb(workerDbPath)
  recordBrainJournalEvent({
    kind: 'brain_engine.review',
    taskId: runId,
    payload: {
      action: 'pass',
      score: 9,
      confidence: 0.88,
      reason: 'smoke run produced a durable artifact and review trail',
      evidenceGaps: [],
      unsupportedClaims: [],
      suggestions: [],
      lessonCandidates: [
        {
          kind: 'build-release-procedure',
          summary: 'smoke lesson promotion stays attached to the originating run',
          rationale: 'The smoke path must prove the work order, artifact, review, and lesson loop together.',
          evidenceRefs: [`agent_tasks:${runId}`],
          confidence: 0.82,
          risk: 'low',
          target: 'memories/smoke-loop.md',
          rollback: 'Remove this smoke lesson if the worker loop contract changes.',
        },
      ],
    },
  })
  closeWorkerDb()
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + DAEMON_TIMEOUT_MS
  let lastError = ''
  while (Date.now() < deadline) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1_000)
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal })
      if (res.ok)
        return
      lastError = `HTTP ${res.status}`
    }
    catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    finally {
      clearTimeout(timer)
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`daemon health did not become ready on port ${port}: ${lastError}`)
}

async function reservePort(): Promise<number> {
  const probe = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response('ok'),
  })
  const port = probe.port
  probe.stop(true)
  return port
}

async function handleOpenAiCompatStub(req: Request): Promise<Response> {
  const url = new URL(req.url)
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    return Response.json({ data: [{ id: 'smoke-model', object: 'model' }], object: 'list' })
  }
  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    const body = await req.json().catch(() => ({})) as { messages?: Array<{ content?: string, role?: string }> }
    const prompt = body.messages?.map(message => message.content ?? '').join('\n') ?? ''
    if (prompt.includes('You are the AIWorker Brain Engine reviewer.')) {
      return streamChatCompletion(JSON.stringify({
        action: 'pass',
        score: 9,
        confidence: 0.86,
        reason: 'smoke review passed',
        evidenceGaps: [],
        unsupportedClaims: [],
        suggestions: [],
        lessonCandidates: [
          {
            kind: 'build-release-procedure',
            summary: 'smoke lesson promotion stays attached to the originating run',
            rationale: 'The smoke path verifies lesson promotion from a reviewed run.',
            evidenceRefs: ['agent_tasks:smoke'],
            confidence: 0.8,
            risk: 'low',
            target: 'memories/smoke-loop.md',
            rollback: 'Remove this smoke lesson if the run loop contract changes.',
          },
        ],
      }))
    }
    if (prompt.includes('Review an AIWorker assistant answer.')) {
      return streamChatCompletion(JSON.stringify({
        score: 9,
        threshold: 5,
        dimensions: {
          relevance: 9,
          completeness: 9,
          evidence: 8,
          safety: 9,
          format: 9,
        },
        missing: [],
        suggestions: [],
        action: 'pass',
        reason: 'smoke quality gate passed',
      }))
    }
    return streamChatCompletion('Smoke artifact complete.')
  }
  return new Response('not found', { status: 404 })
}

function streamChatCompletion(content: string): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      setTimeout(() => {
        controller.enqueue(encoder.encode(`${chatChunk(content, null)}\n\n`))
        controller.enqueue(encoder.encode(`${chatChunk('', 'stop')}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      }, 50)
    },
  }), {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function chatChunk(content: string, finishReason: 'stop' | null): string {
  return `data: ${JSON.stringify({
    id: randomUUID(),
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'smoke-model',
    choices: [
      {
        index: 0,
        delta: content.length === 0 ? {} : { content },
        finish_reason: finishReason,
      },
    ],
  })}`
}

function readLatestRunId(stdout: string): string | null {
  const parsed = JSON.parse(stdout) as { runs?: Array<{ id?: unknown }> }
  const id = parsed.runs?.[0]?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

function assertJsonArrayHas(stdout: string, key: string, expected: string): void {
  const parsed = JSON.parse(stdout) as Record<string, unknown>
  const text = JSON.stringify(parsed[key])
  if (!text.includes(expected))
    throw new Error(`${key} output did not include ${expected}:\n${stdout}`)
}

function assertJsonIncludes(stdout: string, expected: string): void {
  if (!JSON.stringify(JSON.parse(stdout)).includes(expected))
    throw new Error(`JSON output did not include ${expected}:\n${stdout}`)
}

main()
  .then(code => process.exit(code))
  .catch((err) => {
    consola.error(err)
    process.exit(1)
  })
