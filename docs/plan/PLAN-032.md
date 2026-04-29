# PLAN-032 Extended 0.4.4 validation campaign

- **status**: completed
- **createdAt**: 2026-04-28 20:03
- **approvedAt**: 2026-04-28 20:03
- **relatedTask**: QA-001
- **bkd**: qprwd1j6

## Context

The `0.4.4` release has passed the normal release gates and a live
test-server fleet E2E:

1. Local gates passed: workspace tests, typecheck, lint, root build, and CLI
   smoke scripts.
2. The test-server gateway was upgraded to `@zonease/aiworker-cli@0.4.4` and
   `/health` stayed healthy.
3. Gateway `/admin/` served HTML/CSS/JS, the built CSS contained representative
   Tailwind utilities, and unauthenticated public ingress returned 401.
4. A local Codex worker joined the test fleet via OTP, stayed online, passed
   explicit and default conversation-id continuity, passed `/new` session
   rotation, and exposed redacted Codex native binding metadata.

The remaining risk is breadth: the baseline covered the release-critical path,
but not enough repeated reliability, malformed input, UI rendering, local
gateway behavior, auth edge cases, and static white-box invariants.

## Proposal

Run a no-fix validation campaign and record findings only.

Test tracks:

1. Reliability loops
   - Repeat root quality gates where runtime is reasonable.
   - Run CLI smoke scripts repeatedly.
   - Poll remote gateway health and version.
   - Repeat short local worker lifecycle checks with isolated temp state.
2. Black-box CLI and gateway behavior
   - Exercise `init`, `scope`, `config-show`, `config-set`, `sessions list`,
     `sessions show`, `gateway` commands, and `chat` error paths.
   - Probe malformed WebSocket and HTTP inputs through local or remote
     gateways without exposing secrets.
3. White-box review
   - Inspect high-risk paths around gateway auth, OTP pending lifecycle,
     `chat.send` normalization, session reset/binding clearing, environment
     redaction, static Web serving, and config validation.
   - Prefer focused grep/type/test evidence over speculative findings.
4. UI/UX smoke
   - Use available Playwright/Vitest tooling to render fleet and worker admin
     shells at desktop/mobile sizes.
   - Verify no blank screens, asset failures, severe overlap, or broken routes.
5. BKD orchestration
   - Create a coordinator issue and subtask issues for the main tracks.
   - Use follow-up messages for every finding and keep issue state in sync.
   - Move discovery/record-only subtasks to review when they complete; do not
     move anything to done without human confirmation.

## Risks

- Remote tests can perturb the shared test fleet if cleanup fails. Mitigation:
  use temporary worker identities, remove them from fleet, and delete local
  credential-bearing state after each run.
- Long-running loops can consume Codex and gateway resources. Mitigation:
  keep loops bounded and prefer targeted repeats over unbounded polling.
- UI screenshots may require browser dependencies. If unavailable, record the
  limitation and fall back to build-time and static asset checks.
- Some findings may be improvements rather than bugs. Record them as `TODO-*`
  tasks unless they are clear behavioral regressions.

## Scope

Expected repository changes in this session are limited to PMA tracking files:

