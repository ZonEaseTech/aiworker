import type {
  AcpVariantBody,
  ClaudeCodeVariantBody,
  CliVariantBody,
  CodexVariantBody,
  CursorVariantBody,
  ExecutorConfig,
  ExecutorProvider,
  HttpVariantBody,
  McpVariantBody,
} from '@zonease/aiworker-shared'
import process from 'node:process'

import { resolveVariant } from './default-profiles'
import { AcpExecutor, getAcpAgent } from './engines/acp'
import { ClaudeCodeExecutor, DEFAULT_CLAUDE_CLI_VERSION } from './engines/claude-code'
import { CodexExecutor, DEFAULT_CODEX_CLI_VERSION } from './engines/codex'
import { CursorExecutor } from './engines/cursor'
import { FallbackExecutor } from './fallback'
import { CliExecutor } from './providers/cli'
import { OpenAICompatibleExecutor } from './providers/http'
import { McpExecutor } from './providers/mcp'

/**
 * Build the per-engine executor instance from a three-tier `ExecutorProfile`.
 * Variant body + overrides are merged via `resolveVariant`; this switch only
 * translates the merged effective config + per-request profile knobs into the
 * engine-specific constructor signature.
 *
 * If the profile carries a non-empty `fallbacks` chain (PLAN-014 §F3), the
 * primary executor is wrapped in a `FallbackExecutor`. Each fallback entry's
 * executor is itself built recursively, so chains can nest.
 *
 * Each constructed engine MUST honour the thin adapter contract documented in
 * `@zonease/aiworker-shared/providers/executor` (file header):
 *   - cheap `health()`,
 *   - `listTools()`（engine 自管 tools 时返回空数组），
 *   - `run(input)` 输出 `AsyncIterable<AgentEvent>`（cooperative cancel via
 *     `input.signal`，optional resume via `input.engineBinding`），
 *   - 抛出的错误带 `kind` 以便 fallback/retry 层判定。
 *
 * 显式不承诺：isolation、effective capability source of truth、tool loop /
 * approval / sandbox / native session 的接管。这些都归外部 engine 自己负责。
 */
export function buildExecutor(profile: ExecutorConfig): ExecutorProvider {
  const primary = buildPrimaryExecutor(profile)
  if (!profile.fallbacks || profile.fallbacks.length === 0)
    return primary

  const links = profile.fallbacks.map(entry => ({
    executor: buildExecutor(entry.executor),
    onErrorKinds: entry.onErrorKinds,
    maxRetries: entry.maxRetries ?? 1,
  }))
  return new FallbackExecutor(primary, links)
}

function buildPrimaryExecutor(profile: ExecutorConfig): ExecutorProvider {
  const resolved = resolveVariant(profile)

  switch (resolved.engine) {
    case 'http': {
      const body = resolved.body as HttpVariantBody
      return new OpenAICompatibleExecutor({
        baseUrl: body.baseUrl,
        apiKey: body.apiKey,
        model: resolved.modelId ?? body.model,
        timeoutMs: body.timeoutMs,
      })
    }
    case 'mcp': {
      const body = resolved.body as McpVariantBody
      return new McpExecutor({
        url: body.url,
        token: body.token,
        ...(resolved.modelId !== undefined
          ? { defaultModel: resolved.modelId }
          : body.defaultModel === undefined ? {} : { defaultModel: body.defaultModel }),
        ...(body.tools === undefined ? {} : { tools: body.tools }),
        ...(body.timeoutMs === undefined ? {} : { timeoutMs: body.timeoutMs }),
      })
    }
    case 'cli': {
      const body = resolved.body as CliVariantBody
      const cmd = resolved.cmd
      const command = cmd?.binary ?? body.command
      const args = cmd?.extraArgs ? [...body.args, ...cmd.extraArgs] : body.args
      const env = mergeEnv(body.env, cmd?.env)
      return new CliExecutor({
        command,
        args,
        ...(body.cwd === undefined ? {} : { cwd: body.cwd }),
        ...(env === undefined ? {} : { env }),
        ...(body.timeoutMs === undefined ? {} : { timeoutMs: body.timeoutMs }),
        ...(body.sandbox === undefined ? {} : { sandbox: body.sandbox }),
      })
    }
    case 'claude-code': {
      const body = resolved.body as ClaudeCodeVariantBody
      const cmd = resolved.cmd
      const cliVersion = cmd?.cliVersion
        ?? body.cliVersion
        ?? process.env.CLAUDE_CLI_VERSION
        ?? DEFAULT_CLAUDE_CLI_VERSION
      const model = resolved.modelId ?? body.model
      const extraArgs = mergeArgs(body.extraArgs, cmd?.extraArgs)
      const env = mergeEnv(body.env, cmd?.env)
      return new ClaudeCodeExecutor({
        cliVersion,
        ...(model === undefined ? {} : { model }),
        ...(extraArgs === undefined ? {} : { extraArgs }),
        ...(env === undefined ? {} : { env }),
        ...(body.timeoutMs === undefined ? {} : { timeoutMs: body.timeoutMs }),
      })
    }
    case 'acp': {
      const body = resolved.body as AcpVariantBody
      const cmd = resolved.cmd
      const cliVersion = cmd?.cliVersion ?? body.cliVersion
      const model = resolved.modelId ?? body.model
      const extraArgs = mergeArgs(body.extraArgs, cmd?.extraArgs)
      const env = mergeEnv(body.env, cmd?.env)
      const agent = getAcpAgent(body.agent)
      return new AcpExecutor({
        agent,
        ...(model === undefined ? {} : { model }),
        ...(cliVersion === undefined ? {} : { cliVersion }),
        ...(extraArgs === undefined ? {} : { extraArgs }),
        ...(env === undefined ? {} : { env }),
        ...(body.timeoutMs === undefined ? {} : { timeoutMs: body.timeoutMs }),
      })
    }
    case 'codex': {
      const body = resolved.body as CodexVariantBody
      const cmd = resolved.cmd
      const cliVersion = cmd?.cliVersion
        ?? process.env.CODEX_CLI_VERSION
        ?? DEFAULT_CODEX_CLI_VERSION
      const model = resolved.modelId ?? body.model
      const extraArgs = cmd?.extraArgs
      const env = cmd?.env
      return new CodexExecutor({
        cliVersion,
        ...(model === undefined ? {} : { model }),
        ...(extraArgs === undefined ? {} : { extraArgs }),
        ...(env === undefined ? {} : { env }),
        ...(body.timeoutMs === undefined ? {} : { timeoutMs: body.timeoutMs }),
      })
    }
    case 'cursor': {
      const body = resolved.body as CursorVariantBody
      const cmd = resolved.cmd
      const model = resolved.modelId ?? body.model
      const extraArgs = cmd?.extraArgs
      const env = cmd?.env
      return new CursorExecutor({
        ...(model === undefined ? {} : { model }),
        ...(extraArgs === undefined ? {} : { extraArgs }),
        ...(env === undefined ? {} : { env }),
        ...(body.timeoutMs === undefined ? {} : { timeoutMs: body.timeoutMs }),
      })
    }
  }
}

function mergeArgs(base: string[] | undefined, extra: string[] | undefined): string[] | undefined {
  if (!base && !extra)
    return undefined
  return [...(base ?? []), ...(extra ?? [])]
}

function mergeEnv(
  base: Record<string, string> | undefined,
  extra: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!base && !extra)
    return undefined
  return { ...(base ?? {}), ...(extra ?? {}) }
}
