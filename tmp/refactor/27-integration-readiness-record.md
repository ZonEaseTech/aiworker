# Integration Readiness Record

Date: 2026-05-27 Asia/Shanghai
Branch: `codex/destructive-refactor`
HEAD: `411a0680 docs: 回归 superpowers readiness 文档`

## Authority

This file is non-authoritative evidence. Canonical authority remains:

- `docs/architecture.md`
- `docs/protocol.md`
- `docs/runtime.md`
- `docs/soul-authoring.md`
- `docs/testing.md`

`docs/superpowers/*` is allowed again for current Superpowers process specs and
plans, but it is not part of the AIWorker architecture authority set.

## Fresh Verification

- `git status --short`: clean before readiness commands and clean after build.
- `bun run test:cli`: pass. `34 pass`, `0 fail`, `307 expect()` calls across
  `apps/cli/src/aiworker.test.ts` and
  `apps/cli/src/freeform-golden-path.test.ts`.
- `bun run test:browser:freeform`: pass. Rebuilt Freeform and Host Web, then
  ran `tests/browser/freeform-cli-golden-path.spec.ts` and
  `tests/browser/freeform-mounted-workbench.spec.ts`. Latest evidence:
  `tmp/freeform-cli-golden-path-2026-05-27T06-12-55-025Z/golden-path.json`.
  It recorded a session locator route, mounted URL with worker/workspace/session
  locator, `routerMode: "search"`, `commonRoot: true`, `bridgeRefs: true`,
  empty `browserEvents`, and follow-up input ref
  `aiworker://sessions/877f0de4-208b-4224-a863-b07652f7c84a/invocations/6004a234-1324-405b-93ba-e27f187fbd03/input`.
- `bun run test:contracts`: pass. `30 pass`, `0 fail`, `195 expect()` calls
  across five architecture contract test files.
- `bun run test:protocol`: pass. `22 pass`, `0 fail`, `147 expect()` calls
  across five soul-protocol test files.
- `bun run lint`: pass with `0 errors`, `43 warnings`. `ui:check` passed with
  `0 changed files`; `docs:check` passed with
  `docs contract ok (6 active files, 5 canonical docs)`.
- `bun run crg:update`: pass. Incremental update reported `0 files updated`,
  `0 nodes`, `0 edges`.
- `bun run crg:review`: pass. Reported `No changes detected`.
- `bun run test`: pass. Package summaries observed:
  `@zonease/aiworker-soul-protocol` `22 pass`;
  `@zonease/aiworker-engine-bridge` `27 pass`;
  `@zonease/aiworker-fs-layout` `11 pass`;
  `@zonease/aiworker-engine-projection` `6 pass`;
  `@zonease/aiworker-soul-app-sdk` `4 pass`;
  `@zonease/aiworker-storage-sqlite` `11 pass`;
  `@zonease/aiworker-ui` `64 passed`;
  `@zonease/aiworker-soul-workbench` `1 pass`;
  `@zonease/aiworker-host-runtime` `58 pass`;
  `@zonease/aiworker-soul-app-runtime` `4 pass`;
  `@zonease/aiworker-cli` `89 pass`;
  `@zonease/aiworker-web` `68 passed`;
  `@zonease/aiworker-host-daemon` `17 pass`. Total observed package tests:
  `382 pass`, `0 fail`.
- `bun run build`: pass. Built `@zonease/aiworker-host-daemon`, Host Web, and
  `@zonease/aiworker-cli` bundle. Host Web emitted the existing Vite chunk size
  warning for a chunk over 500 kB, but the command exited `0` and
  `web-quality.ts studio-css` passed.

## Observed Issue Classification

- `turn send`: P3 compatibility debt, not a P0/P1 blocker. Evidence:
  `apps/cli/src/aiworker.ts` still registers `turn send` and maps it to
  `runtime.startTurn`, but `session invoke` maps to `runtime.startInvocation`.
  Freeform CLI and browser golden paths invoke session-level follow-up and
  assert invocation input refs under `/sessions/:sessionId/invocations`.
- `/api/local/.../turns`: P3 compatibility debt, not a P0/P1 blocker. Evidence:
  `packages/host-daemon/src/modes/worker.ts` still exposes local turn routes
  that call `createSessionMessageResponse` and `runtime.startTurn`, while the
  canonical broker route `POST /api/sessions/:sessionId/invocations` calls
  `createSessionInvocationResponse`. `packages/soul-app-runtime/src/index.ts`
  forwards mounted POST `/api/sessions/:sessionId/invocations` to the canonical
  Host route, while GET turns remain a local compatibility read.
- Historical drizzle `reviews`: P3 historical residue, not a P0/P1 blocker.
  Evidence: old `0000_polite_stellaris.sql` creates `reviews`, but
  `0005_fluffy_jane_foster.sql` drops `reviews`. Active schema and latest
  snapshot guardrails passed in `test:contracts`; current forbidden domain
  schema tests reject `profiles`, `reviews`, `business_actions`, and other
  Host-owned domain tables.
- Old authority paths: not a P0/P1 blocker. `find docs -maxdepth 3 -type f`
  now returns the five canonical docs plus only the new current
  `docs/superpowers` plan/spec artifacts. Searches for `docs/plan`,
  `docs/task`, `docs/changelog.md`, `docs/soul-app-developer.md`,
  `docs/cli.md`, `docs/deployment.md`, and `docs/executor-engines.md` matched
  only guardrails or this current plan text, not restored old authority files.

## Remaining Non-Blocking Debt

- QA/HR descriptor-producing sample migration remains outside the Freeform v1
  blocker scope.
- Lint still reports 43 warnings, all non-blocking in this phase because fresh
  lint exits `0` and reports `0 errors`.
- Host Web build still reports a Vite chunk size warning, non-blocking because
  fresh build exits `0`.
- `turn send` and `/api/local/.../turns` remain compatibility surfaces and can
  be cleaned in a later compatibility-deprecation pass.
- Push, PR, merge, and release remain undone.

## Decision

Ready for PR/release handoff.

No P0/P1 architecture drift was found in this readiness pass. The branch has
fresh minimum integration gates plus fresh root test/build evidence.
