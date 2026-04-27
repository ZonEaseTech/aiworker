import { existsSync } from 'node:fs'
import path from 'node:path'

import {
  resolveAgentMdPath,
  resolveAiworkerScope,
  resolveMcpJsonPath,
  resolveMemoryIndexPath,
  resolveRollupMdPath,
  resolveSoulMdPath,
  resolveUserMdPath,
  resolveWorkerHome,
  resolveWorkspacesRoot,
} from '@zonease/aiworker-fs-layout'
import consola from 'consola'

/**
 * `aiworker scope` — diagnostic command (zero side effects). Prints the
 * resolved aiworker scope (user/project/explicit), the aiworker home
 * directory, plus a presence list of the layout files this worker would
 * read or write.
 *
 * Modeled after `git config --list --show-origin` — operators inspect
 * "which scope am I in right now?" before running data-mutating commands.
 */
export async function runScope(): Promise<number> {
  const result = resolveAiworkerScope()

  consola.box(
    [
      `Scope        : ${result.scope}`,
      `Home         : ${result.home}`,
      `Source       : ${result.source}`,
      result.projectRoot ? `Project root : ${result.projectRoot}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  // Worker-side ID is not yet known at this point (no DB read). Use a
  // placeholder so resolveWorkerHome / resolveBrainHome return the
  // project-mode path (workerId is irrelevant in project scope; in user
  // scope this still shows the layout pattern correctly).
  const workerId = '<workerId>'
  const workerHome = resolveWorkerHome(workerId)
  const workspacesRoot = resolveWorkspacesRoot(workerId)
  const localEnv = path.join(result.home, '.env')
  const workerDb = path.join(result.home, 'worker.db')

  const items: Array<[string, string]> = [
    ['AGENT.md', resolveAgentMdPath(workerId)],
    ['SOUL.md', resolveSoulMdPath(workerId)],
    ['USER.md', resolveUserMdPath(workerId)],
    ['MEMORY.md', resolveMemoryIndexPath(workerId)],
    ['ROLLUP.md', resolveRollupMdPath(workerId)],
    ['mcp.json', resolveMcpJsonPath(workerId)],
    ['worker.db', workerDb],
    ['local/.env', localEnv],
    ['workspaces/', workspacesRoot],
    ['worker home', workerHome],
  ]

  for (const [label, p] of items) {
    const exists = existsSync(p)
    const marker = exists ? '✓' : '·'
    consola.info(`  ${marker} ${label.padEnd(14)} ${p}`)
  }
  return 0
}
