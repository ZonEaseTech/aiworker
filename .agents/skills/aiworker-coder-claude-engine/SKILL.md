---
name: aiworker-coder-claude-engine
description: Use this skill when validating or debugging AIWorker in a remote Coder workspace with Claude Code as the worker executor engine, especially when the user wants the published npm CLI rather than source-tree debugging. Covers Coder SSH access, remote PATH normalization, published @zonease/aiworker-cli setup, claude-code executor selection, CLI continuity checks, loopback worker serve smoke tests, cleanup, and PMA bug recording.
---

# AIWorker Coder Claude Engine

Use this workflow for remote Coder validation where AIWorker runs from a
published CLI package and Claude Code is the executor engine. This skill is for
worker-only debugging unless the user explicitly expands scope to fleet or
gateway.

## Hard Boundary

- Use the published `@zonease/aiworker-cli` package, `npx`, or a user-provided
  released binary. Do not clone, build, or run AIWorker source in the Coder
  workspace unless the user explicitly changes scope.
- Do not enroll, pair, inspect, or restart fleet/gateway services unless the
  user asks for fleet validation. Use `aiworker-test-fleet` for that path.
- Treat the remote debug directory as disposable AIWorker project state, but do
  not delete it unless the user asks.
- Preserve the real remote `HOME` so Claude Code can read its existing auth.
  Isolate only AIWorker state in the supplied project directory.

## Safety Rules

- Never write first-run `AIWORKER_MASTER_KEY`, bootstrap tokens, bearer tokens,
  cookies, private URLs, or raw auth files into repo docs, skills, changelogs,
  final answers, screenshots, or persisted logs.
- Redact or omit `aiworker init` secret output in reports. It is acceptable to
  state that project-scope worker initialization succeeded.
- Prefer loopback ports for worker HTTP checks. Do not expose Worker Admin
  publicly during this workflow.
- Do not use broad process cleanup such as `kill $(lsof -ti:PORT)`. Use the
  tracked pidfile for worker processes and confirm listener cleanup with
  `lsof -tiTCP:PORT -sTCP:LISTEN`.
- Keep remote command examples free of shell-expanded local secrets. When using
  local double quotes around `coder ssh` commands, avoid remote `$PATH` or
  escape remote-only variables such as `\$!`.

## Inputs

Determine these before mutating remote state:

- Coder workspace name, for example `ben/ben`.
- Remote debug directory, for example `/home/ben/projects/debug-aiworker`.
- CLI version under test. Default to npm latest only when the user did not ask
  for a specific version.
- Soul preset. Use `developer` unless the user asks for another Soul.
- Worker HTTP port for loopback smoke checks. Pick an unused high port.

## Coder Access Check

Start with read-only checks:

```bash
coder whoami
coder list
coder show <workspace>
coder ssh --wait=no <workspace> -- pwd
coder ssh --wait=no <workspace> -- whoami
```

Expected result: the workspace is started/healthy, and `coder ssh` can run a
simple command. A Coder devcontainer or Docker warning is not automatically a
blocker if the main agent is connected and SSH works.

## Remote Tool Discovery

Coder non-interactive sessions may not load the user's zsh/npm PATH. Discover
the real tool locations instead of trusting `command -v` once.

```bash
coder ssh --wait=no <workspace> -- 'printenv PATH'
coder ssh --wait=no <workspace> -- 'find "$HOME" -maxdepth 5 \( -type f -o -type l \) -name claude -perm -111 2>/dev/null | head -20'
coder ssh --wait=no <workspace> -- 'npm root -g; npm config get prefix'
coder ssh --wait=no <workspace> -- 'node --version; npm --version'
```

If `claude` lives outside the default Coder PATH, build a deterministic remote
PATH for every command. Prefer absolute paths:

```bash
REMOTE_DIR=/home/ben/projects/debug-aiworker/release-cli-claude-code
REMOTE_BIN="$REMOTE_DIR/.npm-aiworker/node_modules/.bin"
REMOTE_PATH="/home/ben/.npm-global/bin:$REMOTE_BIN:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin"
AIW="$REMOTE_BIN/aiworker"
```

Verify Claude Code directly before blaming AIWorker:

```bash
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; env PATH=$REMOTE_PATH claude --version"
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; env PATH=$REMOTE_PATH claude -p --output-format=stream-json 'Reply with exactly AIWORKER_CLAUDE_READY.'"
```

If Claude emits user-level hook errors but the final `result` succeeds, record
the warning separately; do not treat it as an AIWorker executor failure.

## Published CLI Setup

Install the published CLI into the remote debug project, not globally:

```bash
coder ssh --wait=no <workspace> -- "mkdir -p $REMOTE_DIR"
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; npm view @zonease/aiworker-cli version bin --json"
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; npm install --prefix .npm-aiworker @zonease/aiworker-cli@<version>"
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; env PATH=$REMOTE_PATH $AIW --version"
```

Use the resolved `$AIW` path for all later commands. This avoids accidentally
testing a global CLI or local source-tree command.

