import type { SafeRegisteredWorker } from '@aiworker/shared'
import { create } from 'zustand'

interface WorkerStoreState {
  /** The worker id whose nested route is currently mounted, or `null` on `/workers`. */
  currentWorkerId: string | null
  /** Most recent successful list snapshot. Hydrated by the workers-list query. */
  registered: SafeRegisteredWorker[]
  setCurrentWorkerId: (id: string | null) => void
  setRegistered: (workers: SafeRegisteredWorker[]) => void
}

export const useWorkerStore = create<WorkerStoreState>(set => ({
  currentWorkerId: null,
  registered: [],
  setCurrentWorkerId: id => set({ currentWorkerId: id }),
  setRegistered: workers => set({ registered: workers }),
}))
