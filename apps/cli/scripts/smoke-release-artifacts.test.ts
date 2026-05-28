import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { packageReleaseBundles } from './package-release-bundles'
import { verifyReleaseArtifacts } from './smoke-release-artifacts'

describe('release artifact smoke', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'aiworker-release-artifacts-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('accepts packaged release tarballs only when attach artifacts include checksums and required resources', async () => {
    await writeFixtureDist(root)
    await writeFile(path.join(root, 'aiworker-darwin-arm64'), '#!/bin/sh\necho aiworker\n')
    await chmod(path.join(root, 'aiworker-darwin-arm64'), 0o755)
    await packageReleaseBundles({ rootDir: root, targets: ['darwin-arm64'] })

    await expect(verifyReleaseArtifacts({ rootDir: root, targets: ['darwin-arm64'] })).resolves.toBeUndefined()

    await writeFile(path.join(root, 'aiworker-darwin-arm64.tar.gz.sha256'), 'bad  aiworker-darwin-arm64.tar.gz\n')
    await expect(
      verifyReleaseArtifacts({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('release checksum mismatch for aiworker-darwin-arm64.tar.gz')
  })

  it('is wired into the tag release workflow before GitHub Release attach', async () => {
    const workflow = await readFile(path.join(import.meta.dirname, '..', '..', '..', '.github', 'workflows', 'release.yml'), 'utf8')
    const packageIndex = workflow.indexOf('bun apps/cli/scripts/package-release-bundles.ts')
    const smokeIndex = workflow.indexOf('bun apps/cli/scripts/smoke-release-artifacts.ts')
    const attachIndex = workflow.indexOf('softprops/action-gh-release')

    expect(packageIndex).toBeGreaterThanOrEqual(0)
    expect(smokeIndex).toBeGreaterThan(packageIndex)
    expect(smokeIndex).toBeLessThan(attachIndex)
  })
})

async function writeFixtureDist(root: string): Promise<void> {
  const dist = path.join(root, 'apps', 'cli', 'dist')
  await mkdir(path.join(dist, 'web', 'worker'), { recursive: true })
  await mkdir(path.join(dist, 'drizzle', 'worker', 'meta'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'web', 'workbench'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'workspace'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'skills'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'codex'), { recursive: true })
  await writeFile(path.join(dist, 'web', 'worker', 'index.html'), '<!doctype html>\n')
  await writeFile(path.join(dist, 'drizzle', 'worker', 'meta', '_journal.json'), '{"entries":[]}\n')
  await writeFile(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'web', 'workbench', 'index.html'), '<!doctype html>\n')
  await writeFile(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'codex', 'config.toml'), '# codex\n')
  await writeFile(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'soul.descriptor.json'), `${JSON.stringify({
    api: null,
    capabilities: [],
    compatibility: { engines: ['codex'], host: '>=1.0.0', sdk: '>=1.0.0' },
    configuration: {},
    engine: {
      mcp: { targets: { codex: { file: 'dist/engine-assets/mcp/codex/config.toml' } } },
      skills: { source: 'dist/engine-assets/skills' },
      workspaceAssets: { source: 'dist/engine-assets/workspace' },
    },
    extensions: {},
    external: {},
    health: { ready: true, type: 'static' },
    identity: { appId: 'aiworker-freeform', name: 'AIWorker Freeform', soulId: 'freeform', version: '0.1.0' },
    protocol: 'soul/v1',
    workbench: { entry: 'dist/web/workbench/index.html', mode: 'sdk-common', router: { mode: 'search' }, type: 'micro-app' },
  })}\n`)
  await writeFile(path.join(dist, 'README.md'), '# AIWorker\n')
}
