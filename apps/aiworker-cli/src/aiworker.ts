#!/usr/bin/env bun
import type { ControlPlaneSnapshot, ProjectedFile, ProvisionPlan } from '@zonease/aiworker-control'
import type { Command } from 'cac'
import { execFile as execFileCallback } from 'node:child_process'
import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { promisify } from 'node:util'
import { createAssignment, createAuditEvent, createProvisionPlan, createProvisionReceipt, createWorkspaceProjectionManifest, isPaseoPairingOffer, LocalFileControlPlaneStore, normalizeAisshServerRef, redactLiteralProviderSecret, redactSecretLike } from '@zonease/aiworker-control'
import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'
import cac from 'cac'

const execFileAsync = promisify(execFileCallback)
export const AISSH_EXEC_CWD_PREFIX = path.join(tmpdir(), 'aiworker-aissh-')
const MAX_ERROR_STREAM_CHARS = 2000
const PLAN_EXAMPLE = '$ aiworker plan --user alice@example.com --target aissh:server-1 --environment env-alice --provider codex-default --soul souls/aiworker-freeform/dist/soul.descriptor.json'
const APPLY_EXAMPLE = '$ aiworker apply --yes --user alice@example.com --target aissh:server-1 --environment env-alice --provider codex-default --soul souls/aiworker-freeform/dist/soul.descriptor.json'
const PAIR_EXAMPLE = '$ aiworker pair --target aissh:server-1 --soul souls/aiworker-freeform/dist/soul.descriptor.json'

interface AisshInvocation {
  file: string
  prefix: string[]
  source: 'explicit' | 'bundled' | 'path'
}

export interface AisshExecutor {
  execFile: (file: string, args: string[], options: { cwd: string, env: NodeJS.ProcessEnv, maxBuffer: number }) => Promise<{ stderr?: string, stdout: string }>
}

interface ProvisionExecutionOptions {
  aisshBin?: string
  executor?: AisshExecutor
  maxBuffer?: number
}

interface PairExecutionOptions extends ProvisionExecutionOptions {
  soulPath: string
  targetRef: string
}

interface ApplyApprovalIO {
  isInteractive: () => boolean
  prompt: (question: string) => Promise<string>
  write: (value: string) => void
}

type DoctorStatus = 'pass' | 'warn' | 'fail'

interface DoctorCheck {
  name: string
  status: DoctorStatus
  message: string
}

interface DoctorReport {
  checks: DoctorCheck[]
  status: DoctorStatus
}

interface AisshCredentialResolution {
  env: NodeJS.ProcessEnv
  source: 'aissh-yaml' | 'env' | 'missing'
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function printText(value: string): void {
  process.stdout.write(`${value.endsWith('\n') ? value : `${value}\n`}`)
}

function requireOption(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error([
      `Missing required option: ${name}`,
      'Run `aiworker plan --help` to review preview options.',
      'Run `aiworker apply --help` before executing remote provisioning.',
    ].join('\n'))
  }
  return value.trim()
}

export function buildCli() {
  const cli = cac('aiworker')
  cli.usage('<command> [options]')
  cli.example(PLAN_EXAMPLE)
  cli.example(APPLY_EXAMPLE)
  cli.example(PAIR_EXAMPLE)

  addProvisionOptions(cli.command('plan', 'Preview a Paseo workspace provisioning plan without changing the target')
    .usage('plan [options]'),
  )
    .option('--json', 'print the full machine-readable provisioning plan')
    .option('--show-script', 'include the generated remote shell script in human output')
    .example(PLAN_EXAMPLE)
    .example('$ aiworker plan ... --json')
    .action((options) => {
      const plan = createPlanFromOptions(options)
      if (options.json)
        printJson(plan)
      else
        printText(formatProvisionPlanSummary(plan, { showScript: Boolean(options.showScript) }))
    })

  addProvisionOptions(cli.command('apply', 'Execute a Paseo workspace provisioning plan through aissh')
    .usage('apply [options]'),
  )
    .option('--aissh-bin <path>', 'override aissh executable; defaults to AISSH_BIN, bundled aissh-cli launcher, then PATH')
    .option('--yes', 'approve execution without an interactive prompt')
    .option('--auto-approve', 'alias for --yes in automation')
    .option('--control-plane-dir <path>', 'write redacted AIWorker receipt, audit, and projection records to this local directory')
    .option('--json', 'print the full machine-readable execution result')
    .example(APPLY_EXAMPLE)
    .action(async (options) => {
      const plan = createPlanFromOptions(options)
      assertJsonApplyApproved(options)
      await confirmApplyApproval(plan, options)
      try {
        const result = await executeProvisionPlan(plan, { aisshBin: typeof options.aisshBin === 'string' ? options.aisshBin : undefined })
        await persistExecutionIfRequested(plan, result, options)
        if (options.json)
          printJson(result)
        else
          printText(formatProvisionExecutionSummary(result))
      }
      catch (error) {
        await persistFailureIfRequested(plan, error, options)
        throw error
      }
    })

  cli.command('pair', 'Generate a transient Paseo pairing offer through aissh without storing it')
    .usage('pair [options]')
    .option('--target <ref>', 'aissh target ref, e.g. aissh:server-1')
    .option('--soul <path>', 'built dist/soul.descriptor.json used to derive the prepared workspace name')
    .option('--aissh-bin <path>', 'override aissh executable; defaults to AISSH_BIN, bundled aissh-cli launcher, then PATH')
    .option('--json', 'print the transient pairing response as machine-readable data')
    .example(PAIR_EXAMPLE)
    .action(async (options) => {
      const result = await executePaseoPair({
        aisshBin: typeof options.aisshBin === 'string' ? options.aisshBin : undefined,
        soulPath: requireOption(options.soul, '--soul'),
        targetRef: requireOption(options.target, '--target'),
      })
      if (options.json)
        printJson(result)
      else
        printText(formatPairExecutionSummary(result))
    })

  cli.command('doctor', 'Run local AIWorker CLI diagnostics without contacting a target')
    .usage('doctor [options]')
    .option('--soul <path>', 'optional built dist/soul.descriptor.json to validate locally')
    .option('--aissh-bin <path>', 'override aissh executable for local resolution checks')
    .option('--json', 'print machine-readable diagnostics')
    .example('$ aiworker doctor')
    .example('$ aiworker doctor --soul souls/aiworker-freeform/dist/soul.descriptor.json --json')
    .action((options) => {
      const report = createDoctorReport(options)
      if (options.json)
        printJson(report)
      else
        printText(formatDoctorReport(report))
      if (report.status === 'fail')
        process.exitCode = 1
    })

  cli.help(sections => insertDescriptionSection(sections))
  cli.version(readAiworkerPackageManifest().version)
  return cli
}

