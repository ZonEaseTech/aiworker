import { describe, expect, it } from 'bun:test'
import { DEFAULT_EXECUTOR_PROFILE, DEFAULT_PROFILES, migrateLegacyExecutor, resolveVariant } from './default-profiles'

describe('DEFAULT_PROFILES catalog', () => {
  it('lists at least one variant per engine', () => {
    for (const [engine, entry] of Object.entries(DEFAULT_PROFILES)) {
      const keys = Object.keys(entry.variants)
      expect(keys.length).toBeGreaterThan(0)
      // Either an explicit `default` or the engine-specific named variants
      // (acp uses agent names).
      const hasDefaultLike = keys.includes('default')
        || (engine === 'acp' && keys.includes('gemini'))
      expect(hasDefaultLike).toBe(true)
    }
  })
})

describe('resolveVariant', () => {
  it('returns the variant body for a known engine + variant', () => {
    const r = resolveVariant({ engine: 'http', variant: 'deepseek' })
    expect(r.engine).toBe('http')
    expect(r.body).toEqual(DEFAULT_PROFILES.http.variants.deepseek!)
  })

  it('shallow-merges body overrides on top of the variant body', () => {
    const r = resolveVariant({
      engine: 'http',
      variant: 'default',
      overrides: { baseUrl: 'https://custom', model: 'gpt-foo' },
    })
    expect((r.body as { baseUrl: string }).baseUrl).toBe('https://custom')
    expect((r.body as { model: string }).model).toBe('gpt-foo')
    // unspecified field falls back to variant default
    expect((r.body as { timeoutMs: number }).timeoutMs).toBe(30_000)
  })

  it('splits cmd overrides off the body bag', () => {
    const r = resolveVariant({
      engine: 'claude-code',
      variant: 'default',
      overrides: {
        cmd: { binary: '/opt/claude', extraArgs: ['--debug'] },
        extraArgs: ['--from-body'],
      },
    })
    expect(r.cmd?.binary).toBe('/opt/claude')
    expect(r.cmd?.extraArgs).toEqual(['--debug'])
    // The body keeps its own extraArgs — the factory is responsible for
    // composing both lists, not resolveVariant.
    expect((r.body as { extraArgs?: string[] }).extraArgs).toEqual(['--from-body'])
  })

  it('forwards per-request modelId / reasoningId / permissionPolicy', () => {
    const r = resolveVariant({
      engine: 'claude-code',
      variant: 'default',
      modelId: 'sonnet-3.5',
      reasoningId: 'high',
      permissionPolicy: 'plan',
    })
    expect(r.modelId).toBe('sonnet-3.5')
    expect(r.reasoningId).toBe('high')
    expect(r.permissionPolicy).toBe('plan')
  })

  it('leaves claude-code default model to the external CLI', () => {
    const r = resolveVariant({ engine: 'claude-code', variant: 'default' })
    expect((r.body as { model?: string }).model).toBeUndefined()
  })

  it('does not set default watchdog timeouts for native executor variants', () => {
    for (const engine of ['claude-code', 'acp', 'codex', 'cursor'] as const) {
      for (const body of Object.values(DEFAULT_PROFILES[engine].variants))
        expect((body as { timeoutMs?: number }).timeoutMs).toBeUndefined()
    }
  })

  it('throws on unknown engine', () => {
    expect(() => resolveVariant({ engine: 'nope' as never, variant: 'default' })).toThrow(/unknown executor engine/)
  })

  it('throws on unknown variant', () => {
    expect(() => resolveVariant({ engine: 'http', variant: 'no-such-variant' })).toThrow(/unknown executor variant/)
  })
})

describe('migrateLegacyExecutor', () => {
  it('passes through new-shape profiles untouched', () => {
    const newShape = { engine: 'http' as const, variant: 'default' as const }
    expect(migrateLegacyExecutor(newShape)).toEqual(newShape)
  })

  it('migrates legacy http into engine/variant/overrides', () => {
    const legacy = {
      type: 'http',
      baseUrl: 'http://x',
      apiKey: 'k',
      model: 'gpt-4o-mini',
      timeoutMs: 30_000,
    }
    const out = migrateLegacyExecutor(legacy)
    expect(out.engine).toBe('http')
    expect(out.variant).toBe('default')
    expect(out.overrides).toEqual({
      baseUrl: 'http://x',
      apiKey: 'k',
      model: 'gpt-4o-mini',
      timeoutMs: 30_000,
    })
  })

  it('migrates legacy mcp', () => {
    const out = migrateLegacyExecutor({
      type: 'mcp',
      url: 'https://mcp',
      token: 't',
      defaultModel: 'sonnet',
      tools: ['a', 'b'],
    })
    expect(out.engine).toBe('mcp')
    expect(out.variant).toBe('default')
    expect(out.overrides).toEqual({
      url: 'https://mcp',
      token: 't',
      defaultModel: 'sonnet',
      tools: ['a', 'b'],
    })
  })

  it('migrates legacy cli', () => {
    const out = migrateLegacyExecutor({
      type: 'cli',
      command: 'echo',
      args: ['hi'],
      cwd: '/tmp',
      sandbox: true,
    })
    expect(out.engine).toBe('cli')
    expect(out.variant).toBe('default')
    expect(out.overrides).toEqual({
      command: 'echo',
      args: ['hi'],
      cwd: '/tmp',
      sandbox: true,
    })
  })

  it('migrates legacy claude-code', () => {
    const out = migrateLegacyExecutor({
      type: 'claude-code',
      model: 'opus',
      cliVersion: '2.1.0',
      extraArgs: ['--verbose'],
    })
    expect(out.engine).toBe('claude-code')
    expect(out.variant).toBe('default')
    expect(out.overrides).toEqual({
      model: 'opus',
      cliVersion: '2.1.0',
      extraArgs: ['--verbose'],
    })
  })

  it('migrates legacy acp — agent becomes the variant key', () => {
    const out = migrateLegacyExecutor({
      type: 'acp',
      agent: 'qwen',
      model: 'qwen3-coder',
      cliVersion: '0.5.0',
    })
    expect(out.engine).toBe('acp')
    expect(out.variant).toBe('qwen')
    expect(out.overrides).toEqual({
      model: 'qwen3-coder',
      cliVersion: '0.5.0',
    })
  })

  it('falls back to the default profile on unknown / malformed input', () => {
    expect(migrateLegacyExecutor(null)).toEqual(DEFAULT_EXECUTOR_PROFILE)
    expect(migrateLegacyExecutor({})).toEqual(DEFAULT_EXECUTOR_PROFILE)
    expect(migrateLegacyExecutor({ type: 'mystery' })).toEqual(DEFAULT_EXECUTOR_PROFILE)
  })

  it('drops undefined fields when migrating to keep the override bag tight', () => {
    const out = migrateLegacyExecutor({
      type: 'http',
      baseUrl: 'http://x',
      apiKey: 'k',
      model: 'm',
      timeoutMs: 30_000,
      // legacy field not present in the new shape — should be ignored
      legacyField: 'ignore',
    })
    expect(out.overrides).not.toHaveProperty('legacyField')
  })
})
