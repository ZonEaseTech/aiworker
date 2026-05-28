import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

describe('standalone release smoke script contract', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'aiworker-standalone-release-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('validates official Freeform descriptor refs from final standalone bundles', async () => {
    const source = await readFile(join(import.meta.dirname, 'smoke-standalone-release.ts'), 'utf8')

    expect(source).toContain('runStandaloneReleaseSmoke')
    expect(source).toContain('verifyReleaseArtifacts')
    expect(source).toContain('readDistPackageVersion')
    expect(source).toContain('currentTarget')
    expect(source).toContain('aiworker/${version}')
    expect(source).toContain('assertStandaloneBundleOfficialFreeformDescriptor')
    expect(source).toContain('assertStandaloneBundleDescriptorRefs')
    expect(source).toContain('parseOfficialFreeformDescriptorJson')
    expect(source).toContain(['release/', '{bundle}/official-apps/aiworker-freeform'].join('$'))
    expect(source).toContain('soul.descriptor.json')
    expect(source).toContain('descriptor refs')
    expect(source).toContain('descriptor reference escapes package root')
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
  const dist = join(root, 'apps', 'cli', 'dist')
  await mkdir(join(dist, 'web', 'worker'), { recursive: true })
  await mkdir(join(dist, 'drizzle', 'worker', 'meta'), { recursive: true })
  await mkdir(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'web', 'workbench'), { recursive: true })
  await mkdir(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'workspace'), { recursive: true })
  await mkdir(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'skills'), { recursive: true })
  await mkdir(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'codex'), { recursive: true })
  await mkdir(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'claude-code'), { recursive: true })
  await writeFile(join(dist, 'package.json'), '{"version":"0.19.3"}\n')
  await writeFile(join(dist, 'web', 'worker', 'index.html'), '<!doctype html>\n')
  await writeFile(join(dist, 'drizzle', 'worker', '0000_fixture.sql'), '-- migration\n')
  await writeFile(join(dist, 'drizzle', 'worker', 'meta', '_journal.json'), '{"entries":[{"tag":"0000_fixture"}]}\n')
  await writeFile(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'web', 'workbench', 'index.html'), '<!doctype html>\n')
  await writeFile(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'codex', 'config.toml'), '# codex\n')
  await writeFile(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'claude-code', '.mcp.json'), '{}\n')
  await writeFile(join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'soul.descriptor.json'), fixtureDescriptorText())
  await writeFile(join(dist, 'README.md'), '# AIWorker\n')
}

function fixtureDescriptorText(): string {
  return `${JSON.stringify({
    api: null,
    capabilities: [
      {
        id: 'default',
        name: 'Freeform Session',
        prompt: {
          ref: 'dist/product/capabilities/default/prompt.md',
          type: 'packaged-file',
        },
      },
    ],
    compatibility: { engines: ['codex'], host: '>=1.0.0', sdk: '>=1.0.0' },
    configuration: {},
    engine: {
      mcp: {
        targets: {
          'claude-code': { file: 'dist/engine-assets/mcp/claude-code/.mcp.json' },
          codex: { file: 'dist/engine-assets/mcp/codex/config.toml' },
        },
      },
      skills: { source: 'dist/engine-assets/skills' },
      workspaceAssets: { source: 'dist/engine-assets/workspace' },
    },
    extensions: {},
    external: {},
    health: { ready: true, type: 'static' },
    identity: { appId: 'aiworker-freeform', name: 'AIWorker Freeform', soulId: 'freeform', version: '0.1.0' },
    protocol: 'soul/v1',
    workbench: { entry: 'dist/web/workbench/index.html', mode: 'sdk-common', router: { mode: 'search' }, type: 'micro-app' },
  })}\n`
}

function currentTestTarget(): string {
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : null
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null
  if (!platform || !arch)
    throw new Error(`unsupported test target: ${process.platform}-${process.arch}`)
  return `${platform}-${arch}`
}
