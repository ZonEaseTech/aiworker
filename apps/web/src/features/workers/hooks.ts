import type { SafeRegisteredWorker } from '@aiworker/shared'
import type { RegisterWorkerInput, UpdateWorkerInput } from '@/lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  deleteWorker,
  getWorker,
  listWorkers,
  registerWorker,
  updateWorker,
} from '@/lib/api'
import { useWorkerStore } from '@/stores/worker'

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
