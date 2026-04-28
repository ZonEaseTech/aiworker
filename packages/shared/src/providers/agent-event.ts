import { z } from 'zod'

/**
 * Engine-agnostic event schema emitted by any `ExecutorProvider.run(...)` loop.
 *
 * One `AgentEvent` shape must carry the output of every engine we support
 * (OpenAI-compat chat, Claude Code control protocol, ACP, Codex JSON-RPC,
 * Cursor stream-json, ...). Engine-specific wire formats live inside each
 * adapter; only `AgentEvent` crosses the orchestrator boundary.
 */

/** Semantic classification of a tool the agent is invoking. */
export const toolActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('file_read'), path: z.string() }),
  z.object({ kind: z.literal('file_edit'), path: z.string(), diff: z.string().optional() }),
  z.object({ kind: z.literal('command_run'), command: z.string() }),
  z.object({ kind: z.literal('search'), query: z.string() }),
  z.object({ kind: z.literal('web_fetch'), url: z.string() }),
  z.object({ kind: z.literal('task_plan'), summary: z.string() }),
  z.object({ kind: z.literal('tool'), toolName: z.string(), arguments: z.record(z.unknown()).optional() }),
  z.object({ kind: z.literal('other'), description: z.string().optional() }),
])
export type ToolAction = z.infer<typeof toolActionSchema>

/** Runtime state of a tool invocation as observed by the adapter. */
export const toolStatusSchema = z.enum([
  'pending',
  'running',
  'success',
  'failed',
  'pending_approval',
  'denied',
])
export type ToolStatus = z.infer<typeof toolStatusSchema>

/** Token usage reported by the executor for a run. */
export const tokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
})
export type TokenUsage = z.infer<typeof tokenUsageSchema>

export const engineSessionBindingSchema = z.record(z.unknown())
export type EngineSessionBinding = z.infer<typeof engineSessionBindingSchema>

/** Reason a run finished. */
export const agentFinishReasonSchema = z.enum(['stop', 'tool', 'length', 'error', 'cancelled'])
export type AgentFinishReason = z.infer<typeof agentFinishReasonSchema>

/** Single event emitted by a streaming executor run. */
export const agentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('assistant_message_delta'), delta: z.string() }),
  z.object({ type: z.literal('thinking_delta'), delta: z.string() }),
  z.object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    arguments: z.record(z.unknown()),
    action: toolActionSchema,
    status: toolStatusSchema.optional(),
  }),
  z.object({
    type: z.literal('tool_result'),
    id: z.string(),
    name: z.string(),
    content: z.string(),
    isError: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('permission_request'),
    id: z.string(),
    reason: z.string(),
    toolUseId: z.string().optional(),
  }),
  z.object({
    type: z.literal('token_usage'),
    usage: tokenUsageSchema,
  }),
  z.object({
    type: z.literal('engine_binding'),
    engine: z.string().min(1),
    binding: engineSessionBindingSchema.nullable(),
  }),
  z.object({
    type: z.literal('finish'),
    reason: agentFinishReasonSchema,
    usage: tokenUsageSchema.optional(),
  }),
  z.object({
    type: z.literal('error'),
    error: z.string(),
  }),
])
export type AgentEvent = z.infer<typeof agentEventSchema>
