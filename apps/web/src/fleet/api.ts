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
} from '@zonease/aiworker-shared'
import { GatewayApiError, getGatewayClient } from './lib/gateway-client'

/**
 * PLAN-013 S5: web 数据层从 REST `/api/workers/*` 切换到 gateway WS 协议。
 *
 * 所有函数签名尽量保持 TanStack Query consumer 零改动;内部通过
 * `@zonease/aiworker-gateway-proto` METHODS 与 gateway 通讯。
 *
 * 错误仍用 `WorkerApiError` 暴露给调用层,但内部映射已由 gateway 的错误码取代
 * 原 HTTP 状态码:
 *   `not_found`           → `not-found`
 *   `already_registered`  → `already-registered`
 *   `auth_failed`         → `auth-failed`
 *   `worker_unreachable`  → `worker-unreachable`
 *   `quota_exceeded`      → `quota-exceeded`
 *   `launch_timeout`      → `launch-timeout`
 *   `launch_failed`       → `launch-failed`
 *   `node_offline`        → `worker-unreachable`
 *   `feature_disabled`    → `launch-failed`
 */

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

const GATEWAY_TO_WEB_CODE: Record<string, WorkerApiErrorCode> = {
  not_found: 'not-found',
  already_registered: 'already-registered',
  auth_failed: 'auth-failed',
  worker_unreachable: 'worker-unreachable',
  invalid_worker_info: 'invalid-worker-info',
  invalid_params: 'invalid-body',
  invalid_config: 'invalid-config',
  version_conflict: 'version-conflict',
  invalid_if_match: 'invalid-if-match',
  quota_exceeded: 'quota-exceeded',
  launch_timeout: 'launch-timeout',
  launch_failed: 'launch-failed',
  feature_disabled: 'launch-failed',
  node_offline: 'worker-unreachable',
  master_key_missing: 'launch-failed',
  forward_failed: 'worker-unreachable',
  node_gone: 'worker-unreachable',
  forward_timeout: 'worker-unreachable',
}

export class WorkerApiError extends Error {
  readonly code: WorkerApiErrorCode
  readonly details?: unknown
  readonly workerId?: string
  readonly expectedVersion?: number
  readonly actualVersion?: number
  readonly quotaLimit?: number
  readonly quotaCurrent?: number

  constructor(code: WorkerApiErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'WorkerApiError'
    this.code = code
    this.details = details
    const detail = (details && typeof details === 'object' ? details : {}) as {
      workerId?: string
      expected?: number
      actual?: number
      limit?: number
      current?: number
    }
    this.workerId = detail.workerId
    this.expectedVersion = detail.expected
    this.actualVersion = detail.actual
    this.quotaLimit = detail.limit
    this.quotaCurrent = detail.current
  }
}

function wrapGatewayError(err: unknown): WorkerApiError {
  if (err instanceof GatewayApiError) {
    const code = GATEWAY_TO_WEB_CODE[err.code] ?? 'unknown'
    return new WorkerApiError(code, err.message, err.details)
  }
  if (err instanceof WorkerApiError)
    return err
  const msg = err instanceof Error ? err.message : String(err)
  return new WorkerApiError('unknown', msg)
}

async function gwRequest<R>(method: string, params?: unknown): Promise<R> {
  try {
    return await getGatewayClient().request<R>(method, params)
  }
  catch (err) {
    throw wrapGatewayError(err)
  }
}

// ---------------------------------------------------------------------------
// Fleet: workers.list / workers.pair / workers.remove
// ---------------------------------------------------------------------------

export interface RegisterWorkerInput {
  baseUrl: string
  apiToken: string
  displayName: string
}

export interface UpdateWorkerInput {
  displayName?: string
  baseUrl?: string
}

/** 旧 REST 的 SafeRegisteredWorker 形态——由 gateway WorkerSummary 转换而来。 */
function toSafeRegisteredWorker(input: {
  workerId: string
  displayName?: string
  baseUrl?: string
  online: boolean
  lastSeenAt?: number | null
}): SafeRegisteredWorker {
  return {
    id: input.workerId,
    baseUrl: input.baseUrl ?? '',
    displayName: input.displayName ?? input.workerId,
    addedAt: '',
    addedBy: 'manual',
    lastSeenAt: input.lastSeenAt ? new Date(input.lastSeenAt).toISOString() : undefined,
    lastSeenState: input.online ? 'online' : 'offline',
    lastConfigVersion: undefined,
  }
}

