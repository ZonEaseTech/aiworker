# TODO-014 Engine child env allowlist drops `AIWORKER_*`/`DEBUG_*` env, breaking debug shim

- **status**: pending
- **priority**: P3
- **owner**: unassigned
- **createdAt**: 2026-05-04 22:10
- **discoveredAt**: 2026-05-04 21:30
- **plan**: TBD
- **relatesTo**: aiworker-release-debug skill workflow

## Observed Behavior

The published 0.7.0 bundle (`aiworker-bun.js`) sandboxes the executor child process env via:

```js
Cr = new Set(["PATH","HOME","USER","LOGNAME","SHELL","PWD","LANG","TZ","TERM","TMPDIR","TMP","TEMP"])
Mr = ["LC_","NODE_","NPM_CONFIG_","XDG_","CLAUDE_","CODEX_","CURSOR_","GEMINI_","QWEN_"]
function Oj(D, $, F) { /* keep only entries in $ set or starting with prefix in F */ }
```

`DEBUG_ROOT` and any other `AIWORKER_*` env not in `Mr` prefix list never reach the spawned claude / codex / cursor process.

The `aiworker-release-debug` skill's fake-claude shim relies on `DEBUG_ROOT` to write its dump to the per-campaign `dump/` dir. Since the env never reaches the child, the shim falls back to `/tmp/dump`, hiding all evidence in a shared global location and silently breaking the debug workflow.

Discovered via `strace -f -e trace=execve` on the spawned shim — env trace showed PATH but no `DEBUG_ROOT`.

## Why this matters

- The release-debug skill is the canonical way to validate AIWorker against published binaries; if its evidence collection silently drops, regressions in brain injection / executor adapter / etc. cannot be observed
- Other operator scripts that pass debug env (`AIWORKER_DEBUG_*`, `AIWORKER_TRACE_*`) face the same wall
- The fix is one-line: extend `Mr` (env prefix allowlist) with `AIWORKER_`

## Expected Behavior

A. Extend `Mr` allowlist to include `AIWORKER_` prefix:

```js
Mr = ["LC_","NODE_","NPM_CONFIG_","XDG_","CLAUDE_","CODEX_","CURSOR_","GEMINI_","QWEN_","AIWORKER_"]
```

This lets debug workflows pass `AIWORKER_DEBUG_DUMP_DIR=/path/to/dump` and the shim can pick it up without other AIWorker invariants leaking to engine.

B. Update aiworker-release-debug skill's `templates/claude-shim.sh` either:
   - Default to `AIWORKER_DEBUG_DUMP_DIR` (which the new allowlist permits), or
   - Hard-code the dump path (which the current skill recipes already do as a fallback workaround) and document the env requirement

## Reproducer

```bash
DEBUG_ROOT=/tmp/aiworker-debug-test
mkdir -p $DEBUG_ROOT/dump $DEBUG_ROOT/bin
cat > $DEBUG_ROOT/bin/claude <<'SHIM'
#!/bin/bash
DUMP_DIR="${AIWORKER_DEBUG_DUMP_DIR:-${DEBUG_ROOT:-/tmp}/dump}"
echo "shim-DUMP_DIR=$DUMP_DIR" > /tmp/shim-trace
exec /home/ben/.npm-global/bin/claude "$@"
SHIM
chmod +x $DEBUG_ROOT/bin/claude

# init a project, swap executor, run
PATH="$DEBUG_ROOT/bin:$PATH" \
  AIWORKER_DEBUG_DUMP_DIR="$DEBUG_ROOT/dump" \
  DEBUG_ROOT=$DEBUG_ROOT \
  aiworker run --message "ping" --chat-id "x" --timeout-ms 30000

cat /tmp/shim-trace
# Expected: shim-DUMP_DIR=$DEBUG_ROOT/dump
# Actual:   shim-DUMP_DIR=/tmp/dump  (env was filtered by Cr/Mr)
```

## Validation

After fix, debug shim correctly receives `AIWORKER_DEBUG_DUMP_DIR` env in the spawned claude subprocess; release-debug skill's per-campaign `dump/` collects evidence as designed.

## Evidence

- `/home/ben/projects/debug-aiworker/qa-2026-05-04-v0.7.0/findings/UX-1-debug-root-env-not-passed-to-engine-child.md`
- strace evidence: `dump/` was empty until shim was patched to use absolute hard-coded path
