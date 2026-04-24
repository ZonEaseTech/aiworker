import type {
  BrainSourceConfig,
  ChannelType,
  EngineAvailabilityResponse,
  EngineKind,
  SafeRegisteredWorker,
  ServiceStatus,
  WorkerComponentStatus,
  WorkerConfig,
  WorkerInfo,
} from '@aiworker/shared'

export interface ApiError {
  status: number
  body: unknown
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const contentType = res.headers.get('content-type') ?? ''
  const parsed = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null)

  if (!res.ok) {
    const err: ApiError = { status: res.status, body: parsed }
    throw err
  }

  return parsed as T
}

export function apiGet<T>(path: string) {
  return request<T>('GET', path)
}

export function apiPost<T>(path: string, body?: unknown) {
  return request<T>('POST', path, body)
}

export function apiPut<T>(path: string, body?: unknown) {
  return request<T>('PUT', path, body)
}

export function apiDelete<T>(path: string) {
  return request<T>('DELETE', path)
}

// Shared backend response shapes used across multiple features.

export interface ServiceHealthDto {
  status: 'ok' | 'degraded' | 'down'
  name?: string
  lastChecked?: string
  error?: string
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down'
  services: {
    brain: ServiceHealthDto
    executor: ServiceHealthDto
  }
}

export interface ConfigResponse {
  brain: {
    apiUrl: string
    homePath: string
  }
  executor: {
    baseUrl: string
    model: string
    apiKeySet: boolean
  }
}

export type AgentTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface AgentTask {
  id: string
  prompt: string
  status: AgentTaskStatus
  conversationId?: string
  createdAt: string
  finishedAt?: string
  result?: Record<string, unknown>
  error?: string
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface MessageDto {
  id: number
  conversationId: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  createdAt: string
}

export interface ToolCallDto {
  id: number
  conversationId: string | null
  toolName: string
  params: Record<string, unknown> | null
  result: Record<string, unknown> | null
  durationMs: number | null
  createdAt: string
}

export interface ListTasksResponse {
  tasks: AgentTask[]
  nextCursor?: string
}

export interface TaskDetailResponse {
  task: AgentTask
  messages: MessageDto[]
  toolCalls: ToolCallDto[]
}

// ---------------------------------------------------------------------------
// PLAN-004 fleet (manager registry) — typed fetchers for /api/workers/*
//
// Errors are normalised into `WorkerApiError` so the wizard can branch on
// `code` instead of inspecting status + body shapes. Backend mapping (see
// apps/api/src/dashboard/registry/routes.ts):
//   401 → { error: { code: 'auth-failed' } }
//   404 → { error: { code: 'not-found' } }
//   409 → { error: { code: 'already-registered', workerId } }
//   502 → { error: { code: 'worker-unreachable' | 'invalid-worker-info', message } }
// ---------------------------------------------------------------------------

export type WorkerApiErrorCode
  = | 'auth-failed'
    | 'auth-required'
    | 'already-registered'
    | 'worker-unreachable'
    | 'invalid-worker-info'
    | 'not-found'
    | 'invalid-body'
    | 'invalid-config'
    | 'version-conflict'
    | 'invalid-if-match'
    | 'quota-exceeded'
    | 'launch-timeout'
    | 'launch-failed'
    | 'unknown'

interface WorkerApiErrorBody {
  error?: {
    code?: string
    message?: string
    workerId?: string
    details?: unknown
    expected?: number
    actual?: number
    /** For `quota-exceeded` responses: the `MANAGER_MAX_WORKERS` cap. */
    limit?: number
    /** For `quota-exceeded` responses: the current row count. */
    current?: number
  }
}

export class WorkerApiError extends Error {
  readonly status: number
  readonly code: WorkerApiErrorCode
  readonly workerId?: string
  readonly details?: unknown
  /** For `version-conflict` responses: the `If-Match` version the client sent. */
  readonly expectedVersion?: number
  /** For `version-conflict` responses: the current version on the worker. */
  readonly actualVersion?: number
  /** For `quota-exceeded` responses: the configured cap. */
  readonly quotaLimit?: number
  /** For `quota-exceeded` responses: the current row count. */
  readonly quotaCurrent?: number

  constructor(status: number, body: unknown) {
    const parsed = (body && typeof body === 'object' ? body : {}) as WorkerApiErrorBody
    const code = (parsed.error?.code as WorkerApiErrorCode | undefined) ?? 'unknown'
    super(parsed.error?.message ?? `worker api ${status}`)
    this.name = 'WorkerApiError'
    this.status = status
    this.code = code
    this.workerId = parsed.error?.workerId
    this.details = parsed.error?.details
    this.expectedVersion = parsed.error?.expected
    this.actualVersion = parsed.error?.actual
    this.quotaLimit = parsed.error?.limit
    this.quotaCurrent = parsed.error?.current
  }
}

async function workerRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await request<T>(method, path, body)
  }
  catch (err) {
    if (err && typeof err === 'object' && 'status' in err)
      throw new WorkerApiError((err as ApiError).status, (err as ApiError).body)
    throw err
  }
}

