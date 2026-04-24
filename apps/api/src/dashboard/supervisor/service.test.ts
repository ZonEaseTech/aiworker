import process from 'node:process'

import { beforeAll, describe, expect, it } from 'bun:test'

// The dashboard/supervisor service imports `dashboardConfig`, which `.parse()`s
// process.env at module load. Seed the minimum env the schema needs before the
// import — including the launch-local fields so `.superRefine` is satisfied
// when MANAGER_CAN_LAUNCH=true.
process.env.AIWORKER_MODE ??= 'dashboard'
process.env.INTERNAL_SHARED_SECRET ??= 'test-internal-secret-0000000'
process.env.AIWORKER_MASTER_KEY ??= '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
process.env.MANAGER_CAN_LAUNCH ??= 'true'
process.env.AIWORKER_IMAGE ??= 'aiworker-runtime:test'
process.env.WORKER_DATA_ROOT ??= '/tmp/aiworker-launch-test'
process.env.WORKER_MEMORY_LIMIT ??= '256m'
process.env.WORKER_CPU_LIMIT ??= '0.5'

const { FleetSupervisor, parseBootstrapFromLogs } = await import('./service')
const { LaunchFailedError, LaunchTimeoutError } = await import('./errors')

interface CreatedSpec { name: string, spec: Record<string, unknown> }

interface StubDocker {
  ping: () => Promise<unknown>
  ensureNetwork: (name: string) => Promise<void>
  createContainer: (name: string, spec: Record<string, unknown>) => Promise<{ Id: string }>
  startContainer: (id: string) => Promise<void>
  stopContainer: (id: string) => Promise<void>
  removeContainer: (id: string, opts?: { force?: boolean, removeVolumes?: boolean }) => Promise<void>
  logs: (id: string) => Promise<string>
  inspectContainer: (id: string) => Promise<Record<string, unknown>>
}

function makeDocker(overrides: Partial<StubDocker> = {}): StubDocker & { calls: { created: CreatedSpec[], removed: string[] } } {
  const calls: { created: CreatedSpec[], removed: string[] } = { created: [], removed: [] }
  const docker: StubDocker & { calls: typeof calls } = {
    calls,
    ping: overrides.ping ?? (async () => ({ ok: true })),
    ensureNetwork: overrides.ensureNetwork ?? (async () => {}),
    createContainer: overrides.createContainer ?? (async (name, spec) => {
      calls.created.push({ name, spec })
      return { Id: `id-${name}` }
    }),
    startContainer: overrides.startContainer ?? (async () => {}),
    stopContainer: overrides.stopContainer ?? (async () => {}),
    removeContainer: overrides.removeContainer ?? (async (id) => {
      calls.removed.push(id)
    }),
    logs: overrides.logs ?? (async () => ''),
    inspectContainer: overrides.inspectContainer ?? (async () => {
      throw new Error('Docker API GET /containers/foo/json failed: 404 no such container')
    }),
  }
  return docker
}

describe('parseBootstrapFromLogs', () => {
  it('returns null when the bootstrap token line is missing', () => {
    expect(parseBootstrapFromLogs('')).toBeNull()
    expect(parseBootstrapFromLogs('[worker] starting up...\n')).toBeNull()
    expect(parseBootstrapFromLogs('[worker] id=w_abcdef123456\n')).toBeNull()
  })

  it('extracts both id and token when both lines are present', () => {
    const logs = [
      '[worker] id=w_abcdef123456',
      '[worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_test_token_0000000000000000000000000',
      '[worker] save this token; it will not be printed again.',
    ].join('\n')
    const parsed = parseBootstrapFromLogs(logs)
    expect(parsed).not.toBeNull()
    expect(parsed!.workerId).toBe('w_abcdef123456')
    expect(parsed!.token).toBe('wtk_test_token_0000000000000000000000000' as import('@aiworker/shared').WorkerApiToken)
  })
})

