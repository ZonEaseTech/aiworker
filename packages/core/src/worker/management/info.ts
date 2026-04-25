import type {
  ExecutorProfile,
  ServiceStatus,
  WorkerComponentStatus,
  WorkerConfig,
  WorkerInfo,
  WorkerInfoBrain,
  WorkerInfoChannel,
  WorkerInfoExecutor,
} from '@aiworker/shared'
import type { WorkerModeState } from './state'
import { resolveVariant } from '../executor/default-profiles'

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

/**
 * Pull the "effective model" from the resolved variant body. Each engine
 * tagged its model under a different key historically, so this helper hides
 * the engine-specific field name from `buildInfo`.
 */
function executorInfoModel(profile: ExecutorProfile): string | undefined {
  const resolved = tryResolve(profile)
  if (!resolved)
    return undefined
  if (resolved.modelId !== undefined)
    return resolved.modelId
  const body = resolved.body as Record<string, unknown>
  if (typeof body.model === 'string' && body.model.length > 0)
    return body.model
  if (typeof body.defaultModel === 'string' && body.defaultModel.length > 0)
    return body.defaultModel
  return undefined
}

function tryResolve(profile: ExecutorProfile) {
  try {
    return resolveVariant(profile)
  }
  catch {
    return null
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

  const resolvedExecutorModel = executorInfoModel(storedConfig.executor)
  const executor: WorkerInfoExecutor = {
    type: storedConfig.executor.engine,
    ...(resolvedExecutorModel === undefined ? {} : { model: resolvedExecutorModel }),
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
