import type { LocalSettingsConfig } from '@zonease/aiworker-soul-descriptor'

import { describe, expect, it } from 'vitest'

import { messagesFor } from '../../../features/i18n'
import { composerReadinessMessage, deriveComposerReadiness } from './composer-readiness'

function settings(overrides: Partial<LocalSettingsConfig>): LocalSettingsConfig {
  return {
    appearance: 'system',
    byok: { apiKeyRef: '', baseUrl: '', model: '', provider: '' },
    connectors: [],
    engineId: 'codex',
    engines: [],
    executionMode: 'local-cli',
    externalMcpServers: [],
    language: 'en',
    localMcpServer: { enabled: false, url: '' },
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('deriveComposerReadiness', () => {
  it('blocks local-cli when the selected engine is not in local settings', () => {
    const readiness = deriveComposerReadiness(settings({ executionMode: 'local-cli', engineId: 'codex', engines: [] }))
    expect(readiness.ready).toBe(false)
    expect(readiness.reason).toEqual({ kind: 'engine-missing', engineId: 'codex' })
  })

  it('blocks local-cli when the selected engine is present but not installed', () => {
    const readiness = deriveComposerReadiness(settings({
      executionMode: 'local-cli',
      engineId: 'codex',
      engines: [{ command: 'codex', id: 'codex', installed: false, name: 'Codex CLI', path: null, version: null }],
    }))
    expect(readiness.ready).toBe(false)
    expect(readiness.reason).toEqual({ kind: 'engine-not-installed', engineName: 'Codex CLI' })
  })

  it('is ready for local-cli when the selected engine is installed', () => {
    const readiness = deriveComposerReadiness(settings({
      executionMode: 'local-cli',
      engineId: 'codex',
      engines: [{ command: 'codex', id: 'codex', installed: true, name: 'Codex CLI', path: '/usr/bin/codex', version: '1.0' }],
    }))
    expect(readiness).toEqual({ ready: true, reason: null })
  })

  it('blocks byok until provider, model, and key reference are all present', () => {
    const missingKey = deriveComposerReadiness(settings({
      executionMode: 'byok',
      byok: { apiKeyRef: '', baseUrl: '', model: 'gpt-4o', provider: 'openai-compatible' },
    }))
    expect(missingKey.ready).toBe(false)
    expect(missingKey.reason).toEqual({ kind: 'byok-needs-key' })
  })

  it('is ready for byok when provider, model, and key reference are set', () => {
    const readiness = deriveComposerReadiness(settings({
      executionMode: 'byok',
      byok: { apiKeyRef: 'env:OPENAI_API_KEY', baseUrl: '', model: 'gpt-4o', provider: 'openai-compatible' },
    }))
    expect(readiness).toEqual({ ready: true, reason: null })
  })
})

describe('composerReadinessMessage', () => {
  const copy = messagesFor('en')

  it('resolves each reason into employee-facing guidance reusing existing copy', () => {
    expect(composerReadinessMessage({ kind: 'byok-needs-key' }, copy)).toBe(copy.workspace.byokNeedsKey)
    expect(composerReadinessMessage({ kind: 'engine-missing', engineId: 'codex' }, copy)).toBe(copy.workspace.engineMissing('codex'))
    expect(composerReadinessMessage({ kind: 'engine-not-installed', engineName: 'Codex CLI' }, copy)).toBe(copy.workspace.engineNotInstalled('Codex CLI'))
  })
})
