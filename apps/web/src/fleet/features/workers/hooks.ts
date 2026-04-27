import type {
  ChannelType,
  EngineAvailabilityResponse,
  SafeRegisteredWorker,
  WorkerConfig,
} from '@zonease/aiworker-shared'
import type {
  ChannelTestResponse,
  DashboardCapabilities,
  LaunchWorkerInput,
  LaunchWorkerResponse,
  PutWorkerConfigResponse,
  RegisterWorkerInput,
  UpdateWorkerInput,
  WorkerConfigResponse,
} from '@/fleet/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import {
  deleteWorker,
  deleteWorkerSecret,
  getCapabilities,
  getWorker,
  getWorkerConfig,
  getWorkerEngines,
  getWorkerInfo,
  launchWorker,
  listWorkers,
  listWorkerSecrets,
  putWorkerConfig,
  putWorkerSecret,
  registerWorker,
  rotateWorkerToken,
  testWorkerBrain,
  testWorkerChannel,
  testWorkerExecutor,
  updateWorker,
} from '@/fleet/api'
import { useWorkerStore } from '@/fleet/stores/worker'

const WORKERS_KEY = ['workers'] as const
const workerKey = (id: string) => ['workers', id] as const

/**
 * Live list of registered workers. Mirrors successful results into the
 * Zustand store so non-React surfaces (e.g. the top-bar worker switcher)
 * can read the latest snapshot without subscribing to TanStack Query.
 *
 * staleTime is intentionally short (10s) — PLAN-004 3.3's poller refreshes
 * `lastSeenState` server-side, and the dashboard wants those flips to surface
 * promptly after a register/unregister.
 */
export function useRegisteredWorkers() {
  const setRegistered = useWorkerStore(s => s.setRegistered)
  const query = useQuery({
    queryKey: WORKERS_KEY,
    queryFn: listWorkers,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (query.data)
      setRegistered(query.data)
  }, [query.data, setRegistered])

  return query
}

export function useRegisteredWorker(id: string | undefined) {
  return useQuery({
    queryKey: id ? workerKey(id) : ['workers', '__missing__'],
    queryFn: () => getWorker(id as string),
    enabled: Boolean(id),
    staleTime: 10_000,
  })
}

export function useRegisterWorker() {
  const qc = useQueryClient()
  return useMutation<SafeRegisteredWorker, Error, RegisterWorkerInput>({
    mutationFn: registerWorker,
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: WORKERS_KEY })
      qc.setQueryData(workerKey(row.id), row)
    },
  })
}

export function useUpdateWorker(id: string) {
  const qc = useQueryClient()
  return useMutation<SafeRegisteredWorker, Error, UpdateWorkerInput>({
    mutationFn: patch => updateWorker(id, patch),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: WORKERS_KEY })
      qc.setQueryData(workerKey(row.id), row)
    },
  })
}

export function useDeleteWorker() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: deleteWorker,
    onSuccess: (_void, id) => {
      qc.invalidateQueries({ queryKey: WORKERS_KEY })
      qc.removeQueries({ queryKey: workerKey(id) })
    },
  })
}

// ---------------------------------------------------------------------------
// PLAN-010 — Manager-driven worker creation.
// ---------------------------------------------------------------------------

const CAPABILITIES_KEY = ['dashboard', 'capabilities'] as const

/**
 * Capability flags drive the "Create worker" button's enabled state and the
 * quota hint on the wizard. 30s staleTime avoids hammering the fleet-count
 * query while still picking up env changes shortly after the dashboard
 * restarts.
 */
export function useDashboardCapabilities() {
  return useQuery<DashboardCapabilities>({
    queryKey: CAPABILITIES_KEY,
    queryFn: getCapabilities,
    staleTime: 30_000,
  })
}

export function useLaunchWorker() {
  const qc = useQueryClient()
  return useMutation<LaunchWorkerResponse, Error, LaunchWorkerInput>({
    mutationFn: launchWorker,
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: WORKERS_KEY })
      qc.invalidateQueries({ queryKey: CAPABILITIES_KEY })
      qc.setQueryData(workerKey(row.id), row)
    },
  })
}

// ---------------------------------------------------------------------------
// PLAN-004 4.2 — per-worker proxy queries/mutations. All go through the
// manager's `/api/workers/:id/proxy/worker/*` pass-through (3.2).
// ---------------------------------------------------------------------------

