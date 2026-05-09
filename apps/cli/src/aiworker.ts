#!/usr/bin/env bun
import type { LocalWorkerRuntime } from '@zonease/aiworker-core'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import process from 'node:process'
import { createLocalWorkerRuntime, getWorkerEnv } from '@zonease/aiworker-core'
import {
  appendRunEvent,
  closeWorkerDb,
  createLesson,
  createReview,
  getArtifact,
  getBrief,
  getReview,
  getRun,
  initWorkerDb,
  listArtifacts,
  listBriefs,
  listFiles,
  listLessons,
  listReviews,
  listRunEvents,
  listRuns,
  listSettings,
  nextRunEventSeq,
  runWorkerMigrations,
  setSetting,
  updateLesson,
  updateRun,
  upsertFile,
} from '@zonease/aiworker-storage-sqlite/worker'
import cac from 'cac'
import consola from 'consola'

import packageJson from '../package.json' with { type: 'json' }

interface LocalPaths {
  home: string
  dbPath: string
  workspaceRoot: string
  pidFile: string
  logFile: string
}

interface RuntimeOptions {
  name?: string
  root?: string
}

const cli = cac('aiworker')

function localPaths(): LocalPaths {
  const home = process.env.AIWORKER_HOME ?? path.join(homedir(), '.aiworker')
  return {
    home,
    dbPath: process.env.WORKER_DB_PATH ?? path.join(home, 'worker.db'),
    workspaceRoot: process.env.WORKER_WORKSPACE_ROOT ?? path.join(home, 'workspace'),
    pidFile: path.join(home, 'aiworker-local.pid'),
    logFile: path.join(home, 'aiworker-local.log'),
  }
}

async function ensureRuntime(options: RuntimeOptions = {}): Promise<LocalWorkerRuntime> {
  const paths = localPaths()
  await mkdir(path.dirname(paths.dbPath), { recursive: true })
  await mkdir(options.root ?? paths.workspaceRoot, { recursive: true })
  initWorkerDb(paths.dbPath)
  runWorkerMigrations(getWorkerEnv().WORKER_MIGRATIONS_FOLDER)
  const runtime = createLocalWorkerRuntime({
    workerId: 'local-worker',
    workspace: {
      id: 'local',
      name: options.name ?? 'Local Workspace',
      rootPath: options.root ?? paths.workspaceRoot,
    },
  })
  await runtime.init()
  return runtime
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`${label} is required`)
  return value
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

async function runInit(opts: { name?: string, root?: string } = {}): Promise<void> {
  const runtime = await ensureRuntime(opts)
  printJson({ workspace: runtime.snapshot().workspace, dbPath: localPaths().dbPath })
}

async function runDoctor(): Promise<void> {
  const runtime = await ensureRuntime()
  const paths = localPaths()
  printJson({
    ok: true,
    dbPath: paths.dbPath,
    workspaceRoot: runtime.files.root,
    workspace: runtime.snapshot().workspace,
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
      WORKER_WORKSPACE_ROOT: paths.workspaceRoot,
    },
    stdout: 'ignore',
    stderr: 'ignore',
  })
  if (!child.pid)
    throw new Error('daemon did not return a pid')
  writeFileSync(paths.pidFile, String(child.pid))
  printJson({ started: true, pid: child.pid, logFile: paths.logFile })
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
  consola.success(`[local-daemon] listening on http://${server.hostname}:${server.port}`)
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

async function createBrief(opts: { body?: string, title?: string }): Promise<void> {
  const runtime = await ensureRuntime()
  printJson({ brief: runtime.createBrief({ title: requireText(opts.title, 'title'), body: requireText(opts.body, 'body') }) })
}

async function showBrief(id: string): Promise<void> {
  await ensureRuntime()
  printJson({ brief: getBrief(id) })
}

async function startRun(opts: { brief?: string, prompt?: string }): Promise<void> {
  const runtime = await ensureRuntime()
  printJson(await runtime.startRun({ briefId: opts.brief, prompt: opts.prompt }))
}

async function showRun(id: string): Promise<void> {
  await ensureRuntime()
  printJson({ run: getRun(id), events: listRunEvents(id) })
}

