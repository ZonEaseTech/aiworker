#!/usr/bin/env bun
import type { ProjectedFile, ProvisionPlan } from '@zonease/aiworker-control'
import { execFile as execFileCallback } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { createAssignment, createProvisionPlan, redactSecretLike } from '@zonease/aiworker-control'
import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'
import cac from 'cac'

const execFileAsync = promisify(execFileCallback)
export const AISSH_EXEC_CWD = tmpdir()

interface AisshInvocation {
  file: string
  prefix: string[]
  source: 'explicit' | 'bundled' | 'path'
}

export interface AisshExecutor {
  execFile: (file: string, args: string[], options: { cwd: string, maxBuffer: number }) => Promise<{ stderr?: string, stdout: string }>
}

interface ProvisionExecutionOptions {
  aisshBin?: string
  executor?: AisshExecutor
  maxBuffer?: number
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function requireOption(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`missing required option ${name}`)
  return value.trim()
}

export function buildCli() {
  const cli = cac('aiworker')
  cli.command('plan-provision', 'Generate an aissh provisioning plan for a Paseo workspace assignment')
    .option('--user <email>', 'assigned employee email')
    .option('--target <ref>', 'aissh target ref, e.g. aissh:server-1')
    .option('--environment <id>', 'Paseo environment id')
    .option('--paseo-home <path>', 'PASEO_HOME for the target employee environment')
    .option('--paseo-endpoint <endpoint>', 'Paseo daemon endpoint: unix socket, TCP endpoint, or relay pairing offer')
    .option('--provider <id>', 'Paseo provider profile id')
    .option('--provider-kind <kind>', 'provider kind', { default: 'claude' })
    .option('--provider-base-url <url>', 'provider base URL metadata; no provider key')
    .option('--provider-cli <command>', 'provider CLI command to verify on the target')
    .option('--provider-model <model>', 'provider default model metadata')
    .option('--provider-secret-ref <ref>', 'secret reference for provider credentials', { default: undefined })
    .option('--paseo-provider-id <id>', 'Paseo-native provider profile id, required for ACP without --provider-cli')
    .option('--soul <path>', 'built dist/soul.descriptor.json')
    .option('--workspace <path>', 'workspace directory to create/project')
    .action((options) => {
      printJson(createPlanFromOptions(options))
    })

  cli.command('provision', 'Execute a Paseo workspace provisioning plan through aissh')
    .option('--user <email>', 'assigned employee email')
    .option('--target <ref>', 'aissh target ref, e.g. aissh:server-1')
    .option('--environment <id>', 'Paseo environment id')
    .option('--paseo-home <path>', 'PASEO_HOME for the target employee environment')
    .option('--paseo-endpoint <endpoint>', 'Paseo daemon endpoint: unix socket, TCP endpoint, or relay pairing offer')
    .option('--provider <id>', 'Paseo provider profile id')
    .option('--provider-kind <kind>', 'provider kind', { default: 'claude' })
    .option('--provider-base-url <url>', 'provider base URL metadata; no provider key')
    .option('--provider-cli <command>', 'provider CLI command to verify on the target')
    .option('--provider-model <model>', 'provider default model metadata')
    .option('--provider-secret-ref <ref>', 'secret reference for provider credentials', { default: undefined })
    .option('--paseo-provider-id <id>', 'Paseo-native provider profile id, required for ACP without --provider-cli')
    .option('--soul <path>', 'built dist/soul.descriptor.json')
    .option('--workspace <path>', 'workspace directory to create/project')
    .option('--aissh-bin <path>', 'override aissh executable; defaults to AISSH_BIN, bundled aissh-cli launcher, then PATH')
    .option('--dry-run', 'print the plan without executing aissh')
    .action(async (options) => {
      const plan = createPlanFromOptions(options)
      if (options.dryRun) {
        printJson({ dryRun: true, plan })
        return
      }
      printJson(await executeProvisionPlan(plan, { aisshBin: typeof options.aisshBin === 'string' ? options.aisshBin : undefined }))
    })

  cli.command('describe', 'Print the current thin-layer product boundary').action(() => {
    printJson({
      aiworker: ['assignment ledger', 'aissh provisioner', 'provider profile registry', 'Soul filesystem projector'],
      notAiworker: ['Worker runtime', 'Workbench', 'chat/session UI', 'engine bridge', 'Paseo fork/vendor/embed'],
      paseo: ['daemon', 'workspace UI', 'sessions', 'terminal/browser/diff', 'provider orchestration'],
    })
  })

  cli.help()
  cli.version(readAiworkerPackageManifest().version)
  return cli
}

function createPlanFromOptions(options: Record<string, unknown>): ProvisionPlan {
  const soulPath = requireOption(options.soul, '--soul')
  const descriptor = parseSoulDescriptorV1(JSON.parse(readFileSync(soulPath, 'utf8')))
  const templateRoot = path.resolve(path.dirname(soulPath), '..', descriptor.workspaceTemplate.root)
  const user = requireOption(options.user, '--user')
  const environmentId = requireOption(options.environment, '--environment')
  const providerProfileId = requireOption(options.provider, '--provider')
  const workspaceRef = requireOption(options.workspace, '--workspace')
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
      daemonEndpoint: requireOption(options.paseoEndpoint, '--paseo-endpoint'),
      isolation: 'os-user',
      endpointKind: String(options.paseoEndpoint).startsWith('unix:') ? 'unix' : String(options.paseoEndpoint).startsWith('https://app.paseo.sh/#offer=') ? 'relay-offer' : 'tcp',
      ownerEmail: user,
      paseoHome: requireOption(options.paseoHome, '--paseo-home'),
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

export async function executeProvisionPlan(plan: ProvisionPlan, options: ProvisionExecutionOptions = {}) {
  const invocation = resolveAisshInvocation(options.aisshBin)
  const args = [...invocation.prefix, ...plan.aissh.args]
  const executor = options.executor ?? createDefaultAisshExecutor()
  const result = await executor.execFile(invocation.file, args, {
    cwd: AISSH_EXEC_CWD,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 8,
  })
  return {
    aissh: {
      args: plan.aissh.args,
      cwd: AISSH_EXEC_CWD,
      file: invocation.source === 'path' ? 'aissh' : invocation.file,
      source: invocation.source,
    },
    plan,
    status: 'executed',
    stderr: redactSecretLike(result.stderr ?? ''),
    stdout: redactSecretLike(result.stdout),
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

function resolveBundledAisshLauncher(): string | null {
  let dir = process.cwd()
  for (;;) {
    const candidate = path.join(dir, 'node_modules', 'aissh-cli', 'bin', 'aissh.js')
    if (existsSync(candidate))
      return candidate
    const parent = path.dirname(dir)
    if (parent === dir)
      return null
    dir = parent
  }
}

function createDefaultAisshExecutor(): AisshExecutor {
  return {
    async execFile(file, args, options) {
      try {
        const { stderr, stdout } = await execFileAsync(file, args, options)
        return { stderr, stdout }
      }
      catch (error) {
        if ((error as { code?: string }).code === 'ENOENT')
          throw new Error(`aissh CLI unavailable (${file}). Run bun install to install optional aissh-cli, or set AISSH_BIN to an existing aissh executable.`)
        throw error
      }
    },
  }
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
    buildCli().parse(process.argv)
  }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
