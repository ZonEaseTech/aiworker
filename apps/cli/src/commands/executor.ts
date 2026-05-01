import type {
  ExecutorCapabilityEngine,
  ExecutorCapabilityManifest,
  ExecutorMcpServerDescriptor,
  ExecutorMcpTransport,
} from '@zonease/aiworker-shared'

import { accessSync, constants, existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import {
  executorCapabilityEngineSchema,
  executorCapabilityManifestSchema,
  executorMcpServerDescriptorSchema,
  executorMcpTransportSchema,
} from '@zonease/aiworker-shared'
import consola from 'consola'

const MANIFEST_FILE = 'executor-capabilities.json'
const SUPPORTED_ENGINES: Record<ExecutorCapabilityEngine, { binary: string }> = {
  'codex': { binary: 'codex' },
  'claude-code': { binary: 'claude' },
}

const DEFAULT_MANIFEST: ExecutorCapabilityManifest = {
  engines: {},
  schemaVersion: 1,
}

const SENSITIVE_KEY_PATTERN = /authorization|bearer|token|secret|api[-_]?key|private[-_]?key|password/i

export interface ExecutorMcpAddOptions {
  arg?: string | string[]
  command?: string
  description?: string
  dryRun?: boolean
  engine?: string
  env?: string | string[]
  header?: string | string[]
  scope?: string
  transport?: string
  url?: string
}

export interface ExecutorEngineOptions {
  dryRun?: boolean
  engine?: string
}

interface ProjectExecutorContext {
  manifestPath: string
  projectRoot: string
  root: string
}

interface ProjectionCommand {
  args: string[]
  binary: string
  serverName: string
}

interface ValidationIssue {
  code: string
  message: string
  path: string
}

export async function runExecutorMcpAdd(name: string, options: ExecutorMcpAddOptions): Promise<number> {
  const context = resolveProjectExecutorContext()
  if (!context.ok)
    return context.code

  const engine = parseEngine(options.engine)
  if (!engine.ok)
    return engine.code

  const server = buildMcpServerDescriptor(options)
  if (!server.ok)
    return server.code

  const serverIssues = validateServerDescriptor(server.value, `engines.${engine.value}.mcp.${name}`)
  if (serverIssues.length > 0) {
    printValidationIssues('[aiworker executor mcp add] invalid MCP descriptor', serverIssues)
    return 2
  }

  const manifestResult = await loadManifest(context.value.manifestPath)
  if (!manifestResult.ok)
    return manifestResult.code

  const next = upsertMcpServer(manifestResult.manifest, engine.value, name, server.value)

  if (options.dryRun === true) {
    process.stdout.write('[aiworker executor mcp add] dry-run\n')
    process.stdout.write(`Manifest: ${context.value.manifestPath}\n`)
    process.stdout.write(`Engine  : ${engine.value}\n`)
    process.stdout.write(`Server  : ${name}\n`)
    process.stdout.write(`${JSON.stringify(next.engines[engine.value]?.mcp?.[name], null, 2)}\n`)
    return 0
  }

  await saveManifest(context.value.manifestPath, next)
  process.stdout.write('[aiworker executor mcp add] added\n')
  process.stdout.write(`Manifest: ${context.value.manifestPath}\n`)
  process.stdout.write(`Engine  : ${engine.value}\n`)
  process.stdout.write(`Server  : ${name}\n`)
  process.stdout.write('Next    : aiworker executor mcp sync --engine ')
  process.stdout.write(`${engine.value} --dry-run\n`)
  return 0
}

export async function runExecutorMcpSync(options: ExecutorEngineOptions): Promise<number> {
  const context = resolveProjectExecutorContext()
  if (!context.ok)
    return context.code

  const engine = parseEngine(options.engine)
  if (!engine.ok)
    return engine.code

  const manifestResult = await loadManifest(context.value.manifestPath)
  if (!manifestResult.ok)
    return manifestResult.code

  const commands = buildProjectionCommands(manifestResult.manifest, engine.value)
  const issues = collectEngineIssues(manifestResult.manifest, engine.value, {
    rejectSecretRefs: options.dryRun !== true,
    requireBinary: options.dryRun !== true,
  })
  if (issues.length > 0) {
    printValidationIssues('[aiworker executor mcp sync] cannot sync', issues)
    return 1
  }

  if (commands.length === 0) {
    process.stdout.write(`[aiworker executor mcp sync] no enabled MCP servers for ${engine.value}\n`)
    return 0
  }

  process.stdout.write(`[aiworker executor mcp sync] ${options.dryRun === true ? 'dry-run' : 'apply'} ${engine.value}\n`)
  for (const command of commands) {
    process.stdout.write(`  ${shellQuote([command.binary, ...command.args])}\n`)
    if (options.dryRun === true)
      continue

    const result = Bun.spawnSync([command.binary, ...command.args], {
      cwd: context.value.projectRoot,
      env: buildProjectionEnv(),
      stderr: 'pipe',
      stdout: 'pipe',
    })
    if (result.exitCode !== 0) {
      const stderr = new TextDecoder().decode(result.stderr).trim()
      const stdout = new TextDecoder().decode(result.stdout).trim()
      consola.error(`[aiworker executor mcp sync] ${command.serverName} failed with exit code ${result.exitCode}`)
      if (stdout)
        process.stderr.write(`${stdout}\n`)
      if (stderr)
        process.stderr.write(`${stderr}\n`)
      return 1
    }
  }

  return 0
}

export async function runExecutorDoctor(options: { engine?: string } = {}): Promise<number> {
  const context = resolveProjectExecutorContext()
  if (!context.ok)
    return context.code

  const engine = options.engine === undefined ? undefined : parseEngine(options.engine)
  if (engine && !engine.ok)
    return engine.code

  const manifestResult = await loadManifest(context.value.manifestPath)
  if (!manifestResult.ok)
    return manifestResult.code

  const engines = engine ? [engine.value] : Object.keys(manifestResult.manifest.engines) as ExecutorCapabilityEngine[]
  const issues = engines.flatMap(item => collectEngineIssues(manifestResult.manifest, item, { requireBinary: true }))
  const status = issues.length === 0 ? 'PASS' : 'FAIL'

  process.stdout.write('[aiworker executor doctor] executor capability validation\n')
  process.stdout.write(`Root  : ${context.value.root}\n`)
  process.stdout.write(`File  : ${context.value.manifestPath}\n`)
  process.stdout.write(`Status: ${status}\n`)
  if (engines.length === 0)
    process.stdout.write('  PASS    no executor capabilities declared\n')
  for (const item of engines) {
    const binary = SUPPORTED_ENGINES[item].binary
    const binaryStatus = findBinary(binary) ? 'PASS' : 'FAIL'
    const mcpCount = Object.values(manifestResult.manifest.engines[item]?.mcp ?? {}).filter(server => server.disabled !== true).length
    process.stdout.write(`  ${binaryStatus.padEnd(7)} ${item} (binary: ${binary}, mcp: ${mcpCount})\n`)
  }
  for (const issue of issues)
    process.stdout.write(`    - [error] ${issue.code} ${issue.path}: ${issue.message}\n`)

  return issues.length > 0 ? 1 : 0
}

function resolveProjectExecutorContext(): { code: number, ok: false } | { ok: true, value: ProjectExecutorContext } {
  const scope = resolveAiworkerScope()
  if (scope.scope !== 'project' || !scope.projectRoot) {
    consola.error('[aiworker executor] executor capability commands require project scope; run `aiworker init --soul <preset>` in a project first')
    return { code: 2, ok: false }
  }

  const root = path.join(scope.projectRoot, '.aiworker')
  return {
    ok: true,
    value: {
      manifestPath: path.join(root, MANIFEST_FILE),
      projectRoot: scope.projectRoot,
      root,
    },
  }
}

function parseEngine(value: string | undefined): { code: number, ok: false } | { ok: true, value: ExecutorCapabilityEngine } {
  if (value === undefined) {
    consola.error('[aiworker executor] --engine is required; supported engines: codex, claude-code')
    return { code: 2, ok: false }
  }
  const parsed = executorCapabilityEngineSchema.safeParse(value)
  if (!parsed.success) {
    consola.error(`[aiworker executor] unsupported engine "${value}". Supported engines: codex, claude-code`)
    return { code: 2, ok: false }
  }
  return { ok: true, value: parsed.data }
}

function buildMcpServerDescriptor(options: ExecutorMcpAddOptions): { code: number, ok: false } | { ok: true, value: ExecutorMcpServerDescriptor } {
  const scope = options.scope ?? 'project'
  if (scope !== 'project') {
    consola.error('[aiworker executor mcp add] only --scope project is supported')
    return { code: 2, ok: false }
  }

  const transport = parseTransport(options)
  if (!transport.ok)
    return transport

  const server: ExecutorMcpServerDescriptor = {
    scope: 'project',
    transport: transport.value,
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.command === undefined ? {} : { command: options.command }),
    ...(options.url === undefined ? {} : { url: options.url }),
  }

  const args = valuesOf(options.arg)
  if (args.length > 0)
    server.args = args

  const env = parseAssignments(valuesOf(options.env), 'env')
  if (!env.ok)
    return env
  if (Object.keys(env.value).length > 0)
    server.env = env.value

  const headers = parseAssignments(valuesOf(options.header), 'header')
  if (!headers.ok)
    return headers
  if (Object.keys(headers.value).length > 0)
    server.headers = headers.value

  return { ok: true, value: server }
}

