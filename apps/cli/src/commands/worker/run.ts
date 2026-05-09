import type { WorkerRuntime } from '@zonease/aiworker-core'
import type { Envelope } from '@zonease/aiworker-shared'
import type { WorkerContext } from '../../context'

import { randomUUID } from 'node:crypto'
import process from 'node:process'

import { detectAuthorityPreflight, recordBrainJournalEvent } from '@zonease/aiworker-core'
import { agentTasks, getWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'
import consola from 'consola'

import { buildRuntime, loadWorkerContext } from '../../context'

export interface RunOptions {
  /** User message text to feed into the orchestrator. */
  message?: string
  /** Optional chat identifier; defaults to a single synthetic CLI chat. */
  chatId?: string
  /** Skip actually running — just boot, print diagnostics, exit. */
  dryRun?: boolean
  /** Explicit fallback for the old in-process path. Default is daemon HTTP. */
  local?: boolean
  /** Hard ceiling on wait time for terminal events; exits with non-zero on timeout. */
  timeoutMs?: number
}

interface RunDeps {
  buildRuntime?: (ctx: RunContext) => RunRuntime
  fetch?: FetchLike
  loadWorkerContext?: () => Promise<RunContext>
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

interface RunContext {
  configVersion: number
  hydrated: {
    executor: {
      engine: string
      variant: string
    }
  }
  token: string
  workerId: string
}
interface RunRuntime {
  bus: WorkerRuntime['bus']
  dispose: WorkerRuntime['dispose']
  orchestrator: Pick<WorkerRuntime['orchestrator'], 'ingest'>
}

const DEFAULT_TIMEOUT_MS = 120_000

/**
 * `aiworker run` 默认走本地 daemon 的 `/api/worker/runs`，让 CLI/web/HTTP 共用
 * 同一套 run contract。`--local` 才启用旧的 in-process 直跑路径。
 */
export async function runRun(options: RunOptions = {}, deps: RunDeps = {}): Promise<number> {
  const message = options.message ?? ''
  if (!message) {
    consola.error('[aiworker run] --message is required (non-empty)')
    return 2
  }
  if (options.local === true)
    return runRunLocal(options, deps)

  return runRunViaDaemon(options, deps)
}

async function runRunViaDaemon(options: RunOptions, deps: RunDeps): Promise<number> {
  const message = options.message ?? ''
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const ctx = await (deps.loadWorkerContext ?? (() => loadWorkerContext({ silent: true }) as Promise<RunContext>))()
  const fetchImpl = deps.fetch ?? fetch
  const base = localWorkerBaseUrl()

  consola.info(`[aiworker run] worker ${ctx.workerId} via daemon ${base}`)
  if (options.chatId !== undefined)
    consola.warn('[aiworker run] --chat-id only applies with --local; daemon runs use the run service conversation routing')

  if (options.dryRun) {
    consola.success('[aiworker run] --dry-run: daemon target resolved, no run submitted')
    return 0
  }

  const created = await createDaemonRun({
    base,
    fetchImpl,
    message,
    token: ctx.token,
  })
  if (!created.ok)
    return created.code

  consola.info(`[aiworker run] run ${created.runId}`)
  return await streamDaemonRun({
    base,
    fetchImpl,
    runId: created.runId,
    timeoutMs,
    token: ctx.token,
  })
}

async function runRunLocal(options: RunOptions = {}, deps: RunDeps = {}): Promise<number> {
  const message = options.message ?? ''

  const ctx = await (deps.loadWorkerContext ?? loadWorkerContext)()
  const runtime = deps.buildRuntime === undefined
    ? buildRuntime(ctx as WorkerContext)
    : deps.buildRuntime(ctx)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  consola.info(`[aiworker run] worker ${ctx.workerId} (config v${ctx.configVersion}) — engine=${ctx.hydrated.executor.engine}/${ctx.hydrated.executor.variant}`)
  const authority = detectAuthorityPreflight({
    authorityMode: ctx.hydrated.executor.engine === 'http' || ctx.hydrated.executor.engine === 'mcp' ? 'provider_managed' : 'unmanaged_ambient',
    text: message,
  })
  consola.info(`[aiworker run] authority=${authority.operatorMode} risk=${authority.risk}${authority.warning === undefined ? '' : ` — ${authority.warning}`}`)

  if (options.dryRun) {
    consola.success('[aiworker run] --dry-run: runtime constructed, no envelope ingested')
    runtime.dispose()
    return 0
  }

  const chatId = options.chatId ?? 'cli:stdin'
  const now = new Date().toISOString()
  const taskId = createCliTask(message, ctx.hydrated.executor, now)
  const envelope: Envelope = {
    workerId: ctx.workerId,
    channel: 'web',
    // aiworker CLI 直接驱动 worker，使用保留前缀 `sys:cli` 避免与 web binding.id 冲突。
    accountId: 'sys:cli',
    chatId,
    text: message,
    receivedAt: now,
    raw: {
      source: 'aiworker-cli',
      ...(taskId === undefined ? {} : { taskId }),
    },
  }

  const terminalPromise = new Promise<number>((resolve) => {
    let unsubscribe: (() => void) | null = null
    const timer = setTimeout(() => {
      consola.error(`[aiworker run] timed out after ${timeoutMs}ms without reaching a terminal state`)
      unsubscribe?.()
      resolve(124)
    }, timeoutMs)

    unsubscribe = runtime.bus.on((event) => {
      console.log(JSON.stringify({ type: event.type, at: event.at, payload: event.payload }))
      // 终态事件契约（与 packages/core/src/worker/orchestrator/service.ts 与
      // packages/core/src/worker/gateway-client/subscriber.ts 保持一致）：
      //   orchestrator.finished → 成功，exit 0
      //   orchestrator.error    → 失败，exit 1
      // 早期 PLAN-011 设计的 orchestrator.task.* 事件在当前 runtime 已无人 emit。
      if (event.type === 'orchestrator.finished' || event.type === 'orchestrator.error') {
        clearTimeout(timer)
        unsubscribe?.()
        resolve(event.type === 'orchestrator.finished' ? 0 : 1)
      }
    })
  })

  try {
    await runtime.orchestrator.ingest(envelope)
  }
  catch (err) {
    consola.error(`[aiworker run] ingest failed: ${String(err)}`)
    runtime.dispose()
    return 1
  }

  const code = await terminalPromise
  runtime.dispose()
  return code
}

interface CreateDaemonRunInput {
  base: string
  fetchImpl: FetchLike
  message: string
  token: string
}

type CreateDaemonRunResult
  = | { ok: true, runId: string }
    | { ok: false, code: number }

async function createDaemonRun(input: CreateDaemonRunInput): Promise<CreateDaemonRunResult> {
  const url = `${input.base}/api/worker/runs`
  let res: Response
  try {
    res = await input.fetchImpl(url, {
      method: 'POST',
      headers: authJsonHeaders(input.token),
      body: JSON.stringify({ prompt: input.message }),
    })
  }
  catch (err) {
    consola.error(`[aiworker run] daemon unreachable at ${input.base}: ${err instanceof Error ? err.message : String(err)}`)
    consola.error('[aiworker run] start the daemon first: aiworker daemon start')
    return { ok: false, code: 1 }
  }

  const body = await readJsonBody(res)
  if (res.status !== 201) {
    consola.error(`[aiworker run] create run HTTP ${res.status}: ${JSON.stringify(body)}`)
    return { ok: false, code: 1 }
  }
  const runId = readRunId(body)
  if (runId === null) {
    consola.error(`[aiworker run] create run response missing run.id: ${JSON.stringify(body)}`)
    return { ok: false, code: 1 }
  }
  return { ok: true, runId }
}

interface StreamDaemonRunInput {
  base: string
  fetchImpl: FetchLike
  runId: string
  timeoutMs: number
  token: string
}

async function streamDaemonRun(input: StreamDaemonRunInput): Promise<number> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, input.timeoutMs)
  try {
    const res = await input.fetchImpl(`${input.base}/api/worker/runs/${encodeURIComponent(input.runId)}/events`, {
      headers: authHeaders(input.token),
      signal: controller.signal,
    })
    if (res.status !== 200) {
      const body = await readJsonBody(res)
      consola.error(`[aiworker run] stream run HTTP ${res.status}: ${JSON.stringify(body)}`)
      return 1
    }
    if (!res.body) {
      consola.error('[aiworker run] stream response has no body')
      return 1
    }
    return await consumeSse(res.body.getReader())
  }
  catch (err) {
    if (timedOut) {
      consola.error(`[aiworker run] timed out after ${input.timeoutMs}ms without reaching a terminal state`)
      return 124
    }
    consola.error(`[aiworker run] stream failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
  finally {
    clearTimeout(timer)
  }
}

async function consumeSse(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<number> {
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done)
      break
    buffer += decoder.decode(chunk.value, { stream: true })
    let boundary = findSseBoundary(buffer)
    while (boundary !== null) {
      const block = buffer.slice(0, boundary.index)
      buffer = buffer.slice(boundary.index + boundary.length)
      const code = handleSseBlock(block)
      if (code !== null) {
        await reader.cancel().catch(() => undefined)
        return code
      }
      boundary = findSseBoundary(buffer)
    }
  }
  consola.error('[aiworker run] event stream ended before a terminal event')
  return 1
}

function findSseBoundary(buffer: string): { index: number, length: number } | null {
  const lf = buffer.indexOf('\n\n')
  const crlf = buffer.indexOf('\r\n\r\n')
  if (lf < 0)
    return crlf < 0 ? null : { index: crlf, length: 4 }
  if (crlf < 0)
    return { index: lf, length: 2 }
  return lf < crlf
    ? { index: lf, length: 2 }
    : { index: crlf, length: 4 }
}

function handleSseBlock(block: string): number | null {
  const lines = block.split(/\r?\n/)
  if (lines.every(line => line.startsWith(':') || line.trim() === ''))
    return null
  const eventType = lines.find(line => line.startsWith('event:'))?.slice('event:'.length).trim()
  const dataRaw = lines
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice('data:'.length).trimStart())
    .join('\n')
  if (!eventType || !dataRaw)
    return null
  const data = parseJsonObject(dataRaw)
  if (data === null)
    return null
  const { at, ...payload } = data
  console.log(JSON.stringify({ type: eventType, at, payload }))
  if (eventType === 'orchestrator.finished')
    return 0
  if (eventType === 'orchestrator.error')
    return 1
  return null
}

function createCliTask(message: string, executor: RunContext['hydrated']['executor'], now: string): string | undefined {
  try {
    const id = randomUUID()
    getWorkerDb().insert(agentTasks).values({
      id,
      prompt: message,
      status: 'queued',
      createdAt: now,
    }).run()
    recordBrainJournalEvent({
      at: now,
      kind: 'task.queued',
      taskId: id,
      payload: {
        channel: 'web',
        executorEngine: executor.engine,
        executorVariant: executor.variant,
        promptLength: message.length,
        source: 'aiworker-cli',
      },
    })
    consola.info(`[aiworker run] task ${id}`)
    return id
  }
  catch {
    return undefined
  }
}

function localWorkerBaseUrl(): string {
  const host = process.env.AIW_LOCAL_WORKER_HOST ?? 'localhost'
  const port = process.env.PORT ?? '9217'
  return `http://${host}:${port}`
}

function authHeaders(token: string): Headers {
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  return headers
}

function authJsonHeaders(token: string): Headers {
  const headers = authHeaders(token)
  headers.set('Content-Type', 'application/json')
  return headers
}

async function readJsonBody(res: Response): Promise<unknown> {
  try {
    return await res.json()
  }
  catch {
    return null
  }
}

function readRunId(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('run' in body))
    return null
  const run = (body as { run?: unknown }).run
  if (!run || typeof run !== 'object' || !('id' in run))
    return null
  const id = (run as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0 ? id : null
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  }
  catch {
    return null
  }
}
