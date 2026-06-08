import type { ProbeDeps } from './probes'
import type { Check } from './types'

import { fileExists, inspectCommand } from './probes'
import { makeResult } from './result'

export interface BunRuntimeOptions {
  /** Absolute path to the per-user bun the shim falls back to, e.g. `$HOME/.bun/bin/bun`. */
  homeBunPath: string
  /** `worker` | `host` — namespaces the check ids and labels. */
  prefix: string
  exists?: (path: string) => boolean
  probe?: ProbeDeps
}

// bun runtime checks are shared by both AIWorker CLIs (worker + host both run on
// bun). They live in the neutral framework because they're domain-agnostic — they
// only touch the filesystem and PATH, never any host/worker package.
export function bunRuntimeChecks(options: BunRuntimeOptions): Check[] {
  const exists = options.exists ?? fileExists
  const probeDeps = options.probe ?? {}

  const lookup = () => ({
    onPath: inspectCommand('bun', probeDeps),
    homePresent: exists(options.homeBunPath),
  })

  return [
    {
      category: 'runtime',
      id: `${options.prefix}.runtime.bun`,
      label: 'bun runtime',
      run: () => {
        const { homePresent, onPath } = lookup()
        if (onPath.found) {
          return makeResult({
            category: 'runtime',
            detail: onPath.version ? `bun ${onPath.version} (${onPath.path})` : `bun (${onPath.path})`,
            id: `${options.prefix}.runtime.bun`,
            label: 'bun runtime',
            severity: 'ok',
          })
        }
        if (homePresent) {
          return makeResult({
            category: 'runtime',
            detail: `bun present at ${options.homeBunPath} (resolved via shim, not on PATH)`,
            id: `${options.prefix}.runtime.bun`,
            label: 'bun runtime',
            severity: 'ok',
          })
        }
        return makeResult({
          category: 'runtime',
          detail: 'bun runtime not found — AIWorker CLI is Bun-native and cannot run without it',
          fix: { command: 'curl -fsSL https://bun.sh/install | bash', message: 'install Bun' },
          id: `${options.prefix}.runtime.bun`,
          label: 'bun runtime',
          severity: 'error',
        })
      },
    },
    {
      category: 'runtime',
      id: `${options.prefix}.runtime.bun-path`,
      label: 'bun on PATH',
      run: () => {
        const { homePresent, onPath } = lookup()
        if (onPath.found) {
          return makeResult({
            category: 'runtime',
            detail: 'bun resolvable on PATH',
            id: `${options.prefix}.runtime.bun-path`,
            label: 'bun on PATH',
            severity: 'ok',
          })
        }
        if (homePresent) {
          return makeResult({
            category: 'runtime',
            detail: `bun exists at ${options.homeBunPath} but bare "bun" is not on PATH — systemd units and deploy scripts will fail`,
            fix: {
              command: `ln -s ${options.homeBunPath} /usr/local/bin/bun`,
              message: 'symlink bun onto PATH (or add /etc/profile.d/bun.sh)',
            },
            id: `${options.prefix}.runtime.bun-path`,
            label: 'bun on PATH',
            severity: 'warn',
          })
        }
        // bun missing entirely is already an error on runtime.bun; don't double-count.
        return makeResult({
          category: 'runtime',
          detail: 'n/a — bun runtime missing (see runtime.bun)',
          id: `${options.prefix}.runtime.bun-path`,
          label: 'bun on PATH',
          severity: 'ok',
        })
      },
    },
  ]
}
