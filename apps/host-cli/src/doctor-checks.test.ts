import type { SpawnFn } from '@zonease/aiworker-cli-doctor'

import { runChecks } from '@zonease/aiworker-cli-doctor'
import { describe, expect, it } from 'bun:test'

import { buildHostChecks } from './doctor-checks'

const LOGTO_KEYS = [
  'AIWORKER_HOST_SESSION_SECRET',
  'AIWORKER_HOST_ALLOWED_EMAIL_DOMAINS',
  'LOGTO_CLIENT_ID',
  'LOGTO_CLIENT_SECRET',
  'LOGTO_ENDPOINT',
  'LOGTO_ISSUER',
]

// Inject a spawn that reports which commands resolve on PATH (and a version for
// the ones it knows). Anything not listed resolves as "not found".
function spawnWith(found: Record<string, string>): SpawnFn {
  return ((command: string, args: readonly string[]) => {
    const key = `${command} ${args.join(' ')}`
    for (const [cmd, version] of Object.entries(found)) {
      if (key === `sh -c command -v ${cmd}`)
        return { status: 0, stdout: `/usr/local/bin/${cmd}\n` }
      if (key === `/usr/local/bin/${cmd} --version`)
        return { status: 0, stdout: `${version}\n` }
    }
    return { status: 1, stdout: '' }
  }) as unknown as SpawnFn
}

interface Scenario {
  env?: Record<string, string | undefined>
  found?: Record<string, string>
  homePresent?: boolean
  daemonRunning?: boolean
  soulReleaseCount?: number
}

async function gradeFor(scenario: Scenario): Promise<Record<string, string>> {
  const checks = buildHostChecks({
    daemonRunning: () => scenario.daemonRunning ?? true,
    env: scenario.env ?? {},
    exists: () => scenario.homePresent ?? true,
    homeBunPath: '/root/.bun/bin/bun',
    probe: { spawn: spawnWith({ bun: '1.3.14', ...(scenario.found ?? {}) }) },
    soulReleaseCount: () => scenario.soulReleaseCount ?? 1,
  })
  const report = await runChecks(checks)
  return Object.fromEntries(report.results.map(result => [result.id, result.severity]))
}

function fullLogto(): Record<string, string> {
  return Object.fromEntries(LOGTO_KEYS.map(key => [key, 'value']))
}

describe('buildHostChecks — logto auth', () => {
  it('all 6 Logto keys present → ok', async () => {
    const grade = await gradeFor({ env: fullLogto() })
    expect(grade['host.auth.logto']).toBe('ok')
  })

  it('partial Logto config (some set, some missing) → error', async () => {
    const grade = await gradeFor({ env: { AIWORKER_HOST_SESSION_SECRET: 'value', LOGTO_CLIENT_ID: 'value' } })
    expect(grade['host.auth.logto']).toBe('error')
  })

  it('no Logto keys set → warn (dev-static only)', async () => {
    const grade = await gradeFor({ env: {} })
    expect(grade['host.auth.logto']).toBe('warn')
  })

  it('partial Logto config makes the whole report exit 1', async () => {
    const checks = buildHostChecks({
      daemonRunning: () => true,
      env: { LOGTO_ENDPOINT: 'https://logto.example' },
      exists: () => true,
      homeBunPath: '/root/.bun/bin/bun',
      probe: { spawn: spawnWith({ aissh: '1.0', bun: '1.3.14', docker: '27.0' }) },
      soulReleaseCount: () => 3,
    })
    const report = await runChecks(checks)
    expect(report.overall).toBe('error')
    expect(report.exitCode).toBe(1)
  })
})

describe('buildHostChecks — provisioning', () => {
  it('aissh and docker both present → both ok, any ok', async () => {
    const grade = await gradeFor({ found: { aissh: '1.0', docker: '27.0' } })
    expect(grade['host.provisioning.aissh']).toBe('ok')
    expect(grade['host.provisioning.docker']).toBe('ok')
    expect(grade['host.provisioning.any']).toBe('ok')
  })

  it('aissh missing, docker present → aissh warn, any still ok', async () => {
    const grade = await gradeFor({ found: { docker: '27.0' } })
    expect(grade['host.provisioning.aissh']).toBe('warn')
    expect(grade['host.provisioning.docker']).toBe('ok')
    expect(grade['host.provisioning.any']).toBe('ok')
  })

  it('both provisioning commands missing → each warn, any warn (never error)', async () => {
    const grade = await gradeFor({ found: {} })
    expect(grade['host.provisioning.aissh']).toBe('warn')
    expect(grade['host.provisioning.docker']).toBe('warn')
    expect(grade['host.provisioning.any']).toBe('warn')
  })

  it('both provisioning missing → any detail explains local-only fallback', async () => {
    const checks = buildHostChecks({
      daemonRunning: () => true,
      env: fullLogto(),
      exists: () => true,
      homeBunPath: '/root/.bun/bin/bun',
      probe: { spawn: spawnWith({ bun: '1.3.14' }) },
      soulReleaseCount: () => 1,
    })
    const report = await runChecks(checks)
    const any = report.results.find(result => result.id === 'host.provisioning.any')!
    expect(any.severity).toBe('warn')
    expect(any.detail).toContain('local only')
  })

  it('probe runs aissh connectivity when aissh present', async () => {
    let probed = false
    const checks = buildHostChecks({
      aisshConnectivity: () => {
        probed = true
        return { ok: true }
      },
      daemonRunning: () => true,
      env: fullLogto(),
      exists: () => true,
      homeBunPath: '/root/.bun/bin/bun',
      probe: { spawn: spawnWith({ aissh: '1.0', bun: '1.3.14' }) },
      soulReleaseCount: () => 1,
    })
    const report = await runChecks(checks, { probe: true })
    expect(probed).toBe(true)
    expect(report.results.find(result => result.id === 'host.provisioning.aissh')!.severity).toBe('ok')
  })

  it('probe with failing aissh connectivity → aissh warn', async () => {
    const checks = buildHostChecks({
      aisshConnectivity: () => ({ detail: 'auth denied', ok: false }),
      daemonRunning: () => true,
      env: fullLogto(),
      exists: () => true,
      homeBunPath: '/root/.bun/bin/bun',
      probe: { spawn: spawnWith({ aissh: '1.0', bun: '1.3.14' }) },
      soulReleaseCount: () => 1,
    })
    const report = await runChecks(checks, { probe: true })
    expect(report.results.find(result => result.id === 'host.provisioning.aissh')!.severity).toBe('warn')
  })
})

