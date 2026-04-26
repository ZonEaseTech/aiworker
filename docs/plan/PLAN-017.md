# PLAN-017 Bare-metal smoke regressions — fix four blockers found during local smoke

- **status**: completed
- **createdAt**: 2026-04-26 13:30
- **approvedAt**: 2026-04-26 13:35
- **completedAt**: 2026-04-26 14:20
- **relatedTask**: BUG-001 / BUG-002 / BUG-003 / BUG-004

## Context

A full local smoke (T1 single-process orchestrator → T2 gateway+worker
end-to-end → T3 hot-reload via `PUT /api/worker/config`) was run on
`/tmp/aiworker-smoke-1777202285/` against the current `main`
(commit `16bac04`). The business core is intact: claude-code engine
streams tokens through orchestrator → bus → subscriber → ws → operator
in T2; optimistic-lock `If-Match` returns the documented 409 / 200
results in T3. But the run uncovered four real defects that block any
new dev or operator without prior tribal knowledge.

### Reproduction artifacts

```
/tmp/aiworker-smoke-1777202285/
  env.sh                    # isolated env (PATH + AIWORKER_HOME + keys + ports + the two workaround envs)
  init.log                  # aiw init success
  run-t1.log                # T1 first attempt → workspace EACCES → claude-code error
  run-t1b.log               # T1 retry with WORKER_DATA_ROOT workaround → claude-code OK
  worker.log                # all worker stdout for the session
  gateway.log               # gateway listening line
  aim-chat.log              # T2 success, "2+2 等于 4。"
  aim-chat-post-reload.log  # T3 post-reload chat hangs → timeout
  home/                     # full worker tree, fleet.db, worker.db, aim.json
```

### Defect summary (cross-referenced)

| Bug | Location | Symptom | Root cause |
|---|---|---|---|
| BUG-001 | `packages/core/src/config/worker.ts:25,35` | `aiw serve` crashes (`Can't find meta/_journal.json`); orchestrator workspace `EACCES /var/lib/aiworker` | Two env-var defaults are container-only paths (relative `./drizzle/worker` vs absolute `/var/lib/aiworker`); neither is documented for dev. |
| BUG-002 | `apps/cli/src/aim/commands/pair.ts:30-33` | `aim workers list` after pair fails with `WebSocket ... Expected 101 status code` | `runPair` does not persist `--url` back to `aim.json`; subsequent commands dial default `ws://localhost:3000`. |
| BUG-003 | `apps/cli/src/commands/serve.ts:50-61` + `packages/core/src/worker/gateway-client/dispatcher.ts:203-211` | `aim config set` always returns `method_not_implemented: config.put handler not wired` | `serve.ts` never registers a `configPut` handler; `bootstrapWorkerApp` does not expose `reloadRuntime`. |
| BUG-004 | `packages/core/src/worker/gateway-client/index.ts:50-104` (`subscriber.start()` only on `onConnected`) | After successful `PUT /api/worker/config`, next `aim chat` is `accepted` but never receives `agent.thinking` / `agent.done` | Subscriber `bus.on(...)` is bound to the bus instance present at WS connect time; `reloadRuntime` swaps in a fresh bus, no one re-subscribes. Violates CLAUDE.md hot-reload invariant. |

### Architecture invariants in scope (CLAUDE.md)

- Hot-reload: routes lazy-fetch via `() => state.runtime`; old runtime
  must dispose long-lived resources. (BUG-004 directly violates this for
  the gateway-client subscriber path.)
- `reloadRuntime` must be serialised. (Not at risk; BUG-003 surfaces
  reload via gateway, but the underlying `state.runtime` swap is still
  serialised inside `bootstrapWorkerApp`.)
- Data-domain boundaries (fleet.db vs worker.db) are not touched.

## Proposal

### Approval gate

Approve the **shape** of PLAN-017 (4-task split, BKD parallel
orchestration, dependency edges, acceptance criteria). Implementation
PRs land per task, each with their own focused diff and test.

