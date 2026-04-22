#!/usr/bin/env bash
# Stub cursor-agent used by FEAT-016 tests. Emits a fixed stream-json
# transcript regardless of stdin so tests don't need a real Cursor license.
# The transcript covers every AgentEvent variant the normalizer cares about:
# - system line (session id capture)
# - assistant_message with delta
# - tool_use (read_file + edit_file)
# - tool_result paired with each tool_use id
# - token_usage
# - stop (finish:stop)

set -euo pipefail

# Drain stdin into /dev/null in the background so the parent doesn't wedge
# on stdin backpressure (cursor-agent reads the prompt from stdin).
cat >/dev/null &
drain_pid=$!

trap 'kill "$drain_pid" 2>/dev/null || true' EXIT

cat <<'EOF'
{"type":"system","subtype":"init","session_id":"sess_stub","model":"auto"}
{"type":"assistant_message","delta":"Checking the note file "}
{"type":"tool_use","id":"call_read","name":"read_file","input":{"path":"/tmp/note.txt"},"status":"completed"}
{"type":"tool_result","id":"call_read","content":"hi"}
{"type":"assistant_message","delta":"and editing it."}
{"type":"tool_use","id":"call_edit","name":"edit_file","input":{"path":"/tmp/note.txt","old_string":"hi","new_string":"hello"},"status":"completed"}
{"type":"tool_result","id":"call_edit","content":"ok"}
{"type":"token_usage","usage":{"input_tokens":11,"output_tokens":7}}
{"type":"stop","reason":"stop","session_id":"sess_stub","usage":{"input_tokens":11,"output_tokens":7}}
EOF