- `docs/task/QA-001.md`
- newly discovered `docs/task/BUG-*.md` or `docs/task/TODO-*.md`
- `docs/task/index.md`
- `docs/plan/PLAN-032.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No source-code fixes should be made in this session.

## Alternatives

1. Run only the existing release smoke. Rejected because the user explicitly
   requested broad unattended testing across reliability, black-box,
   white-box, and UI/UX angles.
2. Dispatch all work to BKD and stop local testing. Rejected because local
   verification can produce immediate evidence while BKD subtasks run.

## Annotations

- 2026-04-28 20:03 User authorized unattended testing, PMA bug/optimization
  recording, BKD issue dispatch, and active follow-up while they rest. They
  explicitly requested no fixes in this session.
- 2026-04-28 20:05 Created BKD coordinator `qprwd1j6` and record-only
  validation subtasks:
  - `ay9a9yox` reliability and stability validation.
  - `e3lt7ehz` black-box CLI and gateway validation.
  - `pow2u9ox` white-box risk review.
  - `4j09qpa5` Web UI/UX smoke validation.
- 2026-04-28 20:15 Local extended checks:
  - CLI smoke scripts repeated three times each for `aiworker run` and fleet
    presence without failure.
  - Parallel heavy focused tests produced two 5s timeout observations, but the
    exact tests passed when rerun isolated and in sequential package order; this
    is tracked as a resource-contention observation rather than a confirmed bug.
  - Clean-cwd `gateway start` failed without an explicit fleet DB path and
    succeeded with `AIWORKER_FLEET_DB_PATH` set, recorded as `BUG-029`.
  - Fleet admin `/admin/` rendered successfully on desktop but overflowed badly
    at 390x844 mobile viewport across primary routes, recorded as `BUG-030`.
  - Final BUG-029/BUG-030 evidence lives under
    `/home/ben/.codex/memories/aiworker-qa001-evidence/`; earlier `/tmp`
    evidence was regenerated after cleanup races with parallel workers.
  - Local gateway black-box malformed probes returned bounded failures:
    ordinary HTTP to `/ws` and `/enroll-ws` returned 400, unknown HTTP path
    returned 404, and malformed WebSocket frames on `/ws` and `/enroll-ws`
    closed with code 4400 / `bad_frame`. No new bug recorded from this slice.
- 2026-04-28 20:15 Dispatched confirmed findings to BKD:
  - `BUG-029` -> `4xtxnd93`, status `working`.
  - `BUG-030` -> `2q45cah8`, status `working`.
- 2026-04-28 20:17 White-box BKD subtask `pow2u9ox` completed with 153 focused
  tests passing. It reconfirmed existing `BUG-014` and added systemd
  `ExecStart` portability plus reinstall/restart-application concerns.
  Dispatched `BUG-014` to BKD issue `q7s4bay9`, status `working`.
- 2026-04-28 20:29 Sequential local reliability gates passed after bug
  recording:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run build`
  - `bun run --filter '*' test`
  Build/test output still includes Vite 8 deprecation/chunk-size warnings and
  expected negative-path test logs, but all commands exited 0.
- 2026-04-28 20:31 Dispatched all late QA findings to BKD and moved them to
  `working`:
  - `BUG-031` -> `6kv9cqif`
  - `BUG-032` -> `251bdxa6`
  - `BUG-033` -> `x6936h4q`
  - `TODO-001` -> `2i506owq`
  - `TODO-002` -> `qnmrzirf`
  - `TODO-003` -> `jltt378f`
  - `TODO-004` -> `kz12xf5k` (proposal mode)
  - `TODO-005` -> `jfmsr8wc`
  - `TODO-006` -> `3k7sbl3h`
- 2026-04-28 20:33 Some newly dispatched BKD worktrees could not see the
  parent session's untracked PMA task files and stalled on missing docs. Sent
  follow-ups telling them to use the BKD prompt as the source of truth, avoid
  duplicate PMA doc creation, and continue; retried `BUG-031`, `BUG-033`,
  `TODO-001`, `TODO-004`, `TODO-005`, and `TODO-006`.
- 2026-04-28 20:35 Read-only remote test-server check via `aissh`:
  `aiworker-gateway.service` is active/running, loaded from
  `/etc/systemd/system/aiworker-gateway.service`, listening on
  `ws://127.0.0.1:9218/ws`, `/health` returned `ok=true`, and Bun global
  package listing reports `@zonease/aiworker-cli@0.4.4`.
- 2026-04-28 20:36 BKD issues `4xtxnd93` (`BUG-029`) and `q7s4bay9`
  (`BUG-014`) reported implementations and are in `review`; parent session has
  not merged either worktree. Reported verification was green for focused tests,
  typecheck/lint, and relevant smokes.
