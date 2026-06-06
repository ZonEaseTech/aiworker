#!/usr/bin/env bun
import type { WorkerRegistry } from '@zonease/aiworker-host-control'
import type { HostLifecycle } from './host-lifecycle'
import type { createHostServer as createHostServerType } from './host-server'

import process from 'node:process'

import { createWorkerRegistry } from '@zonease/aiworker-host-control'
import cac from 'cac'
import { createHostLifecycle } from './host-lifecycle'
import { createHostServer } from './host-server'

export interface HostCliDeps {
  bunServe?: typeof Bun.serve
  fetch?: typeof fetch
  hostLifecycle?: HostLifecycle
  registry?: WorkerRegistry
  serverFactory?: typeof createHostServerType
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function normalizeHostUrl(input: string | undefined): string {
  return (input ?? 'http://127.0.0.1:9117').replace(/\/+$/, '')
}

function parsePositiveInteger(value: number | string | undefined, name: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`Invalid ${name}: ${value}`)
  return parsed
}

const hostLifecycleStateOptionName = 'manifest'

function hostLifecycleStatePath(options: { manifest?: string }): string | undefined {
  return (options as Record<string, string | undefined>)[hostLifecycleStateOptionName]
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json()
  }
  catch {
    throw new Error('Host API response was not valid JSON')
  }
}

async function requestHostJson(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetchImpl(url, init)
  const body = await readJsonResponse(response)
  if (!response.ok) {
    const code = typeof body === 'object' && body && 'error' in body
      ? JSON.stringify((body as { error: unknown }).error)
      : `HTTP ${response.status}`
    throw new Error(`Host API request failed: ${code}`)
  }
  return body
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value))
    throw new Error(`Invalid Host API response: ${name} must be an object`)
  return value
}

const assignmentViewFields = [
  'assignedEmail',
  'assignmentId',
  'serverRef',
  'soulReleaseRef',
  'status',
  'workerId',
  'workbenchUrl',
  'revokedAt',
] as const

function projectAssignmentView(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, 'assignment')
  const view: Record<string, unknown> = {}
  for (const field of assignmentViewFields) {
    if (field in record)
      view[field] = record[field]
  }
  return view
}

function projectAssignmentCreateResponse(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, 'assignment create response')
  if (typeof record.provisionCommand !== 'string')
    throw new Error('Invalid Host API response: provisionCommand must be a string')
  return {
    ...(typeof record.aisshCommand === 'string' ? { aisshCommand: record.aisshCommand } : {}),
    assignment: projectAssignmentView(record.assignment),
    provisionCommand: record.provisionCommand,
  }
}

function projectAssignmentListResponse(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, 'assignment list response')
  if (!Array.isArray(record.assignments))
    throw new Error('Invalid Host API response: assignments must be an array')
  return {
    assignments: record.assignments.map(projectAssignmentView),
  }
}

function projectAllowedFields(value: unknown, fields: string[]): Record<string, unknown> {
  const record = requireRecord(value, 'projected value')
  const view: Record<string, unknown> = {}
  for (const field of fields) {
    if (field in record)
      view[field] = record[field]
  }
  return view
}

function projectHostOptions(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, 'host options')
  return {
    ...(record.serverSourceError ? { serverSourceError: record.serverSourceError } : {}),
    access: record.access,
    auth: record.auth,
    servers: Array.isArray(record.servers)
      ? record.servers.map(server => projectAllowedFields(server, ['id', 'name', 'host', 'notes', 'source']))
      : [],
    soulReleases: Array.isArray(record.soulReleases)
      ? record.soulReleases.map(soul => projectAllowedFields(soul, ['id', 'name', 'releaseRef', 'descriptorPath', 'source']))
      : [],
    ...(record.soulSourceErrors ? { soulSourceErrors: record.soulSourceErrors } : {}),
  }
}

