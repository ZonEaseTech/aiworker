import type { Check, ProbeDeps } from '@zonease/aiworker-cli-doctor'
import type { LocalEngineStatus } from '@zonease/aiworker-soul-descriptor'

import { bunRuntimeChecks, makeResult } from '@zonease/aiworker-cli-doctor'
import { CREDENTIAL_PROBEABLE_ENGINE_IDS, resolveEngineAuthReadiness } from '@zonease/aiworker-worker-runtime'

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
  /**
   * Conservative per-engine credential probe (= worker-runtime
   * `inspectLocalEngineCredential`). Injected so the worker doctor never reads real
   * credentials or spawns in tests. The auth-ready verdict is computed through the
   * single canonical `resolveEngineAuthReadiness` helper — never recomputed here — so
   * doctor severity and `defaultLocalSettings` engine selection cannot drift.
   */
  inspectEngineCredential: (engineId: string) => boolean
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
        const missingNames = missing.map(engine => engine.name).join(', ')

        // zero installed → hard error (the Worker has no engine at all)
        if (installed.length === 0) {
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
        }

        // Honesty split: only credential-probeable engines (codex / claude-code) have a known
        // credential location, so only they can be auth-checked or downgraded to a login warn.
        // Non-probeable engines (cursor / gemini / opencode / qwen) are reported as installed
        // with a "can't verify login" note — never a false warn nor an invalid `<engine> login`.
        const probeable = installed.filter(engine => CREDENTIAL_PROBEABLE_ENGINE_IDS.includes(engine.id))
        const unprobeable = installed.filter(engine => !CREDENTIAL_PROBEABLE_ENGINE_IDS.includes(engine.id))
        const unprobeableNames = unprobeable.map(engine => engine.name).join(', ')
        // Med-2: single canonical auth-ready verdict, shared with defaultLocalSettings —
        // never recomputed here, and only ever applied to probeable engines.
        const probeableReadiness = probeable.map(engine => ({
          engine,
          ready: resolveEngineAuthReadiness(engine, deps.inspectEngineCredential),
        }))
        const authed = probeableReadiness.filter(entry => entry.ready).map(entry => entry.engine)
        const unauthedProbeable = probeableReadiness.filter(entry => !entry.ready).map(entry => entry.engine)

        // ② at least one probeable engine is logged in → ok
        if (authed.length > 0) {
          const detailParts = [`${authed.length} native CLI ready (${authed.map(engine => engine.name).join(', ')})`]
          if (unauthedProbeable.length > 0)
            detailParts.push(`installed but not logged in: ${unauthedProbeable.map(engine => engine.name).join(', ')}`)
          if (unprobeable.length > 0)
            detailParts.push(`installed (login not doctor-verifiable): ${unprobeableNames}`)
          if (missing.length > 0)
            detailParts.push(`not installed: ${missingNames}`)
          return makeResult({
            category: 'engine',
            detail: detailParts.join('; '),
            id: 'worker.engine',
            label: 'native engine',
            severity: 'ok',
          })
        }

        // ③ a probeable engine is installed but none is logged in (incl. mixed with non-probeable)
        //    → warn; the login fix points ONLY at a probeable engine, never an invalid command.
        if (probeable.length > 0) {
          const loginCommand = `${probeable[0]!.command} login`
          const detailParts = [
            `${probeable.length} credential-probeable native CLI installed (${probeable.map(engine => engine.name).join(', ')}) but none is logged in — the Worker cannot run an engine turn until one has valid credentials`,
          ]
          if (unprobeable.length > 0)
            detailParts.push(`also installed (login not doctor-verifiable): ${unprobeableNames}`)
          return makeResult({
            category: 'engine',
            detail: detailParts.join('; '),
            fix: {
              command: loginCommand,
              message: `log in to a credential-probeable native CLI (e.g. \`${loginCommand}\`) so the Worker can run engine turns`,
            },
            id: 'worker.engine',
            label: 'native engine',
            severity: 'warn',
          })
        }

        // ④ only non-probeable engines are installed → ok with an honest "can't verify" note
        //    (no false warn, no invalid login command — doctor cannot reach their credentials).
        const detailParts = [
          `installed: ${unprobeableNames}`,
          'doctor cannot verify the login state of these engines — ensure you are logged in before running an engine turn',
        ]
        if (missing.length > 0)
          detailParts.push(`not installed: ${missingNames}`)
        return makeResult({
          category: 'engine',
          detail: detailParts.join('; '),
          id: 'worker.engine',
          label: 'native engine',
          severity: 'ok',
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
