import type { Buffer } from 'node:buffer'

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import process from 'node:process'

export type SpawnFn = typeof spawnSync

export interface CommandLookup {
  found: boolean
  path: null | string
  version: null | string
}

export interface ProbeDeps {
  env?: Record<string, string | undefined>
  spawn?: SpawnFn
}

function decode(value: Buffer | null | string | undefined): string {
  if (value == null)
    return ''
  return typeof value === 'string' ? value : value.toString('utf8')
}

// Resolve a command through a non-interactive `sh -c command -v`, inheriting the
// caller's PATH — this matches what systemd units and deploy scripts actually
// see (the class that hid bun from non-interactive shells during bring-up).
export function whichCommand(command: string, deps: ProbeDeps = {}): null | string {
  const spawn = deps.spawn ?? spawnSync
  const env = deps.env ?? process.env
  const result = spawn('sh', ['-c', `command -v ${command}`], { encoding: 'utf8', env, timeout: 2500 })
  if (result.status !== 0)
    return null
  const out = decode(result.stdout).trim()
  return out.length > 0 ? out : null
}

export function commandVersion(commandPath: string, deps: ProbeDeps = {}): null | string {
  const spawn = deps.spawn ?? spawnSync
  const env = deps.env ?? process.env
  const result = spawn(commandPath, ['--version'], { encoding: 'utf8', env, timeout: 2500 })
  if (result.status !== 0)
    return null
  const first = decode(result.stdout).split('\n')[0]?.trim()
  return first && first.length > 0 ? first : null
}

export function inspectCommand(command: string, deps: ProbeDeps = {}): CommandLookup {
  const path = whichCommand(command, deps)
  if (!path)
    return { found: false, path: null, version: null }
  return { found: true, path, version: commandVersion(path, deps) }
}

export function fileExists(path: string, exists: (p: string) => boolean = existsSync): boolean {
  return exists(path)
}

export function envPresence(
  keys: string[],
  env: Record<string, string | undefined> = process.env,
): { missing: string[], present: string[] } {
  const present: string[] = []
  const missing: string[] = []
  for (const key of keys) {
    const value = env[key]
    if (typeof value === 'string' && value.trim().length > 0)
      present.push(key)
    else
      missing.push(key)
  }
  return { missing, present }
}

export interface HttpProbeResult {
  error?: string
  ok: boolean
  status: null | number
}

export async function httpProbe(
  url: string,
  options: { fetch?: typeof fetch, timeoutMs?: number } = {},
): Promise<HttpProbeResult> {
  const fetchImpl = options.fetch ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 2500)
  try {
    const response = await fetchImpl(url, { signal: controller.signal })
    return { ok: response.ok, status: response.status }
  }
  catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false, status: null }
  }
  finally {
    clearTimeout(timer)
  }
}
