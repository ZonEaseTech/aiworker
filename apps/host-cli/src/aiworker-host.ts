#!/usr/bin/env bun
import type { WorkerRegistry } from '@zonease/aiworker-host-control'
import type { createHostServer as createHostServerType } from './host-server'

import process from 'node:process'

import { createWorkerRegistry } from '@zonease/aiworker-host-control'
import cac from 'cac'
import { createHostServer } from './host-server'

export interface HostCliDeps {
  bunServe?: typeof Bun.serve
  fetch?: typeof fetch
  registry?: WorkerRegistry
  serverFactory?: typeof createHostServerType
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function normalizeHostUrl(input: string | undefined): string {
  return (input ?? 'http://127.0.0.1:9117').replace(/\/+$/, '')
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
  const cli = cac('aiworker-host')
  cli
    .command('worker list', 'list workers registered with this Host control plane')
    .action(() => {
      printJson({ workers: registry.list() })
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
    .command('serve', 'serve the Host provisioning/control API')
    .option('--db <path>', 'Host sqlite database path', { default: 'host.db' })
    .option('--dev-admin-email <email>', 'development-only static host admin email')
    .option('--public-base-url <url>', 'public Host base URL', { default: 'http://127.0.0.1:9310' })
    .option('--port <port>', 'listen port', { default: '9310' })
    .action(async (options: { db: string, devAdminEmail?: string, port: string | number, publicBaseUrl: string }) => {
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
      })
      const bunServe = deps.bunServe ?? Bun.serve
      bunServe({
        fetch: server.fetch,
        port,
      })
      printJson({ listening: true, port, publicBaseUrl })
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
  process.exit(await runHostCli(process.argv.slice(2)))