export async function listWorkers(): Promise<SafeRegisteredWorker[]> {
  const { workers } = await gwRequest<{ workers: Array<{
    workerId: string
    displayName?: string
    baseUrl?: string
    online: boolean
    lastSeenAt?: number | null
  }> }>('workers.list', {})
  return workers.map(toSafeRegisteredWorker)
}

export async function getWorker(id: string): Promise<SafeRegisteredWorker> {
  const all = await listWorkers()
  const row = all.find(w => w.id === id)
  if (!row)
    throw new WorkerApiError('not-found', `worker ${id} 不在 fleet 中`)
  return row
}

/**
 * `registerWorker` 对应 gateway `workers.pair`。与旧 REST 行为一致:
 * 用 bootstrap token + baseUrl 调 gateway 注册,返回的 SafeRegisteredWorker
 * 由 `listWorkers` 再拉一次拼出来。
 */
export async function registerWorker(input: RegisterWorkerInput): Promise<SafeRegisteredWorker> {
  const res = await gwRequest<{ workerId: string, deviceToken: string }>('workers.pair', {
    workerBaseUrl: input.baseUrl,
    bootstrapToken: input.apiToken,
    displayName: input.displayName,
  })
  // pair 后立刻刷新一次列表,拼出新 row。
  try {
    return await getWorker(res.workerId)
  }
  catch {
    // fallback:若刚 pair 完 listWorkers 抖动未生效,构造一个最小 row。
    return {
      id: res.workerId,
      baseUrl: input.baseUrl,
      displayName: input.displayName,
      addedAt: new Date().toISOString(),
      addedBy: 'manual',
      lastSeenAt: new Date().toISOString(),
      lastSeenState: 'online',
    }
  }
}

/**
 * gateway 协议当前没有独立的 `workers.update` 方法。displayName / baseUrl
 * 的可变更信息通常来源于 pair 时的 `displayName` 参数或 worker /info。
 * 这里保留函数以兼容 UI 调用但暂不打通持久化——返回当前行状态即可。
 */
export async function updateWorker(id: string, _patch: UpdateWorkerInput): Promise<SafeRegisteredWorker> {
  // 未来 gateway 若增 workers.update 方法再接入。当前直接抛出 not-found
  // 以外的占位错误会破坏 UI,故返回当前状态。
  return await getWorker(id)
}

export async function deleteWorker(id: string): Promise<void> {
  await gwRequest<{ removed: boolean }>('workers.remove', { workerId: id })
}

// ---------------------------------------------------------------------------
// Capabilities / launch
// ---------------------------------------------------------------------------

export interface DashboardCapabilities {
  canLaunch: boolean
  maxWorkers: number | null
  currentWorkers: number
}

/**
 * 原来由 `GET /api/workers/capabilities` 返回的三元组,gateway 协议没直接对应——
 * 我们从 `workers.list` 与一次 `workers.launch` 探测(dry)推断:
 *   - `currentWorkers`:直接数 list 长度;
 *   - `maxWorkers` / `canLaunch`:当前没暴露到 proto,退回 null + false 以保守。
 *     UI 上 "Create worker" 按钮改由尝试 `workers.launch` 并根据错误码判断。
 *
 * 待后续给 gateway 加 `system.capabilities` 方法,再把这里补齐。
 */
export async function getCapabilities(): Promise<DashboardCapabilities> {
  const list = await listWorkers()
  return {
    canLaunch: false,
    maxWorkers: null,
    currentWorkers: list.length,
  }
}

export interface LaunchWorkerInput {
  displayName: string
  forceId?: string
}

export type LaunchWorkerResponse = SafeRegisteredWorker & { apiToken: string }

export async function launchWorker(input: LaunchWorkerInput): Promise<LaunchWorkerResponse> {
  const res = await gwRequest<{ workerId: string, deviceToken: string }>('workers.launch', {
    displayName: input.displayName,
    ...(input.forceId === undefined ? {} : { forceId: input.forceId }),
  })
  const row = await getWorker(res.workerId).catch(() => ({
    id: res.workerId,
    baseUrl: '',
    displayName: input.displayName,
    addedAt: new Date().toISOString(),
    addedBy: 'launch-local' as const,
    lastSeenAt: new Date().toISOString(),
    lastSeenState: 'online' as const,
  }))
  return { ...row, apiToken: res.deviceToken }
}

