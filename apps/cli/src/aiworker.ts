#!/usr/bin/env bun
import type { LocalWorkerRuntime } from '@zonease/aiworker-core'
import type { WorkerRow } from '@zonease/aiworker-storage-sqlite/worker'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createLocalWorkerRuntime, getWorkerEnv } from '@zonease/aiworker-core'
import { BUILTIN_CAPABILITY_TEMPLATES, BUILTIN_VERTICAL_SOULS, findCapabilityTemplate, findVerticalSoul } from '@zonease/aiworker-shared'
import {
  closeWorkerDb,
  createLesson,
  getArtifact,
  getReview,
  getSession,
  getWorker,
  getWorkspace,
  initWorkerDb,
  listArtifacts,
  listFiles,
  listLessons,
  listReviews,
  listSessions,
  listSettings,
  listTurns,
  listWorkers,
  listWorkspaces,
  runWorkerMigrations,
  setSetting,
  updateLesson,
} from '@zonease/aiworker-storage-sqlite/worker'
import cac from 'cac'
import consola from 'consola'

import packageJson from '../package.json' with { type: 'json' }

interface LocalPaths {
  home: string
  dbPath: string
  workersRoot: string
  pidFile: string
  logFile: string
}

interface RuntimeOptions {
  soul?: string
}

const cli = cac('aiworker')

function localPaths(): LocalPaths {
  const home = process.env.AIWORKER_HOME ?? path.join(homedir(), '.aiworker')
  return {
    home,
    dbPath: process.env.WORKER_DB_PATH ?? path.join(home, 'aiworker.db'),
    workersRoot: path.join(home, 'workers'),
    pidFile: path.join(home, 'aiworker-daemon.pid'),
    logFile: path.join(home, 'aiworker-daemon.log'),
  }
}

async function ensureRuntime(options: RuntimeOptions = {}): Promise<LocalWorkerRuntime> {
  const paths = localPaths()
  await mkdir(paths.home, { recursive: true })
  await mkdir(path.dirname(paths.dbPath), { recursive: true })
  initWorkerDb(paths.dbPath)
  runWorkerMigrations(getWorkerEnv().WORKER_MIGRATIONS_FOLDER)
  const soul = requireAvailableSoul(options.soul ?? 'hr')
  const workerId = `${soul.id}-worker`
  const runtime = createLocalWorkerRuntime({
    worker: {
      id: workerId,
      soulId: soul.id,
      name: soul.name,
      defaultEngineId: 'codex',
      metadata: {
        defaultTemplates: [...soul.defaultTemplates],
        description: soul.description,
        domain: soul.domain,
      },
    },
    workspacesRoot: path.join(paths.workersRoot, workerId, 'workspaces'),
  })
  await runtime.init()
  return runtime
}

async function ensureAllWorkers(): Promise<WorkerRow[]> {
  const created: WorkerRow[] = []
  for (const soul of BUILTIN_VERTICAL_SOULS.filter(soul => soul.status === 'available')) {
    const runtime = await ensureRuntime({ soul: soul.id })
    created.push(runtime.snapshot().worker)
  }
  return created
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`${label} is required`)
  return value.trim()
}

function optionalNumber(value: number[] | undefined): number | undefined {
  const item = value?.[0]
  return typeof item === 'number' && Number.isFinite(item) ? item : undefined
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}

async function runInit(): Promise<void> {
  const paths = localPaths()
  await mkdir(paths.home, { recursive: true })
  const workers = await ensureAllWorkers()
  printJson({
    home: paths.home,
    dbPath: paths.dbPath,
    workersRoot: paths.workersRoot,
    workers,
  })
}

async function runDoctor(): Promise<void> {
  await ensureAllWorkers()
  const paths = localPaths()
  printJson({
    ok: true,
    home: paths.home,
    dbPath: paths.dbPath,
    workers: listWorkers(),
    workspaces: listWorkspaces(),
    daemon: daemonStatus(),
    settings: listSettings(),
  })
}

function daemonStatus(): { logFile: string, pid: number | null, running: boolean } {
  const paths = localPaths()
  if (!existsSync(paths.pidFile))
    return { pid: null, running: false, logFile: paths.logFile }
  const pid = Number.parseInt(readFileSync(paths.pidFile, 'utf8'), 10)
  return { pid: Number.isFinite(pid) ? pid : null, running: Number.isFinite(pid) && isProcessAlive(pid), logFile: paths.logFile }
}

