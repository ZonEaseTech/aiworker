import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { parseOfficialFreeformDescriptorJson } from '../src/official-freeform-descriptor'
import { assertStandaloneBundleDescriptorRefs } from './smoke-standalone-release'

describe('standalone release smoke script contract', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'aiworker-standalone-release-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('validates official Freeform descriptor refs from final standalone bundles', async () => {
    const descriptor = parseOfficialFreeformDescriptorJson(fixtureDescriptorText())
    const appRoot = join(root, 'release', 'aiworker-test-target', 'official-apps', 'aiworker-freeform')
    await mkdir(join(appRoot, 'dist', 'engine-assets', 'workspace'), { recursive: true })
    await mkdir(join(appRoot, 'dist', 'engine-assets', 'skills'), { recursive: true })
    await mkdir(join(appRoot, 'dist', 'engine-assets', 'mcp', 'codex'), { recursive: true })
    await mkdir(join(appRoot, 'dist', 'engine-assets', 'mcp', 'claude-code'), { recursive: true })
    await writeFile(join(appRoot, 'dist', 'engine-assets', 'workspace', 'README.md'), 'workspace\n')
    await writeFile(join(appRoot, 'dist', 'engine-assets', 'skills', 'SKILL.md'), 'skill\n')
    await writeFile(join(appRoot, 'dist', 'engine-assets', 'mcp', 'codex', 'config.toml'), '# codex\n')
    await writeFile(join(appRoot, 'dist', 'engine-assets', 'mcp', 'claude-code', '.mcp.json'), '{}\n')

    await expect(assertStandaloneBundleDescriptorRefs(appRoot, [
      { kind: 'dir', ref: descriptor.engine.workspaceAssets?.source },
      { kind: 'dir', ref: descriptor.engine.skills?.source },
      ...Object.values(descriptor.engine.mcp?.targets ?? {}).map(target => ({ kind: 'file' as const, ref: target.file })),
    ])).resolves.toBeUndefined()

    await expect(assertStandaloneBundleDescriptorRefs(appRoot, [
      { kind: 'file', ref: '../outside.txt' },
    ])).rejects.toThrow('standalone bundle Freeform descriptor reference escapes package root: ../outside.txt')

    await expect(assertStandaloneBundleDescriptorRefs(appRoot, [
      { kind: 'file', ref: 'dist/engine-assets/mcp/codex/missing.toml' },
    ])).rejects.toThrow('standalone bundle Freeform descriptor references missing file:')
  })

  it('rejects the current-platform standalone bundle when its version output does not match the dist package', async () => {
    const target = currentTestTarget()
    await writeFixtureDist(root)
    const { runStandaloneReleaseSmoke } = await import('./smoke-standalone-release')

    await expect(
      runStandaloneReleaseSmoke({
        binaryTextForTarget: () => '#!/bin/sh\necho 9.9.9-wrong\n',
        rootDir: root,
        targets: [target],
      }),
    ).rejects.toThrow(`release artifact aiworker-${target}.tar.gz binary smoke failed: aiworker-${target}/aiworker --version did not report 0.19.3`)
  })
})

async function writeFixtureDist(root: string): Promise<void> {
  const dist = join(root, 'apps', 'worker-cli', 'dist')
  await mkdir(join(dist, 'web', 'worker'), { recursive: true })
  await mkdir(join(dist, 'drizzle', 'worker', 'meta'), { recursive: true })
  await mkdir(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'workspace'), { recursive: true })
  await mkdir(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'skills'), { recursive: true })
  await mkdir(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'codex'), { recursive: true })
  await mkdir(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'claude-code'), { recursive: true })
  await writeFile(join(dist, 'package.json'), '{"version":"0.19.3"}\n')
  await writeFile(join(dist, 'web', 'worker', 'index.html'), '<!doctype html>\n')
  await writeFile(join(dist, 'drizzle', 'worker', '0000_fixture.sql'), '-- migration\n')
  await writeFile(join(dist, 'drizzle', 'worker', 'meta', '_journal.json'), '{"entries":[{"tag":"0000_fixture"}]}\n')
  await writeFile(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'codex', 'config.toml'), '# codex\n')
  await writeFile(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'claude-code', '.mcp.json'), '{}\n')
  await writeFile(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'soul.descriptor.json'), fixtureDescriptorText())
  await writeFile(join(dist, 'README.md'), '# AIWorker\n')
}

function fixtureDescriptorText(): string {
  return `${JSON.stringify({
    engine: {
      mcp: {
        targets: {
          'claude-code': { file: 'dist/engine-assets/mcp/claude-code/.mcp.json' },
          'codex': { file: 'dist/engine-assets/mcp/codex/config.toml' },
        },
      },
      skills: { source: 'dist/engine-assets/skills' },
      workspaceAssets: { source: 'dist/engine-assets/workspace' },
    },
    identity: { id: 'aiworker-freeform', name: 'AIWorker Freeform' },
    protocol: 'soul/v1',
  })}\n`
}

function currentTestTarget(): string {
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : null
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null
  if (!platform || !arch)
    throw new Error(`unsupported test target: ${process.platform}-${process.arch}`)
  return `${platform}-${arch}`
}