function addProvisionOptions(command: Command): Command {
  return command
    .option('--user <email>', 'assigned employee email')
    .option('--target <ref>', 'aissh target ref, e.g. aissh:server-1')
    .option('--environment <id>', 'Paseo environment id')
    .option('--paseo-endpoint <endpoint>', 'optional existing Paseo endpoint metadata; defaults to remote HOME-derived local daemon')
    .option('--provider <id>', 'Paseo provider profile id')
    .option('--provider-kind <kind>', 'provider kind', { default: 'claude' })
    .option('--provider-base-url <url>', 'provider base URL metadata; no provider key')
    .option('--provider-cli <command>', 'provider CLI command to verify on the target')
    .option('--provider-model <model>', 'provider default model metadata')
    .option('--provider-secret-ref <ref>', 'secret reference for provider credentials', { default: undefined })
    .option('--paseo-provider-id <id>', 'Paseo-native provider profile id, required for ACP without --provider-cli')
    .option('--soul <path>', 'built dist/soul.descriptor.json')
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const cli = buildCli()
  const parsed = cli.parse(argv, { run: false })
  if (parsed.options.help || parsed.options.version)
    return
  if (!cli.matchedCommand) {
    if (parsed.args.length === 0) {
      cli.outputHelp()
      return
    }
    throw new Error(`unknown command \`${parsed.args[0]}\`. Run \`aiworker --help\` for available commands.`)
  }
  await cli.runMatchedCommand()
}

function createPlanFromOptions(options: Record<string, unknown>): ProvisionPlan {
  const soulPath = requireOption(options.soul, '--soul')
  const descriptor = readSoulDescriptor(soulPath)
  const templateRoot = path.resolve(path.dirname(soulPath), '..', descriptor.workspaceTemplate.root)
  const user = requireOption(options.user, '--user')
  const environmentId = requireOption(options.environment, '--environment')
  const providerProfileId = requireOption(options.provider, '--provider')
  const workspaceRef = `$HOME/aiworker-workspaces/${descriptor.identity.id}`
  const paseoEndpoint = typeof options.paseoEndpoint === 'string' ? options.paseoEndpoint : 'paseo-daemon:remote-home'
  const assignment = createAssignment({
    assignedEmail: user,
    environmentId,
    providerProfileId,
    soulReleaseRef: `${descriptor.identity.id}@${descriptor.identity.version}`,
    workspaceRef,
  })
  return createProvisionPlan({
    assignment,
    environment: {
      environmentId,
      daemonEndpoint: paseoEndpoint,
      isolation: 'os-user',
      endpointKind: paseoEndpoint === 'paseo-daemon:remote-home' ? 'local-home' : paseoEndpoint.startsWith('unix:') ? 'unix' : isPaseoPairingOffer(paseoEndpoint) ? 'relay-offer' : 'tcp',
      ownerEmail: user,
      paseoHome: '$HOME/.paseo',
      providerProfileIds: [providerProfileId],
      targetRef: requireOption(options.target, '--target'),
    },
    providerProfile: {
      ...(typeof options.providerBaseUrl === 'string' ? { baseUrl: options.providerBaseUrl } : {}),
      ...(typeof options.providerCli === 'string' ? { cliCommand: options.providerCli } : {}),
      ...(typeof options.providerModel === 'string' ? { model: options.providerModel } : {}),
      ...(typeof options.paseoProviderId === 'string' ? { paseoProviderId: options.paseoProviderId } : {}),
      id: providerProfileId,
      label: providerProfileId,
      provider: requireOption(options.providerKind, '--provider-kind'),
      secretRef: typeof options.providerSecretRef === 'string' ? options.providerSecretRef : `secret://provider/${providerProfileId}`,
    },
    soul: {
      displayName: descriptor.identity.name,
      files: readWorkspaceTemplateFiles(templateRoot),
      id: descriptor.identity.id,
      version: descriptor.identity.version,
    },
  })
}

function readSoulDescriptor(soulPath: string) {
  if (!existsSync(soulPath)) {
    throw new Error([
      `Soul descriptor not found: ${soulPath}`,
      'Build an official Soul first with `bun run build:official-souls`, or pass a built dist/soul.descriptor.json path.',
    ].join('\n'))
  }
  try {
    return parseSoulDescriptorV1(JSON.parse(readFileSync(soulPath, 'utf8')))
  }
  catch {
    throw new Error([
      'Invalid Soul descriptor at the provided path.',
      'Rebuild the Soul and verify identity fields, workspaceTemplate entries, and descriptor protocol.',
    ].join('\n'))
  }
}

function insertDescriptionSection(sections: { body: string, title?: string }[]): { body: string, title?: string }[] {
  const [header, ...rest] = sections
  return [
    header ?? { body: 'aiworker' },
    {
      title: 'Description',
      body: [
        '  Thin enterprise distribution CLI for Paseo workspaces.',
        '  AIWorker prepares assignments, aissh provisioning plans, and Soul file projection.',
        '  Paseo owns workspace UI, sessions, logs, provider orchestration, and runtime behavior.',
      ].join('\n'),
    },
    ...rest,
  ]
}