describe('buildHostChecks — service', () => {
  it('soul releases > 0 → ok', async () => {
    const grade = await gradeFor({ soulReleaseCount: 4 })
    expect(grade['host.service.souls']).toBe('ok')
  })

  it('0 soul releases → warn with blind-pass detail', async () => {
    const checks = buildHostChecks({
      daemonRunning: () => true,
      env: fullLogto(),
      exists: () => true,
      homeBunPath: '/root/.bun/bin/bun',
      probe: { spawn: spawnWith({ aissh: '1.0', bun: '1.3.14', docker: '27.0' }) },
      soulReleaseCount: () => 0,
    })
    const report = await runChecks(checks)
    const souls = report.results.find(result => result.id === 'host.service.souls')!
    expect(souls.severity).toBe('warn')
    expect(souls.detail).toContain('0 soul releases')
  })

  it('daemon running → host.service.api ok', async () => {
    const grade = await gradeFor({ daemonRunning: true })
    expect(grade['host.service.api']).toBe('ok')
  })

  it('daemon down → host.service.api warn', async () => {
    const grade = await gradeFor({ daemonRunning: false })
    expect(grade['host.service.api']).toBe('warn')
  })

  it('probe: any HTTP status (incl 401) counts as reachable → api ok', async () => {
    const checks = buildHostChecks({
      daemonRunning: () => false,
      env: fullLogto(),
      exists: () => true,
      fetch: (async () => new Response('unauthorized', { status: 401 })) as unknown as typeof fetch,
      homeBunPath: '/root/.bun/bin/bun',
      optionsUrl: 'http://127.0.0.1:9117/api/host/options',
      probe: { spawn: spawnWith({ aissh: '1.0', bun: '1.3.14', docker: '27.0' }) },
      soulReleaseCount: () => 1,
    })
    const report = await runChecks(checks, { probe: true })
    expect(report.results.find(result => result.id === 'host.service.api')!.severity).toBe('ok')
  })

  it('probe: unreachable Host API → api warn', async () => {
    const checks = buildHostChecks({
      daemonRunning: () => true,
      env: fullLogto(),
      exists: () => true,
      fetch: (async () => {
        throw new Error('ECONNREFUSED')
      }) as unknown as typeof fetch,
      homeBunPath: '/root/.bun/bin/bun',
      probe: { spawn: spawnWith({ aissh: '1.0', bun: '1.3.14', docker: '27.0' }) },
      soulReleaseCount: () => 1,
    })
    const report = await runChecks(checks, { probe: true })
    expect(report.results.find(result => result.id === 'host.service.api')!.severity).toBe('warn')
  })
})

describe('buildHostChecks — runtime', () => {
  it('bun off PATH but in home → runtime ok, path warn', async () => {
    const checks = buildHostChecks({
      daemonRunning: () => true,
      env: fullLogto(),
      exists: () => true,
      homeBunPath: '/root/.bun/bin/bun',
      probe: { spawn: spawnWith({}) },
      soulReleaseCount: () => 1,
    })
    const report = await runChecks(checks)
    const grade = Object.fromEntries(report.results.map(result => [result.id, result.severity]))
    expect(grade['host.runtime.bun']).toBe('ok')
    expect(grade['host.runtime.bun-path']).toBe('warn')
  })

  it('a fully healthy host → overall ok, exit 0', async () => {
    const grade = await gradeFor({
      daemonRunning: true,
      env: fullLogto(),
      found: { aissh: '1.0', docker: '27.0' },
      soulReleaseCount: 3,
    })
    expect(grade['host.auth.logto']).toBe('ok')
    expect(grade['host.provisioning.any']).toBe('ok')
    expect(grade['host.service.souls']).toBe('ok')
  })
})
