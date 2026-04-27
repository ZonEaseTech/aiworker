import type { BrainSourceConfig, ServiceStatus } from '@zonease/aiworker-shared'
import type { WorkerModeState } from './state'

/**
 * Per-source brain status surfaced by `POST /api/worker/brain/test`. The
 * runtime's `MultiBrainProvider` only exposes an aggregate `health()`, so
 * `handleBrainTest` flattens that into one row (id = `aggregate`) whose type
 * is either `multi` (for >1 source) or the single source's type.
 *
 * If an individual source throws, its row is marked `down` with the error
 * message; if the aggregate throws, a single `aggregate` row reports `down`.
 */
export interface BrainTestRow {
  id: string
  type: BrainSourceConfig['type'] | 'multi'
  status: ServiceStatus['status'] | 'unknown'
  errorMessage?: string
}

export interface BrainTestResponse {
  brains: BrainTestRow[]
}

function errorMessage(err: unknown): string {
  if (err instanceof Error)
    return err.message
  return String(err)
}

/**
 * Probe the worker's brain provider and return its health. We inspect the
 * stored config shape to decide whether to report an `aggregate` row or a
 * single-source row with the real source type.
 */
export async function handleBrainTest(
  state: WorkerModeState,
  storedConfig: { brains: BrainSourceConfig[] },
): Promise<BrainTestResponse> {
  const sources = storedConfig.brains
  try {
    const status = await state.runtime.brain.health()
    if (sources.length === 1) {
      const source = sources[0]!
      return {
        brains: [{ id: source.id, type: source.type, status: status.status }],
      }
    }
    return {
      brains: [{ id: 'aggregate', type: 'multi', status: status.status }],
    }
  }
  catch (err) {
    return {
      brains: [{
        id: sources.length === 1 ? sources[0]!.id : 'aggregate',
        type: sources.length === 1 ? sources[0]!.type : 'multi',
        status: 'down',
        errorMessage: errorMessage(err),
      }],
    }
  }
}