function formatProvisionPlanSummary(plan: ProvisionPlan, options: { showScript?: boolean } = {}): string {
  const lines = [
    'AIWorker provisioning plan',
    '',
    `Assigned user: ${plan.assignment.assignedEmail}`,
    `Soul release: ${plan.receipt.soulReleaseRef}`,
    `Target: ${plan.receipt.targetRef}`,
    `Environment: ${plan.receipt.environmentId}`,
    `Workspace: ${plan.receipt.workspaceRef}`,
    `Provider profile: ${plan.receipt.providerProfileId}`,
    `Handoff: ${plan.assignment.handoff?.kind ?? 'pending'}${plan.assignment.handoff ? ` (${plan.assignment.handoff.daemonEndpoint})` : ''}`,
    `Required env: ${plan.aissh.credentials.requiredEnv.join(', ')}`,
    `Optional env: ${plan.aissh.credentials.optionalEnv.join(', ')}`,
    '',
    'No target changes have been made.',
    'Inspect the full machine-readable plan with: aiworker plan ... --json',
    'Inspect the generated remote script with: aiworker plan ... --show-script',
    'Next step: aiworker apply ... (interactive) or aiworker apply ... --yes for automation',
  ]

  if (options.showScript) {
    lines.push('', 'Generated remote script:', plan.aissh.script)
  }

  return lines.join('\n')
}

function assertJsonApplyApproved(options: Record<string, unknown>): void {
  if (options.json && !options.yes && !options.autoApprove) {
    throw new Error([
      'refusing `aiworker apply --json` without explicit non-interactive approval',
      '`--json` keeps stdout machine-readable, so interactive confirmation is disabled.',
      'Rerun with `aiworker apply ... --json --yes` or `--auto-approve` after previewing with `aiworker plan ...`.',
    ].join('\n'))
  }
}

export async function confirmApplyApproval(
  plan: ProvisionPlan,
  options: Record<string, unknown>,
  io: ApplyApprovalIO = createProcessApplyApprovalIO(),
): Promise<void> {
  if (options.yes || options.autoApprove)
    return

  if (!io.isInteractive()) {
    throw new Error([
      'refusing to execute provisioning without explicit approval',
      'Run `aiworker plan ...` first to preview target, workspace, provider, and required env.',
      'Then run `aiworker apply ...` from an interactive terminal, or rerun with `--yes` / `--auto-approve` for automation.',
    ].join('\n'))
  }

  io.write(`${formatProvisionPlanSummary(plan)}\n\n`)
  const answer = (await io.prompt('Apply this provisioning plan? Type "yes" to continue: ')).trim().toLowerCase()
  if (answer !== 'yes') {
    throw new Error([
      'apply cancelled by user',
      'No target changes were made.',
      'Rerun `aiworker plan ...` to review the plan before trying again.',
    ].join('\n'))
  }
}

function createProcessApplyApprovalIO(): ApplyApprovalIO {
  return {
    isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
    async prompt(question) {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      try {
        return await rl.question(question)
      }
      finally {
        rl.close()
      }
    },
    write: value => process.stdout.write(value),
  }
}

function formatProvisionExecutionSummary(result: Awaited<ReturnType<typeof executeProvisionPlan>>): string {
  return [
    'AIWorker provisioning executed',
    '',
    `Target: ${result.plan.receipt.targetRef}`,
    `Workspace: ${result.plan.receipt.workspaceRef}`,
    `Soul release: ${result.plan.receipt.soulReleaseRef}`,
    `Provider profile: ${result.plan.receipt.providerProfileId}`,
    result.plan.assignment.handoff ? `Handoff: ${result.plan.assignment.handoff.instructions}` : '',
    `aissh source: ${result.aissh.source}`,
    result.stdout ? `stdout: ${result.stdout.trim()}` : '',
    result.stderr ? `stderr: ${result.stderr.trim()}` : '',
  ].filter(Boolean).join('\n')
}

function formatPairExecutionSummary(result: Awaited<ReturnType<typeof executePaseoPair>>): string {
  return [
    'Paseo pairing response',
    '',
    `Target: ${result.targetRef}`,
    `Workspace: ${result.workspaceRef}`,
    `aissh source: ${result.aissh.source}`,
    'Pairing material below is transient. AIWorker did not persist it.',
    result.stdout ? `stdout:\n${result.stdout.trim()}` : '',
    result.stderr ? `stderr:\n${result.stderr.trim()}` : '',
  ].filter(Boolean).join('\n')
}

export async function executePaseoPair(options: PairExecutionOptions) {
  const descriptor = readSoulDescriptor(options.soulPath)
  const workspaceName = descriptor.identity.id
  const script = createPaseoPairScript(workspaceName)
  const serverRef = normalizeAisshServerRef(options.targetRef)
  const reason = `Generate transient Paseo pairing offer for ${workspaceName}`
  const args = ['exec', serverRef, script, `--reason=${reason}`]
  const invocation = resolveAisshInvocation(options.aisshBin)
  const executor = options.executor ?? createDefaultAisshExecutor()
  const credentials = resolveAisshCredentials(process.cwd(), process.env)
  const execCwd = await createNeutralAisshCwd()
  try {
    const result = await executor.execFile(invocation.file, [...invocation.prefix, ...args], {
      cwd: execCwd,
      env: credentials.env,
      maxBuffer: options.maxBuffer ?? 1024 * 1024 * 8,
    })
    return {
      aissh: {
        args,
        cwd: execCwd,
        file: invocation.source === 'path' ? 'aissh' : invocation.file,
        source: invocation.source,
      },
      status: 'paired',
      stderr: sanitizePairingSuccessStream(result.stderr ?? '', script, args),
      stdout: sanitizePairingSuccessStream(result.stdout, script, args),
      targetRef: redactSecretLike(options.targetRef),
      workspaceRef: `$HOME/aiworker-workspaces/${workspaceName}`,
    }
  }
  catch (error) {
    throw createRedactedPairingError(error, invocation.file, script, args)
  }
  finally {
    await rm(execCwd, { force: true, recursive: true })
  }
}

function createPaseoPairScript(workspaceName: string): string {
  const safeWorkspaceName = validatePairWorkspaceName(workspaceName)
  return [
    'set -euo pipefail',
    ...pairRemoteIdentityPreludeCommands(safeWorkspaceName),
    'test -d "$AIWORKER_WORKSPACE_REF" || { printf \'%s\\n\' "AIWORKER_PAIR_WORKSPACE_MISSING: run aiworker apply for $AIWORKER_WORKSPACE_REF before requesting a pairing link." >&2; exit 66; }',
    'cd "$AIWORKER_WORKSPACE_REF"',
    'paseo daemon pair --home "$PASEO_HOME"',
  ].join(' && ')
}

