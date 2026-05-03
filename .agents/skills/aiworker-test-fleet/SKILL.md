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
- When browser-testing Caddy basic auth, never put credentials in a navigated URL,
  screenshot name, console output, or final report. Prefer a local proxy that
  reads credentials from the repo-root `.env` and injects the `Authorization`
  header for Playwright.
- Use placeholders such as `<server-id>`, `<gateway-url>`, `<admin-url>`,
  `<worker-id>`, and `<conversation-id>` in docs.
- Do not hardcode test-server identifiers, hostnames, credentials, or token
  values in commands saved to docs.
- Treat the remote test server as the fleet. Do not stop the shared fleet unless
  the user explicitly asks. Temporary local workers must be cleaned up.
- Prefer isolated temporary AIWorker state for operator and worker commands.
  Remove temp state when it contains credentials or registration material.
- For Codex-backed worker tests, keep the real user `HOME` so the Codex CLI can
  load its auth and sandbox configuration. Isolate AIWorker with
  `AIWORKER_HOME`, database paths, data roots, logs, and pidfiles instead of
  changing `HOME`.
- If Playwright MCP is unavailable, fall back to curl-based ingress checks and
  state that browser/WS rendering was not exercised.

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

2. Run root gates when validating a release candidate, validating local changes,
   or when the user explicitly asks for the full test flow. If the target has
   already been released and this turn is test-server-only, it is acceptable to
   reference the just-completed release gates and run only focused smoke checks.
   Use Bun on PATH when needed:

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
   - install only from the already-published CLI package, for example
     `bun install -g @zonease/aiworker-cli@<version>` or the server's existing
     published-package install method;
   - do not clone the repo, run remote source builds, run docker compose, or
     publish artifacts from the test server;
   - preserve existing env/config files;
   - restart only the gateway service needed for the test;
   - re-check service status, health, and version.

3. If Fleet Web UI is in scope, run direct gateway checks first:
   - direct gateway `/admin/` should return HTML;
   - direct gateway `/admin/assets/*.css` and `*.js` should return 200 with
     expected content types;
   - inspect CSS bundle content for representative Tailwind selectors such as
     `.flex`, `.bg-background`, `.rounded-md`, and `.p-6` when styling appears
     broken.

4. If public Caddy ingress is in scope, prefer Playwright MCP browser checks:
   - read only the presence of repo-root `.env` credentials
     `CADDY_BASIC_AUTH_USERNAME` and `CADDY_BASIC_AUTH_PASSWORD`; do not print
     the values;
   - verify unauthenticated `/admin/` returns 401 or 403;
   - create a temporary localhost proxy that injects Basic Auth from `.env`
     instead of embedding credentials in the Playwright URL;
   - the proxy must support both normal HTTP requests and WebSocket
     `Upgrade`, otherwise the Fleet Admin can load static assets while the
     live gateway data path remains untested;
   - navigate Playwright to the localhost proxy, then verify page title
     `AIWorker · Fleet`, navigation entries Workers / Enrollments / Audit /
     Presence, and either a Workers empty state or worker list;
   - verify static resources return 200 and browser console has no errors or
     warnings;
   - put screenshots and transient browser artifacts under `tmp/playwright/`
     so they stay out of git.

## Fleet-Attached Worker E2E

This section covers the cross-boundary path where a local worker joins the
shared fleet and is driven through gateway commands. For local-only worker
setup, Worker Admin, worker REST/SSE, and `worker run` continuity checks, follow
`aiworker-test-worker`; this skill owns enrollment, fleet visibility, gateway
chat routing, and remote cleanup.

1. Create isolated local state:
   - temporary `AIWORKER_HOME` for operator and worker commands;
   - temporary fleet/worker database paths or data root when needed;
   - temporary log path and PID tracking outside the repo when possible.
   - do not change `HOME` for Codex executor E2E; only test default-home
     bootstrap behavior in a separate non-Codex scenario.

2. Enroll or pair the local worker with the fleet using the current CLI flow.
   Discover exact flags with `aiworker --help` and current package scripts.
   Do not print enrollment tokens or approval secrets.

3. Start the local worker against the fleet:
   - executor engine: `codex`;
   - model: use the project default unless the user asks otherwise;
   - use `tmux` only when it is installed and required by the repo rules;
     otherwise use `setsid` or `nohup` with explicit log and pidfile cleanup;
   - when neither `tmux` nor `setsid` is available and the shell environment
     reaps background jobs, keep the worker in a tracked foreground tool
     session and stop it explicitly at cleanup;
   - wait until the fleet reports the worker online.

4. Verify gateway-routed session behavior:
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