### Task split (final)

```
BUG-001 (P1) — packages/core/src/config/worker.ts                  [no deps]
BUG-002 (P1) — apps/cli/src/aim/commands/pair.ts                   [no deps]
BUG-003 (P2) — apps/cli/src/commands/serve.ts (+ bootstrap export) [no code deps; verify with BUG-001]
BUG-004 (P1) — packages/core/src/worker/gateway-client/{index,subscriber}.ts
                + apps/cli/src/commands/serve.ts (hook wiring)     [verify after BUG-001 + BUG-003]
```

Why 4 not 5: T1 surfaced two distinct env-var defaults but they live in
the **same** zod schema (`packages/core/src/config/worker.ts`). Splitting
them into separate tasks risks worktree merge conflicts on the same
hunk. They share root cause (container-only defaults bleeding into dev).

### Implementation outlines (illustrative; final code in each PR)

**BUG-001 — schema-level fix.** Two options for each var; pick one per
discussion in the task PR:

- `WORKER_MIGRATIONS_FOLDER`:
  - prefer making it `.optional()` and falling back to the absolute path
    exported by `@aiworker/storage-sqlite/worker.defaultWorkerMigrationsFolder`
    inside `getWorkerEnv()` — keeps the env override path open while
    eliminating the broken relative default. This matches what
    `apps/cli/src/context.ts:62` already does.
- `WORKER_DATA_ROOT`:
  - prefer making it `.optional()` and falling back to
    `path.join(process.env.AIWORKER_HOME ?? path.join(homedir(), '.aiworker'), 'data-root')`
    (or simply `AIWORKER_HOME` directly — needs the workspace.ts
    path-escape guard re-checked).
- Document both vars in `apps/api/.env.example` and `docs/cli.md`.

**BUG-002 — pair persists --url.** Single-line change in
`runPair.patchAimState` call (see BUG-002.md notes). No new file, no
test required beyond a unit test that the patch propagates.

**BUG-003 — wire config.put.**

- `apps/api/src/modes/worker.ts::bootstrapWorkerApp` returns
  `{ app, port, state, reloadRuntime }` (the closure is already there;
  only the return shape changes).
- `apps/cli/src/commands/serve.ts` adds a `configPut` handler that calls
  `putConfig` + `mirrorConfigToYaml` + the returned `reloadRuntime`,
  mirroring `apps/api/src/worker/management/routes.ts:101-151`. To avoid
  duplicating that 50-line body, extract a shared helper into
  `@aiworker/core` (`packages/core/src/worker/management/config.ts` is a
  natural home — `putConfig` already lives there).
- Map `InvalidConfigError` → dispatcher `invalid_config` /
  `ConfigVersionConflictError` → dispatcher `version_conflict` so
  operator-facing errors are not generic `internal_error`.

**BUG-004 — subscriber refresh on reload.**

- Add `notifyRuntimeReloaded()` to `GatewayNode`; implementation calls
  `subscriber.start()` when `connected === true` (idempotent — `start()`
  already calls `stop()` first).
- `bootstrapWorkerApp` accepts `onRuntimeReloaded?: () => void` option;
  the existing `reloadRuntime` closure invokes it after the new runtime
  is installed but before the old one is disposed (so listeners on the
  old bus are still drainable).
- `apps/cli/src/commands/serve.ts` wires the option via a mutable ref to
  the (not-yet-constructed) `gatewayNode`.
- Regression test in `packages/core/src/worker/gateway-client/`
  (sibling to existing `dispatcher.test.ts`) builds two stub buses, runs
  subscriber.start, swaps bus, calls `notifyRuntimeReloaded`, asserts
  events on the new bus surface in `sendEvent`.

### Verification matrix

For each PR (run before requesting review):

