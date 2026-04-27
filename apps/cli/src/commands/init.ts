import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { ensureProjectAiworker, resolveAiworkerScope, resolveProjectRoot } from '@zonease/aiworker-fs-layout'
import consola from 'consola'

import { loadWorkerContext } from '../context'
import { bootstrapDotenv } from '../lib/dotenv-bootstrap'

export interface InitOptions {
  /** Force user-scope at `~/.aiworker/`. Skips cwd project detection. */
  global?: boolean
  /** Allow project init even when cwd is not a git repo (escape hatch for ad-hoc setups). */
  force?: boolean
}

/**
 * `aiworker init` — bootstrap worker.db, mint identity + token on first
 * boot, seed default config.
 *
 * Project-scope (default, PLAN-023): create `<cwd>/.aiworker/` (requires
 * cwd to be inside a git repo), then materialise the worker under
 * `<cwd>/.aiworker/local/`. The bootstrap runs idempotently — re-running
 * on an already-initialised vault keeps the same identity and prints no
 * extra token.
 *
 * `--global` falls back to the user-scope `~/.aiworker/` layout (legacy
 * single-host single-worker form). `--force` skips the git-repo guard.
 */
export async function runInit(options: InitOptions = {}): Promise<void> {
  if (options.global === true) {
    const ctx = await loadWorkerContext()
    consola.success(`[aiworker init] user-scope worker ${ctx.workerId} ready (config v${ctx.configVersion})`)
    return
  }

  // Honour an explicit operator override (CLI flag / env). When the operator
  // has pinned AIWORKER_HOME we don't second-guess them — drop straight into
  // the legacy bootstrap.
  const scope = resolveAiworkerScope()
  if (scope.scope === 'explicit') {
    const ctx = await loadWorkerContext()
    consola.success(`[aiworker init] explicit-scope worker ${ctx.workerId} ready (${scope.home})`)
    return
  }

  const cwd = process.cwd()

  // Already initialised → idempotent re-init. The side-effect bootstrap has
  // already aimed AIWORKER_HOME at the existing local/ via resolveAiworkerScope.
  const existingRoot = resolveProjectRoot(cwd)
  if (existingRoot) {
    await ensureProjectAiworker(existingRoot)
    const ctx = await loadWorkerContext()
    consola.success(`[aiworker init] project-scope worker ${ctx.workerId} ready (${existingRoot})`)
    return
  }

  // Brand-new project init: require a git repo to prevent polluting random
  // directories (e.g. `aiworker init` in `/tmp/foo`). Operators with truly
  // git-less setups can opt out with --force.
  if (options.force !== true && !isGitRepo(cwd)) {
    throw new Error(
      `[aiworker init] cwd is not inside a git repo (cwd=${cwd}).\n`
      + `  • Run inside an existing git repo to enable project-scope worker, OR\n`
      + `  • aiworker init --global   → use ~/.aiworker (single host-wide worker), OR\n`
      + `  • aiworker init --force    → create .aiworker/ here anyway (no git tracking).`,
    )
  }

  await ensureProjectAiworker(cwd)
  // The side-effect bootstrap (lib/bootstrap.ts) ran *before* `.aiworker/`
  // existed, so it pinned AIWORKER_HOME at the user-default and minted a
  // master key into ~/.aiworker/.env. For brand-new projects we want
  // fs-layout to re-detect project scope cleanly (so resolveWorkerHome
  // returns `.aiworker/` instead of `<home>/workers/<id>/`), and we want a
  // *project-local* master key. So unpin AIWORKER_HOME (leaves env empty —
  // fs-layout's resolveAiworkerScope will project-detect now that `.aiworker/`
  // exists), wipe user-scope secrets out of process.env, and re-mint into
  // project local/. The user-scope ~/.aiworker/.env file stays put (harmless).
  const projectLocal = path.join(cwd, '.aiworker', 'local')
  delete process.env.AIWORKER_HOME
  delete process.env.AIWORKER_MASTER_KEY
  delete process.env.INTERNAL_SHARED_SECRET
  bootstrapDotenv({ home: projectLocal })
  const ctx = await loadWorkerContext()
  consola.success(`[aiworker init] project-scope worker ${ctx.workerId} ready (${cwd})`)
}

function isGitRepo(cwd: string): boolean {
  let cur = path.resolve(cwd)
  while (true) {
    if (existsSync(path.join(cur, '.git')))
      return true
    const parent = path.dirname(cur)
    if (parent === cur)
      return false
    cur = parent
  }
}
