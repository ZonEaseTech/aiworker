import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export interface HostServerOption {
  host?: string
  id: string
  name?: string
  notes?: string
  source: 'aissh'
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
  servers: HostServerOption[]
  soulReleases: HostSoulReleaseOption[]
  serverSourceError?: string
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

export async function buildHostOptions(input: BuildHostOptionsInput = {}): Promise<HostOptionsView> {
  const repoRoot = input.repoRoot ?? process.cwd()
  const soulSourceErrors: string[] = []
  let serverSourceError: string | undefined
  let servers: HostServerOption[] = []

  try {
    servers = parseAisshServerListOutput(await (input.aisshServerList ?? runAisshServerList)())
  }
  catch (error) {
    serverSourceError = error instanceof Error ? error.message : String(error)
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
    ...(serverSourceError ? { serverSourceError } : {}),
    servers,
    ...(soulSourceErrors.length > 0 ? { soulSourceErrors } : {}),
    soulReleases,
  }
}

export function parseAisshServerListOutput(output: string): HostServerOption[] {
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
      ...(typeof record.host === 'string' ? { host: record.host } : {}),
      id: record.id,
      ...(typeof record.name === 'string' ? { name: record.name } : {}),
      ...(typeof record.notes === 'string' ? { notes: record.notes } : {}),
      source: 'aissh' as const,
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
