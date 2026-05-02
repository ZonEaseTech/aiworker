---
name: aiworker-test-worker
description: Run local/project-scoped AIWorker worker validation without touching fleet or gateway. Use when the user asks to test a local worker, Worker Admin, Codex-backed worker behavior, worker REST/SSE APIs, worker session continuity, or record worker-only bugs and UX findings while explicitly excluding fleet/gateway.
---

# AIWorker Test Worker

Use this workflow to validate a local/project-scoped AIWorker worker without
retyping the long operator prompt. This skill is intentionally separate from
`aiworker-test-fleet`.

## Hard Boundary

- Do not run, start, restart, upgrade, enroll, pair, or inspect fleet or gateway
  unless the user explicitly expands scope.
- Do not connect the worker to a fleet during this workflow.
- If the request includes shared test fleet, remote gateway, enrollment, or
  Fleet Web UI validation, use `aiworker-test-fleet` instead.
- Record worker bugs and UX findings; do not fix source code unless the user
  explicitly asks for implementation.

## Safety Rules

- Never write secrets into repo files, skill files, final answers, plans,
  changelogs, bug reports, screenshots, or persisted logs.
- Redact or omit bearer tokens, bootstrap tokens, master keys, cookies, env
  values, private URLs, and generated credentials.
- For Codex-backed worker tests, preserve the real user `HOME` so the Codex CLI
  can read the existing local auth and sandbox config.
- Isolate only AIWorker state with `AIWORKER_HOME`, worker database paths, data
  roots, logs, pidfiles, and test project directories.
- Prefer `tmux` for long-running worker servers when available; otherwise use a
  tracked pidfile/logfile and clean it up.
- Do not use broad process cleanup such as `kill $(lsof -ti:PORT)`. Match only
  confirmed listener PIDs with `lsof -tiTCP:PORT -sTCP:LISTEN`.

## Inputs

Determine these before testing:

- AIWorker command under test: built CLI bundle, workspace `bun` command, or
  published CLI.
- Project directory for the worker. Use the user's supplied directory; if none
  is supplied, ask before creating new project state.
- Executor engine and variant. Default to `codex/default` only when the user
  has authorized real Codex-backed testing.
- Worker Admin port and host. Prefer loopback ports and avoid public exposure.
- Whether the goal is read-only validation, bug discovery, UX audit, or a
  regression retest for existing PMA tasks.

## Local Worker Setup

Start from the repo root and preserve unrelated dirty work.

1. Inspect status:

   ```bash
   git status --short
   ```

2. Build or locate the CLI path that will be tested. For source-tree testing,
   prefer the built bundle when it already exists:

   ```bash
   PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' build:bundle
   ```

3. Initialize or reuse project-scoped worker state in the test project:

   ```bash
   cd <project-dir>
   AIWORKER_HOME="$PWD/.aiworker" <aiworker> worker init --soul developer
   AIWORKER_HOME="$PWD/.aiworker" <aiworker> worker doctor
   AIWORKER_HOME="$PWD/.aiworker" <aiworker> worker executor doctor --engine codex
   ```

4. If init chooses a non-Codex executor, update worker config through the
   supported CLI/config path, not by editing `worker.db` directly.

## CLI Continuity Checks

Use non-secret markers and a stable chat id.

1. Turn 1:

   ```bash
   AIWORKER_HOME="<project-dir>/.aiworker" <aiworker> worker run \
     --chat-id worker-local-continuity-1 \
     --message "Remember this marker exactly: AIWORKER_WORKER_MARKER_<date>_01"
   ```

2. Turn 2:

   ```bash
   AIWORKER_HOME="<project-dir>/.aiworker" <aiworker> worker run \
     --chat-id worker-local-continuity-1 \
     --message "Reply with only the marker I asked you to remember."
   ```

3. Inspect sessions:

   ```bash
   AIWORKER_HOME="<project-dir>/.aiworker" <aiworker> worker sessions list
   AIWORKER_HOME="<project-dir>/.aiworker" <aiworker> worker sessions show worker-local-continuity-1
   ```

Expected result: turn 2 recalls the marker and session metadata shows a stable
engine-native binding summary with sensitive values redacted.

## Worker HTTP and Admin Checks

Start a loopback worker server without gateway flags:

```bash
AIWORKER_HOME="<project-dir>/.aiworker" <aiworker> worker serve \
  --host 127.0.0.1 --port <port> --no-open
```

Validate these surfaces:

- `GET /health`
- unauthenticated `GET /api/worker/info` should match the intended auth policy
- authenticated `GET /api/worker/info`
- `/admin/` static shell and asset loading
- Worker Admin no-token state
- Worker Admin authenticated pages: Overview, Config, Secrets, Test, Cron,
  Approvals, Chat

Use Playwright for Worker Admin flows when available. Avoid putting bearer
tokens in persisted screenshots, docs, or final answers.

## Worker Admin Regression Matrix

Run only the parts that match the user request and current risk:

- Chat: send a marker prompt, verify assistant response appears live, reload if
  needed to check persistence, and verify whether subsequent sends continue the
  selected conversation or create a new one.
- Events: watch for SSE disconnects during slow executor replies.
- Config: verify optional fields render correctly; check whether no-op save
  bumps config version or reloads runtime.
- Secrets: create/delete only fake test keys and fake values.
- Test: run brain/executor checks; if using tiny probe, confirm timeout behavior
  and UI recovery.
- Cron: create a disabled future fake cron, verify list rendering, then delete
  it before finishing.
- Approvals: verify empty state or pending approval rendering without forcing
  real tool execution unless the user asked.
- Mobile: check one narrow viewport for layout overflow and text overlap.

## Database Spot Checks

Use `sqlite3` only for read-only evidence unless the user asks for repair.
Useful checks:

```bash
sqlite3 <project-dir>/.aiworker/local/worker.db \
  "select id,status,conversation_id,finished_at,error from agent_tasks order by created_at desc limit 5;"

sqlite3 <project-dir>/.aiworker/local/worker.db \
  "select id,channel,chat_id,task_id,status,last_active_at from conversations order by last_active_at desc limit 5;"

sqlite3 <project-dir>/.aiworker/local/worker.db \
  "select count(*) from cron_jobs;"
```

Do not print message content if it might include user secrets.

## Bug and UX Recording

Use PMA task files when confirmed findings need to persist. Record, do not fix,
unless the user expands scope.

1. Find the next unused task id in `docs/task/index.md`.
2. Create `docs/task/BUG-NNN.md`, `TODO-NNN.md`, or `QA-NNN.md` in English with
   status, priority, owner, createdAt, discoveredAt, observed behavior,
   expected behavior, reproduction, and acceptance criteria.
3. Append the index entry and update `docs/changelog.md` with a sanitized
   summary.
4. Keep exact secrets, tokens, private paths with credentials, and long raw logs
   out of repo docs.

## Cleanup

- Stop the local worker server and verify the port has no listener.
- Delete fake secrets and fake cron rows created through the UI/API.
- Leave reusable project worker state in place only when the user wants future
  retesting; otherwise remove credential-bearing temporary state.
- Report leftover non-AIWorker matches such as editor `tsserver` or Cursor
  helpers separately instead of killing them.

## Final Report

Summarize:

- project path, CLI path, executor, and port used;
- CLI continuity result;
- Worker HTTP/Admin checks run;
- confirmed bugs or UX tasks recorded;
- cleanup performed;
- commands or gates run, with failures called out.

Keep all sensitive values redacted or omitted.
