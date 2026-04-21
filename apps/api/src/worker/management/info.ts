import type {
  ServiceStatus,
  WorkerComponentStatus,
  WorkerConfig,
  WorkerInfo,
  WorkerInfoBrain,
  WorkerInfoChannel,
  WorkerInfoExecutor,
} from '@aiworker/shared'
import type { WorkerModeState } from '../../modes/worker'

/**
 * Per-process runtime version surfaced on `/api/worker/info`. Matches the
 * value advertised in the OpenAPI document so the manager can detect skew.
 */
const WORKER_RUNTIME_VERSION = '0.2.0'

/** Environment inputs consumed by the info builder. Indirected so tests can stub. */
export interface BuildInfoEnv {
  advertisedBaseUrl?: string
}

function resolveStatus(status: ServiceStatus | null): WorkerComponentStatus {
  if (!status)
    return 'unknown'
  return status.status
}

async function probe(fn: () => Promise<ServiceStatus>): Promise<WorkerComponentStatus> {
  try {
    const s = await fn()
    return resolveStatus(s ?? null)
  }
  catch {
    return 'unknown'
  }
}

function webhookUrl(advertisedBaseUrl: string | undefined, channel: string): string | undefined {
  if (!advertisedBaseUrl)
    return undefined
  const trimmed = advertisedBaseUrl.replace(/\/+$/, '')
  return `${trimmed}/${channel}/webhook`
}

/**
 * Compose the `WorkerInfo` response from the live runtime state + the stored
 * (redacted) config that drives the channel list. `brains[].status` and
 * `executor.status` come from probing the runtime providers — a throw or a
 * missing `health()` maps to `'unknown'`.
 */
export async function buildInfo(
  state: WorkerModeState,
  storedConfig: WorkerConfig,
  env: BuildInfoEnv,
): Promise<WorkerInfo> {
  const { runtime } = state

  const executorStatus = await probe(() => runtime.executor.health())
  const brainAggregate = await probe(() => runtime.brain.health())

  const brains: WorkerInfoBrain[] = storedConfig.brains.map(b => ({
    id: b.id,
    type: b.type,
    status: brainAggregate,
  }))

  const executor: WorkerInfoExecutor = {
    type: storedConfig.executor.type,
    ...(storedConfig.executor.type === 'http'
      ? { model: storedConfig.executor.model }
      : storedConfig.executor.type === 'mcp' && storedConfig.executor.defaultModel !== undefined
        ? { model: storedConfig.executor.defaultModel }
        : {}),
    status: executorStatus,
  }

  const channels: WorkerInfoChannel[] = storedConfig.channels.map((c) => {
    const url = webhookUrl(env.advertisedBaseUrl, c.channel)
    return {
      channel: c.channel,
      enabled: c.enabled,
      ...(url ? { webhookUrl: url } : {}),
    }
  })

  return {
    workerId: state.workerId,
    runtimeVersion: WORKER_RUNTIME_VERSION,
    configVersion: state.configVersion,
    brains,
    executor,
    channels,
    evolutionEnabled: storedConfig.evolution.enabled,
    startedAt: state.startedAt,
    ...(env.advertisedBaseUrl ? { advertisedBaseUrl: env.advertisedBaseUrl } : {}),
  }
}
