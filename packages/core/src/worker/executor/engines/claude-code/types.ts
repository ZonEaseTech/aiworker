/**
 * Wire types emitted by `claude -p --output-format=stream-json`. These are
 * engine-internal; only `AgentEvent` crosses the orchestrator boundary.
 *
 * Reference: https://takopi.dev/reference/runners/claude/stream-json-cheatsheet/
 * and https://code.claude.com/docs/en/agent-sdk hooks/streaming documentation.
 */

export interface ClaudeTextBlock {
  type: 'text'
  text: string
}

export interface ClaudeThinkingBlock {
  type: 'thinking'
  text?: string
  thinking?: string
}

export interface ClaudeToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input?: Record<string, unknown>
}

export interface ClaudeToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | Array<{ type: 'text', text: string } | Record<string, unknown>>
  is_error?: boolean
}

export type ClaudeContentBlock
  = | ClaudeTextBlock
    | ClaudeThinkingBlock
    | ClaudeToolUseBlock
    | ClaudeToolResultBlock
    | { type: string, [key: string]: unknown }

export interface ClaudeMessageEnvelope {
  id?: string
  type?: 'message'
  role?: 'assistant' | 'user'
  model?: string
  content?: ClaudeContentBlock[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
}

export interface ClaudeSystemInit {
  type: 'system'
  subtype: 'init'
  session_id?: string
  tools?: string[]
  model?: string
}

export interface ClaudeAssistantLine {
  type: 'assistant'
  session_id?: string
  parent_tool_use_id?: string
  message: ClaudeMessageEnvelope
}

export interface ClaudeUserLine {
  type: 'user'
  session_id?: string
  message: ClaudeMessageEnvelope
}

export interface ClaudeResultLine {
  type: 'result'
  subtype?: 'success' | 'error' | 'completion' | string
  session_id?: string
  is_error?: boolean
  result?: string
  error?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
}

export interface ClaudeStreamEventLine {
  type: 'stream_event'
  session_id?: string
  event?: {
    type?: string
    delta?: {
      type?: string
      text?: string
      thinking?: string
    }
  }
}

/** Bidirectional control request — Claude Code asks the host a question. */
export interface ClaudeControlRequest {
  type: 'control_request'
  request_id: string
  request: {
    subtype: string
    [key: string]: unknown
  }
}

/** Our response to a control request. */
export interface ClaudeControlResponse {
  type: 'control_response'
  response: {
    request_id: string
    subtype: 'success' | 'error'
    response?: Record<string, unknown>
    error?: string
  }
}

/** Inbound user-message envelope we write to the CLI's stdin. */
export interface ClaudeUserInput {
  type: 'user'
  message: {
    role: 'user'
    content: Array<{ type: 'text', text: string }>
  }
}

export type ClaudeStdoutLine
  = | ClaudeSystemInit
    | ClaudeAssistantLine
    | ClaudeUserLine
    | ClaudeResultLine
    | ClaudeStreamEventLine
    | ClaudeControlRequest
    | { type: string, [key: string]: unknown }
