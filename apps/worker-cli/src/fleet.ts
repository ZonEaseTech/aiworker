import type { LocalPaths } from './aiworker'

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const FLEET_INDEX_FILENAME = 'fleet.json'
export const FLEET_WORKERS_DIRNAME = 'workers'
export const FLEET_DEFAULT_BASE_PORT = 9217
export const FLEET_ADOPTED_HOME = '.'
export const FLEET_INDEX_VERSION = 1

export interface FleetWorker {
  app: string
  createdAt: string
  home: string
  id: string
  port: number
}

export interface FleetIndex {
  default: string | null
  version: number
  workers: FleetWorker[]
}

/**
 * 构造单个 worker home 的 {@link LocalPaths}。纯函数：仅由 `home` 派生，**不读环境变量**，
 * 因此 fleet 内每个 worker 的 dbPath 永远落到自己的 home 下，不会被 `WORKER_DB_PATH`
 * 折叠成同一个 DB。`resolveCliLocalPaths` 在 wrapper 层单独叠加 `WORKER_DB_PATH` 覆盖。
 */
export function buildLocalPaths(home: string): LocalPaths {
  return {
    daemonMetaFile: path.join(home, 'aiworker-daemon.json'),
    dbPath: path.join(home, 'aiworker.db'),
    home,
    logFile: path.join(home, 'aiworker-daemon.log'),
    pidFile: path.join(home, 'aiworker-daemon.pid'),
    workersRoot: home,
  }
}

export function fleetIndexPath(root: string): string {
  return path.join(root, FLEET_INDEX_FILENAME)
}

export function workerHomeDir(root: string, id: string): string {
  return path.join(root, FLEET_WORKERS_DIRNAME, id)
}

/**
 * 解析一条 fleet 记录的绝对 home：`home === '.'`（adopt-in-place 的旧默认 home）→ fleet 根本身；
 * 其它相对路径 → fleet 根下解析。
 */
export function resolveWorkerHome(root: string, worker: FleetWorker): string {
  return worker.home === FLEET_ADOPTED_HOME
    ? root
    : path.resolve(root, worker.home)
}

export function fleetWorkerPaths(root: string, worker: FleetWorker): LocalPaths {
  return buildLocalPaths(resolveWorkerHome(root, worker))
}

function emptyFleetIndex(): FleetIndex {
  return { default: null, version: FLEET_INDEX_VERSION, workers: [] }
}

function normalizeFleetWorker(value: unknown): FleetWorker | null {
  if (!value || typeof value !== 'object')
    return null
  const record = value as Record<string, unknown>
  if (
    typeof record.id !== 'string'
    || typeof record.app !== 'string'
    || typeof record.home !== 'string'
    || typeof record.port !== 'number'
  ) {
    return null
  }
  return {
    app: record.app,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString(),
    home: record.home,
    id: record.id,
    port: record.port,
  }
}

function normalizeFleetIndex(value: unknown): FleetIndex {
  if (!value || typeof value !== 'object')
    return emptyFleetIndex()
  const record = value as Record<string, unknown>
  const workers = Array.isArray(record.workers)
    ? record.workers.map(normalizeFleetWorker).filter((worker): worker is FleetWorker => worker !== null)
    : []
  const defaultId = typeof record.default === 'string' && workers.some(worker => worker.id === record.default)
    ? record.default
    : null
  return {
    default: defaultId,
    version: typeof record.version === 'number' ? record.version : FLEET_INDEX_VERSION,
    workers,
  }
}

/** 读取 fleet 索引；缺省（无 fleet.json 或解析失败）返回空 index。 */
export function readFleet(root: string): FleetIndex {
  const indexPath = fleetIndexPath(root)
  if (!existsSync(indexPath))
    return emptyFleetIndex()
  try {
    return normalizeFleetIndex(JSON.parse(readFileSync(indexPath, 'utf8')))
  }
  catch {
    return emptyFleetIndex()
  }
}

export function writeFleet(root: string, index: FleetIndex): void {
  mkdirSync(root, { recursive: true })
  writeFileSync(fleetIndexPath(root), `${JSON.stringify(index, null, 2)}\n`)
}