describe('FleetSupervisor.buildEnv', () => {
  it('emits only the simplified PLAN-004 env vars', () => {
    const supervisor = new FleetSupervisor({ docker: makeDocker(), selfHostname: null })
    const env = supervisor.buildEnv({
      masterKeyHex: 'aa'.repeat(32),
      port: 3001,
    })
    // Check that it has the 4 required vars + common support vars.
    expect(env).toContain('AIWORKER_MODE=worker')
    expect(env).toContain(`AIWORKER_MASTER_KEY=${'aa'.repeat(32)}`)
    expect(env).toContain('PORT=3001')
    expect(env).toContain('WORKER_DB_PATH=/var/lib/aiworker/worker.db')
    // The old WORKER_ID / WORKER_CONFIG_JSON / WORKER_CONFIG_VERSION vars must be gone.
    expect(env.some(line => line.startsWith('WORKER_ID='))).toBe(false)
    expect(env.some(line => line.startsWith('WORKER_CONFIG_JSON='))).toBe(false)
    expect(env.some(line => line.startsWith('WORKER_CONFIG_VERSION='))).toBe(false)
  })

  it('injects AIWORKER_FORCE_ID only when supplied', () => {
    const supervisor = new FleetSupervisor({ docker: makeDocker(), selfHostname: null })
    const without = supervisor.buildEnv({ masterKeyHex: 'aa'.repeat(32), port: 3001 })
    expect(without.some(line => line.startsWith('AIWORKER_FORCE_ID='))).toBe(false)

    const withForce = supervisor.buildEnv({
      masterKeyHex: 'aa'.repeat(32),
      port: 3001,
      forceId: 'w_pnqrst234567',
    })
    expect(withForce).toContain('AIWORKER_FORCE_ID=w_pnqrst234567')
  })
})

