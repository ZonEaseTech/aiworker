/**
 * Library surface for `@aiworker/api`.
 *
 * Phase 1a of PLAN-011 lets CLI + scripts reach into the worker runtime
 * without going through a bound HTTP server. This module re-exports the
 * minimum transport-agnostic seams needed by `apps/cli` and the existing
 * smoke scripts. Phase 1b will physically move these seams into
 * `packages/core` and delete the re-exports below.
 */

// Env access for CLI flows that default ports / DB paths from the same env.
export { workerEnv } from './config/worker'

// HTTP bootstrap for `aiw serve`.
export { bootstrapWorkerApp, createWorkerApp, type WorkerModeState } from './modes/worker'

// Worker bootstrap (mint identity, seed config, print one-time bootstrap line).
export {
  type BootstrapOptions,
  DEFAULT_EMPTY_CONFIG,
  type IdentityLoadResult,
  loadOrMintIdentity,
  loadOrSeedConfig,
  mintApiToken,
  mintWorkerId,
  printBootstrapIfJustMinted,
  type StoredConfig,
} from './worker/bootstrap'

// Config hydration / secret enumeration.
export { enumerateSecretPaths, hydrateSecrets } from './worker/config/secret-paths'

// Event bus type (so callers can subscribe to runtime.bus).
export { type WorkerEventBus } from './worker/events/bus'

// Config read/write (covers `aiw config show|set`).
export {
  ConfigVersionConflictError,
  InvalidConfigError,
  mirrorConfigToYaml,
  putConfig,
  type PutConfigOptions,
  readConfig,
  type StoredWorkerConfig,
} from './worker/management/config'
// Token rotation (covers `aiw token rotate`).
export { handleTokenRotate, type RotateTokenCurrentState, type RotateTokenResponse } from './worker/management/rotate'

export { ProcessManager } from './worker/orchestrator/process-manager'

// Runtime builder + ProcessManager + types.
export { type BuildRuntimeDeps, buildWorkerRuntime, type WorkerRuntime } from './worker/runtime'

// Secrets vault.
export { getSecretsVault } from './worker/secrets'