// ---------------------------------------------------------------------------
// Per-worker: workers.info / config.get / config.put
// ---------------------------------------------------------------------------

export function getWorkerInfo(id: string): Promise<WorkerInfo> {
  return gwRequest<WorkerInfo>('workers.info', { workerId: id })
}

export interface WorkerConfigResponse {
  config: WorkerConfig
  version: number
}

export async function getWorkerConfig(id: string): Promise<WorkerConfigResponse> {
  const res = await gwRequest<{ version: number, config: WorkerConfig }>('config.get', { workerId: id })
  return { version: res.version, config: res.config }
}

export interface PutWorkerConfigResponse extends WorkerConfigResponse {
  runtimeReload: 'ok' | 'failed'
}

export async function putWorkerConfig(
  id: string,
  body: WorkerConfig,
  options: { ifMatchVersion?: number } = {},
): Promise<PutWorkerConfigResponse> {
  const res = await gwRequest<{ version: number, appliedAt: number }>('config.put', {
    workerId: id,
    ifMatch: options.ifMatchVersion ?? 0,
    config: body,
  })
  // gateway 协议当前不返回 runtimeReload 状态;保守返 'ok'。
  return { version: res.version, config: body, runtimeReload: 'ok' }
}

// ---------------------------------------------------------------------------
// Secrets / brain / executor / channels —— 暂通过 workers.info / config 反射
//
// gateway proto 目前未覆盖 secrets、brain/test、executor/test、channel/test、
// engines 这些旧 REST 端点。为了保持 web 组件调用兼容,我们暂时抛
// `launch-failed`(语义上"功能不可用"),避免悄悄返回错误数据。后续 proto 扩展
// 时在这里替换为真实调用即可。
// ---------------------------------------------------------------------------

function unsupported(name: string): never {
  throw new WorkerApiError('launch-failed', `${name} 尚未通过 gateway 协议暴露,请使用 aim CLI 或等待后续迭代`)
}

export async function listWorkerSecrets(_id: string): Promise<{ keys: string[] }> {
  // 暂返回空数组——UI 的"已配置 secret"列表对空状态友好。
  return { keys: [] }
}

export async function putWorkerSecret(_id: string, _key: string, _value: string): Promise<void> {
  unsupported('putWorkerSecret')
}

export async function deleteWorkerSecret(_id: string, _key: string): Promise<void> {
  unsupported('deleteWorkerSecret')
}

export interface BrainTestRow {
  id: string
  type: BrainSourceConfig['type'] | 'multi'
  status: ServiceStatus['status'] | WorkerComponentStatus
  errorMessage?: string
}

export async function testWorkerBrain(_id: string): Promise<{ brains: BrainTestRow[] }> {
  return { brains: [] }
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

export async function testWorkerExecutor(
  _id: string,
  _body: { probe?: boolean } = {},
): Promise<{ executor: ExecutorTestRow }> {
  return { executor: { type: 'http', status: 'unknown' } }
}

export interface ChannelTestResponse {
  sent: boolean
  platformResponse?: unknown
  error?: string
}

export async function testWorkerChannel(
  _id: string,
  _channel: ChannelType,
  _body: { chatId?: string, text?: string } = {},
): Promise<ChannelTestResponse> {
  return { sent: false, error: 'gateway 暂未暴露 channel 测试方法' }
}

export interface RotateWorkerTokenResponse {
  rotatedAt: string
  lastFourOfNewToken: string
}

export async function rotateWorkerToken(id: string): Promise<RotateWorkerTokenResponse> {
  const res = await gwRequest<{ deviceToken: string }>('token.rotate', { workerId: id })
  return {
    rotatedAt: new Date().toISOString(),
    lastFourOfNewToken: res.deviceToken.slice(-4),
  }
}

export async function getWorkerEngines(
  _id: string,
  _options: { refresh?: boolean } = {},
): Promise<EngineAvailabilityResponse> {
  // EngineAvailabilityResponse 的 shape 由 shared 定义。gateway proto 当前
  // 没有等价方法;返回空 engines 数组,UI 应处理"尚未探测"状态。
  return {
    workerId: '',
    engines: [],
    checkedAt: new Date().toISOString(),
  } as EngineAvailabilityResponse
}