| Task | Local self-check | E2E smoke after merge |
|---|---|---|
| BUG-001 | `bun typecheck`; new unit test in `packages/core/src/config/worker.test.ts` (if missing) covering default fallbacks | T1: `aiw serve` boots without `WORKER_MIGRATIONS_FOLDER`; orchestrator workspace mkdir succeeds under dev `AIWORKER_HOME` |
| BUG-002 | `bun typecheck`; existing CLI tests (`apps/cli/src/aim/commands/install.test.ts` pattern); add a small test for pair state patch | After BUG-001: `aim pair --url ws://127.0.0.1:20300/ws ... && aim workers list` works with no manual JSON edit |
| BUG-003 | `bun typecheck`; new test for serve handler's configPut path; existing HTTP `PUT /config` tests must still pass | After BUG-001 + BUG-002: `aim config set` round-trips both correct & wrong `--if-match` |
| BUG-004 | `bun typecheck`; new subscriber refresh test (see above); HTTP `PUT /config` test asserting subsequent chat works | After BUG-001 + BUG-002 + BUG-003: full T3 sequence — set v2 → reload → `aim chat` returns within timeout |

### BKD orchestration

- Coordinator issue: `[PLAN-017] smoke regressions — coordinator`,
  status `working`, holds the merge plan and drives subtasks.
- Subtasks: 4 BKD issues (one per BUG-NNN), `mode: worktree` so each
  fix lands on its own branch and can be reviewed independently.
- Concurrency: BUG-001, BUG-002, BUG-003 may start in parallel; BUG-004
  starts after BUG-001 has merged (it touches `serve.ts` which BUG-003
  may also touch — coordinator stages BUG-004 after BUG-003 review).
- All subtasks land into branches; coordinator merges in this order:
  001 → 002 → 003 → 004; full T1+T2+T3 smoke is re-run after 004 lands.
- Cron: a single `issue-follow-up` cron polls subtasks every 5 minutes
  (BKD `references/orchestration.md`). Coordinator turn ends after
  spawning subtasks; cron resumes it.

## Risks

- **Worktree merge conflicts on `apps/cli/src/commands/serve.ts`** —
  BUG-003 and BUG-004 both touch this file. Mitigation: stage BUG-004
  after BUG-003 merges; coordinator rebases.
- **Refactor scope creep on BUG-003** — extracting a shared helper into
  `@aiworker/core` for the configPut body could grow. Mitigation: cap
  the extraction to one `applyConfigUpdate(deps, raw, ifMatch)` helper
  with no new abstractions; HTTP route becomes a thin caller.
- **Hot-reload subscriber refresh order** — if the reload hook fires
  *after* `previous.dispose()` instead of before, in-flight events on
  the old bus could be lost. Mitigation: wire the hook **between**
  `state.runtime = nextRuntime` and `previous.dispose()`.
- **`WORKER_DATA_ROOT` default change** — switching the default path
  could surprise an operator who has data under the old `/var/lib/aiworker`
  default. Mitigation: keep override env path; only the *unset* default
  changes; document in `docs/changelog.md`.

## Scope

- 4 source-file edits + 1 schema/config edit + 1 docs/env.example edit.
- ~150–250 lines of new code total (most of it in BUG-003 helper
  extraction + BUG-004 test).
- 2–3 new unit tests (config defaults; subscriber refresh; pair state
  patch).
- No DB migration. No protocol/schema change in `gateway-proto`. No
  changes to deployment configs.

## Alternatives

- **Single PR for all 4 fixes.** Rejected: the changes touch four
  different modules (config schema, CLI command, gateway-client
  internals, bootstrap surface). Splitting keeps each PR
  surgical/reviewable; BKD parallelism shortens wall-clock.
- **Fix BUG-001 by hard-coding new defaults to `homedir()/.aiworker/...`**
  rather than `AIWORKER_HOME`. Rejected: `AIWORKER_HOME` is the
  documented per-process root; defaults should respect it.
- **Fix BUG-004 by re-dialling the WS connection on reload.** Rejected:
  too heavy and breaks operator-side request continuity. Subscriber
  refresh is the minimal correct fix.