async function startDaemon(opts: { host?: string, port?: number } = {}): Promise<void> {
  const paths = localPaths()
  mkdirSync(paths.home, { recursive: true })
  const current = daemonStatus()
  if (current.running)
    throw new Error(`daemon already running: pid=${current.pid}`)
  writeFileSync(paths.logFile, '')
  const child = Bun.spawn([
    process.execPath,
    process.argv[1] ?? 'aiworker',
    'daemon',
    'foreground',
    ...(opts.host ? ['--host', opts.host] : []),
    ...(opts.port ? ['--port', String(opts.port)] : []),
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AIWORKER_HOME: paths.home,
      WORKER_DB_PATH: paths.dbPath,
    },
    stdout: 'ignore',
    stderr: 'ignore',
  })
  if (!child.pid)
    throw new Error('daemon did not return a pid')
  writeFileSync(paths.pidFile, String(child.pid))
  printJson({ started: true, pid: child.pid, logFile: paths.logFile, url: `http://127.0.0.1:${opts.port ?? getWorkerEnv().PORT}` })
}

async function stopDaemon(): Promise<void> {
  const paths = localPaths()
  const status = daemonStatus()
  if (!status.pid || !status.running) {
    rmSync(paths.pidFile, { force: true })
    printJson({ stopped: false, running: false })
    return
  }
  process.kill(status.pid, 'SIGTERM')
  rmSync(paths.pidFile, { force: true })
  printJson({ stopped: true, pid: status.pid })
}

async function daemonForeground(opts: { host?: string, port?: number } = {}): Promise<void> {
  const { bootstrapWorkerApp } = await import('@zonease/aiworker-api/bootstrap')
  const { app, port } = await bootstrapWorkerApp()
  const env = getWorkerEnv()
  const server = Bun.serve({
    fetch: app.fetch,
    hostname: opts.host ?? env.AIWORKER_WORKER_HOST,
    port: opts.port ?? port,
  })
  consola.success(`[aiworker-daemon] listening on http://${server.hostname}:${server.port}`)
  await new Promise<void>(() => undefined)
}

async function daemonCheck(opts: { host?: string, port?: number } = {}): Promise<void> {
  const env = getWorkerEnv()
  const url = `http://${opts.host ?? env.AIWORKER_WORKER_HOST}:${opts.port ?? env.PORT}/health`
  const res = await fetch(url)
  printJson({ ok: res.ok, status: res.status, body: await res.json().catch(() => null) })
}

async function showLogs(opts: { tail?: number } = {}): Promise<void> {
  const logFile = localPaths().logFile
  if (!existsSync(logFile))
    return
  const text = await readFile(logFile, 'utf8')
  const lines = text.split(/\r?\n/)
  process.stdout.write(`${lines.slice(-(opts.tail ?? 80)).join('\n')}\n`)
}

async function createWorkspaceCommand(opts: { name?: string, soul?: string }): Promise<void> {
  const runtime = await ensureRuntime({ soul: opts.soul })
  printJson({ workspace: await runtime.createWorkspace({ name: requireText(opts.name, 'name') }) })
}

async function listWorkspaceCommand(opts: { soul?: string }): Promise<void> {
  const runtime = await ensureRuntime({ soul: opts.soul })
  printJson({ workspaces: listWorkspaces(runtime.workerId) })
}

async function startSessionCommand(opts: { context?: string, input?: string, skill?: string, soul?: string, title?: string, workspace?: string }): Promise<void> {
  const runtime = await ensureRuntime({ soul: opts.soul })
  const workspaceId = requireText(opts.workspace, 'workspace')
  const workspace = getWorkspace(workspaceId)
  if (!workspace || workspace.workerId !== runtime.workerId)
    throw new Error(`workspace not found for ${runtime.workerId}: ${workspaceId}`)
  const skillId = requireText(opts.skill, 'skill')
  const template = findCapabilityTemplate(skillId)
  if (!template)
    throw new Error(`template not found: ${skillId}`)
  const session = await runtime.createSession({
    workspaceId,
    capabilityTemplateId: template.id,
    title: requireText(opts.title, 'title'),
    context: opts.context ?? '',
    metadata: {
      inputHints: template.inputHints,
      outputKind: template.outputKind,
      reviewRubric: template.reviewRubric,
      skillName: template.name,
    },
  })
  const input = requireText(opts.input, 'input')
  printJson(await runtime.startTurn({
    sessionId: session.id,
    input,
    engineId: 'codex',
    engineCommand: 'codex',
    metadata: {
      inputHints: template.inputHints,
      outputKind: template.outputKind,
      reviewRubric: template.reviewRubric,
      skillName: template.name,
      executionMode: 'local-cli',
    },
  }))
}

async function sendTurnCommand(opts: { input?: string, session?: string, soul?: string }): Promise<void> {
  const runtime = await ensureRuntime({ soul: opts.soul })
  printJson(await runtime.startTurn({
    sessionId: requireText(opts.session, 'session'),
    input: requireText(opts.input, 'input'),
    engineId: 'codex',
    engineCommand: 'codex',
    metadata: { executionMode: 'local-cli' },
  }))
}