function pairRemoteIdentityPreludeCommands(workspaceName: string): string[] {
  return [
    'unset PASEO_HOST',
    'AIWORKER_REMOTE_USER="$(whoami)"',
    'AIWORKER_REMOTE_UID="$(id -u)"',
    'AIWORKER_REMOTE_PWD="$(pwd -P)"',
    ': "$' + '{HOME:?AIWorker requires HOME for aissh execution identity}"',
    'case "$HOME" in /*) ;; *) printf \'%s\\n\' "AIWorker requires absolute HOME for aissh execution identity." >&2; exit 64 ;; esac',
    'AIWORKER_REMOTE_HOME="$(cd "$HOME" && pwd -P)" || { printf \'%s\\n\' "AIWorker could not canonicalize HOME for aissh execution identity." >&2; exit 64; }',
    'PASEO_HOME="$AIWORKER_REMOTE_HOME/.paseo"',
    'export PASEO_HOME',
    `AIWORKER_WORKSPACE_NAME=${shellQuoteForScript(workspaceName)}`,
    'AIWORKER_WORKSPACE_ROOT="$AIWORKER_REMOTE_HOME/aiworker-workspaces"',
    'AIWORKER_WORKSPACE_REF="$AIWORKER_WORKSPACE_ROOT/$AIWORKER_WORKSPACE_NAME"',
    'printf \'%s\\n\' "AIWorker target identity discovered: user=$AIWORKER_REMOTE_USER uid=$AIWORKER_REMOTE_UID home=$AIWORKER_REMOTE_HOME pwd=$AIWORKER_REMOTE_PWD"',
  ]
}

function validatePairWorkspaceName(value: string): string {
  const workspaceName = value.trim()
  if (!workspaceName || workspaceName === '.' || workspaceName === '..' || workspaceName.includes('/') || workspaceName.includes('\\') || workspaceName.includes('..') || !/^[\w.-]+$/.test(workspaceName))
    throw new Error('workspace name must be a safe relative segment')
  return workspaceName
}

function shellQuoteForScript(value: string): string {
  if (/^[\w/:=.,@%+-]+$/.test(value))
    return value
  return `'${value.replaceAll('\'', String.raw`'\''`)}'`
}

function sanitizePairingSuccessStream(value: string, script: string, args: string[]): string {
  return scrubGeneratedCommandEcho(redactLiteralProviderSecret(unwrapAisshExecutionEnvelope(value.trim())), generatedCommandNeedles(script, args))
}

function createRedactedPairingError(error: unknown, file: string, script: string, args: string[]): Error {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : ''
  if (code === 'ENOENT') {
    return new Error(redactSecretLike(`aissh CLI unavailable (${file}). Run bun install to install optional aissh-cli, or set AISSH_BIN to an existing aissh executable.`))
  }
  const stdout = typeof (error as { stdout?: unknown })?.stdout === 'string' ? (error as { stdout: string }).stdout : ''
  const stderr = typeof (error as { stderr?: unknown })?.stderr === 'string' ? (error as { stderr: string }).stderr : ''
  const summary = code && code !== 'undefined' ? `aissh pairing failed (code ${code})` : 'aissh pairing failed'
  const detail = [
    summary,
    'Pairing output is transient; AIWorker does not persist raw pairing links or QR codes.',
    stdout ? `stdout: ${formatPairingErrorStream(stdout, script, args)}` : '',
    stderr ? `stderr: ${formatPairingErrorStream(stderr, script, args)}` : '',
    'Next step: run `aiworker apply ... --yes` first, verify Paseo daemon status on the target, then retry `aiworker pair ...`.',
  ].filter(Boolean).join('\n')
  return new Error(redactSecretLike(detail))
}

function formatPairingErrorStream(value: string, script: string, args: string[]): string {
  const sanitized = scrubGeneratedCommandEcho(redactSensitiveAisshOutput(redactSecretLike(unwrapAisshExecutionEnvelope(value.trim()))), generatedCommandNeedles(script, args))
  if (sanitized.length <= MAX_ERROR_STREAM_CHARS)
    return sanitized
  return `${sanitized.slice(0, MAX_ERROR_STREAM_CHARS)}\n... output truncated ...`
}

async function persistExecutionIfRequested(plan: ProvisionPlan, result: Awaited<ReturnType<typeof executeProvisionPlan>>, options: Record<string, unknown>): Promise<void> {
  const root = controlPlaneDirFromOptions(options)
  if (!root)
    return

  const at = new Date().toISOString()
  const providerWarning = extractProviderWarning(result.stdout, result.stderr)
  const store = new LocalFileControlPlaneStore(root)
  await savePlanMetadataSnapshot(store, plan, options, providerWarning ? 'needs_attention' : 'handoff_ready')
  await store.appendReceipt(createProvisionReceipt(plan, {
    at,
    providerWarning,
    status: 'applied',
  }))
  await store.appendProjectionManifest(createWorkspaceProjectionManifest({
    at,
    files: readSoulReleaseFromOptions(options).files,
    soulReleaseRef: plan.receipt.soulReleaseRef,
    workspaceRef: plan.receipt.workspaceRef,
  }))
  await store.appendAuditEvent(createAuditEvent({
    actor: 'aiworker-cli',
    action: providerWarning ? 'provision.applied.needs_provider_attention' : 'provision.applied',
    at,
    details: controlPlaneAuditDetails([
      `target=${plan.receipt.targetRef}`,
      `workspace=${plan.receipt.workspaceRef}`,
      `paseoHome=${plan.receipt.paseoHome}`,
      `handoff=${plan.receipt.handoffKind}:${plan.receipt.handoffState}`,
      providerWarning ? `providerWarning=${providerWarning}` : 'providerWarning=none',
    ]),
    target: plan.assignment.assignmentId,
  }))
}

