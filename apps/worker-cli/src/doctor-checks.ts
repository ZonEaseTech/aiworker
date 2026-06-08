import type { Check, ProbeDeps } from '@zonease/aiworker-cli-doctor'
import type { LocalEngineStatus } from '@zonease/aiworker-soul-descriptor'

import { bunRuntimeChecks, makeResult } from '@zonease/aiworker-cli-doctor'

export interface WorkerDoctorDeps {
  /** Absolute path to the per-user bun the shim falls back to, e.g. `$HOME/.bun/bin/bun`. */
  homeBunPath: string
  /** Worker local daemon lifecycle: running or not. */
  daemonRunning: () => boolean
  /** Worker db migrations journal present (packaged drizzle/worker resolvable). */
  migrationsReady: () => boolean
  /** Resolved migrations folder (for the warn detail). */
  migrationsFolder: () => null | string
  /** Native engine scan (= worker-runtime `scanLocalEngines`). */
  scanEngines: () => LocalEngineStatus[]
  /** Injected `fileExists` for bun path checks (tests pass a fake). */
  exists?: (path: string) => boolean
  /** Injected spawn/env for bun PATH probing (tests pass fakes; never real-spawns). */
  probe?: ProbeDeps
}

// buildWorkerChecks is fully dependency-injected so the worker doctor can be unit
// tested without ever spawning a real process or touching the real filesystem.
export function buildWorkerChecks(deps: WorkerDoctorDeps): Check[] {
  return [
    ...bunRuntimeChecks({
      prefix: 'worker',
      homeBunPath: deps.homeBunPath,
      exists: deps.exists,
      probe: deps.probe,
    }),
    {
      category: 'engine',
      id: 'worker.engine',
      label: 'native engine',
      run: () => {
        const engines = deps.scanEngines()
        const installed = engines.filter(engine => engine.installed)
        const missing = engines.filter(engine => !engine.installed)
        const installedNames = installed.map(engine => engine.name).join(', ')
        const missingNames = missing.map(engine => engine.name).join(', ')
        if (installed.length > 0) {
          const detail = missing.length > 0
            ? `${installed.length} native CLI installed (${installedNames}); not installed: ${missingNames}`
            : `${installed.length} native CLI installed (${installedNames})`
          return makeResult({
            category: 'engine',
            detail,
            id: 'worker.engine',
            label: 'native engine',
            severity: 'ok',
          })
        }
        return makeResult({
          category: 'engine',
          detail: 'no native CLI engine installed — the Worker cannot run an engine turn',
          fix: {
            command: 'npm i -g @anthropic-ai/claude-code',
            message: 'install at least one native CLI (claude / codex / cursor-agent / gemini / opencode / qwen)',
          },
          id: 'worker.engine',
          label: 'native engine',
          severity: 'error',
        })
      },
    },
    {
      category: 'service',
      id: 'worker.service.daemon',
      label: 'worker daemon',
      run: () => {
        if (deps.daemonRunning()) {
          return makeResult({
            category: 'service',
            detail: 'worker daemon is running',
            id: 'worker.service.daemon',
            label: 'worker daemon',
            severity: 'ok',
          })
        }
        return makeResult({
          category: 'service',
          detail: 'worker daemon is not running',
          fix: { command: 'aiworker daemon start', message: 'start the worker daemon' },
          id: 'worker.service.daemon',
          label: 'worker daemon',
          severity: 'warn',
        })
      },
    },
    {
      category: 'service',
      id: 'worker.service.db',
      label: 'worker db migrations',
      run: () => {
        if (deps.migrationsReady()) {
          return makeResult({
            category: 'service',
            detail: 'worker db migrations journal present',
            id: 'worker.service.db',
            label: 'worker db migrations',
            severity: 'ok',
          })
        }
        const folder = deps.migrationsFolder()
        return makeResult({
          category: 'service',
          detail: folder
            ? `worker db migrations journal not found in ${folder}`
            : 'worker db migrations folder could not be resolved',
          fix: {
            message: 'reinstall the AIWorker CLI or set WORKER_MIGRATIONS_FOLDER to the packaged drizzle/worker folder',
          },
          id: 'worker.service.db',
          label: 'worker db migrations',
          severity: 'warn',
        })
      },
    },
  ]
}