- 2026-04-28 20:37 Parent session performed a light scope review of
  `4xtxnd93` and `q7s4bay9` and posted notes to BKD coordinator `qprwd1j6`.
  No blockers were found in that quick review; both remain in `review` for
  normal merge review.
- 2026-04-28 20:18 Local black-box checks found that `gateway start` persists
  the operator URL without `/ws`; `fleet list` then fails WebSocket upgrade
  against `/` even though `/health` is healthy. Recorded as `BUG-031`.
- 2026-04-28 20:20 Posted the consolidated sanitized QA follow-up to BKD
  coordinator `qprwd1j6` and cleaned temporary local gateway state. No source
  fixes were made.
- 2026-04-28 20:24 Integrated late detailed subtask reports into PMA tracking:
  `BUG-030` widened to cover Worker admin mobile clipping, `BUG-031` expanded
  with black-box cross-command evidence, `BUG-032` and `BUG-033` added for
  reliability/test-cleanup defects, and `TODO-001` through `TODO-006` added for
  improvement candidates. No source fixes were made.
- 2026-04-28 20:30 Final regenerated evidence path recorded:
  `/home/ben/.codex/memories/aiworker-qa001-evidence/`. Credential/state
  artifacts were removed, leaving redacted outputs, gateway logs/probe outputs,
  and Fleet admin screenshots.
- 2026-04-28 20:41 BKD Codex watchdog adjustment: after the user clarified that
  Codex-backed issues can be killed when accidentally parked in `review`
  without fresh prompts, inspected `review + running` issues before waking. Left
  `TODO-004` (`kz12xf5k`) in review because it had posted proposal artifacts
  and validation notes; sent a wake-up follow-up to `TODO-005` (`jfmsr8wc`) and
  moved it back to `working` because its latest visible log was still awaiting
  final typecheck confirmation. This session will not create an unbounded cron
  watchdog unless BKD exposes a bounded run/expiry mechanism.
- 2026-04-28 20:42 Follow-up watchdog pass: `TODO-006` (`3k7sbl3h`) was left in
  `review` after a final report and `sessionStatus=completed`; `TODO-001`
  (`2i506owq`) and `BUG-030` (`2q45cah8`) were sent wake-up follow-ups and
  returned to `working` because their latest logs showed active cleanup or
  reopened implementation scope after entering review.
- 2026-04-28 20:45 Additional reliability loop:
  - Passed: 5x `smoke:aiworker-run`, 5x `smoke:aiworker-fleet`,
    `@zonease/aiworker-web` test, and `@zonease/aiworker-web` build.
  - Failed: workspace-concurrent `bun run --filter '*' test`, with CLI
    init/session timeouts, core history timeout, and a `killed 1 dangling
    process` signal.
  - Isolated reruns passed: CLI failed files 7/7 and core history 27/27.
  - Post-run cleanup check found no lingering gateway process or recent
    AIWorker temp gateway/smoke directories.
  Evidence logs live under
  `/home/ben/.codex/memories/aiworker-qa001-evidence/`.
- 2026-04-28 20:47 Posted that evidence to BKD `BUG-032`, `BUG-033`, and the
  coordinator. Moved `BUG-033` back to `working` after the new follow-up
  created a `review + running` turn without assistant output; left `TODO-001`
  in review because its retry posted a final report and completed verification.
- 2026-04-28 20:49 Captured persistent Worker admin UI screenshots from a local
  worker bundle preview: `worker-admin-mobile.png`, `worker-chat-mobile.png`,
  and `worker-admin-desktop.png`. Mobile screenshots confirm the Worker shell
  also keeps the fixed sidebar at 390x844 and clips/pushes main route content
  off-screen; recorded under `BUG-030`.
