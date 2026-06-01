import { describe, expect, it } from 'bun:test'

import { summarizeEngineTargets, summarizeWorkerConfig } from './config-mapper'

describe('summarizeWorkerConfig', () => {
  it('summarizes config values by key, kind, enabled flag and source', () => {
    expect(summarizeWorkerConfig([
      { configKey: 'engine-selection', source: 'web', value: { enabled: true, kind: 'engine-selection', target: 'codex' } },
      { configKey: 'mcp-overlay', source: 'cli', value: { enabled: false, kind: 'mcp-overlay' } },
    ])).toEqual([
      { configKey: 'engine-selection', enabled: true, kind: 'engine-selection', source: 'web' },
      { configKey: 'mcp-overlay', enabled: false, kind: 'mcp-overlay', source: 'cli' },
    ])
  })

  it('defaults missing kind/source to "unknown" and a missing enabled flag to false', () => {
    expect(summarizeWorkerConfig([{ configKey: 'skills-overlay', value: {} }])).toEqual([
      { configKey: 'skills-overlay', enabled: false, kind: 'unknown', source: 'unknown' },
    ])
  })

  it('returns an empty list for no values', () => {
    expect(summarizeWorkerConfig([])).toEqual([])
  })
})

describe('summarizeEngineTargets', () => {
  it('summarizes engine targets by id, name and installed flag', () => {
    expect(summarizeEngineTargets([
      { id: 'codex', installed: true, name: 'Codex', version: '1.2.3' },
      { id: 'claude', installed: false, name: 'Claude Code' },
    ])).toEqual([
      { id: 'codex', installed: true, name: 'Codex' },
      { id: 'claude', installed: false, name: 'Claude Code' },
    ])
  })

  it('falls back to the id for a missing name and treats a missing installed flag as false', () => {
    expect(summarizeEngineTargets([{ id: 'codex' }])).toEqual([
      { id: 'codex', installed: false, name: 'codex' },
    ])
  })

  it('returns an empty list for no engines', () => {
    expect(summarizeEngineTargets([])).toEqual([])
  })
})
