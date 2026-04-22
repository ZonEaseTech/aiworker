import type { AcpAgentDefinition, AvailabilityInfo } from './types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * Qwen Code ACP adapter. Data-only — harness logic lives in `harness.ts`.
 *
 * CLI repo: https://github.com/QwenLM/qwen-code — forked from Gemini CLI with
 * Qwen-specific defaults. Same ACP framing as Gemini: `--acp` puts the CLI
 * into JSON-RPC-over-stdio mode; `--yolo` auto-approves tool calls.
 */
export const qwenAgent: AcpAgentDefinition = {
  id: 'qwen',
  label: 'Qwen Code',
  commandName: 'qwen',
  versionEnvVar: 'QWEN_CLI_VERSION',
  defaultVersion: '0.0.14',
  npxPackage: '@qwen-code/qwen-code',
  buildArgs: ({ model, yolo, extraArgs }) => {
    const args: string[] = []
    if (model && model.length > 0)
      args.push('--model', model)
    if (yolo)
      args.push('--yolo')
    // Qwen's `--acp` flag must come last so its trailing positional
    // behaviour doesn't swallow the preceding option values.
    args.push('--acp')
    if (extraArgs && extraArgs.length > 0)
      args.push(...extraArgs)
    return args
  },
  authProbe: async () => probeQwenAuth(),
}

async function probeQwenAuth(): Promise<AvailabilityInfo> {
  const checkedAt = new Date().toISOString()
  const home = os.homedir()
  const credsPath = path.join(home, '.qwen', 'oauth_creds.json')
  const configPath = path.join(home, '.qwen', 'settings.json')
  try {
    await fs.stat(credsPath)
    return { status: 'LoginDetected', checkedAt, detail: 'oauth_creds.json present' }
  }
  catch {
    // fall through
  }
  try {
    await fs.stat(configPath)
    return { status: 'InstallationFound', checkedAt, detail: 'settings.json present, login pending' }
  }
  catch {
    return { status: 'NotFound', checkedAt, detail: '~/.qwen not present' }
  }
}