export interface RegisterWorkerInput {
  baseUrl: string
  apiToken: string
  displayName: string
}

export interface UpdateWorkerInput {
  displayName?: string
  baseUrl?: string
}

interface WorkersListResponse {
  workers: SafeRegisteredWorker[]
}

export async function listWorkers(): Promise<SafeRegisteredWorker[]> {
  const res = await workerRequest<WorkersListResponse>('GET', '/api/workers')
  return res.workers
}

export function getWorker(id: string): Promise<SafeRegisteredWorker> {
  return workerRequest<SafeRegisteredWorker>('GET', `/api/workers/${encodeURIComponent(id)}`)
}

export function registerWorker(input: RegisterWorkerInput): Promise<SafeRegisteredWorker> {
  return workerRequest<SafeRegisteredWorker>('POST', '/api/workers/register', input)
}

export function updateWorker(id: string, patch: UpdateWorkerInput): Promise<SafeRegisteredWorker> {
  return workerRequest<SafeRegisteredWorker>('PATCH', `/api/workers/${encodeURIComponent(id)}`, patch)
}

export async function deleteWorker(id: string): Promise<void> {
  await workerRequest<unknown>('DELETE', `/api/workers/${encodeURIComponent(id)}`)
}

// ---------------------------------------------------------------------------
// PLAN-010 §P2 + §P6 — manager-driven worker creation.
// ---------------------------------------------------------------------------

export interface DashboardCapabilities {
  /** True when MANAGER_CAN_LAUNCH=true AND a supervisor is wired up. */
  canLaunch: boolean
  /** MANAGER_MAX_WORKERS value or null when no cap is set. */
  maxWorkers: number | null
  /** Current count of rows in `registered_workers`. */
  currentWorkers: number
}

export function getCapabilities(): Promise<DashboardCapabilities> {
  return workerRequest<DashboardCapabilities>('GET', '/api/workers/capabilities')
}

export interface LaunchWorkerInput {
  displayName: string
  /** Optional — force a specific workerId for deterministic replay / tests. */
  forceId?: string
}

/**
 * Backend returns the registered-worker row plus a one-time plaintext
 * `apiToken`. The token never appears on any subsequent GET — the UI must
 * surface it to the operator in the success step.
 */
export type LaunchWorkerResponse = SafeRegisteredWorker & { apiToken: string }

export function launchWorker(input: LaunchWorkerInput): Promise<LaunchWorkerResponse> {
  return workerRequest<LaunchWorkerResponse>('POST', '/api/workers/launch-local', input)
}

// ---------------------------------------------------------------------------
// PLAN-004 fleet — proxy-worker fetchers (go through /api/workers/:id/proxy/worker/*)
//
// The dashboard never talks to individual workers directly; it calls the
// manager's pass-through which decrypts the stored bearer token and forwards.
// Non-2xx responses are normalised onto `WorkerApiError` so UI can branch on
// `code` (e.g. `version-conflict` for optimistic-concurrency failures).
// ---------------------------------------------------------------------------

function proxyPath(id: string, suffix: string): string {
  return `/api/workers/${encodeURIComponent(id)}/proxy/worker${suffix}`
}

async function workerProxyRequest<T>(
  method: string,
  id: string,
  suffix: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetch(proxyPath(id, suffix), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const contentType = res.headers.get('content-type') ?? ''
  const parsed = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null)

  if (!res.ok)
    throw new WorkerApiError(res.status, parsed)

  return parsed as T
}

export function getWorkerInfo(id: string): Promise<WorkerInfo> {
  return workerProxyRequest<WorkerInfo>('GET', id, '/info')
}

