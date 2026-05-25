import { describe, expect, it } from 'bun:test'

import {
  LocalEngineResolutionError,
  resolveLocalCliEngine,
  scanLocalEnginesFromCommands,
} from './local-engine-resolver'

describe('local engine resolver', () => {
  it('resolves claude-code engine id to the installed claude command', () => {
    const engine = resolveLocalCliEngine({
      engineId: 'claude-code',
      engines: [{
        command: 'claude',
        id: 'claude-code',
        installed: true,
        name: 'Claude Code',
        path: '/Users/example/.local/bin/claude',
        version: '2.1.148 (Claude Code)',
      }],
    })

    expect(engine).toEqual({
      engineCommand: '/Users/example/.local/bin/claude',
      engineId: 'claude-code',
      engineName: 'Claude Code',
      executionMode: 'local-cli',
    })
  })

  it('rejects unknown engine ids before executor invocation', () => {
    expect(() => resolveLocalCliEngine({
      engineId: 'unknown-engine',
      engines: [],
    })).toThrow(LocalEngineResolutionError)
    expect(() => resolveLocalCliEngine({
      engineId: 'unknown-engine',
      engines: [],
    })).toThrow('Unknown local engine: unknown-engine')
  })

  it('rejects unknown engine ids even when persisted readiness claims installed', () => {
    expect(() => resolveLocalCliEngine({
      engineId: 'unknown-engine',
      engines: [{
        command: 'echo',
        id: 'unknown-engine',
        installed: true,
        name: 'Unknown Engine',
        path: '/bin/echo',
        version: 'echo 1.0',
      }],
    })).toThrow(LocalEngineResolutionError)
    expect(() => resolveLocalCliEngine({
      engineId: 'unknown-engine',
      engines: [{
        command: 'echo',
        id: 'unknown-engine',
        installed: true,
        name: 'Unknown Engine',
        path: '/bin/echo',
        version: 'echo 1.0',
      }],
    })).toThrow('Unknown local engine: unknown-engine')
  })

  it('rejects known but unavailable local engines before executor invocation', () => {
    expect(() => resolveLocalCliEngine({
      engineId: 'claude-code',
      engines: [{
        command: 'claude',
        id: 'claude-code',
        installed: false,
        name: 'Claude Code',
        path: null,
        version: null,
      }],
    })).toThrow('Selected local engine is not installed: Claude Code')
  })

  it('scans known command definitions into readiness rows', () => {
    const engines = scanLocalEnginesFromCommands([
      { command: 'codex', id: 'codex', name: 'Codex CLI' },
      { command: 'claude', id: 'claude-code', name: 'Claude Code' },
    ], command => command === 'claude'
      ? { path: '/bin/claude', version: 'Claude 1.0' }
      : null)

    expect(engines).toEqual([
      { command: 'codex', id: 'codex', installed: false, name: 'Codex CLI', path: null, version: null },
      { command: 'claude', id: 'claude-code', installed: true, name: 'Claude Code', path: '/bin/claude', version: 'Claude 1.0' },
    ])
  })
})
