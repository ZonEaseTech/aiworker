import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdirSync, realpathSync, renameSync } from 'node:fs'
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { hrSoulAppManifest, namespaceSoulAppCapabilityId } from '@zonease/aiworker-shared'
import {
  closeWorkerDb,
  createSession,
  createWorkspace,
  initWorkerDb,
  runWorkerMigrations,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  downloadAndReplaceGitHubBundle,
  preprocessArgv,
  resolveCliDefaultHomeDir,
  resolveCliLocalPaths,
  resolveCliOfficialAppsRoot,
  resolveCliWorkerWebStaticDir,
  runCli,
} from './aiworker'

describe('aiworker local CLI', () => {
  const originalEnv = { ...process.env }
  const originalFetch = globalThis.fetch
  const originalWrite = process.stdout.write
  let root: string
  let output = ''

  beforeEach(async () => {
    closeWorkerDb()
    output = ''
    root = await mkdtemp(path.join(tmpdir(), 'aiworker-cli-'))
    process.env.AIWORKER_HOME = path.join(root, 'home')
    process.env.WORKER_DB_PATH = path.join(root, 'home', 'aiworker.db')
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as typeof process.stdout.write
  })

  afterEach(async () => {
    closeWorkerDb()
    process.exitCode = 0
    for (const key of Object.keys(process.env))
      delete process.env[key]
    Object.assign(process.env, originalEnv)
    globalThis.fetch = originalFetch
    process.stdout.write = originalWrite
    await rm(root, { recursive: true, force: true })
  })

  function argv(...args: string[]): string[] {
    return ['/usr/bin/bun', '/repo/apps/cli/src/aiworker.ts', ...args]
  }

  function seedLegacyHrMetadata() {
    closeWorkerDb()
    mkdirSync(path.dirname(process.env.WORKER_DB_PATH!), { recursive: true })
    initWorkerDb(process.env.WORKER_DB_PATH!)
    runWorkerMigrations()
    upsertWorker({
      id: 'legacy-hr-worker',
      soulId: 'hr',
      name: 'Legacy HR',
      defaultEngineId: 'codex',
      at: '2026-05-13T13:04:00.000Z',
    })
    createWorkspace({
      id: 'legacy-hr-workspace',
      workerId: 'legacy-hr-worker',
      name: 'Legacy HR workspace',
      rootPath: path.join(root, 'home', 'workers', 'legacy-hr-worker', 'workspaces', 'legacy-hr-workspace'),
      at: '2026-05-13T13:04:01.000Z',
    })
    createSession({
      id: 'legacy-hr-session',
      workerId: 'legacy-hr-worker',
      workspaceId: 'legacy-hr-workspace',
      capabilityTemplateId: 'candidate-screen',
      title: 'Legacy candidate screen',
      metadataJson: { capabilityTemplateId: 'candidate-screen', soulName: 'HR' },
      at: '2026-05-13T13:04:02.000Z',
    })
    closeWorkerDb()
  }

  async function writeFakeBundle(bundleDir: string, marker: string): Promise<void> {
    mkdirSync(path.join(bundleDir, 'web', 'worker'), { recursive: true })
    mkdirSync(path.join(bundleDir, 'drizzle'), { recursive: true })
    await writeFile(path.join(bundleDir, 'aiworker'), [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then',
      `  echo "aiworker ${marker}"`,
      '  exit 0',
      'fi',
      `echo "${marker}"`,
      '',
    ].join('\n'))
    await chmod(path.join(bundleDir, 'aiworker'), 0o755)
    await writeFile(path.join(bundleDir, 'web', 'worker', 'index.html'), `<html>${marker}</html>\n`)
    await writeFile(path.join(bundleDir, 'drizzle', 'migration.sql'), `-- ${marker}\n`)
    await writeFile(path.join(bundleDir, 'README.md'), `${marker} readme\n`)
  }

  async function createTarGz(bundleDir: string): Promise<Buffer> {
    const archivePath = path.join(root, `${path.basename(bundleDir)}.tar.gz`)
    const tar = Bun.spawnSync(['tar', '-C', path.dirname(bundleDir), '-czf', archivePath, path.basename(bundleDir)])
    expect(tar.exitCode).toBe(0)
    return await readFile(archivePath)
  }

  function mockReleaseFetch(archiveBytes: Buffer, checksum = createHash('sha256').update(archiveBytes).digest('hex')) {
    return (async (url: string | URL | Request) => {
      const value = String(url)
      if (value.endsWith('.sha256'))
        return new Response(`${checksum}  aiworker.tar.gz\n`)
      return new Response(new Uint8Array(archiveBytes))
    }) as typeof fetch
  }

  async function writeFakeCodexCommand(): Promise<void> {
    const binDir = path.join(root, 'bin')
    mkdirSync(binDir, { recursive: true })
    const commandPath = path.join(binDir, 'codex')
    await writeFile(commandPath, [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'cat >/dev/null',
      'printf \'%s\\n\' \'{"type":"item.completed","item":{"type":"agent_message","text":"Done."}}\'',
      '',
    ].join('\n'))
    await chmod(commandPath, 0o755)
    process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`
  }

  async function writeFakeCodexArtifactCommand(): Promise<void> {
    const binDir = path.join(root, 'bin')
    mkdirSync(binDir, { recursive: true })
    const commandPath = path.join(binDir, 'codex')
    await writeFile(commandPath, [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'prompt="$(cat)"',
      'artifact_path="$(printf \'%s\\n\' "$prompt" | sed -n \'s/^- Prefer \\(artifacts\\/[^ ]*\\) for a new .*$/\\1/p\' | head -n 1)"',
      'if [ -z "$artifact_path" ]; then artifact_path="artifacts/unknown-session/profile-update-proposal.md"; fi',
      'mkdir -p "$(dirname "$artifact_path")"',
      'artifact_content="$(printenv FAKE_CODEX_ARTIFACT_CONTENT || true)"',
      'if [ -z "$artifact_content" ]; then artifact_content="# Empty Artifact"; fi',
      'printf \'%s\\n\' "$artifact_content" > "$artifact_path"',
      'printf \'%s\\n\' \'{"type":"item.completed","item":{"type":"agent_message","text":"Artifact written."}}\'',
      '',
    ].join('\n'))
    await chmod(commandPath, 0o755)
    process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`
  }

  async function createProfilePromotionArtifact(content: string): Promise<{ artifactId: string, rootPath: string, workspaceId: string }> {
    await writeFakeCodexArtifactCommand()
    process.env.FAKE_CODEX_ARTIFACT_CONTENT = content
    expect(await runCli(argv('app', 'install', path.resolve(import.meta.dir, '..', '..', 'aiworker-hr')))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', 'aiworker-hr'))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'hr-recruiting', '--name', 'HR Recruiting', '--soul', 'aiworker-hr'))).toBe(0)
    output = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'Ada Profile', '--type', 'people-profile', '--worker', 'hr-recruiting'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string, rootPath: string } }).workspace
    output = ''
    expect(await runCli(argv(
      'session',
      'start',
      '--worker',
      'hr-recruiting',
      '--workspace',
      workspace.id,
      '--skill',
      namespaceSoulAppCapabilityId('aiworker-hr', 'profile-update-proposal'),
      '--title',
      'Profile Update Proposal',
      '--context',
      'Synthetic profile promotion CLI test.',
      '--input',
      'Create a profile update proposal.',
    ))).toBe(0)
    const result = JSON.parse(output) as { artifacts: Array<{ id: string }> }
    output = ''
    return { artifactId: result.artifacts[0]!.id, rootPath: workspace.rootPath, workspaceId: workspace.id }
  }

  async function updateScratchEntries(parentDir: string): Promise<string[]> {
    return (await readdir(parentDir)).filter(entry => entry.startsWith('.aiworker-update-') || entry.startsWith('.aiworker-next-'))
  }

  it('preprocesses multi-word local commands', () => {
    expect(preprocessArgv(argv('workspace', 'create', '--name', 'T')).slice(2, 3)).toEqual(['workspace create'])
    expect(preprocessArgv(argv('session', 'start', '--input', 'P')).slice(2, 3)).toEqual(['session start'])
    expect(preprocessArgv(argv('worker', 'create', '--name', 'HR')).slice(2, 3)).toEqual(['worker create'])
  })

  it('resolves package-local official apps before source apps', async () => {
    const moduleDir = path.join(root, 'dist')
    const officialAppsRoot = path.join(moduleDir, 'official-apps')
    mkdirSync(path.join(officialAppsRoot, 'aiworker-hr'), { recursive: true })
    await writeFile(path.join(officialAppsRoot, 'aiworker-hr', 'soul-app.manifest.json'), '{}')

    expect(resolveCliOfficialAppsRoot(moduleDir)).toBe(officialAppsRoot)
  })

  it('resolves package-local Worker Web static before source static', async () => {
    const moduleDir = path.join(root, 'dist')
    const workerWebRoot = path.join(moduleDir, 'web', 'worker')
    mkdirSync(workerWebRoot, { recursive: true })
    await writeFile(path.join(workerWebRoot, 'index.html'), '<!doctype html>')

    expect(resolveCliWorkerWebStaticDir(moduleDir)).toBe(workerWebRoot)
  })

  it('defaults source-checkout local paths to ~/.aiworker-dev when no home env exists', () => {
    delete process.env.AIWORKER_HOME
    delete process.env.WORKER_DB_PATH
    process.env.HOME = root

    const moduleDir = path.join(root, 'repo', 'apps', 'cli', 'src')
    const paths = resolveCliLocalPaths(moduleDir)

    expect(resolveCliDefaultHomeDir(moduleDir)).toBe('.aiworker-dev')
    expect(paths.home).toBe(path.join(root, '.aiworker-dev'))
    expect(paths.dbPath).toBe(path.join(root, '.aiworker-dev', 'aiworker.db'))
    expect(paths.workersRoot).toBe(path.join(root, '.aiworker-dev', 'workers'))
    expect(paths.pidFile).toBe(path.join(root, '.aiworker-dev', 'aiworker-daemon.pid'))
    expect(paths.logFile).toBe(path.join(root, '.aiworker-dev', 'aiworker-daemon.log'))
  })

  it('defaults packaged local paths to ~/.aiworker when package resources exist', () => {
    delete process.env.AIWORKER_HOME
    delete process.env.WORKER_DB_PATH
    process.env.HOME = root

    const moduleDir = path.join(root, 'package', 'dist')
    mkdirSync(path.join(moduleDir, 'official-apps'), { recursive: true })
    const paths = resolveCliLocalPaths(moduleDir)

    expect(resolveCliDefaultHomeDir(moduleDir)).toBe('.aiworker')
    expect(paths.home).toBe(path.join(root, '.aiworker'))
    expect(paths.dbPath).toBe(path.join(root, '.aiworker', 'aiworker.db'))
    expect(paths.workersRoot).toBe(path.join(root, '.aiworker', 'workers'))
  })

  it('keeps explicit home and db path ahead of source defaults', () => {
    process.env.HOME = root
    process.env.AIWORKER_HOME = path.join(root, 'explicit-home')
    process.env.WORKER_DB_PATH = path.join(root, 'explicit-home', 'custom.db')

    const moduleDir = path.join(root, 'repo', 'apps', 'cli', 'src')
    const paths = resolveCliLocalPaths(moduleDir)

    expect(resolveCliDefaultHomeDir(moduleDir)).toBe('.aiworker-dev')
    expect(paths.home).toBe(path.join(root, 'explicit-home'))
    expect(paths.dbPath).toBe(path.join(root, 'explicit-home', 'custom.db'))
    expect(paths.workersRoot).toBe(path.join(root, 'explicit-home', 'workers'))
  })

  it('applies the source default before init reads core env defaults', async () => {
    delete process.env.AIWORKER_HOME
    delete process.env.WORKER_DB_PATH
    process.env.HOME = root

    expect(await runCli(argv('init'))).toBe(0)
    const body = JSON.parse(output) as { dbPath: string, home: string, workersRoot: string }

    expect(body.home).toBe(path.join(root, '.aiworker-dev'))
    expect(body.dbPath).toBe(path.join(root, '.aiworker-dev', 'aiworker.db'))
    expect(body.workersRoot).toBe(path.join(root, '.aiworker-dev', 'workers'))
    await expect(stat(path.join(root, '.aiworker'))).rejects.toThrow()
  })

  it('initializes host-local daemon state without auto-creating Soul workers', async () => {
    expect(await runCli(argv('init'))).toBe(0)
    const body = JSON.parse(output) as { dbPath: string, home: string, workers: Array<{ soulId: string }>, workersRoot: string }

    expect(body.home).toBe(path.join(root, 'home'))
    expect(body.dbPath).toBe(path.join(root, 'home', 'aiworker.db'))
    expect(body.workersRoot).toBe(path.join(root, 'home', 'workers'))
    expect(body.workers).toEqual([])
    await expect(stat(path.join(root, '.aiworker'))).rejects.toThrow()
  })

  it('creates workspace/session command records and lists artifacts with a mocked engine', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'hr-recruiting', '--name', 'HR Recruiting', '--soul', 'aiworker-hr'))).toBe(0)
    expect((JSON.parse(output) as { worker: { id: string, soulId: string } }).worker).toMatchObject({ id: 'hr-recruiting', soulId: 'aiworker-hr' })
    output = ''

    expect(await runCli(argv('worker', 'select', 'hr-recruiting'))).toBe(0)
    expect(output).toContain('selected-worker')
    output = ''

    expect(await runCli(argv('workspace', 'create', '--name', 'Hiring', '--type', 'people-profile', '--worker', 'hr-recruiting'))).toBe(0)
    expect((JSON.parse(output) as { workspace: { id: string, type: string } }).workspace).toMatchObject({ type: 'people-profile' })
    output = ''

    expect(await runCli(argv('commands'))).toBe(0)
    expect(output).toContain('dev')
    expect(output).toContain('app list|show|install|enable|disable|doctor|permissions|bootstrap|create|validate|smoke')
    expect(output).toContain('worker create|list|show|select')
    expect(output).toContain('workspace create|list|show')
    expect(output).toContain('session start|list|show')
    expect(output).not.toContain('run start')
  })

  it('materializes app-authored capability assets for the first session turn', async () => {
    await writeFakeCodexCommand()

    expect(await runCli(argv('app', 'install', path.resolve(import.meta.dir, '..', '..', 'aiworker-hr')))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', 'aiworker-hr'))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'hr-recruiting', '--name', 'HR Recruiting', '--soul', 'aiworker-hr'))).toBe(0)
    output = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'Hiring', '--type', 'role-search', '--worker', 'hr-recruiting'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string, rootPath: string } }).workspace
    output = ''

    expect(await runCli(argv(
      'session',
      'start',
      '--worker',
      'hr-recruiting',
      '--workspace',
      workspace.id,
      '--skill',
      namespaceSoulAppCapabilityId('aiworker-hr', 'evidence-matrix'),
      '--title',
      'Evidence Matrix',
      '--context',
      'Synthetic source notes.',
      '--input',
      'Create the evidence matrix.',
    ))).toBe(0)
    const result = JSON.parse(output) as {
      invocation: { metadataJson: Record<string, unknown> }
      session: { id: string, metadataJson: Record<string, unknown> }
    }

    expect(result.session.metadataJson.capabilityPrompt).toMatchObject({
      content: expect.stringContaining('Use AIWorker HR domain evidence'),
      ref: './product/workflows/evidence-matrix/prompt.md',
    })
    expect(result.invocation.metadataJson.capabilityReviewRubric).toMatchObject({
      content: expect.stringContaining('Evidence Matrix Review Rubric'),
      ref: './product/workflows/evidence-matrix/review.md',
    })
    await expect(readFile(
      path.join(workspace.rootPath, '.aiworker', 'sessions', result.session.id, 'context', 'capability', 'prompt.md'),
      'utf8',
    ))
      .resolves
      .toContain('Use AIWorker HR domain evidence')
    await expect(readFile(
      path.join(workspace.rootPath, '.aiworker', 'sessions', result.session.id, 'context', 'capability', 'review.md'),
      'utf8',
    ))
      .resolves
      .toContain('Evidence Matrix Review Rubric')
  })

  it('promotes a fenced profile draft from the CLI without writing proposal notes to README', async () => {
    const promotion = await createProfilePromotionArtifact([
      '# Profile Update Proposal',
      '',
      'Proposal Notes: approve this draft.',
      '',
      '```aiworker-profile-readme',
      '# Accepted Ada Profile',
      '',
      'Reviewed profile summary.',
      '```',
    ].join('\n'))

    expect(await runCli(argv(
      'profile',
      'promote',
      '--worker',
      'hr-recruiting',
      '--workspace',
      promotion.workspaceId,
      '--artifact',
      promotion.artifactId,
      '--verdict',
      'pass',
      '--finding',
      'Approved by CLI test.',
      '--risk',
      'Open facts stay tracked.',
    ))).toBe(0)
    const body = JSON.parse(output) as { profileRevision: { profilePath: string, review: { verdict: string } }, source: string }
    expect(body.profileRevision.profilePath).toBe('README.md')
    expect(body.profileRevision.review.verdict).toBe('pass')
    expect(body.source).toBe('fenced-draft')
    const readme = await readFile(path.join(promotion.rootPath, 'README.md'), 'utf8')
    expect(readme).toContain('Accepted Ada Profile')
    expect(readme).not.toContain('Proposal Notes')
  })

  it('rejects CLI profile promotion when the artifact is missing a fenced draft', async () => {
    const promotion = await createProfilePromotionArtifact('# Profile Update Proposal\n\nNo accepted draft yet.')

    expect(await runCli(argv(
      'profile',
      'promote',
      '--worker',
      'hr-recruiting',
      '--workspace',
      promotion.workspaceId,
      '--artifact',
      promotion.artifactId,
      '--verdict',
      'pass',
    ))).toBe(1)
  })

  it('rejects CLI profile promotion when the accepted draft has proposal-state language', async () => {
    const promotion = await createProfilePromotionArtifact([
      '```aiworker-profile-readme',
      '# Accepted Ada Profile',
      '',
      '> Accepted People Profile for this HR workspace. Agent outputs remain proposals until review.',
      '',
      '## Review State',
      '',
      'Accepted profile revision ready for HR review.',
      '```',
    ].join('\n'))

    expect(await runCli(argv(
      'profile',
      'promote',
      '--worker',
      'hr-recruiting',
      '--workspace',
      promotion.workspaceId,
      '--artifact',
      promotion.artifactId,
      '--verdict',
      'pass',
    ))).toBe(1)
  })

  it('rejects CLI profile promotion verdicts that cannot approve README writes', async () => {
    const promotion = await createProfilePromotionArtifact([
      '```aiworker-profile-readme',
      '# Accepted Ada Profile',
      '',
      'Reviewed profile summary.',
      '```',
    ].join('\n'))

    expect(await runCli(argv(
      'profile',
      'promote',
      '--worker',
      'hr-recruiting',
      '--workspace',
      promotion.workspaceId,
      '--artifact',
      promotion.artifactId,
      '--verdict',
      'needs_review',
    ))).toBe(1)
    await expect(readFile(path.join(promotion.rootPath, 'README.md'), 'utf8'))
      .resolves
      .toContain('No approved profile revision yet.')
  })

  it('promotes explicit reviewed markdown from the CLI without requiring an artifact fence', async () => {
    const promotion = await createProfilePromotionArtifact('# Profile Update Proposal\n\nNo accepted draft yet.')
    const reviewedPath = path.join(root, 'reviewed-profile.md')
    await writeFile(reviewedPath, '# Accepted Ada Profile\n\nReviewed from explicit file.\n')

    expect(await runCli(argv(
      'profile',
      'promote',
      '--worker',
      'hr-recruiting',
      '--workspace',
      promotion.workspaceId,
      '--artifact',
      promotion.artifactId,
      '--profile-markdown',
      reviewedPath,
      '--verdict',
      'warn',
    ))).toBe(0)
    const body = JSON.parse(output) as { profileRevision: { review: { verdict: string } }, source: string }
    expect(body.profileRevision.review.verdict).toBe('warn')
    expect(body.source).toBe('explicit')
    await expect(readFile(path.join(promotion.rootPath, 'README.md'), 'utf8'))
      .resolves
      .toContain('Reviewed from explicit file.')
  })

  it('lists update and upgrade in the command index', async () => {
    expect(await runCli(argv('commands'))).toBe(0)

    expect(output).toContain('update|upgrade')
  })

  it('checks explicit source-checkout update targets without resolving release metadata', async () => {
    expect(await runCli(argv('update', '--check', '--target', '99.0.0'))).toBe(0)
    const body = JSON.parse(output) as {
      update: {
        mode: string
        source: { kind: string }
        status: string
      }
    }

    expect(body.update).toMatchObject({
      mode: 'check',
      source: { kind: 'source-checkout' },
      status: 'update_available',
    })
  })

  it('rejects source-checkout update apply targets without reporting skipped success', async () => {
    expect(await runCli(argv('update', '--target', '99.0.0'))).toBe(1)
    const body = JSON.parse(output) as {
      result?: { status: string }
      update: {
        mode: string
        source: { kind: string }
        status: string
      }
    }

    expect(body.update).toMatchObject({
      mode: 'apply',
      source: { kind: 'source-checkout' },
      status: 'source_not_supported',
    })
    expect(body.result).toBeUndefined()
  })

  it('replaces the complete GitHub release bundle and keeps the previous bundle as backup', async () => {
    const installParent = path.join(root, 'install')
    const currentBundleDir = path.join(installParent, 'aiworker-darwin-arm64')
    const releaseBundleDir = path.join(root, 'release', 'aiworker-darwin-arm64')
    await writeFakeBundle(currentBundleDir, 'old')
    await writeFakeBundle(releaseBundleDir, 'new')
    const archiveBytes = await createTarGz(releaseBundleDir)
    const realCurrentBundleDir = realpathSync(currentBundleDir)

    const result = await downloadAndReplaceGitHubBundle({
      checksumUrl: 'https://example.test/aiworker.tar.gz.sha256',
      downloadUrl: 'https://example.test/aiworker.tar.gz',
    }, {
      currentPath: path.join(currentBundleDir, 'aiworker'),
      fetch: mockReleaseFetch(archiveBytes),
    })

    expect(result.installedPath).toBe(path.join(realCurrentBundleDir, 'aiworker'))
    expect(await readFile(path.join(currentBundleDir, 'web', 'worker', 'index.html'), 'utf8')).toContain('new')
    expect(await readFile(path.join(currentBundleDir, 'drizzle', 'migration.sql'), 'utf8')).toContain('new')
    expect(await readFile(path.join(currentBundleDir, 'README.md'), 'utf8')).toContain('new')
    expect(await readFile(path.join(result.backupPath, 'web', 'worker', 'index.html'), 'utf8')).toContain('old')
    expect(await readFile(path.join(result.backupPath, 'drizzle', 'migration.sql'), 'utf8')).toContain('old')
    expect(await readFile(path.join(result.backupPath, 'README.md'), 'utf8')).toContain('old')
    expect(await updateScratchEntries(installParent)).toEqual([])
  })

  it('preserves the current bundle and cleans staging paths on checksum mismatch', async () => {
    const installParent = path.join(root, 'install')
    const currentBundleDir = path.join(installParent, 'aiworker-darwin-arm64')
    const releaseBundleDir = path.join(root, 'release', 'aiworker-darwin-arm64')
    await writeFakeBundle(currentBundleDir, 'old')
    await writeFakeBundle(releaseBundleDir, 'new')
    const archiveBytes = await createTarGz(releaseBundleDir)

    await expect(downloadAndReplaceGitHubBundle({
      checksumUrl: 'https://example.test/aiworker.tar.gz.sha256',
      downloadUrl: 'https://example.test/aiworker.tar.gz',
    }, {
      currentPath: path.join(currentBundleDir, 'aiworker'),
      fetch: mockReleaseFetch(archiveBytes, '0'.repeat(64)),
    })).rejects.toThrow('checksum_mismatch')

    expect(await readFile(path.join(currentBundleDir, 'web', 'worker', 'index.html'), 'utf8')).toContain('old')
    expect(await readFile(path.join(currentBundleDir, 'drizzle', 'migration.sql'), 'utf8')).toContain('old')
    expect(await updateScratchEntries(installParent)).toEqual([])
    expect((await readdir(installParent)).some(entry => entry.startsWith('.aiworker-backup-'))).toBe(false)
  })

  it('restores the current bundle when final bundle rename fails after backup rename', async () => {
    const installParent = path.join(root, 'install')
    const currentBundleDir = path.join(installParent, 'aiworker-darwin-arm64')
    const releaseBundleDir = path.join(root, 'release', 'aiworker-darwin-arm64')
    await writeFakeBundle(currentBundleDir, 'old')
    await writeFakeBundle(releaseBundleDir, 'new')
    const archiveBytes = await createTarGz(releaseBundleDir)
    const realCurrentBundleDir = realpathSync(currentBundleDir)

    await expect(downloadAndReplaceGitHubBundle({
      checksumUrl: 'https://example.test/aiworker.tar.gz.sha256',
      downloadUrl: 'https://example.test/aiworker.tar.gz',
    }, {
      currentPath: path.join(currentBundleDir, 'aiworker'),
      fetch: mockReleaseFetch(archiveBytes),
      renameSync: (from, to) => {
        if (path.basename(String(from)).startsWith('.aiworker-next-') && String(to) === realCurrentBundleDir)
          throw new Error('simulated final rename failure')
        renameSync(from, to)
      },
    })).rejects.toThrow('simulated final rename failure')

    expect(await readFile(path.join(currentBundleDir, 'web', 'worker', 'index.html'), 'utf8')).toContain('old')
    expect(await readFile(path.join(currentBundleDir, 'drizzle', 'migration.sql'), 'utf8')).toContain('old')
    expect(await updateScratchEntries(installParent)).toEqual([])
  })

  it('returns fresh doctor update notice error state when daily notice resolution fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch

    expect(await runCli(argv('doctor'))).toBe(0)
    const body = JSON.parse(output) as {
      settings: Array<{ key: string, valueJson: Record<string, unknown> }>
      updateNotice: null | unknown
    }
    const noticeSetting = body.settings.find(setting => setting.key === 'update.notice')

    expect(body.updateNotice).toBeNull()
    expect(noticeSetting?.valueJson.errorMessage).toBe('network down')
  })

  it('prints equivalent check reports for update and upgrade aliases', async () => {
    expect(await runCli(argv('update', '--check', '--target', '99.0.0'))).toBe(0)
    const updateOutput = output
    output = ''

    expect(await runCli(argv('upgrade', '--check', '--target', '99.0.0'))).toBe(0)

    expect(JSON.parse(output)).toEqual(JSON.parse(updateOutput))
  })

  it('bootstraps official apps and rejects legacy built-in Soul ids', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    const body = JSON.parse(output) as {
      bootstrap: {
        results: Array<{ action: string, appId: string }>
        status: string
      }
      catalog: { souls: Array<{ id: string, status: string }> }
    }
    expect(body.bootstrap.status).toBe('pass')
    expect(body.bootstrap.results.map(result => [result.appId, result.action])).toEqual([
      ['aiworker-hr', 'installed_enabled'],
      ['aiworker-qa', 'installed_enabled'],
    ])
    expect(body.catalog.souls).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'aiworker-hr', status: 'available' }),
      expect.objectContaining({ id: 'aiworker-qa', status: 'available' }),
    ]))
    expect(body.catalog.souls.some(soul => soul.id === 'hr')).toBe(false)
    output = ''

    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    expect((JSON.parse(output) as { bootstrap: { results: Array<{ action: string }> } }).bootstrap.results.map(result => result.action)).toEqual(['refreshed', 'refreshed'])
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'legacy-hr', '--name', 'Legacy HR', '--soul', 'hr'))).toBe(1)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'official-hr', '--name', 'Official HR', '--soul', 'aiworker-hr'))).toBe(0)
    expect((JSON.parse(output) as { worker: { soulId: string } }).worker.soulId).toBe('aiworker-hr')
  })

  it('discards legacy HR metadata during official app bootstrap', async () => {
    seedLegacyHrMetadata()

    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    const body = JSON.parse(output) as {
      bootstrap: {
        legacyMetadataDiscard: { workersDeleted: number }
      }
      catalog: { souls: Array<{ id: string }> }
    }
    expect(body.bootstrap.legacyMetadataDiscard).toMatchObject({ workersDeleted: 1 })
    expect(body.catalog.souls.map(soul => soul.id)).toContain('aiworker-hr')
    output = ''

    expect(await runCli(argv('worker', 'show', 'legacy-hr-worker'))).toBe(0)
    expect((JSON.parse(output) as { worker: null }).worker).toBeNull()
  })

  it('installs, enables, lists, and disables local Soul App manifests', async () => {
    const manifestPath = path.join(root, 'aiworker-hr.manifest.json')
    await writeFile(manifestPath, JSON.stringify(hrSoulAppManifest))

    expect(await runCli(argv('app', 'install', manifestPath))).toBe(0)
    expect((JSON.parse(output) as { app: { appId: string, status: string } }).app).toMatchObject({ appId: 'aiworker-hr', status: 'installed' })
    output = ''

    expect(await runCli(argv('app', 'enable', 'aiworker-hr'))).toBe(0)
    expect((JSON.parse(output) as { app: { healthStatus: string, status: string } }).app).toMatchObject({ healthStatus: 'pass', status: 'enabled' })
    output = ''

    expect(await runCli(argv('soul', 'list'))).toBe(0)
    expect((JSON.parse(output) as { souls: Array<{ id: string, status: string }> }).souls).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'aiworker-hr', status: 'available' })]))
    output = ''

    expect(await runCli(argv('template', 'list', '--soul', 'aiworker-hr'))).toBe(0)
    const capabilityId = namespaceSoulAppCapabilityId('aiworker-hr', 'candidate-screen')
    expect((JSON.parse(output) as { templates: Array<{ id: string }> }).templates.map(template => template.id)).toContain(capabilityId)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'mounted-hr', '--name', 'Mounted HR', '--soul', 'aiworker-hr'))).toBe(0)
    expect((JSON.parse(output) as { worker: { metadata: Record<string, unknown>, soulId: string } }).worker.soulId).toBe('aiworker-hr')
    output = ''

    expect(await runCli(argv('app', 'disable', 'aiworker-hr'))).toBe(0)
    expect((JSON.parse(output) as { app: { status: string } }).app.status).toBe('disabled')
    output = ''

    expect(await runCli(argv('template', 'list', '--soul', 'aiworker-hr'))).toBe(0)
    expect((JSON.parse(output) as { templates: unknown[] }).templates).toEqual([])
  })

  it('scaffolds, validates, and smokes a minimal Soul App', async () => {
    const appDir = path.join(root, 'demo-soul-app')

    expect(await runCli(argv('app', 'create', 'demo-soul-app', '--dir', appDir))).toBe(0)
    const scaffold = JSON.parse(output) as { appId: string, files: string[], path: string }
    expect(scaffold).toMatchObject({ appId: 'demo-soul-app', path: appDir })
    expect(scaffold.files).toContain('soul-app.manifest.json')
    expect(scaffold.files).toContain('engine-assets/workspace/AGENTS.md')
    expect(scaffold.files).toContain('engine-assets/skills/brief/SKILL.md')
    expect(scaffold.files).toContain('product/profiles/demo-soul-app/SOUL.md')
    expect(scaffold.files).toContain('host-adapter/standalone/standalone.ts')
    expect(scaffold.files).toContain('host-adapter/mounted/host-mounted.ts')
    await expect(stat(path.join(appDir, 'soul-app.manifest.json'))).resolves.toBeTruthy()
    await expect(stat(path.join(appDir, 'host-adapter/index.ts'))).resolves.toBeTruthy()
    await expect(stat(path.join(appDir, 'host-adapter/standalone/standalone.ts'))).resolves.toBeTruthy()
    await expect(stat(path.join(appDir, 'host-adapter/mounted/host-mounted.ts'))).resolves.toBeTruthy()
    const scaffoldPackageJson = JSON.parse(await readFile(path.join(appDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    const scaffoldReadme = await readFile(path.join(appDir, 'README.md'), 'utf8')
    const scaffoldWorkspaceGitignore = await readFile(path.join(appDir, 'engine-assets', 'workspace', '.gitignore'), 'utf8')
    const scaffoldManifest = JSON.parse(await readFile(path.join(appDir, 'soul-app.manifest.json'), 'utf8')) as {
      ui: {
        workbench?: {
          actions?: Array<{ id: string, protocolAction: string, role: string }>
          primaryAction?: { id: string, protocolAction: string, role: string }
          search?: { id: string, protocolProvider: string }
          settings?: { id: string, protocolAction: string }
        }
        workspaceContext?: {
          terminal?: {
            cwd?: { source: string }
            id: string
          }
        }
      }
    }
    expect(scaffoldPackageJson.dependencies['@zonease/aiworker-soul-app-sdk']).toBe('workspace:*')
    expect(scaffoldManifest.ui.workbench?.primaryAction).toEqual(expect.objectContaining({
      id: 'create-brief',
      protocolAction: 'briefs.create',
      role: 'primary',
    }))
    expect(scaffoldManifest.ui.workbench?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'refresh-briefs',
        protocolAction: 'briefs.refresh',
        role: 'refresh',
      }),
    ]))
    expect(scaffoldManifest.ui.workbench?.search).toEqual(expect.objectContaining({
      id: 'brief-search',
      protocolProvider: 'briefs.search',
    }))
    expect(scaffoldManifest.ui.workbench?.settings).toEqual(expect.objectContaining({
      id: 'brief-settings',
      protocolAction: 'settings.open',
    }))
    expect(scaffoldManifest.ui.workspaceContext?.terminal).toEqual(expect.objectContaining({
      cwd: { source: 'host-workspace-root' },
      id: 'starter-workspace-terminal',
    }))
    expect(scaffoldReadme).toContain('source-checkout preview')
    expect(scaffoldReadme).toContain('ui.workbench')
    expect(scaffoldReadme).toContain('ui.workspaceContext')
    expect(scaffoldReadme).toContain('replace `workspace:*` after the SDK is published')
    expect(scaffoldWorkspaceGitignore).toContain('.aiworker/sessions/')
    expect(scaffoldWorkspaceGitignore).toContain('.aiworker/projections.json')
    expect(scaffoldWorkspaceGitignore).toContain('evidence/raw/')
    expect(scaffoldWorkspaceGitignore).not.toContain('AGENTS.md')
    expect(scaffoldWorkspaceGitignore).not.toContain('CLAUDE.md')
    expect(scaffoldWorkspaceGitignore).not.toContain('.agents/skills')
    expect(scaffoldWorkspaceGitignore).not.toContain('.claude/skills')
    output = ''

    expect(await runCli(argv('app', 'validate', appDir))).toBe(0)
    const validation = JSON.parse(output) as {
      validation: {
        appId: string
        assetIssues: unknown[]
        checkedAssets: string[]
        privateImportIssues: unknown[]
        status: string
      }
    }
    expect(validation.validation).toMatchObject({ appId: 'demo-soul-app', status: 'pass' })
    expect(validation.validation.assetIssues).toEqual([])
    expect(validation.validation.privateImportIssues).toEqual([])
    expect(validation.validation.checkedAssets).toContain('./engine-assets/workspace')
    expect(validation.validation.checkedAssets).toContain('./engine-assets/skills')
    expect(validation.validation.checkedAssets).toContain('./product/artifacts/schemas/brief.schema.json')
    expect(validation.validation.checkedAssets).toContain('./host-adapter/standalone/standalone.ts')
    expect(validation.validation.checkedAssets).toContain('./host-adapter/mounted/host-mounted.ts')
    expect(validation.validation.checkedAssets).toContain('./host-adapter/index.ts')
    output = ''

    expect(await runCli(argv('app', 'smoke', appDir))).toBe(0)
    const smoke = JSON.parse(output) as {
      smoke: {
        appId: string
        artifactCount: number
        hostedStatus: string
        mounted: string
        mountedService: string
        mountedServiceHttpStatus: number
        mountedServiceUrl: string
        standalone: string
        standaloneHttpStatus: number
        standaloneUrl: string
        status: string
        workbenchAction: string
        workbenchSearch: string
      }
    }
    expect(smoke.smoke).toMatchObject({
      appId: 'demo-soul-app',
      artifactCount: 1,
      hostedStatus: 'enabled',
      mounted: 'pass',
      mountedService: 'pass',
      mountedServiceHttpStatus: 200,
      standalone: 'pass',
      standaloneHttpStatus: 200,
      status: 'pass',
      workbenchAction: 'pass',
      workbenchSearch: 'pass',
    })
    expect(smoke.smoke.standaloneUrl).toStartWith('http://127.0.0.1:')
    expect(smoke.smoke.mountedServiceUrl).toStartWith('http://127.0.0.1:')
  })

  it('fails Soul App validation when an artifact schema hash does not match the file', async () => {
    const appDir = path.join(root, 'hash-check-app')

    expect(await runCli(argv('app', 'create', 'hash-check-app', '--dir', appDir))).toBe(0)
    output = ''
    await writeFile(path.join(appDir, 'product/artifacts/schemas/brief.schema.json'), '{"type":"object","properties":{"tampered":{"type":"string"}}}\n')

    expect(await runCli(argv('app', 'validate', appDir))).toBe(1)
    const validation = JSON.parse(output) as {
      validation: {
        assetIssues: Array<{ code: string, path: string }>
        status: string
      }
    }
    expect(validation.validation.status).toBe('fail')
    expect(validation.validation.assetIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_hash_mismatch', path: './product/artifacts/schemas/brief.schema.json' }),
    ]))
  })

  it('fails Soul App validation on Host private imports', async () => {
    const appDir = path.join(root, 'private-import-app')

    expect(await runCli(argv('app', 'create', 'private-import-app', '--dir', appDir))).toBe(0)
    output = ''
    await writeFile(path.join(appDir, 'host-adapter/private.ts'), 'import { createLocalWorkerRuntime } from \'@zonease/aiworker-core\'\n')

    expect(await runCli(argv('app', 'validate', appDir))).toBe(1)
    const validation = JSON.parse(output) as {
      validation: {
        privateImportIssues: Array<{ file: string, importPath: string, message: string }>
        status: string
      }
    }
    expect(validation.validation.status).toBe('fail')
    expect(validation.validation.privateImportIssues).toEqual([{
      file: 'host-adapter/private.ts',
      importPath: '@zonease/aiworker-core',
      message: 'Soul Apps must use @zonease/aiworker-soul-app-sdk instead of Host private packages or sibling Soul Apps.',
    }])
  })

  it('fails Soul App validation on sibling app imports', async () => {
    const appDir = path.join(root, 'sibling-import-app')

    expect(await runCli(argv('app', 'create', 'sibling-import-app', '--dir', appDir))).toBe(0)
    output = ''
    await writeFile(path.join(appDir, 'host-adapter/private.ts'), 'import { hrReferenceSoulApp } from \'@zonease/aiworker-hr\'\n')

    expect(await runCli(argv('app', 'validate', appDir))).toBe(1)
    const validation = JSON.parse(output) as {
      validation: {
        privateImportIssues: Array<{ file: string, importPath: string, message: string }>
        status: string
      }
    }
    expect(validation.validation.status).toBe('fail')
    expect(validation.validation.privateImportIssues).toEqual([{
      file: 'host-adapter/private.ts',
      importPath: '@zonease/aiworker-hr',
      message: 'Soul Apps must use @zonease/aiworker-soul-app-sdk instead of Host private packages or sibling Soul Apps.',
    }])
  })

  it('fails Soul App validation on raw browser storage usage', async () => {
    const appDir = path.join(root, 'raw-storage-app')

    expect(await runCli(argv('app', 'create', 'raw-storage-app', '--dir', appDir))).toBe(0)
    output = ''
    await writeFile(path.join(appDir, 'product/web/routes/raw-storage.ts'), [
      'localStorage.setItem("theme", "dark")',
      'window.sessionStorage.clear()',
      '',
    ].join('\n'))

    expect(await runCli(argv('app', 'validate', appDir))).toBe(1)
    const validation = JSON.parse(output) as {
      validation: {
        status: string
        webStorageIssues: Array<{ file: string, message: string, symbol: string }>
      }
    }
    expect(validation.validation.status).toBe('fail')
    expect(validation.validation.webStorageIssues).toEqual([
      {
        file: 'product/web/routes/raw-storage.ts',
        message: 'Soul Apps must use createSoulAppWebStorage(...) instead of raw browser Web Storage APIs.',
        symbol: 'localStorage',
      },
      {
        file: 'product/web/routes/raw-storage.ts',
        message: 'Soul Apps must use createSoulAppWebStorage(...) instead of raw browser Web Storage APIs.',
        symbol: 'window.sessionStorage.clear',
      },
    ])
  })
})
