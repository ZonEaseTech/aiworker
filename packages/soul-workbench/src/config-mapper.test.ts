import { describe, expect, it } from 'bun:test'

import { selectOverlayAssets, summarizeEngineTargets, summarizeWorkerConfig } from './config-mapper'

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

describe('selectOverlayAssets', () => {
  const assets = [
    { enabled: true, id: 'freeform-session', kind: 'skill', target: 'codex' },
    { enabled: true, id: 'codex', kind: 'mcp-client', target: 'codex' },
    { enabled: false, id: 'AGENTS.md', kind: 'entry-file', target: '' },
  ]

  it('selects overlay asset rows for the requested kind', () => {
    expect(selectOverlayAssets(assets, 'skill')).toEqual([{ enabled: true, id: 'freeform-session', target: 'codex' }])
    expect(selectOverlayAssets(assets, 'mcp-client')).toEqual([{ enabled: true, id: 'codex', target: 'codex' }])
    expect(selectOverlayAssets(assets, 'entry-file')).toEqual([{ enabled: false, id: 'AGENTS.md', target: '' }])
  })

  it('returns an empty list when no asset matches the kind', () => {
    expect(selectOverlayAssets(assets, 'native-mcp-file')).toEqual([])
    expect(selectOverlayAssets([], 'skill')).toEqual([])
  })
})
