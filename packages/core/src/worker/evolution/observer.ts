import type { WorkerEvent, WorkerEventBus } from '../events/bus'

import { evolutionObservations, getWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'

import consola from 'consola'

/**
 * Evolution observer: subscribes to orchestrator + channel events and writes
 * structured rows to `evolution_observations`. The intelligence that turns
 * observations into skill drafts lands in FEAT-006; this file is pure capture.
 */
export function attachEvolutionObserver(bus: WorkerEventBus): () => void {
  const unsub = bus.on((event) => {
    try {
      persistObservation(event)
    }
    catch (err) {
      consola.warn(`[evolution] observer failed to persist: ${String(err)}`)
    }
  })
  return unsub
}

function persistObservation(event: WorkerEvent) {
  const interesting = event.type === 'orchestrator.tool_call'
    || event.type === 'orchestrator.finished'
    || event.type === 'orchestrator.intent_decision'
    || event.type === 'orchestrator.capability_decision'
    || event.type === 'orchestrator.quality_gate'
    || event.type === 'orchestrator.repair_attempted'
  if (!interesting)
    return
  getWorkerDb().insert(evolutionObservations).values({
    conversationId: typeof event.payload.conversationId === 'string' ? event.payload.conversationId : null,
    kind: event.type,
    payload: event.payload,
  }).run()
}