async function persistFailureIfRequested(plan: ProvisionPlan, error: unknown, options: Record<string, unknown>): Promise<void> {
  const root = controlPlaneDirFromOptions(options)
  if (!root)
    return

  const at = new Date().toISOString()
  const failureSummary = redactedFailureSummary(error)
  const providerWarning = extractProviderWarning(failureSummary)
  const store = new LocalFileControlPlaneStore(root)
  await savePlanMetadataSnapshot(store, plan, options, 'needs_attention')
  await store.appendReceipt(createProvisionReceipt(plan, {
    at,
    providerWarning,
    status: 'failed',
  }))
  await store.appendAuditEvent(createAuditEvent({
    actor: 'aiworker-cli',
    action: 'provision.failed',
    at,
    details: controlPlaneAuditDetails([
      `target=${plan.receipt.targetRef}`,
      `workspace=${plan.receipt.workspaceRef}`,
      `paseoHome=${plan.receipt.paseoHome}`,
      `failure=${failureSummary}`,
    ]),
    target: plan.assignment.assignmentId,
  }))
}

async function savePlanMetadataSnapshot(
  store: LocalFileControlPlaneStore,
  plan: ProvisionPlan,
  options: Record<string, unknown>,
  assignmentStatus: ProvisionPlan['assignment']['status'],
): Promise<void> {
  const soulRelease = readSoulReleaseFromOptions(options)
  const existing = await store.loadSnapshot()
  const snapshot: ControlPlaneSnapshot = {
    ...existing,
    assignments: upsertById(existing.assignments, {
      ...plan.assignment,
      status: assignmentStatus,
    }, 'assignmentId'),
    environments: upsertById(existing.environments, {
      daemonEndpoint: plan.assignment.handoff?.daemonEndpoint ?? 'paseo-daemon:remote-home',
      endpointKind: plan.receipt.endpointKind,
      environmentId: plan.receipt.environmentId,
      isolation: 'os-user',
      ownerEmail: plan.assignment.assignedEmail,
      paseoHome: plan.receipt.paseoHome,
      providerProfileIds: [plan.receipt.providerProfileId],
      targetRef: plan.receipt.targetRef,
    }, 'environmentId'),
    providerProfiles: upsertById(existing.providerProfiles, {
      id: plan.receipt.providerProfileId,
      label: plan.receipt.providerProfileId,
      provider: typeof options.providerKind === 'string' ? options.providerKind : 'claude',
      secretRef: typeof options.providerSecretRef === 'string' ? options.providerSecretRef : `secret://provider/${plan.receipt.providerProfileId}`,
      ...(typeof options.paseoProviderId === 'string' ? { paseoProviderId: options.paseoProviderId } : {}),
      ...(typeof options.providerCli === 'string' ? { cliCommand: options.providerCli } : {}),
      ...(typeof options.providerBaseUrl === 'string' ? { baseUrl: options.providerBaseUrl } : {}),
      ...(typeof options.providerModel === 'string' ? { model: options.providerModel } : {}),
    }, 'id'),
    soulReleases: upsertById(existing.soulReleases, soulRelease, 'id'),
  }
  await store.saveSnapshot(snapshot)
}

function controlPlaneDirFromOptions(options: Record<string, unknown>): string | null {
  return typeof options.controlPlaneDir === 'string' && options.controlPlaneDir.trim() !== ''
    ? path.resolve(options.controlPlaneDir)
    : null
}

function readSoulReleaseFromOptions(options: Record<string, unknown>) {
  const soulPath = requireOption(options.soul, '--soul')
  const descriptor = readSoulDescriptor(soulPath)
  const templateRoot = path.resolve(path.dirname(soulPath), '..', descriptor.workspaceTemplate.root)
  return {
    descriptorRef: path.resolve(soulPath),
    displayName: descriptor.identity.name,
    files: readWorkspaceTemplateFiles(templateRoot),
    id: `${descriptor.identity.id}@${descriptor.identity.version}`,
    version: descriptor.identity.version,
  }
}

function extractProviderWarning(...values: string[]): string | undefined {
  for (const value of values) {
    const line = value.split(/\r?\n/).find(candidate => candidate.includes('AIWORKER_PROVIDER_WARNING:'))
    if (line)
      return redactSecretLike(line.trim())
  }
  return undefined
}

function redactedFailureSummary(error: unknown): string {
  const message = redactSecretLike(error instanceof Error ? error.message : String(error))
  const firstLine = message.split(/\r?\n/).find(line => line.trim() !== '') ?? 'provision failed'
  return firstLine.length > 240 ? `${firstLine.slice(0, 240)}...` : firstLine
}

function controlPlaneAuditDetails(parts: string[]): string {
  return redactSecretLike(parts.join('; '))
}

function upsertById<T extends Record<K, string>, K extends keyof T>(items: T[], next: T, key: K): T[] {
  const filtered = items.filter(item => item[key] !== next[key])
  return [...filtered, next]
}

function createDoctorReport(options: Record<string, unknown>): DoctorReport {
  const checks: DoctorCheck[] = [
    checkCliPackage(),
    checkAisshResolution(typeof options.aisshBin === 'string' ? options.aisshBin : undefined),
    checkAisshToken(),
    checkRedaction(),
    ...checkSourceEnvStructure(),
  ]

  if (typeof options.soul === 'string')
    checks.push(checkSoulDescriptor(options.soul))

  const redactedChecks = checks.map(check => ({
    ...check,
    message: redactSecretLike(check.message),
  }))

  return {
    checks: redactedChecks,
    status: aggregateDoctorStatus(redactedChecks),
  }
}

function checkCliPackage(): DoctorCheck {
  const manifest = readAiworkerPackageManifest()
  return { message: `aiworker ${manifest.version}`, name: 'cli-package', status: 'pass' }
}

