import type {
  AuditEventRecord,
  EnrollmentPendingPayload,
  PendingEnrollment,
  WorkerSummary,
} from '@zonease/aiworker-gateway-proto'
import type { SafeRegisteredWorker } from '@zonease/aiworker-shared'
import { GatewayApiError, getGatewayClient } from './lib/gateway-client'

/**
 * Fleet 视角的 API 客户端：所有调用都走 gateway WS（`/ws`）协议。
 *
 * 物理隔离要求：本文件**只**调用 `operator-to-gateway` 与 `operator-to-node`
 * 路由的 gateway 方法，永远不直接走 worker 的 `/api/worker/*` REST。worker
 * 自管入口（config / secrets / cron / approval / chat）由 worker bundle 自己
 * 托管在各 worker `:9217/admin/`，fleet UI 仅做「跳转」。
 *
 * gateway 错误码 → 前端 WorkerApiError code 的映射表保留与 PLAN-013 S5 一致，
 * 便于 mutation 路径上的错误提示文案不需要再修一遍。
 */

export type WorkerApiErrorCode
  = | 'auth-failed'
    | 'auth-required'
    | 'already-registered'
    | 'worker-unreachable'
    | 'invalid-worker-info'
    | 'not-found'
    | 'invalid-body'
    | 'quota-exceeded'
    | 'launch-timeout'
    | 'launch-failed'
    | 'feature-disabled'
    | 'unknown'

const GATEWAY_TO_WEB_CODE: Record<string, WorkerApiErrorCode> = {
  not_found: 'not-found',
  already_registered: 'already-registered',
  auth_failed: 'auth-failed',
  worker_unreachable: 'worker-unreachable',
  invalid_worker_info: 'invalid-worker-info',
  invalid_params: 'invalid-body',
  quota_exceeded: 'quota-exceeded',
  launch_timeout: 'launch-timeout',
  launch_failed: 'launch-failed',
  feature_disabled: 'feature-disabled',
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
  readonly quotaLimit?: number
  readonly quotaCurrent?: number

  constructor(code: WorkerApiErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'WorkerApiError'
    this.code = code
    this.details = details
    const detail = (details && typeof details === 'object' ? details : {}) as {
      workerId?: string
      limit?: number
      current?: number
    }
    this.workerId = detail.workerId
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
// workers.* —— fleet 列表 / pair / launch / remove / stop
// ---------------------------------------------------------------------------

function toSafeRegisteredWorker(input: WorkerSummary): SafeRegisteredWorker {
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
  const { workers } = await gwRequest<{ workers: WorkerSummary[] }>('workers.list', {})
  return workers.map(toSafeRegisteredWorker)
}

export async function getWorker(id: string): Promise<SafeRegisteredWorker> {
  const all = await listWorkers()
  const row = all.find(w => w.id === id)
  if (!row)
    throw new WorkerApiError('not-found', `worker ${id} 不在 fleet 中`)
  return row
}

export interface PairWorkerInput {
  baseUrl: string
  bootstrapToken: string
  displayName: string
}

/**
 * `pairWorker` 对应 gateway `workers.pair`：把已启动的 worker 通过 bootstrap
 * token 注册到 fleet。返回 deviceToken 由调用方一次性展示给 operator，关闭
 * 对话框时立即从内存清掉，**绝不**写入 sessionStorage / localStorage。
 */
export async function pairWorker(input: PairWorkerInput): Promise<{
  worker: SafeRegisteredWorker
  deviceToken: string
}> {
  const res = await gwRequest<{ workerId: string, deviceToken: string }>('workers.pair', {
    workerBaseUrl: input.baseUrl,
    bootstrapToken: input.bootstrapToken,
    displayName: input.displayName,
  })
  const worker = await getWorker(res.workerId).catch(() => ({
    id: res.workerId,
    baseUrl: input.baseUrl,
    displayName: input.displayName,
    addedAt: new Date().toISOString(),
    addedBy: 'manual' as const,
    lastSeenAt: new Date().toISOString(),
    lastSeenState: 'online' as const,
  }))
  return { worker, deviceToken: res.deviceToken }
}

export interface LaunchWorkerInput {
  displayName: string
  forceId?: string
}

export async function launchWorker(input: LaunchWorkerInput): Promise<{
  worker: SafeRegisteredWorker
  deviceToken: string
}> {
  const res = await gwRequest<{ workerId: string, deviceToken: string }>('workers.launch', {
    displayName: input.displayName,
    ...(input.forceId === undefined ? {} : { forceId: input.forceId }),
  })
  const worker = await getWorker(res.workerId).catch(() => ({
    id: res.workerId,
    baseUrl: '',
    displayName: input.displayName,
    addedAt: new Date().toISOString(),
    addedBy: 'launch-local' as const,
    lastSeenAt: new Date().toISOString(),
    lastSeenState: 'online' as const,
  }))
  return { worker, deviceToken: res.deviceToken }
}

export async function removeWorker(id: string): Promise<void> {
  await gwRequest<{ removed: boolean }>('workers.remove', { workerId: id })
}

export async function stopWorker(id: string): Promise<{ stopped: boolean }> {
  return await gwRequest<{ stopped: boolean }>('workers.stop', { workerId: id })
}

export async function rotateWorkerToken(id: string): Promise<{
  rotatedAt: string
  deviceToken: string
}> {
  const res = await gwRequest<{ deviceToken: string }>('token.rotate', { workerId: id })
  return { rotatedAt: new Date().toISOString(), deviceToken: res.deviceToken }
}

// ---------------------------------------------------------------------------
// enroll.* —— pending OTP 队列（FEAT-034 Phase 2）
// ---------------------------------------------------------------------------

export async function listPendingEnrollments(): Promise<PendingEnrollment[]> {
  const res = await gwRequest<{ pending: PendingEnrollment[] }>('enroll.list', {})
  return res.pending
}

export async function approveEnrollment(otp: string): Promise<{
  workerId: string
  deviceToken: string
}> {
  return await gwRequest<{ workerId: string, deviceToken: string }>('enroll.approve', { otp })
}

export async function rejectEnrollment(otp: string): Promise<{ rejected: boolean }> {
  return await gwRequest<{ rejected: boolean }>('enroll.reject', { otp })
}

export type { EnrollmentPendingPayload }

// ---------------------------------------------------------------------------
// audit.* —— fleet.db audit_events 浏览（FEAT-034 Phase 2）
// ---------------------------------------------------------------------------

export interface ListAuditEventsInput {
  limit?: number
  before?: number
  /** action 前缀过滤；非白名单字符（[a-zA-Z0-9._-]）会退回精确匹配。 */
  action?: string
  workerId?: string
}

export async function listAuditEvents(input: ListAuditEventsInput = {}): Promise<{
  events: AuditEventRecord[]
  hasMore: boolean
}> {
  return await gwRequest<{ events: AuditEventRecord[], hasMore: boolean }>('audit.list', input)
}

export type { AuditEventRecord }

// ---------------------------------------------------------------------------
// system.* —— presence
// ---------------------------------------------------------------------------

export interface PresenceSnapshot {
  now: number
  online: WorkerSummary[]
}

export async function getPresence(): Promise<PresenceSnapshot> {
  return await gwRequest<PresenceSnapshot>('system.presence', {})
}
