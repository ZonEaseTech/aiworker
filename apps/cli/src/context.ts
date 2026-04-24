import type { WorkerRuntime } from '@aiworker/api/lib'

import type { WorkerConfig } from '@aiworker/shared'
import type { WorkerDatabase } from '@aiworker/storage-sqlite/worker'
import process from 'node:process'
import {
  buildWorkerRuntime,
  enumerateSecretPaths,
  getSecretsVault,
  hydrateSecrets,
  loadOrMintIdentity,
  loadOrSeedConfig,
  printBootstrapIfJustMinted,
  ProcessManager,
  workerEnv,

} from '@aiworker/api/lib'
import {
  defaultWorkerMigrationsFolder,
  getWorkerDb,
  initWorkerDb,
  runWorkerMigrations,
} from '@aiworker/storage-sqlite/worker'

/**
 * Bootstrap steps shared across `aiw init`, `aiw run`, `aiw serve`, and
 * config/token subcommands. Intentionally mirrors the in-process sequence
 * that `apps/api/src/modes/worker.ts` performs — that keeps the CLI
 * behaviour bit-for-bit compatible with `AIWORKER_MODE=worker` without
 * requiring a Hono server.
 */
export interface WorkerContext {
  workerId: string
  token: string
  configVersion: number
  hydrated: WorkerConfig
  db: WorkerDatabase
  processes: ProcessManager
}

async function hydrateStoredConfig(stored: WorkerConfig): Promise<WorkerConfig> {
  const vault = getSecretsVault()
  const paths = enumerateSecretPaths(stored).map(p => p.path)
  const map = new Map<string, string>()
  for (const path of paths) {
    const value = await vault.get(path)
    if (value !== null)
      map.set(path, value)
  }
  return hydrateSecrets(stored, map)
}

/**
 * Initialise DB + migrations + identity + config. Returns enough state to
 * either build a runtime (`run`, `serve`) or just print the identity
 * (`init`).
 */
export async function loadWorkerContext(options: { silent?: boolean } = {}): Promise<WorkerContext> {
  initWorkerDb(workerEnv.WORKER_DB_PATH)
  // CLI runs from source, so prefer the package-resolved default (survives
  // repo layout changes). Operators can still override by exporting
  // WORKER_MIGRATIONS_FOLDER explicitly.
  const migrationsFolder = process.env.WORKER_MIGRATIONS_FOLDER ?? defaultWorkerMigrationsFolder
  runWorkerMigrations(migrationsFolder)

  const vault = getSecretsVault()
  const db = getWorkerDb()

  const identity = await loadOrMintIdentity(db, vault, {
    ...(workerEnv.AIWORKER_FORCE_ID === undefined ? {} : { forceId: workerEnv.AIWORKER_FORCE_ID }),
    ...(workerEnv.AIWORKER_FORCE_TOKEN === undefined ? {} : { forceToken: workerEnv.AIWORKER_FORCE_TOKEN }),
  })
  if (!options.silent)
    printBootstrapIfJustMinted(identity.workerId, identity.token, db, identity.justMinted)

  const stored = await loadOrSeedConfig(db)
  const hydrated = await hydrateStoredConfig(stored.config)

  const processes = new ProcessManager({
    maxConcurrentTotal: workerEnv.MAX_CONCURRENT_TOTAL,
    perEngineLimits: { ...workerEnv.perEngineLimits },
    stallTimeoutMs: workerEnv.PROCESS_STALL_TIMEOUT_MS,
    killTimeoutMs: workerEnv.PROCESS_KILL_TIMEOUT_MS,
    autoCleanupDelayMs: workerEnv.PROCESS_AUTO_CLEANUP_DELAY_MS,
    gcIntervalMs: workerEnv.PROCESS_GC_INTERVAL_MS,
  })

  return {
    workerId: identity.workerId,
    token: identity.token,
    configVersion: stored.version,
    hydrated,
    db,
    processes,
  }
}

/**
 * Build a runtime from a loaded context. Split out so `aiw init` can skip
 * the heavy runtime construction (no brain / executor / channels needed
 * just to mint + print identity).
 */
export function buildRuntime(ctx: WorkerContext): WorkerRuntime {
  return buildWorkerRuntime(ctx.workerId, ctx.hydrated, { processes: ctx.processes })
}
