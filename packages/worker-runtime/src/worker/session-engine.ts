import type { LocalExecutionMode } from '@zonease/aiworker-soul-descriptor'

export interface FrozenSessionEngine {
  engineCommand: string | null
  engineId: string
  executionMode: LocalExecutionMode
}

export interface ResolvedSessionEngine extends FrozenSessionEngine {
  source: 'latest-invocation' | 'requested' | 'session'
}

export interface LatestInvocationEngine {
  engineCommand: string | null
  engineId: string
  executionMode: LocalExecutionMode
}

const LEGACY_LOCAL_CLI_ENGINE_IDS = new Set(['claude-code', 'codex', 'cursor', 'gemini', 'opencode', 'qwen'])

export function readFrozenSessionEngine(metadata: Record<string, unknown> | null | undefined): FrozenSessionEngine | null {
  const engineId = readString(metadata?.engineId)
  const executionMode = readExecutionMode(metadata?.executionMode)
  if (!engineId || !executionMode)
    return null
  return {
    engineCommand: readNullableString(metadata?.engineCommand),
    engineId,
    executionMode,
  }
}

export function freezeSessionEngineMetadata(
  metadata: Record<string, unknown> | null | undefined,
  engine: FrozenSessionEngine,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    engineCommand: engine.engineCommand,
    engineId: engine.engineId,
    executionMode: engine.executionMode,
  }
}

export function resolveFrozenSessionEngine(input: {
  latestInvocation: LatestInvocationEngine | null
  requested: FrozenSessionEngine
  sessionMetadata: Record<string, unknown> | null | undefined
}): ResolvedSessionEngine {
  const sessionEngine = readFrozenSessionEngine(input.sessionMetadata)
  if (sessionEngine)
    return { ...sessionEngine, source: 'session' }
  if (input.latestInvocation?.engineId) {
    return {
      engineCommand: input.latestInvocation.engineCommand,
      engineId: input.latestInvocation.engineId,
      executionMode: input.latestInvocation.executionMode,
      source: 'latest-invocation',
    }
  }
  return { ...input.requested, source: 'requested' }
}

export function inferLatestInvocationEngine(input: {
  engineCommand: string | null
  engineId: string | null
  metadata: Record<string, unknown> | null | undefined
}): LatestInvocationEngine | null {
  const engineId = readString(input.engineId)
  if (!engineId)
    return null
  return {
    engineCommand: input.engineCommand,
    engineId,
    executionMode: readExecutionMode(input.metadata?.executionMode) ?? inferLegacyExecutionMode(engineId, input.engineCommand),
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readExecutionMode(value: unknown): LocalExecutionMode | null {
  return value === 'local-cli' || value === 'byok' ? value : null
}

function inferLegacyExecutionMode(engineId: string, engineCommand: string | null): LocalExecutionMode {
  if (LEGACY_LOCAL_CLI_ENGINE_IDS.has(engineId) || engineCommand)
    return 'local-cli'
  return 'byok'
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