- 2026-04-28 20:50 Additional Web/gateway smoke:
  `bun apps/web/scripts/smoke-e2e.ts` exits 1 because the script still imports
  `../../gateway/src/index`, but the current gateway module lives under
  `packages/gateway`. Recorded as `BUG-034` and dispatched to BKD issue
  `0eosb0vd`; `web-quality shared-cycles` passed with 23 shared files checked.
- 2026-04-28 20:52 Read-only remote poll: gateway service active, local
  `/health` ok, explicit AIWorker CLI path reports `0.4.4`, and Bun global
  package listing reports `@zonease/aiworker-cli@0.4.4`. Non-interactive
  `command -v aiworker` remains empty, matching `TODO-006`'s PATH diagnostic
  scope. No server id, host, or token was written to PMA records.
- 2026-04-28 20:54 BKD watchdog moved `BUG-032` (`251bdxa6`) from `review` back
  to `working` after logs showed it was actively incorporating the new
  reliability evidence and broadening coverage to core/CLI stress cases.
- 2026-04-28 20:55 BKD watchdog moved `BUG-034` (`0eosb0vd`) back to `working`
  because its latest log showed it was about to run smoke/type/lint checks, but
  the issue had already been marked `review/completed` without a final report.
- 2026-04-28 21:02 Extended parent soak passed. Evidence:
  `/home/ben/.codex/memories/aiworker-qa001-evidence/extended-soak-2101.log`.
  The bounded run repeated CLI dry-run/fleet smokes, gateway protocol smoke,
  gateway package tests, and core package tests three times, then ran Web size
  report, Web tests, and Web production build/CSS utility checks. All commands
  exited 0; Web bundle size remained under the 20% review threshold relative to
  baseline, while existing Vite/happy-dom warning noise remained unchanged.
- 2026-04-28 21:03 BKD follow-up state normalized: all QA-dispatched fix or
  proposal issues are in `review/completed`; no issue is stuck in
  `review/running`. The coordinator moved `TODO-001` and `TODO-003` back from
  `done` to `review` because no human review/merge confirmation has occurred.
- 2026-04-28 21:06 CLI black-box matrix passed in an isolated temp HOME and
  temp git project. Evidence:
  `/home/ben/.codex/memories/aiworker-qa001-evidence/cli-blackbox-matrix-2106-rerun.log`.
  Covered first-run setup, project-scope detection, config/session commands,
  schedule CRUD, and expected invalid-input exits. No new bug was recorded.
- 2026-04-28 21:07 Cleanup scan found no recent AIWorker smoke temp
  directories and no real leftover AIWorker/gateway/Vite preview test
  processes.
- 2026-04-28 21:08 Low-level package breadth tests passed for shared,
  fs-layout, storage-sqlite, gateway-proto, and api packages. Evidence:
  `/home/ben/.codex/memories/aiworker-qa001-evidence/package-breadth-2108.log`.
- 2026-04-28 21:09 Moved BKD coordinator `qprwd1j6` to `review` after
  completed follow-ups; left human confirmation as the gate for `done`.
- 2026-04-28 21:11 Root `check` and `build` passed after the extended
  campaign. Evidence:
  `/home/ben/.codex/memories/aiworker-qa001-evidence/root-check-build-2109.log`.
- 2026-04-28 21:12 Workspace-concurrent `bun run --filter '*' test` passed in
  the parent worktree. Evidence:
  `/home/ben/.codex/memories/aiworker-qa001-evidence/workspace-concurrent-test-2111.log`.
  The earlier reproduced flake remains tracked under `BUG-032`/`BUG-033`
  pending review of the BKD worktree fixes.
- 2026-04-28 21:13 Built CLI bundle smoke passed for version, project init,
  scope, and dry-run runtime construction. Evidence:
  `/home/ben/.codex/memories/aiworker-qa001-evidence/bundle-cli-smoke-2113.log`.
- 2026-04-28 21:15 Moved the original baseline BKD issue `veyrxhkc` to
  `review` after the baseline validation summary and extended QA follow-ups
  were posted; `done` remains gated on human confirmation.