function parseTransport(options: ExecutorMcpAddOptions): { code: number, ok: false } | { ok: true, value: ExecutorMcpTransport } {
  if (options.transport !== undefined) {
    const parsed = executorMcpTransportSchema.safeParse(options.transport)
    if (!parsed.success) {
      consola.error(`[aiworker executor mcp add] unsupported transport "${options.transport}". Use stdio, streamable-http, or sse`)
      return { code: 2, ok: false }
    }
    return { ok: true, value: parsed.data }
  }

  if (options.url !== undefined)
    return { ok: true, value: 'streamable-http' }
  return { ok: true, value: 'stdio' }
}

function valuesOf(value: string | string[] | undefined): string[] {
  if (value === undefined)
    return []
  return Array.isArray(value) ? value : [value]
}

function parseAssignments(values: string[], label: string): { code: number, ok: false } | { ok: true, value: Record<string, string | { secretRef: string }> } {
  const out: Record<string, string | { secretRef: string }> = {}
  for (const raw of values) {
    const index = raw.indexOf('=')
    if (index <= 0) {
      consola.error(`[aiworker executor mcp add] --${label} must use key=value`)
      return { code: 2, ok: false }
    }
    const key = raw.slice(0, index).trim()
    const value = raw.slice(index + 1).trim()
    if (key.length === 0 || value.length === 0) {
      consola.error(`[aiworker executor mcp add] --${label} must use non-empty key=value`)
      return { code: 2, ok: false }
    }
    out[key] = value.startsWith('secretRef:')
      ? { secretRef: value.slice('secretRef:'.length) }
      : value
  }
  return { ok: true, value: out }
}

