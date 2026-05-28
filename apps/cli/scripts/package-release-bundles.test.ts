import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { packageReleaseBundles } from './package-release-bundles'

describe('release bundle packager', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'aiworker-release-bundle-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('packages standalone bundles with official descriptor Soul Apps', async () => {
    await writeFixtureDist(root)
    await writeFile(path.join(root, 'aiworker-darwin-arm64'), '#!/bin/sh\necho aiworker\n')
    await chmod(path.join(root, 'aiworker-darwin-arm64'), 0o755)

    await packageReleaseBundles({ rootDir: root, targets: ['darwin-arm64'] })

    const bundleRoot = path.join(root, 'release', 'aiworker-darwin-arm64')
    await expect(stat(path.join(bundleRoot, 'aiworker'))).resolves.toBeTruthy()
    await expect(stat(path.join(bundleRoot, 'web', 'worker', 'index.html'))).resolves.toBeTruthy()
    await expect(stat(path.join(bundleRoot, 'drizzle', 'worker', 'migration.sql'))).resolves.toBeTruthy()
    await expect(stat(path.join(bundleRoot, 'official-apps', 'aiworker-freeform', 'dist', 'soul.descriptor.json'))).resolves.toBeTruthy()
    await expect(stat(path.join(bundleRoot, 'README.md'))).resolves.toBeTruthy()
    await expect(stat(path.join(root, 'aiworker-darwin-arm64.tar.gz'))).resolves.toBeTruthy()

    const checksum = await readFile(path.join(root, 'aiworker-darwin-arm64.tar.gz.sha256'), 'utf8')
    expect(checksum).toContain('aiworker-darwin-arm64.tar.gz')
    expect(checksum.trim().split(/\s+/)[0]).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects standalone bundles when packaged migrations are missing Drizzle metadata', async () => {
    await writeFixtureDist(root, { includeMigrationJournal: false })
    await writeFile(path.join(root, 'aiworker-darwin-arm64'), '#!/bin/sh\necho aiworker\n')
    await chmod(path.join(root, 'aiworker-darwin-arm64'), 0o755)

    await expect(
      packageReleaseBundles({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('missing release resource: apps/cli/dist/drizzle/worker/meta/_journal.json')
  })

  it('rejects standalone bundles before staging when the compiled target binary is missing', async () => {
    await writeFixtureDist(root)

    await expect(
      packageReleaseBundles({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('missing release binary: aiworker-darwin-arm64')
    await expect(stat(path.join(root, 'release', 'aiworker-darwin-arm64'))).rejects.toThrow()
  })

  it('rejects standalone bundles before staging when the packaged Freeform descriptor is not v1', async () => {
    await writeFixtureDist(root, { descriptorText: '{"protocol":"legacy-manifest"}\n' })
    await writeFile(path.join(root, 'aiworker-darwin-arm64'), '#!/bin/sh\necho aiworker\n')
    await chmod(path.join(root, 'aiworker-darwin-arm64'), 0o755)

    await expect(
      packageReleaseBundles({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('invalid release resource: apps/cli/dist/official-apps/aiworker-freeform/dist/soul.descriptor.json is not descriptor v1')
    await expect(stat(path.join(root, 'release', 'aiworker-darwin-arm64'))).rejects.toThrow()
  })
})

async function writeFixtureDist(root: string, options: { descriptorText?: string, includeMigrationJournal?: boolean } = {}): Promise<void> {
  const includeMigrationJournal = options.includeMigrationJournal ?? true
  const dist = path.join(root, 'apps', 'cli', 'dist')
  await mkdir(path.join(dist, 'web', 'worker'), { recursive: true })
  await mkdir(path.join(dist, 'drizzle', 'worker', 'meta'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist'), { recursive: true })
  await writeFile(path.join(dist, 'web', 'worker', 'index.html'), '<!doctype html>\n')
  await writeFile(path.join(dist, 'drizzle', 'worker', 'migration.sql'), '-- migration\n')
  if (includeMigrationJournal)
    await writeFile(path.join(dist, 'drizzle', 'worker', 'meta', '_journal.json'), '{"entries":[]}\n')
  await writeFile(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'soul.descriptor.json'), options.descriptorText ?? '{"protocol":"soul/v1"}\n')
  await writeFile(path.join(dist, 'README.md'), '# AIWorker\n')
}