## Worker Bootstrap

Initialize project-scope state and choose Claude Code:

```bash
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; env PATH=$REMOTE_PATH $AIW init --soul developer"
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; env PATH=$REMOTE_PATH $AIW scope"
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; env PATH=$REMOTE_PATH $AIW doctor"
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; env PATH=$REMOTE_PATH $AIW executor select --engine claude-code --apply"
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; env PATH=$REMOTE_PATH $AIW executor doctor --engine claude-code"
```

Expected result:

- `scope` reports project scope rooted at `$REMOTE_DIR`.
- `doctor` reports `PASS`.
- `executor select` stores `claude-code/default`.
- `executor doctor --engine claude-code` passes configured executor and binary
  readiness. Empty executor-native capability or MCP declarations can be `WARN`
  during a plain engine smoke test.

## CLI Run Checks

Run one direct smoke first:

```bash
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; env PATH=$REMOTE_PATH $AIW run --chat-id release-cli-claude-code-smoke --timeout-ms 180000 --message 'Reply with exactly AIWORKER_WORKER_CLAUDE_OK.'"
```

Then check continuity with a non-secret marker:

```bash
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; env PATH=$REMOTE_PATH $AIW run --chat-id release-cli-claude-code-continuity --timeout-ms 180000 --message 'Remember this marker exactly: AIWORKER_MARKER_<date>_01. Reply with OK only.'"
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; env PATH=$REMOTE_PATH $AIW run --chat-id release-cli-claude-code-continuity --timeout-ms 180000 --message 'Reply with only the marker I asked you to remember.'"
```

Inspect sessions. `sessions show` expects a session key, not the bare chat id:

```bash
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; env PATH=$REMOTE_PATH $AIW sessions list"
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; env PATH=$REMOTE_PATH $AIW sessions show 'web:sys%3Acli:release-cli-claude-code-continuity'"
```

Expected result: the second turn recalls the marker, and session metadata shows
a redacted `claude-code` engine binding.

Known issue to watch: if `orchestrator.text.payload.delta` first emits partial
deltas and then emits the complete final text as another `delta`, record or
update `BUG-052`. Do not treat this duplicate render risk as a failed engine
run when the final answer and session continuity are otherwise correct.

## Worker HTTP Smoke

Start the worker only on loopback. Prefer `tmux` if available; otherwise use
`setsid` with explicit pidfile/logfile:

```bash
PORT=19217
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; rm -f worker-$PORT.pid worker-$PORT.log; setsid env PATH=$REMOTE_PATH $AIW serve --host 127.0.0.1 --port $PORT --no-open > worker-$PORT.log 2>&1 < /dev/null & echo \$! > worker-$PORT.pid; sleep 1; cat worker-$PORT.pid"
```

Validate:

```bash
coder ssh --wait=no <workspace> -- "lsof -iTCP:$PORT -sTCP:LISTEN -n -P"
coder ssh --wait=no <workspace> -- "curl -fsS http://127.0.0.1:$PORT/health"
coder ssh --wait=no <workspace> -- "curl -fsSI http://127.0.0.1:$PORT/admin/"
coder ssh --wait=no <workspace> -- "curl -sS -o /tmp/aiworker-info-$PORT.out -w '%{http_code}\n' http://127.0.0.1:$PORT/api/worker/info"
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; sed -n '1,160p' worker-$PORT.log"
```

Expected result:

- `/health` reports `mode=worker`, status `ok`, and executor `claude-code`.
- `/admin/` returns 200.
- unauthenticated `/api/worker/info` returns 401 unless the current auth policy
  intentionally changed.

Cleanup:

```bash
coder ssh --wait=no <workspace> -- "cd $REMOTE_DIR; pid=\$(cat worker-$PORT.pid); kill \"\$pid\"; sleep 1; rm -f worker-$PORT.pid; lsof -tiTCP:$PORT -sTCP:LISTEN || true"
```

If the final `lsof` output is empty, the loopback port is released.

## PMA Bug Recording

When the remote validation finds a confirmed product issue, record it through
PMA instead of fixing source code unless the user asks for implementation.

1. Search `docs/task/index.md` and existing task files for duplicates.
2. Create the next `BUG-NNN.md`, `QA-NNN.md`, or `TODO-NNN.md` with sanitized
   observed behavior, expected behavior, reproduction, acceptance criteria,
   dependencies, and notes.
3. Append the task index entry.
4. Add a concise `docs/changelog.md` entry.
5. Run `git diff --check` on changed docs.

Never include generated master keys, bootstrap tokens, bearer tokens, private
auth paths with values, or long raw logs in PMA files.

## Final Report

Summarize:

- Coder workspace and remote project path;
- published CLI version and exact CLI path;
- Claude Code binary path and version;
- init/doctor/executor selection result;
- direct `aiworker run` and continuity result;
- HTTP/Admin smoke result and cleanup status;
- PMA bug files created or updated;
- warnings that remain, with sensitive values omitted.
