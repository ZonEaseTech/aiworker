/**
 * Wire types for the Agent Client Protocol (ACP). Engine-internal; only
 * `AgentEvent` crosses the orchestrator boundary.
 *
 * Reference: https://agentclientprotocol.com (schema + prompt-turn docs).
 * ACP is JSON-RPC 2.0 over stdio (ndjson). The host (us) drives the session
 * lifecycle — `initialize` → `session/new` → `session/prompt` → `session/cancel`
 * — and the agent streams progress via `session/update` notifications.
 */

/** Base JSON-RPC 2.0 envelope. */
export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: unknown
}

export interface JsonRpcResponseSuccess {
  jsonrpc: '2.0'
  id: number | string
  result: unknown
}

export interface JsonRpcResponseError {
  jsonrpc: '2.0'
  id: number | string
  error: { code: number, message: string, data?: unknown }
}

export type JsonRpcResponse = JsonRpcResponseSuccess | JsonRpcResponseError

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification

/** ACP stop reasons returned by `session/prompt`. */
export type AcpStopReason
  = | 'end_turn'
    | 'max_tokens'
    | 'max_turn_requests'
    | 'refusal'
    | 'cancelled'

/** ACP tool kinds — maps directly onto the ACP schema discriminator. */
export type AcpToolKind
  = | 'read'
    | 'edit'
    | 'delete'
    | 'move'
    | 'search'
    | 'execute'
    | 'think'
    | 'fetch'
    | 'other'

/** ACP tool-call lifecycle status. */
export type AcpToolCallStatus
  = | 'pending'
    | 'in_progress'
    | 'completed'
    | 'failed'
    | 'cancelled'

/** A single content block inside a prompt or agent message. */
export type AcpContentBlock
  = | { type: 'text', text: string }
    | { type: 'image', mimeType: string, data: string }
    | { type: 'resource', resource: { uri: string, mimeType?: string, text?: string } }
    | { type: 'resource_link', uri: string, mimeType?: string, name?: string }
    | { type: string, [key: string]: unknown }

/** Content attached to a tool_call / tool_call_update update payload. */
export type AcpToolCallContent
  = | { type: 'content', content: AcpContentBlock }
    | { type: 'diff', path: string, oldText?: string | null, newText: string }
    | { type: 'terminal', terminalId: string }
    | { type: string, [key: string]: unknown }

export interface AcpPlanEntry {
  content: string
  priority?: 'high' | 'medium' | 'low' | string
  status?: 'pending' | 'in_progress' | 'completed' | string
}

/**
 * Discriminated union of the `session/update` shapes we explicitly normalize.
 * `AcpSessionUpdate` widens this with an "unknown kind" escape hatch so
 * unexpected agent features don't crash the pipeline.
 */
export type AcpKnownSessionUpdate
  = | { sessionUpdate: 'agent_message_chunk', content: AcpContentBlock }
    | { sessionUpdate: 'agent_thinking_chunk', content: AcpContentBlock }
    | { sessionUpdate: 'user_message_chunk', content: AcpContentBlock }
    | {
      sessionUpdate: 'tool_call'
      toolCallId: string
      title?: string
      kind?: AcpToolKind
      status?: AcpToolCallStatus
      content?: AcpToolCallContent[]
      locations?: Array<{ path: string, line?: number }>
      rawInput?: Record<string, unknown>
    }
    | {
      sessionUpdate: 'tool_call_update'
      toolCallId: string
      title?: string
      kind?: AcpToolKind
      status?: AcpToolCallStatus
      content?: AcpToolCallContent[]
      rawInput?: Record<string, unknown>
    }
    | { sessionUpdate: 'plan', entries: AcpPlanEntry[] }
    | { sessionUpdate: 'available_commands_update', availableCommands: Array<{ name: string, description?: string }> }
    | { sessionUpdate: 'current_mode_update', currentModeId: string }

/** Any `session/update` body, including forward-compatible unknown kinds. */
export type AcpSessionUpdate
  = | AcpKnownSessionUpdate
    | { sessionUpdate: string, [key: string]: unknown }

/** Envelope of a `session/update` notification as emitted on the wire. */
export interface AcpSessionUpdateParams {
  sessionId: string
  update: AcpSessionUpdate
}

/** Params of the host-initiated `session/prompt` request. */
export interface AcpPromptParams {
  sessionId: string
  prompt: AcpContentBlock[]
}

/** Result of `session/prompt` (resolves when the turn ends). */
export interface AcpPromptResult {
  stopReason: AcpStopReason
}

/** Result of `initialize`. */
export interface AcpInitializeResult {
  protocolVersion: number
  agentCapabilities?: Record<string, unknown>
  agentInfo?: { name?: string, title?: string, version?: string }
  authMethods?: unknown[]
}

/** Result of `session/new`. */
export interface AcpNewSessionResult {
  sessionId: string
}
