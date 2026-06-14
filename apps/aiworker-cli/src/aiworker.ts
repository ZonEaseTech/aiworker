#!/usr/bin/env bun
import type { ProjectedFile } from '@zonease/aiworker-control'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createAssignment, createProvisionPlan } from '@zonease/aiworker-control'
import { parseSoulDescriptorV1 } from '@zonease/aiworker-soul-descriptor'
import cac from 'cac'

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
      const descriptor = parseSoulDescriptorV1(JSON.parse(readFileSync(requireOption(options.soul, '--soul'), 'utf8')))
      const soulPath = requireOption(options.soul, '--soul')
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
      const plan = createProvisionPlan({
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
      printJson(plan)
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
