import type {
  ChannelType,
  EngineAvailabilityResponse,
  WorkerConfig,
  WorkerInfo,
} from '@zonease/aiworker-shared'
import { jsonFetch as sharedJsonFetch, WebApiError } from '@/shared/api'
import { isFleetHostedWorkerPath, workerApiUrl } from './lib/api-base'
import { getBearerToken } from './lib/auth'

/**
 * worker 视角 API 客户端（FEAT-035 §验收 8）。
 *
 * - 所有请求走宿主 worker 自己的 HTTP `/api/worker/*`。
 * - 公网部署：浏览器先过 Caddy basic-auth（BUG-007 fail-closed），随后 `lib/auth.ts`
 *   从 URL hash 一次性塞 sessionStorage 的 bearer token，这里读取并加进 Authorization。
 * - loopback 部署：静态 `/admin/*` 可直接打开，但受保护的 `/api/worker/*`
 *   仍需要 bearer；缺 token 时 root layout 渲染锁定态，不主动发 API 请求。
 *
 * 错误统一以 `WorkerApiError` 暴露——把 worker 端 ErrorPayload (`{ error: { code,
 * message, ... } }`) 拍平到 `code`/`message`/`details`，UI 仍能 instanceof 收敛。
 */

export type WorkerApiErrorCode
  = | 'auth-required'
    | 'invalid-body'
    | 'invalid-config'
    | 'invalid-cron'
    | 'invalid-key'
    | 'version-conflict'
    | 'invalid-if-match'
    | 'not-found'
    | 'http-error'
    | 'network'
    | 'unknown'

export class WorkerApiError extends Error {
  readonly code: WorkerApiErrorCode
  readonly status?: number
  readonly details?: unknown
  readonly expectedVersion?: number
  readonly actualVersion?: number

  constructor(code: WorkerApiErrorCode, message: string, opts: {
    status?: number
    details?: unknown
    expected?: number
    actual?: number
  } = {}) {
    super(message)
    this.name = 'WorkerApiError'
    this.code = code
    this.status = opts.status
    this.details = opts.details
    this.expectedVersion = opts.expected
    this.actualVersion = opts.actual
  }
}

/**
 * 内部 fetch wrapper：
 *   - 自动塞 bearer（如果 sessionStorage 有），
 *   - 把 worker 风格 error payload 拆包为 WorkerApiError。
 *
 * 不直接 export——所有外部消费走业务函数，避免随手发 raw fetch 绕过错误规范化。
 */
