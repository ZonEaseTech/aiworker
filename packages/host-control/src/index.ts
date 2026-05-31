import type { WorkerAssignmentEnvelope, WorkerHealth } from '@zonease/aiworker-worker-control-protocol'

import { parseWorkerAssignmentEnvelope } from '@zonease/aiworker-worker-control-protocol'

export interface WorkerRegistryEntry {
  workerId: string
  // templateId 存 describe 响应的 appId，与 assignment.templateId 同指；Host 侧统一 Template 术语。
  templateId: string
  endpoint: string
  health: WorkerHealth
  assignment?: WorkerAssignmentEnvelope
}

export interface WorkerRegistry {
  register: (entry: Omit<WorkerRegistryEntry, 'assignment'>) => void
  list: () => WorkerRegistryEntry[]
  get: (workerId: string) => WorkerRegistryEntry | undefined
  assign: (workerId: string, envelope: unknown) => void
}

/**
 * Control-plane worker registry. v1 is in-memory; persistence is roadmap.
 * host-control imports ONLY worker-control-protocol — never any worker-* runtime
 * package — so the Host plane cannot reach into Worker runtime internals (C3/G5).
 */
export function createWorkerRegistry(): WorkerRegistry {
  const entries = new Map<string, WorkerRegistryEntry>()
  return {
    register(entry) {
      entries.set(entry.workerId, { ...entry })
    },
    list() {
      return [...entries.values()]
    },
    get(workerId) {
      return entries.get(workerId)
    },
    assign(workerId, envelope) {
      const entry = entries.get(workerId)
      if (!entry)
        throw new Error(`unknown worker: ${workerId}`)
      entry.assignment = parseWorkerAssignmentEnvelope(envelope)
    },
  }
}
