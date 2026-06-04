import type { DaemonStartedResult, LocalPaths } from './aiworker'

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import {
  appendSessionEvent,
  closeWorkerDb,
  createEngineInvocation,
  createSession,
  createWorkspace,
  engineInvocations,
  getEngineInvocation,
  getWorkerDb,
  initWorkerDb,
  listSessionEvents,
  listWorkers,
  runWorkerMigrations,
  upsertWorker,
} from '@zonease/aiworker-storage-sqlite/worker'
import { soulAppServiceEnv } from '@zonease/aiworker-worker-runtime'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  __setDaemonStarterForTest,
  downloadAndReplaceGitHubBundle,
  inspectCliOfficialAppsResource,
  prepareDaemonForeground,
  preprocessArgv,
  resolveCliDefaultHomeDir,
  resolveCliLocalPaths,
  resolveCliMigrationsFolder,
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
    __setDaemonStarterForTest(null)
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
    return ['/usr/bin/bun', '/repo/apps/worker-cli/src/aiworker.ts', ...args]
  }

  const FREEFORM_APP_ID = 'aiworker-freeform'

  function daemonStartedFixture(opts: { host?: string, port?: number }, paths: LocalPaths, pid: number): DaemonStartedResult {
    const host = opts.host ?? '127.0.0.1'
    const port = opts.port ?? 9217
    return {
      host,
      logFile: paths.logFile,
      pid,
      port,
      started: true,
      url: `http://${host}:${port}`,
    }
  }

  function installFakeDaemonStarter(pid: number): Array<{ host?: string, port?: number }> {
    const started: Array<{ host?: string, port?: number }> = []
    __setDaemonStarterForTest(async (opts, paths) => {
      started.push(opts)
      return daemonStartedFixture(opts, paths, pid)
    })
    return started
  }

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
      appId: 'hr',
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
      title: 'Legacy candidate screen',
      metadataJson: { soulName: 'HR' },
      at: '2026-05-13T13:04:02.000Z',
    })
    closeWorkerDb()
  }

  async function writeFakeBundle(bundleDir: string, marker: string, options: { descriptorText?: string, includeMigrationJournal?: boolean, includeOfficialApp?: boolean } = {}): Promise<void> {
    const includeMigrationJournal = options.includeMigrationJournal ?? true
    const includeOfficialApp = options.includeOfficialApp ?? true
    mkdirSync(path.join(bundleDir, 'web', 'worker'), { recursive: true })
    mkdirSync(path.join(bundleDir, 'drizzle', 'worker', 'meta'), { recursive: true })
    if (includeOfficialApp)
      mkdirSync(path.join(bundleDir, 'official-apps', FREEFORM_APP_ID, 'dist'), { recursive: true })
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
    if (includeMigrationJournal)
      await writeFile(path.join(bundleDir, 'drizzle', 'worker', 'meta', '_journal.json'), '{"entries":[]}\n')
    if (includeOfficialApp)
      await writeFile(path.join(bundleDir, 'official-apps', FREEFORM_APP_ID, 'dist', 'soul.descriptor.json'), options.descriptorText ?? await readFile(freeformDescriptorPath(), 'utf8'))
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
    expect(preprocessArgv(argv('worker', 'config', 'set', 'worker-1', 'engine-selection')).slice(2, 3)).toEqual(['worker config set'])
    expect(preprocessArgv(argv('workspace', 'projection', 'refresh', 'workspace-1')).slice(2, 3)).toEqual(['workspace projection refresh'])
    expect(preprocessArgv(argv('daemon', 'restart')).slice(2, 3)).toEqual(['daemon restart'])
  })

  it('shows a compact operator command index by default and full index on request', async () => {
    expect(await runCli(argv('commands'))).toBe(0)

    expect(output).toContain('aiworker operator commands')
    expect(output).toContain('daemon start|stop|restart|status|logs')
    expect(output).toContain('app list|show|install|enable|archive|delete|bootstrap')
    expect(output).toContain('worker create|list|select|config|archive|delete')
    expect(output).not.toContain('dev')
    expect(output).not.toContain('app create|validate|smoke')

    output = ''
    expect(await runCli(argv('commands', '--all'))).toBe(0)

    expect(output).toContain('aiworker command index')
    expect(output).not.toContain('dev')
    expect(output).toContain('daemon start|foreground|status|stop|restart|logs|check')
    expect(output).toContain('app list|show|install|enable|archive|delete|doctor|permissions|bootstrap|create|validate|smoke')
    expect(output).toContain('soul list|create|build')
    expect(output).toContain('worker create|list|show|select|config list|config set|config archive|archive|delete')
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

  it('resolves source-checkout Worker Web static from the worker-web app build', async () => {
    const moduleDir = path.join(root, 'apps', 'worker-cli', 'src')
    const workerWebRoot = path.join(root, 'apps', 'worker-web', 'dist', 'worker')
    mkdirSync(moduleDir, { recursive: true })
    mkdirSync(workerWebRoot, { recursive: true })
    await writeFile(path.join(workerWebRoot, 'index.html'), '<!doctype html>')

    expect(resolveCliWorkerWebStaticDir(moduleDir)).toBe(workerWebRoot)
  })

  it('resolves standalone bundle resources next to the executable', async () => {
    const moduleDir = path.join(root, 'bunfs', 'apps', 'worker-cli', 'src')
    const executableDir = path.join(root, 'aiworker-darwin-arm64')
    const officialAppsRoot = path.join(executableDir, 'official-apps')
    const workerWebRoot = path.join(executableDir, 'web', 'worker')
    const migrationsRoot = path.join(executableDir, 'drizzle', 'worker')
    mkdirSync(path.join(officialAppsRoot, FREEFORM_APP_ID, 'dist'), { recursive: true })
    mkdirSync(workerWebRoot, { recursive: true })
    mkdirSync(path.join(migrationsRoot, 'meta'), { recursive: true })
    await writeFile(path.join(officialAppsRoot, FREEFORM_APP_ID, 'dist', 'soul.descriptor.json'), '{}')
    await writeFile(path.join(workerWebRoot, 'index.html'), '<!doctype html>')
    await writeFile(path.join(migrationsRoot, 'meta', '_journal.json'), '{"entries":[]}')

    const options = { executableDir }
    expect(resolveCliOfficialAppsRoot(moduleDir, options)).toBe(officialAppsRoot)
    expect(resolveCliWorkerWebStaticDir(moduleDir, options)).toBe(workerWebRoot)
    expect(resolveCliMigrationsFolder(moduleDir, options)).toBe(migrationsRoot)
    expect(resolveCliDefaultHomeDir(moduleDir, options)).toBe('.aiworker')
  })

  it('defaults source-checkout local paths to ~/.aiworker-dev when no home env exists', () => {
    delete process.env.AIWORKER_HOME
    delete process.env.WORKER_DB_PATH
    process.env.HOME = root

    const moduleDir = path.join(root, 'repo', 'apps', 'worker-cli', 'src')
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
    mkdirSync(path.join(moduleDir, 'official-apps', FREEFORM_APP_ID, 'dist'), { recursive: true })
    writeFileSync(path.join(moduleDir, 'official-apps', FREEFORM_APP_ID, 'dist', 'soul.descriptor.json'), '{}')
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

    const moduleDir = path.join(root, 'repo', 'apps', 'worker-cli', 'src')
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
    const body = JSON.parse(output) as { dbPath: string, home: string, workers: Array<{ appId: string }>, workersRoot: string }

    expect(body.home).toBe(path.join(root, 'home'))
    expect(body.dbPath).toBe(path.join(root, 'home', 'aiworker.db'))
    expect(body.workersRoot).toBe(path.join(root, 'home', 'workers'))
    expect(body.workers).toEqual([])
    await expect(stat(path.join(root, '.aiworker'))).rejects.toThrow()
  })

  it('creates workspace/session command records with a mocked engine', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'freeform-worker', '--name', 'Freeform Worker', '--app', FREEFORM_APP_ID))).toBe(0)
    expect((JSON.parse(output) as { worker: { id: string, appId: string } }).worker).toMatchObject({ id: 'freeform-worker', appId: FREEFORM_APP_ID })
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
    expect(output).toContain('worker create|list|select|config|archive|delete')
    expect(output).toContain('workspace create|list|projection refresh|archive|delete')
    expect(output).toContain('session start|invoke|events|reconcile|cancel|list|show|archive|delete')
    expect(output).not.toContain('run start')
  })

  it('resolves the single active worker for standalone commands when --worker and selected-worker are absent', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'solo-worker', '--name', 'Solo Worker', '--app', FREEFORM_APP_ID))).toBe(0)
    output = ''

    // Standalone single-daemon path: no `worker select`, no `--worker` flag.
    // A daemon hosts at most one active Worker, so omitting workerId resolves to it.
    expect(await runCli(argv('workspace', 'create', '--name', 'Scratch', '--type', 'freeform'))).toBe(0)
    expect((JSON.parse(output) as { workspace: { type: string, workerId: string } }).workspace)
      .toMatchObject({ type: 'freeform', workerId: 'solo-worker' })
  })

  it('errors clearly when no active worker exists and --worker is omitted', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    output = ''
    errorOutput = ''

    // Zero active workers: the standalone path cannot guess a worker.
    expect(await runCli(argv('workspace', 'create', '--name', 'Scratch', '--type', 'freeform'))).toBe(1)
    expect(errorOutput).toContain('no active worker')
  })

  it('refuses to guess a worker when the DB holds more than one active worker', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'active-a', '--name', 'A', '--app', FREEFORM_APP_ID))).toBe(0)
    output = ''

    // Inject a second active worker directly to simulate a dirty multi-active DB
    // (mirrors the daemon bootstrap fail-fast guard). The standalone resolver must
    // refuse to silently pick one instead of erroring loudly.
    closeWorkerDb()
    initWorkerDb(process.env.WORKER_DB_PATH!)
    upsertWorker({ id: 'active-b', appId: FREEFORM_APP_ID, name: 'B', status: 'active' })
    closeWorkerDb()
    errorOutput = ''

    expect(await runCli(argv('workspace', 'create', '--name', 'Scratch', '--type', 'freeform'))).toBe(1)
    expect(errorOutput).toContain('more than one active worker')
  })

  it('aiworker start idempotently ensures a single Freeform worker, reuses a running daemon, and stays headless-safe', async () => {
    // Pre-seed a "running" daemon by pointing the pid file at this test process so
    // `start` takes the reuse branch and never spawns a real detached daemon.
    const home = path.join(root, 'home')
    mkdirSync(home, { recursive: true })
    await writeFile(path.join(home, 'aiworker-daemon.pid'), String(process.pid))

    // First start: installs the bundled Freeform Soul, creates the single worker,
    // reuses the running daemon, and skips the browser open under --no-open.
    expect(await runCli(argv('start', '--no-open'))).toBe(0)
    const first = JSON.parse(output) as {
      daemon: { started: boolean }
      opened: boolean
      url: null | string
      worker: { appId: string, created: boolean, id: string }
    }
    expect(first.worker).toMatchObject({ appId: FREEFORM_APP_ID, created: true })
    expect(first.daemon.started).toBe(false)
    expect(first.opened).toBe(false)
    expect(first.url).toBeNull()
    output = ''

    // Second start: idempotent — reuses the existing worker (created=false) and
    // does not throw WORKER_ALREADY_ACTIVE or "daemon already running".
    expect(await runCli(argv('start', '--no-open'))).toBe(0)
    const second = JSON.parse(output) as { worker: { created: boolean, id: string } }
    expect(second.worker.created).toBe(false)
    expect(second.worker.id).toBe(first.worker.id)

    // Exactly one active worker persists across idempotent starts.
    initWorkerDb(process.env.WORKER_DB_PATH!)
    expect(listWorkers().filter(worker => worker.status === 'active').map(worker => worker.id)).toEqual([first.worker.id])
    closeWorkerDb()
  })

  it('bare aiworker (no subcommand) runs the zero-config start entry', async () => {
    const home = path.join(root, 'home')
    mkdirSync(home, { recursive: true })
    await writeFile(path.join(home, 'aiworker-daemon.pid'), String(process.pid))

    // No command token at all: this must be rewritten to `start` (not an unknown
    // command error and not top-level help). `--no-open` still flows through.
    expect(await runCli(argv('--no-open'))).toBe(0)
    const result = JSON.parse(output) as { opened: boolean, worker: { appId: string, created: boolean } }
    expect(result.worker).toMatchObject({ appId: FREEFORM_APP_ID, created: true })
    expect(result.opened).toBe(false)
  })

  it('aiworker start --no-open suppresses the browser open even when stdout is a TTY', async () => {
    const home = path.join(root, 'home')
    mkdirSync(home, { recursive: true })
    await writeFile(path.join(home, 'aiworker-daemon.pid'), String(process.pid))

    // Force the interactive branch so the only thing keeping the browser closed is
    // the explicit `--no-open` flag (not the non-TTY/CI headless guard).
    const originalIsTty = process.stdout.isTTY
    process.stdout.isTTY = true
    const originalCi = process.env.CI
    delete process.env.CI
    try {
      expect(await runCli(argv('start', '--no-open'))).toBe(0)
      const result = JSON.parse(output) as { opened: boolean }
      expect(result.opened).toBe(false)
    }
    finally {
      process.stdout.isTTY = originalIsTty
      if (originalCi === undefined)
        delete process.env.CI
      else
        process.env.CI = originalCi
    }
  })

  it('aiworker daemon start runs unified bootstrap and fake-starts a non-running daemon without opening Workbench', async () => {
    const started = installFakeDaemonStarter(4242)

    expect(await runCli(argv('daemon', 'start', '--host', '127.0.0.1', '--port', '43123'))).toBe(0)

    const result = JSON.parse(output) as {
      daemon: { host: string, pid: number, port: number, started: boolean, url: string }
      opened?: boolean
      worker: { appId: string, created: boolean, id: string }
    }
    expect(started).toEqual([{ host: '127.0.0.1', port: 43123 }])
    expect(result.daemon).toMatchObject({
      host: '127.0.0.1',
      pid: 4242,
      port: 43123,
      started: true,
      url: 'http://127.0.0.1:43123',
    })
    expect(result.opened).toBeUndefined()
    expect(result.worker).toMatchObject({ appId: FREEFORM_APP_ID, created: true })

    initWorkerDb(process.env.WORKER_DB_PATH!)
    expect(listWorkers().filter(worker => worker.status === 'active').map(worker => worker.appId)).toEqual([FREEFORM_APP_ID])
    closeWorkerDb()
  })

  it('aiworker daemon restart runs unified bootstrap before fake-starting the service', async () => {
    const started = installFakeDaemonStarter(4343)

    expect(await runCli(argv('daemon', 'restart', '--host', '127.0.0.1', '--port', '43125'))).toBe(0)

    const result = JSON.parse(output) as {
      opened?: boolean
      restarted: boolean
      started: { host: string, pid: number, port: number, started: boolean, url: string }
      stopped: { running: boolean, stopped: boolean }
      worker: { appId: string, created: boolean }
    }
    expect(started).toEqual([{ host: '127.0.0.1', port: 43125 }])
    expect(result.restarted).toBe(false)
    expect(result.stopped).toMatchObject({ running: false, stopped: false })
    expect(result.started).toMatchObject({
      host: '127.0.0.1',
      pid: 4343,
      port: 43125,
      started: true,
      url: 'http://127.0.0.1:43125',
    })
    expect(result.opened).toBeUndefined()
    expect(result.worker).toMatchObject({ appId: FREEFORM_APP_ID, created: true })
  })

  it('aiworker daemon start reuses an already-running daemon and worker without spawning', async () => {
    const home = path.join(root, 'home')
    mkdirSync(home, { recursive: true })
    await writeFile(path.join(home, 'aiworker-daemon.pid'), String(process.pid))
    const started = installFakeDaemonStarter(1)

    expect(await runCli(argv('daemon', 'start'))).toBe(0)

    const result = JSON.parse(output) as {
      daemon: { pid: number, started: boolean, url: null | string }
      worker: { appId: string, created: boolean, id: string }
    }
    expect(started).toEqual([])
    expect(result.daemon).toMatchObject({ pid: process.pid, started: false, url: null })
    expect(result.worker).toMatchObject({ appId: FREEFORM_APP_ID, created: true })

    output = ''
    expect(await runCli(argv('daemon', 'start'))).toBe(0)
    const second = JSON.parse(output) as { daemon: { started: boolean }, worker: { created: boolean, id: string } }
    expect(second.daemon.started).toBe(false)
    expect(second.worker.created).toBe(false)
    expect(second.worker.id).toBe(result.worker.id)
  })

  it('aiworker daemon start reuse does not pretend requested host and port were applied', async () => {
    const home = path.join(root, 'home')
    mkdirSync(home, { recursive: true })
    await writeFile(path.join(home, 'aiworker-daemon.pid'), String(process.pid))
    await writeFile(path.join(home, 'aiworker-daemon.json'), `${JSON.stringify({
      host: '127.0.0.1',
      pid: process.pid,
      port: 41234,
      startedAt: '2026-06-03T00:00:00.000Z',
      url: 'http://127.0.0.1:41234',
    })}\n`)

    expect(await runCli(argv('daemon', 'start', '--host', '127.0.0.2', '--port', '49999'))).toBe(0)

    const result = JSON.parse(output) as {
      daemon: {
        actual: { host: string, port: number, url: string }
        requested: { host: string, port: number }
        started: boolean
        url: string
      }
      worker: { appId: string }
    }
    expect(result.daemon.started).toBe(false)
    expect(result.daemon.url).toBe('http://127.0.0.1:41234')
    expect(result.daemon.actual).toEqual({ host: '127.0.0.1', port: 41234, url: 'http://127.0.0.1:41234' })
    expect(result.daemon.requested).toEqual({ host: '127.0.0.2', port: 49999 })
    expect(result.daemon.url).not.toBe('http://127.0.0.2:49999')
    expect(result.worker.appId).toBe(FREEFORM_APP_ID)
  })

  it('aiworker daemon start ignores stale daemon metadata from a different pid', async () => {
    const home = path.join(root, 'home')
    mkdirSync(home, { recursive: true })
    await writeFile(path.join(home, 'aiworker-daemon.pid'), String(process.pid))
    await writeFile(path.join(home, 'aiworker-daemon.json'), `${JSON.stringify({
      host: '127.0.0.1',
      pid: process.pid + 1,
      port: 41234,
      startedAt: '2026-06-03T00:00:00.000Z',
      url: 'http://127.0.0.1:41234',
    })}\n`)

    expect(await runCli(argv('daemon', 'start', '--host', '127.0.0.2', '--port', '49999'))).toBe(0)

    const result = JSON.parse(output) as {
      daemon: {
        actual: { host?: string, port?: number, url: null | string }
        message: string
        requested: { host: string, port: number }
        started: boolean
        url: null | string
      }
    }
    expect(result.daemon.started).toBe(false)
    expect(result.daemon.url).toBeNull()
    expect(result.daemon.actual).toEqual({ url: null })
    expect(result.daemon.requested).toEqual({ host: '127.0.0.2', port: 49999 })
    expect(result.daemon.message).toContain('metadata pid mismatch')
    expect(result.daemon.message).toContain('actual URL unknown')
  })

  it('daemon foreground prepare seam runs unified bootstrap without opening a browser or serving forever', async () => {
    const prepared = await prepareDaemonForeground({ host: '127.0.0.1', port: 43124 })

    expect(prepared.opts).toEqual({ host: '127.0.0.1', port: 43124 })
    expect(prepared.worker).toMatchObject({ appId: FREEFORM_APP_ID, created: true })

    initWorkerDb(process.env.WORKER_DB_PATH!)
    expect(listWorkers().filter(worker => worker.status === 'active').map(worker => worker.appId)).toEqual([FREEFORM_APP_ID])
    closeWorkerDb()
  })

  it('service-start commands fail fast instead of guessing when multiple active workers exist', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'active-a', '--name', 'A', '--app', FREEFORM_APP_ID))).toBe(0)
    closeWorkerDb()
    initWorkerDb(process.env.WORKER_DB_PATH!)
    upsertWorker({ id: 'active-b', appId: FREEFORM_APP_ID, name: 'B', status: 'active' })
    closeWorkerDb()

    const started = installFakeDaemonStarter(1)

    for (const args of [
      ['start', '--no-open'],
      ['daemon', 'start'],
      ['daemon', 'restart'],
    ]) {
      errorOutput = ''
      output = ''
      expect(await runCli(argv(...args))).toBe(1)
      expect(errorOutput).toContain('more than one active worker')
    }

    expect(started).toEqual([])
    await expect(prepareDaemonForeground()).rejects.toThrow('more than one active worker')
  })

  it('streams session events for an active running engine invocation through CLI with after/limit paging', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'events-worker', '--name', 'Events Worker', '--app', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'select', 'events-worker'))).toBe(0)
    output = ''

    expect(await runCli(argv('workspace', 'create', '--name', 'Events Workspace', '--type', 'freeform', '--worker', 'events-worker'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string } }).workspace
    output = ''

    closeWorkerDb()
    initWorkerDb(process.env.WORKER_DB_PATH!)
    const session = createSession({
      id: 'events-session-1',
      metadataJson: {},
      title: 'Stream events while running',
      workerId: 'events-worker',
      workspaceId: workspace.id,
      at: '2026-05-28T00:00:00.000Z',
    })
    const invocation = createEngineInvocation({
      engineCommand: 'codex',
      engineId: 'codex',
      id: 'events-running-invocation-1',
      inputRef: `aiworker://sessions/${session.id}/invocations/events-running-invocation-1/input`,
      processState: 'spawned',
      seq: 1,
      sessionId: session.id,
      status: 'running',
    })
    for (let seq = 1; seq <= 3; seq++) {
      appendSessionEvent({
        invocationId: invocation.id,
        payloadJson: {
          bridgeEvent: 'invocation.progress',
          data: { step: `step-${seq}` },
        },
        seq,
        sessionId: session.id,
        type: 'status',
        at: `2026-05-28T00:00:0${seq}.000Z`,
      })
    }
    const persistedEvents = listSessionEvents(session.id).filter(event => event.invocationId === invocation.id)
    expect(persistedEvents).toHaveLength(3)
    const ids = persistedEvents.map(event => event.id)
    closeWorkerDb()

    expect(await runCli(argv('session', 'events', invocation.id))).toBe(0)
    const all = JSON.parse(output) as {
      events: Array<{ id: number, invocationId: string, payloadJson: Record<string, unknown>, sessionId: string, type: string }>
      invocation: { id: string, processState: string, sessionId: string, status: string }
    }
    expect(all.invocation).toEqual({
      id: invocation.id,
      processState: 'spawned',
      sessionId: session.id,
      status: 'running',
    })
    expect(all.events.map(event => event.id)).toEqual(ids)
    expect(all.events.every(event => event.invocationId === invocation.id && event.sessionId === session.id)).toBe(true)
    output = ''

    expect(await runCli(argv('session', 'events', invocation.id, '--limit', '2'))).toBe(0)
    const limited = JSON.parse(output) as { events: Array<{ id: number }> }
    expect(limited.events.map(event => event.id)).toEqual(ids.slice(0, 2))
    output = ''

    expect(await runCli(argv('session', 'events', invocation.id, '--after', String(ids[0])))).toBe(0)
    const afterFirst = JSON.parse(output) as { events: Array<{ id: number }> }
    expect(afterFirst.events.map(event => event.id)).toEqual(ids.slice(1))
  })

  it('reconciles an active running engine invocation as lost through CLI without changing session lifecycle', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'reconcile-worker', '--name', 'Reconcile Worker', '--app', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'select', 'reconcile-worker'))).toBe(0)
    output = ''

    expect(await runCli(argv('workspace', 'create', '--name', 'Reconcile Workspace', '--type', 'freeform', '--worker', 'reconcile-worker'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string } }).workspace
    output = ''

    closeWorkerDb()
    initWorkerDb(process.env.WORKER_DB_PATH!)
    const session = createSession({
      id: 'reconcile-session-1',
      metadataJson: {},
      title: 'Reconcile running invocation',
      workerId: 'reconcile-worker',
      workspaceId: workspace.id,
      at: '2026-05-28T00:00:00.000Z',
    })
    const invocation = createEngineInvocation({
      engineCommand: 'codex',
      engineId: 'codex',
      id: 'reconcile-running-invocation-1',
      inputRef: `aiworker://sessions/${session.id}/invocations/reconcile-running-invocation-1/input`,
      processState: 'spawned',
      seq: 1,
      sessionId: session.id,
      status: 'running',
    })
    closeWorkerDb()

    expect(await runCli(argv(
      'session',
      'reconcile',
      invocation.id,
      '--state',
      'lost',
      '--diagnostic',
      'native process vanished token=sk-cli-active-reconcile-secret',
    ))).toBe(0)

    const reconciled = JSON.parse(output) as {
      invocation: { failureCode: string | null, id: string, processState: string, sessionId: string, status: string, summary: string | null }
      session: { id: string, status: string }
    }
    expect(reconciled.invocation).toMatchObject({
      id: invocation.id,
      processState: 'lost',
      sessionId: session.id,
      status: 'lost',
      summary: 'Native engine process was lost.',
    })
    expect(reconciled.session).toMatchObject({ id: session.id, status: 'active' })
    expect(output).not.toContain('sk-cli-active-reconcile-secret')

    initWorkerDb(process.env.WORKER_DB_PATH!)
    const persisted = getEngineInvocation(invocation.id)
    expect(persisted).toMatchObject({ status: 'lost', processState: 'lost' })
    const events = listSessionEvents(session.id).filter(event => event.invocationId === invocation.id)
    expect(events.length).toBeGreaterThan(0)
    expect(JSON.stringify(events)).not.toContain('sk-cli-active-reconcile-secret')
    closeWorkerDb()
  })

  it('cancels an active running engine invocation through CLI by invocation id', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'cancel-worker', '--name', 'Cancel Worker', '--app', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'select', 'cancel-worker'))).toBe(0)
    output = ''

    expect(await runCli(argv('workspace', 'create', '--name', 'Cancel Workspace', '--type', 'freeform', '--worker', 'cancel-worker'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string } }).workspace
    output = ''

    closeWorkerDb()
    initWorkerDb(process.env.WORKER_DB_PATH!)
    const session = createSession({
      id: 'cancel-session-1',
      metadataJson: {},
      title: 'Cancel running invocation',
      workerId: 'cancel-worker',
      workspaceId: workspace.id,
      at: '2026-05-28T00:00:00.000Z',
    })
    const invocation = createEngineInvocation({
      engineCommand: 'codex',
      engineId: 'codex',
      id: 'cancel-running-invocation-1',
      inputRef: `aiworker://sessions/${session.id}/invocations/cancel-running-invocation-1/input`,
      processState: 'spawned',
      seq: 1,
      sessionId: session.id,
      status: 'running',
    })
    closeWorkerDb()

    expect(await runCli(argv('session', 'cancel', invocation.id, '--reason', 'operator pressed Ctrl+C token=sk-cli-active-cancel-secret'))).toBe(0)

    const cancelled = JSON.parse(output) as {
      invocation: { id: string, processState: string, sessionId: string, status: string, summary: string | null }
      session: { id: string, status: string }
    }
    expect(cancelled.invocation).toMatchObject({
      id: invocation.id,
      processState: 'killed',
      sessionId: session.id,
      status: 'cancelled',
      summary: 'Invocation cancelled.',
    })
    expect(cancelled.session).toMatchObject({ id: session.id, status: 'active' })
    expect(output).not.toContain('sk-cli-active-cancel-secret')

    initWorkerDb(process.env.WORKER_DB_PATH!)
    const persisted = getEngineInvocation(invocation.id)
    expect(persisted).toMatchObject({ status: 'cancelled', processState: 'killed' })
    const events = listSessionEvents(session.id).filter(event => event.invocationId === invocation.id)
    expect(events.at(-1)?.payloadJson).toMatchObject({
      bridgeEvent: 'invocation.cancelled',
      invocationId: invocation.id,
      processState: 'killed',
      status: 'cancelled',
    })
    closeWorkerDb()
  })

  it('archives worker config envelopes through CLI commands', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'config-worker', '--name', 'Config Worker', '--app', FREEFORM_APP_ID))).toBe(0)
    output = ''

    expect(await runCli(argv(
      'worker',
      'config',
      'set',
      'config-worker',
      'engine-selection',
      '--kind',
      'engine-selection',
      '--target',
      'codex',
      '--source-ref',
      'descriptor://configuration/default-engine',
      '--options-json',
      '{"profileRef":"secretref:codex/default-profile"}',
    ))).toBe(0)
    expect((JSON.parse(output) as { config: { value: { updatedBy: string } } }).config.value.updatedBy).toBe('cli')
    output = ''

    expect(await runCli(argv('worker', 'config', 'archive', 'config-worker', 'engine-selection'))).toBe(0)
    expect(JSON.parse(output)).toMatchObject({
      config: {
        archived: true,
        configKey: 'engine-selection',
        value: null,
        workerId: 'config-worker',
      },
    })
    output = ''

    expect(await runCli(argv('worker', 'config', 'list', 'config-worker'))).toBe(0)
    expect((JSON.parse(output) as { config: { values: unknown[] } }).config.values).toEqual([])
  })

  it('rejects literal secrets in worker config envelopes through CLI commands', async () => {
    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'secret-config-worker', '--name', 'Secret Config Worker', '--app', FREEFORM_APP_ID))).toBe(0)
    output = ''
    errorOutput = ''

    expect(await runCli(argv(
      'worker',
      'config',
      'set',
      'secret-config-worker',
      'mcp-overlay',
      '--kind',
      'mcp-overlay',
      '--target',
      'codex',
      '--options-json',
      '{"apiKey":"sk-cli-worker-config-secret"}',
    ))).toBe(1)
    expect(errorOutput).toContain('Literal secrets are not allowed in Worker metadata')
    expect(errorOutput).not.toContain('sk-cli-worker-config-secret')

    output = ''
    expect(await runCli(argv('worker', 'config', 'list', 'secret-config-worker'))).toBe(0)
    expect((JSON.parse(output) as { config: { values: unknown[] } }).config.values).toEqual([])
  })

  it('archives and deletes Host lifecycle records through CLI commands', async () => {
    await writeFakeCodexCommand()

    expect(await runCli(argv('app', 'install', freeformDescriptorPath()))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'lifecycle-worker', '--name', 'Lifecycle Worker', '--app', FREEFORM_APP_ID))).toBe(0)
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
    expect(await runCli(argv('worker', 'show', 'lifecycle-worker'))).toBe(0)
    expect((JSON.parse(output) as { worker: { id: string, status: string } }).worker).toMatchObject({
      id: 'lifecycle-worker',
      status: 'archived',
    })
    output = ''
    expect(await runCli(argv('worker', 'list'))).toBe(0)
    expect((JSON.parse(output) as { workers: Array<{ id: string, status: string }> }).workers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'lifecycle-worker',
          status: 'archived',
        }),
      ]),
    )
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

  it('rejects CLI workspace hard delete when its projection receipt schema is invalid', async () => {
    expect(await runCli(argv('app', 'install', freeformDescriptorPath()))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'cli-delete-workspace-worker', '--name', 'CLI Delete Workspace Worker', '--app', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'CLI Delete Workspace', '--type', 'freeform', '--worker', 'cli-delete-workspace-worker'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string, rootPath: string } }).workspace
    const receiptPath = path.join(workspace.rootPath, '.aiworker', 'projections.json')
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>
    const { freshnessMarker: _freshnessMarker, ...legacyReceipt } = receipt
    await writeFile(receiptPath, `${JSON.stringify({ ...legacyReceipt, secret: 'sk-cli-workspace-delete-receipt' }, null, 2)}\n`)
    output = ''
    errorOutput = ''

    expect(await runCli(argv('workspace', 'delete', workspace.id))).toBe(1)

    expect(errorOutput).toContain('PROJECTION_RECEIPT_STALE')
    expect(errorOutput).not.toContain('sk-cli-workspace-delete-receipt')
    expect(errorOutput).not.toContain('freshnessMarker')
    errorOutput = ''
    expect(await runCli(argv('workspace', 'show', workspace.id))).toBe(0)
    expect((JSON.parse(output) as { workspace: { id: string } }).workspace.id).toBe(workspace.id)
  })

  it('rejects CLI worker hard delete when a workspace projection receipt schema is invalid', async () => {
    expect(await runCli(argv('app', 'install', freeformDescriptorPath()))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'cli-delete-worker-invalid-receipt', '--name', 'CLI Delete Worker', '--app', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'CLI Delete Worker Workspace', '--type', 'freeform', '--worker', 'cli-delete-worker-invalid-receipt'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string, rootPath: string } }).workspace
    const receiptPath = path.join(workspace.rootPath, '.aiworker', 'projections.json')
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>
    const { freshnessMarker: _freshnessMarker, ...legacyReceipt } = receipt
    await writeFile(receiptPath, `${JSON.stringify({ ...legacyReceipt, secret: 'sk-cli-worker-delete-receipt' }, null, 2)}\n`)
    output = ''
    errorOutput = ''

    expect(await runCli(argv('worker', 'delete', 'cli-delete-worker-invalid-receipt'))).toBe(1)

    expect(errorOutput).toContain('PROJECTION_RECEIPT_STALE')
    expect(errorOutput).not.toContain('sk-cli-worker-delete-receipt')
    expect(errorOutput).not.toContain('freshnessMarker')
    errorOutput = ''
    expect(await runCli(argv('worker', 'show', 'cli-delete-worker-invalid-receipt'))).toBe(0)
    expect((JSON.parse(output) as { worker: { id: string } }).worker.id).toBe('cli-delete-worker-invalid-receipt')
    output = ''
    expect(await runCli(argv('workspace', 'show', workspace.id))).toBe(0)
    expect((JSON.parse(output) as { workspace: { id: string } }).workspace.id).toBe(workspace.id)
  })

  it('refreshes a workspace projection through CLI after a stale receipt blocks cleanup', async () => {
    expect(await runCli(argv('app', 'install', freeformDescriptorPath()))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'cli-refresh-worker', '--name', 'CLI Refresh Worker', '--app', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'CLI Refresh Workspace', '--type', 'freeform', '--worker', 'cli-refresh-worker'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string, rootPath: string } }).workspace
    const receiptPath = path.join(workspace.rootPath, '.aiworker', 'projections.json')
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>
    const { freshnessMarker: _freshnessMarker, ...legacyReceipt } = receipt
    await writeFile(receiptPath, `${JSON.stringify({ ...legacyReceipt, secret: 'sk-cli-refresh-stale-receipt' }, null, 2)}\n`)
    output = ''
    errorOutput = ''

    expect(await runCli(argv('workspace', 'delete', workspace.id))).toBe(1)
    expect(errorOutput).toContain('PROJECTION_RECEIPT_STALE')
    expect(errorOutput).not.toContain('sk-cli-refresh-stale-receipt')
    output = ''
    errorOutput = ''

    expect(await runCli(argv('workspace', 'projection', 'refresh', workspace.id, '--target', 'codex'))).toBe(0)
    const refreshed = JSON.parse(output) as { projection: { receipt: Record<string, unknown>, workspace: { id: string } }, target: string }
    expect(refreshed).toMatchObject({
      projection: {
        workspace: { id: workspace.id },
      },
      target: 'codex',
    })
    expect(output).not.toContain('sk-cli-refresh-stale-receipt')
    const refreshedReceipt = await readFile(receiptPath, 'utf8')
    expect(refreshedReceipt).toContain('freshnessMarker')
    expect(refreshedReceipt).not.toContain('sk-cli-refresh-stale-receipt')
    output = ''

    expect(await runCli(argv('workspace', 'delete', workspace.id))).toBe(0)
    expect((JSON.parse(output) as { deleted: boolean, workspace: { id: string } })).toMatchObject({ deleted: true, workspace: { id: workspace.id } })
  })

  it('blocks CLI session work for existing workers when the Soul App is archived', async () => {
    await writeFakeCodexCommand()

    expect(await runCli(argv('app', 'install', freeformDescriptorPath()))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'archive-app-cli-worker', '--name', 'Archive App CLI Worker', '--app', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'Archive App CLI Workspace', '--type', 'freeform', '--worker', 'archive-app-cli-worker'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string } }).workspace
    output = ''

    expect(await runCli(argv(
      'session',
      'start',
      '--worker',
      'archive-app-cli-worker',
      '--workspace',
      workspace.id,
      '--title',
      'Archive app session',
      '--input',
      'Create session before app archive.',
    ))).toBe(0)
    const session = (JSON.parse(output) as { session: { id: string } }).session
    output = ''

    expect(await runCli(argv('app', 'archive', FREEFORM_APP_ID))).toBe(0)
    output = ''
    errorOutput = ''

    expect(await runCli(argv('workspace', 'create', '--name', 'Blocked after app archive', '--type', 'freeform', '--worker', 'archive-app-cli-worker'))).toBe(1)
    expect(errorOutput).toContain(`Soul App is not enabled: ${FREEFORM_APP_ID}`)
    errorOutput = ''

    expect(await runCli(argv(
      'session',
      'start',
      '--worker',
      'archive-app-cli-worker',
      '--workspace',
      workspace.id,
      '--title',
      'Blocked by app archive',
      '--input',
      'Should not create new work.',
    ))).toBe(1)
    expect(errorOutput).toContain(`Soul App is not enabled: ${FREEFORM_APP_ID}`)
    errorOutput = ''

    const invokeExitCode = await runCli(argv('session', 'invoke', '--session', session.id, '--input', 'Should not follow up.'))
    expect(invokeExitCode).toBe(1)
    expect(errorOutput).toContain(`Soul App is not enabled: ${FREEFORM_APP_ID}`)
  })

  it('materializes app-authored engine assets for the first session invocation', async () => {
    await writeFakeCodexCommand()

    expect(await runCli(argv('app', 'install', freeformDescriptorPath()))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', FREEFORM_APP_ID))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'demo-worker', '--name', 'Demo Worker', '--app', FREEFORM_APP_ID))).toBe(0)
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
      appId: FREEFORM_APP_ID,
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
      appId: FREEFORM_APP_ID,
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
    expect(await runCli(argv('worker', 'create', '--id', 'demo-worker', '--name', 'Demo Worker', '--app', FREEFORM_APP_ID))).toBe(0)
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
    expect(await runCli(argv('worker', 'create', '--id', 'claude-worker', '--name', 'Claude Worker', '--app', FREEFORM_APP_ID))).toBe(0)
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
    expect(await runCli(argv('worker', 'create', '--id', 'frozen-worker', '--name', 'Frozen Worker', '--app', FREEFORM_APP_ID))).toBe(0)
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
    expect(await runCli(argv('worker', 'create', '--id', 'legacy-engine-worker', '--name', 'Legacy Engine Worker', '--app', FREEFORM_APP_ID))).toBe(0)
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

  it('rejects GitHub release bundles missing packaged official Soul Apps', async () => {
    const installParent = path.join(root, 'install')
    const currentBundleDir = path.join(installParent, 'aiworker-darwin-arm64')
    const releaseBundleDir = path.join(root, 'release', 'aiworker-darwin-arm64')
    await writeFakeBundle(currentBundleDir, 'old')
    await writeFakeBundle(releaseBundleDir, 'new', { includeOfficialApp: false })
    const archiveBytes = await createTarGz(releaseBundleDir)

    await expect(downloadAndReplaceGitHubBundle({
      checksumUrl: 'https://example.test/aiworker.tar.gz.sha256',
      downloadUrl: 'https://example.test/aiworker.tar.gz',
    }, {
      currentPath: path.join(currentBundleDir, 'aiworker'),
      fetch: mockReleaseFetch(archiveBytes),
    })).rejects.toThrow('staging_failed: official Freeform descriptor not found')

    expect(await readFile(path.join(currentBundleDir, 'web', 'worker', 'index.html'), 'utf8')).toContain('old')
    expect(await updateScratchEntries(installParent)).toEqual([])
  })

  it('rejects GitHub release bundles missing packaged migration metadata', async () => {
    const installParent = path.join(root, 'install')
    const currentBundleDir = path.join(installParent, 'aiworker-darwin-arm64')
    const releaseBundleDir = path.join(root, 'release', 'aiworker-darwin-arm64')
    await writeFakeBundle(currentBundleDir, 'old')
    await writeFakeBundle(releaseBundleDir, 'new', { includeMigrationJournal: false })
    const archiveBytes = await createTarGz(releaseBundleDir)

    await expect(downloadAndReplaceGitHubBundle({
      checksumUrl: 'https://example.test/aiworker.tar.gz.sha256',
      downloadUrl: 'https://example.test/aiworker.tar.gz',
    }, {
      currentPath: path.join(currentBundleDir, 'aiworker'),
      fetch: mockReleaseFetch(archiveBytes),
    })).rejects.toThrow('staging_failed: drizzle migration journal not found')

    expect(await readFile(path.join(currentBundleDir, 'web', 'worker', 'index.html'), 'utf8')).toContain('old')
    expect(await updateScratchEntries(installParent)).toEqual([])
  })

  it('rejects GitHub release bundles with invalid packaged Freeform descriptors', async () => {
    const installParent = path.join(root, 'install')
    const currentBundleDir = path.join(installParent, 'aiworker-darwin-arm64')
    const releaseBundleDir = path.join(root, 'release', 'aiworker-darwin-arm64')
    await writeFakeBundle(currentBundleDir, 'old')
    await writeFakeBundle(releaseBundleDir, 'new', { descriptorText: '{"protocol":"legacy-manifest"}\n' })
    const archiveBytes = await createTarGz(releaseBundleDir)

    await expect(downloadAndReplaceGitHubBundle({
      checksumUrl: 'https://example.test/aiworker.tar.gz.sha256',
      downloadUrl: 'https://example.test/aiworker.tar.gz',
    }, {
      currentPath: path.join(currentBundleDir, 'aiworker'),
      fetch: mockReleaseFetch(archiveBytes),
    })).rejects.toThrow('staging_failed: official Freeform descriptor is not descriptor v1')

    expect(await readFile(path.join(currentBundleDir, 'web', 'worker', 'index.html'), 'utf8')).toContain('old')
    expect(await updateScratchEntries(installParent)).toEqual([])
  })

  it('rejects GitHub release bundles with the wrong packaged Freeform app id', async () => {
    const installParent = path.join(root, 'install')
    const currentBundleDir = path.join(installParent, 'aiworker-darwin-arm64')
    const releaseBundleDir = path.join(root, 'release', 'aiworker-darwin-arm64')
    const descriptor = JSON.parse(await readFile(freeformDescriptorPath(), 'utf8')) as { identity: { id: string } }
    descriptor.identity.id = 'wrong-freeform'
    await writeFakeBundle(currentBundleDir, 'old')
    await writeFakeBundle(releaseBundleDir, 'new', { descriptorText: `${JSON.stringify(descriptor)}\n` })
    const archiveBytes = await createTarGz(releaseBundleDir)

    await expect(downloadAndReplaceGitHubBundle({
      checksumUrl: 'https://example.test/aiworker.tar.gz.sha256',
      downloadUrl: 'https://example.test/aiworker.tar.gz',
    }, {
      currentPath: path.join(currentBundleDir, 'aiworker'),
      fetch: mockReleaseFetch(archiveBytes),
    })).rejects.toThrow('staging_failed: official Freeform descriptor is not the official Freeform descriptor')

    expect(await readFile(path.join(currentBundleDir, 'web', 'worker', 'index.html'), 'utf8')).toContain('old')
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

  it('reports install source and packaged resource readiness in doctor output', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch

    expect(await runCli(argv('doctor'))).toBe(0)
    const body = JSON.parse(output) as {
      installation: {
        resources: {
          migrationsFolder: string | null
          migrationsReady: boolean
          officialAppsReady: boolean
          officialFreeformDescriptorReady: boolean
          workerWebReady: boolean
        }
        source: { canAutoUpgrade: boolean, kind: string }
      }
    }

    expect(body.installation.source).toMatchObject({
      canAutoUpgrade: false,
      kind: 'source-checkout',
    })
    expect(body.installation.resources.migrationsFolder).toContain('drizzle/worker')
    expect(body.installation.resources.migrationsReady).toBe(true)
    expect(typeof body.installation.resources.officialAppsReady).toBe('boolean')
    expect(typeof body.installation.resources.officialFreeformDescriptorReady).toBe('boolean')
    expect(typeof body.installation.resources.workerWebReady).toBe('boolean')
  })

  it('reports packaged official apps unready when Freeform descriptor is not v1', async () => {
    const moduleDir = path.join(root, 'dist')
    await writeFakeBundle(moduleDir, 'invalid-official-app', { descriptorText: '{"protocol":"legacy"}\n' })

    const resources = inspectCliOfficialAppsResource(moduleDir)

    expect(resources.officialAppsRoot).toBe(path.join(moduleDir, 'official-apps'))
    expect(resources.officialAppsReady).toBe(false)
    expect(resources.officialFreeformDescriptorReady).toBe(false)
  })

  it('reports packaged official apps unready when Freeform descriptor has the wrong app id', async () => {
    const moduleDir = path.join(root, 'dist')
    const descriptor = JSON.parse(await readFile(freeformDescriptorPath(), 'utf8')) as { identity: { id: string } }
    descriptor.identity.id = 'wrong-freeform'
    await writeFakeBundle(moduleDir, 'wrong-official-app', { descriptorText: `${JSON.stringify(descriptor)}\n` })

    const resources = inspectCliOfficialAppsResource(moduleDir)

    expect(resources.officialAppsRoot).toBe(path.join(moduleDir, 'official-apps'))
    expect(resources.officialAppsReady).toBe(false)
    expect(resources.officialFreeformDescriptorReady).toBe(false)
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

    expect(await runCli(argv('worker', 'create', '--id', 'legacy-hr', '--name', 'Legacy HR', '--app', 'hr'))).toBe(1)
    output = ''

    expect(await runCli(argv('worker', 'create', '--id', 'official-freeform', '--name', 'Official Freeform', '--app', FREEFORM_APP_ID))).toBe(0)
    expect((JSON.parse(output) as { worker: { appId: string } }).worker.appId).toBe(FREEFORM_APP_ID)
  })

  it('discards legacy HR metadata during official app bootstrap', async () => {
    seedLegacyHrMetadata()

    expect(await runCli(argv('app', 'bootstrap', 'official'))).toBe(0)
    const body = JSON.parse(output) as {
      bootstrap: {
        retiredMetadataDiscard: { workersDeleted: number }
      }
      catalog: { souls: Array<{ id: string }> }
    }
    expect(body.bootstrap.retiredMetadataDiscard).toMatchObject({ workersDeleted: 1 })
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

    expect(await runCli(argv('worker', 'create', '--id', 'mounted-hr', '--name', 'Mounted HR', '--app', FREEFORM_APP_ID))).toBe(0)
    expect((JSON.parse(output) as { worker: { metadata: Record<string, unknown>, appId: string } }).worker.appId).toBe(FREEFORM_APP_ID)
    output = ''

    expect(await runCli(argv('app', 'archive', FREEFORM_APP_ID))).toBe(0)
    expect((JSON.parse(output) as { app: { status: string } }).app.status).toBe('disabled')
    output = ''

    expect(await runCli(argv('template', 'list', '--app', FREEFORM_APP_ID))).toBe(1)
  })

  it('exposes the canonical soul authoring path: soul create scaffolds and soul build rebuilds', async () => {
    const appDir = path.join(root, 'authoring-soul')

    expect(await runCli(argv('soul', 'create', 'authoring-soul', '--dir', appDir))).toBe(0)
    const created = JSON.parse(output) as { appId: string, descriptorPath: string, files: string[], path: string }
    const descriptorPath = path.join(appDir, 'dist', 'soul.descriptor.json')
    expect(created).toMatchObject({ appId: 'authoring-soul', descriptorPath, path: appDir })
    expect(created.files).toContain('soul.config.ts')
    expect(created.files).toContain('dist/soul.descriptor.json')
    await expect(stat(descriptorPath)).resolves.toBeTruthy()

    output = ''
    expect(await runCli(argv('soul', 'build', appDir))).toBe(0)
    const built = JSON.parse(output) as { appId: string, descriptorPath: string, generatedSections: string[], status: string }
    expect(built).toMatchObject({ appId: 'authoring-soul', descriptorPath, status: 'built' })
    expect(built.generatedSections).toEqual(expect.arrayContaining(['engine.workspaceAssets']))
    expect(built.generatedSections).not.toContain('workbench')
    expect(built.generatedSections).not.toContain('capabilities')
    await expect(stat(descriptorPath)).resolves.toBeTruthy()
  })

  it('scaffolds, validates, and smokes a descriptor-only SDK Soul App', async () => {
    const appDir = path.join(root, 'demo-soul-app')

    expect(await runCli(argv('app', 'create', 'demo-soul-app', '--dir', appDir))).toBe(0)
    const scaffold = JSON.parse(output) as { appId: string, descriptorPath: string, files: string[], path: string }
    const descriptorPath = path.join(appDir, 'dist', 'soul.descriptor.json')
    expect(scaffold).toMatchObject({ appId: 'demo-soul-app', descriptorPath, path: appDir })
    expect(scaffold.files).toContain('soul.config.ts')
    expect(scaffold.files).not.toContain('product/capabilities/default/prompt.md')
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
    const scaffoldWorkspaceGitignore = await readFile(path.join(appDir, 'engine', 'workspace', '.gitignore'), 'utf8')
    const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')) as {
      engine: {
        mcp?: { targets?: Record<string, { file: string }> }
        skills?: { source: string }
        workspaceAssets?: { source: string }
      }
      identity: { id: string, name: string, description?: string }
      protocol: string
    }
    expect(scaffoldPackageJson.dependencies['@zonease/aiworker-soul-sdk']).toBe('workspace:*')
    expect(scaffoldPackageJson.scripts.build).toBe('bun scripts/build.ts')
    expect(scaffoldPackageJson.scripts.validate).toBe('bun scripts/validate.ts')
    expect(scaffoldTsconfig.include).toEqual(['soul.config.ts', 'scripts/**/*.ts'])
    expect(scaffoldSoulConfig).toContain('defineSoul')
    expect(scaffoldSoulConfig).toContain('id: \'demo-soul-app\'')
    expect(scaffoldSoulConfig).not.toContain('host-adapter')
    expect(descriptor).not.toHaveProperty('capabilities')
    expect(descriptor).toMatchObject({
      identity: {
        id: 'demo-soul-app',
        name: 'Demo Soul App',
      },
      protocol: 'soul/v1',
    })
    expect(descriptor.identity).not.toHaveProperty('appId')
    expect(descriptor.identity).not.toHaveProperty('soulId')
    expect(descriptor.identity).not.toHaveProperty('version')
    expect(descriptor).not.toHaveProperty('workbench')
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
    })
    expect(smoke.smoke).not.toHaveProperty('workbench')
    expect(smoke.smoke).not.toHaveProperty('standalone')
    expect(smoke.smoke).not.toHaveProperty('mountedService')
  })

  it('fails descriptor validation on source hook paths', async () => {
    const descriptorPath = path.join(root, 'bad-soul.descriptor.json')
    await writeFile(descriptorPath, JSON.stringify({
      engine: {
        workspaceAssets: {
          source: 'dist/engine-assets/../host-adapter',
        },
      },
      identity: {
        id: 'bad-soul',
        name: 'Bad Soul',
      },
      protocol: 'soul/v1',
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
        path: 'engine.workspaceAssets.source',
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