export interface WorkerConfigResponse {
  config: WorkerConfig
  version: number
}

export function getWorkerConfig(id: string): Promise<WorkerConfigResponse> {
  return workerProxyRequest<WorkerConfigResponse>('GET', id, '/config')
}

export interface PutWorkerConfigResponse extends WorkerConfigResponse {
  runtimeReload: 'ok' | 'failed'
}

export function putWorkerConfig(
  id: string,
  body: WorkerConfig,
  options: { ifMatchVersion?: number } = {},
): Promise<PutWorkerConfigResponse> {
  const headers: Record<string, string> = {}
  if (options.ifMatchVersion !== undefined)
    headers['If-Match'] = String(options.ifMatchVersion)
  return workerProxyRequest<PutWorkerConfigResponse>('PUT', id, '/config', body, headers)
}

export async function listWorkerSecrets(id: string): Promise<{ keys: string[] }> {
  return workerProxyRequest<{ keys: string[] }>('GET', id, '/secrets')
}

export async function putWorkerSecret(id: string, key: string, value: string): Promise<void> {
  await workerProxyRequest<unknown>(
    'PUT',
    id,
    `/secrets/${encodeURIComponent(key)}`,
    { value },
  )
}

export async function deleteWorkerSecret(id: string, key: string): Promise<void> {
  await workerProxyRequest<unknown>('DELETE', id, `/secrets/${encodeURIComponent(key)}`)
}

export interface BrainTestRow {
  id: string
  type: BrainSourceConfig['type'] | 'multi'
  status: ServiceStatus['status'] | WorkerComponentStatus
  errorMessage?: string
}

export function testWorkerBrain(id: string): Promise<{ brains: BrainTestRow[] }> {
  return workerProxyRequest<{ brains: BrainTestRow[] }>('POST', id, '/brain/test')
}

export interface ExecutorTestRow {
  type: EngineKind
  status: ServiceStatus['status'] | 'unknown' | 'degraded'
  tinyProbe?: {
    ok: boolean
    latencyMs: number
    output?: string
  }
  probeError?: string
}

export function testWorkerExecutor(
  id: string,
  body: { probe?: boolean } = {},
): Promise<{ executor: ExecutorTestRow }> {
  return workerProxyRequest<{ executor: ExecutorTestRow }>('POST', id, '/executor/test', body)
}

export interface ChannelTestResponse {
  sent: boolean
  platformResponse?: unknown
  error?: string
}

export function testWorkerChannel(
  id: string,
  channel: ChannelType,
  body: { chatId?: string, text?: string } = {},
): Promise<ChannelTestResponse> {
  return workerProxyRequest<ChannelTestResponse>(
    'POST',
    id,
    `/channels/${encodeURIComponent(channel)}/test`,
    body,
  )
}

export interface RotateWorkerTokenResponse {
  /** ISO-8601 timestamp the manager observed the rotation. */
  rotatedAt: string
  /** Last four characters of the new token — UI hint, never the full plaintext. */
  lastFourOfNewToken: string
}

/**
 * Rotate a worker's bearer token via the manager wrapper at
 * `POST /api/workers/:id/rotate-token`. The wrapper instructs the worker to
 * mint a new token AND immediately re-encrypts it into
 * `registered_workers.apiTokenEnc`, so subsequent proxy + poll calls keep
 * authenticating. The plaintext is intentionally NOT returned — operators
 * who need it call the worker directly via the `/proxy/worker/token/rotate`
 * pass-through.
 */
export function rotateWorkerToken(id: string): Promise<RotateWorkerTokenResponse> {
  return workerRequest<RotateWorkerTokenResponse>(
    'POST',
    `/api/workers/${encodeURIComponent(id)}/rotate-token`,
  )
}

/**
 * FEAT-018 — 引擎可达性。每个 EngineKind 返回至少一条结果；`acp` 展开为
 * `gemini` / `qwen` 两条。`refresh=true` 在查询串中附加 `?refresh=1`，绕过
 * worker 端 10 分钟 in-memory 缓存。
 */
export function getWorkerEngines(
  id: string,
  options: { refresh?: boolean } = {},
): Promise<EngineAvailabilityResponse> {
  const suffix = options.refresh ? '/engines?refresh=1' : '/engines'
  return workerProxyRequest<EngineAvailabilityResponse>('GET', id, suffix)
}
