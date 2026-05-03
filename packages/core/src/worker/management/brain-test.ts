import type { BrainSourceConfig, ServiceStatus } from '@zonease/aiworker-shared'
import type { BrainSourceDiagnostic } from '../brain/diagnostics'
import type { WorkerModeState } from './state'
import { describeBrainSource } from '../brain/diagnostics'

/**
 * Per-source brain status surfaced by `POST /api/worker/brain/test`. The
 * runtime's `MultiBrainProvider` exposes aggregate `health()`, so multiple
 * configured sources receive the same aggregate verdict while still exposing
 * each source's read-only/write-target/home metadata.
 *
 * If the aggregate throws, each configured source is marked `down` with the
 * error message. Empty config falls back to one `aggregate` row.
 */
export interface BrainTestRow extends Omit<Partial<BrainSourceDiagnostic>, 'type'> {
  id: string
  type: BrainSourceConfig['type'] | 'multi'
  status: ServiceStatus['status'] | 'unknown'
  healthScope?: 'source' | 'aggregate'
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
 * Probe the worker's brain provider and join the aggregate health verdict
 * with stored source metadata. That keeps API consumers aware of which
 * source is writable even when health is only available at provider level.
 */
export async function handleBrainTest(
  state: WorkerModeState,
  storedConfig: { brains: BrainSourceConfig[], brainWriteTarget?: string },
): Promise<BrainTestResponse> {
  const sources = storedConfig.brains
  const rows = sources.map(source => describeBrainSource(
    state.workerId,
    source,
    storedConfig.brainWriteTarget ?? '',
  ))
  const healthScope: BrainTestRow['healthScope'] = sources.length <= 1 ? 'source' : 'aggregate'
  try {
    const status = await state.runtime.brain.health()
    if (rows.length > 0) {
      return {
        brains: rows.map(row => ({ ...row, status: status.status, healthScope })),
      }
    }
    return {
      brains: [{ id: 'aggregate', type: 'multi', status: status.status }],
    }
  }
  catch (err) {
    const error = errorMessage(err)
    if (rows.length > 0) {
      return {
        brains: rows.map(row => ({
          ...row,
          status: 'down',
          healthScope,
          errorMessage: error,
        })),
      }
    }
    return {
      brains: [{
        id: 'aggregate',
        type: 'multi',
        status: 'down',
        errorMessage: error,
      }],
    }
  }
}
