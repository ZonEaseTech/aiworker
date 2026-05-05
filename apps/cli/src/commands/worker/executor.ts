import type {
  EngineKind,
  ExecutorCapabilityEngine,
  ExecutorCapabilityEngineConfig,
  ExecutorCapabilityManifest,
  ExecutorConfig,
  ExecutorMcpServerDescriptor,
  ExecutorMcpTransport,
} from '@zonease/aiworker-shared'

import { accessSync, constants, existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import {
  ConfigVersionConflictError,
  DEFAULT_EXECUTOR_PROFILE,
  DEFAULT_PROFILES,
  getSecretsVault,
  InvalidConfigError,
  mirrorConfigToYaml,
  putConfig,
  readConfig,
  resolveVariant,
} from '@zonease/aiworker-core'
import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import {
  executorCapabilityEngineSchema,
  executorCapabilityManifestSchema,
  executorMcpServerDescriptorSchema,
  executorMcpTransportSchema,
} from '@zonease/aiworker-shared'
import consola from 'consola'
import { loadWorkerContext } from '../../context'

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
  bearerTokenEnvVar?: string
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

export interface ExecutorSelectOptions {
  apply?: boolean
  dryRun?: boolean
  engine?: string
  ifMatch?: number
  modelId?: string
  permissionPolicy?: string
  reasoningId?: string
  variant?: string
}

export interface ExecutorCapabilityListOptions {
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

export type ExecutorReadinessStatus = 'fail' | 'pass' | 'warn'

export interface ExecutorReadinessEngine {
  binary: string
  binaryFound: boolean
  engine: ExecutorCapabilityEngine
  mcpCount: number
}

export interface ExecutorReadinessIssue extends ValidationIssue {
  severity: 'error' | 'warning'
}

export interface ExecutorConfiguredSelection {
  defaultStub: boolean
  engine: EngineKind
  source: 'worker-config'
  variant: string
  version: number
}

export interface ExecutorConfiguredUnavailable {
  message: string
  source: 'unavailable'
}

export type ExecutorConfiguredReport = ExecutorConfiguredSelection | ExecutorConfiguredUnavailable

export interface ExecutorReadinessManifest {
  declaredCapabilities: number
  declaredEngines: number
  empty: boolean
}

export interface ExecutorReadinessReport {
  configuredExecutor: ExecutorConfiguredReport
  engines: ExecutorReadinessEngine[]
  file: string
  issues: ExecutorReadinessIssue[]
  manifest: ExecutorReadinessManifest
  root: string
  status: ExecutorReadinessStatus
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
    requireProjectionCompatibility: true,
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

  const configuredExecutor = await inspectConfiguredExecutor()
  const engines = engine ? [engine.value] : Object.keys(manifestResult.manifest.engines) as ExecutorCapabilityEngine[]
  const issues = engines.flatMap(item => collectEngineIssues(manifestResult.manifest, item, {
    rejectSecretRefs: false,
    requireBinary: false,
    requireProjectionCompatibility: true,
  }))
  const warnings = collectDoctorWarnings(manifestResult.manifest, configuredExecutor, engines)
  const binaryWarnings = engines
    .filter(item => !findBinary(SUPPORTED_ENGINES[item].binary))
    .map<ValidationIssue>(item => ({
      code: 'executor.binary_missing',
      message: `Engine CLI "${SUPPORTED_ENGINES[item].binary}" was not found on PATH; install it before running tasks against ${item}, or pick a different task executor.`,
      path: `engines.${item}`,
    }))
  const allWarnings = [...warnings, ...binaryWarnings]
  // TODO-015: detect fresh-init project so executor doctor can suppress
  // overlay-empty warnings that fire on every default `aiworker init`.
  // Fresh-init = scope.json exists AND no engine has been declared in the
  // manifest. Once an operator declares an engine (even with empty mcp),
  // the warning becomes meaningful — they explicitly opted into the layer.
  const freshInit = detectFreshInitForExecutorDoctor(context.value.root, manifestResult.manifest)
  const overlayEmptyCodes = new Set(['executor-overlay.capabilities.empty', 'executor-overlay.mcp.empty'])
  const surfacedWarnings = freshInit
    ? allWarnings.filter(w => !overlayEmptyCodes.has(w.code))
    : allWarnings
  const surfacedStatus = issues.length > 0
    ? 'FAIL'
    : surfacedWarnings.length > 0 ? 'WARN' : 'OK'
  const sectionStatus = issues.length > 0
    ? 'FAIL'
    : surfacedWarnings.length > 0 ? 'WARN' : 'PASS'
  const freshSuffix = freshInit ? ' (fresh-init defaults; overlay declarations are optional)' : ''

  // TODO-015: leading summary line so operators have a top-level verdict
  // before scanning per-engine PASS / WARN rows.
  process.stdout.write(`[aiworker executor doctor] ${surfacedStatus} — ${engines.length} engine${engines.length === 1 ? '' : 's'}; ${issues.length} ERR · ${surfacedWarnings.length} WARN${freshSuffix}\n`)
  process.stdout.write('[aiworker executor doctor] project executor overlay validation\n')
  process.stdout.write(`Root  : ${context.value.root}\n`)
  process.stdout.write(`File  : ${context.value.manifestPath}\n`)
  process.stdout.write(`Status: ${sectionStatus}\n`)
  printConfiguredExecutor(process.stdout.write.bind(process.stdout), configuredExecutor)
  const manifestSummary = summarizeManifest(manifestResult.manifest)
  if (manifestSummary.empty && freshInit) {
    process.stdout.write(`  PASS    declared project executor overlay entries: 0 (fresh-init default; declare an overlay only when project pins MCP / config)\n`)
  }
  else {
    process.stdout.write(`  ${manifestSummary.empty ? 'WARN' : 'PASS'}    declared project executor overlay entries: ${manifestSummary.declaredCapabilities}\n`)
  }
  for (const item of engines) {
    const binary = SUPPORTED_ENGINES[item].binary
    const binaryFound = findBinary(binary) !== null
    const binaryStatus = binaryFound ? 'PASS' : 'WARN'
    const mcpCount = Object.values(manifestResult.manifest.engines[item]?.mcp ?? {}).filter(server => server.disabled !== true).length
    process.stdout.write(`  ${binaryStatus.padEnd(7)} ${item} binary likely ready (cli: ${binary}, overlay mcp: ${mcpCount})\n`)
    process.stdout.write(`  INFO    ${item} ambient runtime: user/host MCP, skills, plugins, auth and native sessions live outside AIWorker\n`)
  }
  process.stdout.write('  INFO    engine login/auth state is managed by each engine CLI; AIWorker does not probe it\n')
  for (const issue of surfacedWarnings)
    process.stdout.write(`    - [warning] ${issue.code} ${issue.path}: ${issue.message}\n`)
  for (const issue of issues)
    process.stdout.write(`    - [error] ${issue.code} ${issue.path}: ${issue.message}\n`)

  return issues.length > 0 ? 1 : 0
}

/**
 * TODO-015: fresh-init detection. Fresh = scope.json exists (so init has
 * run) AND the executor capability manifest declares zero engines. The
 * default `aiworker init` writes `executor-capabilities.json` with an
 * empty `engines` map, so file existence alone is not a useful signal —
 * we look at semantic content. Once an operator declares any engine, the
 * project leaves fresh-init mode and the empty-overlay warning becomes
 * informative (they opted into the layer).
 *
 * `aiworkerRoot` here is `.aiworker/` itself (resolved by
 * `resolveProjectExecutorContext`), not the surrounding project root —
 * `path.join(aiworkerRoot, 'scope.json')` is correct as-is.
 */
function detectFreshInitForExecutorDoctor(
  aiworkerRoot: string,
  manifest: ExecutorCapabilityManifest,
): boolean {
  if (!existsSync(path.join(aiworkerRoot, 'scope.json')))
    return false
  if (Object.keys(manifest.engines).length > 0)
    return false
  return true
}

export async function runExecutorSelect(options: ExecutorSelectOptions): Promise<number> {
  const engine = parseTaskExecutorEngine(options.engine)
  if (!engine.ok)
    return engine.code

  const variant = options.variant ?? 'default'
  if (options.permissionPolicy !== undefined && !isPermissionPolicy(options.permissionPolicy)) {
    consola.error('[aiworker executor select] --permission-policy must be auto, supervised, or plan')
    return 2
  }
  const target: ExecutorConfig = {
    engine: engine.value,
    variant,
    ...(options.modelId === undefined ? {} : { modelId: options.modelId }),
    ...(options.reasoningId === undefined ? {} : { reasoningId: options.reasoningId }),
    ...(options.permissionPolicy === undefined ? {} : { permissionPolicy: options.permissionPolicy }),
  }
  try {
    resolveVariant(target)
  }
  catch (err) {
    consola.error(`[aiworker executor select] ${err instanceof Error ? err.message : String(err)}`)
    return 2
  }

  await loadExistingScopeDotenv()
  const ctx = await loadWorkerContext({ silent: true })
  const stored = await readConfig(ctx.db)
  const nextConfig: typeof stored.config = {
    ...stored.config,
    executor: target,
  }

  process.stdout.write('[aiworker executor select] ')
  process.stdout.write(options.apply === true ? 'apply\n' : 'dry-run\n')
  process.stdout.write(`Current : ${formatExecutorProfile(stored.config.executor)} (config v${stored.version})\n`)
  process.stdout.write(`Target  : ${formatExecutorProfile(target)}\n`)
  if (options.ifMatch !== undefined)
    process.stdout.write(`If-Match: ${options.ifMatch}\n`)
  if (options.apply !== true) {
    process.stdout.write('Write   : skipped; pass --apply to persist this executor selection.\n')
    process.stdout.write('Next    : aiworker executor doctor --engine ')
    process.stdout.write(`${engine.value === 'claude-code' ? 'claude-code' : engine.value}\n`)
    return 0
  }

  try {
    const result = await putConfig(
      ctx.db,
      getSecretsVault(),
      nextConfig,
      options.ifMatch === undefined ? {} : { ifMatchVersion: options.ifMatch },
    )
    await mirrorConfigToYaml(ctx.workerId, result.config, result.version)
    process.stdout.write(`Stored  : config v${result.version}\n`)
    process.stdout.write('Next    : aiworker run --message "hello" --dry-run\n')
    return 0
  }
  catch (err) {
    if (err instanceof InvalidConfigError) {
      consola.error(`[aiworker executor select] invalid config: ${JSON.stringify(err.issues, null, 2)}`)
      return 2
    }
    if (err instanceof ConfigVersionConflictError) {
      consola.error(`[aiworker executor select] version conflict: expected ${err.expected}, stored is ${err.actual}`)
      return 3
    }
    throw err
  }
}

export async function runExecutorCapabilityList(options: ExecutorCapabilityListOptions = {}): Promise<number> {
  const context = resolveProjectExecutorContext()
  if (!context.ok)
    return context.code

  const engine = options.engine === undefined ? undefined : parseEngine(options.engine)
  if (engine && !engine.ok)
    return engine.code

  const manifestResult = await loadManifest(context.value.manifestPath)
  if (!manifestResult.ok)
    return manifestResult.code

  const entries = listCapabilityEntries(manifestResult.manifest)
    .filter(entry => engine === undefined || entry.engine === engine.value)

  process.stdout.write('[aiworker executor capability list]\n')
  process.stdout.write(`Root  : ${context.value.root}\n`)
  process.stdout.write(`File  : ${context.value.manifestPath}\n`)
  if (entries.length === 0) {
    process.stdout.write('  WARN    no project executor overlay declared\n')
    return 0
  }
  for (const entry of entries) {
    const disabled = entry.disabled ? 'disabled' : 'enabled'
    process.stdout.write(`  ${entry.engine}.${entry.kind}.${entry.name} (${entry.status}, ${disabled})\n`)
  }
  return 0
}

export async function runExecutorCapabilityShow(ref: string): Promise<number> {
  const context = resolveProjectExecutorContext()
  if (!context.ok)
    return context.code

  const parsed = parseCapabilityRef(ref)
  if (!parsed.ok)
    return parsed.code

  const manifestResult = await loadManifest(context.value.manifestPath)
  if (!manifestResult.ok)
    return manifestResult.code

  const descriptor = readCapabilityDescriptor(manifestResult.manifest, parsed.value)
  if (descriptor === undefined) {
    consola.error(`[aiworker executor capability show] capability not found: ${ref}`)
    return 2
  }

  process.stdout.write(`${JSON.stringify({
    ref,
    descriptor,
  }, null, 2)}\n`)
  return 0
}

export async function inspectExecutorReadiness(): Promise<
  | { code: number, ok: false }
  | { ok: true, report: ExecutorReadinessReport }
> {
  const context = resolveProjectExecutorContext({ quiet: true })
  if (!context.ok)
    return context

  const manifestResult = await loadManifestForInspection(context.value.manifestPath)
  const configuredExecutor = await inspectConfiguredExecutor()
  if (!manifestResult.ok) {
    const issues = manifestResult.issues.map(issue => ({ ...issue, severity: 'error' as const }))
    return {
      ok: true,
      report: {
        configuredExecutor,
        engines: [],
        file: context.value.manifestPath,
        issues,
        manifest: { declaredCapabilities: 0, declaredEngines: 0, empty: true },
        root: context.value.root,
        status: rollupReadinessStatus(issues),
      },
    }
  }

  const engines = executorEnginesToInspect(manifestResult.manifest, configuredExecutor)
  const issues: ExecutorReadinessIssue[] = []
  const summaries: ExecutorReadinessEngine[] = []
  const manifestSummary = summarizeManifest(manifestResult.manifest)

  if (configuredExecutor.source === 'worker-config' && configuredExecutor.defaultStub) {
    issues.push({
      code: 'executor.config_default_stub',
      message: 'Worker config still selects the safe http/default stub executor; run `aiworker executor select --engine <engine> --apply` (candidates: claude-code | codex | acp | cursor | mcp | http) when ready.',
      path: 'worker_config.executor',
      severity: 'warning',
    })
  }
  if (manifestSummary.empty) {
    issues.push({
      code: 'executor.capability_manifest_empty',
      message: 'Project executor overlay is empty; AIWorker treats it as a bootstrap hint only, not as the complete view of effective executor capabilities.',
      path: MANIFEST_FILE,
      severity: 'warning',
    })
  }

  for (const engine of engines) {
    const binary = SUPPORTED_ENGINES[engine].binary
    const binaryFound = findBinary(binary) !== null
    const mcpCount = Object.values(manifestResult.manifest.engines[engine]?.mcp ?? {})
      .filter(server => server.disabled !== true)
      .length
    summaries.push({ binary, binaryFound, engine, mcpCount })

    if (!binaryFound) {
      issues.push({
        code: 'executor.binary_missing',
        message: `Engine CLI "${binary}" was not found on PATH; configure the engine CLI or continue with another executor.`,
        path: `engines.${engine}`,
        severity: 'warning',
      })
    }

    issues.push(...collectEngineIssues(manifestResult.manifest, engine, {
      requireBinary: false,
      requireProjectionCompatibility: true,
    })
      .map(issue => ({ ...issue, severity: 'error' as const })))
  }

  return {
    ok: true,
    report: {
      configuredExecutor,
      engines: summaries,
      file: context.value.manifestPath,
      issues,
      manifest: manifestSummary,
      root: context.value.root,
      status: rollupReadinessStatus(issues),
    },
  }
}

function resolveProjectExecutorContext(options: { quiet?: boolean } = {}): { code: number, ok: false } | { ok: true, value: ProjectExecutorContext } {
  const scope = resolveAiworkerScope()
  if (scope.scope !== 'project' || !scope.projectRoot) {
    if (options.quiet !== true)
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

function parseTaskExecutorEngine(value: string | undefined): { code: number, ok: false } | { ok: true, value: EngineKind } {
  if (value === undefined) {
    consola.error(`[aiworker executor select] --engine is required; supported engines: ${Object.keys(DEFAULT_PROFILES).join(', ')}`)
    return { code: 2, ok: false }
  }
  if (value in DEFAULT_PROFILES)
    return { ok: true, value: value as EngineKind }
  consola.error(`[aiworker executor select] unsupported engine "${value}". Supported engines: ${Object.keys(DEFAULT_PROFILES).join(', ')}`)
  return { code: 2, ok: false }
}

function isPermissionPolicy(value: string): value is NonNullable<ExecutorConfig['permissionPolicy']> {
  return value === 'auto' || value === 'supervised' || value === 'plan'
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
    ...(options.bearerTokenEnvVar === undefined ? {} : { bearerTokenEnvVar: options.bearerTokenEnvVar }),
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
      printValidationIssues('[aiworker executor] invalid project executor overlay manifest', result.error.issues.map(issue => ({
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

async function loadManifestForInspection(manifestPath: string): Promise<
  | { issues: ValidationIssue[], ok: false }
  | { manifest: ExecutorCapabilityManifest, ok: true }
> {
  if (!existsSync(manifestPath))
    return { manifest: DEFAULT_MANIFEST, ok: true }

  try {
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown
    const result = executorCapabilityManifestSchema.safeParse(parsed)
    if (!result.success) {
      return {
        issues: result.error.issues.map(issue => ({
          code: 'manifest.invalid',
          message: issue.message,
          path: issue.path.join('.') || MANIFEST_FILE,
        })),
        ok: false,
      }
    }
    return { manifest: result.data, ok: true }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      issues: [{
        code: 'manifest.read_failed',
        message,
        path: manifestPath,
      }],
      ok: false,
    }
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
  options: { rejectSecretRefs?: boolean, requireBinary: boolean, requireProjectionCompatibility?: boolean },
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
    if (options.requireProjectionCompatibility === true)
      issues.push(...collectProjectionCompatibilityIssues(engine, server, `engines.${engine}.mcp.${name}`))
  }
  issues.push(...collectNativeCapabilityIssues(config, `engines.${engine}`))
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
    if (key === 'secretRef' || key === 'bearerTokenEnvVar')
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

function collectNativeCapabilityIssues(config: ExecutorCapabilityEngineConfig | undefined, basePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!config)
    return issues
  for (const kind of ['plugins', 'policies', 'skills'] as const)
    issues.push(...collectGenericSecretIssues(config[kind], `${basePath}.${kind}`))
  return issues
}

function collectGenericSecretIssues(value: unknown, pathValue: string): ValidationIssue[] {
  return collectSecretIssues(value, pathValue).map(issue => ({
    ...issue,
    code: 'executor.capability.plaintext_secret',
    message: issue.message.replace('Secret-like field', 'Secret-like project executor overlay field'),
  }))
}

function collectProjectionCompatibilityIssues(
  engine: ExecutorCapabilityEngine,
  server: ExecutorMcpServerDescriptor,
  basePath: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (engine === 'codex') {
    if (server.transport === 'sse') {
      issues.push({
        code: 'executor.mcp.codex_transport_unsupported',
        message: 'Codex CLI `mcp add` supports stdio and streamable HTTP; SSE projection is not supported.',
        path: `${basePath}.transport`,
      })
    }
    if (server.headers && Object.keys(server.headers).length > 0) {
      issues.push({
        code: 'executor.mcp.codex_headers_unsupported',
        message: 'Codex CLI does not expose generic HTTP header projection; use bearerTokenEnvVar when a bearer token is needed.',
        path: `${basePath}.headers`,
      })
    }
    if (server.transport !== 'stdio' && server.env && Object.keys(server.env).length > 0) {
      issues.push({
        code: 'executor.mcp.codex_env_http_unsupported',
        message: 'Codex CLI only accepts --env for stdio MCP servers.',
        path: `${basePath}.env`,
      })
    }
    if (server.transport === 'stdio' && server.bearerTokenEnvVar !== undefined) {
      issues.push({
        code: 'executor.mcp.codex_bearer_stdio_unsupported',
        message: 'Codex CLI only accepts --bearer-token-env-var for streamable HTTP MCP servers.',
        path: `${basePath}.bearerTokenEnvVar`,
      })
    }
  }
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
      args: buildMcpAddArgs(engine, serverName, server),
      binary,
      serverName,
    }))
}

function buildMcpAddArgs(engine: ExecutorCapabilityEngine, name: string, server: ExecutorMcpServerDescriptor): string[] {
  if (engine === 'codex')
    return buildCodexMcpAddArgs(name, server)
  return buildClaudeMcpAddArgs(name, server)
}

function buildCodexMcpAddArgs(name: string, server: ExecutorMcpServerDescriptor): string[] {
  const args = ['mcp', 'add', name]
  if (server.transport === 'stdio') {
    appendAssignments(args, '--env', server.env)
    if (server.command)
      args.push('--', server.command, ...(server.args ?? []))
    return args
  }
  if (server.url)
    args.push('--url', server.url)
  if (server.bearerTokenEnvVar)
    args.push('--bearer-token-env-var', server.bearerTokenEnvVar)
  return args
}

function buildClaudeMcpAddArgs(name: string, server: ExecutorMcpServerDescriptor): string[] {
  const args = ['mcp', 'add', '--scope', server.scope, '--transport', toClaudeTransport(server.transport)]
  appendAssignments(args, '--env', server.env)
  appendHeaders(args, server.headers)
  if (server.transport === 'stdio') {
    if (server.command)
      args.push(name, '--', server.command, ...(server.args ?? []))
    return args
  }
  args.push(name)
  if (server.url)
    args.push(server.url)
  return args
}

function toClaudeTransport(transport: ExecutorMcpTransport): string {
  return transport === 'streamable-http' ? 'http' : transport
}

function appendAssignments(args: string[], flag: string, values: Record<string, string | { secretRef: string }> | undefined): void {
  if (!values)
    return
  for (const [key, value] of Object.entries(values)) {
    const rendered = isSecretRef(value) ? `secretRef:${value.secretRef}` : value
    args.push(flag, `${key}=${rendered}`)
  }
}

function appendHeaders(args: string[], values: Record<string, string | { secretRef: string }> | undefined): void {
  if (!values)
    return
  for (const [key, value] of Object.entries(values)) {
    const rendered = isSecretRef(value) ? `secretRef:${value.secretRef}` : value
    args.push('--header', `${key}: ${rendered}`)
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

async function loadExistingScopeDotenv(): Promise<void> {
  const scope = resolveAiworkerScope()
  const envFile = path.join(scope.home, '.env')
  if (!existsSync(envFile))
    return
  const parsed = parseDotenv(await readFile(envFile, 'utf8'))
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined)
      process.env[key] = value
  }
}

function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#'))
      continue
    const index = line.indexOf('=')
    if (index <= 0)
      continue
    out[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return out
}

async function inspectConfiguredExecutor(): Promise<ExecutorConfiguredReport> {
  try {
    await loadExistingScopeDotenv()
    const ctx = await loadWorkerContext({ silent: true })
    return {
      defaultStub: isDefaultStubExecutor(ctx.hydrated.executor),
      engine: ctx.hydrated.executor.engine,
      source: 'worker-config',
      variant: ctx.hydrated.executor.variant,
      version: ctx.configVersion,
    }
  }
  catch (err) {
    return {
      message: err instanceof Error ? err.message : String(err),
      source: 'unavailable',
    }
  }
}

function isDefaultStubExecutor(executor: ExecutorConfig): boolean {
  return executor.engine === DEFAULT_EXECUTOR_PROFILE.engine
    && executor.variant === DEFAULT_EXECUTOR_PROFILE.variant
    && JSON.stringify(executor.overrides ?? {}) === JSON.stringify(DEFAULT_EXECUTOR_PROFILE.overrides ?? {})
}

function formatExecutorProfile(executor: ExecutorConfig): string {
  const extras = [
    executor.modelId === undefined ? undefined : `model=${executor.modelId}`,
    executor.permissionPolicy === undefined ? undefined : `permission=${executor.permissionPolicy}`,
    executor.reasoningId === undefined ? undefined : `reasoning=${executor.reasoningId}`,
  ].filter((item): item is string => item !== undefined)
  return `${executor.engine}/${executor.variant}${extras.length === 0 ? '' : ` (${extras.join(', ')})`}`
}

function printConfiguredExecutor(write: (text: string) => void, configured: ExecutorConfiguredReport): void {
  if (configured.source === 'unavailable') {
    write('  WARN    configured task executor unavailable\n')
    write(`    - [warning] executor.config_unavailable worker_config.executor: ${configured.message}\n`)
    return
  }
  const status = configured.defaultStub ? 'WARN' : 'PASS'
  write(`  ${status.padEnd(7)} configured task executor: ${configured.engine}/${configured.variant} (config v${configured.version})\n`)
}

function summarizeManifest(manifest: ExecutorCapabilityManifest): ExecutorReadinessManifest {
  const engines = Object.values(manifest.engines)
  const declaredCapabilities = engines.reduce((sum, config) => {
    return sum
      + countEnabled(config.mcp)
      + countEnabled(config.plugins)
      + countEnabled(config.policies)
      + countEnabled(config.skills)
  }, 0)
  return {
    declaredCapabilities,
    declaredEngines: Object.keys(manifest.engines).length,
    empty: declaredCapabilities === 0,
  }
}

function countEnabled(values: Record<string, unknown> | undefined): number {
  if (!values)
    return 0
  return Object.values(values).filter(value => !isRecord(value) || value.disabled !== true).length
}

function collectDoctorWarnings(
  manifest: ExecutorCapabilityManifest,
  configured: ExecutorConfiguredReport,
  engines: ExecutorCapabilityEngine[],
): ValidationIssue[] {
  const warnings: ValidationIssue[] = []
  if (configured.source === 'unavailable') {
    warnings.push({
      code: 'executor.config_unavailable',
      message: configured.message,
      path: 'worker_config.executor',
    })
  }
  else if (configured.defaultStub) {
    warnings.push({
      code: 'executor.config_default_stub',
      message: 'Worker config still selects the safe http/default stub executor.',
      path: 'worker_config.executor',
    })
  }
  if (summarizeManifest(manifest).empty) {
    // TODO-015: disambiguate "skill" / "MCP" / "overlay" naming. The code
    // changes from `executor.capability_manifest_empty` →
    // `executor-overlay.capabilities.empty` (project executor overlay,
    // distinct from brain skills + engine plugins). Same message
    // explicitly names the file and notes the optional nature on first-run
    // defaults.
    warnings.push({
      code: 'executor-overlay.capabilities.empty',
      message: 'No project executor overlay entries are declared (optional — projects only need an overlay when they pin engine-specific MCP / config).',
      path: MANIFEST_FILE,
    })
  }
  for (const engine of engines) {
    const declared = manifest.engines[engine]
    if (!declared || countEnabled(declared.mcp) === 0) {
      warnings.push({
        code: 'executor-overlay.mcp.empty',
        message: `No executor MCP overlay entries declared for engine "${engine}" (optional unless this project must pin engine-specific MCP servers; distinct from brain skills under .aiworker/skills/).`,
        path: `engines.${engine}.mcp`,
      })
    }
  }
  return warnings
}

function executorEnginesToInspect(
  manifest: ExecutorCapabilityManifest,
  configured: ExecutorConfiguredReport,
): ExecutorCapabilityEngine[] {
  const engines = new Set(Object.keys(manifest.engines) as ExecutorCapabilityEngine[])
  if (configured.source === 'worker-config' && isExecutorCapabilityEngine(configured.engine))
    engines.add(configured.engine)
  return [...engines]
}

function isExecutorCapabilityEngine(engine: EngineKind): engine is ExecutorCapabilityEngine {
  return engine === 'codex' || engine === 'claude-code'
}

interface CapabilityEntry {
  disabled: boolean
  engine: ExecutorCapabilityEngine
  kind: 'mcp' | 'plugins' | 'policies' | 'skills'
  name: string
  status: string
}

function listCapabilityEntries(manifest: ExecutorCapabilityManifest): CapabilityEntry[] {
  const entries: CapabilityEntry[] = []
  for (const [engine, config] of Object.entries(manifest.engines) as Array<[ExecutorCapabilityEngine, ExecutorCapabilityEngineConfig]>) {
    for (const kind of ['mcp', 'plugins', 'policies', 'skills'] as const) {
      const values = config[kind]
      if (!values)
        continue
      for (const [name, descriptor] of Object.entries(values)) {
        entries.push({
          disabled: isRecord(descriptor) && descriptor.disabled === true,
          engine,
          kind,
          name,
          status: isRecord(descriptor) && typeof descriptor.status === 'string' ? descriptor.status : 'declared',
        })
      }
    }
  }
  return entries
}

interface CapabilityRef {
  engine: ExecutorCapabilityEngine
  kind: CapabilityEntry['kind']
  name: string
}

function parseCapabilityRef(ref: string): { code: number, ok: false } | { ok: true, value: CapabilityRef } {
  const [engineRaw, kindRaw, ...nameParts] = ref.split('.')
  const engine = executorCapabilityEngineSchema.safeParse(engineRaw)
  const kind = kindRaw === 'mcp' || kindRaw === 'plugins' || kindRaw === 'policies' || kindRaw === 'skills'
    ? kindRaw
    : null
  const name = nameParts.join('.')
  if (!engine.success || kind === null || name.length === 0) {
    consola.error('[aiworker executor capability show] ref must use <engine>.<kind>.<name>, for example codex.mcp.context7')
    return { code: 2, ok: false }
  }
  return { ok: true, value: { engine: engine.data, kind, name } }
}

function readCapabilityDescriptor(manifest: ExecutorCapabilityManifest, ref: CapabilityRef): unknown {
  return manifest.engines[ref.engine]?.[ref.kind]?.[ref.name]
}

function printValidationIssues(title: string, issues: ValidationIssue[]): void {
  consola.error(title)
  for (const issue of issues)
    process.stderr.write(`  - ${issue.code} ${issue.path}: ${issue.message}\n`)
}

function rollupReadinessStatus(issues: ExecutorReadinessIssue[]): ExecutorReadinessStatus {
  if (issues.some(issue => issue.severity === 'error'))
    return 'fail'
  if (issues.some(issue => issue.severity === 'warning'))
    return 'warn'
  return 'pass'
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