describe('FleetSupervisor.launchLocal', () => {
  beforeAll(() => {
    // Make sure the test doesn't have to wait 30s if the token poll loop ever misbehaves.
  })

  it('runs the docker flow + returns the bootstrap triple on happy path', async () => {
    const docker = makeDocker({
      logs: async () => '[worker] id=w_abc456def789\n[worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_abc_00000000000000000000000000000000\n',
    })
    const supervisor = new FleetSupervisor({
      docker,
      allocatePort: async () => 3101,
      pollIntervalMs: 1,
      pollTimeoutMs: 500,
      selfHostname: null,
    })

    const result = await supervisor.launchLocal({ displayName: 'Alpha' })
    expect(result.workerId).toBe('w_abc456def789')
    expect(result.apiToken).toBe('wtk_abc_00000000000000000000000000000000' as import('@aiworker/shared').WorkerApiToken)
    expect(result.baseUrl).toMatch(/^http:\/\/aiworker-[0-9a-f]{8}:3001$/)
    expect(result.containerId).toMatch(/^id-aiworker-/)
    expect(result.containerName).toMatch(/^aiworker-[0-9a-f]{8}$/)

    expect(docker.calls.created).toHaveLength(1)
    const spec = docker.calls.created[0]!.spec as {
      Env: string[]
      Labels: Record<string, string>
      HostConfig: { Binds: string[], Memory: number, NanoCpus: number }
    }
    // The 4 simplified env vars must be present.
    expect(spec.Env).toContain('AIWORKER_MODE=worker')
    expect(spec.Env.some((e: string) => e.startsWith('AIWORKER_MASTER_KEY='))).toBe(true)
    expect(spec.Env).toContain('PORT=3101')
    expect(spec.Env).toContain('WORKER_DB_PATH=/var/lib/aiworker/worker.db')
    expect(spec.Labels['aiworker.addedBy']).toBe('launch-local')
    expect(spec.HostConfig.Binds[0]!).toContain(':/var/lib/aiworker')
    expect(docker.calls.removed).toHaveLength(0)
  })

  it('propagates AIWORKER_FORCE_ID into the container env when supplied', async () => {
    const docker = makeDocker({
      logs: async () => '[worker] id=w_pnqrst234567\n[worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_abc_00000000000000000000000000000000\n',
    })
    const supervisor = new FleetSupervisor({
      docker,
      allocatePort: async () => 3102,
      pollIntervalMs: 1,
      pollTimeoutMs: 500,
      selfHostname: null,
    })
    await supervisor.launchLocal({ displayName: 'Beta', forceId: 'w_pnqrst234567' })
    const spec = docker.calls.created[0]!.spec as { Env: string[] }
    expect(spec.Env).toContain('AIWORKER_FORCE_ID=w_pnqrst234567')
  })

  it('throws LaunchTimeoutError + cleans up the container when logs never surface the token', async () => {
    const docker = makeDocker({ logs: async () => '[worker] still starting up...\n' })
    const supervisor = new FleetSupervisor({
      docker,
      allocatePort: async () => 3103,
      pollIntervalMs: 1,
      pollTimeoutMs: 10,
      selfHostname: null,
    })
    await expect(supervisor.launchLocal({ displayName: 'Gamma' })).rejects.toBeInstanceOf(LaunchTimeoutError)
    expect(docker.calls.removed).toHaveLength(1)
  })

  it('wraps non-launch errors in LaunchFailedError + removes the container', async () => {
    const docker = makeDocker({
      startContainer: async () => {
        throw new Error('docker start refused')
      },
    })
    const supervisor = new FleetSupervisor({
      docker,
      allocatePort: async () => 3104,
      pollIntervalMs: 1,
      pollTimeoutMs: 10,
      selfHostname: null,
    })
    const err = await supervisor.launchLocal({ displayName: 'Delta' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LaunchFailedError)
    expect(docker.calls.removed).toHaveLength(1)
  })
})

describe('FleetSupervisor network self-check (PLAN-010 §P4)', () => {
  it('passes when the dashboard container is joined to AIWORKER_NETWORK', async () => {
    const docker = makeDocker({
      inspectContainer: async () => ({
        NetworkSettings: { Networks: { aiworker_default: {}, bridge: {} } },
      }),
      logs: async () => '[worker] id=w_abc456def789\n[worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_abc_00000000000000000000000000000000\n',
    })
    const supervisor = new FleetSupervisor({
      docker,
      allocatePort: async () => 3201,
      pollIntervalMs: 1,
      pollTimeoutMs: 500,
      selfHostname: 'abcdef012345',
    })
    const result = await supervisor.launchLocal({ displayName: 'Net1' })
    expect(result.workerId).toBe('w_abc456def789')
  })

  it('throws LaunchFailedError when the dashboard is not in the network', async () => {
    const docker = makeDocker({
      inspectContainer: async () => ({
        NetworkSettings: { Networks: { bridge: {} } },
      }),
    })
    const supervisor = new FleetSupervisor({
      docker,
      allocatePort: async () => 3202,
      pollIntervalMs: 1,
      pollTimeoutMs: 10,
      selfHostname: 'abcdef012345',
    })
    const err = await supervisor.launchLocal({ displayName: 'Net2' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LaunchFailedError)
    expect((err as Error).message).toMatch(/not a member of docker network/)
    // No container was created since ensureInfrastructure threw upstream.
    expect(docker.calls.created).toHaveLength(0)
  })

  it('soft-skips when HOSTNAME is not a container id (dev / bare-metal)', async () => {
    const docker = makeDocker({
      logs: async () => '[worker] id=w_abc456def789\n[worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_abc_00000000000000000000000000000000\n',
    })
    const supervisor = new FleetSupervisor({
      docker,
      allocatePort: async () => 3203,
      pollIntervalMs: 1,
      pollTimeoutMs: 500,
      selfHostname: 'laptop.local',
    })
    const result = await supervisor.launchLocal({ displayName: 'Net3' })
    expect(result.workerId).toBe('w_abc456def789')
  })

  it('soft-skips when inspect 404s (hostname is not a known container)', async () => {
    const docker = makeDocker({
      logs: async () => '[worker] id=w_abc456def789\n[worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_abc_00000000000000000000000000000000\n',
      inspectContainer: async () => {
        throw new Error('Docker API GET /containers/deadbeef000000/json failed: 404 no such container')
      },
    })
    const supervisor = new FleetSupervisor({
      docker,
      allocatePort: async () => 3204,
      pollIntervalMs: 1,
      pollTimeoutMs: 500,
      selfHostname: 'deadbeef0000',
    })
    const result = await supervisor.launchLocal({ displayName: 'Net4' })
    expect(result.workerId).toBe('w_abc456def789')
  })
})
