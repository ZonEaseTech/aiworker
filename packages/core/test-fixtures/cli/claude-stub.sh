#!/usr/bin/env bash
# Stub Claude Code CLI used by FEAT-012 tests. Emits a fixed stream-json
# transcript regardless of stdin so the tests don't need a real license.
# The transcript covers every AgentEvent variant our normalizer cares about:
# partial text delta, assistant text, assistant tool_use, user tool_result,
# and a result line.
#
# The stub also echoes stdin back to stderr so tests that want to assert the
# host-side stream-json input can read it.

set -euo pipefail

# Drain stdin into stderr in the background so the test parent doesn't block
# the CLI on pipe back-pressure.
cat >/dev/null &
drain_pid=$!

trap 'kill "$drain_pid" 2>/dev/null || true' EXIT

cat <<'EOF'
{"type":"system","subtype":"init","session_id":"sess_stub","tools":["Read","Write","Bash"]}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Checking files"}}}
{"type":"assistant","session_id":"sess_stub","message":{"id":"msg_1","type":"message","role":"assistant","content":[{"type":"text","text":"Checking files"},{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"/tmp/note.txt"}}],"usage":{"input_tokens":4,"output_tokens":3}}}
{"type":"user","session_id":"sess_stub","message":{"id":"msg_2","type":"message","role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"ok"}]}}
{"type":"assistant","session_id":"sess_stub","message":{"id":"msg_3","type":"message","role":"assistant","content":[{"type":"text","text":"Done."}]}}
{"type":"result","subtype":"success","session_id":"sess_stub","is_error":false,"result":"Done.","usage":{"input_tokens":8,"output_tokens":6},"total_cost_usd":0.0012,"duration_ms":120}
EOF
