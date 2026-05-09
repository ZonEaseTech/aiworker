import type { AcpAgentDefinition } from './types'
import { probeAcpGeminiAuth } from '../../../availability'

/**
 * Gemini CLI ACP adapter. Data-only — harness logic lives in `harness.ts`.
 *
 * CLI docs: https://github.com/google-gemini/gemini-cli — the `--experimental-acp`
 * flag puts the CLI into ACP mode (JSON-RPC over stdio). `--yolo` is only
 * appended when the operator explicitly enables `autoApprove`.
 *
 * FEAT-018 起 auth 探测逻辑统一由 `worker/executor/availability.ts` 托管，本
 * 文件仅保留声明性绑定以消除重复。
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
  authProbe: () => probeAcpGeminiAuth(),
}
