#!/usr/bin/env node
// Stub Codex app-server used by FEAT-016 tests. Reads JSON-RPC requests on
// stdin, responds to either the legacy `thread_start/newTurn` protocol or the
// current `thread/start/turn/start` protocol, and emits a deterministic
// notification sequence. The transcript covers every shape the normalizer
// cares about:
// - codex/event/thinking (delta)
// - codex/event/assistant_message (delta)
// - codex/event/tool_call (read + apply_patch)
// - codex/event/tool_result (paired with the tool_call ids)
// - codex/event/token_usage
// - codex/event/stop

import fs from 'node:fs'
import process from 'node:process'
import readline from 'node:readline'

const argv = process.argv.slice(2)
const wantsAppServer = argv.includes('app-server')
const protocol = process.env.CODEX_STUB_PROTOCOL ?? 'legacy'
const traceFile = process.env.CODEX_STUB_TRACE_FILE
const failResume = process.env.CODEX_STUB_FAIL_RESUME === '1'
const transientReconnect = process.env.CODEX_STUB_TRANSIENT_RECONNECT === '1'

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
})

function write(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}

function trace(msg) {
  if (!traceFile)
    return
  fs.appendFileSync(traceFile, `${JSON.stringify(msg)}\n`)
}

function emitNotification(method, params) {
  write({ jsonrpc: '2.0', method, params })
}

function runTurn(turnId, threadId) {
  emitNotification('codex/event/thinking', { delta: 'Planning the edit...' })
  emitNotification('codex/event/assistant_message', { delta: 'Reading the file ' })
  emitNotification('codex/event/tool_call', {
    id: 'call_read',
    name: 'read',
    arguments: { path: '/tmp/note.txt' },
    status: 'in_progress',
  })
  emitNotification('codex/event/tool_result', {
    id: 'call_read',
    content: 'hi',
  })
  emitNotification('codex/event/assistant_message', { delta: 'and applying the patch.' })
  emitNotification('codex/event/tool_call', {
    id: 'call_patch',
    name: 'apply_patch',
    arguments: { path: '/tmp/note.txt', old_string: 'hi', new_string: 'hello' },
    status: 'completed',
  })
  emitNotification('codex/event/tool_result', {
    id: 'call_patch',
    content: 'patch applied',
  })
  emitNotification('codex/event/token_usage', {
    usage: { input_tokens: 12, output_tokens: 9 },
  })
  emitNotification('codex/event/stop', {
    reason: 'stop',
    usage: { input_tokens: 12, output_tokens: 9 },
  })
  write({ jsonrpc: '2.0', id: turnId, result: { stopReason: 'stop', threadId } })
}

function runCurrentTurn(threadId) {
  if (transientReconnect) {
    emitNotification('error', {
      error: { message: 'Reconnecting... 2/5' },
    })
  }
  emitNotification('item/reasoning/textDelta', {
    threadId,
    turnId: 'turn_stub',
    itemId: 'reason_stub',
    delta: 'Planning the edit...',
  })
  emitNotification('item/agentMessage/delta', {
    threadId,
    turnId: 'turn_stub',
    itemId: 'msg_stub',
    delta: 'OK',
  })
  emitNotification('thread/tokenUsage/updated', {
    threadId,
    turnId: 'turn_stub',
    tokenUsage: {
      total: { inputTokens: 12, outputTokens: 9 },
    },
  })
  emitNotification('turn/completed', {
    threadId,
    turn: {
      id: 'turn_stub',
      status: 'completed',
    },
  })
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
  if (!wantsAppServer) {
    // Tests can assert the executor actually requested app-server mode.
    process.stderr.write(`missing app-server subcommand: argv=${JSON.stringify(argv)}\n`)
  }
  trace(msg)
  if (msg.method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: 1,
        agentInfo: { name: 'codex-stub', version: '0.0.1' },
      },
    })
    return
  }
  if (protocol === 'current' && msg.method === 'thread_start') {
    write({
      jsonrpc: '2.0',
      id: msg.id,
      error: {
        code: -32600,
        message: 'Invalid request: unknown variant thread_start',
      },
    })
    return
  }
  if (msg.method === 'thread_start' || msg.method === 'thread_fork') {
    write({ jsonrpc: '2.0', id: msg.id, result: { threadId: 'thr_stub' } })
    return
  }
  if (msg.method === 'thread/start') {
    write({ jsonrpc: '2.0', id: msg.id, result: { thread: { id: 'thr_stub', path: '/tmp/codex-thread.jsonl' } } })
    return
  }
  if (msg.method === 'thread/resume') {
    if (failResume) {
      write({
        jsonrpc: '2.0',
        id: msg.id,
        error: {
          code: -32000,
          message: 'thread not found',
        },
      })
      return
    }
    write({
      jsonrpc: '2.0',
      id: msg.id,
      result: { thread: { id: msg.params?.threadId ?? 'thr_stub', path: '/tmp/codex-thread.jsonl' } },
    })
    return
  }
  if (msg.method === 'newTurn') {
    const threadId = msg.params?.threadId ?? 'thr_stub'
    void runTurn(msg.id, threadId)
  }
  if (msg.method === 'turn/start') {
    const threadId = msg.params?.threadId ?? 'thr_stub'
    write({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        turn: { id: 'turn_stub', status: 'inProgress' },
      },
    })
    void runCurrentTurn(threadId)
  }
})

rl.on('close', () => {
  process.exit(0)
})
