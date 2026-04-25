import type { AvailabilityDeps, EngineAvailability } from './availability'
import { describe, expect, it } from 'bun:test'
import { AVAILABILITY_CACHE_TTL_MS, createAvailabilityProbe } from './availability'

/**
 * Deterministic FS + PATH stubs. Keeps tests off the real container
 * filesystem so the same expectations hold regardless of CI layout.
 */
function makeDeps(overrides: Partial<AvailabilityDeps> = {}): AvailabilityDeps {
  let clock = 1_000_000
  return {
    resolveBinary: async () => null,
    pathExists: async () => false,
    homedir: () => '/home/test',
    now: () => {
      const t = clock
      clock += 1
      return t
    },
    ...overrides,
  }
}

function findByKey(
  list: EngineAvailability[],
  kind: EngineAvailability['kind'],
  agent?: string,
): EngineAvailability {
  const hit = list.find(e => e.kind === kind && e.agent === agent)
  if (!hit)
    throw new Error(`no availability entry for ${kind}${agent ? `:${agent}` : ''}`)
  return hit
}

describe('availability.probeAll — three-state coverage', () => {
  it('reports ready for http / mcp / cli regardless of FS state', async () => {
    const probe = createAvailabilityProbe(makeDeps())
    const all = await probe.probeAll()
    for (const kind of ['http', 'mcp', 'cli'] as const) {
      const entry = findByKey(all, kind)
      expect(entry.status).toBe('ready')
      expect(entry.authHint).toBe('no-cli-required')
    }
  })

  it('claude-code: ready when PATH + ~/.claude.json both present', async () => {
    const probe = createAvailabilityProbe(makeDeps({
      resolveBinary: async name => (name === 'claude' ? '/usr/bin/claude' : null),
      pathExists: async p => p === '/home/test/.claude.json',
    }))
    const all = await probe.probeAll()
    const entry = findByKey(all, 'claude-code')
    expect(entry.status).toBe('ready')
    expect(entry.binaryPath).toBe('/usr/bin/claude')
    expect(entry.authHint).toBe('auth-file-present')
  })

  it('claude-code: login-required when PATH present but no auth file', async () => {
    const probe = createAvailabilityProbe(makeDeps({
      resolveBinary: async name => (name === 'claude' ? '/usr/bin/claude' : null),
    }))
    const all = await probe.probeAll()
    const entry = findByKey(all, 'claude-code')
    expect(entry.status).toBe('login-required')
    expect(entry.binaryPath).toBe('/usr/bin/claude')
    expect(entry.authHint).toBe('auth-file-missing')
  })

  it('claude-code: not-found when PATH missing', async () => {
    const probe = createAvailabilityProbe(makeDeps())
    const all = await probe.probeAll()
    const entry = findByKey(all, 'claude-code')
    expect(entry.status).toBe('not-found')
    expect(entry.binaryPath).toBeUndefined()
    expect(entry.authHint).toBe('binary-not-on-path')
  })

  it('acp: expands into gemini + qwen entries each with their own status', async () => {
    const probe = createAvailabilityProbe(makeDeps({
      resolveBinary: async name => name === 'gemini'
        ? '/usr/bin/gemini'
        : name === 'qwen'
          ? '/usr/bin/qwen'
          : null,
      pathExists: async p => p === '/home/test/.gemini/oauth_creds.json',
    }))
    const all = await probe.probeAll()
    const gemini = findByKey(all, 'acp', 'gemini')
    const qwen = findByKey(all, 'acp', 'qwen')
    expect(gemini.status).toBe('ready')
    expect(qwen.status).toBe('login-required')
  })

  it('acp qwen: ready when ~/.qwen/settings.json is present (fallback path)', async () => {
    const probe = createAvailabilityProbe(makeDeps({
      resolveBinary: async name => (name === 'qwen' ? '/usr/bin/qwen' : null),
      pathExists: async p => p === '/home/test/.qwen/settings.json',
    }))
    const all = await probe.probeAll()
    const qwen = findByKey(all, 'acp', 'qwen')
    expect(qwen.status).toBe('ready')
  })

  it('codex: three-state matrix', async () => {
    const ready = await createAvailabilityProbe(makeDeps({
      resolveBinary: async name => (name === 'codex' ? '/usr/bin/codex' : null),
      pathExists: async p => p === '/home/test/.codex/auth.json',
    })).probeAll()
    expect(findByKey(ready, 'codex').status).toBe('ready')

    const login = await createAvailabilityProbe(makeDeps({
      resolveBinary: async name => (name === 'codex' ? '/usr/bin/codex' : null),
    })).probeAll()
    expect(findByKey(login, 'codex').status).toBe('login-required')

    const missing = await createAvailabilityProbe(makeDeps()).probeAll()
    expect(findByKey(missing, 'codex').status).toBe('not-found')
  })

  it('cursor: three-state matrix — auth file accepted at multiple paths', async () => {
    const cases: Array<[string, EngineAvailability['status']]> = [
      ['/home/test/.cursor/cli-config.json', 'ready'],
      ['/home/test/.cursor-agent/auth.json', 'ready'],
      ['/home/test/.cursor/auth.json', 'ready'],
    ]
    for (const [authPath, expected] of cases) {
      const probe = createAvailabilityProbe(makeDeps({
        resolveBinary: async name => (name === 'cursor-agent' ? '/usr/bin/cursor-agent' : null),
        pathExists: async p => p === authPath,
      }))
      const all = await probe.probeAll()
      expect(findByKey(all, 'cursor').status).toBe(expected)
    }

    const loginOnly = await createAvailabilityProbe(makeDeps({
      resolveBinary: async name => (name === 'cursor-agent' ? '/usr/bin/cursor-agent' : null),
    })).probeAll()
    expect(findByKey(loginOnly, 'cursor').status).toBe('login-required')

    const missing = await createAvailabilityProbe(makeDeps()).probeAll()
    expect(findByKey(missing, 'cursor').status).toBe('not-found')
  })
})