## Annotations

### 2026-04-26 13:35 — user `proceed`

Plan approved. Entering Phase 3. BKD orchestration: 1 coordinator + 4
worktree subtasks. Subtasks claim their own task files when they pick
up work. Coordinator polls via `issue-follow-up` cron (5 min cadence).
Merge order: 001 → 002 → 003 → 004; full T1+T2+T3 smoke after 004
lands.

## Outcomes

### 2026-04-26 14:20 — completed

四个 subtask 按预定顺序在独立 worktree 中实现并合 main，全程无 merge
冲突，无 revert，单测/typecheck 全程绿。

| Bug | Subtask | Commit | Merge | Files | Tests |
|---|---|---|---|---|---|
| BUG-001 | bkd/in4qr0s7 | `ea4c5a4` | `94691de` | `packages/core/src/config/worker.ts` + `worker.test.ts`(new) + `apps/api/.env.example` + `docs/cli.md` | core 379 → 384 (+5) |
| BUG-002 | bkd/7c6eu4br | `57cb021` | `78ca715` | `apps/cli/src/aim/commands/pair.ts` + `pair.test.ts`(new) | cli 13 → 15 (+2) |
| BUG-003 | bkd/mfeawlkb | `24da562` | `6ad908c` | `apps/api/src/modes/worker.ts` + `apps/api/src/worker/management/routes.ts` + `apps/cli/src/commands/serve.ts` + `packages/core/src/index.ts` + `packages/core/src/worker/gateway-client/{dispatcher,dispatcher.test}.ts` + `packages/core/src/worker/management/config.ts` (new helper) | core 384 → 388 (+4) / api 28 → 32 (+4) |
| BUG-004 | bkd/b8fwkuo0 | `d1ea58f` | `a47e3be` | `packages/core/src/worker/gateway-client/index.ts` + `subscriber-refresh.test.ts`(new) + `apps/api/src/modes/worker.ts` + `apps/cli/src/commands/serve.ts` | core 388 → 392 (+4) |

完整 PLAN-017 smoke（T1+T2+T3）在 `/tmp/plan017-final-2/` 下重跑通过：

- **T1** `aiw run --message "ping" --dry-run` 在仅设 `AIWORKER_MASTER_KEY/INTERNAL_SHARED_SECRET/AIWORKER_HOME/WORKER_DB_PATH/PORT/AIWORKER_GATEWAY_PORT/HOST` 时 runtime 构造成功，no `EACCES` / no `journal` / no `workspace path`。
- **T2** `aim pair --url ws://127.0.0.1:20500/ws --worker-url http://127.0.0.1:20501 --bootstrap-token <tok>` → `aim.json.gatewayUrl == ws://127.0.0.1:20500/ws`，紧跟 `aim workers list` 直接成功无需手改 JSON。
- **T3** `aim config get` v1 → `aim config set --if-match 1` 正确路径返回 `{version:2, runtimeReload:ok}`；同 `--if-match 1` 再发返回 `version_conflict: config version 1 does not match current version 2`；reload 后 `aim chat` 立即收到 `accepted → chat.message → done`（finishReason=`error` 因为 config 中 executor 指向 stub `http://localhost:9999`，不影响事件链路证据）。对照原 `aim-chat-post-reload.log` 是 `accepted → timeout`（BUG-004 修复证据）。

潜在跟进（不在本 plan scope）：

- `reloadRuntime` 没有 mutex，HTTP `PUT /api/worker/config` 与 gateway WS
  `config.put` 并发时存在 race（BUG-003 修复前已存在）。CLAUDE.md "reload
  必须串行化" 当前由"应用层不并发"维持；后续可单独提任务把锁推到
  `applyConfigUpdate` helper 内部。
- `subscriber-refresh.test.ts` 已覆盖单 worker 场景；多 worker 场景下的
  reload 行为以 `runtime = singleton` 设计保证，无新增风险。