async function loadManifest(manifestPath: string): Promise<
  | { code: number, ok: false }
  | { manifest: ExecutorCapabilityManifest, ok: true }
> {
  if (!existsSync(manifestPath))
    return { manifest: DEFAULT_MANIFEST, ok: true }

  try {
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown
    const result = executorCapabilityManifestSchema.safeParse(parsed)
    if (!result.success) {
      printValidationIssues('[aiworker executor] invalid executor capability manifest', result.error.issues.map(issue => ({
        code: 'manifest.invalid',
        message: issue.message,
        path: issue.path.join('.') || MANIFEST_FILE,
      })))
      return { code: 1, ok: false }
    }
    return { manifest: result.data, ok: true }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    consola.error(`[aiworker executor] failed to read ${manifestPath}: ${message}`)
    return { code: 1, ok: false }
  }
}

async function saveManifest(manifestPath: string, manifest: ExecutorCapabilityManifest): Promise<void> {
  await mkdir(path.dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

function upsertMcpServer(
  manifest: ExecutorCapabilityManifest,
  engine: ExecutorCapabilityEngine,
  name: string,
  server: ExecutorMcpServerDescriptor,
): ExecutorCapabilityManifest {
  return {
    ...manifest,
    engines: {
      ...manifest.engines,
      [engine]: {
        ...(manifest.engines[engine] ?? {}),
        mcp: {
          ...(manifest.engines[engine]?.mcp ?? {}),
          [name]: server,
        },
      },
    },
  }
}

function collectEngineIssues(
  manifest: ExecutorCapabilityManifest,
  engine: ExecutorCapabilityEngine,
  options: { rejectSecretRefs?: boolean, requireBinary: boolean },
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const config = manifest.engines[engine]
  const binary = SUPPORTED_ENGINES[engine].binary
  if (options.requireBinary && !findBinary(binary)) {
    issues.push({
      code: 'executor.binary_missing',
      message: `Required engine CLI "${binary}" was not found on PATH.`,
      path: `engines.${engine}`,
    })
  }

  for (const [name, server] of Object.entries(config?.mcp ?? {})) {
    if (server.disabled === true)
      continue
    issues.push(...validateServerDescriptor(server, `engines.${engine}.mcp.${name}`))
    if (options.rejectSecretRefs === true)
      issues.push(...collectSecretRefProjectionIssues(server, `engines.${engine}.mcp.${name}`))
  }
  return issues
}

function validateServerDescriptor(server: ExecutorMcpServerDescriptor, basePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const parsed = executorMcpServerDescriptorSchema.safeParse(server)
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map(issue => ({
      code: 'executor.mcp.invalid',
      message: issue.message,
      path: `${basePath}.${issue.path.join('.')}`,
    })))
  }
  if (server.transport === 'stdio' && !server.command) {
    issues.push({
      code: 'executor.mcp.stdio_missing_command',
      message: 'stdio MCP servers require command.',
      path: basePath,
    })
  }
  if ((server.transport === 'streamable-http' || server.transport === 'sse') && !server.url) {
    issues.push({
      code: 'executor.mcp.http_missing_url',
      message: `${server.transport} MCP servers require url.`,
      path: basePath,
    })
  }
  issues.push(...collectSecretIssues(server, basePath))
  return issues
}

