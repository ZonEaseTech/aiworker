#!/usr/bin/env bun
import type { WorkerRegistry } from '@zonease/aiworker-host-control'
import type { HostLifecycle } from './host-lifecycle'
import type { createHostServer as createHostServerType } from './host-server'

import process from 'node:process'

import { createWorkerRegistry } from '@zonease/aiworker-host-control'
import cac from 'cac'
import { createHostLifecycle } from './host-lifecycle'
import { createHostServer } from './host-server'
import { assertHostSessionSecret } from './host-session-cookie'

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

function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/, '')
}

function readNonEmptyEnvValue(env: Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name]?.trim()
  return value ? value : undefined
}

const logtoSessionEnvKeys = [
  'AIWORKER_HOST_SESSION_SECRET',
  'LOGTO_CLIENT_ID',
  'LOGTO_CLIENT_SECRET',
  'LOGTO_ENDPOINT',
  'LOGTO_ISSUER',
] as const

function buildSessionAuthFromEnv(env: Record<string, string | undefined>, redirectBaseUrl: string) {
  const hasAnySessionEnv = logtoSessionEnvKeys.some(key => env[key] !== undefined)
  if (!hasAnySessionEnv)
    return undefined

  const missingKeys = logtoSessionEnvKeys.filter(key => !readNonEmptyEnvValue(env, key))
  if (missingKeys.length > 0)
    throw new Error(`Missing required Logto env: ${missingKeys.join(', ')}`)

  const sessionSecret = assertHostSessionSecret(readNonEmptyEnvValue(env, 'AIWORKER_HOST_SESSION_SECRET')!)
  const clientId = readNonEmptyEnvValue(env, 'LOGTO_CLIENT_ID')
  const clientSecret = readNonEmptyEnvValue(env, 'LOGTO_CLIENT_SECRET')
  const endpoint = readNonEmptyEnvValue(env, 'LOGTO_ENDPOINT')
  const issuer = readNonEmptyEnvValue(env, 'LOGTO_ISSUER')
  return {
    oidc: {
      clientId: clientId!,
      clientSecret: clientSecret!,
      endpoint: endpoint!,
      issuer: issuer!,
      redirectUri: `${normalizeBaseUrl(redirectBaseUrl)}/auth/callback`,
    },
    sessionSecret,
  }
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

interface HostLifecycleCommandOptions {
  browserBaseUrl?: string
  controlBaseUrl?: string
  db?: string
  dev?: boolean
  devAdminEmail?: string
  host?: string
  manifest?: string
  port?: string | number
  publicBaseUrl?: string
  webPort?: string | number
  webStaticDir?: string
}

function hostLifecycleInput(options: HostLifecycleCommandOptions): {
  dbPath: string
  devAdminEmail?: string
  host: string
  hostBrowserBaseUrl?: string
  hostControlBaseUrl?: string
  manifestPath?: string
  mode: 'dev' | 'prod'
  port: number
  publicBaseUrl?: string
  sessionAuth?: ReturnType<typeof buildSessionAuthFromEnv>
  webPort?: number
  webStaticDir?: string
} {
  const mode = options.dev ? 'dev' : 'prod'
  const host = options.host ?? '127.0.0.1'
  const port = parsePositiveInteger(options.port ?? '9117', '--port')
  const hostBrowserBaseUrl = options.browserBaseUrl ?? readNonEmptyEnvValue(process.env, 'AIWORKER_HOST_BROWSER_BASE_URL')
  const hostControlBaseUrl = options.controlBaseUrl ?? readNonEmptyEnvValue(process.env, 'AIWORKER_HOST_CONTROL_BASE_URL')
  const publicBaseUrl = options.publicBaseUrl ?? readNonEmptyEnvValue(process.env, 'AIWORKER_HOST_API_URL')
  const sessionAuth = buildSessionAuthFromEnv(process.env, hostBrowserBaseUrl ?? publicBaseUrl ?? `http://${host}:${port}`)
  return {
    dbPath: options.db ?? `${process.env.HOME ?? '.'}/.aiworker-dev/host.db`,
    ...(!sessionAuth && options.devAdminEmail ? { devAdminEmail: options.devAdminEmail } : {}),
    host,
    ...(hostBrowserBaseUrl ? { hostBrowserBaseUrl } : {}),
    ...(hostControlBaseUrl ? { hostControlBaseUrl } : {}),
    ...(hostLifecycleStatePath(options) ? { manifestPath: hostLifecycleStatePath(options) } : {}),
    mode,
    port,
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
    ...(sessionAuth ? { sessionAuth } : {}),
    ...(mode === 'dev' ? { webPort: parsePositiveInteger(options.webPort ?? '5050', '--web-port') } : {}),
    ...(options.webStaticDir ? { webStaticDir: options.webStaticDir } : {}),
  }
}

function addHostLifecycleStartOptions(command: ReturnType<typeof cac>['commands'][number]) {
  return command
    .option('--db <path>', 'Host sqlite database path', { default: `${process.env.HOME ?? '.'}/.aiworker-dev/host.db` })
    .option('--dev', 'start development Host API plus Vite Host Web')
    .option('--dev-admin-email <email>', 'development-only static host admin email')
    .option('--browser-base-url <url>', 'Host browser base URL for /host and /workers/:workerId')
    .option('--control-base-url <url>', 'Host control/API base URL for Worker check-in')
    .option('--host <host>', 'bind host', { default: '127.0.0.1' })
    .option('--manifest <path>', 'Host lifecycle manifest path')
    .option('--port <port>', 'Host API or production serve port', { default: '9117' })
    .option('--public-base-url <url>', 'public Host base URL')
    .option('--web-port <port>', 'development Host Web port', { default: '5050' })
    .option('--web-static-dir <path>', 'Host Web static directory for production start')
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

const allowedProvisioningAdapters = ['aissh', 'docker', 'local'] as const
const allowedProvisioningMaturities = ['production', 'preview', 'dev'] as const

type ProvisioningAdapterOption = typeof allowedProvisioningAdapters[number]
type ProvisioningMaturityOption = typeof allowedProvisioningMaturities[number]

function requireTrimmedOption(value: unknown, optionName: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed)
    throw new Error(`Missing required option: ${optionName}`)
  return trimmed
}

function requireProvisioningAdapter(value: unknown): ProvisioningAdapterOption {
  const adapter = typeof value === 'string' ? value.trim() : ''
  if (allowedProvisioningAdapters.includes(adapter as ProvisioningAdapterOption))
    return adapter as ProvisioningAdapterOption
  throw new Error(`Invalid --adapter <type>: ${value}. Expected one of: ${allowedProvisioningAdapters.join(', ')}`)
}

function requireProvisioningMaturity(value: unknown): ProvisioningMaturityOption {
  const maturity = typeof value === 'string' ? value.trim() : ''
  if (allowedProvisioningMaturities.includes(maturity as ProvisioningMaturityOption))
    return maturity as ProvisioningMaturityOption
  throw new Error(`Invalid --maturity <level>: ${value}. Expected one of: ${allowedProvisioningMaturities.join(', ')}`)
}

const assignmentViewFields = [
  'assignedEmail',
  'assignmentId',
  'serverRef',
  'provisioningTargetRef',
  'provisioningTargetMaturity',
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
  const provisionToken = typeof record.provisionToken === 'string' ? record.provisionToken : undefined
  const view = projectAllowedFields(record, [
    'deliveryReceipt',
    'deliveryStatus',
    'expectedCheckInDeadline',
    'operatorHint',
    'provisionCommand',
    'provisionToken',
  ])
  if (provisionToken) {
    view.provisionCommand = scrubExplicitProvisionToken(view.provisionCommand, provisionToken)
    if (isRecord(view.deliveryReceipt) && typeof view.deliveryReceipt.command === 'string') {
      view.deliveryReceipt = {
        ...view.deliveryReceipt,
        command: scrubExplicitProvisionToken(view.deliveryReceipt.command, provisionToken),
      }
    }
  }
  if ('assignment' in record)
    view.assignment = projectAssignmentView(record.assignment)
  return view
}

function scrubExplicitProvisionToken(value: unknown, provisionToken: string): unknown {
  if (typeof value !== 'string' || provisionToken.length === 0)
    return value
  return value.replaceAll(provisionToken, '<redacted>')
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

function mapLegacyServerToProvisioningTarget(server: unknown): Record<string, unknown> | undefined {
  const record = requireRecord(server, 'legacy host server')
  if (typeof record.id !== 'string' || record.id.trim().length === 0)
    return

  return {
    adapterType: 'aissh',
    capabilities: ['remote-delivery', 'worker-check-in', 'worker-access'],
    ...(typeof record.notes === 'string' ? { description: record.notes } : {}),
    displayName: typeof record.name === 'string' && record.name.trim() ? record.name : record.id,
    health: 'ready',
    id: `aissh:${record.id}`,
    maturity: 'production',
    ref: record.id,
  }
}

function projectHostOptions(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, 'host options')
  const provisioningTargetSourceError
    = typeof record.provisioningTargetSourceError === 'string' ? record.provisioningTargetSourceError
      : (typeof record.serverSourceError === 'string' ? record.serverSourceError : undefined)

  const provisioningTargets = Array.isArray(record.provisioningTargets)
    ? record.provisioningTargets.map(target => projectAllowedFields(target, [
      'id',
      'displayName',
      'adapterType',
      'maturity',
      'ref',
      'description',
      'capabilities',
      'health',
    ]))
    : Array.isArray(record.servers)
      ? record.servers.flatMap((server) => {
        const projectedServer = mapLegacyServerToProvisioningTarget(server)
        return projectedServer ? [projectedServer] : []
      })
      : []

  return {
    ...(provisioningTargetSourceError ? { provisioningTargetSourceError } : {}),
    access: record.access,
    auth: record.auth,
    provisioningTargets,
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
    .command('option list', 'list provisioning targets and Soul releases through the Host API')
    .option('--host <url>', 'Host API base URL', { default: 'http://127.0.0.1:9117' })
    .action(async (options: { host?: string }) => {
      const host = normalizeHostUrl(options.host)
      const result = await requestHostJson(fetchImpl, `${host}/api/host/options`)
      printJson(projectHostOptions(result))
    })
  cli
    .command('assignment create', 'create a Worker assignment through the Host API')
    .option('--email <email>', 'assigned employee email')
    .option('--target <ref>', 'provisioning target reference')
    .option('--adapter <type>', 'provisioning adapter type: aissh, docker, local')
    .option('--maturity <level>', 'target maturity: production, preview, dev')
    .option('--callback-url <url>', 'Worker-reachable Host control URL for this target')
    .option('--server <server>', 'legacy alias for --target; maps to aissh production provisioning')
    .option('--soul <soul>', 'Soul release reference')
    .option('--host <url>', 'Host API base URL', { default: 'http://127.0.0.1:9117' })
    .action(async (options: {
      adapter?: string
      callbackUrl?: string
      email?: string
      host?: string
      maturity?: string
      server?: string
      soul?: string
      target?: string
    }) => {
      if (!options.email)
        throw new Error('Missing required option: --email <email>')
      if (options.target !== undefined && options.server !== undefined)
        throw new Error('Cannot combine --target <ref> with legacy --server <server>')
      const target = options.server !== undefined
        ? requireTrimmedOption(options.server, '--server <server>')
        : requireTrimmedOption(options.target, '--target <ref>')
      const adapter = options.server !== undefined
        ? 'aissh'
        : requireProvisioningAdapter(options.adapter ?? 'aissh')
      const maturity = options.server !== undefined
        ? 'production'
        : requireProvisioningMaturity(options.maturity ?? 'production')
      if (options.adapter !== undefined)
        requireProvisioningAdapter(options.adapter)
      if (options.maturity !== undefined)
        requireProvisioningMaturity(options.maturity)
      if (!options.soul)
        throw new Error('Missing required option: --soul <soul>')

      const host = normalizeHostUrl(options.host)
      const result = await requestHostJson(fetchImpl, `${host}/api/host/assignments`, {
        body: JSON.stringify({
          assignedEmail: options.email,
          ...(options.callbackUrl ? { adapterRuntimeControlBaseUrl: options.callbackUrl } : {}),
          provisioningTarget: {
            adapterType: adapter,
            maturity,
            ref: target,
          },
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
  addHostLifecycleStartOptions(cli.commands.at(-1)!)
    .action(async (options: HostLifecycleCommandOptions) => {
      printJson(await hostLifecycle.start(hostLifecycleInput(options)))
    })
  cli
    .command('daemon start', 'start the Host daemon in background')
  addHostLifecycleStartOptions(cli.commands.at(-1)!)
    .action(async (options: HostLifecycleCommandOptions) => {
      printJson(await hostLifecycle.start(hostLifecycleInput(options)))
    })
  cli
    .command('daemon foreground', 'run the Host daemon in the current process')
  addHostLifecycleStartOptions(cli.commands.at(-1)!)
    .action(async (options: HostLifecycleCommandOptions) => {
      printJson(await hostLifecycle.foreground(hostLifecycleInput(options)))
    })
  cli
    .command('restart', 'restart Host services')
  addHostLifecycleStartOptions(cli.commands.at(-1)!)
    .action(async (options: HostLifecycleCommandOptions) => {
      printJson(await hostLifecycle.restart(hostLifecycleInput(options)))
    })
  cli
    .command('daemon restart', 'restart the Host daemon')
  addHostLifecycleStartOptions(cli.commands.at(-1)!)
    .action(async (options: HostLifecycleCommandOptions) => {
      printJson(await hostLifecycle.restart(hostLifecycleInput(options)))
    })
  cli
    .command('daemon status', 'show Host daemon lifecycle status')
    .option('--manifest <path>', 'Host lifecycle manifest path')
    .action(async (options: { manifest?: string }) => {
      printJson(await hostLifecycle.status({ manifestPath: hostLifecycleStatePath(options) }))
    })
  cli
    .command('daemon stop', 'stop the Host daemon')
    .option('--manifest <path>', 'Host lifecycle manifest path')
    .action(async (options: { manifest?: string }) => {
      printJson(await hostLifecycle.stop({ manifestPath: hostLifecycleStatePath(options) }))
    })
  cli
    .command('daemon clean', 'stop the Host daemon and remove lifecycle manifest')
    .option('--manifest <path>', 'Host lifecycle manifest path')
    .action(async (options: { manifest?: string }) => {
      printJson(await hostLifecycle.clean({ manifestPath: hostLifecycleStatePath(options) }))
    })
  cli
    .command('daemon logs', 'show Host daemon logs')
    .option('--manifest <path>', 'Host lifecycle manifest path')
    .option('--service <service>', 'service kind or short name, such as api/web/host-daemon')
    .option('--tail <n>', 'line count', { default: '80' })
    .action(async (options: { manifest?: string, service?: string, tail?: string | number }) => {
      process.stdout.write(await hostLifecycle.logs({
        manifestPath: hostLifecycleStatePath(options),
        service: options.service,
        tail: parsePositiveInteger(options.tail, '--tail'),
      }))
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
    .option('--browser-base-url <url>', 'Host browser base URL for /host and /workers/:workerId')
    .option('--control-base-url <url>', 'Host control/API base URL for Worker check-in')
    .option('--port <port>', 'listen port', { default: '9310' })
    .option('--web-static-dir <path>', 'Host Web static directory to serve from this process')
    .action(async (options: {
      browserBaseUrl?: string
      controlBaseUrl?: string
      db: string
      devAdminEmail?: string
      host: string
      port: string | number
      publicBaseUrl: string
      webStaticDir?: string
    }) => {
      const port = Number(options.port)
      if (!Number.isInteger(port) || port <= 0)
        throw new Error(`Invalid port: ${options.port}`)

      const publicBaseUrl = options.publicBaseUrl
      const hostBrowserBaseUrl = options.browserBaseUrl ?? (options.webStaticDir ? undefined : 'http://127.0.0.1:5050')
      const sessionAuth = buildSessionAuthFromEnv(process.env, options.browserBaseUrl ?? publicBaseUrl)
      const server = await (deps.serverFactory ?? createHostServer)({
        authUser: !sessionAuth && options.devAdminEmail
          ? {
              email: options.devAdminEmail,
              roles: ['host:admin'],
              subject: 'dev-admin',
            }
          : null,
        dbPath: options.db,
        ...(hostBrowserBaseUrl ? { hostBrowserBaseUrl } : {}),
        ...(options.controlBaseUrl ? { hostControlBaseUrl: options.controlBaseUrl } : {}),
        publicBaseUrl,
        ...(sessionAuth ? { sessionAuth } : {}),
        ...(options.webStaticDir ? { webStaticDir: options.webStaticDir } : {}),
      })
      const bunServe = deps.bunServe ?? Bun.serve
      bunServe({
        fetch: (request, bunServer) => server.fetch(request, bunServer),
        hostname: options.host,
        port,
        websocket: server.websocket,
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