async function cancelRun(id: string): Promise<void> {
  await ensureRuntime()
  const run = updateRun({ id, status: 'cancelled', finishedAt: new Date().toISOString() })
  appendRunEvent({ runId: id, seq: nextRunEventSeq(id), type: 'status', payloadJson: { status: 'cancelled' } })
  printJson({ run })
}

async function listWorkspaceFiles(): Promise<void> {
  const runtime = await ensureRuntime()
  printJson({ files: listFiles(runtime.snapshot().workspace.id) })
}

async function showFile(filePath: string): Promise<void> {
  const runtime = await ensureRuntime()
  process.stdout.write(await runtime.files.read(filePath))
}

async function writeWorkspaceFile(filePath: string, content: string): Promise<void> {
  const runtime = await ensureRuntime()
  const entry = await runtime.files.write({ path: filePath, content })
  const file = upsertFile({
    id: randomUUID(),
    workspaceId: runtime.snapshot().workspace.id,
    path: filePath,
    kind: entry.kind,
    size: entry.size,
    mtime: entry.mtime,
    hash: entry.hash,
    source: 'user',
  })
  printJson({ file })
}

async function deleteWorkspaceFile(filePath: string): Promise<void> {
  const runtime = await ensureRuntime()
  await runtime.files.delete(filePath)
  printJson({ ok: true })
}

async function searchWorkspaceFiles(query: string): Promise<void> {
  const runtime = await ensureRuntime()
  const files = listFiles(runtime.snapshot().workspace.id).filter(file => file.path.includes(query))
  printJson({ files })
}

async function openArtifact(id: string): Promise<void> {
  const runtime = await ensureRuntime()
  const artifact = getArtifact(id)
  if (!artifact)
    throw new Error(`artifact not found: ${id}`)
  const fullPath = runtime.files.resolve(artifact.path)
  Bun.spawn(['open', fullPath])
  printJson({ opened: fullPath })
}

async function createReviewCommand(opts: { artifact?: string, run?: string, verdict?: ReviewVerdict }): Promise<void> {
  const runtime = await ensureRuntime()
  const workspace = runtime.snapshot().workspace
  const review = createReview({
    id: randomUUID(),
    workspaceId: workspace.id,
    runId: opts.run ?? null,
    artifactId: opts.artifact ?? null,
    verdict: opts.verdict ?? 'needs_review',
    findingsJson: [],
    risksJson: [],
  })
  printJson({ review })
}

type ReviewVerdict = 'pass' | 'warn' | 'fail' | 'needs_review'

async function proposeLesson(opts: { review?: string, statement?: string }): Promise<void> {
  const runtime = await ensureRuntime()
  const lesson = createLesson({
    id: randomUUID(),
    workspaceId: runtime.snapshot().workspace.id,
    sourceReviewId: opts.review ?? null,
    statement: requireText(opts.statement, 'statement'),
    evidenceJson: opts.review ? [{ reviewId: opts.review }] : [],
  })
  printJson({ lesson })
}