function collectSecretIssues(value: unknown, pathValue: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (Array.isArray(value)) {
    value.forEach((item, index) => issues.push(...collectSecretIssues(item, `${pathValue}.${index}`)))
    return issues
  }
  if (!isRecord(value))
    return issues

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${pathValue}.${key}`
    if (key === 'secretRef')
      continue
    if (SENSITIVE_KEY_PATTERN.test(key) && !isSecretRef(child)) {
      issues.push({
        code: 'executor.mcp.plaintext_secret',
        message: `Secret-like field "${childPath}" must use { "secretRef": "..." }.`,
        path: childPath,
      })
      continue
    }
    issues.push(...collectSecretIssues(child, childPath))
  }
  return issues
}

function collectSecretRefProjectionIssues(value: unknown, pathValue: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (Array.isArray(value)) {
    value.forEach((item, index) => issues.push(...collectSecretRefProjectionIssues(item, `${pathValue}.${index}`)))
    return issues
  }
  if (!isRecord(value))
    return issues

  if (isSecretRef(value)) {
    issues.push({
      code: 'executor.mcp.secret_ref_projection_unsupported',
      message: 'Non-dry-run sync cannot hydrate secretRef values yet; run dry-run or configure this server with the engine CLI after resolving the secret manually.',
      path: pathValue,
    })
    return issues
  }

  for (const [key, child] of Object.entries(value))
    issues.push(...collectSecretRefProjectionIssues(child, `${pathValue}.${key}`))
  return issues
}

function buildProjectionCommands(manifest: ExecutorCapabilityManifest, engine: ExecutorCapabilityEngine): ProjectionCommand[] {
  const config = manifest.engines[engine]
  if (!config?.mcp)
    return []
  const binary = SUPPORTED_ENGINES[engine].binary
  return Object.entries(config.mcp)
    .filter(([, server]) => server.disabled !== true)
    .map(([serverName, server]) => ({
      args: buildMcpAddArgs(serverName, server),
      binary,
      serverName,
    }))
}

function buildMcpAddArgs(name: string, server: ExecutorMcpServerDescriptor): string[] {
  const args = ['mcp', 'add', name, '--scope', server.scope]
  if (server.transport !== 'stdio')
    args.push('--transport', server.transport)
  if (server.url)
    args.push('--url', server.url)
  appendAssignments(args, '--env', server.env)
  appendAssignments(args, '--header', server.headers)
  if (server.transport === 'stdio' && server.command)
    args.push('--', server.command, ...(server.args ?? []))
  return args
}

function appendAssignments(args: string[], flag: string, values: Record<string, string | { secretRef: string }> | undefined): void {
  if (!values)
    return
  for (const [key, value] of Object.entries(values)) {
    const rendered = isSecretRef(value) ? `secretRef:${value.secretRef}` : value
    args.push(flag, `${key}=${rendered}`)
  }
}

function findBinary(binary: string): string | null {
  const pathValue = process.env.PATH ?? ''
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir)
      continue
    const candidate = path.join(dir, binary)
    try {
      if (existsSync(candidate)) {
        accessSync(candidate, constants.X_OK)
        return candidate
      }
    }
    catch {
      // keep scanning
    }
  }
  return null
}

function buildProjectionEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const exact = new Set(['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'PWD', 'LANG', 'TZ', 'TERM', 'TMPDIR', 'TMP', 'TEMP'])
  const prefixes = ['LC_', 'NODE_', 'NPM_CONFIG_', 'XDG_', 'CLAUDE_', 'CODEX_']
  const blockedPrefixes = ['AIWORKER_', 'INTERNAL_', 'WORKER_']
  const blockedSuffixes = ['_TOKEN', '_SECRET', '_API_KEY', '_PRIVATE_KEY', '_PASSWORD']
  const out: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined)
      continue
    if (blockedPrefixes.some(prefix => key.startsWith(prefix)))
      continue
    if (blockedSuffixes.some(suffix => key.endsWith(suffix)))
      continue
    if (!exact.has(key) && !prefixes.some(prefix => key.startsWith(prefix)))
      continue
    out[key] = value
  }
  return out
}

function printValidationIssues(title: string, issues: ValidationIssue[]): void {
  consola.error(title)
  for (const issue of issues)
    process.stderr.write(`  - ${issue.code} ${issue.path}: ${issue.message}\n`)
}

function shellQuote(argv: string[]): string {
  return argv.map((value) => {
    if (/^[\w./:=@+-]+$/.test(value))
      return value
    return `'${value.replaceAll('\'', '\'\\\'\'')}'`
  }).join(' ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isSecretRef(value: unknown): value is { secretRef: string } {
  return isRecord(value) && typeof value.secretRef === 'string' && value.secretRef.length > 0
}