function checkAisshResolution(aisshBin?: string): DoctorCheck {
  const invocation = resolveAisshInvocation(aisshBin)
  if (invocation.source === 'bundled')
    return { message: 'bundled aissh-cli launcher is available', name: 'aissh', status: 'pass' }
  if (invocation.source === 'explicit') {
    const resolved = resolveExecutable(invocation.file)
    if (!resolved) {
      return {
        message: isPathLike(invocation.file)
          ? `configured aissh executable does not exist or is not executable: ${invocation.file}`
          : `configured aissh command was not found on PATH: ${invocation.file}`,
        name: 'aissh',
        status: 'fail',
      }
    }
    return { message: `aissh executable is configured explicitly: ${resolved}`, name: 'aissh', status: 'pass' }
  }
  const resolved = resolveExecutable(invocation.file)
  return resolved
    ? { message: `aissh found on PATH: ${resolved}`, name: 'aissh', status: 'pass' }
    : { message: 'aissh was not found on PATH; install aissh-cli, run bun install for the bundled launcher, or set AISSH_BIN', name: 'aissh', status: 'fail' }
}

function checkAisshToken(): DoctorCheck {
  const credentials = resolveAisshCredentials(process.cwd(), process.env)
  if (credentials.source === 'env')
    return { message: 'AISSH_TOKEN is set (value hidden)', name: 'aissh-token', status: 'pass' }
  if (credentials.source === 'aissh-yaml')
    return { message: '.aissh.yaml token is available (value hidden); apply will pass it through AISSH_TOKEN from a neutral cwd', name: 'aissh-token', status: 'pass' }
  return { message: 'AISSH_TOKEN is not set and .aissh.yaml token was not found; plan works, apply needs aissh credentials', name: 'aissh-token', status: 'warn' }
}

function checkRedaction(): DoctorCheck {
  const redacted = redactSecretLike('sk-testsecret123456')
  return redacted === '[REDACTED]'
    ? { message: 'secret-like values are redacted in CLI output', name: 'redaction', status: 'pass' }
    : { message: 'secret redaction did not mask a provider-key-shaped value', name: 'redaction', status: 'fail' }
}

function checkSourceEnvStructure(): DoctorCheck[] {
  const examplePath = path.resolve(process.cwd(), '.env.example')
  const envPath = path.resolve(process.cwd(), '.env')
  if (!existsSync(examplePath) && !existsSync(envPath))
    return []
  if (!existsSync(examplePath))
    return [{ message: '.env exists but .env.example is missing in this checkout', name: 'env-structure', status: 'warn' }]
  if (!existsSync(envPath))
    return [{ message: '.env.example exists but .env is missing in this checkout', name: 'env-structure', status: 'warn' }]

  const expected = envStructureSignature(readFileSync(examplePath, 'utf8'))
  const actual = envStructureSignature(readFileSync(envPath, 'utf8'))
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    return [{ message: '.env structure differs from .env.example; run `bun run dev:env:sync` in the source checkout', name: 'env-structure', status: 'fail' }]
  return [{ message: '.env structure matches .env.example', name: 'env-structure', status: 'pass' }]
}

function checkSoulDescriptor(soulPath: string): DoctorCheck {
  try {
    const descriptor = readSoulDescriptor(soulPath)
    const templateRoot = path.resolve(path.dirname(soulPath), '..', descriptor.workspaceTemplate.root)
    const files = readWorkspaceTemplateFiles(templateRoot)
    createProvisionPlan({
      assignment: createAssignment({
        assignedEmail: 'doctor@example.invalid',
        environmentId: 'doctor-env',
        providerProfileId: 'doctor-provider',
        soulReleaseRef: `${descriptor.identity.id}@${descriptor.identity.version}`,
        workspaceRef: '$HOME/aiworker-workspaces/doctor',
      }),
      environment: {
        daemonEndpoint: 'paseo-daemon:remote-home',
        endpointKind: 'local-home',
        environmentId: 'doctor-env',
        isolation: 'single-user-dev',
        ownerEmail: 'doctor@example.invalid',
        paseoHome: '$HOME/.paseo',
        providerProfileIds: ['doctor-provider'],
        targetRef: 'aissh:doctor-target',
      },
      providerProfile: {
        id: 'doctor-provider',
        label: 'Doctor Provider',
        provider: 'claude',
        secretRef: 'secret://provider/doctor-provider',
      },
      soul: {
        displayName: descriptor.identity.name,
        files,
        id: descriptor.identity.id,
        version: descriptor.identity.version,
      },
    })
    return { message: `Soul descriptor ${descriptor.identity.id}@${descriptor.identity.version} has ${files.length} projected file(s)`, name: 'soul-descriptor', status: 'pass' }
  }
  catch (error) {
    return { message: error instanceof Error ? error.message : String(error), name: 'soul-descriptor', status: 'fail' }
  }
}

function aggregateDoctorStatus(checks: DoctorCheck[]): DoctorStatus {
  if (checks.some(check => check.status === 'fail'))
    return 'fail'
  if (checks.some(check => check.status === 'warn'))
    return 'warn'
  return 'pass'
}

function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    'AIWorker doctor',
    '',
    `Overall: ${report.status.toUpperCase()}`,
    '',
    ...report.checks.map(check => `${check.status.toUpperCase().padEnd(4)} ${check.name}: ${check.message}`),
  ]
  return lines.join('\n')
}

function envStructureSignature(contents: string): string[] {
  return contents.split(/\r?\n/).map((line) => {
    if (line.trim() === '')
      return 'blank:'
    if (line.startsWith('#'))
      return `comment:${line}`
    const key = line.match(/^([A-Z0-9_]+)=/)
    return key ? `env:${key[1]}` : `other:${line}`
  })
}

function isPathLike(file: string): boolean {
  return path.isAbsolute(file) || file.includes('/') || file.includes('\\')
}

function resolveExecutable(file: string): string | null {
  if (isPathLike(file))
    return isExecutableFile(file) ? file : null

  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir)
      continue
    const candidate = path.join(dir, file)
    if (isExecutableFile(candidate))
      return candidate
  }
  return null
}

function isExecutableFile(file: string): boolean {
  try {
    accessSync(file, constants.X_OK)
    return statSync(file).isFile()
  }
  catch {
    return false
  }
}

