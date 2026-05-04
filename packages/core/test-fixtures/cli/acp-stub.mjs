#!/usr/bin/env node
// Stub ACP CLI used by FEAT-013 tests. Reads JSON-RPC requests on stdin,
// responds to `initialize` / `session/new`, and on `session/prompt` emits
// a deterministic `session/update` notification sequence before returning
// `stopReason: 'end_turn'`. Covers every shape the normalizer cares about:
// - agent_message_chunk (text)
// - agent_thinking_chunk
// - tool_call (kind=edit) with rawInput
// - tool_call_update (status=completed, diff content)
// - tool_call (kind=execute) with terminal status in one shot
// - plan
// The transcript is identical for both gemini + qwen so the two adapters
// share one fixture, discriminating purely via argv inspection if needed.

import { appendFileSync } from 'node:fs'
import process from 'node:process'
import readline from 'node:readline'

const argv = process.argv.slice(2)
const wantsAcp = argv.includes('--acp') || argv.includes('--experimental-acp')
const promptTraceFile = process.env.ACP_PROMPT_TRACE_FILE

function tracePrompt(params) {
  if (!promptTraceFile)
    return
  try {
    appendFileSync(promptTraceFile, `${JSON.stringify({ method: 'session/prompt', params })}\n`)
  }
  catch {
    // best-effort tracing — never break the stub on a write failure.
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
})

function write(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}

function emitNotification(method, params) {
  write({ jsonrpc: '2.0', method, params })
}

function emitSessionUpdate(sessionId, update) {
  emitNotification('session/update', { sessionId, update })
}

async function runPromptTurn(sessionId, id) {
  emitSessionUpdate(sessionId, {
    sessionUpdate: 'agent_thinking_chunk',
    content: { type: 'text', text: 'Considering approach...' },
  })
  emitSessionUpdate(sessionId, {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: 'Editing note.txt ' },
  })
  emitSessionUpdate(sessionId, {
    sessionUpdate: 'tool_call',
    toolCallId: 'call_edit',
    title: 'Edit note.txt',
    kind: 'edit',
    status: 'in_progress',
    rawInput: { path: '/tmp/note.txt', oldText: 'hi', newText: 'hello' },
  })
  emitSessionUpdate(sessionId, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'call_edit',
    status: 'completed',
    content: [
      {
        type: 'diff',
        path: '/tmp/note.txt',
        oldText: 'hi',
        newText: 'hello',
      },
    ],
  })
  emitSessionUpdate(sessionId, {
    sessionUpdate: 'tool_call',
    toolCallId: 'call_exec',
    title: 'Run tests',
    kind: 'execute',
    status: 'completed',
    rawInput: { command: 'bun test' },
    content: [
      { type: 'content', content: { type: 'text', text: 'ok' } },
    ],
  })
  emitSessionUpdate(sessionId, {
    sessionUpdate: 'plan',
    entries: [
      { content: 'Update note.txt', priority: 'high', status: 'completed' },
      { content: 'Run tests', priority: 'medium', status: 'pending' },
    ],
  })
  emitSessionUpdate(sessionId, {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: 'Done.' },
  })
  write({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } })
}

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (trimmed.length === 0)
    return
  let msg
  try {
    msg = JSON.parse(trimmed)
  }
  catch {
    return
  }
  if (!wantsAcp) {
    // Sanity check so tests can assert the harness actually requested ACP mode.
    process.stderr.write(`missing --acp flag: argv=${JSON.stringify(argv)}\n`)
  }
  if (msg.method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: false,
          promptCapabilities: { image: false, audio: false, embeddedContext: false },
        },
        agentInfo: { name: 'acp-stub', title: 'Stub Agent', version: '0.0.1' },
        authMethods: [],
      },
    })
    return
  }
  if (msg.method === 'session/new') {
    write({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 'sess_stub' } })
    return
  }
  if (msg.method === 'session/prompt') {
    tracePrompt(msg.params)
    const sessionId = msg.params?.sessionId ?? 'sess_stub'
    void runPromptTurn(sessionId, msg.id)
    return
  }
  if (msg.method === 'session/cancel') {
    // Notifications don't need a response.
  }
})

rl.on('close', () => {
  process.exit(0)
})