const workerInfoKey = (id: string) => ['workers', id, 'info'] as const
const workerConfigKey = (id: string) => ['workers', id, 'config'] as const
const workerSecretsKey = (id: string) => ['workers', id, 'secrets'] as const

export function useWorkerInfo(id: string) {
  return useQuery({
    queryKey: workerInfoKey(id),
    queryFn: () => getWorkerInfo(id),
    staleTime: 10_000,
    enabled: Boolean(id),
  })
}

export function useWorkerConfig(id: string) {
  return useQuery({
    queryKey: workerConfigKey(id),
    queryFn: () => getWorkerConfig(id),
    staleTime: 0,
    enabled: Boolean(id),
  })
}

export interface PutWorkerConfigVariables {
  config: WorkerConfig
  ifMatchVersion?: number
}

export function usePutWorkerConfig(id: string) {
  const qc = useQueryClient()
  return useMutation<PutWorkerConfigResponse, Error, PutWorkerConfigVariables>({
    mutationFn: ({ config, ifMatchVersion }) =>
      putWorkerConfig(id, config, ifMatchVersion === undefined ? {} : { ifMatchVersion }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: workerInfoKey(id) })
      qc.setQueryData<WorkerConfigResponse>(workerConfigKey(id), {
        config: res.config,
        version: res.version,
      })
    },
  })
}

export function useWorkerSecrets(id: string) {
  return useQuery({
    queryKey: workerSecretsKey(id),
    queryFn: () => listWorkerSecrets(id),
    staleTime: 0,
    enabled: Boolean(id),
  })
}

export function usePutWorkerSecret(id: string) {
  const qc = useQueryClient()
  return useMutation<void, Error, { key: string, value: string }>({
    mutationFn: ({ key, value }) => putWorkerSecret(id, key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workerSecretsKey(id) })
    },
  })
}

export function useDeleteWorkerSecret(id: string) {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: key => deleteWorkerSecret(id, key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workerSecretsKey(id) })
    },
  })
}

export function useTestWorkerBrain(id: string) {
  return useMutation({
    mutationFn: () => testWorkerBrain(id),
  })
}

export function useTestWorkerExecutor(id: string) {
  return useMutation<
    Awaited<ReturnType<typeof testWorkerExecutor>>,
    Error,
    { probe?: boolean } | undefined
  >({
    mutationFn: body => testWorkerExecutor(id, body ?? {}),
  })
}

export function useTestWorkerChannel(id: string) {
  return useMutation<
    ChannelTestResponse,
    Error,
    { channel: ChannelType, chatId?: string, text?: string }
  >({
    mutationFn: ({ channel, chatId, text }) =>
      testWorkerChannel(id, channel, {
        ...(chatId === undefined ? {} : { chatId }),
        ...(text === undefined ? {} : { text }),
      }),
  })
}

export function useRotateWorkerToken(id: string) {
  return useMutation({
    mutationFn: () => rotateWorkerToken(id),
  })
}

// ---------------------------------------------------------------------------
// FEAT-018 —— 引擎可达性探测。配套 worker 端 `GET /api/worker/engines`。
// 10 分钟 staleTime 与 worker 端缓存 TTL 对齐，避免双层缓存串扰。
// ---------------------------------------------------------------------------

const workerEnginesKey = (id: string) => ['workers', id, 'engines'] as const

export function useWorkerEngines(id: string | undefined) {
  return useQuery<EngineAvailabilityResponse>({
    queryKey: id ? workerEnginesKey(id) : ['workers', '__missing__', 'engines'],
    queryFn: () => getWorkerEngines(id as string),
    staleTime: 10 * 60_000,
    enabled: Boolean(id),
  })
}

/**
 * 触发一次强制刷新：附带 `?refresh=1` 绕过 worker 10 分钟缓存，再让 TanStack
 * Query 失效，这样配置面板上的徽标在操作员刚 `claude login` 之后就能即时更新。
 */
export function useRefreshWorkerEngines(id: string) {
  const qc = useQueryClient()
  return useCallback(async () => {
    const fresh = await getWorkerEngines(id, { refresh: true })
    qc.setQueryData<EngineAvailabilityResponse>(workerEnginesKey(id), fresh)
    return fresh
  }, [id, qc])
}
