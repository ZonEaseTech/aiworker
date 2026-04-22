import type { AcpAgentDefinition, AvailabilityInfo } from './types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * Gemini CLI ACP adapter. Data-only — harness logic lives in `harness.ts`.
 *
 * CLI docs: https://github.com/google-gemini/gemini-cli — the `--experimental-acp`
 * flag puts the CLI into ACP mode (JSON-RPC over stdio). We pair it with
 * `--yolo` + an allowed-tools list so the FEAT-013 auto-approve path never
 * hits interactive prompts.
 */
export const geminiAgent: AcpAgentDefinition = {
  id: 'gemini',
  label: 'Gemini CLI',
  commandName: 'gemini',
  versionEnvVar: 'GEMINI_CLI_VERSION',
  defaultVersion: '0.9.0',
  npxPackage: '@google/gemini-cli',
  buildArgs: ({ model, yolo, extraArgs }) => {
    const args: string[] = ['--experimental-acp']
    if (model && model.length > 0)
      args.push('--model', model)
    if (yolo)
      args.push('--yolo', '--allowed-tools', 'run_shell_command')
    if (extraArgs && extraArgs.length > 0)
      args.push(...extraArgs)
    return args
  },
  authProbe: async () => probeGeminiAuth(),
}

async function probeGeminiAuth(): Promise<AvailabilityInfo> {
  const checkedAt = new Date().toISOString()
  // Gemini CLI stores OAuth credentials under ~/.gemini — presence of the
  // creds file is treated as "logged in". If the directory exists but the
  // creds file doesn't we downgrade to "InstallationFound".
  const home = os.homedir()
  const credsPath = path.join(home, '.gemini', 'oauth_creds.json')
  const configPath = path.join(home, '.gemini', 'settings.json')
  try {
    await fs.stat(credsPath)
    return { status: 'LoginDetected', checkedAt, detail: 'oauth_creds.json present' }
  }
  catch {
    // fall through to settings.json check
  }
  try {
    await fs.stat(configPath)
    return { status: 'InstallationFound', checkedAt, detail: 'settings.json present, login pending' }
  }
  catch {
    return { status: 'NotFound', checkedAt, detail: '~/.gemini not present' }
  }
}
