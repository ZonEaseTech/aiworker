import type { SpawnFn } from '@zonease/aiworker-cli-doctor'
import type { LocalEngineStatus } from '@zonease/aiworker-soul-descriptor'

import { runChecks } from '@zonease/aiworker-cli-doctor'
import { describe, expect, it } from 'bun:test'

import { buildWorkerChecks } from './doctor-checks'

function engine(id: string, name: string, installed: boolean): LocalEngineStatus {
  return {
    command: name.toLowerCase(),
    id,
    installed,
    name,
    path: installed ? `/usr/local/bin/${id}` : null,
    version: installed ? '1.0.0' : null,
  }
}

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

interface ScenarioInput {
  bunOnPath?: boolean
  homeBunPresent?: boolean
  engines?: LocalEngineStatus[]
  daemonRunning?: boolean
  migrationsReady?: boolean
  migrationsFolder?: null | string
}

async function severitiesFor(input: ScenarioInput): Promise<Record<string, string>> {
  const report = await runChecks(buildWorkerChecks({
    homeBunPath: '/root/.bun/bin/bun',
    exists: () => input.homeBunPresent ?? true,
    probe: { spawn: spawnWith(input.bunOnPath ?? true) },
    scanEngines: () => input.engines ?? [],
    daemonRunning: () => input.daemonRunning ?? true,
    migrationsReady: () => input.migrationsReady ?? true,
    migrationsFolder: () => input.migrationsFolder ?? '/pkg/drizzle/worker',
  }))
  return Object.fromEntries(report.results.map(result => [result.id, result.severity]))
}

describe('buildWorkerChecks', () => {
  it('bun off PATH but present in home → bun ok via shim, bun-path warn', async () => {
    const severities = await severitiesFor({ bunOnPath: false, homeBunPresent: true })
    expect(severities['worker.runtime.bun']).toBe('ok')
    expect(severities['worker.runtime.bun-path']).toBe('warn')
  })

  it('bun absent everywhere → bun error', async () => {
    const severities = await severitiesFor({ bunOnPath: false, homeBunPresent: false })
    expect(severities['worker.runtime.bun']).toBe('error')
  })

  it('no engine installed → worker.engine error', async () => {
    const severities = await severitiesFor({
      engines: [engine('claude-code', 'Claude Code', false), engine('codex', 'Codex CLI', false)],
    })
    expect(severities['worker.engine']).toBe('error')
  })

  it('at least one engine installed → worker.engine ok', async () => {
    const severities = await severitiesFor({
      engines: [engine('claude-code', 'Claude Code', true), engine('codex', 'Codex CLI', false)],
    })
    expect(severities['worker.engine']).toBe('ok')
  })

  it('worker.engine ok detail lists installed and missing engine names', async () => {
    const report = await runChecks(buildWorkerChecks({
      homeBunPath: '/root/.bun/bin/bun',
      exists: () => true,
      probe: { spawn: spawnWith(true) },
      scanEngines: () => [engine('claude-code', 'Claude Code', true), engine('codex', 'Codex CLI', false)],
      daemonRunning: () => true,
      migrationsReady: () => true,
      migrationsFolder: () => '/pkg/drizzle/worker',
    }))
    const engineResult = report.results.find(result => result.id === 'worker.engine')
    expect(engineResult?.detail).toContain('Claude Code')
    expect(engineResult?.detail).toContain('Codex CLI')
  })

  it('daemon running → service.daemon ok; down → warn', async () => {
    expect((await severitiesFor({ daemonRunning: true }))['worker.service.daemon']).toBe('ok')
    expect((await severitiesFor({ daemonRunning: false }))['worker.service.daemon']).toBe('warn')
  })

  it('migrations ready → service.db ok; not ready → warn', async () => {
    expect((await severitiesFor({ migrationsReady: true }))['worker.service.db']).toBe('ok')
    expect((await severitiesFor({ migrationsReady: false }))['worker.service.db']).toBe('warn')
  })

  it('service.db warn detail includes the resolved migrations folder', async () => {
    const report = await runChecks(buildWorkerChecks({
      homeBunPath: '/root/.bun/bin/bun',
      exists: () => true,
      probe: { spawn: spawnWith(true) },
      scanEngines: () => [engine('claude-code', 'Claude Code', true)],
      daemonRunning: () => true,
      migrationsReady: () => false,
      migrationsFolder: () => '/pkg/drizzle/worker',
    }))
    const dbResult = report.results.find(result => result.id === 'worker.service.db')
    expect(dbResult?.severity).toBe('warn')
    expect(dbResult?.detail).toContain('/pkg/drizzle/worker')
  })

  it('all healthy → overall ok, exit 0', async () => {
    const report = await runChecks(buildWorkerChecks({
      homeBunPath: '/root/.bun/bin/bun',
      exists: () => true,
      probe: { spawn: spawnWith(true) },
      scanEngines: () => [engine('claude-code', 'Claude Code', true)],
      daemonRunning: () => true,
      migrationsReady: () => true,
      migrationsFolder: () => '/pkg/drizzle/worker',
    }))
    expect(report.overall).toBe('ok')
    expect(report.exitCode).toBe(0)
  })

  it('no engine → overall error, exit 1', async () => {
    const report = await runChecks(buildWorkerChecks({
      homeBunPath: '/root/.bun/bin/bun',
      exists: () => true,
      probe: { spawn: spawnWith(true) },
      scanEngines: () => [engine('claude-code', 'Claude Code', false)],
      daemonRunning: () => true,
      migrationsReady: () => true,
      migrationsFolder: () => '/pkg/drizzle/worker',
    }))
    expect(report.overall).toBe('error')
    expect(report.exitCode).toBe(1)
  })
})
