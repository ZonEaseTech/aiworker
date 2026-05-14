# PLAN-228 Structured local engine adapters

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 22:05
- **approvedAt**: 2026-05-10 22:05
- **relatedTask**: REFACTOR-054

## Current State

- `packages/core/src/worker/executor.ts` only wires `engineId === "codex"`.
- Codex is invoked as `codex exec ... --output-last-message ... -` without
  `--json`, so stdout/stderr are the only live stream.
- The runtime emits one synthetic Bash tool event around the entire engine
  process, which hides real engine tool activity.
- Open Design invokes Codex with `--json`, parses JSONL into typed events, and
  uses stdin prompt delivery. OD also has concrete non-interactive invocation
  shapes for Claude Code, Cursor Agent, Gemini CLI, Qwen Code, and related
  engines.

## Proposal

1. Add a local engine definition layer inside core for the AIWorker surfaced
   engines.
2. Use OD's correct argument shapes:
   - Codex: `exec --json --skip-git-repo-check --sandbox workspace-write -c
     sandbox_workspace_write.network_access=true -C <workspace>`.
   - Claude Code: `-p --output-format stream-json --verbose
     --include-partial-messages --permission-mode bypassPermissions` when
     supported.
   - Cursor Agent: `--print --output-format stream-json
     --stream-partial-output --force --trust --workspace <workspace>`.
   - Gemini CLI: `--output-format stream-json --yolo` with
     `GEMINI_CLI_TRUST_WORKSPACE=true`.
   - Qwen Code: `--yolo -` as plain output.
3. Port OD's structured parsers for Codex, Claude Code, Cursor, Gemini, and raw
   text fallback into AIWorker `LocalExecutorEvent`.
4. Store raw stdout/stderr logs under the invocation root, but only emit
   stderr to the session timeline on failures.

## Verification Plan

- Unit tests for Codex JSONL parsing, Claude stream parsing, raw text fallback,
  and artifact discovery behavior.
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`

## Progress

- 2026-05-10 22:05: Investigation completed. Implementation started with
  operator approval from the current session.
- 2026-05-10 22:31: Implemented surfaced local engine definitions for Codex,
  Claude Code, Cursor Agent, Gemini CLI, OpenCode, and Qwen Code. Codex,
  Claude, Cursor, Gemini, and OpenCode use structured parsers; Qwen uses the
  plain stream fallback.
- 2026-05-10 22:31: Verified `@zonease/aiworker-core` test/typecheck and root
  typecheck/lint/test/build.
