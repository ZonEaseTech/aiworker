import type { SpawnFn } from './probes'

import { describe, expect, it } from 'bun:test'

import { runChecks } from './runner'
import { bunRuntimeChecks } from './runtime-checks'

function spawnWith(bunOnPath: boolean): SpawnFn {
  return ((command: string, args: readonly string[]) => {
    const key = `${command} ${args.join(' ')}`
    if (key === 'sh -c command -v bun')
      return bunOnPath ? { status: 0, stdout: '/usr/local/bin/bun\n' } : { status: 1, stdout: '' }
    if (key === '/usr/local/bin/bun --version')
      return { status: 0, stdout: '1.3.14\n' }
    return { status: 1, stdout: '' }
  }) as unknown as SpawnFn
}

async function severitiesFor(input: { bunOnPath: boolean, homePresent: boolean }): Promise<Record<string, string>> {
  const report = await runChecks(bunRuntimeChecks({
    exists: () => input.homePresent,
    homeBunPath: '/root/.bun/bin/bun',
    prefix: 'worker',
    probe: { spawn: spawnWith(input.bunOnPath) },
  }))
  return Object.fromEntries(report.results.map(result => [result.id.split('.').pop()!, result.severity]))
}

describe('bunRuntimeChecks', () => {
  it('bun on PATH → runtime ok and path ok', async () => {
    const severities = await severitiesFor({ bunOnPath: true, homePresent: true })
    expect(severities.bun).toBe('ok')
    expect(severities['bun-path']).toBe('ok')
  })

  it('bun off PATH but present in home → runtime ok via shim, path warn (the bring-up scar)', async () => {
    const severities = await severitiesFor({ bunOnPath: false, homePresent: true })
    expect(severities.bun).toBe('ok')
    expect(severities['bun-path']).toBe('warn')
  })

  it('bun absent everywhere → runtime error, path stays ok (no double count)', async () => {
    const severities = await severitiesFor({ bunOnPath: false, homePresent: false })
    expect(severities.bun).toBe('error')
    expect(severities['bun-path']).toBe('ok')
  })
})
