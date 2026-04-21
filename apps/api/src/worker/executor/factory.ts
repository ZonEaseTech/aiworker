import type { ExecutorConfig, ExecutorProvider } from '@aiworker/shared'

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
  }
}
