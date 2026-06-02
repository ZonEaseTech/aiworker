import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
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
    await expect(stat(path.join(bundleRoot, 'drizzle', 'worker', '0000_fixture.sql'))).resolves.toBeTruthy()
    await expect(stat(path.join(bundleRoot, 'drizzle', 'worker', 'meta', '_journal.json'))).resolves.toBeTruthy()
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
    ).rejects.toThrow('missing release resource: apps/worker-cli/dist/drizzle/worker/meta/_journal.json')
  })

  it('rejects standalone bundles when packaged migrations are missing journal SQL files', async () => {
    await writeFixtureDist(root, { includeJournalMigrationSql: false })
    await writeFile(path.join(root, 'aiworker-darwin-arm64'), '#!/bin/sh\necho aiworker\n')
    await chmod(path.join(root, 'aiworker-darwin-arm64'), 0o755)

    await expect(
      packageReleaseBundles({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('missing release resource: apps/worker-cli/dist/drizzle/worker/0000_fixture.sql')
    await expect(stat(path.join(root, 'release', 'aiworker-darwin-arm64'))).rejects.toThrow()
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
    ).rejects.toThrow('invalid release resource: apps/worker-cli/dist/official-apps/aiworker-freeform/dist/soul.descriptor.json is not descriptor v1')
    await expect(stat(path.join(root, 'release', 'aiworker-darwin-arm64'))).rejects.toThrow()
  })

  it('rejects standalone bundles before staging when the packaged Freeform descriptor has the wrong app id', async () => {
    await writeFixtureDist(root, { descriptorText: fixtureDescriptorText({ appId: 'wrong-freeform' }) })
    await writeFile(path.join(root, 'aiworker-darwin-arm64'), '#!/bin/sh\necho aiworker\n')
    await chmod(path.join(root, 'aiworker-darwin-arm64'), 0o755)

    await expect(
      packageReleaseBundles({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('invalid release resource: apps/worker-cli/dist/official-apps/aiworker-freeform/dist/soul.descriptor.json is not the official Freeform descriptor')
    await expect(stat(path.join(root, 'release', 'aiworker-darwin-arm64'))).rejects.toThrow()
  })


  it('rejects standalone bundles before staging when the packaged Freeform descriptor drops the Claude Code MCP target', async () => {
    await writeFixtureDist(root, { descriptorText: fixtureDescriptorText({ mcpTargets: ['codex'] }) })
    await writeFile(path.join(root, 'aiworker-darwin-arm64'), '#!/bin/sh\necho aiworker\n')
    await chmod(path.join(root, 'aiworker-darwin-arm64'), 0o755)

    await expect(
      packageReleaseBundles({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('invalid release resource: apps/worker-cli/dist/official-apps/aiworker-freeform/dist/soul.descriptor.json is not the official Freeform descriptor')
    await expect(stat(path.join(root, 'release', 'aiworker-darwin-arm64'))).rejects.toThrow()
  })

  it('rejects standalone bundles before staging when descriptor-declared workbench assets are missing', async () => {
    await writeFixtureDist(root, { includeWorkbenchEntry: false })
    await writeFile(path.join(root, 'aiworker-darwin-arm64'), '#!/bin/sh\necho aiworker\n')
    await chmod(path.join(root, 'aiworker-darwin-arm64'), 0o755)

    await expect(
      packageReleaseBundles({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('missing release resource: apps/worker-cli/dist/official-apps/aiworker-freeform/dist/web/workbench/index.html')
    await expect(stat(path.join(root, 'release', 'aiworker-darwin-arm64'))).rejects.toThrow()
  })

  it('rejects standalone bundles before staging when descriptor-declared MCP assets are missing', async () => {
    await writeFixtureDist(root, { includeCodexMcpFile: false })
    await writeFile(path.join(root, 'aiworker-darwin-arm64'), '#!/bin/sh\necho aiworker\n')
    await chmod(path.join(root, 'aiworker-darwin-arm64'), 0o755)

    await expect(
      packageReleaseBundles({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('missing release resource: apps/worker-cli/dist/official-apps/aiworker-freeform/dist/engine-assets/mcp/codex/config.toml')
    await expect(stat(path.join(root, 'release', 'aiworker-darwin-arm64'))).rejects.toThrow()
  })

  it('rejects standalone bundles before staging when descriptor references resolve outside the official app root', async () => {
    await writeFixtureDist(root)
    const workbenchEntry = path.join(root, 'apps', 'worker-cli', 'dist', 'official-apps', 'aiworker-freeform', 'dist', 'web', 'workbench', 'index.html')
    const escapedWorkbench = path.join(root, 'apps', 'worker-cli', 'dist', 'official-apps', 'escaped-workbench.html')
    await writeFile(escapedWorkbench, '<!doctype html>\n')
    await rm(workbenchEntry)
    await symlink(escapedWorkbench, workbenchEntry)
    await writeFile(path.join(root, 'aiworker-darwin-arm64'), '#!/bin/sh\necho aiworker\n')
    await chmod(path.join(root, 'aiworker-darwin-arm64'), 0o755)

    await expect(
      packageReleaseBundles({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('invalid release resource: apps/worker-cli/dist/official-apps/aiworker-freeform/dist/soul.descriptor.json descriptor reference escapes official app root: dist/web/workbench/index.html')
    await expect(stat(path.join(root, 'release', 'aiworker-darwin-arm64'))).rejects.toThrow()
  })
})

async function writeFixtureDist(
  root: string,
  options: {
    descriptorText?: string
    includeCodexMcpFile?: boolean
    includeJournalMigrationSql?: boolean
    includeMigrationJournal?: boolean
    includeWorkbenchEntry?: boolean
  } = {},
): Promise<void> {
  const includeCodexMcpFile = options.includeCodexMcpFile ?? true
  const includeJournalMigrationSql = options.includeJournalMigrationSql ?? true
  const includeMigrationJournal = options.includeMigrationJournal ?? true
  const includeWorkbenchEntry = options.includeWorkbenchEntry ?? true
  const dist = path.join(root, 'apps', 'worker-cli', 'dist')
  await mkdir(path.join(dist, 'web', 'worker'), { recursive: true })
  await mkdir(path.join(dist, 'drizzle', 'worker', 'meta'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'web', 'workbench'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'workspace'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'skills'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'codex'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'claude-code'), { recursive: true })
  await writeFile(path.join(dist, 'web', 'worker', 'index.html'), '<!doctype html>\n')
  if (includeJournalMigrationSql)
    await writeFile(path.join(dist, 'drizzle', 'worker', '0000_fixture.sql'), '-- migration\n')
  if (includeMigrationJournal)
    await writeFile(path.join(dist, 'drizzle', 'worker', 'meta', '_journal.json'), '{"entries":[{"tag":"0000_fixture"}]}\n')
  if (includeWorkbenchEntry)
    await writeFile(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'web', 'workbench', 'index.html'), '<!doctype html>\n')
  if (includeCodexMcpFile)
    await writeFile(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'codex', 'config.toml'), '# codex\n')
  await writeFile(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'claude-code', '.mcp.json'), '{}\n')
  await writeFile(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'soul.descriptor.json'), options.descriptorText ?? fixtureDescriptorText())
  await writeFile(path.join(dist, 'README.md'), '# AIWorker\n')
}

function fixtureDescriptorText(options: {
  appId?: string
  mcpTargets?: Array<'claude-code' | 'codex'>
} = {}): string {
  const mcpTargets = options.mcpTargets ?? ['claude-code', 'codex']
  return `${JSON.stringify({
    protocol: 'soul/v1',
    identity: {
      appId: options.appId ?? 'aiworker-freeform',
      name: 'AIWorker Freeform',
      soulId: 'freeform',
      version: '0.1.0',
    },
    compatibility: {
      engines: ['codex'],
      host: '>=1.0.0',
      sdk: '>=1.0.0',
    },
    configuration: {},
    workbench: {
      entry: 'dist/web/workbench/index.html',
      mode: 'sdk-common',
      router: {
        mode: 'search',
      },
      type: 'micro-app',
    },
    api: null,
    engine: {
      mcp: {
        targets: Object.fromEntries(mcpTargets.map(target => [
          target,
          {
            file: target === 'claude-code'
              ? 'dist/engine-assets/mcp/claude-code/.mcp.json'
              : 'dist/engine-assets/mcp/codex/config.toml',
          },
        ])),
      },
      skills: {
        source: 'dist/engine-assets/skills',
      },
      workspaceAssets: {
        source: 'dist/engine-assets/workspace',
      },
    },
    health: {
      ready: true,
      type: 'static',
    },
    extensions: {},
    external: {},
  })}\n`
}