/**
 * 取未被 index 占用的最小端口（≥ base）。纯函数：仅避开 index 内已登记端口，
 * **不探测系统端口占用**（live 探测在启动时单独做，不进可测纯函数）。
 */
export function allocatePort(index: FleetIndex, base = FLEET_DEFAULT_BASE_PORT): number {
  const used = new Set(index.workers.map(worker => worker.port))
  let port = base
  while (used.has(port))
    port += 1
  return port
}

/** 解析 fleet 默认 worker：`index.default` 命中则取它，否则取第一个。空 index → null。 */
export function resolveDefault(index: FleetIndex): FleetWorker | null {
  if (index.workers.length === 0)
    return null
  if (index.default) {
    const match = index.workers.find(worker => worker.id === index.default)
    if (match)
      return match
  }
  return index.workers[0] ?? null
}

export interface ResolveTargetsInput {
  all?: boolean
  id?: string
}

/**
 * 解析启动/停止目标：
 * - `all` → 全部；
 * - `id` → 该项（不存在抛错）；
 * - 无参 → default（缺省第一个）。
 *
 * 空 index 由调用方先 seed/adopt；此处空 index 返回空数组。
 */
export function resolveTargets(index: FleetIndex, input: ResolveTargetsInput = {}): FleetWorker[] {
  if (input.all)
    return [...index.workers]
  if (input.id) {
    const match = index.workers.find(worker => worker.id === input.id)
    if (!match)
      throw new Error(`fleet worker not found: ${input.id}`)
    return [match]
  }
  const fallback = resolveDefault(index)
  return fallback ? [fallback] : []
}

/** 按 id 插入或替换一条 fleet 记录；首个 worker 自动成为 default。 */
export function upsertFleetWorker(index: FleetIndex, worker: FleetWorker): FleetIndex {
  const workers = index.workers.some(existing => existing.id === worker.id)
    ? index.workers.map(existing => existing.id === worker.id ? worker : existing)
    : [...index.workers, worker]
  return {
    default: index.default ?? worker.id,
    version: index.version,
    workers,
  }
}

/** 设 fleet 默认 worker；id 不存在抛错。 */
export function setDefault(index: FleetIndex, id: string): FleetIndex {
  if (!index.workers.some(worker => worker.id === id))
    throw new Error(`fleet worker not found: ${id}`)
  return { ...index, default: id }
}

export interface AdoptLegacyHomeOptions {
  /** 读旧默认 home DB 的单-active worker（id/app）。返回 null = 无可登记 worker。 */
  readLegacyWorker: (paths: LocalPaths) => { app: string, id: string } | null
  /** 读旧 home daemon.json 的端口（若存在）。 */
  readLegacyPort?: (paths: LocalPaths) => number | null
  now?: () => Date
}

/**
 * adopt-in-place 软兼容：若 fleet 根下存在旧默认 home（`aiworker.db`）且其有单-active worker、
 * 且**无** `fleet.json` → 生成 fleet.json，把旧 home 原地登记为首个 worker（`home: '.'`），
 * id/app 取自其 DB 单-active worker，端口取旧 daemon.json 或默认 base。**不搬动任何文件**。
 *
 * 返回写出的 index；无需 adopt（已有 fleet.json，或无旧 DB，或旧 DB 无 worker）时返回当前 index。
 */
export function adoptLegacyHome(root: string, options: AdoptLegacyHomeOptions): FleetIndex {
  const existing = readFleet(root)
  if (existsSync(fleetIndexPath(root)) || existing.workers.length > 0)
    return existing

  const legacyPaths = buildLocalPaths(root)
  if (!existsSync(legacyPaths.dbPath))
    return existing

  const legacyWorker = options.readLegacyWorker(legacyPaths)
  if (!legacyWorker)
    return existing

  const port = options.readLegacyPort?.(legacyPaths) ?? FLEET_DEFAULT_BASE_PORT
  const createdAt = (options.now?.() ?? new Date()).toISOString()
  const index: FleetIndex = {
    default: legacyWorker.id,
    version: FLEET_INDEX_VERSION,
    workers: [
      {
        app: legacyWorker.app,
        createdAt,
        home: FLEET_ADOPTED_HOME,
        id: legacyWorker.id,
        port,
      },
    ],
  }
  writeFleet(root, index)
  return index
}