async function workerFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getBearerToken()
  if (token && !headers.has('Authorization'))
    headers.set('Authorization', `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(workerApiUrl(path), { ...init, headers })
  }
  catch (err) {
    throw new WorkerApiError('network', err instanceof Error ? err.message : String(err))
  }

  const text = await res.text()
  let body: unknown = null
  if (text.length > 0) {
    try {
      body = JSON.parse(text)
    }
    catch {
      body = text
    }
  }

  if (!res.ok) {
    // worker apps/api 错误形态统一为 `{ error: { code, message, ... } }`，但
    // bearer-auth middleware 等基础设施会直接返 `{ error: 'auth_required' }`
    // 或顶层 `{ code, message }` 等老 shape——这些都收敛到 WorkerApiError。
    if (body && typeof body === 'object' && 'error' in body) {
      const errBody = (body as { error: unknown }).error
      if (typeof errBody === 'string') {
        throw new WorkerApiError(mapStatusToCode(res.status), errBody, { status: res.status })
      }
      if (errBody && typeof errBody === 'object') {
        const e = errBody as Record<string, unknown>
        const code = typeof e.code === 'string' ? mapErrCode(e.code) : mapStatusToCode(res.status)
        const message = typeof e.message === 'string' ? e.message : res.statusText
        throw new WorkerApiError(code, message, {
          status: res.status,
          details: e.details,
          ...(typeof e.expected === 'number' ? { expected: e.expected } : {}),
          ...(typeof e.actual === 'number' ? { actual: e.actual } : {}),
        })
      }
    }
    if (body && typeof body === 'object') {
      const e = body as Record<string, unknown>
      if (typeof e.message === 'string' || typeof e.code === 'string') {
        const code = typeof e.code === 'string' ? mapErrCode(e.code) : mapStatusToCode(res.status)
        const message = typeof e.message === 'string' ? e.message : res.statusText
        throw new WorkerApiError(code, message, {
          status: res.status,
          details: e.details,
        })
      }
    }
    throw new WorkerApiError(mapStatusToCode(res.status), text || res.statusText, { status: res.status })
  }

  return (body as T)
}

function mapStatusToCode(status: number): WorkerApiErrorCode {
  if (status === 401 || status === 403)
    return 'auth-required'
  if (status === 404)
    return 'not-found'
  if (status === 409)
    return 'version-conflict'
  if (status >= 400 && status < 500)
    return 'invalid-body'
  return 'http-error'
}

function mapErrCode(raw: string): WorkerApiErrorCode {
  if (raw === 'auth-failed' || raw === 'auth_failed' || raw === 'auth_required')
    return 'auth-required'

  const allowed: WorkerApiErrorCode[] = [
    'auth-required',
    'invalid-body',
    'invalid-config',
    'invalid-cron',
    'invalid-key',
    'version-conflict',
    'invalid-if-match',
    'not-found',
  ]
  if ((allowed as string[]).includes(raw))
    return raw as WorkerApiErrorCode
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Health（公开面，FEAT-033 已落）
// ---------------------------------------------------------------------------

export interface WorkerHealthBrain { status: string }
export interface WorkerHealthExecutor { status: string }

export interface WorkerHealth {
  mode: string
  workerId: string
  status: string
  configVersion: number
  startedAt: string
  checkedAt: string
  brain: WorkerHealthBrain | null
  executor: WorkerHealthExecutor | null
}

export async function getWorkerHealth(): Promise<WorkerHealth> {
  if (isFleetHostedWorkerPath()) {
    const info = await getInfo()
    return {
      mode: 'worker',
      workerId: info.workerId,
      status: 'ok',
      configVersion: info.configVersion,
      startedAt: info.startedAt,
      checkedAt: new Date().toISOString(),
      brain: info.brains[0] ? { status: info.brains[0].status } : null,
      executor: info.executor ? { status: info.executor.status } : null,
    }
  }
  // `/health` 不在 `/api/worker/*` 下——loopback / public 都开放，但仍走带
  // bearer 的 fetch wrapper（worker 中间件忽略未要求的 header）。
  return await sharedJsonFetch<WorkerHealth>('/health')
}

// ---------------------------------------------------------------------------
// Info / Config / Engines
// ---------------------------------------------------------------------------

export function getInfo(): Promise<WorkerInfo> {
  return workerFetch<WorkerInfo>('/api/worker/info')
}

export interface WorkerConfigEnvelope {
  version: number
  config: WorkerConfig
}

export function getConfig(): Promise<WorkerConfigEnvelope> {
  return workerFetch<WorkerConfigEnvelope>('/api/worker/config')
}

export interface PutConfigResult {
  config: WorkerConfig
  version: number
  runtimeReload: 'ok' | 'failed'
}

export async function putConfig(body: WorkerConfig, ifMatchVersion: number): Promise<PutConfigResult> {
  return await workerFetch<PutConfigResult>('/api/worker/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': String(ifMatchVersion),
    },
    body: JSON.stringify(body),
  })
}

export function getEngines(opts: { refresh?: boolean } = {}): Promise<EngineAvailabilityResponse> {
  const qs = opts.refresh ? '?refresh=1' : ''
  return workerFetch<EngineAvailabilityResponse>(`/api/worker/engines${qs}`)
}

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

export function listSecrets(): Promise<{ keys: string[] }> {
  return workerFetch<{ keys: string[] }>('/api/worker/secrets')
}

export async function putSecret(key: string, value: string): Promise<void> {
  await workerFetch<{ ok: true }>(`/api/worker/secrets/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
}

export async function deleteSecret(key: string): Promise<void> {
  await workerFetch<{ ok: true }>(`/api/worker/secrets/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Brain / Executor / Channel test
// ---------------------------------------------------------------------------

export interface BrainTestRow {
  id: string
  type: string
  status: string
  errorMessage?: string
}

export function testBrain(): Promise<{ brains: BrainTestRow[] }> {
  return workerFetch<{ brains: BrainTestRow[] }>('/api/worker/brain/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
}

export interface ExecutorTestRow {
  type: string
  status: string
  tinyProbe?: { ok: boolean, latencyMs: number, output?: string }
  probeError?: string
}

const EXECUTOR_TEST_REQUEST_TIMEOUT_MS = 12_000

export async function testExecutor(
  body: { probe?: boolean } = {},
  options: { timeoutMs?: number } = {},
): Promise<{ executor: ExecutorTestRow }> {
  const timeoutMs = options.timeoutMs ?? EXECUTOR_TEST_REQUEST_TIMEOUT_MS
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    return await workerFetch<{ executor: ExecutorTestRow }>('/api/worker/executor/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  }
  catch (err) {
    if (timedOut)
      throw new WorkerApiError('network', `executor test timed out after ${timeoutMs}ms`)
    throw err
  }
  finally {
    clearTimeout(timer)
  }
}

export interface ChannelTestResponse {
  sent: boolean
  platformResponse?: unknown
  error?: string
}

export function testChannel(channel: ChannelType, body: { chatId?: string, text?: string } = {}): Promise<ChannelTestResponse> {
  return workerFetch<ChannelTestResponse>(`/api/worker/channels/${channel}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

export interface CronJobRow {
  id: string
  expression: string
  prompt: string
  channel: ChannelType
  chatId: string
  accountId: string
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CronAddInput {
  expression: string
  prompt: string
  channel: ChannelType
  chatId: string
  accountId?: string
  enabled?: boolean
}

export interface CronPatchInput {
  expression?: string
  prompt?: string
  channel?: ChannelType
  chatId?: string
  accountId?: string
  enabled?: boolean
}

export function listCron(): Promise<{ jobs: CronJobRow[] }> {
  return workerFetch<{ jobs: CronJobRow[] }>('/api/worker/cron')
}

export async function addCron(body: CronAddInput): Promise<CronJobRow> {
  const res = await workerFetch<{ job: CronJobRow }>('/api/worker/cron', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.job
}

export async function patchCron(id: string, patch: CronPatchInput): Promise<CronJobRow> {
  const res = await workerFetch<{ job: CronJobRow }>(`/api/worker/cron/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return res.job
}

export async function deleteCron(id: string): Promise<void> {
  await workerFetch<{ ok: true }>(`/api/worker/cron/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export interface ApprovalRow {
  taskId: string
  toolCallId: string
  toolName: string
  params: Record<string, unknown>
  expiresAt: number
}

export function listApprovals(): Promise<{ approvals: ApprovalRow[] }> {
  return workerFetch<{ approvals: ApprovalRow[] }>('/api/worker/approvals')
}

export async function grantApproval(taskId: string, toolCallId: string, decision: 'allow' | 'deny'): Promise<{ granted: boolean }> {
  return await workerFetch<{ granted: boolean }>(
    `/api/worker/approvals/${encodeURIComponent(taskId)}/${encodeURIComponent(toolCallId)}/grant`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    },
  )
}

// ---------------------------------------------------------------------------
// Chat / Orchestrator
// ---------------------------------------------------------------------------

export interface AgentTaskRow {
  id: string
  status: string
  prompt: string
  conversationId?: string | null
  createdAt: string
  finishedAt?: string | null
  result?: Record<string, unknown> | null
  error?: string | null
}

export interface ConversationRow {
  id: string
  channel: string
  chatId: string
  accountId: string
  lastActiveAt: string
}

export interface MessageRow {
  id: string
  conversationId: string
  role: string
  content: string
  createdAt: string
}

export function listTasks(): Promise<{ tasks: AgentTaskRow[] }> {
  return workerFetch<{ tasks: AgentTaskRow[] }>('/api/worker/orchestrator/tasks')
}

export async function submitTask(prompt: string): Promise<AgentTaskRow> {
  const res = await workerFetch<{ task: AgentTaskRow }>('/api/worker/orchestrator/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  return res.task
}

export async function continueConversation(conversationId: string, prompt: string): Promise<AgentTaskRow> {
  const res = await workerFetch<{ task: AgentTaskRow }>(
    `/api/worker/orchestrator/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    },
  )
  return res.task
}

export function listConversations(): Promise<{ conversations: ConversationRow[] }> {
  return workerFetch<{ conversations: ConversationRow[] }>('/api/worker/orchestrator/conversations')
}

export function listMessages(conversationId: string): Promise<{ messages: MessageRow[] }> {
  return workerFetch<{ messages: MessageRow[] }>(
    `/api/worker/orchestrator/conversations/${encodeURIComponent(conversationId)}/messages`,
  )
}

/**
 * 打开 SSE 事件流（GET `/api/worker/events/stream`）。
 *
 * 浏览器原生 EventSource 不支持自定义 header，bearer-auth 公网部署里带不上
 * `Authorization: Bearer ...`——这里用 fetch + ReadableStream 自己 parse SSE，
 * 与 worker 端 hono `streamSSE` 输出格式（`event: <type>\ndata: <json>\n\n`）对齐。
 *
 * 调用方：
 *   const ctrl = new AbortController()
 *   subscribeEvents(ctrl.signal, (evt) => {...})
 *   // 取消：ctrl.abort()
 */
export interface WorkerSSEEvent {
  type: string
  data: Record<string, unknown>
}

export async function subscribeEvents(
  signal: AbortSignal,
  onEvent: (event: WorkerSSEEvent) => void,
): Promise<void> {
  const headers = new Headers({ Accept: 'text/event-stream' })
  const token = getBearerToken()
  if (token)
    headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(workerApiUrl('/events/stream'), { headers, signal })
  if (!res.ok || !res.body) {
    throw new WorkerApiError(mapStatusToCode(res.status), `events stream HTTP ${res.status}`, {
      status: res.status,
    })
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read()
      if (done)
        return
      buffer += decoder.decode(value, { stream: true })
      let idx = buffer.indexOf('\n\n')
      while (idx !== -1) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const evt = parseSSEBlock(block)
        if (evt)
          onEvent(evt)
        idx = buffer.indexOf('\n\n')
      }
    }
  }
  finally {
    try {
      reader.cancel()
    }
    catch {
      // 关闭 stream 时 reader 可能已 free，忽略。
    }
  }
}

function parseSSEBlock(block: string): WorkerSSEEvent | null {
  let type = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:'))
      type = line.slice(6).trim()
    else if (line.startsWith('data:'))
      dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0)
    return null
  const dataStr = dataLines.join('\n')
  try {
    return { type, data: JSON.parse(dataStr) as Record<string, unknown> }
  }
  catch {
    return null
  }
}

export { WebApiError }
