import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdirSync, realpathSync, renameSync } from 'node:fs'
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { soulAppServiceEnv } from '@zonease/aiworker-host-runtime'
import { namespaceSoulAppCapabilityId } from '@zonease/aiworker-soul-protocol'
import {
  closeWorkerDb,
  createSession,
  createWorkspace,
  engineInvocations,
  getWorkerDb,
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
  const originalErrorWrite = process.stderr.write
  const originalWrite = process.stdout.write
  let fakeEngineCommandPaths: string[] = []
  let errorOutput = ''
  let root: string
  let output = ''

  beforeEach(async () => {
    closeWorkerDb()
    fakeEngineCommandPaths = []
    errorOutput = ''
    output = ''
    root = await mkdtemp(path.join(tmpdir(), 'aiworker-cli-'))
    process.env.AIWORKER_HOME = path.join(root, 'home')
    process.env.WORKER_DB_PATH = path.join(root, 'home', 'aiworker.db')
    process.stderr.write = ((chunk: string | Uint8Array) => {
      errorOutput += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as typeof process.stderr.write
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
    process.stderr.write = originalErrorWrite
    process.stdout.write = originalWrite
    await Promise.all(fakeEngineCommandPaths.map(commandPath => rm(commandPath, { force: true })))
    await rm(root, { recursive: true, force: true })
  })

  function argv(...args: string[]): string[] {
    return ['/usr/bin/bun', '/repo/apps/cli/src/aiworker.ts', ...args]
  }

  const FREEFORM_APP_ID = 'aiworker-freeform'
  const FREEFORM_CAPABILITY_ID = namespaceSoulAppCapabilityId(FREEFORM_APP_ID, 'default')

  function freeformDescriptorPath(): string {
    return path.resolve(import.meta.dir, '..', '..', '..', 'souls', FREEFORM_APP_ID, 'dist', 'soul.descriptor.json')
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
      capabilityId: 'candidate-screen',
      title: 'Legacy candidate screen',
      metadataJson: { capabilityId: 'candidate-screen', soulName: 'HR' },
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
    await writeFakeEngineCommand('codex', [
      'printf \'%s\\n\' \'{"type":"item.completed","item":{"type":"agent_message","text":"Done."}}\'',
    ])
  }

  async function writeFakeOpenCodeCommand(): Promise<void> {
    await writeFakeEngineCommand('opencode', [
      'printf \'%s\\n\' \'{"type":"text","part":{"text":"Done."}}\'',
    ])
  }

  async function writeFakeClaudeCommand(): Promise<void> {
    await writeFakeEngineCommand('claude', [
      'printf \'%s\\n\' \'{"type":"assistant","message":{"id":"msg-1","content":[{"type":"text","text":"Done."}]}}\'',
      'printf \'%s\\n\' \'{"type":"result","usage":{"input_tokens":1,"output_tokens":1}}\'',
    ])
  }

  async function writeFakeEngineCommand(command: string, body: string[]): Promise<void> {
    const binDir = path.join(root, 'bin')
    mkdirSync(binDir, { recursive: true })
    const commandPath = path.join(binDir, command)
    await writeFile(commandPath, [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'cat >/dev/null',
      ...body,
      '',
    ].join('\n'))
    await chmod(commandPath, 0o755)
    fakeEngineCommandPaths.push(commandPath)
    process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`
  }

  async function updateScratchEntries(parentDir: string): Promise<string[]> {
    return (await readdir(parentDir)).filter(entry => entry.startsWith('.aiworker-update-') || entry.startsWith('.aiworker-next-'))
  }

  it('preprocesses multi-word local commands', () => {
    expect(preprocessArgv(argv('workspace', 'create', '--name', 'T')).slice(2, 3)).toEqual(['workspace create'])
    expect(preprocessArgv(argv('session', 'start', '--input', 'P')).slice(2, 3)).toEqual(['session start'])
    expect(preprocessArgv(argv('session', 'invoke', '--input', 'P')).slice(2, 3)).toEqual(['session invoke'])
    expect(preprocessArgv(argv('worker', 'create', '--name', 'HR')).slice(2, 3)).toEqual(['worker create'])
    expect(preprocessArgv(argv('daemon', 'restart')).slice(2, 3)).toEqual(['daemon restart'])
  })

  it('shows a compact operator command index by default and full index on request', async () => {
    expect(await runCli(argv('commands'))).toBe(0)

    expect(output).toContain('aiworker operator commands')
    expect(output).toContain('daemon start|stop|restart|status|logs')
    expect(output).toContain('app list|show|install|enable|archive|delete|bootstrap')
    expect(output).toContain('worker create|list|select|archive|delete')
    expect(output).not.toContain('dev')
    expect(output).not.toContain('app create|validate|smoke')

    output = ''
    expect(await runCli(argv('commands', '--all'))).toBe(0)

    expect(output).toContain('aiworker command index')
    expect(output).toContain('dev')
    expect(output).toContain('daemon start|foreground|status|stop|restart|logs|check')
    expect(output).toContain('app list|show|install|enable|archive|delete|doctor|permissions|bootstrap|create|validate|smoke')
    expect(output).toContain('capability list')
    expect(output).toContain('files list|show')
    expect(output).not.toContain('compatibility inspection')
    expect(output).not.toContain('artifacts list|show|open')
    expect(output).not.toContain('profile promote')
    expect(output).not.toContain('review list|show')
    expect(output).not.toContain('lessons list|propose|accept|reject')
  })

  it('shows compact top-level help unless all commands are requested', async () => {
    expect(await runCli(argv('--help'))).toBe(0)

    expect(output).toContain('Primary operator commands')
    expect(output).toContain('daemon start|stop|restart|status|logs')
    expect(output).not.toContain('app create <id>')

    output = ''
    expect(await runCli(argv('--help', '--all'))).toBe(0)

    expect(output).toContain('Commands:')
    expect(output).toContain('app create <id>')
    expect(output).toContain('list app-declared capabilities')
    expect(output).toContain('list workspace files')
    expect(output).toContain('print workspace file')
    expect(output).not.toContain('compatibility inspection')
    expect(output).not.toContain('deprecated compatibility: list app output descriptors')
    expect(output).not.toContain('deprecated HR compatibility: promote app output into a workspace README')
    expect(output).not.toContain('artifacts list')
    expect(output).not.toContain('profile promote')
  })

  it('rejects removed generic work-object commands', async () => {
    for (const args of [
      ['artifacts', 'list'],
      ['artifacts', 'show', 'artifact-1'],
      ['profile', 'promote'],
      ['review', 'list'],
      ['lessons', 'list'],
      ['lessons', 'propose'],
      ['session', 'start', '--context', 'old free-form context'],
    ]) {
      output = ''
      expect(await runCli(argv(...args))).toBe(1)
    }
  })

  it('redacts secret-like values from fatal CLI error output', async () => {
    expect(await runCli(argv('unknown-token=sk-cli-fatal-secret'))).toBe(1)

    expect(errorOutput).not.toContain('sk-cli-fatal-secret')
    expect(errorOutput).toContain('[REDACTED]')
  })

  it('redacts secret-like values from daemon log output', async () => {
    const logFile = path.join(process.env.AIWORKER_HOME!, 'aiworker-daemon.log')
    mkdirSync(path.dirname(logFile), { recursive: true })
    await writeFile(logFile, [
      'daemon ready',
      'startup token=sk-cli-daemon-log-secret',
      'authorization = "literal-secret-value"',
      '',
    ].join('\n'))

    expect(await runCli(argv('daemon', 'logs', '--tail', '3'))).toBe(0)

    expect(output).not.toContain('sk-cli-daemon-log-secret')
    expect(output).not.toContain('literal-secret-value')
    expect(output).toContain('[REDACTED]')
  })

  it('resolves package-local official descriptor apps before source apps', async () => {
    const moduleDir = path.join(root, 'dist')
    const officialAppsRoot = path.join(moduleDir, 'official-apps')
    mkdirSync(path.join(officialAppsRoot, FREEFORM_APP_ID, 'dist'), { recursive: true })
    await writeFile(path.join(officialAppsRoot, FREEFORM_APP_ID, 'dist', 'soul.descriptor.json'), '{}')

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

  it('creates workspace/session command records with a mocked engine', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'freeform-worker', '--name', 'Freeform Worker', '--soul', FREEFORM_APP_ID))).toBe(0)
    expect((JSON.parse(output) as { worker: { id: string, soulId: string } }).worker).toMatchObject({ id: 'freeform-worker', soulId: FREEFORM_APP_ID })
    output = ''

    expect(await runCli(argv('worker', 'select', 'freeform-worker'))).toBe(0)
    expect(output).toContain('selected-worker')
    output = ''

    expect(await runCli(argv('workspace', 'create', '--name', 'Scratch', '--type', 'freeform', '--worker', 'freeform-worker'))).toBe(0)
    expect((JSON.parse(output) as { workspace: { id: string, type: string } }).workspace).toMatchObject({ type: 'freeform' })
    output = ''

    expect(await runCli(argv('commands'))).toBe(0)
    expect(output).toContain('daemon start|stop|restart|status|logs')
    expect(output).toContain('app list|show|install|enable|archive|delete|bootstrap')
    expect(output).toContain('worker create|list|select|archive|delete')
    expect(output).toContain('workspace create|list|archive|delete')
    expect(output).toContain('session start|invoke|list|show|archive|delete')
    expect(output).not.toContain('run start')
  })

  it('archives and deletes Host lifecycle records through CLI commands', async () => {
    await writeFakeCodexCommand()

    expect(await runCli(argv('app', 'install', freeformDescriptorPath()))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'lifecycle-worker', '--name', 'Lifecycle Worker', '--soul', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'Lifecycle Workspace', '--type', 'freeform', '--worker', 'lifecycle-worker'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string, rootPath: string } }).workspace
    await writeFile(path.join(workspace.rootPath, 'app-owned.txt'), 'owned by the workspace\n')
    output = ''

    expect(await runCli(argv(
      'session',
      'start',
      '--worker',
      'lifecycle-worker',
      '--workspace',
      workspace.id,
      '--capability',
      FREEFORM_CAPABILITY_ID,
      '--title',
      'Lifecycle Session',
      '--input',
      'Create lifecycle evidence.',
    ))).toBe(0)
    const session = (JSON.parse(output) as { session: { id: string } }).session
    output = ''

    expect(await runCli(argv('session', 'archive', session.id))).toBe(0)
    expect((JSON.parse(output) as { session: { status: string } }).session.status).toBe('archived')
    output = ''
    expect(await runCli(argv('session', 'delete', session.id))).toBe(0)
    expect((JSON.parse(output) as { deleted: boolean, session: { id: string } })).toMatchObject({ deleted: true, session: { id: session.id } })
    output = ''

    expect(await runCli(argv('workspace', 'archive', workspace.id))).toBe(0)
    expect((JSON.parse(output) as { workspace: { status: string } }).workspace.status).toBe('archived')
    output = ''
    expect(await runCli(argv('workspace', 'delete', workspace.id))).toBe(0)
    expect((JSON.parse(output) as { deleted: boolean, workspace: { id: string } })).toMatchObject({ deleted: true, workspace: { id: workspace.id } })
    await expect(stat(path.join(workspace.rootPath, 'app-owned.txt'))).resolves.toMatchObject({ size: 23 })
    output = ''

    expect(await runCli(argv('worker', 'archive', 'lifecycle-worker'))).toBe(0)
    expect((JSON.parse(output) as { worker: { status: string } }).worker.status).toBe('archived')
    output = ''
    errorOutput = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'Blocked Workspace', '--type', 'freeform', '--worker', 'lifecycle-worker'))).toBe(1)
    expect(errorOutput).toContain('Worker lifecycle-worker is archived and cannot start new work.')
    errorOutput = ''
    expect(await runCli(argv('worker', 'delete', 'lifecycle-worker'))).toBe(0)
    expect((JSON.parse(output) as { deleted: boolean, worker: { id: string } })).toMatchObject({ deleted: true, worker: { id: 'lifecycle-worker' } })
    output = ''

    expect(await runCli(argv('app', 'archive', FREEFORM_APP_ID))).toBe(0)
    expect((JSON.parse(output) as { app: { status: string } }).app.status).toBe('disabled')
    output = ''
    expect(await runCli(argv('app', 'delete', FREEFORM_APP_ID))).toBe(0)
    expect((JSON.parse(output) as { app: { appId: string, status: string } }).app).toMatchObject({ appId: FREEFORM_APP_ID, status: 'disabled' })
  })

  it('materializes app-authored capability assets for the first session invocation', async () => {
    await writeFakeCodexCommand()

    expect(await runCli(argv('app', 'install', freeformDescriptorPath()))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'demo-worker', '--name', 'Demo Worker', '--soul', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'Analysis Workspace', '--type', 'general-analysis', '--worker', 'demo-worker'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string, rootPath: string } }).workspace
    output = ''

    expect(await runCli(argv(
      'session',
      'start',
      '--worker',
      'demo-worker',
      '--workspace',
      workspace.id,
      '--capability',
      FREEFORM_CAPABILITY_ID,
      '--title',
      'Evidence Matrix',
      '--input',
      'Create the evidence matrix.',
    ))).toBe(0)
    const result = JSON.parse(output) as {
      invocation: { sessionId: string }
      session: { id: string }
    }

    expect(result.session.id).toBeTruthy()
    expect(result.invocation.sessionId).toBeTruthy()
  })

  it('redacts secret-like values from workspace file inspection output', async () => {
    closeWorkerDb()
    mkdirSync(path.dirname(process.env.WORKER_DB_PATH!), { recursive: true })
    initWorkerDb(process.env.WORKER_DB_PATH!)
    runWorkerMigrations()
    upsertWorker({
      id: 'inspect-worker',
      soulId: FREEFORM_APP_ID,
      name: 'Inspect Worker',
      defaultEngineId: 'codex',
      at: '2026-05-27T08:00:00.000Z',
    })
    const workspaceRoot = path.join(root, 'home', 'workers', 'inspect-worker', 'workspaces', 'inspect-workspace')
    createWorkspace({
      id: 'inspect-workspace',
      workerId: 'inspect-worker',
      name: 'Inspect Workspace',
      rootPath: workspaceRoot,
      at: '2026-05-27T08:00:01.000Z',
    })
    mkdirSync(path.join(workspaceRoot, '.codex'), { recursive: true })
    await writeFile(path.join(workspaceRoot, '.codex', 'config.toml'), [
      'token = "sk-cli-inspect-secret"',
      'authorization = "literal-secret-value"',
      '',
    ].join('\n'))
    closeWorkerDb()

    expect(await runCli(argv('files', 'show', '.codex/config.toml', '--worker', 'inspect-worker', '--workspace', 'inspect-workspace'))).toBe(0)

    expect(output).not.toContain('sk-cli-inspect-secret')
    expect(output).not.toContain('literal-secret-value')
    expect(output).toContain('[REDACTED]')
  })

  it('redacts legacy secret-like engine diagnostics from session inspection output', async () => {
    closeWorkerDb()
    mkdirSync(path.dirname(process.env.WORKER_DB_PATH!), { recursive: true })
    initWorkerDb(process.env.WORKER_DB_PATH!)
    runWorkerMigrations()
    upsertWorker({
      id: 'session-inspect-worker',
      soulId: FREEFORM_APP_ID,
      name: 'Session Inspect Worker',
      defaultEngineId: 'codex',
      at: '2026-05-27T08:10:00.000Z',
    })
    createWorkspace({
      id: 'session-inspect-workspace',
      workerId: 'session-inspect-worker',
      name: 'Session Inspect Workspace',
      rootPath: path.join(root, 'home', 'workers', 'session-inspect-worker', 'workspaces', 'session-inspect-workspace'),
      at: '2026-05-27T08:10:01.000Z',
    })
    createSession({
      id: 'session-inspect-session',
      workerId: 'session-inspect-worker',
      workspaceId: 'session-inspect-workspace',
      capabilityId: FREEFORM_CAPABILITY_ID,
      title: 'Session Inspect',
      at: '2026-05-27T08:10:02.000Z',
    })
    getWorkerDb().insert(engineInvocations).values({
      id: 'session-inspect-invocation',
      sessionId: 'session-inspect-session',
      seq: 1,
      engineId: 'codex',
      engineCommand: 'codex --token sk-session-show-secret',
      status: 'failed',
      processState: 'exited',
      inputRef: 'aiworker://sessions/session-inspect-session/invocations/session-inspect-invocation/input',
      summary: 'authorization = "literal-secret-value"',
      error: 'token=sk-session-show-secret',
      metadataJson: { authorization: 'literal-secret-value' },
      createdAt: '2026-05-27T08:10:03.000Z',
      updatedAt: '2026-05-27T08:10:03.000Z',
    }).run()
    closeWorkerDb()

    expect(await runCli(argv('session', 'show', 'session-inspect-session'))).toBe(0)

    expect(output).not.toContain('sk-session-show-secret')
    expect(output).not.toContain('literal-secret-value')
    expect(output).toContain('[REDACTED]')
  })

  it('freezes CLI engine choice for new sessions without changing existing sessions', async () => {
    await writeFakeOpenCodeCommand()

    expect(await runCli(argv('app', 'install', freeformDescriptorPath()))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'demo-worker', '--name', 'Demo Worker', '--soul', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'Analysis Workspace', '--type', 'general-analysis', '--worker', 'demo-worker'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string } }).workspace
    output = ''

    expect(await runCli(argv('engine', 'select', 'opencode'))).toBe(0)
    output = ''
    expect(await runCli(argv(
      'session',
      'start',
      '--worker',
      'demo-worker',
      '--workspace',
      workspace.id,
      '--capability',
      FREEFORM_CAPABILITY_ID,
      '--title',
      'Evidence Matrix',
      '--input',
      'Create the evidence matrix.',
    ))).toBe(0)
    const started = JSON.parse(output) as {
      invocation: { engineCommand: string | null, engineId: string }
      session: { id: string, metadataJson: Record<string, unknown> }
    }
    expect(started.session.metadataJson).toMatchObject({
      engineId: 'opencode',
      executionMode: 'local-cli',
    })
    expect(String(started.session.metadataJson.engineCommand)).toMatch(/\/opencode$/)
    const frozenEngineCommand = started.session.metadataJson.engineCommand as string
    expect(started.invocation.engineCommand).toBe(frozenEngineCommand)
    expect(started.invocation.engineId).toBe('opencode')
    output = ''

    expect(await runCli(argv('engine', 'select', 'codex'))).toBe(0)
    output = ''
    expect(await runCli(argv(
      'session',
      'invoke',
      '--worker',
      'demo-worker',
      '--session',
      started.session.id,
      '--input',
      'Continue after changing the selected engine.',
    ))).toBe(0)
    const continued = JSON.parse(output) as {
      invocation: { engineCommand: string | null, engineId: string, metadataJson: Record<string, unknown> }
    }
    expect(continued.invocation.engineCommand).toBe(frozenEngineCommand)
    expect(continued.invocation.engineId).toBe('opencode')
    expect(continued.invocation.metadataJson).toMatchObject({
      engineId: 'opencode',
      executionMode: 'local-cli',
    })
    expect(continued.invocation.metadataJson.engineCommand).toBe(frozenEngineCommand)
    output = ''

    expect(await runCli(argv(
      'session',
      'start',
      '--worker',
      'demo-worker',
      '--workspace',
      workspace.id,
      '--capability',
      FREEFORM_CAPABILITY_ID,
      '--title',
      'Explicit Engine Matrix',
      '--input',
      'Create another evidence matrix.',
      '--engine',
      'opencode',
    ))).toBe(0)
    const explicit = JSON.parse(output) as {
      invocation: { engineCommand: string | null, engineId: string }
      session: { metadataJson: Record<string, unknown> }
    }
    expect(explicit.session.metadataJson).toMatchObject({
      engineId: 'opencode',
      executionMode: 'local-cli',
    })
    const explicitMetadataEngineCommand = explicit.session.metadataJson.engineCommand
    expect(String(explicitMetadataEngineCommand)).toMatch(/\/opencode$/)
    expect(explicit.invocation.engineCommand).toBe(explicitMetadataEngineCommand as string)
    expect(explicit.invocation.engineId).toBe('opencode')
  })

  it('resolves claude-code selected engine to the installed claude command', async () => {
    await writeFakeClaudeCommand()

    expect(await runCli(argv('app', 'install', freeformDescriptorPath()))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'claude-worker', '--name', 'Claude Worker', '--soul', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'Analysis Workspace', '--type', 'general-analysis', '--worker', 'claude-worker'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string } }).workspace
    output = ''

    expect(await runCli(argv('engine', 'select', 'claude-code'))).toBe(0)
    output = ''
    expect(await runCli(argv(
      'session',
      'start',
      '--worker',
      'claude-worker',
      '--workspace',
      workspace.id,
      '--capability',
      FREEFORM_CAPABILITY_ID,
      '--title',
      'Claude profile',
      '--input',
      'Create a short profile summary.',
    ))).toBe(0)

    const started = JSON.parse(output) as {
      invocation: { engineCommand: string | null, engineId: string }
      session: { metadataJson: Record<string, unknown> }
    }
    expect(started.session.metadataJson.engineId).toBe('claude-code')
    expect(String(started.session.metadataJson.engineCommand)).toMatch(/\/claude$/)
    expect(started.invocation.engineId).toBe('claude-code')
    expect(String(started.invocation.engineCommand)).toMatch(/\/claude$/)
  })

  it('uses frozen CLI engine metadata when the selected engine becomes unavailable', async () => {
    await writeFakeOpenCodeCommand()

    expect(await runCli(argv('app', 'install', freeformDescriptorPath()))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'frozen-worker', '--name', 'Frozen Worker', '--soul', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'Analysis Workspace', '--type', 'general-analysis', '--worker', 'frozen-worker'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string } }).workspace
    output = ''

    expect(await runCli(argv('engine', 'select', 'opencode'))).toBe(0)
    output = ''
    expect(await runCli(argv(
      'session',
      'start',
      '--worker',
      'frozen-worker',
      '--workspace',
      workspace.id,
      '--capability',
      FREEFORM_CAPABILITY_ID,
      '--title',
      'Frozen engine',
      '--input',
      'Start with OpenCode.',
    ))).toBe(0)
    const started = JSON.parse(output) as {
      invocation: { engineCommand: string | null, engineId: string }
      session: { id: string, metadataJson: Record<string, unknown> }
    }
    expect(started.session.metadataJson.engineId).toBe('opencode')
    expect(String(started.session.metadataJson.engineCommand)).toMatch(/\/opencode$/)
    const frozenEngineCommand = started.session.metadataJson.engineCommand as string
    expect(started.invocation.engineCommand).toBe(frozenEngineCommand)
    output = ''

    expect(await runCli(argv('engine', 'select', 'qwen'))).toBe(0)
    output = ''
    expect(await runCli(argv(
      'session',
      'invoke',
      '--worker',
      'frozen-worker',
      '--session',
      started.session.id,
      '--input',
      'Continue after selecting an unavailable engine.',
    ))).toBe(0)
    const continued = JSON.parse(output) as {
      invocation: { engineCommand: string | null, engineId: string, metadataJson: Record<string, unknown> }
    }
    expect(continued.invocation.engineCommand).toBe(frozenEngineCommand)
    expect(continued.invocation.engineId).toBe('opencode')
    expect(continued.invocation.metadataJson).toMatchObject({
      engineId: 'opencode',
      executionMode: 'local-cli',
    })
    expect(continued.invocation.metadataJson.engineCommand).toBe(frozenEngineCommand)
  })

  it('resolves legacy frozen local engine metadata without switching to the selected engine', async () => {
    await writeFakeClaudeCommand()
    await writeFakeOpenCodeCommand()

    expect(await runCli(argv('app', 'install', freeformDescriptorPath()))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'legacy-engine-worker', '--name', 'Legacy Engine Worker', '--soul', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'Analysis Workspace', '--type', 'general-analysis', '--worker', 'legacy-engine-worker'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string } }).workspace
    output = ''

    closeWorkerDb()
    mkdirSync(path.dirname(process.env.WORKER_DB_PATH!), { recursive: true })
    initWorkerDb(process.env.WORKER_DB_PATH!)
    runWorkerMigrations()
    createSession({
      id: 'legacy-engine-session',
      workerId: 'legacy-engine-worker',
      workspaceId: workspace.id,
      capabilityId: FREEFORM_CAPABILITY_ID,
      title: 'Legacy engine session',
      metadataJson: {
        engineId: 'claude-code',
        executionMode: 'local-cli',
      },
      at: '2026-05-25T12:00:00.000Z',
    })
    closeWorkerDb()

    expect(await runCli(argv('engine', 'select', 'opencode'))).toBe(0)
    output = ''
    expect(await runCli(argv(
      'session',
      'invoke',
      '--worker',
      'legacy-engine-worker',
      '--session',
      'legacy-engine-session',
      '--input',
      'Continue a legacy Claude Code session.',
    ))).toBe(0)

    const continued = JSON.parse(output) as {
      invocation: { engineCommand: string | null, engineId: string, metadataJson: Record<string, unknown>, status: string }
    }
    expect(continued.invocation.engineId).toBe('claude-code')
    expect(String(continued.invocation.engineCommand)).toMatch(/\/claude$/)
    expect(continued.invocation.status).toBe('succeeded')
    expect(continued.invocation.metadataJson).toMatchObject({
      engineId: 'claude-code',
      executionMode: 'local-cli',
    })
    expect(String(continued.invocation.metadataJson.engineCommand)).toMatch(/\/claude$/)
  })

  it('keeps upgrade discoverable only in the full command index', async () => {
    expect(await runCli(argv('commands'))).toBe(0)

    expect(output).toContain('update')
    expect(output).not.toContain('update|upgrade')
    output = ''

    expect(await runCli(argv('commands', '--all'))).toBe(0)

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
      [FREEFORM_APP_ID, 'installed_enabled'],
    ])
    expect(body.catalog.souls).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: FREEFORM_APP_ID, status: 'available' }),
    ]))
    expect(body.catalog.souls.some(soul => soul.id === 'hr')).toBe(false)
    output = ''

    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    expect((JSON.parse(output) as { bootstrap: { results: Array<{ action: string }> } }).bootstrap.results.map(result => result.action)).toEqual(['refreshed'])
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'legacy-hr', '--name', 'Legacy HR', '--soul', 'hr'))).toBe(1)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'official-freeform', '--name', 'Official Freeform', '--soul', FREEFORM_APP_ID))).toBe(0)
    expect((JSON.parse(output) as { worker: { soulId: string } }).worker.soulId).toBe(FREEFORM_APP_ID)
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
    expect(body.catalog.souls.map(soul => soul.id)).toContain(FREEFORM_APP_ID)
    output = ''

    expect(await runCli(argv('worker', 'show', 'legacy-hr-worker'))).toBe(0)
    expect((JSON.parse(output) as { worker: null }).worker).toBeNull()
  })

  it('installs, enables, lists, and archives local Soul descriptors', async () => {
    const descriptorPath = freeformDescriptorPath()

    expect(await runCli(argv('app', 'install', descriptorPath))).toBe(0)
    expect((JSON.parse(output) as { app: { appId: string, status: string } }).app).toMatchObject({ appId: FREEFORM_APP_ID, status: 'installed' })
    output = ''

    expect(await runCli(argv('app', 'enable', FREEFORM_APP_ID))).toBe(0)
    expect((JSON.parse(output) as { app: { healthStatus: string, status: string } }).app).toMatchObject({ healthStatus: 'pass', status: 'enabled' })
    output = ''

    expect(await runCli(argv('soul', 'list'))).toBe(0)
    expect((JSON.parse(output) as { souls: Array<{ id: string, status: string }> }).souls).toEqual(expect.arrayContaining([expect.objectContaining({ id: FREEFORM_APP_ID, status: 'available' })]))
    output = ''

    expect(await runCli(argv('capability', 'list', '--soul', FREEFORM_APP_ID))).toBe(0)
    const capabilityId = FREEFORM_CAPABILITY_ID
    expect((JSON.parse(output) as { capabilities: Array<{ id: string }> }).capabilities.map(capability => capability.id)).toContain(capabilityId)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'mounted-hr', '--name', 'Mounted HR', '--soul', FREEFORM_APP_ID))).toBe(0)
    expect((JSON.parse(output) as { worker: { metadata: Record<string, unknown>, soulId: string } }).worker.soulId).toBe(FREEFORM_APP_ID)
    output = ''

    expect(await runCli(argv('app', 'archive', FREEFORM_APP_ID))).toBe(0)
    expect((JSON.parse(output) as { app: { status: string } }).app.status).toBe('disabled')
    output = ''

    expect(await runCli(argv('capability', 'list', '--soul', FREEFORM_APP_ID))).toBe(0)
    expect((JSON.parse(output) as { capabilities: unknown[] }).capabilities).toEqual([])
    output = ''

    expect(await runCli(argv('template', 'list', '--soul', FREEFORM_APP_ID))).toBe(1)
  })

  it('scaffolds, validates, and smokes a descriptor-only SDK Soul App', async () => {
    const appDir = path.join(root, 'demo-soul-app')

    expect(await runCli(argv('app', 'create', 'demo-soul-app', '--dir', appDir))).toBe(0)
    const scaffold = JSON.parse(output) as { appId: string, descriptorPath: string, files: string[], path: string }
    const descriptorPath = path.join(appDir, 'dist', 'soul.descriptor.json')
    expect(scaffold).toMatchObject({ appId: 'demo-soul-app', descriptorPath, path: appDir })
    expect(scaffold.files).toContain('soul.config.ts')
    expect(scaffold.files).toContain('product/capabilities/default/prompt.md')
    expect(scaffold.files).toContain('engine/workspace/AGENTS.md')
    expect(scaffold.files).toContain('engine/skills/default/SKILL.md')
    expect(scaffold.files).toContain('engine/mcp/codex/config.toml')
    expect(scaffold.files).toContain('engine/mcp/claude-code/.mcp.json')
    expect(scaffold.files).toContain('scripts/build.ts')
    expect(scaffold.files).toContain('scripts/validate.ts')
    expect(scaffold.files).toContain('dist/soul.descriptor.json')
    expect(scaffold.files).not.toContain('soul-app.manifest.json')
    expect(scaffold.files.some(file => file.startsWith('host-adapter/'))).toBe(false)
    await expect(stat(path.join(appDir, 'soul.config.ts'))).resolves.toBeTruthy()
    await expect(stat(descriptorPath)).resolves.toBeTruthy()
    await expect(stat(path.join(appDir, 'soul-app.manifest.json'))).rejects.toThrow()
    await expect(stat(path.join(appDir, 'host-adapter'))).rejects.toThrow()
    const scaffoldPackageJson = JSON.parse(await readFile(path.join(appDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      scripts: Record<string, string>
    }
    const scaffoldTsconfig = JSON.parse(await readFile(path.join(appDir, 'tsconfig.json'), 'utf8')) as {
      include: string[]
    }
    const scaffoldReadme = await readFile(path.join(appDir, 'README.md'), 'utf8')
    const scaffoldSoulConfig = await readFile(path.join(appDir, 'soul.config.ts'), 'utf8')
    const scaffoldPrompt = await readFile(path.join(appDir, 'product', 'capabilities', 'default', 'prompt.md'), 'utf8')
    const scaffoldWorkspaceGitignore = await readFile(path.join(appDir, 'engine', 'workspace', '.gitignore'), 'utf8')
    const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')) as {
      capabilities: Array<{ id: string, prompt: { ref: string, type: string } }>
      engine: {
        mcp?: { targets?: Record<string, { file: string }> }
        skills?: { source: string }
        workspaceAssets?: { source: string }
      }
      identity: { appId: string, name: string, soulId: string, version: string }
      protocol: string
      workbench: { entry: string, router: { mode: string }, type: string }
    }
    expect(scaffoldPackageJson.dependencies['@zonease/aiworker-soul-app-sdk']).toBe('workspace:*')
    expect(scaffoldPackageJson.scripts.build).toBe('bun scripts/build.ts')
    expect(scaffoldPackageJson.scripts.validate).toBe('bun scripts/validate.ts')
    expect(scaffoldTsconfig.include).toEqual(['soul.config.ts', 'scripts/**/*.ts'])
    expect(scaffoldSoulConfig).toContain('defineSoul')
    expect(scaffoldSoulConfig).toContain('id: \'demo-soul-app\'')
    expect(scaffoldSoulConfig).not.toContain('host-adapter')
    expect(descriptor).toMatchObject({
      capabilities: [{
        id: 'default',
        prompt: {
          ref: 'dist/product/capabilities/default/prompt.md',
          type: 'packaged-file',
        },
      }],
      identity: {
        appId: 'demo-soul-app',
        name: 'Demo Soul App',
        soulId: 'demo-soul-app',
        version: '0.1.0',
      },
      protocol: 'soul/v1',
      workbench: {
        entry: 'dist/web/workbench/index.html',
        router: { mode: 'search' },
        type: 'micro-app',
      },
    })
    expect(descriptor.engine).toMatchObject({
      mcp: {
        targets: {
          'claude-code': { file: 'dist/engine-assets/mcp/claude-code/.mcp.json' },
          'codex': { file: 'dist/engine-assets/mcp/codex/config.toml' },
        },
      },
      skills: { source: 'dist/engine-assets/skills' },
      workspaceAssets: { source: 'dist/engine-assets/workspace' },
    })
    const serializedDescriptor = JSON.stringify(descriptor)
    expect(serializedDescriptor).not.toContain('mcpServers')
    expect(serializedDescriptor).not.toContain('Codex native MCP placeholder')
    expect(scaffoldReadme).toContain('descriptor-only')
    expect(scaffoldReadme).toContain('soul.config.ts')
    expect(scaffoldReadme).toContain('dist/soul.descriptor.json')
    expect(scaffoldReadme).not.toContain('soul-app.manifest.json')
    expect(scaffoldReadme).not.toContain('host-adapter')
    expect(scaffoldPrompt).not.toContain('broker')
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
        descriptorIssues: unknown[]
        descriptorPath: string
        sdkIssues: unknown[]
        source: string
        status: string
      }
    }
    expect(validation.validation).toMatchObject({
      appId: 'demo-soul-app',
      descriptorPath,
      source: 'directory',
      status: 'pass',
    })
    expect(validation.validation.descriptorIssues).toEqual([])
    expect(validation.validation.sdkIssues).toEqual([])
    output = ''

    expect(await runCli(argv('app', 'validate', descriptorPath))).toBe(0)
    const descriptorValidation = JSON.parse(output) as {
      validation: {
        appId: string
        descriptorIssues: unknown[]
        descriptorPath: string
        sdkIssues: unknown[]
        source: string
        status: string
      }
    }
    expect(descriptorValidation.validation).toMatchObject({
      appId: 'demo-soul-app',
      descriptorPath,
      source: 'descriptor',
      status: 'pass',
    })
    expect(descriptorValidation.validation.descriptorIssues).toEqual([])
    expect(descriptorValidation.validation.sdkIssues).toEqual([])
    output = ''

    expect(await runCli(argv('app', 'smoke', appDir))).toBe(0)
    const smoke = JSON.parse(output) as {
      smoke: {
        appId: string
        descriptorPath: string
        descriptorStatus: string
        engineAssets: string
        sdkValidation: string
        status: string
        workbench: string
      }
    }
    expect(smoke.smoke).toMatchObject({
      appId: 'demo-soul-app',
      descriptorPath,
      descriptorStatus: 'pass',
      engineAssets: 'pass',
      sdkValidation: 'valid',
      status: 'pass',
      workbench: 'pass',
    })
    expect(smoke.smoke).not.toHaveProperty('standalone')
    expect(smoke.smoke).not.toHaveProperty('mountedService')
  })

  it('fails descriptor validation on source hook paths', async () => {
    const descriptorPath = path.join(root, 'bad-soul.descriptor.json')
    await writeFile(descriptorPath, JSON.stringify({
      api: {
        entry: 'dist/../host-adapter/api.js',
        mount: '/api/apps/bad-soul',
        type: 'local-service',
      },
      capabilities: [],
      compatibility: {},
      configuration: {},
      engine: {},
      extensions: {},
      external: {},
      health: {},
      identity: {
        appId: 'bad-soul',
        name: 'Bad Soul',
        soulId: 'bad-soul',
        version: '0.1.0',
      },
      protocol: 'soul/v1',
      workbench: {
        entry: 'dist/../host-adapter/workbench.html',
        router: { mode: 'search' },
        type: 'micro-app',
      },
    }))

    expect(await runCli(argv('app', 'validate', descriptorPath))).toBe(1)
    const validation = JSON.parse(output) as {
      validation: {
        descriptorIssues: Array<{ code: string, message: string, path: string }>
        status: string
      }
    }
    expect(validation.validation.status).toBe('fail')
    expect(validation.validation.descriptorIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'invalid_descriptor',
        path: 'workbench.entry',
      }),
      expect.objectContaining({
        code: 'invalid_descriptor',
        path: 'api.entry',
      }),
    ]))
  })

  it('fails SDK Soul validation when authoring files are missing', async () => {
    const appDir = path.join(root, 'missing-sdk-soul')
    mkdirSync(appDir, { recursive: true })

    expect(await runCli(argv('app', 'validate', appDir))).toBe(1)
    const validation = JSON.parse(output) as {
      validation: {
        sdkIssues: Array<{ code: string, path: string }>
        status: string
      }
    }
    expect(validation.validation.status).toBe('fail')
    expect(validation.validation.sdkIssues.map(issue => [issue.code, issue.path])).toEqual(expect.arrayContaining([
      ['missing_config', 'soul.config.ts'],
      ['missing_capability', 'product/capabilities'],
    ]))
  })

  it('fails SDK Soul validation on invalid native MCP JSON', async () => {
    const appDir = path.join(root, 'invalid-mcp-app')

    expect(await runCli(argv('app', 'create', 'invalid-mcp-app', '--dir', appDir))).toBe(0)
    output = ''
    await writeFile(path.join(appDir, 'engine', 'mcp', 'claude-code', '.mcp.json'), '{')

    expect(await runCli(argv('app', 'validate', appDir))).toBe(1)
    const validation = JSON.parse(output) as {
      validation: {
        sdkIssues: Array<{ code: string, path: string }>
        status: string
      }
    }
    expect(validation.validation.status).toBe('fail')
    expect(validation.validation.sdkIssues).toEqual([
      expect.objectContaining({
        code: 'invalid_mcp_json',
        path: 'engine/mcp/claude-code/.mcp.json',
      }),
    ])
  })
})

describe('soulAppServiceEnv (smoke spawn env)', () => {
  it('soulAppServiceEnv allowlist strips LLM/cloud/Host-internal keys and keeps basic system env', () => {
    const cleaned = soulAppServiceEnv({ AIWORKER_LOCAL_TOKEN: 's', WORKER_DB_PATH: '/x', PATH: '/usr/bin', OPENAI_API_KEY: 'k' })
    expect(cleaned.AIWORKER_LOCAL_TOKEN).toBeUndefined()
    expect(cleaned.WORKER_DB_PATH).toBeUndefined()
    expect(cleaned.OPENAI_API_KEY).toBeUndefined()
    expect(cleaned.PATH).toBe('/usr/bin')
  })
})
