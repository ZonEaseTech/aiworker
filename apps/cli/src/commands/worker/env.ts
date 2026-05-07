import { chmod, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import consola from 'consola'

type StartupEnvKey = 'AIWORKER_DISPLAY_NAME' | 'AIWORKER_GATEWAY_URL'

interface EnvSetResult {
  changed: boolean
  envFile: string
  key: StartupEnvKey
  value: string
}

function normalizeSingleLineValue(raw: string, label: string): string {
  const value = raw.trim()
  if (value.length === 0)
    throw new Error(`${label} is required`)
  if (value.includes('\0') || value.includes('\n') || value.includes('\r'))
    throw new Error(`${label} must be a single line`)
  return value
}

function normalizeGatewayUrl(raw: string): string {
  const value = normalizeSingleLineValue(raw, 'gateway url')
  try {
    const url = new URL(value)
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol))
      throw new Error('unsupported protocol')
    return url.toString()
  }
  catch {
    throw new Error('gateway url must be a valid http(s) or ws(s) URL')
  }
}

function normalizeDisplayName(raw: string): string {
  const value = normalizeSingleLineValue(raw, 'display name')
  if (value.length > 80)
    throw new Error('display name must be 80 characters or fewer')
  return value
}

function parseDotenvAssignment(rawLine: string): { key: string, value: string } | null {
  const line = rawLine.trim()
  if (!line || line.startsWith('#'))
    return null
  const eq = line.indexOf('=')
  if (eq <= 0)
    return null
  const key = line.slice(0, eq).trim()
  let value = line.slice(eq + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
    value = value.slice(1, -1)
  return { key, value }
}

function formatDotenvAssignment(key: StartupEnvKey, value: string): string {
  return `${key}=${value}`
}

async function setStartupEnv(key: StartupEnvKey, value: string): Promise<EnvSetResult> {
  const scope = resolveAiworkerScope()
  const envFile = path.join(scope.home, '.env')
  let text: string
  try {
    text = await readFile(envFile, 'utf8')
  }
  catch {
    throw new Error(`worker-local .env not found at ${envFile}; run \`aiworker init --soul developer\` first`)
  }

  const lines = text.split('\n')
  let changed = false
  let found = false
  for (let index = 0; index < lines.length; index += 1) {
    const assignment = parseDotenvAssignment(lines[index]!)
    if (assignment?.key !== key)
      continue
    found = true
    if (assignment.value !== value) {
      lines[index] = formatDotenvAssignment(key, value)
      changed = true
    }
  }

  if (!found) {
    if (lines.length > 0 && lines[lines.length - 1] !== '')
      lines.push('')
    lines.push('# Worker-local gateway enrollment startup env.')
    lines.push(formatDotenvAssignment(key, value))
    lines.push('')
    changed = true
  }

  if (changed) {
    const nextText = lines.join('\n')
    await writeFile(envFile, nextText.endsWith('\n') ? nextText : `${nextText}\n`, { mode: 0o600 })
    await chmod(envFile, 0o600)
  }

  return { changed, envFile, key, value }
}

async function runEnvSet(key: StartupEnvKey, value: string): Promise<number> {
  try {
    const result = await setStartupEnv(key, value)
    const verb = result.changed ? 'stored' : 'already set'
    consola.success(`[aiworker env] ${verb} ${result.key} in ${result.envFile}`)
    return 0
  }
  catch (err) {
    consola.error(`[aiworker env] ${err instanceof Error ? err.message : String(err)}`)
    return 2
  }
}

export async function runEnvGatewayUrl(url: string): Promise<number> {
  try {
    return await runEnvSet('AIWORKER_GATEWAY_URL', normalizeGatewayUrl(url))
  }
  catch (err) {
    consola.error(`[aiworker env] ${err instanceof Error ? err.message : String(err)}`)
    return 2
  }
}

export async function runEnvDisplayName(name: string): Promise<number> {
  try {
    return await runEnvSet('AIWORKER_DISPLAY_NAME', normalizeDisplayName(name))
  }
  catch (err) {
    consola.error(`[aiworker env] ${err instanceof Error ? err.message : String(err)}`)
    return 2
  }
}