async function listSessionCommand(opts: { workspace?: string }): Promise<void> {
  await ensureAllWorkers()
  printJson({ sessions: listSessions(opts.workspace) })
}

async function showSession(id: string): Promise<void> {
  await ensureAllWorkers()
  printJson({ session: getSession(id), turns: listTurns(id) })
}

async function listWorkspaceFiles(opts: { workspace?: string }): Promise<void> {
  await ensureAllWorkers()
  printJson({ files: listFiles(opts.workspace) })
}

async function showFile(filePath: string, opts: { workspace?: string, soul?: string }): Promise<void> {
  const runtime = await ensureRuntime({ soul: opts.soul })
  const workspaceId = requireText(opts.workspace, 'workspace')
  process.stdout.write(await runtime.files(workspaceId).read(filePath))
}

async function openArtifact(id: string, opts: { soul?: string }): Promise<void> {
  const artifact = getArtifact(id)
  if (!artifact)
    throw new Error(`artifact not found: ${id}`)
  const workspace = getWorkspace(artifact.workspaceId)
  if (!workspace)
    throw new Error(`workspace not found for artifact: ${id}`)
  const runtime = await ensureRuntime({ soul: opts.soul ?? getWorker(workspace.workerId)?.soulId })
  const fullPath = runtime.files(workspace.id).resolve(artifact.path)
  Bun.spawn(['open', fullPath])
  printJson({ opened: fullPath })
}

async function listArtifactsCommand(opts: { workspace?: string }): Promise<void> {
  await ensureAllWorkers()
  printJson({ artifacts: listArtifacts(opts.workspace) })
}

async function listReviewsCommand(opts: { workspace?: string }): Promise<void> {
  await ensureAllWorkers()
  printJson({ reviews: listReviews(opts.workspace) })
}

async function proposeLesson(opts: { review?: string, statement?: string, workspace?: string }): Promise<void> {
  await ensureAllWorkers()
  const workspaceId = requireText(opts.workspace, 'workspace')
  const lesson = createLesson({
    id: randomUUID(),
    workspaceId,
    sourceReviewId: opts.review ?? null,
    statement: requireText(opts.statement, 'statement'),
    evidenceJson: opts.review ? [{ reviewId: opts.review }] : [],
  })
  printJson({ lesson })
}

