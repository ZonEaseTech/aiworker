import type { ApprovalDecision, ApprovalPolicy } from './protocol'
import type { ClaudeControlRequest } from './types'

import { describe, expect, it } from 'bun:test'

import { autoApprovePolicy, ControlProtocolPeer } from './protocol'

function captureWriter(): { writeLine: (s: string) => void, lines: string[] } {
  const lines: string[] = []
  return { writeLine: (s: string) => lines.push(s), lines }
}

describe('ControlProtocolPeer', () => {
  const preToolUseRequest: ClaudeControlRequest = {
    type: 'control_request',
    request_id: 'req_1',
    request: {
      subtype: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    },
  }

  it('auto-approves PreToolUse under the default policy', async () => {
    const writer = captureWriter()
    const peer = new ControlProtocolPeer({ writeLine: writer.writeLine })

    const events = await peer.handleLine(preToolUseRequest)
    expect(events).toEqual([])
    expect(writer.lines).toHaveLength(1)
    const payload = JSON.parse(writer.lines[0]!)
    expect(payload.type).toBe('control_response')
    expect(payload.response.request_id).toBe('req_1')
    expect(payload.response.subtype).toBe('success')
    expect(payload.response.response.hookSpecificOutput.permissionDecision).toBe('allow')
  })

  it('returns error subtype when policy denies', async () => {
    const writer = captureWriter()
    const denyingPolicy: ApprovalPolicy = {
      decide: async () => ({ decision: 'deny', reason: 'blocked by policy' }) as ApprovalDecision,
    }
    const peer = new ControlProtocolPeer({ writeLine: writer.writeLine, policy: denyingPolicy })
    await peer.handleLine(preToolUseRequest)
    const payload = JSON.parse(writer.lines[0]!)
    expect(payload.response.subtype).toBe('error')
    expect(payload.response.error).toBe('blocked by policy')
  })

  it('emits permission_request AgentEvent when policy asks', async () => {
    const writer = captureWriter()
    const askingPolicy: ApprovalPolicy = {
      decide: async () => ({ decision: 'ask', reason: 'needs review' }) as ApprovalDecision,
    }
    const peer = new ControlProtocolPeer({ writeLine: writer.writeLine, policy: askingPolicy })
    const events = await peer.handleLine(preToolUseRequest)
    expect(events).toHaveLength(1)
    const ev = events[0]!
    expect(ev.type).toBe('permission_request')
    if (ev.type === 'permission_request') {
      expect(ev.id).toBe('req_1')
      expect(ev.reason).toBe('needs review')
    }
  })

  it('is a no-op on non-control_request lines', async () => {
    const writer = captureWriter()
    const peer = new ControlProtocolPeer({ writeLine: writer.writeLine })
    const events = await peer.handleLine({ type: 'assistant', message: {} })
    expect(events).toEqual([])
    expect(writer.lines).toHaveLength(0)
  })

  it('sendUserMessage writes a stream-json user envelope', () => {
    const writer = captureWriter()
    const peer = new ControlProtocolPeer({ writeLine: writer.writeLine })
    peer.sendUserMessage('hello')
    expect(writer.lines).toHaveLength(1)
    const parsed = JSON.parse(writer.lines[0]!)
    expect(parsed).toEqual({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      },
    })
  })

  it('autoApprovePolicy is the shipped default', async () => {
    const decision = await autoApprovePolicy.decide(preToolUseRequest)
    expect(decision.decision).toBe('allow')
  })
})