export async function executeProvisionPlan(plan: ProvisionPlan, options: ProvisionExecutionOptions = {}) {
  const invocation = resolveAisshInvocation(options.aisshBin)
  const args = [...invocation.prefix, ...plan.aissh.args]
  const executor = options.executor ?? createDefaultAisshExecutor()
  const credentials = resolveAisshCredentials(process.cwd(), process.env)
  const execCwd = await createNeutralAisshCwd()
  try {
    const result = await executor.execFile(invocation.file, args, {
      cwd: execCwd,
      env: credentials.env,
      maxBuffer: options.maxBuffer ?? 1024 * 1024 * 8,
    })
    return {
      aissh: {
        args: plan.aissh.args,
        cwd: execCwd,
        file: invocation.source === 'path' ? 'aissh' : invocation.file,
        source: invocation.source,
      },
      plan,
      status: 'executed',
      stderr: sanitizeAisshStream(result.stderr ?? '', plan),
      stdout: sanitizeAisshStream(result.stdout, plan),
    }
  }
  catch (error) {
    throw createRedactedAisshError(error, invocation.file, plan)
  }
  finally {
    await rm(execCwd, { force: true, recursive: true })
  }
}

export function resolveAisshInvocation(explicit?: string, resolveLauncher: () => string | null = resolveBundledAisshLauncher): AisshInvocation {
  const override = explicit ?? process.env.AISSH_BIN
  if (override)
    return { file: override, prefix: [], source: 'explicit' }
  const launcher = resolveLauncher()
  if (launcher)
    return { file: process.execPath, prefix: [launcher], source: 'bundled' }
  return { file: 'aissh', prefix: [], source: 'path' }
}

export function resolveBundledAisshLauncher(baseDir: string = import.meta.dirname): string | null {
  for (const dir of packageAnchorDirs(baseDir)) {
    const candidate = path.join(dir, 'node_modules', 'aissh-cli', 'bin', 'aissh.js')
    if (existsSync(candidate))
      return candidate
  }
  return null
}

export function resolveAisshCredentials(baseDir: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): AisshCredentialResolution {
  if (env.AISSH_TOKEN)
    return { env, source: 'env' }

  const token = readAisshYamlToken(baseDir)
  if (!token)
    return { env, source: 'missing' }

  return {
    env: {
      ...env,
      AISSH_TOKEN: token,
    },
    source: 'aissh-yaml',
  }
}

function readAisshYamlToken(baseDir: string): string | null {
  const configPath = path.resolve(baseDir, '.aissh.yaml')
  if (!existsSync(configPath))
    return null

  try {
    return parseAisshYamlToken(readFileSync(configPath, 'utf8'))
  }
  catch {
    return null
  }
}

