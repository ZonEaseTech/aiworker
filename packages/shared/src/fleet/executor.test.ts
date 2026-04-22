import type { ExecutorProfile } from './executor'
import { describe, expect, it } from 'bun:test'

describe('ExecutorProfile shape', () => {
  it('accepts a minimal http profile', () => {
    const profile: ExecutorProfile = { engine: 'http', variant: 'default' }
    expect(profile.engine).toBe('http')
    expect(profile.variant).toBe('default')
    expect(profile.overrides).toBeUndefined()
  })

  it('accepts overrides + cmd + per-request modelId', () => {
    const profile: ExecutorProfile = {
      engine: 'claude-code',
      variant: 'default',
      overrides: {
        cmd: { binary: '/usr/local/bin/claude', extraArgs: ['--verbose'] },
        extraArgs: ['--debug'],
      },
      modelId: 'opus',
      reasoningId: 'high',
      permissionPolicy: 'plan',
    }
    expect(profile.overrides?.cmd?.binary).toBe('/usr/local/bin/claude')
    expect(profile.modelId).toBe('opus')
    expect(profile.permissionPolicy).toBe('plan')
  })

  it('accepts an acp profile keyed by agent name as variant', () => {
    const profile: ExecutorProfile = {
      engine: 'acp',
      variant: 'gemini',
      overrides: { model: 'gemini-2.5-pro' },
    }
    expect(profile.variant).toBe('gemini')
  })

  it('accepts a codex profile with model override (FEAT-016)', () => {
    const profile: ExecutorProfile = {
      engine: 'codex',
      variant: 'default',
      overrides: { model: 'gpt-5.2-codex' },
    }
    expect(profile.engine).toBe('codex')
    expect(profile.overrides?.model).toBe('gpt-5.2-codex')
  })

  it('accepts a cursor profile with model auto (FEAT-016)', () => {
    const profile: ExecutorProfile = {
      engine: 'cursor',
      variant: 'default',
    }
    expect(profile.engine).toBe('cursor')
    expect(profile.variant).toBe('default')
  })
})
