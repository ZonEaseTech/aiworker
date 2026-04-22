import type { ExecutorConfig, ExecutorProvider } from '@aiworker/shared'
import process from 'node:process'

import { AcpExecutor, getAcpAgent } from './engines/acp'
import { ClaudeCodeExecutor, DEFAULT_CLAUDE_CLI_VERSION } from './engines/claude-code'
import { CliExecutor } from './providers/cli'
import { OpenAICompatibleExecutor } from './providers/http'
import { McpExecutor } from './providers/mcp'

export function buildExecutor(config: ExecutorConfig): ExecutorProvider {
  switch (config.type) {
    case 'http':
      return new OpenAICompatibleExecutor({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        timeoutMs: config.timeoutMs,
      })
    case 'mcp':
      return new McpExecutor({
        url: config.url,
        token: config.token,
        ...(config.defaultModel === undefined ? {} : { defaultModel: config.defaultModel }),
        ...(config.tools === undefined ? {} : { tools: config.tools }),
        ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
      })
    case 'cli':
      return new CliExecutor({
        command: config.command,
        args: config.args,
        ...(config.cwd === undefined ? {} : { cwd: config.cwd }),
        ...(config.env === undefined ? {} : { env: config.env }),
        ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
        ...(config.sandbox === undefined ? {} : { sandbox: config.sandbox }),
      })
    case 'claude-code': {
      const envCliVersion = process.env.CLAUDE_CLI_VERSION
      const cliVersion = config.cliVersion ?? envCliVersion ?? DEFAULT_CLAUDE_CLI_VERSION
      return new ClaudeCodeExecutor({
        cliVersion,
        ...(config.model === undefined ? {} : { model: config.model }),
        ...(config.extraArgs === undefined ? {} : { extraArgs: config.extraArgs }),
        ...(config.env === undefined ? {} : { env: config.env }),
        ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
      })
    }
    case 'acp': {
      const agent = getAcpAgent(config.agent)
      return new AcpExecutor({
        agent,
        ...(config.model === undefined ? {} : { model: config.model }),
        ...(config.cliVersion === undefined ? {} : { cliVersion: config.cliVersion }),
        ...(config.extraArgs === undefined ? {} : { extraArgs: config.extraArgs }),
        ...(config.env === undefined ? {} : { env: config.env }),
        ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
      })
    }
  }
}
