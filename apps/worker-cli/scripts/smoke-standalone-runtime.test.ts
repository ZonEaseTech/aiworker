import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

import { parseOfficialFreeformDescriptorJson } from '../src/official-freeform-descriptor'
import { assertStandaloneDescriptorRefsForRoot } from './smoke-standalone-runtime'

describe('standalone runtime smoke script contract', () => {
  it('validates the unpacked official Freeform descriptor refs from standalone official apps', async () => {
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
      workbench: {
        entry: 'dist/web/workbench/index.html',
        mode: 'sdk-common',
        router: { mode: 'search' },
        type: 'micro-app',
      },
      api: null,
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
    const root = await mkdtemp(join(tmpdir(), 'aiworker-standalone-ref-test-'))
    try {
      await mkdir(join(root, 'dist/web/workbench'), { recursive: true })
      await mkdir(join(root, 'dist/engine-assets/workspace'), { recursive: true })
      await mkdir(join(root, 'dist/engine-assets/skills/freeform'), { recursive: true })
      await mkdir(join(root, 'dist/engine-assets/mcp/claude-code'), { recursive: true })
      await mkdir(join(root, 'dist/engine-assets/mcp/codex'), { recursive: true })
      await writeFile(join(root, 'dist/web/workbench/index.html'), '<!doctype html>')
      await writeFile(join(root, 'dist/engine-assets/workspace/README.md'), 'workspace')
      await writeFile(join(root, 'dist/engine-assets/skills/freeform/SKILL.md'), 'skill')
      await writeFile(join(root, 'dist/engine-assets/mcp/claude-code/.mcp.json'), '{}')
      await writeFile(join(root, 'dist/engine-assets/mcp/codex/config.toml'), '')

      await expect(assertStandaloneDescriptorRefsForRoot(root, [
        { kind: 'file', ref: descriptor.workbench.entry },
        { kind: 'dir', ref: descriptor.engine.workspaceAssets?.source },
        { kind: 'dir', ref: descriptor.engine.skills?.source },
        ...Object.values(descriptor.engine.mcp?.targets ?? {}).map(target => ({ kind: 'file' as const, ref: target.file })),
      ])).resolves.toBeUndefined()

      await expect(assertStandaloneDescriptorRefsForRoot(root, [
        { kind: 'file', ref: '../outside.txt' },
      ])).rejects.toThrow('standalone Freeform descriptor reference escapes package root: ../outside.txt')

      await expect(assertStandaloneDescriptorRefsForRoot(root, [
        { kind: 'file', ref: 'dist/web/workbench/missing.html' },
      ])).rejects.toThrow('standalone Freeform descriptor references missing file:')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