function registerCommands(): void {
  cli.command('init', 'initialize host-local AIWorker home and Soul workers').action(runInit)
  cli.command('dev', 'run local daemon and hosted Worker Web in foreground').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => daemonForeground({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('doctor', 'inspect host-local daemon readiness').action(runDoctor)

  cli.command('daemon start', 'start local daemon in background').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => startDaemon({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('daemon foreground', 'run local daemon in foreground').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => daemonForeground({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('daemon status', 'show local daemon status').action(() => printJson(daemonStatus()))
  cli.command('daemon stop', 'stop local daemon').action(stopDaemon)
  cli.command('daemon logs', 'show local daemon logs').option('--tail <n>', 'line count', { type: [Number] }).action((opts: { tail?: number[] }) => showLogs({ tail: optionalNumber(opts.tail) }))
  cli.command('daemon check', 'check local daemon health').option('--host <host>', 'host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => daemonCheck({ host: opts.host, port: optionalNumber(opts.port) }))

  cli.command('soul list', 'list built-in vertical Souls').action(() => printJson({ souls: BUILTIN_VERTICAL_SOULS }))
  cli.command('worker list', 'list local Soul workers').action(async () => {
    await ensureAllWorkers()
    printJson({ workers: listWorkers() })
  })
  cli.command('template list', 'list capability templates').option('--soul <id>', 'Soul id').action((opts: { soul?: string }) => {
    const templates = opts.soul ? BUILTIN_CAPABILITY_TEMPLATES.filter(template => template.soulId === opts.soul) : BUILTIN_CAPABILITY_TEMPLATES
    printJson({ templates })
  })

  cli.command('workspace create', 'create a worker workspace').option('--name <text>', 'workspace name').option('--soul <id>', 'Soul id').action(createWorkspaceCommand)
  cli.command('workspace list', 'list worker workspaces').option('--soul <id>', 'Soul id').action(listWorkspaceCommand)
  cli.command('workspace show <id>', 'show one workspace').action(async (id: string) => {
    await ensureAllWorkers()
    printJson({ workspace: getWorkspace(id) })
  })

  cli.command('session start', 'create a workspace session and first turn')
    .option('--workspace <id>', 'workspace id')
    .option('--skill <id>', 'capability template id')
    .option('--title <text>', 'session title')
    .option('--context <text>', 'session context')
    .option('--input <text>', 'turn input')
    .option('--soul <id>', 'Soul id')
    .action(startSessionCommand)
  cli.command('session list', 'list sessions').option('--workspace <id>', 'workspace id').action(listSessionCommand)
  cli.command('session show <id>', 'show one session').action(showSession)
  cli.command('turn send', 'send a turn to an existing session').option('--session <id>', 'session id').option('--input <text>', 'turn input').option('--soul <id>', 'Soul id').action(sendTurnCommand)

  cli.command('files list', 'list workspace files').option('--workspace <id>', 'workspace id').action(listWorkspaceFiles)
  cli.command('files show <path>', 'print workspace file').option('--workspace <id>', 'workspace id').option('--soul <id>', 'Soul id').action(showFile)

  cli.command('artifacts list', 'list artifacts').option('--workspace <id>', 'workspace id').action(listArtifactsCommand)
  cli.command('artifacts show <id>', 'show one artifact').action(async (id: string) => {
    await ensureAllWorkers()
    printJson({ artifact: getArtifact(id) })
  })
  cli.command('artifacts open <id>', 'open one artifact').option('--soul <id>', 'Soul id').action(openArtifact)

  cli.command('review list', 'list reviews').option('--workspace <id>', 'workspace id').action(listReviewsCommand)
  cli.command('review show <id>', 'show one review').action(async (id: string) => {
    await ensureAllWorkers()
    printJson({ review: getReview(id) })
  })

  cli.command('lessons list', 'list lessons').option('--workspace <id>', 'workspace id').action(async (opts: { workspace?: string }) => {
    await ensureAllWorkers()
    printJson({ lessons: listLessons(opts.workspace) })
  })
  cli.command('lessons propose', 'propose a lesson').option('--statement <text>', 'lesson statement').option('--review <id>', 'source review id').option('--workspace <id>', 'workspace id').action(proposeLesson)
  cli.command('lessons accept <id>', 'accept a lesson').action(async (id: string) => {
    await ensureAllWorkers()
    printJson({ lesson: updateLesson(id, 'accepted') })
  })
  cli.command('lessons reject <id>', 'reject a lesson').action(async (id: string) => {
    await ensureAllWorkers()
    printJson({ lesson: updateLesson(id, 'rejected') })
  })

  cli.command('settings list', 'list host daemon settings').action(async () => {
    await ensureAllWorkers()
    printJson({ settings: listSettings() })
  })
  cli.command('engine select <engine>', 'set engine hint').action(async (engine: string) => {
    await ensureAllWorkers()
    printJson({ setting: setSetting('engine.default', { engine }) })
  })

  cli.command('open', 'open local daemon Web app').option('--port <n>', 'web port', { type: [Number] }).action((opts: { port?: number[] }) => {
    const port = optionalNumber(opts.port) ?? getWorkerEnv().PORT
    const url = `http://127.0.0.1:${port}`
    Bun.spawn(['open', url])
    printJson({ opened: url })
  })
  cli.command('commands', 'show command index').action(() => {
    process.stdout.write(`${commandIndex()}\n`)
  })
}

function requireAvailableSoul(id: string) {
  const soul = findVerticalSoul(id)
  if (!soul || soul.status !== 'available')
    throw new Error(`available Soul not found: ${id}`)
  return soul
}

function commandIndex(): string {
  return [
    'aiworker command index',
    'init',
    'dev',
    'daemon start|foreground|status|stop|logs|check',
    'soul list',
    'worker list',
    'template list',
    'workspace create|list|show',
    'session start|list|show',
    'turn send',
    'files list|show',
    'artifacts list|show|open',
    'review list|show',
    'lessons list|propose|accept|reject',
    'settings list',
    'engine select',
    'open',
  ].join('\n')
}

registerCommands()
cli.help()
cli.version(packageJson.version)

export function preprocessArgv(argv: string[], commandNames = cli.commands.map(command => command.name)): string[] {
  const names = new Set(commandNames.filter(name => name.includes(' ')))
  const maxDepth = Math.max(1, ...[...names].map(name => name.split(' ').length))
  for (let depth = maxDepth; depth >= 2; depth--) {
    const combined = argv.slice(2, 2 + depth).join(' ')
    if (names.has(combined)) {
      const next = argv.slice()
      next.splice(2, depth, combined)
      return next
    }
  }
  return argv
}

export async function runCli(argv: string[] = process.argv): Promise<number> {
  try {
    cli.unsetMatchedCommand()
    const parsed = cli.parse(preprocessArgv(argv), { run: false })
    if (cli.options.help === true || cli.options.version === true)
      return 0
    if (!cli.matchedCommand && parsed.args[0])
      throw new Error(`Unknown command: ${parsed.args[0]}`)
    await cli.runMatchedCommand()
    return typeof process.exitCode === 'number' ? process.exitCode : 0
  }
  catch (error) {
    consola.error(error instanceof Error ? error.message : String(error))
    return 1
  }
  finally {
    closeWorkerDb()
  }
}

if (import.meta.main)
  process.exit(await runCli(process.argv))
