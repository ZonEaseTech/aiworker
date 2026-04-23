import type { AcpAgentDefinition } from './types'
import { probeAcpQwenAuth } from '../../../availability'

/**
 * Qwen Code ACP adapter. Data-only — harness logic lives in `harness.ts`.
 *
 * CLI repo: https://github.com/QwenLM/qwen-code — forked from Gemini CLI with
 * Qwen-specific defaults. Same ACP framing as Gemini: `--acp` puts the CLI
 * into JSON-RPC-over-stdio mode; `--yolo` auto-approves tool calls.
 *
 * FEAT-018 起 auth 探测逻辑统一由 `worker/executor/availability.ts` 托管。
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
  authProbe: () => probeAcpQwenAuth(),
}
