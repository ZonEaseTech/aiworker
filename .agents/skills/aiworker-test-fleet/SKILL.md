---
name: aiworker-test-fleet
description: Run AIWorker release validation and fleet end-to-end tests. Use when the user asks to test an AIWorker version, validate the test-server fleet, start a local worker against that fleet, verify Codex-backed worker session continuity/reset/status behavior, smoke the Fleet Web UI, or record bugs found during those checks.
---

# AIWorker Test Fleet

Use this workflow to validate an AIWorker release against the shared test fleet
without retyping the long operator prompt.

## Safety Rules

- Do not write secrets into repo files, skill files, final answers, plans,
  changelogs, or bug reports.
- Redact or summarize any `aissh`, env, config, token, master key, device token,
  bearer token, basic-auth, cookie, or private URL output before showing it.
- Use placeholders such as `<server-id>`, `<gateway-url>`, `<admin-url>`,
  `<worker-id>`, and `<conversation-id>` in docs.
- Do not hardcode test-server identifiers, hostnames, credentials, or token
  values in commands saved to docs.
- Treat the remote test server as the fleet. Do not stop the shared fleet unless
  the user explicitly asks. Temporary local workers must be cleaned up.
- Prefer isolated temporary local state for operator and worker commands. Remove
  temp state when it contains credentials or registration material.
- If named MCP tools such as Context7, Exa, Serena, or code-review-graph are not
  available, continue with local repo and shell inspection and state that briefly.

## Inputs

Determine these before mutating remote systems:

- Target AIWorker version, from the user or the package metadata.
- Test server, discovered through available `aissh` server inventory or a
  user-provided reference. Never persist the raw identifier in repo docs unless
  the user explicitly wants it.
- Whether remote upgrade/restart is in scope. If unclear, only inspect health.
- Session focus: default path, explicit `--conversation-id`, `/new` or `/reset`,
  session list/show, and engine-native binding behavior.

## Local Quality Gates

Start from the repo root and preserve unrelated dirty work.

1. Inspect current state:

   ```bash
   git status --short
   ```

2. Run the root gates, with Bun on PATH when needed:

   ```bash
   PATH="$HOME/.bun/bin:$PATH" bun run --filter '*' test
   PATH="$HOME/.bun/bin:$PATH" bun run typecheck
   PATH="$HOME/.bun/bin:$PATH" bun run lint
   PATH="$HOME/.bun/bin:$PATH" bun run build
   ```

3. Run CLI smoke scripts when present in package scripts:

   ```bash
   PATH="$HOME/.bun/bin:$PATH" bun run smoke:aiworker-run
   PATH="$HOME/.bun/bin:$PATH" bun run smoke:aiworker-fleet
   ```

Record command names, pass/fail status, test counts when available, and
non-sensitive warnings. Do not paste logs that include generated credentials.

## Remote Fleet Checks

Use `aissh` for remote commands. Keep `--reason` concise and non-sensitive.

1. Verify gateway service and version:
   - service active/running;
   - gateway health endpoint responds locally;
   - installed CLI/package version matches the target when upgrade is in scope.

2. If the user requested an upgrade:
   - follow the current install method discovered on the server;
   - preserve existing env/config files;
   - restart only the gateway service needed for the test;
   - re-check service status, health, and version.

3. If Web UI is in scope:
   - direct gateway `/admin/` should return HTML;
   - direct gateway `/admin/assets/*.css` and `*.js` should return 200 with
     expected content types;
   - public ingress should return 401/403 before auth if protected, then 200
     after auth;
   - inspect CSS bundle content for representative Tailwind selectors such as
     `.flex`, `.bg-background`, `.rounded-md`, and `.p-6` when styling appears
     broken.

## Local Worker E2E

Use the local machine for the worker and configure the executor as Codex. The
user has already authorized Codex token usage when they say so; do not conserve
tokens at the cost of coverage.

1. Create isolated local state:
   - temporary operator home if needed;
   - temporary worker home/data root;
   - temporary log path and PID tracking outside the repo when possible.

2. Enroll or pair the local worker with the fleet using the current CLI flow.
   Discover exact flags with `aiworker --help` and current package scripts.
   Do not print enrollment tokens or approval secrets.

3. Start the local worker against the fleet:
   - executor engine: `codex`;
   - model: use the project default unless the user asks otherwise;
   - wait until the fleet reports the worker online.

4. Verify session behavior:
   - explicit conversation id turn 1 stores a unique non-secret marker;
   - same explicit conversation id turn 2 recalls the marker exactly;
   - `/new` or `/reset` rotates the worker session and forgets the old marker;
   - `sessions list` and `sessions show` expose the expected current session,
     reset reason/time, and engine binding summary.

5. When validating the default accepted-id path:
   - run first turn without `--conversation-id`;
   - capture the accepted conversation id in local scratch state only;
   - reuse it unchanged on the second turn;
   - expected result is continuity with the first marker.

6. Cleanup:
   - stop the temporary local worker process;
   - remove the temporary worker from the fleet if it registered;
   - delete temporary credential-bearing state;
   - leave the remote fleet running unless explicitly instructed otherwise.

## Bug Recording

Use PMA task files when a failure is found. Record the bug; do not fix it unless
the user asks for implementation.

1. Find the next unused `BUG-NNN` id from `docs/task/index.md`.
2. Create `docs/task/BUG-NNN.md` in English with:
   - status, priority, owner, createdAt, discoveredAt;
   - observed behavior and reproduction steps;
   - expected behavior;
   - sanitized evidence;
   - root-cause candidate if known;
   - acceptance criteria.
3. Append a task index entry and update the index timestamp.
4. Add a concise `docs/changelog.md` entry with a sanitized summary.
5. Do not include server ids, tokens, hostnames with embedded credentials,
   generated master keys, device tokens, or full raw logs.

## Final Report

Summarize:

- target version and whether the remote fleet was only inspected or upgraded;
- local quality gates run and their result;
- remote fleet health and Web UI smoke result;
- local Codex worker session results;
- cleanup performed;
- bug files created, if any.

Keep all sensitive values redacted or omitted.
