import { createHash } from 'node:crypto'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { spawn } from 'bun'
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
    await writeFile(path.join(root, 'aiworker-darwin-arm64'), '#!/bin/sh\necho aiworker/0.19.3 darwin-arm64 node-v24.3.0\n')
    await chmod(path.join(root, 'aiworker-darwin-arm64'), 0o755)
    await packageReleaseBundles({ rootDir: root, targets: ['darwin-arm64'] })

    await expect(verifyReleaseArtifacts({ rootDir: root, targets: ['darwin-arm64'] })).resolves.toBeUndefined()

    await writeFile(path.join(root, 'aiworker-darwin-arm64.tar.gz.sha256'), 'bad  aiworker-darwin-arm64.tar.gz\n')
    await expect(
      verifyReleaseArtifacts({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('release checksum mismatch for aiworker-darwin-arm64.tar.gz')
  })

  it('rejects attach artifacts when descriptor-declared resources are missing from the tarball', async () => {
    await writeMalformedReleaseArtifact(root, 'darwin-arm64')

    await expect(
      verifyReleaseArtifacts({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('release artifact aiworker-darwin-arm64.tar.gz descriptor references missing file: aiworker-darwin-arm64/official-apps/aiworker-freeform/dist/web/workbench/index.html')
  })

  it('rejects attach artifacts when required journal migration SQL files are missing from the tarball', async () => {
    await writeReleaseArtifactWithoutJournalMigrationSql(root, 'darwin-arm64')

    await expect(
      verifyReleaseArtifacts({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('release artifact aiworker-darwin-arm64.tar.gz is missing aiworker-darwin-arm64/drizzle/worker/0000_fixture.sql')
  })

  it('rejects attach artifacts when the packaged Freeform descriptor drops the default capability', async () => {
    await writeFixtureReleaseArtifact(root, 'darwin-arm64', {
      descriptorText: fixtureDescriptorText({ capabilities: [] }),
    })

    await expect(
      verifyReleaseArtifacts({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('release artifact aiworker-darwin-arm64.tar.gz must include the official Freeform descriptor')
  })

  it('rejects attach artifacts when the packaged Freeform descriptor drops the Claude Code MCP target', async () => {
    await writeFixtureReleaseArtifact(root, 'darwin-arm64', {
      descriptorText: fixtureDescriptorText({ mcpTargets: ['codex'] }),
    })

    await expect(
      verifyReleaseArtifacts({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('release artifact aiworker-darwin-arm64.tar.gz must include the official Freeform descriptor')
  })

  it('rejects attach artifacts when the tarball binary is not executable', async () => {
    await writeFixtureReleaseArtifact(root, 'darwin-arm64', { binaryMode: 0o644 })

    await expect(
      verifyReleaseArtifacts({ rootDir: root, targets: ['darwin-arm64'] }),
    ).rejects.toThrow('release artifact aiworker-darwin-arm64.tar.gz binary is not executable: aiworker-darwin-arm64/aiworker')
  })

  it('rejects the current-platform attach artifact when its binary does not boot', async () => {
    const target = currentTestTarget()
    await writeFixtureReleaseArtifact(root, target, {
      binaryText: '#!/bin/sh\nexit 9\n',
    })

    await expect(
      verifyReleaseArtifacts({ rootDir: root, targets: [target] }),
    ).rejects.toThrow(`release artifact aiworker-${target}.tar.gz binary smoke failed: aiworker-${target}/aiworker --version exited 9`)
  })

  it('rejects the current-platform attach artifact when its version output does not match the dist package', async () => {
    const target = currentTestTarget()
    await writeFixtureReleaseArtifact(root, target, {
      binaryText: '#!/bin/sh\necho 9.9.9-wrong\n',
    })

    await expect(
      verifyReleaseArtifacts({ rootDir: root, targets: [target] }),
    ).rejects.toThrow(`release artifact aiworker-${target}.tar.gz binary smoke failed: aiworker-${target}/aiworker --version did not report 0.19.3`)
  })

  it('is wired into the tag release workflow before GitHub Release attach', async () => {
    const workflow = await readFile(path.join(import.meta.dirname, '..', '..', '..', '.github', 'workflows', 'release.yml'), 'utf8')
    const packageIndex = workflow.indexOf('bun apps/worker-cli/scripts/package-release-bundles.ts')
    const smokeIndex = workflow.indexOf('bun apps/worker-cli/scripts/smoke-release-artifacts.ts')
    const publishIndex = workflow.indexOf('npm publish --provenance --access public')
    const attachIndex = workflow.indexOf('softprops/action-gh-release')

    expect(packageIndex).toBeGreaterThanOrEqual(0)
    expect(smokeIndex).toBeGreaterThan(packageIndex)
    expect(publishIndex).toBeGreaterThan(smokeIndex)
    expect(publishIndex).toBeLessThan(attachIndex)
  })
})

async function writeFixtureDist(root: string, options: { descriptorText?: string } = {}): Promise<void> {
  const dist = path.join(root, 'apps', 'worker-cli', 'dist')
  await mkdir(path.join(dist, 'web', 'worker'), { recursive: true })
  await mkdir(path.join(dist, 'drizzle', 'worker', 'meta'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'web', 'workbench'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'workspace'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'skills'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'codex'), { recursive: true })
  await mkdir(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'claude-code'), { recursive: true })
  await writeFile(path.join(dist, 'package.json'), '{"version":"0.19.3"}\n')
  await writeFile(path.join(dist, 'web', 'worker', 'index.html'), '<!doctype html>\n')
  await writeFile(path.join(dist, 'drizzle', 'worker', '0000_fixture.sql'), '-- migration\n')
  await writeFile(path.join(dist, 'drizzle', 'worker', 'meta', '_journal.json'), '{"entries":[{"tag":"0000_fixture"}]}\n')
  await writeFile(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'web', 'workbench', 'index.html'), '<!doctype html>\n')
  await writeFile(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'codex', 'config.toml'), '# codex\n')
  await writeFile(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'engine-assets', 'mcp', 'claude-code', '.mcp.json'), '{}\n')
  await writeFile(path.join(dist, 'official-apps', 'aiworker-freeform', 'dist', 'soul.descriptor.json'), options.descriptorText ?? fixtureDescriptorText())
  await writeFile(path.join(dist, 'README.md'), '# AIWorker\n')
}

async function writeMalformedReleaseArtifact(root: string, target: string): Promise<void> {
  const bundle = `aiworker-${target}`
  const bundleRoot = path.join(root, bundle)
  await writeFixturePackageMetadata(root)
  await mkdir(path.join(bundleRoot, 'web', 'worker'), { recursive: true })
  await mkdir(path.join(bundleRoot, 'drizzle', 'worker', 'meta'), { recursive: true })
  await mkdir(path.join(bundleRoot, 'official-apps', 'aiworker-freeform', 'dist'), { recursive: true })
  await writeFile(path.join(bundleRoot, 'aiworker'), '#!/bin/sh\necho aiworker\n')
  await chmod(path.join(bundleRoot, 'aiworker'), 0o755)
  await writeFile(path.join(bundleRoot, 'web', 'worker', 'index.html'), '<!doctype html>\n')
  await writeFile(path.join(bundleRoot, 'drizzle', 'worker', '0000_fixture.sql'), '-- migration\n')
  await writeFile(path.join(bundleRoot, 'drizzle', 'worker', 'meta', '_journal.json'), '{"entries":[{"tag":"0000_fixture"}]}\n')
  await writeFile(path.join(bundleRoot, 'official-apps', 'aiworker-freeform', 'dist', 'soul.descriptor.json'), fixtureDescriptorText())
  await writeFile(path.join(bundleRoot, 'README.md'), '# AIWorker\n')
  await run(['tar', '-C', root, '-czf', path.join(root, `${bundle}.tar.gz`), bundle])
  const archive = await readFile(path.join(root, `${bundle}.tar.gz`))
  const checksum = createHash('sha256').update(archive).digest('hex')
  await writeFile(path.join(root, `${bundle}.tar.gz.sha256`), `${checksum}  ${bundle}.tar.gz\n`)
}

async function writeFixturePackageMetadata(root: string): Promise<void> {
  const dist = path.join(root, 'apps', 'worker-cli', 'dist')
  await mkdir(dist, { recursive: true })
  await writeFile(path.join(dist, 'package.json'), '{"version":"0.19.3"}\n')
}

async function writeReleaseArtifactWithoutJournalMigrationSql(root: string, target: string): Promise<void> {
  await writeFixtureDist(root)
  const bundle = `aiworker-${target}`
  const bundleRoot = path.join(root, bundle)
  await mkdir(bundleRoot, { recursive: true })
  await writeFile(path.join(bundleRoot, 'aiworker'), '#!/bin/sh\necho 0.0.0-test\n')
  await chmod(path.join(bundleRoot, 'aiworker'), 0o755)
  await cp(path.join(root, 'apps', 'worker-cli', 'dist', 'web'), path.join(bundleRoot, 'web'), { recursive: true })
  await mkdir(path.join(bundleRoot, 'drizzle', 'worker', 'meta'), { recursive: true })
  await cp(path.join(root, 'apps', 'worker-cli', 'dist', 'drizzle', 'worker', 'meta'), path.join(bundleRoot, 'drizzle', 'worker', 'meta'), { recursive: true })
  await cp(path.join(root, 'apps', 'worker-cli', 'dist', 'official-apps'), path.join(bundleRoot, 'official-apps'), { recursive: true })
  await cp(path.join(root, 'apps', 'worker-cli', 'dist', 'README.md'), path.join(bundleRoot, 'README.md'))
  await run(['tar', '-C', root, '-czf', path.join(root, `${bundle}.tar.gz`), bundle])
  const archive = await readFile(path.join(root, `${bundle}.tar.gz`))
  const checksum = createHash('sha256').update(archive).digest('hex')
  await writeFile(path.join(root, `${bundle}.tar.gz.sha256`), `${checksum}  ${bundle}.tar.gz\n`)
}

async function writeFixtureReleaseArtifact(
  root: string,
  target: string,
  options: { binaryMode?: number, binaryText?: string, descriptorText?: string } = {},
): Promise<void> {
  await writeFixtureDist(root, options.descriptorText ? { descriptorText: options.descriptorText } : {})
  const bundle = `aiworker-${target}`
  const bundleRoot = path.join(root, bundle)
  await mkdir(bundleRoot, { recursive: true })
  await writeFile(path.join(bundleRoot, 'aiworker'), options.binaryText ?? '#!/bin/sh\necho 0.0.0-test\n')
  await chmod(path.join(bundleRoot, 'aiworker'), options.binaryMode ?? 0o755)
  await cp(path.join(root, 'apps', 'worker-cli', 'dist', 'web'), path.join(bundleRoot, 'web'), { recursive: true })
  await cp(path.join(root, 'apps', 'worker-cli', 'dist', 'drizzle'), path.join(bundleRoot, 'drizzle'), { recursive: true })
  await cp(path.join(root, 'apps', 'worker-cli', 'dist', 'official-apps'), path.join(bundleRoot, 'official-apps'), { recursive: true })
  await cp(path.join(root, 'apps', 'worker-cli', 'dist', 'README.md'), path.join(bundleRoot, 'README.md'))
  await run(['tar', '-C', root, '-czf', path.join(root, `${bundle}.tar.gz`), bundle])
  const archive = await readFile(path.join(root, `${bundle}.tar.gz`))
  const checksum = createHash('sha256').update(archive).digest('hex')
  await writeFile(path.join(root, `${bundle}.tar.gz.sha256`), `${checksum}  ${bundle}.tar.gz\n`)
}

function fixtureDescriptorText(options: {
  capabilities?: unknown[]
  engine?: Record<string, unknown>
  mcpTargets?: Array<'claude-code' | 'codex'>
} = {}): string {
  const mcpTargets = options.mcpTargets ?? ['claude-code', 'codex']
  return `${JSON.stringify({
    api: null,
    capabilities: options.capabilities ?? [
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
    engine: options.engine ?? {
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

async function run(command: string[]): Promise<void> {
  const proc = spawn(command, { stderr: 'pipe', stdout: 'ignore' })
  const [stderr, code] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0)
    throw new Error(`${command.join(' ')} failed: ${stderr}`)
}
