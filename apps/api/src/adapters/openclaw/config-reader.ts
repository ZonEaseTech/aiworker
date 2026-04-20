import type { OpenClawConfig } from './types'

import { homedir } from 'node:os'
import { join } from 'node:path'

import consola from 'consola'

function expandHome(dir: string): string {
  if (dir.startsWith('~'))
    return join(homedir(), dir.slice(1))
  return dir
}

function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {}

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1)
      continue

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
      value = value.slice(1, -1)

    if (key)
      env[key] = value
  }

  return env
}

export async function readOpenClawConfig(openclawHome?: string): Promise<OpenClawConfig | null> {
  const baseDir = expandHome(openclawHome ?? '~/.openclaw')
  const configPath = join(baseDir, 'openclaw.json')
  const envPath = join(baseDir, '.env')

  let configData: Record<string, unknown> = {}
  let envData: Record<string, string> = {}

  // Read openclaw.json
  try {
    const file = Bun.file(configPath)
    if (await file.exists()) {
      const raw = await file.text()
      configData = JSON.parse(raw) as Record<string, unknown>
    }
  }
  catch (err) {
    consola.debug('[openclaw] Failed to read config:', err instanceof Error ? err.message : err)
  }

  // Read .env
  try {
    const file = Bun.file(envPath)
    if (await file.exists()) {
      const raw = await file.text()
      envData = parseEnvFile(raw)
    }
  }
  catch (err) {
    consola.debug('[openclaw] Failed to read .env:', err instanceof Error ? err.message : err)
  }

  // If neither file exists, return null (OpenClaw not installed)
  if (Object.keys(configData).length === 0 && Object.keys(envData).length === 0) {
    consola.debug('[openclaw] No configuration found at', baseDir)
    return null
  }

  const gateway = configData.gateway as Record<string, unknown> | undefined

  return {
    workspace: String(configData.workspace ?? ''),
    gateway: {
      host: String(gateway?.host ?? 'localhost'),
      port: Number(gateway?.port ?? 18789),
    },
    tools: Array.isArray(configData.tools) ? configData.tools.map(String) : [],
    env: envData,
  }
}