// cac 不支持多词子命令的逐 token 匹配：把 ['worker','list'] 合并成单 token
// 'worker list' 后 cac 才能匹配到命令（与 worker-cli 的 preprocessArgv 同策略）。
export function preprocessHostArgv(argv: string[], commandNames: string[]): string[] {
  const names = new Set(commandNames.filter(name => name.includes(' ')))
  const maxDepth = Math.max(1, ...[...names].map(name => name.split(' ').length))
  for (let depth = maxDepth; depth >= 2; depth--) {
    const combined = argv.slice(0, depth).join(' ')
    if (names.has(combined)) {
      const next = argv.slice()
      next.splice(0, depth, combined)
      return next
    }
  }
  return argv
}

export async function runHostCli(argv: string[], deps: HostCliDeps = {}): Promise<number> {
  const registry = deps.registry ?? createWorkerRegistry()
  const fetchImpl = deps.fetch ?? fetch
  const hostLifecycle = deps.hostLifecycle ?? createHostLifecycle()
  const cli = cac('aiworker-host')
  cli
    .command('worker list', 'list workers registered with this Host control plane')
    .action(() => {
      printJson({ workers: registry.list() })
    })
  cli
    .command('option list', 'list aissh servers and Soul releases through the Host API')
    .option('--host <url>', 'Host API base URL', { default: 'http://127.0.0.1:9117' })
    .action(async (options: { host?: string }) => {
      const host = normalizeHostUrl(options.host)
      const result = await requestHostJson(fetchImpl, `${host}/api/host/options`)
      printJson(projectHostOptions(result))
    })
  cli
    .command('assignment create', 'create a Worker assignment through the Host API')
    .option('--email <email>', 'assigned employee email')
    .option('--server <server>', 'server reference for provisioning')
    .option('--soul <soul>', 'Soul release reference')
    .option('--host <url>', 'Host API base URL', { default: 'http://127.0.0.1:9117' })
    .action(async (options: { email?: string, host?: string, server?: string, soul?: string }) => {
      if (!options.email)
        throw new Error('Missing required option: --email <email>')
      if (!options.server)
        throw new Error('Missing required option: --server <server>')
      if (!options.soul)
        throw new Error('Missing required option: --soul <soul>')

      const host = normalizeHostUrl(options.host)
      const result = await requestHostJson(fetchImpl, `${host}/api/host/assignments`, {
        body: JSON.stringify({
          assignedEmail: options.email,
          serverRef: options.server,
          soulReleaseRef: options.soul,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      printJson(projectAssignmentCreateResponse(result))
    })
  cli
    .command('assignment list', 'list Worker assignments through the Host API')
    .option('--host <url>', 'Host API base URL', { default: 'http://127.0.0.1:9117' })
    .action(async (options: { host?: string }) => {
      const host = normalizeHostUrl(options.host)
      const result = await requestHostJson(fetchImpl, `${host}/api/host/assignments`)
      printJson(projectAssignmentListResponse(result))
    })
  cli
    .command('start', 'start Host services with the same lifecycle shape as Worker')
    .option('--db <path>', 'Host sqlite database path', { default: `${process.env.HOME ?? '.'}/.aiworker-dev/host.db` })
    .option('--dev', 'start development Host API plus Vite Host Web')
    .option('--dev-admin-email <email>', 'development-only static host admin email')
    .option('--host <host>', 'bind host', { default: '127.0.0.1' })
    .option('--manifest <path>', 'Host lifecycle manifest path')
    .option('--port <port>', 'Host API or production serve port', { default: '9117' })
    .option('--public-base-url <url>', 'public Host base URL')
    .option('--web-port <port>', 'development Host Web port', { default: '5050' })
    .option('--web-static-dir <path>', 'Host Web static directory for production start')
    .action(async (options: {
      db: string
      dev?: boolean
      devAdminEmail?: string
      host: string
      manifest?: string
      port: string | number
      publicBaseUrl?: string
      webPort: string | number
      webStaticDir?: string
    }) => {
      const mode = options.dev ? 'dev' : 'prod'
      const result = await hostLifecycle.start({
        dbPath: options.db,
        ...(options.devAdminEmail ? { devAdminEmail: options.devAdminEmail } : {}),
        host: options.host,
        ...(hostLifecycleStatePath(options) ? { manifestPath: hostLifecycleStatePath(options) } : {}),
        mode,
        port: parsePositiveInteger(options.port, '--port'),
        ...(options.publicBaseUrl ? { publicBaseUrl: options.publicBaseUrl } : {}),
        ...(mode === 'dev' ? { webPort: parsePositiveInteger(options.webPort, '--web-port') } : {}),
        ...(options.webStaticDir ? { webStaticDir: options.webStaticDir } : {}),
      })
      printJson(result)
    })
  cli
    .command('status', 'show Host service lifecycle status')
    .option('--manifest <path>', 'Host lifecycle manifest path')
    .action(async (options: { manifest?: string }) => {
      printJson(await hostLifecycle.status({ manifestPath: hostLifecycleStatePath(options) }))
    })
  cli
    .command('stop', 'stop Host services')
    .option('--manifest <path>', 'Host lifecycle manifest path')
    .action(async (options: { manifest?: string }) => {
      printJson(await hostLifecycle.stop({ manifestPath: hostLifecycleStatePath(options) }))
    })
  cli
    .command('clean', 'stop Host services and remove lifecycle manifest')
    .option('--manifest <path>', 'Host lifecycle manifest path')
    .action(async (options: { manifest?: string }) => {
      printJson(await hostLifecycle.clean({ manifestPath: hostLifecycleStatePath(options) }))
    })
  cli
    .command('logs', 'show Host service logs')
    .option('--manifest <path>', 'Host lifecycle manifest path')
    .option('--service <service>', 'service kind or short name, such as api/web/host-serve')
    .option('--tail <n>', 'line count', { default: '80' })
    .action(async (options: { manifest?: string, service?: string, tail?: string | number }) => {
      process.stdout.write(await hostLifecycle.logs({
        manifestPath: hostLifecycleStatePath(options),
        service: options.service,
        tail: parsePositiveInteger(options.tail, '--tail'),
      }))
    })
  cli
    .command('serve', 'serve the Host provisioning/control API')
    .option('--db <path>', 'Host sqlite database path', { default: 'host.db' })
    .option('--dev-admin-email <email>', 'development-only static host admin email')
    .option('--host <host>', 'bind host', { default: '127.0.0.1' })
    .option('--public-base-url <url>', 'public Host base URL', { default: 'http://127.0.0.1:9310' })
    .option('--port <port>', 'listen port', { default: '9310' })
    .option('--web-static-dir <path>', 'Host Web static directory to serve from this process')
    .action(async (options: { db: string, devAdminEmail?: string, host: string, port: string | number, publicBaseUrl: string, webStaticDir?: string }) => {
      const port = Number(options.port)
      if (!Number.isInteger(port) || port <= 0)
        throw new Error(`Invalid port: ${options.port}`)

      const publicBaseUrl = options.publicBaseUrl
      const server = await (deps.serverFactory ?? createHostServer)({
        authUser: options.devAdminEmail
          ? {
              email: options.devAdminEmail,
              roles: ['host:admin'],
              subject: 'dev-admin',
            }
          : null,
        dbPath: options.db,
        publicBaseUrl,
        ...(options.webStaticDir ? { webStaticDir: options.webStaticDir } : {}),
      })
      const bunServe = deps.bunServe ?? Bun.serve
      bunServe({
        fetch: server.fetch,
        hostname: options.host,
        port,
      })
      printJson({
        host: options.host,
        listening: true,
        port,
        publicBaseUrl,
        ...(options.webStaticDir ? { webStaticDir: options.webStaticDir } : {}),
      })
    })
  cli.help()

  const processed = preprocessHostArgv(argv, cli.commands.map(command => command.name))
  try {
    cli.parse(['', 'aiworker-host', ...processed], { run: false })
    if (cli.options.help === true)
      return 0
    if (!cli.matchedCommand) {
      if (processed[0])
        throw new Error(`Unknown command: ${processed[0]}`)
      cli.outputHelp()
      return 0
    }
    await cli.runMatchedCommand()
    return 0
  }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

if (import.meta.main)
  process.exitCode = await runHostCli(process.argv.slice(2))
