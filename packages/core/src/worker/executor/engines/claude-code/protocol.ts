import type { AgentEvent } from '@zonease/aiworker-shared'
import type {
  ClaudeControlRequest,
  ClaudeControlResponse,
  ClaudeStdoutLine,
  ClaudeUserInput,
} from './types'

/**
 * Peer for the Claude Code stdio control protocol (`--input-format=stream-json`
 * bidirectional mode). Claude Code emits regular stream-json events plus
 * occasional `control_request` envelopes asking the host for a hook decision
 * (PreToolUse / Stop / tool_approval); the host replies with a matching
 * `control_response` carrying `subtype: 'success' | 'error'`.
 *
 * FEAT-012 ships auto-approve only — every PreToolUse control_request is
 * answered with `{ allow: true }`. Interactive approval UI is out of scope
 * and the `permission_request` AgentEvent is reserved for future use.
 */

/** Policy a peer consults when Claude Code asks to run a tool. */
export interface ApprovalPolicy {
  decide: (request: ClaudeControlRequest) => Promise<ApprovalDecision>
}

export interface ApprovalDecision {
  /**
   * `'allow'` — auto-approve, `'deny'` — block the tool, `'ask'` — surface
   * a `permission_request` AgentEvent and block until the host answers.
   */
  decision: 'allow' | 'deny' | 'ask'
  /** Optional human-readable rationale surfaced to the user / logs. */
  reason?: string
  /** When `decision === 'allow'`, optional modified tool input. */
  updatedInput?: Record<string, unknown>
}

/** Always-allow policy used by FEAT-012. */
export const autoApprovePolicy: ApprovalPolicy = {
  decide: async (_request: ClaudeControlRequest) => ({ decision: 'allow' }),
}

export interface ControlPeerOptions {
  /** Called for every inbound control_request; defaults to auto-approve. */
  policy?: ApprovalPolicy
  /**
   * Called by the peer to push one line to the CLI's stdin. Implementations
   * must append a trailing `\n` themselves.
   */
  writeLine: (line: string) => void
}

/**
 * Stateful peer. Feed raw stream-json lines with `handleLine`; the peer
 * either emits AgentEvents (for normal content) or writes a control_response
 * back to the CLI (for control_request). `sendUserMessage` is the host's
 * one-way API for pushing a new user prompt into stdin.
 */
export class ControlProtocolPeer {
  private readonly policy: ApprovalPolicy
  private readonly writeLine: (line: string) => void

  constructor(options: ControlPeerOptions) {
    this.policy = options.policy ?? autoApprovePolicy
    this.writeLine = options.writeLine
  }

  /**
   * Inspect one parsed stdout line. If it's a control_request, dispatch the
   * approval policy and write a control_response; otherwise return an
   * optional `permission_request` AgentEvent for `ask` decisions (FEAT-012
   * never emits one — reserved path).
   */
  async handleLine(line: ClaudeStdoutLine): Promise<AgentEvent[]> {
    if (line.type !== 'control_request')
      return []
    const request = line as ClaudeControlRequest
    const decision = await this.policy.decide(request).catch((err: unknown) => ({
      decision: 'deny' as const,
      reason: `policy error: ${err instanceof Error ? err.message : String(err)}`,
    }))
    const response = buildControlResponse(request, decision)
    this.writeLine(`${JSON.stringify(response)}\n`)

    if (decision.decision === 'ask') {
      const toolUseId = extractToolUseId(request)
      return [{
        type: 'permission_request',
        id: request.request_id,
        reason: decision.reason ?? 'Claude Code requested approval',
        ...(toolUseId ? { toolUseId } : {}),
      }]
    }
    return []
  }

  /** Encode and push one user turn as an NDJSON line on the CLI's stdin. */
  sendUserMessage(text: string): void {
    const envelope: ClaudeUserInput = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text }],
      },
    }
    this.writeLine(`${JSON.stringify(envelope)}\n`)
  }
}

function buildControlResponse(
  request: ClaudeControlRequest,
  decision: ApprovalDecision,
): ClaudeControlResponse {
  if (decision.decision === 'deny') {
    return {
      type: 'control_response',
      response: {
        request_id: request.request_id,
        subtype: 'error',
        error: decision.reason ?? 'denied by host policy',
      },
    }
  }
  const hookSpecificOutput: Record<string, unknown> = {
    permissionDecision: decision.decision,
  }
  if (decision.updatedInput)
    hookSpecificOutput.updatedInput = decision.updatedInput
  return {
    type: 'control_response',
    response: {
      request_id: request.request_id,
      subtype: 'success',
      response: {
        hookSpecificOutput,
        ...(decision.reason ? { systemMessage: decision.reason } : {}),
      },
    },
  }
}

function extractToolUseId(request: ClaudeControlRequest): string | undefined {
  const raw = request.request as { tool_use_id?: unknown, toolUseId?: unknown }
  if (typeof raw.tool_use_id === 'string')
    return raw.tool_use_id
  if (typeof raw.toolUseId === 'string')
    return raw.toolUseId
  return undefined
}
