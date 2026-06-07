import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'

export type ProvisioningAdapterType = 'aissh' | 'docker' | 'local'
export type ProvisioningTargetMaturity = 'production' | 'preview' | 'dev'
export type ProvisioningTargetHealth = 'ready' | 'degraded' | 'unavailable'

export interface HostProvisioningTargetOption {
  adapterType: ProvisioningAdapterType
  capabilities: string[]
  description?: string
  displayName: string
  health: ProvisioningTargetHealth
  id: string
  maturity: ProvisioningTargetMaturity
  ref: string
}

export interface HostSoulReleaseOption {
  descriptorPath: string
  id: string
  name: string
  releaseRef: string
  source: 'official'
}

export interface HostOptionsView {
  access: {
    mode: 'not-ready'
    status: 'deferred-worker-access-tunnel'
  }
  auth: {
    mode: 'dev-static'
    status: 'deferred-logto'
  }
  provisioningTargets: HostProvisioningTargetOption[]
  provisioningTargetSourceError?: string
  soulReleases: HostSoulReleaseOption[]
  soulSourceErrors?: string[]
}

export interface BuildHostOptionsInput {
  aisshServerList?: () => Promise<string>
  repoRoot?: string
}

const OFFICIAL_SOUL_IDS = [
  'aiworker-freeform',
  'google-ads',
  'hr-manager',
  'product-manager',
  'software-support',
] as const

const DEV_TARGETS: HostProvisioningTargetOption[] = [
  {
    adapterType: 'docker',
    capabilities: ['clean-container', 'isolated-worker-home', 'release-bundle-proof'],
    displayName: 'Docker 预发布环境',
    health: 'ready',
    id: 'docker:local-default',
    maturity: 'preview',
    ref: 'docker://local/default',
  },
  {
    adapterType: 'local',
    capabilities: ['local-process', 'isolated-aiworker-home', 'browser-e2e-proof'],
    displayName: '本机开发环境',
    health: 'ready',
    id: 'local:default',
    maturity: 'dev',
    ref: 'local://default',
  },
]

export async function buildHostOptions(input: BuildHostOptionsInput = {}): Promise<HostOptionsView> {
  const repoRoot = input.repoRoot ?? process.cwd()
  const soulSourceErrors: string[] = []
  let provisioningTargetSourceError: string | undefined
  let aisshTargets: HostProvisioningTargetOption[] = []

  try {
    aisshTargets = parseAisshServerListOutput(await (input.aisshServerList ?? runAisshServerList)())
  }
  catch (error) {
    provisioningTargetSourceError = error instanceof Error ? error.message : String(error)
  }

  const soulReleases = OFFICIAL_SOUL_IDS.flatMap((id) => {
    const descriptorAbsPath = join(repoRoot, 'souls', id, 'dist', 'soul.descriptor.json')
    if (!existsSync(descriptorAbsPath))
      return []

    try {
      const descriptor = JSON.parse(readFileSync(descriptorAbsPath, 'utf8')) as Record<string, unknown>
      const identity = descriptor.identity
      if (!identity || typeof identity !== 'object')
        throw new Error(`Invalid Soul descriptor identity: ${id}`)

      const identityRecord = identity as Record<string, unknown>
      if (typeof identityRecord.id !== 'string' || typeof identityRecord.name !== 'string')
        throw new Error(`Invalid Soul descriptor identity: ${id}`)

      return [{
        descriptorPath: relative(repoRoot, descriptorAbsPath),
        id: identityRecord.id,
        name: identityRecord.name,
        releaseRef: `${identityRecord.id}@dev`,
        source: 'official' as const,
      }]
    }
    catch (error) {
      soulSourceErrors.push(error instanceof Error ? error.message : String(error))
      return []
    }
  })

  return {
    access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
    auth: { mode: 'dev-static', status: 'deferred-logto' },
    ...(provisioningTargetSourceError ? { provisioningTargetSourceError } : {}),
    provisioningTargets: [...aisshTargets, ...DEV_TARGETS],
    ...(soulSourceErrors.length > 0 ? { soulSourceErrors } : {}),
    soulReleases,
  }
}

export function parseAisshServerListOutput(output: string): HostProvisioningTargetOption[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  }
  catch {
    throw new Error('Invalid aissh server list JSON')
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { servers?: unknown }).servers))
    throw new Error('Invalid aissh server list response')

  return (parsed as { servers: unknown[] }).servers.flatMap((server) => {
    if (!server || typeof server !== 'object')
      return []
    const record = server as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.trim().length === 0)
      return []

    return [{
      adapterType: 'aissh' as const,
      capabilities: ['remote-delivery', 'worker-check-in', 'worker-access'],
      ...(typeof record.notes === 'string' ? { description: record.notes } : {}),
      displayName: typeof record.name === 'string' && record.name.trim() ? record.name : record.id,
      health: 'ready' as const,
      id: `aissh:${record.id}`,
      maturity: 'production' as const,
      ref: record.id,
    }]
  })
}

async function runAisshServerList(): Promise<string> {
  const proc = Bun.spawn(['aissh', 'server', 'list'], {
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0)
    throw new Error(stderr.trim() || `aissh server list exited ${exitCode}`)
  return stdout
}
