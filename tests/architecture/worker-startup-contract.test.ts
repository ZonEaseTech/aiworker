import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'bun:test'

const repoRoot = resolve(import.meta.dir, '..', '..')

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

describe('Worker startup contract', () => {
  it('keeps dev-local Web startup behind the CLI start worker bootstrap', () => {
    const script = readRepoFile('scripts/dev-local.sh')
    const ensureIndex = script.indexOf('apps/worker-cli/src/aiworker.ts start --no-open')
    const pidReadIndex = script.indexOf('DAEMON_PID="$(read_daemon_pid)"')
    const cleanupIndex = script.indexOf('stop_daemon_after_start_failure')
    const webIndex = script.indexOf('starting Worker Web')

    expect(ensureIndex, 'dev-local must invoke aiworker start --no-open before launching Worker Web').toBeGreaterThanOrEqual(0)
    expect(pidReadIndex, 'dev-local must read the daemon pid file after aiworker start succeeds').toBeGreaterThan(ensureIndex)
    expect(cleanupIndex, 'dev-local must clean up a started daemon if pid capture fails').toBeGreaterThanOrEqual(0)
    expect(webIndex, 'dev-local should still launch Worker Web after the startup gate').toBeGreaterThanOrEqual(0)
    expect(ensureIndex, 'Worker bootstrap must run before Worker Web starts').toBeLessThan(webIndex)
    expect(pidReadIndex, 'dev-local must know the daemon pid before Worker Web starts').toBeLessThan(webIndex)
    expect(cleanupIndex, 'startup-failure cleanup must be defined before Worker Web starts').toBeLessThan(webIndex)
    expect(script, 'dev-local must not depend on parsing aiworker start stdout JSON').not.toContain('JSON.parse(input)')
  })
})