function registerCommands(): void {
  cli.command('init', 'create local workspace metadata').option('--name <name>', 'workspace name').option('--root <path>', 'workspace root').action(runInit)
  cli.command('doctor', 'inspect local workspace readiness').action(runDoctor)

  cli.command('daemon start', 'start local daemon in background').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => startDaemon({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('daemon foreground', 'run local daemon in foreground').option('--host <host>', 'bind host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => daemonForeground({ host: opts.host, port: optionalNumber(opts.port) }))
  cli.command('daemon status', 'show local daemon status').action(() => printJson(daemonStatus()))
  cli.command('daemon stop', 'stop local daemon').action(stopDaemon)
  cli.command('daemon logs', 'show local daemon logs').option('--tail <n>', 'line count', { type: [Number] }).action((opts: { tail?: number[] }) => showLogs({ tail: optionalNumber(opts.tail) }))
  cli.command('daemon check', 'check local daemon health').option('--host <host>', 'host').option('--port <n>', 'port', { type: [Number] }).action((opts: { host?: string, port?: number[] }) => daemonCheck({ host: opts.host, port: optionalNumber(opts.port) }))

  cli.command('brief create', 'create a workspace brief').option('--title <text>', 'brief title').option('--body <text>', 'brief body').action(createBrief)
  cli.command('brief list', 'list workspace briefs').action(async () => {
    const runtime = await ensureRuntime()
    printJson({ briefs: listBriefs(runtime.snapshot().workspace.id) })
  })
  cli.command('brief show <id>', 'show one brief').action(showBrief)

  cli.command('run start', 'start a local run').option('--brief <id>', 'brief id').option('--prompt <text>', 'direct prompt').action(startRun)
  cli.command('run list', 'list local runs').action(async () => {
    const runtime = await ensureRuntime()
    printJson({ runs: listRuns(runtime.snapshot().workspace.id) })
  })
  cli.command('run show <id>', 'show one run').action(showRun)
  cli.command('run cancel <id>', 'cancel one run').action(cancelRun)

  cli.command('files list', 'list workspace files').action(listWorkspaceFiles)
  cli.command('files show <path>', 'print workspace file').action(showFile)
  cli.command('files write <path>', 'write workspace file').option('--content <text>', 'file content').action((filePath: string, opts: { content?: string }) => writeWorkspaceFile(filePath, requireText(opts.content, 'content')))
  cli.command('files delete <path>', 'delete workspace file').action(deleteWorkspaceFile)
  cli.command('files search <query>', 'search indexed files').action(searchWorkspaceFiles)

  cli.command('artifacts list', 'list artifacts').action(async () => {
    const runtime = await ensureRuntime()
    printJson({ artifacts: listArtifacts(runtime.snapshot().workspace.id) })
  })
  cli.command('artifacts show <id>', 'show one artifact').action(async (id: string) => {
    await ensureRuntime()
    printJson({ artifact: getArtifact(id) })
  })
  cli.command('artifacts open <id>', 'open one artifact').action(openArtifact)

  cli.command('review list', 'list reviews').action(async () => {
    const runtime = await ensureRuntime()
    printJson({ reviews: listReviews(runtime.snapshot().workspace.id) })
  })
  cli.command('review show <id>', 'show one review').action(async (id: string) => {
    await ensureRuntime()
    printJson({ review: getReview(id) })
  })
  cli.command('review create', 'create a review').option('--run <id>', 'run id').option('--artifact <id>', 'artifact id').option('--verdict <verdict>', 'pass|warn|fail|needs_review').action(createReviewCommand)

  cli.command('lessons list', 'list lessons').action(async () => {
    const runtime = await ensureRuntime()
    printJson({ lessons: listLessons(runtime.snapshot().workspace.id) })
  })
  cli.command('lessons propose', 'propose a lesson').option('--statement <text>', 'lesson statement').option('--review <id>', 'source review id').action(proposeLesson)
  cli.command('lessons accept <id>', 'accept a lesson').action(async (id: string) => {
    await ensureRuntime()
    printJson({ lesson: updateLesson(id, 'accepted') })
  })
  cli.command('lessons reject <id>', 'reject a lesson').action(async (id: string) => {
    await ensureRuntime()
    printJson({ lesson: updateLesson(id, 'rejected') })
  })

  cli.command('settings list', 'list settings').action(async () => {
    await ensureRuntime()
    printJson({ settings: listSettings() })
  })
  cli.command('executor select <engine>', 'set executor hint').action(async (engine: string) => {
    await ensureRuntime()
    printJson({ setting: setSetting('executor.default', { engine }) })
  })
  cli.command('executor doctor', 'show executor hint').action(async () => {
    await ensureRuntime()
    printJson({ settings: listSettings().filter(setting => setting.key.startsWith('executor.')) })
  })

  cli.command('open', 'open local web app').option('--port <n>', 'web port', { type: [Number] }).action((opts: { port?: number[] }) => {
    const port = optionalNumber(opts.port) ?? 9219
    const url = `http://127.0.0.1:${port}`
    Bun.spawn(['open', url])
    printJson({ opened: url })
  })
  cli.command('commands', 'show command index').action(() => {
    process.stdout.write(`${commandIndex()}\n`)
  })
}

function commandIndex(): string {
  return [
    'aiworker command index',
    'init',
    'daemon start|foreground|status|stop|logs|check',
    'brief create|list|show',
    'run start|list|show|cancel',
    'files list|show|write|delete|search',
    'artifacts list|show|open',
    'review list|show|create',
    'lessons list|propose|accept|reject',
    'settings list',
    'executor select|doctor',
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
