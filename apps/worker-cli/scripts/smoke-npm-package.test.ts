import { describe, expect, it } from 'bun:test'

import { parseOfficialFreeformDescriptorJson } from '../src/official-freeform-descriptor'
import { assertTarballDescriptorRefs } from './smoke-npm-package'

describe('npm package smoke script contract', () => {
  it('validates parsed descriptor refs against real npm tarball entries', () => {
    const descriptor = parseOfficialFreeformDescriptorJson(JSON.stringify({
      protocol: 'soul/v1',
      identity: {
        appId: 'aiworker-freeform',
        description: 'Open-ended Soul for freeform local work.',
        name: 'AIWorker Freeform',
        soulId: 'freeform',
        version: '0.1.0',
      },
      compatibility: {
        engines: ['codex', 'claude-code'],
        host: '>=1.0.0',
        sdk: '>=1.0.0',
      },
      configuration: {
        defaults: { engine: 'codex' },
        features: {
          engine: true,
          mcp: true,
          skills: true,
          workbench: true,
          workspaceAssets: true,
        },
        scope: 'worker',
        version: '1',
      },
      engine: {
        workspaceAssets: { source: 'dist/engine-assets/workspace' },
        skills: { source: 'dist/engine-assets/skills' },
        mcp: {
          targets: {
            'claude-code': { file: 'dist/engine-assets/mcp/claude-code/.mcp.json' },
            'codex': { file: 'dist/engine-assets/mcp/codex/config.toml' },
          },
        },
      },
      health: {
        ready: true,
        type: 'static',
      },
      extensions: {},
      external: {},
    }))
    const files = [
      'package/official-apps/aiworker-freeform/dist/engine-assets/workspace/README.md',
      'package/official-apps/aiworker-freeform/dist/engine-assets/skills/freeform/SKILL.md',
      'package/official-apps/aiworker-freeform/dist/engine-assets/mcp/claude-code/.mcp.json',
      'package/official-apps/aiworker-freeform/dist/engine-assets/mcp/codex/config.toml',
    ]

    expect(() => assertTarballDescriptorRefs(files, 'package/official-apps/aiworker-freeform', [
      { kind: 'dir', ref: descriptor.engine.workspaceAssets?.source },
      { kind: 'dir', ref: descriptor.engine.skills?.source },
      ...Object.values(descriptor.engine.mcp?.targets ?? {}).map(target => ({ kind: 'file' as const, ref: target.file })),
    ])).not.toThrow()

    expect(() => assertTarballDescriptorRefs(files, 'package/official-apps/aiworker-freeform', [
      { kind: 'file', ref: '../outside.txt' },
    ])).toThrow('npm package descriptor reference escapes package root: ../outside.txt')

    expect(() => assertTarballDescriptorRefs(files, 'package/official-apps/aiworker-freeform', [
      { kind: 'file', ref: 'dist/engine-assets/mcp/codex/missing.toml' },
    ])).toThrow('npm package descriptor references missing file: package/official-apps/aiworker-freeform/dist/engine-assets/mcp/codex/missing.toml')
  })
})
