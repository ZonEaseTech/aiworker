import type { SafeRegisteredWorker } from '@zonease/aiworker-shared'
import type { LaunchWorkerInput, PairWorkerInput } from '@/fleet/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  getPresence,
  getWorker,
  launchWorker,
  listWorkers,
  pairWorker,
  removeWorker,
  rotateWorkerToken,
  stopWorker,
} from '@/fleet/api'
import { useWorkerStore } from '@/fleet/stores/worker'

const WORKERS_KEY = ['fleet', 'workers'] as const
const workerKey = (id: string) => ['fleet', 'workers', id] as const
const PRESENCE_KEY = ['fleet', 'presence'] as const

/**
 * Live list of registered workers. Mirrors successful results into the
 * Zustand store so non-React surfaces (e.g. the top-bar worker switcher)
 * can read the latest snapshot without subscribing to TanStack Query.
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
    queryKey: id ? workerKey(id) : ['fleet', 'workers', '__missing__'],
    queryFn: () => getWorker(id as string),
    enabled: Boolean(id),
    staleTime: 10_000,
  })
}

export function usePairWorker() {
  const qc = useQueryClient()
  return useMutation<
    Awaited<ReturnType<typeof pairWorker>>,
    Error,
    PairWorkerInput
  >({
    mutationFn: pairWorker,
    onSuccess: ({ worker }) => {
      qc.invalidateQueries({ queryKey: WORKERS_KEY })
      qc.setQueryData<SafeRegisteredWorker>(workerKey(worker.id), worker)
    },
  })
}

export function useLaunchWorker() {
  const qc = useQueryClient()
  return useMutation<
    Awaited<ReturnType<typeof launchWorker>>,
    Error,
    LaunchWorkerInput
  >({
    mutationFn: launchWorker,
    onSuccess: ({ worker }) => {
      qc.invalidateQueries({ queryKey: WORKERS_KEY })
      qc.setQueryData<SafeRegisteredWorker>(workerKey(worker.id), worker)
    },
  })
}

export function useRemoveWorker() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: removeWorker,
    onSuccess: (_void, id) => {
      qc.invalidateQueries({ queryKey: WORKERS_KEY })
      qc.removeQueries({ queryKey: workerKey(id) })
    },
  })
}

export function useStopWorker() {
  const qc = useQueryClient()
  return useMutation<{ stopped: boolean }, Error, string>({
    mutationFn: stopWorker,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WORKERS_KEY })
    },
  })
}

export function useRotateWorkerToken() {
  const qc = useQueryClient()
  return useMutation<
    Awaited<ReturnType<typeof rotateWorkerToken>>,
    Error,
    string
  >({
    mutationFn: rotateWorkerToken,
    onSuccess: () => {
      // 仅作为一次性凭据展示，不需要刷新 list（lastSeenAt 等元数据不变）。
      qc.invalidateQueries({ queryKey: WORKERS_KEY })
    },
  })
}

/**
 * Fleet 视角的 system.presence 30s polling。专门用于 `/admin/presence` 卡片，
 * 与 workers.list（10s）独立刷新；list 与 presence 各自的 staleTime 不会
 * 互相干扰。
 */
export function usePresence() {
  return useQuery({
    queryKey: PRESENCE_KEY,
    queryFn: getPresence,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}