describe('availability.probeAll — caching', () => {
  it('caches results per EngineKind × agent for 10 minutes', async () => {
    let binaryCalls = 0
    const probe = createAvailabilityProbe(makeDeps({
      resolveBinary: async () => {
        binaryCalls++
        return '/usr/bin/x'
      },
      pathExists: async () => true,
    }))

    await probe.probeAll()
    const firstCount = binaryCalls
    await probe.probeAll()
    // All 5 targets (claude / acp:gemini / acp:qwen / codex / cursor) cached.
    expect(binaryCalls).toBe(firstCount)
  })

  it('refresh=true bypasses the cache', async () => {
    let binaryCalls = 0
    const probe = createAvailabilityProbe(makeDeps({
      resolveBinary: async () => {
        binaryCalls++
        return '/usr/bin/x'
      },
      pathExists: async () => false,
    }))

    await probe.probeAll()
    const firstCount = binaryCalls
    await probe.probeAll({ refresh: true })
    expect(binaryCalls).toBeGreaterThan(firstCount)
  })

  it('cache expires after AVAILABILITY_CACHE_TTL_MS', async () => {
    let current = 1_000_000
    let binaryCalls = 0
    const probe = createAvailabilityProbe(makeDeps({
      resolveBinary: async () => {
        binaryCalls++
        return null
      },
      now: () => current,
    }))

    await probe.probeAll()
    const firstCount = binaryCalls
    current += AVAILABILITY_CACHE_TTL_MS + 1
    await probe.probeAll()
    expect(binaryCalls).toBeGreaterThan(firstCount)
  })
})

describe('availability.probe(kind)', () => {
  it('returns ready for http without consulting FS', async () => {
    const probe = createAvailabilityProbe(makeDeps())
    const entry = await probe.probe('http')
    expect(entry.status).toBe('ready')
    expect(entry.kind).toBe('http')
  })

  it('returns the requested acp agent when specified', async () => {
    const probe = createAvailabilityProbe(makeDeps({
      resolveBinary: async name => (name === 'qwen' ? '/usr/bin/qwen' : null),
      pathExists: async p => p === '/home/test/.qwen/oauth_creds.json',
    }))
    const entry = await probe.probe('acp', { agent: 'qwen' })
    expect(entry.kind).toBe('acp')
    expect(entry.agent).toBe('qwen')
    expect(entry.status).toBe('ready')
  })
})