function parseAisshYamlToken(value: string): string | null {
  const match = value.match(/^\s*token\s*:\s*(?:"([^"\n#]+)"|'([^'\n#]+)'|([^#\n]+))/im)
  const token = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim()
  return token === '' ? null : token
}

function packageAnchorDirs(baseDir: string): string[] {
  return Array.from(new Set([
    baseDir,
    path.dirname(baseDir),
    path.dirname(path.dirname(baseDir)),
  ]))
}

function createDefaultAisshExecutor(): AisshExecutor {
  return {
    async execFile(file, args, options) {
      const { stderr, stdout } = await execFileAsync(file, args, { ...options, encoding: 'utf8' })
      return { stderr, stdout }
    },
  }
}

async function createNeutralAisshCwd(): Promise<string> {
  const cwd = await mkdtemp(AISSH_EXEC_CWD_PREFIX)
  await chmod(cwd, 0o700)
  return cwd
}

function createRedactedAisshError(error: unknown, file: string, plan: ProvisionPlan): Error {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : ''
  if (code === 'ENOENT') {
    return new Error(redactSecretLike(`aissh CLI unavailable (${file}). Run bun install to install optional aissh-cli, or set AISSH_BIN to an existing aissh executable.`))
  }
  const signal = typeof error === 'object' && error !== null && 'signal' in error ? String((error as { signal?: unknown }).signal) : ''
  const stdout = typeof (error as { stdout?: unknown })?.stdout === 'string' ? (error as { stdout: string }).stdout : ''
  const stderr = typeof (error as { stderr?: unknown })?.stderr === 'string' ? (error as { stderr: string }).stderr : ''
  const summary = code && code !== 'undefined'
    ? `aissh execution failed (code ${code})`
    : signal && signal !== 'undefined'
      ? `aissh execution failed (signal ${signal})`
      : 'aissh execution failed'
  const detail = [
    summary,
    'The generated provisioning script is omitted from errors; inspect it locally with `aiworker plan ... --show-script`.',
    stdout ? `stdout: ${formatErrorStream(stdout, plan)}` : '',
    stderr ? `stderr: ${formatErrorStream(stderr, plan)}` : '',
    'Next step: run `aiworker doctor` locally, then rerun `aiworker apply ...` after fixing the target or aissh error.',
  ].filter(Boolean).join('\n')
  return new Error(redactSecretLike(detail))
}

function formatErrorStream(value: string, plan: ProvisionPlan): string {
  const sanitized = sanitizeAisshStream(value, plan)
  if (sanitized.length <= MAX_ERROR_STREAM_CHARS)
    return sanitized
  return `${sanitized.slice(0, MAX_ERROR_STREAM_CHARS)}\n... output truncated ...`
}

function sanitizeAisshStream(value: string, plan: ProvisionPlan): string {
  return scrubGeneratedProvisioningEcho(redactSensitiveAisshOutput(redactSecretLike(unwrapAisshExecutionEnvelope(value.trim()))), plan)
}

function unwrapAisshExecutionEnvelope(value: string): string {
  try {
    const parsed = JSON.parse(value) as { error?: unknown, exit_code?: unknown, message?: unknown, output?: unknown }
    const output = typeof parsed.output === 'string' ? parsed.output.trim() : ''
    const message = typeof parsed.message === 'string' && parsed.message.trim() !== '' ? `aissh message: ${parsed.message.trim()}` : ''
    const error = typeof parsed.error === 'string' && parsed.error.trim() !== '' ? `aissh error: ${parsed.error.trim()}` : ''
    const exitCode = typeof parsed.exit_code === 'number' ? `aissh exit_code: ${parsed.exit_code}` : ''
    const unwrapped = [output, message, error, exitCode].filter(Boolean).join('\n')
    return unwrapped || value
  }
  catch {
    return value
  }
}

function redactSensitiveAisshOutput(value: string): string {
  const redacted = value.replace(/[█▀▄▌▐■□▪▫]{4,}/g, '[REDACTED_QR]')

  const safeLines: string[] = []
  let omittedProviderPayload = false
  let jsonPayloadDepth = 0
  for (const line of redacted.split(/\r?\n/)) {
    const trimmed = line.trim()
    const nextJsonDepth = updateJsonPayloadDepth(jsonPayloadDepth, trimmed)
    if (jsonPayloadDepth > 0 || looksLikeRawProviderPayload(trimmed) || looksLikeJsonPayloadStart(trimmed)) {
      if (!omittedProviderPayload)
        safeLines.push('[omitted: raw Paseo provider payload]')
      omittedProviderPayload = true
      jsonPayloadDepth = nextJsonDepth
      continue
    }
    safeLines.push(line)
    omittedProviderPayload = false
    jsonPayloadDepth = 0
  }
  return safeLines.join('\n')
}

function looksLikeRawProviderPayload(line: string): boolean {
  return /"provider"\s*:|"model"\s*:|"id"\s*:|"thinkingOptionIds"\s*:|"defaultThinkingOptionId"\s*:|"modes"\s*:|"thinkingOptions"\s*:/.test(line)
}

function looksLikeJsonPayloadStart(trimmed: string): boolean {
  return trimmed.startsWith('{')
    || trimmed === '['
    || trimmed === '[]'
    || trimmed.startsWith('["')
    || trimmed.startsWith('[{')
}

function updateJsonPayloadDepth(previousDepth: number, trimmed: string): number {
  if (!looksLikeJsonPayloadStart(trimmed) && previousDepth === 0)
    return 0
  const opens = Array.from(trimmed).filter(char => char === '{' || char === '[').length
  const closes = Array.from(trimmed).filter(char => char === '}' || char === ']').length
  return Math.max(0, previousDepth + opens - closes)
}

function scrubGeneratedProvisioningEcho(value: string, plan: ProvisionPlan): string {
  return scrubGeneratedCommandEcho(value, generatedProvisioningNeedles(plan))
}

function scrubGeneratedCommandEcho(value: string, unsafeNeedles: string[]): string {
  const lines = value.split(/\r?\n/)
  const safeLines: string[] = []
  let omittedPreviousLine = false

  for (const line of lines) {
    if (isGeneratedProvisioningEcho(line, unsafeNeedles)) {
      if (!omittedPreviousLine)
        safeLines.push('[omitted: output echoed the generated provisioning command]')
      omittedPreviousLine = true
      continue
    }
    safeLines.push(line)
    omittedPreviousLine = false
  }

  return safeLines.join('\n')
}

function generatedProvisioningNeedles(plan: ProvisionPlan): string[] {
  return generatedCommandNeedles(plan.aissh.script, [plan.command, ...plan.aissh.args])
}

function generatedCommandNeedles(script: string, args: string[]): string[] {
  const base64Payloads = Array.from(script.matchAll(/printf '%s' (?:(['"])([A-Za-z0-9+/=]{16,})\1|([A-Za-z0-9+/=]{16,})) \| base64 -d/g), match => match[2] ?? match[3] ?? '')
  return [
    script,
    ...args,
    ...base64Payloads,
  ].filter(needle => needle.length >= 16)
}

function isGeneratedProvisioningEcho(line: string, unsafeNeedles: string[]): boolean {
  if (line.trimStart().startsWith('AIWORKER_HANDOFF_READY'))
    return false

  return line.includes('base64 -d')
    || line.includes('printf \'%s\'')
    || line.includes('set -euo pipefail')
    || line.includes('unset PASEO_HOST')
    || line.includes('AIWORKER_REMOTE_USER=')
    || line.includes('AIWORKER_REMOTE_UID=')
    || line.includes('AIWORKER_REMOTE_PWD=')
    || line.includes('AIWORKER_REMOTE_HOME=')
    || line.includes('AIWORKER_WORKSPACE_REF=')
    || line.includes('AIWORKER_PAIR_WORKSPACE_MISSING')
    || line.includes('test -d "$AIWORKER_WORKSPACE_REF"')
    || line.includes('cd "$AIWORKER_WORKSPACE_REF"')
    || line.includes('AIWorker target identity discovered: user=$AIWORKER_REMOTE_USER')
    || line.includes('export PASEO_HOME')
    || line.includes('npm install -g @getpaseo/cli')
    || line.includes('paseo daemon status')
    || line.includes('paseo daemon start')
    || line.includes('paseo daemon pair')
    || line.includes('paseo provider ls')
    || line.includes('paseo provider models')
    || line.includes('AIWORKER_PROVIDER_LS_JSON')
    || line.includes('AIWORKER_PASEO_PROVIDER_ID=')
    || line.includes('AIWORKER_PASEO_STATUS')
    || line.includes('.aiworker-projection')
    || unsafeNeedles.some(needle => line.includes(needle))
}

function readAiworkerPackageManifest(): { version: string } {
  for (const candidate of [
    path.resolve(import.meta.dirname, 'package.json'),
    path.resolve(import.meta.dirname, '..', 'package.json'),
  ]) {
    if (existsSync(candidate)) {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: unknown }
      if (typeof parsed.version === 'string' && parsed.version.length > 0)
        return { version: parsed.version }
      throw new Error(`aiworker package manifest is missing version: ${candidate}`)
    }
  }
  throw new Error('aiworker package manifest not found')
}

function readWorkspaceTemplateFiles(root: string): ProjectedFile[] {
  const files: ProjectedFile[] = []
  const walk = (dir: string, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(absolute, rel)
        continue
      }
      if (!entry.isFile())
        continue
      const mode = statSync(absolute).mode & 0o777
      files.push({
        content: readFileSync(absolute, 'utf8'),
        mode: mode === 0o755 ? 0o755 : mode === 0o600 ? 0o600 : 0o644,
        relativePath: rel,
      })
    }
  }
  walk(root)
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

if (import.meta.main) {
  try {
    await runCli(process.argv)
  }
  catch (error) {
    process.stderr.write(`${redactSecretLike(error instanceof Error ? error.message : String(error))}\n`)
    process.exitCode = 1
  }
}
