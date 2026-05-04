# AIWorker Changelog

## 2026-05-04 02:47 [completed] BUG-052 / PLAN-081 — Claude Code streamed text append-only

修复 Claude Code executor 在 partial `stream_event` 文本之后又把完整
assistant text block 作为 `orchestrator.text.payload.delta` 重放的问题：

- 明确 `orchestrator.text.payload.delta` 是 append-only 文本增量，不是最终
  完整快照；`docs/cli.md` 已补充该契约。
- Claude Code executor 现在记录本轮已流出的 assistant 文本前缀，并在后续
  final assistant block 到达时移除已流前缀；无 partial text 的 buffered 输出
  仍保留原 final text fallback。
- 保持 tool events、token usage、finish、engine binding 和 `--resume` 行为不变。

验证：

- `bun test packages/core/src/worker/executor/engines/claude-code/executor.test.ts`
- `bun test packages/core/src/worker/orchestrator/service.claude-code.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- `bunx eslint packages/core/src/worker/executor/engines/claude-code/executor.ts packages/core/src/worker/executor/engines/claude-code/executor.test.ts packages/core/src/worker/orchestrator/service.claude-code.test.ts`
- `git diff --check`

## 2026-05-04 02:07 [progress] BUG-052 — remote published CLI Claude Code validation follow-up

记录远端 Coder workspace 中发布版 CLI + Claude Code executor 的验证发现：

- 使用 `@zonease/aiworker-cli@0.5.3` npm 发布包在
  `/home/ben/projects/debug-aiworker/release-cli-claude-code` 初始化
  project-scope worker，并选择 `claude-code/default`。
- `aiworker doctor` 通过；`executor doctor --engine claude-code` 的核心
  readiness 通过，仅有空 executor capability manifest / 空 MCP 声明警告。
- 真实 `aiworker run`、同 `chat-id` 连续性、`sessions list/show` 的脱敏
  engine binding、loopback `serve`、`/health`、`/admin/` 和未认证
  `/api/worker/info` 401 行为均验证通过。
- 新增 `BUG-052` 跟进 `orchestrator.text` 在分段 delta 之后又以 `delta`
  发送完整最终文本，导致 append-only SSE/CLI consumer 可能渲染重复内容。

## 2026-05-03 23:33 [progress] QA-003 / PLAN-080 — Soul brain executor validation follow-ups

记录 `/Users/ben/projects/aiben` 本地 Soul / brain / executor 调试样本，并落盘
后续优化/修复计划：

- `QA-003` 完成本次验证记录：9 个内置 Soul 的 fresh init、runtime brain
  diagnostics、executor readiness、真实 Codex-backed identity replies，以及
  Codex hand probe。
- `BUG-050` 跟进真实 Codex shell/file activity 未进入 AIWorker
  `orchestrator.tool_call` 事件流的问题。
- `BUG-051` 跟进 `executor mcp add --arg -y` 被 CLI parser 解析为 unknown
  option 的 stdio argument UX 问题。
- `TODO-008` 跟进把本次手工矩阵沉淀成可重复、可脱敏、local-only 的 Soul /
  brain / executor validation harness。
- `PLAN-080` 作为 draft 方案，等待批准后再实现。

## 2026-05-03 21:39 [completed] REL-012 / PLAN-079 — publish CLI 0.5.3

发布 `@zonease/aiworker-cli@0.5.3`：

- GitHub Actions release workflow `25280654558` 成功。
- npm latest 解析到 `0.5.3`。
- GitHub Release `v0.5.3` 上传 linux-x64、linux-arm64、darwin-x64、darwin-arm64 tarballs。
- published CLI smoke 通过：`--version` 报告 `aiworker/0.5.3`；
  `init --global` next steps 不再包含 project-only `aiworker executor doctor`；
  `up --dry-run` 继续显示 omitted port `(env/default)` 且不含 `NaN`。

## 2026-05-03 21:35 [progress] REL-012 / PLAN-079 — prepare CLI 0.5.3 release

启动 `@zonease/aiworker-cli@0.5.3` patch release：

- 当前 npm latest、GitHub Release 和远端 tag 均为 `0.5.2`。
- 本次 release 包含 `FEAT-046` worker local brain activation、`FEAT-047`
  executor bootstrap lifecycle，以及 `BUG-049` user/explicit init next-step polish。
- 本地 release gates 已通过；等待 release commit、`v0.5.3` tag push、
  GitHub Actions release workflow、npm / GitHub Release 验证和 published-package smoke。

验证：

- `bun run test`
- `bun run typecheck`
- `bun run lint`
- `bun run build`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- built CLI `--version` / `init --global` / `up --dry-run` smoke
- `cd apps/cli/dist && bun publish --dry-run --access public`（完成 pack 后停在本机 npm auth boundary）
- `git diff --check`

## 2026-05-03 21:27 [completed] BUG-049 — user-scope init next-step polish

修复 `aiworker init --global` / explicit `AIWORKER_HOME` init 的 next steps：
不再提示 project-only 的 `aiworker executor doctor --engine codex`，避免用户按
引导在 user/explicit scope 立即撞到 exit 2。Project-scope init 仍保留 executor
readiness guidance。

验证：

- `bun test --timeout=30000 apps/cli/src/commands/worker/init.integration.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`

## 2026-05-03 13:44 [completed] FEAT-047 / PLAN-074..078 — executor bootstrap lifecycle

完成 worker executor bootstrap lifecycle track：

- `executor doctor` 与 `aiworker up` 的 executor readiness 输出现在区分
  configured task executor、engine CLI availability、declared executor-native
  capabilities 和 projection compatibility；空 manifest / 默认 stub executor
  显示为 WARN，不再被误读成完整 bootstrap PASS。
- Codex MCP projection 改为当前 `codex mcp add` 参数面：HTTP 只生成
  `--url` / `--bearer-token-env-var`，stdio 走 `-- <command> ...args`，不再
  输出 Codex 不支持的 `--scope` / `--transport` / generic `--header`。
- 新增 `aiworker executor select`，默认 dry-run，`--apply` 才只替换
  `worker_config.configJson.executor`，保留 `--if-match` version guard，且不写
  engine project config 或 executor capability manifest。
- `.aiworker/executor-capabilities.json` 增加 engine plugin / skill / policy
  lifecycle descriptor，并新增只读 `executor capability list/show`；brain skill、
  Soul capability pack、runtime toolset 与 `.aiworker/mcp.json` 仍保持隔离。
- `/Users/ben/projects/aiben` 真实 HOME smoke：`codex-cli 0.128.0`，project
  scope 与 `doctor` PASS，当前 task executor 已是 `codex/default`，executor
  doctor/up dry-run 对空 executor-native manifest 给出 non-blocking WARN，
  `aiworker run --message "hello" --dry-run` 可构建 Codex runtime。

验证：

- `bun test apps/cli/src/commands/worker/executor.test.ts`
- `bun test apps/cli/src/commands/worker/up.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/worker/init.integration.test.ts packages/shared/src/executor-capabilities.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run typecheck`
- `bun run lint -- apps/cli/src/commands/worker/executor.ts apps/cli/src/commands/worker/up.ts apps/cli/src/aiworker.ts apps/cli/src/help.ts packages/shared/src/executor-capabilities.ts packages/core/src/index.ts`

## 2026-05-03 13:28 [completed] FEAT-046 / PLAN-073 — worker local brain activation

完成 worker local brain activation track：

- 新 seed worker 默认挂载 writable `local-filesystem` brain source，project
  scope 指向 `<project>/.aiworker/`，user / explicit scope 仍走 worker home
  下的 brain layout。
- `GET /api/worker/info`、`POST /api/worker/brain/test`、Worker Admin Test
  面板和新增 `aiworker brain status|skills|memories` 只读命令都会展示 runtime
  brain source 的 health、priority、read-only、write-target 与 effective home。
- Brain admission 边界写入架构文档：generated memory / brain skill / policy
  proposal 入 filesystem 前必须经过带 evidence / scope / confidence / rollback
  的显式 approval；executor-native capability 继续只走
  `.aiworker/executor-capabilities.json` 与 `aiworker executor ...`。
- `/Users/ben/projects/aiben` 已完成真实 Codex-backed worker smoke：filesystem
  skill / memory 被 runtime 扫出，`doctor` PASS，dry-run runtime 可构建，真实
  `aiworker run` 到达 `orchestrator.finished`，worker HTTP `/info` 与
  `/brain/test` 均报告 `local-filesystem` healthy。

## 2026-05-03 13:09 [progress] FEAT-047 / PLAN-074..078 — executor bootstrap lifecycle planning

启动长期 worker executor bootstrap track：

- 新建 `FEAT-047`，作为 executor readiness、engine selection、
  engine-native capability projection 和真实 Codex-backed validation 的
  umbrella task。
- 拆出 draft plans：
  - `PLAN-074` executor readiness semantics and first-run guidance。
  - `PLAN-075` Codex MCP projection compatibility with the current Codex CLI。
  - `PLAN-076` explicit executor selection/bootstrap command。
  - `PLAN-077` engine-native capability lifecycle beyond MCP。
  - `PLAN-078` real Codex-backed worker validation campaign。
- 记录 `/Users/ben/projects/aiben` 当前调查结论：`executor doctor --engine
  codex` 会因为 Codex CLI 存在而通过，但 `.aiworker/executor-capabilities.json`
  仍可能为空；当前 Codex MCP dry-run 生成的 command 还包含
  `codex-cli 0.125.0` 不支持的 `--scope` / `--transport` 参数。

## 2026-05-03 13:03 [progress] FEAT-046 / PLAN-073 — local filesystem brain activation

启动长期 worker brain activation track：

- 在 `/Users/ben/projects/aiben` 复现缺口：Soul/project brain 文件存在，
  `aiworker doctor` 通过，但 `aiworker config show` 仍显示 `brains: []`。
- 新建 `FEAT-046` / `PLAN-073`，按阶段推进：默认本地 filesystem brain、
  runtime diagnostics、brain inspection commands、admission gates，以及真实
  Codex-backed 验证。
- S1 将新 seed 的默认 worker config 改为挂载 writable `local-filesystem`
  source，同时继续把 executor-native capability 隔离在
  `.aiworker/executor-capabilities.json`。
- 聚焦验证已通过：core bootstrap/config tests、CLI init integration test、
  core typecheck、CLI typecheck、完整 `@zonease/aiworker-core` test，以及
  `/Users/ben/projects/aiben` fresh-project smoke。

## 2026-05-03 11:25 [release] REL-011 / PLAN-072 — CLI 0.5.2 published

Released `@zonease/aiworker-cli@0.5.2` as the superseding patch for `0.5.1`:

- GitHub Actions release workflow `25268701486` passed for `v0.5.2`.
- npm `@zonease/aiworker-cli` latest resolves to `0.5.2`.
- GitHub Release `v0.5.2` includes linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.
- Published-package smoke reports `aiworker/0.5.2`; `aiworker up --soul
  developer --dry-run --no-open --no-serve-web` now prints
  `port         : (env/default)` and does not contain `NaN`.

## 2026-05-03 11:19 [progress] REL-011 / PLAN-072 — prepare CLI 0.5.2 release

Started the `@zonease/aiworker-cli@0.5.2` superseding patch release:

- Bumped `apps/cli/package.json` from `0.5.1` to `0.5.2`.
- Release scope is the command-layer `BUG-042` fix plus the already published
  post-0.5.0 fixes from `0.5.1`.
- Published-package smoke for `0.5.2` must verify omitted `--port` prints
  `(env/default)` and does not contain `NaN`.

Next step: run local release gates, commit the release bump, tag `v0.5.2`,
then verify the tag-triggered GitHub release workflow and published package.

Local release gates passed: workspace tests, typecheck, lint, build, CLI smoke
scripts, dist artifact checks, built CLI omitted-port smoke, publish dry-run to
the local auth boundary, and `git diff --check`.

## 2026-05-03 11:18 [BUG-P3] BUG-042 — command-layer optional number normalization

Fixed the remaining `aiworker up --dry-run` omitted-port path after published
`0.5.1` smoke showed the direct `runUp()` fix was not enough:

- CLI command actions now normalize omitted optional numeric arrays from CAC
  before calling command handlers, so missing `--port` / timeout / pagination
  options do not leak `[NaN]` into command options.
- `aiworker up` integration coverage now exercises the actual CLI entrypoint
  with omitted `--port` and asserts `(env/default)` instead of `NaN`.

Validation:

- Manual CLI entrypoint check: `bun apps/cli/src/aiworker.ts up --soul developer --dry-run --no-open --no-serve-web`
- `bun test apps/cli/src/commands/worker/up.integration.test.ts apps/cli/src/commands/worker/up.test.ts apps/cli/src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`

## 2026-05-03 11:18 [release] REL-010 / PLAN-071 — CLI 0.5.1 published, superseded by 0.5.2

Released `@zonease/aiworker-cli@0.5.1`, but post-publish smoke found
`BUG-042` still reproduced through the CLI command layer:

- GitHub Actions release workflow `25268314569` passed for `v0.5.1`; npm
  `latest` resolved to `0.5.1`; GitHub Release uploaded the four platform
  tarballs.
- Published-package smoke reported `aiworker/0.5.1`, then
  `aiworker up --soul developer --dry-run --no-open --no-serve-web` still
  printed `port         : NaN`.
- `0.5.1` is therefore superseded by the follow-up `0.5.2` release.

## 2026-05-03 10:59 [progress] REL-010 / PLAN-071 — prepare CLI 0.5.1 release

Started the `@zonease/aiworker-cli@0.5.1` patch release:

- Bumped `apps/cli/package.json` from `0.5.0` to `0.5.1`.
- Release scope includes completed post-0.5.0 fixes `BUG-042` through
  `BUG-048` plus the `QA-002` validation record.
- `TODO-007` remains a P3 polish follow-up and is not a release blocker.

Local release gates passed: workspace tests, typecheck, lint, build, CLI smoke
scripts, artifact checks, publish dry-run to the local auth boundary, and
`git diff --check`.

Next step: commit the release bump, tag `v0.5.1`, then verify the
tag-triggered GitHub release workflow and published package.

## 2026-05-03 10:59 [BUG-P3] BUG-042 — `aiworker up --dry-run` omitted port output

Fixed a dry-run display bug in `aiworker up`:

- Omitted `--port` now prints `port         : (env/default)` instead of
  `port         : NaN`.
- Explicit dry-run port output is preserved.
- Serve startup behavior is unchanged.

Validation:

- `bun test apps/cli/src/commands/worker/up.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`

## 2026-05-03 10:39 [BUG-P2] BUG-047 / PLAN-070 — Worker Admin no-token locked state

Fixed the Worker Admin no-token experience:

- Worker Admin now renders a locked state before protected query hooks mount
  when the browser has no bearer token, preventing background `/api/worker/*`
  polling from flooding 401s.
- The locked state lets an operator paste the current worker bearer token into
  the current tab, using the existing `sessionStorage` auth model.
- Worker API client error normalization now handles legacy top-level
  `{ code, message }` auth failures without rendering raw JSON.
- Worker Web auth comments and `aiworker serve` admin URL output now agree that
  `/api/worker/*` requires bearer auth; `serve` still avoids printing tokenized
  URLs and points operators to `--open` for URL-fragment injection.

Validation:

- `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/bootstrap.test.tsx src/worker/__tests__/responsive-shell.test.tsx src/worker/api.test.ts`
- `bun test apps/cli/src/commands/worker/serve.test.ts`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- focused ESLint on touched Worker Web and CLI files
- `git diff --check`

## 2026-05-03 10:38 [BUG-P2] BUG-046 / PLAN-069 — Executor tiny probe hard timeout

修复 Worker Admin executor tiny probe 可能长期 pending 的问题：

- `handleExecutorTest()` 的 tiny probe stream iteration 现在带管理层 hard
  timeout；即使 executor stream 忽略 abort 且永不 yield，也会返回 degraded
  timeout 结果。
- Tiny probe 超时仍保持现有 API shape：HTTP 200、`status: degraded`、
  `tinyProbe.ok=false` 和 timeout `probeError`。
- Worker Admin `testExecutor()` 增加客户端请求 timeout，避免后端或网络不返回时
  mutation 永久 pending。
- Test panel 对 tiny probe timeout 展示恢复提示，按钮会在 error/degraded 后恢复
  可点击。

Validation:

- `bun test packages/core/src/worker/management/executor-test.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/api.test.ts src/worker/features/test/test-panel.test.tsx`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- focused ESLint on touched core/Web files
- `git diff --check`

## 2026-05-03 10:37 [BUG-P1] BUG-048 / PLAN-067 — legacy HOME `.aiworker` no longer skips Soul

修复 `aiworker init` 在旧 user-scope `~/.aiworker/` 下误判 project scope 的问题：

- 未带 project Soul markers 的 `$HOME/.aiworker/` 不再被 `resolveProjectRoot()` 当作 project root，`aiworker scope` 会报告 `user`。
- existing project init 分支如果缺少 `.aiworker/AGENT.md` 或 `.aiworker/SOUL.md`，会重新要求 Soul；非交互模式继续 fail closed 并提示 `--soul <preset>`。
- 已有 Soul material 的 project root 保持幂等 re-init，不覆盖现有 persona 文件。
- `--global` 和 `AIWORKER_HOME` 显式路径仍走 legacy user/explicit scope。

Validation:

- `bun test packages/fs-layout/src/index.test.ts`
- `bun test apps/cli/src/commands/worker/init.integration.test.ts`
- `bun test apps/cli/src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-fs-layout' typecheck`
- Manual reproduction for legacy `$HOME/.aiworker/`
- `git diff --check`

## 2026-05-02 21:46 [BUG-P1] BUG-045 / PLAN-068 — orchestrator task lifecycle persistence

Fixed stale Worker Admin / HTTP orchestrator task rows:

- `agent_tasks` now records `running`, `succeeded`, `failed`, and `cancelled`
  lifecycle transitions instead of staying at the initial `queued` state.
- Task-backed conversations now persist `conversations.task_id`, and task rows
  persist `conversation_id` so the Worker Admin task view can join work back to
  the conversation that processed it.
- Successful tasks write compact result metadata with the conversation id,
  assistant message id, and assistant text length.
- Failed tasks write a completion timestamp and a truncated, redacted error
  string.
- Selected conversation continuations link their `agent_tasks` row to the
  existing conversation without overwriting the single-value
  `conversations.task_id` field.

Validation:

- `bun test packages/core/src/worker/orchestrator/service.history.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bunx eslint packages/core/src/worker/orchestrator/service.ts packages/core/src/worker/orchestrator/service.history.test.ts`
- `bun run --filter '@zonease/aiworker-core' test`
- `git diff --check`

## 2026-05-02 21:29 [BUG-P1] BUG-044 / PLAN-066 — Worker Admin selected conversation continuation

Fixed Worker Admin Chat continuation for selected conversations:

- Added a selected conversation continuation API at
  `POST /api/worker/orchestrator/conversations/:id/messages`.
- Added `Orchestrator.continueConversation()`, which reuses the selected
  conversation's active session route instead of creating `chatId =
  task:<task-id>`.
- Worker Admin Chat now separates explicit new-conversation sends from
  selected-conversation continuation sends.
- Focused core coverage verifies that continuation appends to the same
  conversation row and reuses the executor-native binding.

Validation:

- `bun test packages/core/src/worker/orchestrator/service.history.test.ts`
- `bun test apps/api/src/worker/orchestrator/routes.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/features/chat/chat-panel.test.tsx src/worker/api.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- focused ESLint on touched core/API/Web files
- `git diff --check`

## 2026-05-02 21:02 [BUG-P1] BUG-043 / PLAN-065 — Worker Admin SSE keepalive

Fixed Worker Admin Chat live updates for slow executor replies:

- Direct worker `GET /api/worker/events/stream` now writes initial
  `: connected` and periodic `: keepalive` SSE comment frames below Bun's
  default HTTP idle timeout.
- Stream cleanup now runs on request/stream abort so heartbeat timers and bus
  subscriptions do not leak after the browser closes the subscription.
- Added API coverage for a byte-idle stream that receives no intermediate text
  events before a later worker bus event, and Web coverage that keepalive
  comments are ignored by the Worker Admin SSE parser.
- Real local Worker Admin smoke passed with a temporary Codex-backed worker:
  a prompt submitted at 21:00:58 displayed `BUG043_LIVE_OK` live at 21:01:22
  without a page reload.

Validation:

- `bun test apps/api/src/worker/events/routes.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/api.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bunx eslint apps/api/src/worker/events/routes.ts apps/api/src/worker/events/routes.test.ts apps/web/src/worker/api.ts apps/web/src/worker/api.test.ts`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-web' test`
- `git diff --check`

## 2026-05-02 20:39 [qa] QA-002 — local Codex-backed worker validation follow-ups

Recorded a local real-machine worker validation pass without implementing
source fixes:

- Confirmed project-scoped Worker CLI init/doctor, Codex executor doctor, and
  CLI chat continuity with a stable `--chat-id`.
- Smoked authenticated Worker Admin pages for Chat, Config, Secrets, Test,
  Cron, Approvals, and mobile layout; Secrets CRUD and disabled Cron
  create/delete worked.
- Recorded follow-up tasks: `BUG-043` for Worker Admin Chat SSE timeout,
  `BUG-044` for Web chat continuation, `BUG-045` for stale task lifecycle
  rows, `BUG-046` for tiny probe timeout handling, `BUG-047` for no-token admin
  UX, and `TODO-007` for lower-priority admin polish.

## 2026-05-02 19:51 [release] REL-009 / PLAN-064 — CLI 0.5.0 published and test fleet upgraded

Released `@zonease/aiworker-cli@0.5.0`:

- GitHub Actions release workflow `25251183256` passed for `v0.5.0`; npm `latest` resolves to `0.5.0`.
- GitHub Release `v0.5.0` contains linux-x64, linux-arm64, darwin-x64, and darwin-arm64 tarballs.
- Published-package smoke passed with explicit bin invocation: version reports `aiworker/0.5.0`, `aiworker up --help` renders the quick-start command, and `aiworker up --soul developer --dry-run --no-open --no-serve-web` completes without writing project state.
- Test fleet gateway was upgraded from `0.4.11` to `0.5.0` through the published npm package and restarted; service remained active, `/health` returned ok, `/admin/` served Fleet Web assets, and `aiworker fleet list` returned successfully.
- Follow-up recorded: BUG-042 tracks the non-blocking dry-run display issue where an omitted `--port` prints `NaN`.

## 2026-05-02 19:44 [progress] REL-009 / PLAN-064 — prepare CLI 0.5.0 release

Started the `@zonease/aiworker-cli@0.5.0` release:

- Bumped `apps/cli/package.json` from `0.4.11` to `0.5.0`.
- Release includes the pre-1.0 CLI IA consolidation and `aiworker up` quick start.
- Local release gates passed: frozen install, workspace tests, typecheck, lint, root build, CLI run smoke, CLI fleet smoke, release diff check, dist manifest/bundle checks, and publish dry-run up to the local npm authentication boundary.
- Stabilized two macOS-local path assertions by comparing canonical temporary paths, so release gates pass on machines where `/var` resolves to `/private/var`.
- Next step: tag `v0.5.0`, verify the tag-triggered GitHub release workflow, then upgrade the test fleet gateway with the published npm package.

## 2026-05-02 19:18 [feature] FEAT-045 / PLAN-063 — Worker quick start `aiworker up`

新增本地 worker 快速启动入口：

- `aiworker up` 与 `aiworker worker up` 已注册；root shortcut 仍等价于 worker canonical tree，不新增 `fleet up` / `gateway up`。
- `up` 编排固定阶段：scope 解析、init if needed、project capability validation、executor readiness、serve。brand-new 非交互项目必须显式 `--soul <preset>`；已初始化 project 下 `--soul` 不会被消费，避免误刷新 Soul 模板。
- `up --dry-run` 只打印阶段、init preflight 和 serve 参数，不写 `.aiworker/`、不启动 HTTP server、不打开浏览器。
- project capability validation 的 error 会阻断启动；executor readiness 只做 non-blocking 提示，缺某个 engine CLI 不会阻止 worker HTTP/admin 启动。
- `up` 透传现有 `serve` 参数：`--port`、`--host`、`--gateway`、`--gateway-token`、`--no-reconnect`、`--no-serve-web`、`--open`、`--no-open`。
- CLI help、`aiworker init` next steps、README、`docs/cli.md` 和 `docs/architecture.md` 已同步快速启动路径。

验证：

- `bun test apps/cli/src/commands/worker/init.integration.test.ts apps/cli/src/commands/worker/up.integration.test.ts apps/cli/src/commands/worker/up.test.ts apps/cli/src/lib/bootstrap.test.ts apps/cli/src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run lint`
- `git diff --check`

## 2026-05-02 14:07 [refactor] REFACTOR-015 / PLAN-062 — CLI worker/fleet/gateway 命令树收敛

按 pre-1.0 策略完成 CLI 信息架构破坏性收敛，不保留旧拼写 alias：

- 裸 `aiworker ...` 现在只表示本地 worker 快捷入口；`aiworker worker ...` 是等价的 canonical worker tree。
- fleet 控制面和远端 worker 操作统一迁到 `aiworker fleet ...`，包括 `fleet pair`、`fleet enroll ...`、`fleet chat`、`fleet config ...`、`fleet approvals ...`、`fleet schedule ...` 和 `fleet logs`。
- gateway 生命周期和 systemd install 统一迁到 `aiworker gateway ...`，包括 `gateway install systemd`。
- CLI command 实现目录按角色拆成 `apps/cli/src/commands/worker/`、`apps/cli/src/commands/fleet/`、`apps/cli/src/commands/gateway/`。
- CLI help、argv folding、numeric option validation、runtime hints、README、`docs/cli.md`、`docs/architecture.md`、`docs/gateway.md` 和 `AGENTS.md` 已同步新命令树。

验证：

- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' test:stress`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bunx eslint apps/cli/src/aiworker.ts apps/cli/src/help.ts apps/cli/src/lib/bootstrap.ts apps/cli/src/commands/worker apps/cli/src/commands/fleet apps/cli/src/commands/gateway`
- `git diff --check`

## 2026-05-02 02:44 [progress] FEAT-042 / PLAN-051 — Orchestrator control executor

完成 Orchestrator control-plane executor 与 task executor 的解耦：

- Worker config 新增 `orchestrator.decisionPipeline.executor`，未配置时继续复用主 `config.executor`，保持 FEAT-038 行为兼容。
- 新增 control executor resolver；LLM intent classifier、conversation continuation classifier、quality gate evaluator、quality repair、compaction summary 和 pre-compaction memory flush 都改走 control executor。
- 显式 control executor 使用独立 model / timeout / fallback 配置；suppressed control run 默认 `temperature=0`，不传 task workspace、tool list 或 engine native session binding。
- secret enumeration / redaction / hydration 覆盖 control executor 及其 fallback chain。
- `GET /api/worker/info` 增加 `controlExecutor` 诊断，标识 engine、model、status 与是否复用 task executor。

验证：

- `bun test packages/core/src/worker/management/config.test.ts packages/core/src/worker/management/info.test.ts packages/core/src/worker/orchestrator/service.history.test.ts`
- `bun test packages/core/src/worker/runtime.test.ts -t "control executor"`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- focused ESLint on touched core/shared files
- `git diff --check`

## 2026-05-02 02:01 [bug] BUG-006 / PLAN-061 — reloadRuntime 串行化

修复 worker hot-reload 的并发 swap race：

- `apps/api/src/modes/worker.ts` 的 `reloadRuntime` 现在通过 bootstrap 闭包内的 promise chain 串行执行；后一次 reload 会等前一次 hydrate/build/swap、`onRuntimeReloaded` 和旧 runtime `dispose()` 全部完成后再开始。
- reload 失败不会 poison 后续链路；下一次 reload 会从上一轮 rejected chain 后恢复排队。
- 新增 `apps/api/src/modes/worker.reload.test.ts`，用受控 secret hydrate 卡住第一次 reload，再并发触发第二次，断言第二次不会抢先进 hydrate/swap，且最终版本保持后发者。
- `docs/architecture.md` / `AGENTS.md` 明确该不变量由 `reloadRuntime` 内部 promise chain 强制，而不是依赖 operator 不并发。

验证：

- `bun test apps/api/src/modes/worker.reload.test.ts`
- `bun test apps/api/src/worker/management/routes.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`

## 2026-05-02 02:00 [refactor] REFACTOR-014 / PLAN-060 — CLI operator module 内部命名清理

完成 BUG-010 / PLAN-058 的后续内部源码清理，公共 CLI 行为不变：

- `apps/cli/src/aim/` 通过 `git mv` 迁到 `apps/cli/src/operator/`。
- CLI entry 与 smoke 脚本 import 改为 `operator` 路径。
- 内部 operator state/client/session 符号从 `Aim*` 改为 `Operator*`，包括 `OperatorState`、`loadOperatorState`、`patchOperatorState`、`OperatorClient`、`createOperatorClient` 和 `OperatorWsError`。
- `aiworker gateway start` 仍写 `~/.aiworker/aiworker.json`，daemon 文件仍是 `aiworker-gateway.pid` / `aiworker-gateway.log`。
- BUG-010 / PLAN-058 当前说明补充：`apps/cli/src/aim` 保留只代表当时历史状态，当前实现已迁到 `operator`。

验证：

- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `rg -n "\\baim\\b|\\baiw\\b|aim\\.json|aim-gateway|src/aim" apps/cli/src apps/cli/scripts` 无命中。
- `git diff --check`

## 2026-05-02 01:38 [bug] BUG-010 / PLAN-058 — CLI runtime 旧命名前缀清理

按最新版本做 clean rename，不保留 legacy operator state 文件名：

- 用户可见 runtime 前缀从 `[aiw ...]` 统一为 `[aiworker ...]`，worker-local dash-form 命令使用 `[aiworker config-set]`、`[aiworker token-rotate]`、`[aiworker schedule-*]`。
- OTP enrollment 提示从 `aim enroll approve <otp>` 改为 `aiworker enroll approve <otp>`。
- operator state 从 `~/.aiworker/aim.json` 改为 `~/.aiworker/aiworker.json`；gateway daemon pid/log 从 `aim-gateway.*` 改为 `aiworker-gateway.*`。
- README、`docs/cli.md`、`docs/gateway.md`、`docs/architecture.md` 与相关 CLI tests 同步。

验证：

- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `rg -n "\\[aiw(\\s|\\])|aim enroll approve|\\baiw\\b|aim\\.json|aim-gateway|~/.aiworker/aim" apps/cli/src apps/cli/scripts packages/core/src packages/gateway/src packages/gateway-proto/src apps/api/src docs/cli.md docs/gateway.md docs/architecture.md README.md` 无命中。

## 2026-05-02 01:14 [bug] BUG-038 / PLAN-059 — worker info runtimeVersion follows CLI package version

Fixed stale worker info version reporting:

- Removed the hard-coded `WORKER_RUNTIME_VERSION = '0.2.0'` from core worker info.
- `buildInfo` now receives the runtime/package version from its caller.
- `bootstrapWorkerApp` passes the same runtime version to `/api/worker/info` and the OpenAPI document, with `dev` as the explicit source-mode fallback.
- `aiworker serve` injects `apps/cli/package.json` version, so published CLI workers report the same version through both `fleet info` and bridged `/w/:workerId/api/worker/info`.
- Tests now use injected test runtime versions instead of pinning stale release literals.

验证：

- `bun test packages/core/src/worker/management/info.test.ts`
- `bun test apps/api/src/worker/management/routes.test.ts`
- `bun test apps/api/src/modes/worker.bearer-auth.test.ts`
- `bun test apps/cli/src/aiworker.test.ts`
- `bun test packages/core/src/worker/gateway-client/dispatcher.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`

## 2026-05-01 14:53 [docs] DOC-004 / PLAN-057 — 陈旧 PMA 待办状态清理

按当前开发成果和 Brain / Executor 能力边界，收敛 remaining pending / in-progress PMA 事项：

- FEAT-032 / PLAN-022 标记 completed：Web UI epic 已由 FEAT-033/034/035、REFACTOR-009/010 吸收并交付。
- FEAT-037 / PLAN-028 标记 completed：session control plane 已完成 S1-S5，剩余 idle/daily expiry 与 UI observability 以后按小任务重开。
- FEAT-039 / PLAN-041 标记 closed / rejected：init / Soul / doctor / capability 静态 validation / executor 边界已交付，S4-S6 以后按新边界拆小切片。
- FEAT-002、FEAT-007、FEAT-008、FEAT-010 标记 closed：远期占位或旧架构入口不再污染当前 backlog。
- BUG-010、BUG-038、FEAT-042 / PLAN-051 保留，并补充 current-scope note；PLAN-051 detail status 规范为 `draft`。

验证：targeted `rg` active-entry scan，`git diff --check`。

## 2026-05-01 14:37 [docs] DOC-003 / PLAN-056 — PMA 废案标记与 capability 边界治理

对 PMA 管理的 docs 做了一次不删除历史的废案和边界标记：

- FEAT-031 / PLAN-021 已从 pending / implementing 改为 closed / rejected，并在顶部标明不再作为实现规格，替代路径指向 FEAT-036、FEAT-037、FEAT-038、FEAT-039 和 FEAT-044。
- FEAT-038 / PLAN-039 补充 historical scope：其中 `.aiworker/mcp.json` 和 CapabilityRegistry 只表示 runtime observe-only descriptor，不是 executor-native MCP projection。
- FEAT-039 / PLAN-041 补充 current scope：继续承载 init / Soul / brain-runtime capability draft / `aiworker doctor`，不再承载 executor-native MCP/skill/plugin projection。
- BUG-040 标记为历史缺口记录，禁止从旧的 `aiworker mcp add` / `skill add` / `toolset enable` 描述恢复 executor config 命令。
- FEAT-036 / PLAN-023 / REFACTOR-011 与 `docs/architecture.md` 补充 `.aiworker/mcp.json` 与 `.aiworker/executor-capabilities.json` 的职责边界。

验证：`rg` targeted stale-entry scan，`git diff --check`。

## 2026-05-01 14:05 [progress] FEAT-044 / PLAN-055 — executor capability projection

完成 executor 原生能力快速配置 MVP，并把边界从 PLAN-041 S3 的 project capability 草案中拆出来：

- 新增 `.aiworker/executor-capabilities.json`，只记录 executor-native projection 期望状态；`init` / fs-layout 会种空 manifest。
- 新增 shared executor capability schema，当前支持 `codex` / `claude-code` 的 project-scope MCP descriptor。
- 新增 `aiworker executor mcp add`：写入 executor manifest，不修改 `.aiworker/mcp.json` 或 brain skill 目录。
- 新增 `aiworker executor mcp sync`：dry-run 输出将执行的 engine 官方 CLI 命令；非 dry-run 调用 `codex` / `claude`，cwd 固定为 project root，并过滤 AIWorker / worker / internal secret env。
- 新增 `aiworker executor doctor`：验证 manifest、engine CLI availability、descriptor 完整性与 secret-like 字段。
- Secret-like 字段只能用 `secretRef`；MVP 不做隐式 hydrate，非 dry-run projection 遇到 secretRef 会 fail clearly，避免把占位符或明文写进 engine project config。
- 文档更新：`aiworker doctor` 明确只管 brain/runtime capability 草案；executor MCP/skill/plugin 走 `aiworker executor ...` 与 `executor-capabilities.json`。

验证：

- `bun test packages/shared/src/executor-capabilities.test.ts apps/cli/src/commands/executor.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/init.integration.test.ts packages/fs-layout/src/index.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run lint`
- `git diff --check`

## 2026-05-01 13:34 [progress] FEAT-039 / PLAN-041 S3 — capability 静态 validation

完成 PLAN-041 S3 的最小可交付切片：

- 新增共享 capability manifest schema，覆盖 capability packs、policy、toolsets、MCP descriptor、Skill metadata 和 validation issue/status。
- 新增 CLI 内置 capability pack / toolset catalog，并校验所有内置 Soul preset 引用的 pack/toolset 都已登记。
- 新增 `aiworker doctor` 零副作用诊断命令，静态验证 `.aiworker/policy.json`、`toolsets.json`、`capability-packs.json`、`mcp.json` 和 `skills/` metadata。
- MCP 当前只做 descriptor 与明文 secret 静态检查；不启动 server，不执行 `listTools`。
- `aiworker init` 现在生成结构化 validation 草案并提示下一步跑 `aiworker doctor`；`aiworker soul list/show` 也指向 project doctor 获取 validation 状态。

验证：

- `bun test packages/shared/src/capabilities.test.ts apps/cli/src/capabilities/validation.test.ts apps/cli/src/commands/doctor.test.ts apps/cli/src/soul/presets.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/init.integration.test.ts`
- `bun run typecheck`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `git diff --check`

## 2026-05-01 13:08 [progress] REFACTOR-013 — CLI test gate 与 Soul preset 拆分

完成 FEAT-043 后续收尾：

- `apps/cli/scripts/aiworker-bin-shim.test.ts` 改用真实路径规范化 expected bundle path，兼容 macOS `/var` 与 `/private/var`。
- `aim pair` / `aim enroll` command 测试改为依赖注入，不再通过 full-module mock 污染 `./common`，CLI 包级测试恢复通过。
- 9 个内置 Soul preset 拆到 `apps/cli/src/soul/presets/*.ts`，`apps/cli/src/soul/presets.ts` 保持统一 registry 和外部消费入口。

验证：

- `bun test --timeout=30000 apps/cli/scripts/aiworker-bin-shim.test.ts apps/cli/src/aim/commands/common.test.ts apps/cli/src/aim/commands/pair.test.ts apps/cli/src/aim/commands/enroll.test.ts`
- `bun test --timeout=30000 apps/cli/src/soul/presets.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/init.integration.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run lint`
- `git diff --check`

## 2026-05-01 12:47 [progress] FEAT-043 — init 后引导与 Soul 能力矩阵

优化 project-scope `aiworker init` 的首次上手体验：

- `aiworker init` 成功后现在打印精简 next steps：确认 scope、审阅
  `.aiworker/SOUL.md` / `AGENT.md`、查看 Soul 能力、跑 `run --dry-run`、
  配好 executor 后真实 `run`，以及需要 HTTP/admin/fleet 时的下一步。
- 内置 Soul preset 从 `init.ts` 抽到共享 registry，`init`、help、测试和
  新 CLI 命令共用同一份能力数据。
- 新增 `aiworker soul list` / `aiworker soul show <preset>`，展示每个 Soul
  的职责、边界、沟通风格、风险策略、capability packs 和 toolsets。输出明确标记
  pack/toolset 仍是 `draft` / `validation pending`，真实 validation 留给
  PLAN-041 S3。
- `soul list/show` 被加入非 mutating bootstrap 例外，不会为了查看能力而 mint
  `.env` 或写入 worker state。
- 测试矩阵覆盖所有内置 Soul preset 的 dry-run 与实际 init，校验
  `SOUL.md`、`AGENT.md`、`policy.json`、`toolsets.json`、
  `capability-packs.json` 与 preset 声明一致。

验证：

- `bun test --timeout=30000 apps/cli/src/soul/presets.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/init.integration.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run lint`
- `git diff --check`
- `bun run --filter '@zonease/aiworker-cli' test` 仍有两处非本次失败：macOS
  `/var` vs `/private/var` 路径断言，以及整包运行时的 Bun mock 隔离顺序问题
  （`common.test.ts` 单跑通过）。

## 2026-04-30 20:34 [progress] REL-007 — 0.4.10 published

Published `@zonease/aiworker-cli@0.4.10`:

- Local release gates passed: frozen install, workspace tests, typecheck, lint,
  root build, CLI run smoke, CLI fleet smoke, dist manifest/shim/Web bundle
  checks, release diff check, and publish dry-run up to the local npm
  authentication boundary.
- The tag-triggered GitHub release workflow succeeded for `v0.4.10`, including
  typecheck, tests, CLI bundle, npm publish, compiled binaries, and GitHub
  Release asset upload.
- npm `latest` now resolves to `0.4.10`, `bunx @zonease/aiworker-cli@0.4.10
  --version` reports `aiworker/0.4.10`, and a clean-temp no-Bun `npx` smoke
  returns the friendly Bun install / standalone binary message.
- GitHub Release `v0.4.10` contains the linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.

## 2026-04-30 20:25 [progress] REL-007 — 准备发布 0.4.10

开始准备 `@zonease/aiworker-cli@0.4.10` patch 发版：

- npm latest 和本地最高 release tag 均为 `0.4.9`；远端不存在
  `v0.4.10` tag。
- 本次版本包含 Soul-aware init、项目级 engine cwd、Worker 决策管线
  S1-S5 与 Orchestrator control executor 后续任务记录。
- 发布路径沿用 tag-triggered GitHub release workflow；本地只做版本、文档、
  quality gates、artifact dry-run 与 tag 推送。
- 本地 release gates 已通过：frozen install、workspace tests、typecheck、
  lint、root build、CLI run smoke、CLI fleet smoke、dist manifest/shim/Web
  bundle 检查、release diff check 和 publish dry-run 到本机 npm auth 边界。

## 2026-04-30 20:25 [progress] FEAT-038 — learning loop S5

落地 worker 决策管线的 S5 learning loop 接入：

- Evolution proposer 现在会消费 `orchestrator.quality_gate` observation。
- 重复 failed quality gate 会生成 pending `skill_drafts`，草案带
  `evolution-meta.kind = "quality_gate"` 和稳定 `sequenceKey` 去重。
- 保留原有 tool-sequence mining 行为；S5 不直接写 memory、policy、MCP 或
  worker config。

## 2026-04-30 20:20 [docs] FEAT-042 — control executor follow-up

记录 FEAT-038 的 MVP 边界和后续任务：

- 当前允许 Orchestrator 的 LLM classifier / quality gate / repair / compaction
  suppressed run 复用 worker 主 executor。
- 新增 FEAT-042 / PLAN-051，后续把 Orchestrator control-plane executor 与
  task executor 解耦。
- 默认行为仍应兼容：未配置 control executor 时继续复用主 executor。

## 2026-04-30 20:10 [progress] FEAT-038 — quality gate S4

落地 worker 决策管线的 S4 quality gate：

- 新增 `QualityGate`，默认 `mode=observe`、`evaluator=heuristic`，记录 score、
  threshold、dimensions、missing、suggestions 和 action。
- 新增可选 LLM strict-JSON evaluator，失败时回退 heuristic。
- 支持 `observe` / `warn` / `retry` / `block`。默认 observe 不改变交付；
  显式 `retry` 会触发一次 suppressed repair run 并发出
  `orchestrator.repair_attempted`。
- Evolution observer 现在也会持久化 repair attempt 事件。

## 2026-04-30 19:45 [progress] FEAT-038 — intent classifier S3

落地 worker 决策管线的 S3 intent/risk classifier：

- 新增 `IntentClassifier`，默认用 deterministic heuristic 生成 intent、risk、
  requiredContext、qualityProfile、confidence、sessionAction 和 reason。
- `orchestrator.intent_decision` 现在记录真实 session action 和任务意图。
- 新增可选 `orchestrator.decisionPipeline.intentClassifier.evaluator = "llm"`，
  启用后通过 suppressed executor 做 strict-JSON 分类，失败时回退 heuristic。
- Capability planner 现在消费 intent decision，但仍只写 observation，不改变主执行路径。

## 2026-04-30 19:25 [progress] FEAT-038 — capability registry S2

落地 worker 决策管线的 S2 observe-only capability registry：

- 新增 `CapabilityRegistry`，聚合 brain skill、内置 `load_skill` /
  `memory_search`、`.aiworker/mcp.json` 与 `.aiworker/toolsets.json`。
- `orchestrator.capability_decision` 现在由 registry snapshot + planner
  生成，包含 available builtin/MCP/skill/toolset 和 selected capability 信息。
- S2 仍不改变 executor tool exposure，只记录能力选择结果，供后续 S3/S4/S5
  消费。

## 2026-04-30 19:05 [progress] FEAT-038 — worker decision pipeline S1

落地 worker 决策管线的第一个 observe-only 切片：

- 从 orchestrator 抽出 `ContextManager` 和 `RunContextComposer`，同时保持现有
  system prompt、项目 persona 注入、history window、token budget、compaction
  和 native engine binding 行为不变。
- 新增 `orchestrator.intent_decision`、`orchestrator.capability_decision` 和
  `orchestrator.quality_gate` 的 typed default payload builder。
- 新事件均为 observe-only：只记录当前默认决策，不启用真实分类、不强制能力选择、
  不修复输出，也不阻断交付。
- Evolution observation 现在会持久化这些决策事件，供后续 proposer 和 retrospect
  使用。

## 2026-04-30 18:26 [bug] BUG-041 — project-scope engine cwd

Fixed project-scope agentic CLI execution so engines keep the project root as
their default working directory:

- Added a shared project root mode to `WorkspaceManager`; project root handles
  are never removed by conversation dispose or purge.
- Runtime now enables shared project root mode only for project scope without
  explicit isolation settings. `WORKER_WORKSPACE_GIT_ORIGIN` and Claude Code
  `workspaceRoot` overrides continue to use isolated workspaces.
- The orchestrator now injects `.aiworker/AGENT.md`, `SOUL.md`, `USER.md`,
  `MEMORY.md`, and `ROLLUP.md` into the system prompt, so AIWorker's project
  brain files are consumed even though engines run from the project root.
- Added regressions for workspace disposal safety, runtime project-scope
  selection, explicit workspaceRoot override behavior, project persona prompt
  injection, and Claude Code spawn `cwd`.

## 2026-04-30 17:46 [bug] BUG-040 — init Soul selection

Fixed brand-new project `aiworker init` so it no longer silently creates stub
persona files:

- Added project Soul selection before `.aiworker/`, worker identity, and
  worker.db creation. Non-interactive brand-new init now requires
  `--soul <preset>` and fails without writing files when omitted.
- Added builtin presets plus interactive `customize` questions for role,
  boundaries, out-of-scope handling, communication style, approval posture,
  capability packs, and toolsets.
- Project init now seeds non-stub `SOUL.md` / `AGENT.md` plus draft
  `policy.json`, `toolsets.json`, and `capability-packs.json`, while preserving
  the existing no-overwrite behavior for existing `.aiworker/` and external
  agent files.
- Updated CLI docs, help quickstart, and smoke coverage to use
  `aiworker init --soul developer` for non-interactive paths.

## 2026-04-30 16:41 [progress] REL-006 — 0.4.9 published

Published `@zonease/aiworker-cli@0.4.9`:

- Local release gates passed: frozen install, workspace tests, typecheck, lint,
  root build, CLI run smoke, CLI fleet smoke, dist manifest/shim/Web bundle
  checks, release diff check, and publish dry-run up to the local npm
  authentication boundary.
- The tag-triggered GitHub release workflow succeeded for `v0.4.9`, including
  typecheck, tests, CLI bundle, npm publish, compiled binaries, and GitHub
  Release asset upload.
- npm `latest` now resolves to `0.4.9`, `bunx @zonease/aiworker-cli@0.4.9
  --version` reports `aiworker/0.4.9`, and a clean-temp no-Bun `npx` smoke
  returns the friendly Bun install / standalone binary message.
- GitHub Release `v0.4.9` contains the linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.

## 2026-04-30 16:33 [progress] REL-006 — 准备发布 0.4.9

开始准备 `@zonease/aiworker-cli@0.4.9` patch 发版：

- npm latest 当前是 `0.4.8`，本地最高 release tag 是 `v0.4.8`，远端不存在
  `v0.4.9` tag。
- 本次发版包含 `0.4.8` 之后的 CLI 使用体验改进：`npx` / `bunx` 启动 shim、
  无 Bun 时的友好错误提示、非 git 目录 `aiworker init`，以及中文分组 help。
- 发布仍走 tag-triggered GitHub Actions workflow；本地只做发版门禁、dist 产物检查和
  dry-run pack，不直接发布 npm。
- 本地 release gates 已通过：frozen install、workspace tests、typecheck、lint、root
  build、CLI run smoke、CLI fleet smoke、dist manifest/shim/Web bundle 检查、publish
  dry-run 到本机 npm authentication boundary、`git diff --check`。

## 2026-04-30 16:28 [progress] FEAT-041 CLI help 信息架构

优化 `aiworker --help` 可读性：

- 将 `cac` 默认扁平命令列表改为场景分组：本地 worker、gateway/fleet 管理、
  远端 worker 操作、安装/诊断/高级维护。
- 新增简短使用引导，指向 `aiworker init`、`aiworker serve`、gateway
  pair/enroll，以及 `aiworker chat` 等常见路径。
- 全局 help 标题、help/version 选项、命令摘要、option 描述和默认值文案收敛为中文；
  命令名、环境变量和必要技术标识保持原样。
- 新增回归测试，确保新增显式命令不会漏出分组 help 表面。

## 2026-04-30 15:47 [bug] BUG-039 npx / bunx CLI startup experience

Improved the npm CLI startup path while keeping AIWorker Bun-native:

- The publish artifact now exposes `aiworker.js` as a POSIX shell shim and
  keeps the real Bun bundle at `aiworker-bun.js`.
- The shim searches `AIWORKER_BUN_BIN`, PATH, `$BUN_INSTALL/bin/bun`, and
  `$HOME/.bun/bin/bun`, then execs the Bun bundle with argv/exit-code
  passthrough.
- When Bun is unavailable, `npx @zonease/aiworker-cli ...` now exits 127 with
  an actionable install / `bunx` / standalone binary message instead of raw
  `env: bun: No such file or directory`.
- README install guidance now states that `npx` / `npm install -g` are
  distribution entrypoints only; the runtime remains Bun or the GitHub Release
  standalone binary.

## 2026-04-30 15:47 [progress] FEAT-039 — init no longer requires git

Adjusted the project-scope `aiworker init` first-run flow: a brand-new
directory no longer needs to be inside a git repository. The command now creates
the same safe `.aiworker/` project layout in the current cwd, prints a preflight
note when no git repository is detected, keeps `--global` for user-scope worker
initialization, and keeps `--force` as a no-overwrite compatibility flag.

## 2026-04-30 08:55 [bug] BUG-038 found during 0.4.8 test-fleet validation

The `0.4.8` test-fleet validation found that worker info still reports
`runtimeVersion: "0.2.0"` even when both the gateway and temporary worker are
running the published `@zonease/aiworker-cli@0.4.8` package. Recorded as
`BUG-038`; no source fix was made in this validation pass.

## 2026-04-30 08:39 [progress] REL-005 — 0.4.8 published

Published `@zonease/aiworker-cli@0.4.8`:

- Local release gates passed: frozen install, workspace tests, typecheck, lint,
  root build, CLI run smoke, CLI fleet smoke, dist manifest/Web bundle checks,
  release diff check, and publish dry-run up to the local npm authentication
  boundary.
- The tag-triggered GitHub release workflow succeeded for `v0.4.8`, including
  typecheck, tests, CLI bundle, npm publish, compiled binaries, and GitHub
  Release asset upload.
- npm `latest` now resolves to `0.4.8`, and a published-package smoke reports
  `aiworker/0.4.8`.
- GitHub Release `v0.4.8` contains the linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.

## 2026-04-30 08:32 [progress] REL-005 — 准备发布 0.4.8

开始准备 `@zonease/aiworker-cli@0.4.8` patch 发版：

- npm latest 当前是 `0.4.7`，本地最高 release tag 是 `v0.4.7`，远端不存在
  `v0.4.8` tag。
- 本次发版包含 `0.4.7` 之后的 Fleet 同源托管 Worker UI 完整交付：gateway 托管
  `/w/:workerId/` worker bundle、Worker UI same-origin bridge/SSE、Fleet UI 同源
  worker 入口，以及当前 Worker UI 所需 REST bridge 覆盖。
- 发布仍走 tag-triggered GitHub Actions workflow；本地只做发版门禁、dist 产物检查和
  dry-run pack，不直接发布 npm。
- 本地 release gates 已通过：frozen install、workspace tests、typecheck、lint、root
  build、CLI run smoke、CLI fleet smoke、dist manifest/Web bundle 检查、publish
  dry-run 到本机 npm authentication boundary、`git diff --check`。

## 2026-04-30 07:44 [progress] FEAT-040 / PLAN-042 completed

Completed the fleet-hosted worker UI path for non-same-host workers:

- Gateway now serves the worker bundle at `/w/:workerId/*` and keeps
  `/w/:workerId/api/worker/*` on an explicit bridge allowlist.
- The worker bundle derives its router base and API/SSE base from
  `/w/:workerId`, while preserving self-hosted `/admin` and dev `/worker`.
- The bridge covers the worker UI surfaces currently in use: info/config,
  secrets, engine availability, brain/executor/channel probes, cron,
  approvals, orchestrator tasks, conversations, messages, and worker-scoped
  SSE.
- Fleet UI worker links now open same-origin `/w/:workerId/` instead of
  requiring `worker.baseUrl/admin/`.
- `fleet.db` remains pointer/audit-only; worker config, secrets, messages, and
  conversations stay in `worker.db`.

## 2026-04-30 07:03 [progress] REL-004 — 0.4.7 published

Published `@zonease/aiworker-cli@0.4.7`:

- Local release gates passed: frozen install, workspace tests, typecheck, lint,
  root build, CLI run smoke, CLI fleet smoke, release diff check, dist manifest
  version check, and publish dry-run up to the local npm authentication boundary.
- The tag-triggered GitHub release workflow succeeded for `v0.4.7`, including
  typecheck, tests, CLI bundle, npm publish, compiled binaries, and GitHub
  Release asset upload.
- npm `latest` now resolves to `0.4.7`, and a published-package smoke reports
  `aiworker/0.4.7`.
- GitHub Release `v0.4.7` contains the linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.
- Gateway worker bridge remains an MVP in this release; complete FEAT-040 /
  PLAN-042 delivery continues in follow-up work.

## 2026-04-30 07:02 [progress] REL-004 — 准备发布 0.4.7

开始准备 `@zonease/aiworker-cli@0.4.7` patch 发版：

- npm latest 当前是 `0.4.6`，本地最高 release tag 是 `v0.4.6`。
- 本次发版包含 `0.4.6` 之后的 `aiworker init` preflight / `--dry-run`、Fleet
  Audit log 表格内部滚动修复、code-review-graph 工作流接入，以及 gateway worker
  bridge MVP。
- Gateway worker bridge 仅作为 MVP 发布：覆盖 node-side `workers.info` /
  `workers.stop` handler，以及 `/w/:workerId/api/worker/info`、`GET/PUT /config`
  allowlisted bridge。完整 FEAT-040 / PLAN-042 体验继续由后续任务完成。
- 发布仍走 tag-triggered GitHub Actions workflow；本地只做发版门禁、dist 产物检查和
  dry-run pack，不直接发布 npm。

## 2026-04-29 17:58 [progress] REL-003 — 0.4.6 published

Published `@zonease/aiworker-cli@0.4.6`:

- Local release gates passed: frozen install, workspace tests, typecheck, lint,
  root build, CLI run smoke, CLI fleet smoke, release diff check, dist manifest
  version check, and publish dry-run up to the local npm authentication boundary.
- The tag-triggered GitHub release workflow succeeded for `v0.4.6`, including
  typecheck, tests, CLI bundle, npm publish, compiled binaries, and GitHub
  Release asset upload.
- npm `latest` now resolves to `0.4.6`, and a published-package smoke reports
  `aiworker/0.4.6`.
- GitHub Release `v0.4.6` contains the linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.

## 2026-04-29 17:50 [progress] REL-003 — 准备发布 0.4.6

开始准备 `@zonease/aiworker-cli@0.4.6` patch 发版：

- npm latest 当前是 `0.4.5`，本地最高 release tag 是 `v0.4.5`。
- 本次发版包含 `0.4.5` 之后的 `aiworker serve` 前台生命周期修复、Codex app-server reconnect 容忍修复、AGENTS 工作指引刷新，以及 Web UI 视觉系统收敛。
- 发布仍走 tag-triggered GitHub Actions workflow；本地只做发版门禁、dist 产物检查和 dry-run pack，不直接发布 npm。

## 2026-04-29 17:18 [progress] REFACTOR-012 Web UI 视觉系统收敛

按照 `DESIGN.md` 收敛 Fleet / Worker Web UI：Tailwind v4 token 层改为黑白高对比、NVIDIA green 信号色、2px 半径和单一 card shadow；共享 button / badge / card / input / table / dialog / tooltip / toaster primitive 统一走 token；Fleet 与 Worker shell 改为黑色导航面 + 绿色 active signal；主要页面移除 shadcn 默认大圆角、随意 emerald/amber 状态色和可见 React Query Devtools 浮动入口。

保持 FEAT-032 数据边界不变：Fleet UI 仍只走 gateway WS，Worker UI 仍只走 worker REST + bearer-auth。验证通过 web lint、typecheck、test、build、CSS utility check、`git diff --check`，并用 Playwright 检查 Fleet workers 与 Worker overview/chat 的桌面和 390px 移动视口。

## 2026-04-29 10:56 [BUG-P1] BUG-036 fixed: Codex reconnect notifications

Fixed the Codex current app-server path so transient reconnect progress
notifications such as `Reconnecting... n/n` no longer abort the AIWorker turn
before Codex can emit the terminal `turn/completed` result. Non-transient
current-protocol errors and failed completed turns remain fatal.

Verification passed: focused Codex normalizer/executor regressions, root
lint/typecheck/test/build gates, real local `CodexExecutor` one-turn and
native resume smokes, and the test-fleet local `codex/default` worker path:
OTP enrollment and approval, explicit conversation id continuity, default
accepted-id continuity, reset rotation, and `sessions list/show` metadata.
Temporary fleet registration and local credential-bearing state were removed.

## 2026-04-29 10:01 [BUG-P0] BUG-035 fixed: serve foreground lifecycle

Fixed `aiworker serve` so successful startup remains a foreground long-running
process until SIGTERM/SIGINT. Added a CLI lifecycle regression that verifies the
worker HTTP server stays alive after `/health` is ready and exits cleanly on
SIGTERM.

Verification passed: focused serve lifecycle test, CLI package test, workspace
test suite, root typecheck, root lint, root build, and CLI smoke scripts. A
temporary test-fleet OTP worker enrolled and was approved successfully; real
Codex chat continuity is now blocked by the separate `BUG-036` executor
reconnect failure.

## 2026-04-29 10:01 [bug] BUG-036 found during BUG-035 fleet validation

After the `BUG-035` lifecycle fix, a temporary local `codex/default` worker
successfully reached OTP approval through the test fleet, but real chat turns
ended with `finishReason=error`. Local worker logs showed Codex app-server
reconnect errors. Recorded as `BUG-036` with sanitized evidence; temporary
worker state was removed from the fleet and local credential-bearing state was
deleted.

## 2026-04-29 08:45 [bug] BUG-035 found during 0.4.5 fleet validation

The `0.4.5` test-fleet run found a release-blocking `aiworker serve` foreground
lifecycle bug: the worker starts, begins OTP enrollment, then the CLI process
exits before an OTP is issued. Recorded as `BUG-035` with sanitized
reproduction evidence. No source fix was made in this validation pass.

## 2026-04-29 06:10 [progress] REL-002 — 0.4.5 published

Published `@zonease/aiworker-cli@0.4.5`:

- Local release gates passed: frozen install, workspace tests, typecheck, lint,
  root build, CLI run smoke, CLI fleet smoke, release diff review, and publish
  dry-run up to the local npm authentication boundary.
- The tag-triggered GitHub release workflow succeeded for `v0.4.5`, including
  typecheck, tests, CLI bundle, npm publish, compiled binaries, and GitHub
  Release asset upload.
- npm `latest` now resolves to `0.4.5`, and a published-package smoke reports
  `aiworker/0.4.5`.
- GitHub Release `v0.4.5` contains the linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.

## 2026-04-29 06:02 [progress] REL-002 — prepare 0.4.5 release

Started the `@zonease/aiworker-cli@0.4.5` patch release:

- npm latest is currently `0.4.4`, and `0.4.5` is not published yet.
- The release carries the reviewed post-0.4.4 repair batch plus the admin
  surface fail-closed security hardening.
- Local `main` is ahead of `origin/main` with the reviewed release candidate
  commits, so the release push will include `main` and `v0.4.5`.

## 2026-04-29 05:43 [security] PLAN-033 admin serving fail-closed

Implemented `TODO-004` without adding first-party app-level admin auth. Fleet
and worker admin static serving now fails closed on non-loopback binds unless
the admin bundle is disabled or the operator explicitly acknowledges an
external auth layer with `AIWORKER_ADMIN_EXTERNAL_AUTH=1`.

Changes include a shared admin exposure guard, gateway startup enforcement,
`aiworker serve --host`, `AIWORKER_WORKER_HOST`, worker-side enforcement before
`Bun.serve`, focused guard/config/CLI tests, and updated public deployment docs.
This is not a login/session system; Logto or another identity layer remains a
future integration.

Verification passed: focused fail-closed tests, workspace typecheck, lint,
workspace tests, root build, and `git diff --check`.

## 2026-04-29 03:56 [cleanup] QA review issues closed

Closed remaining review-state QA discovery subtasks and superseded split-lane
workers after confirming their findings were already incorporated into
`QA-001` and the merged `PLAN-034` repair batch. `TODO-004` / `kz12xf5k`
remains in review because it is a pending proposal decision, not a merged
repair.

## 2026-04-29 03:41 [merge] PLAN-034 — reviewed 0.4.4 repairs merged

Merged `bkd/lc9ls9zp` into `main` as `05762a4`
(`fix: merge reviewed 0.4.4 repairs`). The merge carried the green-reviewed
`0.4.4` repair/optimization integration for CLI/gateway/runtime, Web UI/build,
storage, core safe-env handling, user-facing docs, and regression tests.

Pre-merge conflict checking found no conflicts. The current `main` agent and
Serena configuration was preserved; `TODO-004` remains excluded and pending
proposal approval.

Post-merge verification passed: root typecheck, lint, build, workspace tests,
CLI `smoke:aiworker-run`, CLI `smoke:aiworker-fleet`, and Web `smoke:e2e`.
Merged BKD implementation/audit/coordinator issues were moved to `done`;
proposal-only `TODO-004`, superseded split workers, and the active parent issue
remain open.

## 2026-04-28 22:20 [dispatch] PLAN-034 — integration branch merge-ready

Final audit for the reviewed `0.4.4` repair/optimization integration returned
green. Integration branch `bkd/lc9ls9zp` at commit `897d15c` is merge-ready and
recommended for parent-main merge if accepted. The branch integrates reviewed
CLI/gateway/runtime, Web/UI/build, storage, core safe-env, user-facing docs,
and test reliability repairs while excluding `TODO-004`, child issue PMA docs,
and `docs/changelog.md`.

Verification reported by the integration worker covered frozen install,
focused CLI/gateway/storage/Web gates, workspace concurrent tests, stress
tests, root typecheck/lint/build, smoke tests, 390x844 screenshot checks, and
post-run residue scans. Final audit found no P0/P1/P2 blockers.

Residual human-review risks: future detached daemon-style tests still need
explicit daemon-stop cleanup, systemd behavior still needs live user/system
scope validation across target distros, Vite chunk-size warnings remain
non-fatal, Web mobile layout still needs final human visual acceptance after
merge/deploy, and safe Git env intentionally preserves Git SSH/askpass behavior
while filtering AIWorker/token-like secrets.

## 2026-04-28 21:49 [dispatch] PLAN-034 — split-lane integration active

Coordinator `akif8ehr` split the integration batch into CLI/gateway/runtime
worker `yg3l8xva` and Web/UI/build worker `o599yeb9`. The earlier all-in-one
worker `lc9ls9zp` exited cleanly as superseded. Replaced cron `wjxil9uj` with
`QA-001-PLAN-034-split-poll` (`tigirxz7`) so follow-up monitoring tracks the
actual topology.

## 2026-04-28 21:47 [dispatch] PLAN-034 — audit rework and cron safety net

Rejected the first `kq6e22bw` audit run as red because it did not produce the
required risk report. Moved it back to `working` with rework instructions and
created BKD cron `QA-001-PLAN-034-poll` (`wjxil9uj`) to follow coordinator
`akif8ehr` every 30 minutes during the integration batch.

## 2026-04-28 21:45 [dispatch] PLAN-034 — integration workers started

Started BKD coordinator `akif8ehr`, integration worker `lc9ls9zp`, and
read-only audit worker `kq6e22bw`. The implementation lane will merge reviewed
repair/optimization worktrees into one merge-ready integration worktree, while
the audit lane checks reviewed outputs and merge risks. `TODO-004` remains
proposal-only. No source fixes were made in the parent session.

## 2026-04-28 21:41 [dispatch] PLAN-034 — integrate 0.4.4 repairs and optimizations

Started a BKD integration dispatch for reviewed `0.4.4` repair and optimization
worktrees. Coordinator: `akif8ehr`. The batch exists to merge and verify
overlapping review branches before any main-branch merge. No source fixes were
made in the parent session.

## 2026-04-28 21:15 [QA] Baseline 0.4.4 BKD issue moved to review

Moved the original baseline BKD issue `veyrxhkc` to `review` after posting the
baseline validation summary and extended QA follow-ups. It was not moved to
`done`; follow-up implementation work remains in separate review issues.

## 2026-04-28 21:13 [QA] QA-001 built CLI bundle smoke passed

Ran a black-box smoke against `apps/cli/dist/aiworker.js` after the root build.
Evidence:
`/home/ben/.codex/memories/aiworker-qa001-evidence/bundle-cli-smoke-2113.log`.
Version, project init, scope, and `run --message hello --dry-run` all exited 0.

## 2026-04-28 21:12 [QA] QA-001 workspace-concurrent test passed on rerun

Re-ran parent workspace-concurrent `bun run --filter '*' test`. Evidence:
`/home/ben/.codex/memories/aiworker-qa001-evidence/workspace-concurrent-test-2111.log`.
This run exited 0. `BUG-032`/`BUG-033` remain open for review because an earlier
reliability loop reproduced timeout and dangling-process signals.

## 2026-04-28 21:11 [QA] QA-001 root check and build passed

Re-ran root `bun run check` and `bun run build` after the extended QA
campaign. Evidence:
`/home/ben/.codex/memories/aiworker-qa001-evidence/root-check-build-2109.log`.
Both commands exited 0; existing Web/Vite/chunk warnings remained unchanged.

## 2026-04-28 21:08 [QA] QA-001 low-level package breadth passed

Ran additional package tests for shared, fs-layout, storage-sqlite,
gateway-proto, and api packages. The redacted evidence log is
`/home/ben/.codex/memories/aiworker-qa001-evidence/package-breadth-2108.log`.
All commands exited 0; no new bug was recorded.

## 2026-04-28 21:06 [QA] QA-001 CLI black-box matrix passed

Ran an isolated CLI command matrix under a temporary HOME/project and stored the
redacted log at
`/home/ben/.codex/memories/aiworker-qa001-evidence/cli-blackbox-matrix-2106-rerun.log`.
The run covered `init`, `scope`, `config-show`, invalid `config-set`,
`sessions`, and `schedule` CRUD success/failure paths. Final status was 0; no
new bug was recorded.

## 2026-04-28 21:03 [QA] QA-001 extended parent soak passed

Ran a bounded parent-session soak and stored the log at
`/home/ben/.codex/memories/aiworker-qa001-evidence/extended-soak-2101.log`.
The run repeated CLI dry-run/fleet smokes, gateway protocol smoke, gateway
tests, and core tests three times, then ran Web size report, Web tests, and Web
production build/CSS utility checks. All commands exited 0. Existing Web
Vite/happy-dom warning noise remained unchanged. BKD follow-up state was also
normalized so completed worker outputs remain in `review` until human review.

## 2026-04-28 20:52 [QA] Remote 0.4.4 health and PATH diagnostic repeated

Repeated a read-only remote health/version check with sensitive identifiers
omitted from PMA records. The gateway service was active, `/health` returned
`ok=true`, explicit AIWorker CLI path reported `aiworker/0.4.4`, and Bun global
listed `@zonease/aiworker-cli@0.4.4`. Non-interactive shell PATH still did not
resolve `aiworker`, reinforcing `TODO-006`. No source fixes were made.

## 2026-04-28 20:51 [BUG-P2] BUG-034 — Web smoke-e2e stale gateway import

Recorded a new QA finding: `apps/web/scripts/smoke-e2e.ts` still imports the
removed `../../gateway/src/index` path and exits 1 before running the loopback
Web/gateway protocol smoke. The current gateway module lives under
`packages/gateway`. `web-quality shared-cycles` passed separately. No source
fix was made in the parent QA session.

## 2026-04-28 20:49 [QA] BUG-030 Worker admin screenshots persisted

Captured Worker admin overview/chat screenshots from a local Worker bundle
preview and stored them under
`/home/ben/.codex/memories/aiworker-qa001-evidence/`. The 390x844 captures
confirm the Worker shell also keeps the fixed sidebar and pushes main content
off-screen; desktop comparison remains usable. No source fixes were made.

## 2026-04-28 20:45 [QA] QA-001 reliability loop reproduced workspace flake

Added a parent QA reliability loop log under
`/home/ben/.codex/memories/aiworker-qa001-evidence/`. CLI smoke pairs passed
5x, Web test/build passed, and workspace-concurrent tests reproduced
`BUG-032`/`BUG-033` with CLI/Core timeout failures plus a `killed 1 dangling
process` signal. Immediate focused reruns of the failed CLI/Core files passed,
and cleanup checks found no lingering gateway process or recent AIWorker temp
gateway/smoke directories. No source fixes were made.

## 2026-04-28 20:41 [QA] QA-001 BKD Codex watchdog applied

Recorded the BKD follow-up heuristic for Codex-backed QA work: inspect
`review + running` issue logs and only wake tasks that lack a final report or
are visibly mid-task. `TODO-005` (`jfmsr8wc`) was woken and moved back to
`working`; `TODO-004` (`kz12xf5k`) and `TODO-006` (`3k7sbl3h`) were left in
review after final reports; `TODO-001` (`2i506owq`) and `BUG-030` (`2q45cah8`)
were woken and returned to `working` because their logs showed active cleanup
or reopened scope after entering review. No source fixes were made.

## 2026-04-28 20:30 [QA] QA-001 evidence path normalized

Recorded the final regenerated evidence path for `BUG-029` and `BUG-030`:
`/home/ben/.codex/memories/aiworker-qa001-evidence/`. The directory now keeps
redacted gateway start outputs, `/health` outputs, gateway log, HTTP probe
outputs, and Fleet admin screenshots; temporary credential/state artifacts were
removed. No source fixes were made.

## 2026-04-28 20:29 [QA] QA-001 sequential reliability gates passed

After recording `BUG-029`, `BUG-030`, and `BUG-014`, sequential reliability
gates all exited 0: `bun run typecheck`, `bun run lint`, `bun run build`, and
`bun run --filter '*' test`. Output still included Vite 8
deprecation/chunk-size warnings and expected negative-path test logs, but no
command failed. No source fixes were made.

## 2026-04-28 20:24 [QA] QA-001 late subtask reports integrated

Integrated late UI/UX, black-box, and reliability reports from the extended
`0.4.4` validation campaign:

- widened `BUG-030` to cover both Fleet and Worker admin mobile layout
  overflow;
- expanded `BUG-031` with cross-command gateway URL evidence;
- added `BUG-032` for workspace-wide concurrent test flakiness;
- added `BUG-033` for gateway process cleanup leaks after timeout paths;
- added `TODO-001` through `TODO-006` for command copy, CLI argument/semantic
  cleanup, Web build warnings, admin auth posture, git helper env, and remote
  CLI PATH/version inspection.

No source fixes were made in this session.

## 2026-04-28 20:18 [BUG-P1] BUG-031 — local gateway operator URL points at root

Recorded another `QA-001` black-box finding: `aiworker gateway start` can start
locally after the fleet DB parent exists, but it persists `ws://localhost:<port>`
instead of `ws://localhost:<port>/ws`. Follow-up operator commands such as
`fleet list` then fail the WebSocket upgrade against `/` even though `/health`
is healthy. No source fix was made in this session.

## 2026-04-28 20:15 [BUG-P1] BUG-029 / [BUG-P2] BUG-030 — 0.4.4 extended QA findings

Recorded two follow-ups from the unattended `QA-001` validation campaign:

- `BUG-029`: `aiworker gateway start` fails from a clean cwd when the default
  `./data/fleet.db` parent directory does not exist. The same local gateway
  starts and returns `/health` 200 when `AIWORKER_FLEET_DB_PATH` points at a
  temp DB file.
- `BUG-030`: Fleet admin static assets and desktop rendering are healthy, but
  the mobile 390x844 viewport is unusable because the fixed `w-60` sidebar
  compresses main content and causes text/control overflow.

No source fixes were made in this session; both findings were recorded for BKD
dispatch.

White-box review also reconfirmed existing `BUG-014` with 153 focused tests
passing, then dispatched it to BKD issue `q7s4bay9` with added notes on
portable systemd `ExecStart` rendering and restart behavior after unit changes.

Late QA reports also recorded and dispatched:

- `BUG-031`: local `gateway start` persists a root WebSocket URL instead of
  `/ws`, causing follow-up operator commands to fail upgrade.
- `BUG-032`: workspace-wide concurrent test execution flakes even when
  isolated package/focused reruns pass.
- `BUG-033`: timed-out CLI/gateway integration tests can leave gateway
  processes and credential-bearing temp directories behind.
- `TODO-001` through `TODO-006`: Web command copy, CLI malformed-input
  semantics, Web build warnings, admin auth posture, git helper env policy,
  and remote CLI PATH/version inspection.

## 2026-04-28 20:03 [progress] QA-001 — extended 0.4.4 validation started

Started an unattended record-only validation campaign for `0.4.4`.

- Baseline release validation already passed local gates, CLI smoke scripts,
  remote gateway health, fleet Web static smoke, local Codex worker OTP
  enrollment, explicit/default chat continuity, `/new` reset, and session
  metadata checks.
- The expanded campaign will cover reliability loops, black-box CLI/gateway
  behavior, white-box inspection, and Web UI/UX smoke.
- This session is intentionally not implementing fixes; confirmed findings
  should be recorded as PMA tasks and dispatched through BKD follow-ups.

## 2026-04-28 19:19 [progress] REL-001 — 0.4.4 published

Published `@zonease/aiworker-cli@0.4.4`:

- Local gates passed: typecheck, tests, lint, root build, CLI smoke for
  `aiworker run`, and CLI smoke for fleet presence.
- The tag-triggered GitHub release workflow succeeded for `v0.4.4`, including
  npm publish, standalone binary compilation, platform tarball packaging, and
  GitHub Release asset upload.
- npm `latest` now resolves to `0.4.4`, and a published-package smoke reports
  `aiworker/0.4.4`.

## 2026-04-28 19:14 [progress] REL-001 — prepare 0.4.4 release

Started the `@zonease/aiworker-cli@0.4.4` patch release:

- npm latest is currently `0.4.3`, and `0.4.4` is not published yet.
- The release contains the accepted gateway chat id continuation fix, the Web
  Tailwind utility generation fix, and the reusable fleet test workflow skill.
- Local npm auth is unavailable, so the preferred publish path is the existing
  tag-triggered GitHub release workflow.

## 2026-04-28 19:10 [BUG-P1] BUG-028 — Web Tailwind utilities restored

Fixed the Web UI CSS bundle generation bug:

- `apps/web/src/shared/styles/globals.css` now explicitly registers the Web
  `src` tree with Tailwind v4 source detection, covering the fleet, worker, and
  shared UI code when Vite builds with `root: apps/web/{fleet,worker}`.
- `scripts/web-quality.ts` gained a `css-utilities` check that fails if the
  built fleet or worker CSS misses representative selectors used by the app
  shell and shared UI components.
- `@zonease/aiworker-web` build now runs that CSS check after producing both
  production bundles.
- Rebuilt Web CSS grew from the broken 6111-byte base/theme-only bundle to a
  38320-byte CSS bundle containing utilities such as `.flex`,
  `.min-h-screen`, `.rounded-md`, `.p-6`, `.border-r`, `.bg-background`, and
  `.text-foreground`.
- `@zonease/aiworker-cli` build copies the corrected CSS into
  `apps/cli/dist/web/{fleet,worker}` for npm publish packaging.

Verification passed: Web build, Web CSS utility check, CLI build/package copy,
root lint, and Web Vitest suite. Vitest still prints happy-dom AbortError
teardown noise, but exits successfully with 37 passing tests.

## 2026-04-28 19:02 [BUG-P1] BUG-027 — gateway accepted chat ids are reusable

Fixed the gateway chat continuation bug recorded during the 0.4.3 fleet smoke:

- Worker gateway-client chat handling now treats `gw:` conversation ids as
  already-normalized accepted ids and reuses them unchanged instead of wrapping
  them again as `gw:conv:<id>`.
- Explicit non-prefixed operator ids keep the existing `gw:conv:<id>` mapping.
- Gateway-origin worker bus events now carry `gatewayConversationId`, and the
  gateway subscriber uses that user-facing id for streamed chat/agent event
  payloads while preserving the internal worker `conversations.id` locally.
- Added regressions for omitted-id reuse, explicit accepted-id reuse, and
  streamed event id coherence.

Verification passed: focused core tests, changed-file ESLint, core typecheck,
and full `@zonease/aiworker-core` tests. The live test-server fleet to local
Codex worker e2e remains an external operator verification step.

## 2026-04-28 18:56 [BUG-P1] BUG-028 — Web UI CSS bundle misses Tailwind utilities

Recorded a Web UI packaging/build bug found while checking the test-server
fleet admin UI for `@zonease/aiworker-cli@0.4.3`:

- Public `/admin/` static routing is no longer the suspected cause: the gateway
  serves the fleet CSS asset and the packaged asset exists on the test server.
- The packaged CSS is only 6111 bytes and contains Tailwind base/theme output
  without representative utility selectors such as `.flex` or
  `.bg-background`.
- Local fleet and worker build outputs show the same 6111-byte CSS shape, so
  the issue is reproducible from the repository build output.
- Root-cause candidate is Tailwind v4 source detection missing `apps/web/src`
  when Vite builds with `root: apps/web/{fleet,worker}` and the entry imports
  app code from `../src/...`.
- Tracked as `docs/task/BUG-028.md`; no implementation has been started.

## 2026-04-28 18:45 [BUG-P1] BUG-027 — gateway chat accepted id continuation gap

Recorded a session bug found during the `@zonease/aiworker-cli@0.4.3`
test-server fleet smoke:

- A local Codex worker joined the upgraded 0.4.3 test fleet and passed
  explicit `--conversation-id` continuity, Codex native binding persistence,
  session status, and `/new` reset checks.
- The default `aiworker chat` path still returns an accepted conversation id
  that cannot be passed unchanged to the next `chat.send` call. Reusing it
  wraps the id again as `gw:conv:<id>`, creating a new worker-side session.
- Tracked as `docs/task/BUG-027.md`; no implementation has been started.

## 2026-04-28 18:23 [BUG-P1] BUG-026 — Codex native session capability negotiation

Release target: `@zonease/aiworker-cli@0.4.3`.

Fixed a release-blocking Codex worker e2e failure found while validating the
FEAT-037 session control plane against a test-server fleet:

- Codex executor now advertises `capabilities.experimentalApi=true` during
  app-server `initialize`, which current Codex CLI requires before accepting
  persisted native thread history.
- Added focused regression coverage to ensure the current protocol path keeps
  the capability negotiation when starting native thread bindings.
- Real fleet e2e passed after the fix with a remote fleet gateway and local
  Codex worker: same `conversation-id` retained continuity, absent and stale
  native bindings recovered from worker.db transcript fallback, and `/reset`
  started a fresh session.

## 2026-04-28 17:33 [progress] FEAT-037 S5 — session status and maintenance surfaces

Implemented S5 only for the OpenClaw-style worker session control plane:

- Added shared safe session status DTOs that report session key, active
  conversation/session id, route metadata, lifecycle timestamps, reset
  reason/time, context counters, compaction count, memory-flush state, and
  redacted engine binding summaries.
- Added bounded worker API status routes under `/api/worker/sessions` plus
  closed transcript maintenance at
  `/api/worker/sessions/maintenance/closed-transcripts`.
- Added local CLI commands: `aiworker sessions list`,
  `aiworker sessions show <sessionKey>`, and
  `aiworker sessions maintenance`.
- Maintenance defaults to dry-run and requires explicit `apply`; it only targets
  closed conversations that are no longer referenced by
  `session_entries.currentConversationId`.
- No schema migration, UI redesign, release publishing, fleet/worker e2e, or
  deployment automation was added.

## 2026-04-28 16:38 [progress] FEAT-037 S4 — engine-native session bindings

Implemented S4 only for the OpenClaw-style worker session control plane:

- Added a generic native binding contract on executor runs:
  `AgentRunInput.engineBinding` in, `AgentEvent.engine_binding` out.
- Orchestrator now reads the binding for `config.executor.engine` from
  `session_entries.engineBindings` and persists executor updates back to the
  same JSON field.
- Codex current app-server uses `thread/resume` and recovers stale bindings by
  clearing the cached binding and starting a fresh thread with the DB-rendered
  prompt. Legacy Codex stays on DB prompt fallback.
- Claude Code and Cursor use native CLI `--resume` session ids and refresh the
  stored binding from streamed `session_id` values.
- No schema migration, status/API/UI surface, expiry policy, or maintenance
  cleanup was added.

## 2026-04-28 11:51 [BUG-P1] BUG-025 — Codex session continuity and reset controls

Release target: `@zonease/aiworker-cli@0.4.2`.

Fixed the Codex worker "fresh session every turn" behavior found during
test-server fleet e2e:

- Codex executor now sends the full worker history window to both legacy
  `newTurn` and current `turn/start`, so worker.db remains the authoritative
  conversation source.
- Gateway `chat.send` now recognizes `/new` and `/reset`; reset commands close
  the current worker conversation for the same chat key and start a fresh one.
- Added focused tests for Codex request payload history and reset conversation
  rotation.
- Real fleet e2e passed after the final build: same `conversationId` remembered
  and returned `MEMKEY-PLAN027B-CERULEAN`; `/reset ...` then returned
  `UNKNOWN`.

## 2026-04-28 10:40 [BUG-P1] BUG-024 — Codex app-server protocol compatibility

Fixed the Codex executor failure found during the `v0.4.0` release e2e test
with a local Codex worker joined to the test-server fleet:

- Codex executor now keeps legacy `thread_start` / `newTurn` support and falls
  back to current `thread/start` / `turn/start` when current Codex CLI rejects
  the legacy request.
- Current Codex notifications such as `item/agentMessage/delta`,
  `thread/tokenUsage/updated`, and `turn/completed` now normalize into shared
  `AgentEvent`s.
- Codex default model metadata now uses `gpt-5.5`, matching the current Codex
  CLI model list for the local ChatGPT-backed account.
- Added focused tests for both legacy and current Codex app-server protocols.

## 2026-04-28 10:02 [BUG-P1] BUG-023 — 0.4.0 release readiness blockers

Fixed release blockers found while reviewing `v0.3.0..HEAD` for publish:

- Bumped `@zonease/aiworker-cli` to `0.4.0` because `0.3.0` is already the npm
  `latest` version.
- Brand-new project `aiworker init` now preserves explicit
  `AIWORKER_MASTER_KEY` / `INTERNAL_SHARED_SECRET` values so subsequent commands
  can decrypt the same `worker_identity` row.
- CLI publish packaging now copies only fresh `fleet` and `worker` Web bundles
  into `dist/web/` and clears stale bundled assets first.
- Root `bun run build` now sequences API, Web, and CLI bundle output to avoid
  concurrent writes to `apps/web/dist`.
- GitHub Release compiled binary assets are now packaged as tarballs containing
  the binary plus sibling `web/`, `drizzle/`, and `README.md` files.

## 2026-04-28 09:25 [BUG-P1] BUG-022 — Web admin SPA mount paths and deep links

Fixed two PLAN-022 Web UI runtime gaps:

- Fleet UI now creates its TanStack Router with the inferred `/admin` basepath
  in production, so the gateway-hosted `/admin/*` bundle has route matches.
- Fleet and Worker dev chooser mounts remain valid at `/fleet/*` and
  `/worker/*`.
- Production Web builds now emit `/admin/assets/...` and `/admin/favicon.svg`
  URLs, so nested admin deep-link reloads load assets from the stable admin
  root instead of a route-local `assets/` path.
- Added route bootstrap coverage for production and dev mount paths.

Verification: Web lint, typecheck, tests, build, shared cycle check, size
report, root lint, routeTree mount checks, and build output inspection all pass.

## 2026-04-28 08:55 [BUG-P1] BUG-021 — project-scope CLI placement hardening

Fixed the PLAN-023 Phase A runtime gap where the CLI side-effect bootstrap wrote
the derived fallback home back into `AIWORKER_HOME`, causing `aiworker init` to
treat user-default scope as an explicit override and skip project layout
creation.

Changes:

- `apps/cli/src/lib/bootstrap.ts` no longer writes derived scope into
  `AIWORKER_HOME`; only operator-provided env remains explicit.
- `init` is excluded from side-effect bootstrap and now owns dotenv bootstrap for
  global, explicit, existing-project, and brand-new project modes.
- `scope` is excluded from side-effect bootstrap and now writes deterministic
  stdout, so it remains a safe non-mutating diagnostic command.
- Removed the duplicate unscoped `bootstrapDotenv()` call in the CLI entrypoint.
- Added real CLI subprocess smokes with isolated `HOME` covering project init,
  no user-scope fallback, project scope diagnostics, non-mutating scope, and
  `init --force`.

Verification:

- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- manual isolated CLI smoke for pre-init `scope`, fresh project `init`, and
  post-init project `scope`.

## 2026-04-28 08:35 [progress] REFACTOR-010 — PLAN-022 Phase 5 dark mode slice

Completed the conservative Phase 5 slice for Web UI capability completion.

- `apps/web/src/shared/stores/theme.ts` now drives theming through
  `data-theme` / `data-theme-preference` and keeps fleet / worker selections in
  separate localStorage keys.
- `apps/web/src/shared/components/theme-toggle.tsx` adds the shared icon-only
  theme toggle used by both fleet and worker shells.
- `apps/web/src/shared/styles/globals.css` moves the Tailwind dark variant and
  dark token overrides from `.dark` to `data-theme="dark"`.
- Added tests covering scoped hydration, scoped persistence, and the toggle
  cycle.

Deferred optional Phase 5 items remain i18n, cross-worker cron / approval
dashboards, and gateway proto expansion for broader cross-worker operations.

## 2026-04-27 19:30 [progress] PLAN-023 (PLAN-021 Phase A) — Worker 项目级落位收尾

落地 `<project>/.aiworker/` 三层 scope 解析与 CLI 项目级 init。承接 PLAN-021 master plan 的 Phase A，为后续 Phase B/D/C/E（上下文连贯 / skill+MCP per-worker / 三态记忆 / 自演化闭环）打底。

**REFACTOR-011 — fs-layout scope 解析 + project layout API**
- `packages/fs-layout/src/index.ts` 加 `resolveAiworkerScope(opts)` / `resolveProjectRoot(cwd)` / `ensureProjectAiworker(projectRoot)`，优先级 `cli-flag > env > project-detect > user-default`，遇 git boundary 即停（不跨 monorepo / repo 边界）
- `resolveWorkerHome` / `resolveBrainHome` / `resolveWorkspacesRoot` 在 project 模式下退化为「无 `workers/<id>/` 中间层」；user / explicit 模式保持 `<home>/workers/<id>/...`，systemd / docker 部署零回归
- `ensureWorkerHome` 在 project 模式变 no-op（persona docs 由 `ensureProjectAiworker` 负责）
- `local/.gitignore = "*\n!.gitignore\n"` + `.aiworker/.gitignore = "local/\n"` 默认拦截 worker.db / .env / workspaces 入 git，persona / skills / memories 默认入 git（团队共享 agent 人格）
- 新增 16 单测覆盖 explicit/env/project/user 优先级、git boundary、ensure 幂等、ensureWorkerHome project no-op

**FEAT-036 — CLI `aiworker init` / `aiworker scope`**
- `apps/cli/src/lib/bootstrap.ts` scope-aware：先 `resolveAiworkerScope()` 决定 home，再传给 `bootstrapDotenv({ home })`
- `aiworker init` 默认 project（cwd 必须 git repo，否则报错引导 `--global` / `--force`）；brand-new 路径 `delete process.env.{AIWORKER_HOME, AIWORKER_MASTER_KEY, INTERNAL_SHARED_SECRET}` 后让 fs-layout 自然 project-detect，并在 `<project>/.aiworker/local/.env` re-mint 项目独立 master key
- 新增 `aiworker scope` 诊断命令（参 `git config --list --show-origin`）：box 显示当前 scope / home / source / projectRoot + layout 文件存在性
- E2E 验证 7 场景全过：user-default / brand-new project init / idempotent re-init / scope 显示 / non-git repo 报错 / `--global` / `--force`

**6 项 PLAN-021 决策**（master plan 批准时定盘）已写入 PLAN-021 批注：dmScope 默认 `per-channel-peer`、E1 半自动、MCP 合并到 orchestrator tool registry、Engine credential 全 user 级、Phase 顺序 A→B→D→C→E、master 批准后分批起子 PLAN。

**下个步骤**：先完成 PLAN-024 / BUG-021 Phase A hardening；Phase B（Conversation router dmScope + auto-compaction + claude-code 退 replay-user-messages 模式）后续另起子计划。

## 2026-04-27 16:42 [release] `@zonease/aiworker-cli@0.3.0` — 代码审查批 P0+P1+P2 收官

10 commit `648adf5..f54c0c6` 一次性发到 npm。汇总：

**P0 安全（worker / gateway / channels 三处暴露面）**
- `BUG-015` worker `/api/worker/{orchestrator,evolution,events}` 缺 bearer-auth → `app.use('/api/worker/*', ...)` 顶层守门 + 移除 management 内部冗余中间件 (`03edf9c`)
- `BUG-016` web channel webhook 无验签 → web binding 加 `inboundToken`，adapter 用 `timingSafeEqualStrings` 校验 `Authorization: Bearer`，**fail-closed**（旧 deployments 必须在 dashboard 上设一次 token 才能恢复 web ingest）(`9c56ae1`)
- `BUG-017` Lark `verificationToken` + WhatsApp `verifyToken` 普通 `===` → 改 `timingSafeEqualStrings` (`7ba3886`)

**P1 安全 / 防御**
- `BUG-018` CLI engine 子进程透传整段 `process.env` → 新建 `safe-env.ts` 白名单（`PATH` / `HOME` / `LANG` / `NODE_*` / `CLAUDE_*` / `CODEX_*` / `CURSOR_*` / `GEMINI_*` / `QWEN_*`）+ 黑名单（`AIWORKER_*` / `INTERNAL_*` / `WORKER_*` / `*_TOKEN` / `*_SECRET` / `*_API_KEY`），4 engine + cli provider 全部接入。**`--dangerously-skip-permissions` 在 args 不在 env，未触碰** (`f0190ee`)
- `BUG-019` gateway loopback bypass fail-closed → `assertGatewayBindIsSafe()` 启动期检查：non-loopback bind + 无 `INTERNAL_SHARED_SECRET` 直接 throw (`a717fec`)
- `BUG-020` gateway WS 缺 frame size + 限频 → `maxPayloadLength=1MiB` + `idleTimeout=120s` + `ConnectRateLimiter`（IP 维度，60s 内 ≥5 次 connect 失败短拒，`gateway.connect.brute_force_blocked` audit 留痕）(`6285709`)

**P2 性能 / 健壮性**
- `REFACTOR-005` worker.db 7 索引（messages.conversationId / conversations 复合 / cron_jobs 复合 / agent_tasks.createdAt / evolution_observations.noticedAt / execution_logs.conversationId / conversations.lastActiveAt）+ migration `0003_rare_cloak.sql` (`64843be`)
- `REFACTOR-006` orchestrator API zod 入参（prompt 限 8000 字符）+ `WorkerConfig.orchestrator.maxHistoryMessages`（默认 20，1..200），run() 改用 `loadRecentMessages` 滚动窗口 (`9860615`)
- `REFACTOR-007` 杂项 4 修：`WorkerEventBus` listener 异常 `consola.warn` 不再静默；Lark `tokenCache` 加 `disposeTokenCache` 走 runtime.dispose；`FleetPersistence.countRegisteredWorkers` 改 SQL `count()` + listRegisteredWorkers 改 `orderBy desc`；`secrets/:key` 路径加 `[\w.-]{1,128}` regex (`6447415`)

**docs**
- `f54c0c6` `docs/task/index.md` 补 BUG-015 / BUG-016 / BUG-018 / REFACTOR-005 4 条 sub-issue 创建时漏的索引行
- 同 commit 开 `REFACTOR-008`（baseline lint debt 清零，P3，留作后续）

**测试基线**：typecheck 9 包全绿；shared 18 / proto 19 / storage 9 / cli 34 / gateway 112 / core 427 / api 57 / web 24 = ~700 pass / 0 fail；ESLint 60 errors 与 release 前 baseline 同等（package.json sort-keys + cli process global，与本批无关，REFACTOR-008 跟进）。

**升级注意**：
- web channel 旧部署的 `worker_config.configJson` 没有 `inboundToken`，升级后 web webhook 立即 401。运维必须在 dashboard `web channel → Generate inboundToken` 后 reload 才能恢复 ingest。
- gateway 启动 env：测试服 / 公网部署如果绑 `0.0.0.0` 但漏配 `INTERNAL_SHARED_SECRET`，新版直接拒启动。修复：要么绑 `127.0.0.1` 让 Caddy 反代，要么显式设 `INTERNAL_SHARED_SECRET`。
- worker 进程 env：runtime CLI engine 子进程不再继承敏感 env。如果 engine 之前依赖 `AIWORKER_*` / `*_TOKEN` 之类自定义 env（非典型），改在 `executor.overrides.env` 里显式声明。

## 2026-04-27 [BUG-P1] BUG-019 Gateway 启动期 fail-closed 断言（loopback bypass）

代码审查（root issue `nnid9urk`）发现的 P1 安全问题落地修复。

**根因**：`packages/gateway/src/auth/loopback.ts` `isLoopbackAddress()` + `auth/token.ts`
`authorizeConnection()` 对 loopback 远端无条件放空 token。运维若把 gateway 绑到
`0.0.0.0` 又忘配 `INTERNAL_SHARED_SECRET`，任何能 reach 端口的人都能以 operator
身份调 `workers.list` / `enroll.approve` / `token.rotate`。BUG-007 的 Caddy
basicauth 是运维侧 fail-closed，但代码侧没有兜底。

**修复**（短期断言；不修反代后 loopback 欺骗的根因，那留 follow-up）：

- `packages/gateway/src/auth/loopback.ts` 新增 `assertGatewayBindIsSafe({host,
  internalSharedSecret})` —— 非 loopback bind + 没 secret → throw 带修复提示
  （绑 `127.0.0.1` + Caddy basic-auth ‖ 设 `INTERNAL_SHARED_SECRET`）。
- `packages/gateway/src/server.ts` `startGatewayServer()` 入口在 `Bun.serve()` 之前
  调用断言；CLI 入口 `runGatewayStartForeground()` 已有 try/catch，错配会落
  `consola.error` + exit 1。
- `packages/gateway/test/auth.test.ts` 八条新用例覆盖 loopback bind ± secret /
  `0.0.0.0` ± secret / `::` IPv6 any / 公网 IP / 错误信息文案。

不在本 commit 范围（留独立 issue）：

- `X-Forwarded-For` 检查或 unix socket 拆 loopback / 公网 channel —— 这才是反代
  欺骗的真正修复，比断言改造大得多。

任务文档：`docs/task/BUG-019.md`。

## 2026-04-27 13:35 [BUG-P0] BUG-017 修复 — Lark / WhatsApp webhook token 改用常量时间比较

**违反 CLAUDE.md 关键不变量**："bearer / 共享 token 比较一律 `timingSafeEqualStrings`"。代码审查（BKD root `nnid9urk`）发现两处 webhook 验证仍用普通 `===` / `!==`：

- `packages/core/src/worker/channels/adapters/lark.ts:161` — Lark `verificationToken`。未加密路径**只**靠这个 token 把关，跨网时序攻击者可推算后伪造 Lark 事件、注入虚假用户消息。
- `apps/api/src/worker/channels/routes.ts:26` — WhatsApp Cloud API `GET /webhook` 订阅挑战的 `verifyToken`。推算成功后可在 Meta 控制台层完成订阅劫持，间接劫持 webhook 交付（POST 路径仍有 HMAC 兜底，风险次于 Lark）。

What shipped:

- 两处都改成 `timingSafeEqualStrings(actual, expected)`：core 内部直接 import `../../secrets/crypto`；apps/api 走 `@zonease/aiworker-core` 已 re-export（与 `apps/api/src/worker/management/bearer-auth.ts` 同款用法）。
- `packages/core/src/worker/channels/adapters/lark.test.ts` 增 2 case：同长度但内容不同（强制 timing-safe compare 分支）+ header.token 缺失；mismatched-token case 改成 message exact-match。
- 新建 `apps/api/src/worker/channels/routes.test.ts` 6 case：subscribe + 正确 token → 200 challenge / 同长度错误 token → 403 / 不同长度错误 token → 403 / 错误 hub.mode → 403 / 缺 verify_token → 403 / whatsapp 未绑定 → 404。

测试基线：core 405 pass、apps/api 38 → **44 pass**（+6）。typecheck + 改动文件 lint 全绿。

**不变量复核**：未引入 transport-coupling（apps/api 通过既有 core re-export 引入，packages/core 不增加 hono 依赖）；未触碰 vault / config-schema / 迁移；行为零差异，纯常量时间路径替换。

## 2026-04-27 13:30 [security] BUG-016 web channel webhook 加 bearer 验签（fail-closed）

P0 安全修复。`/web/webhook` 路由挂在 worker 根、不经 bearer auth；之前 `webAdapter.verify()` 是空实现，任何能访问 worker 端口的人都能 `POST /web/webhook` 注入伪造 envelope，触发 orchestrator → LLM 调用 + 写入 `worker.db.messages`。

修复（方案 A，与 Telegram `webhookSecretToken` 形态对齐）：

- `packages/shared/src/fleet/channel.ts` — web credentials 加 `inboundToken?: string`。
- `packages/core/src/worker/management/config-schema.ts` — zod web 分支放行 `inboundToken: z.string().optional()`。
- `packages/core/src/worker/channels/adapters/web.ts` — `verify` 读 `Authorization: Bearer <token>` + `timingSafeEqualStrings`。**fail-closed**：binding 没有 `inboundToken` / 空串 / 头缺失 / scheme 错 / token 不匹配 → throw → 401。
- `packages/core/src/worker/config/secret-paths.ts` — enumerate / redact / hydrate 三处都覆盖 `inboundToken`，empty-string round-trip 保留语义不变。
- `apps/web/src/features/workers/components/config-editor/channels-section.tsx` — web 分支换成 `SecretField` + `Generate` 按钮（`crypto.getRandomValues` 24 字节 base64url）。
- 测试：`packages/core/src/worker/channels/adapters/web.test.ts` 新增 `verify` 7 个用例；`bun test` 410 pass / `bun run typecheck` 全绿 / `aiworker-web` vitest 24 pass。

向后兼容：旧 `worker.db.worker_config.configJson` 里 `{ channel: 'web' }` 没有 `inboundToken`。读上来 `inboundToken === undefined` → verify fail-closed → 旧部署的 web channel ingest 立即拒绝。这是预期：旧路径就是漏洞，运维必须在 dashboard 上设一次 token 才能恢复。

## 2026-04-27 12:30 [info] Session handoff — open tasks 总览 + 测试服 ops 残留

**本会话主要工作**（已 push 到 `origin/main`，HEAD 当时为 `2bcf99c`，含本条 + 后续 BUG-013/BUG-014 + REFACTOR-004 followups 的 commit）：

- **Git history redact + force push**（用户操作）：移除测试服 IP / aissh server id / 公网域名敏感信息（filter-branch tree-filter + msg-filter）
- **CLAUDE.md 大幅清理**（141 → 79 行，PLAN-013 dashboard 双模过期段全删 + MCP 强制约束放宽）
- **`@zonease/aiworker-cli@0.2.1` 真发 npmjs.com**（含 in-process gateway + bundle drizzle migrations + WORKER_DB_PATH lazy default）
- **测试服 fleet 迁移**：`/opt/aiworker` 源码 systemd → `bun install -g @zonease/aiworker-cli` + 改 unit ExecStart 走 npm-installed binary（in-process foreground）+ Caddyfile `:3000 → :9218` + env 删 `PORT=3000`
- **README 重写**（+216/-167，409 行）：30 秒 demo + ASCII 端到端流程图 + 4 个 LLM executor 配置例子
- **claude-code executor 端到端 demo 实测通过**：本机 worker → 公网 wss → operator approve → config set claude-code → hot-reload v2 → chat 真实 LLM 流式回复

**Closed tasks（本次）**：
- ✅ FEAT-027 GA（npm publish 0.2.0 → 0.2.1）
- ✅ FEAT-030（zero-env quickstart：动态版本 + 默认端口 9217/9218 + 首次启动 mint master key）
- ✅ REFACTOR-004 GA（测试服迁移到 npm cli + Caddy）
- ✅ BUG-011（worker quickstart 强制 env 缺口；与 BUG-012 合并 0.2.1 一并修）
- ✅ BUG-012（cli `gateway start` 假设 monorepo 布局；in-process 重构方案 D 落地，apps/gateway → packages/gateway）

**Open tasks**（下个 session 起点；按 priority 排）：

| ID | P | Title |
|----|---|-------|
| BUG-013 | P2 | `workers.info` / `workers.stop` dispatcher 显式 stub（`aiworker fleet info/stop` 永远失败）— **本 session 新开** |
| BUG-014 | P2 | `aiworker install systemd` 渲染的 unit 缺 `EnvironmentFile` + 全部安全加固（首次部署体验破）— **本 session 新开** |
| BUG-006 | P3 | `reloadRuntime` 串行化没显式 mutex（PLAN-014 时占位） |
| BUG-010 | P3 | runtime log 字串仍含 `aiw` / `aim` / `aim.json`（PLAN-020 rename 残留） |
| FEAT-002 | P3 | Executable skills runtime（sandbox） |
| FEAT-007 | P3 | M:1 channel routing |
| FEAT-008 | P3 | Host-level HA + multi-host fleet |
| FEAT-010 | P3 | Publish registry routes 进 OpenAPI spec |

建议下个 session 优先级：**BUG-013 + BUG-014 一并修发 0.2.2**——两个都是用户首次/常用命令路径上的破口（fleet info / install systemd），都 ~50-100 LOC，可合并一个 commit。BUG-006 / BUG-010 P3 可推迟。

**测试服 ops 残留**（`aissh aiwork`，下次 maintenance 清理；不阻塞）：
- `/opt/aiworker-removed-20260427` 451M（旧 monorepo 源码）
- `/opt/aiworker-new` 29M（cutover 前 staging clone，未用）
- `/opt/aiworker-deploy/` PLAN-016 docker 配置目录
- `/tmp/aiworker-gateway.service.{bak,new}` + `/tmp/Caddyfile.{bak,new}` + `/tmp/gateway.env.{bak,new}` cutover staging（env.* 已 truncate）
- `/var/lib/aiworker/.env` 0 bytes（dotenv-bootstrap 残留）

清理命令清单见 `docs/task/REFACTOR-004.md` § Followups。

**安全提醒**：
- 上次发 0.2.1 用的 npm token 已 shred (`./tmp/npm_token` 已删)，建议 npm 端轮换
- aissh token 在前次 session 末曾失效一次，本次会话末仍有效；如下次 session 报 `未配置认证 Token` → `aissh config set-token <token>`

## 2026-04-27 12:15 [progress] README 重写 + claude-code executor 端到端验证

README.md 大幅清理（+216/-167，409 行）：

- 顶部加 **🚀 30 秒 demo** 章节：完整 ASCII 端到端流程图（worker → wss enroll → operator approve → fleet online → chat dispatch）+ 真实 worker/operator 命令 + 期望 stdout 输出
- 修过期 Stack 描述：`apps/{api,cli,web}` + `packages/{core, gateway, gateway-proto, shared, storage-sqlite, fs-layout}`（apps/gateway 已 REFACTOR-004 迁到 packages/gateway）
- 修 Status 表：CLI 重命名（PLAN-020）/ npm publish（FEAT-027 0.2.1 latest）/ in-process gateway（REFACTOR-004）全部 ✅ GA
- "Worker 配 LLM executor" 段展开 4 例：claude-code（local logged-in `claude`）/ http (OpenAI/DeepSeek 兼容) / acp (gemini/qwen) / codex+cursor+mcp 链接
- 修路径 2/3 命令（`bun apps/cli/src/aiworker.ts ...` → `aiworker ...`）
- 故障排查 4 行替换：删旧 BUG-009 commit hash 引用 + 加 BUG-012 修法（`bun install -g @latest` ≥0.2.1）

**claude-code executor 端到端 demo 实测**：

本机起 worker（`AIWORKER_HOME=/tmp/aiw-demo-claude`），enroll 到测试服公网 wss → operator (loopback) approve OTP `94K3-C94C` → workerId `w_vk7y0qx23cgb` 加入 fleet → operator `aiworker config set ... '{"executor":{"engine":"claude-code","variant":"default"}}'` `--if-match 1` → response `{"version":2,"runtimeReload":"ok"}` → worker log: `i [worker] runtime reloaded to config version 2` → operator `aiworker chat <id> '请用一句话介绍你自己...'` →

```
{"kind":"accepted",...}
{"kind":"agent.thinking","payload":{"chunk":"我是 Claude"}}
{"kind":"agent.thinking","payload":{"chunk":"，由 Anthropic 构建的 AI 助手，目前运行在 **Claude"}}
{"kind":"agent.thinking","payload":{"chunk":" Sonnet 4.6**（`claude-sonnet-4-6`）模型上。"}}
{"kind":"done","payload":{"finishReason":"stop"}}
```

链路：本机 worker → 公网 wss → Cloudflare → Caddy `/ws` → 测试服 in-process gateway 0.2.1 → ForwardTable → worker orchestrator → claude-code executor → 本机 `claude` CLI（用 `~/.claude.json` 已登录 token）→ Anthropic API → stream chunks 回流。验证 hot-reload + claude-code executor + 真实 LLM 响应一气呵成。`finishReason: stop`（不再是 error）。

清理：fleet remove + kill worker process + truncate tmp homes。

## 2026-04-27 11:50 [progress] REFACTOR-004 GA + BUG-011 + BUG-012 完成 — 测试服迁移到 npm cli + in-process gateway

`@zonease/aiworker-cli@0.2.1` 真发到 npmjs.com（shasum `73a715c`，13 files / 0.85 MB unpacked / 234 KB packed，含 dist/drizzle/{fleet,worker} migrations）。测试服 cutover 一气呵成成功：

- `bun install -g @zonease/aiworker-cli@0.2.1` 装到 `/root/.bun/bin/aiworker`
- atomic swap：systemd unit `ExecStart=/root/.bun/bin/aiworker gateway start`（保留 EnvironmentFile + StateDirectory + ProtectSystem 等加固）+ `/etc/aiworker/gateway.env` 删 `AIWORKER_GATEWAY_PORT=3000` + Caddyfile 三处 `127.0.0.1:3000 → :9218`
- `caddy validate` 通过 → reload；`systemctl daemon-reload` + `restart aiworker-gateway` → `systemctl is-active = active`、`/health = {"ok":true,"service":"aiworker-gateway"}`
- gateway 现跑 in-process foreground 模式（journal: `✔ [gateway] listening ws://127.0.0.1:9218/ws` + `✔ gateway 已启动 (foreground) port=9218`）
- `/opt/aiworker` 451M 退役至 `/opt/aiworker-removed-20260427`（保留作 rollback；下次 maintenance 可彻底删）
- prod gateway.env 副本 `/tmp/gateway.env.{bak,new}`（含 master key）truncate 到 0 bytes
- fleet.db 完整保留（`/var/lib/aiworker/fleet.db` 53 KB），`registered_workers` 行数与 cutover 前一致

**BUG-011 + BUG-012 in-process 重构（commit `0490888`，52 files +216/-204）**：

- `git mv apps/gateway → packages/gateway`：gateway 改库形态，加 `exports` map（删 `bin`）；87 tests 全 pass
- `apps/cli` deps 加 `@zonease/aiworker-gateway`，bundle 内嵌 in-process gateway（0.72 → 0.77 MB +50 KB）
- `daemon.ts` 重写：删 `resolveGatewayEntry` / `locateRepoRoot` / `DEFAULT_GATEWAY_WORKSPACE_REL`；spawn 模式改 self-spawn (`process.execPath` + `argv[1]`) + env `AIWORKER_GATEWAY_INTERNAL_FOREGROUND=1` 触发子进程 foreground
- `commands/gateway.ts` 重写 `runGatewayStart`：默认 foreground in-process `import startGateway()` + SIGTERM/SIGINT shutdown handler + `await new Promise<never>(() => {})` 阻塞主进程；`--detach` 走老 daemon 模式
- `aiworker.ts` `gateway start`：删 `--entry` flag，加 `--detach`
- `storage-sqlite/{fleet,worker}/index.ts`：`defaultXxxMigrationsFolder` 用 `resolveMigrationsFolder()` helper（dev `../../drizzle/<rel>` 优先 → bundle `./drizzle/<rel>` sibling fallback）
- `core/config/worker.ts`：`WORKER_DB_PATH` 加 lazy default `<AIWORKER_HOME>/worker.db`
- `build-publish-manifest.ts`：拷 `packages/storage-sqlite/drizzle` → `apps/cli/dist/drizzle`；`files` 加 `"drizzle/"`

REFACTOR-004 / BUG-011 / BUG-012 三任务卡全 closed。后续测试服 update 路径：`bun install -g @zonease/aiworker-cli@latest && systemctl restart aiworker-gateway`，一行结束。

token 安全：`./tmp/npm_token` 用完即 shred，未入 git。建议 npm 端轮换。

## 2026-04-27 12:00 [progress] REFACTOR-004 测试服迁移 cutover 失败 + 开 BUG-012 P1（gateway entry 仓库布局假设）

测试服迁移 cutover 实战阻塞：`bun install -g @zonease/aiworker-cli@0.2.0` 装好后 systemctl restart aiworker-gateway 卡 activating（exit 1）。journal:

```
ERROR  gateway start 失败: gateway 入口未找到。请设置 AIWORKER_GATEWAY_ENTRY 或使用 --entry <path>；
或确保仓库内存在 apps/gateway/src/index.ts。
```

Root cause：`apps/cli/src/aim/daemon.ts::resolveGatewayEntry` 假设 cli 跑在 monorepo 内，walk-up 找 `apps/gateway/src/index.ts` 作为 spawn 目标。npm install 装的 dist tarball 仅含 `aiworker.js + README.md + package.json`，sibling apps 不存在 → 命令无路可走。

**Rollback 完成**（gateway 回 :3000 active + /health OK + fleet.db / 已注册 worker 全部不受影响）：
- systemctl stop → cp /tmp/*.bak 原版 → daemon-reload + start → caddy reload
- 清理 mint 残留：`/var/lib/aiworker/.env` + `/root/.aiworker/.env`（dotenv-bootstrap 自动 mint 的废弃 master key）truncate 0 bytes；`/tmp/gateway.env.{bak,new}`（prod master key 副本）同样 truncate
- bun-installed cli 仍在 `/root/.bun/bin/aiworker`（无害，systemd 不调）

开 `BUG-012 P1` 跟踪——4 修复策略对比（A env workaround / B build-time bundle gateway / C 单独 publish gateway 包 / D in-process 推荐）；短期 workaround = 0.2.1 加 dist/gateway.js + daemon.ts fallback。建议 BUG-011（lazy default）+ BUG-012（gateway entry）二修同 0.2.1 一并发，REFACTOR-004 重跑 cutover 一气呵成。

## 2026-04-27 11:50 [progress] FEAT-027 GA — `@zonease/aiworker-cli@0.2.0` 真发到 npmjs.com

`@zonease/aiworker-cli@0.2.0` 真实 publish 落地（前置：`e485bea` redacted history force push 完成）：

- `bun publish --access public` 从 `apps/cli/dist/` 出包：3 文件 0.73 MB unpacked / 217.71 KB packed，shasum `54e6c3f203e68df60c95f73d50e5e15d588c5cf2`，dist-tags `latest=0.2.0`
- 含 FEAT-030 全部改进：动态版本（`aiworker --version` → `0.2.0`）、默认端口 9217 / 9218、首次启动自动 mint master key 写 `~/.aiworker/.env` chmod 0600
- License MIT、deps none、bin `aiworker`、files `aiworker.js + README.md`
- npm registry 验证：`bunx npm view @zonease/aiworker-cli@0.2.0` 返回正确 metadata，published just now by ben9217

token 安全：`./tmp/npm_token` 用完即 shred，未入 git。建议 npm 端轮换。

REFACTOR-004 阻塞解除（aiworker@0.2.0 可 npm install）；测试服迁移待 aissh token 重新配置后继续。

## 2026-04-27 11:30 [decision] 测试服部署原则收紧——只允许已发布 npm cli + Caddy 反代

用户决策（直引）："测试服务器，除了 caddy 反代外，不再由源码构建，只允许安装或更新，从已发布的 cli 去操作"。

CLAUDE.md "Project Preferences" 替换原"部署优先级 docker compose > docker run > 裸机 + scripts/deploy.ts" 条目为：测试服**只允许** `npm install -g @zonease/aiworker-cli@<version>` + `aiworker install systemd` + Caddy 反代；**禁止** git clone 源码、`docker compose pull` GHCR 镜像、远端 `bun build` / `tsc` 编译。`scripts/deploy.ts` + `ops/compose/*.yml` 仅适用其他场景或保留为参考，不再用于测试服。

开 `REFACTOR-004 P1` 跟踪具体迁移：测试服当前 fleet 跑 `/opt/aiworker/apps/gateway/src/index.ts`（PLAN-016 时 git clone 整 monorepo + systemd `bun ts-entry` 直跑，451M）；目标态 `aiworker gateway start`（npm-installed binary）+ unit 由 `aiworker install systemd` 重渲染。阻塞项：`@zonease/aiworker-cli@0.2.0` 必须先真发到 npmjs.com（待用户授权 + 新 token，旧 token 已要求轮换）。Caddy 端口策略二选一（保留 3000 或与 FEAT-030 默认 9218 对齐），推荐对齐。

## 2026-04-27 11:05 [progress] FEAT-030 e2e 端到端验证 + BUG-011 占位

本机起 worker（`bun apps/cli/dist/aiworker.js serve`，AIWORKER_HOME 隔离 `/tmp/aiw-feat030-localworker`）通过公网 `wss://gateway.example.test/enroll-ws` OTP enroll 到测试服 systemd gateway；测试服 loopback (`ws://127.0.0.1:3000/ws` 空 token bypass) 跑 operator approve OTP `4Q35-2HEM` → fleet `online: true` → `chat` 全链路 NDJSON `accepted` → `chat.message` → `done`（finishReason=error 因 worker 未配 executor，链路本身 OK）。验证 FEAT-030 三件套全部 wire-through。清理已 fleet remove + kill worker + 删 `/tmp/aiw-feat030-localworker`（含 master key）+ 测试服 `/tmp/feat030-op` 删除。

副产品：开 `BUG-011 P3` —— FEAT-030 README 承诺"OTP 路径只需 `AIWORKER_GATEWAY_URL`"实际不成立，`WORKER_DB_PATH` 默认 `/var/lib/aiworker/worker.db` 写不动 + `WORKER_MIGRATIONS_FOLDER` `import.meta.url` 在 bundle 后失效，仍需 4 个 env 才能起。BUG-011 列了 `WORKER_DB_PATH` 加 lazy `<AIWORKER_HOME>/worker.db` + drizzle migrations 拷进 dist 或内嵌为 string array 两条修复路径。

## 2026-04-27 10:50 [progress] FEAT-030 followup — 全仓 3000/3001 → 9217/9218 端口语义统一

用户反馈"只要需要用到端口，就往 9217 后排"——上一轮 FEAT-030 仅改了 schema 默认值，留下大量 compose / Dockerfile / 测试 fixture / 活跃文档仍然引用旧 3000/3001。本次一次性 sweep：

**代码层（影响实际行为）：**
- `Dockerfile` `EXPOSE 3000 3001 → 9217 9218` + 注释更新
- `docker-compose.yml` + `ops/compose/docker-compose.yml`：gateway port `3000:3000 → 9218:9218` + `PORT/AIWORKER_GATEWAY_PORT 3000 → 9218`
- `ops/compose/docker-compose.worker.example.yml`：worker port `3001:3001 → 9217:9217` + `PORT '3001' → '9217'` + advertised baseUrl 注释 → `:9217`
- `ops/compose/docker-compose.supervisor.yml` + `apps/gateway/src/supervisor/service.ts` 注释：`{containerName}:3001 → :9217`
- `scripts/deploy.ts` health check `:3000 → :9218`
- `apps/cli/src/aim/daemon.ts` PORT default `'3000' → '9218'`（gateway daemon entry）
- `apps/cli/src/commands/approvals.ts` 注释默认 → `9217`

**测试 fixture（保持端口语义一致）：**
- `apps/gateway/test/{enroll,enroll-otp-handshake,workers-pair,workers-launch}.test.ts`：所有 `:3001` baseUrl / launchBaseUrlTemplate → `:9217`
- `packages/gateway-proto/test/parse.test.ts` 同上

**活跃文档（反映新现状）：**
- `CLAUDE.md` Caddy 反代描述 `:80 → 127.0.0.1:3000` → `:80 → 127.0.0.1:9218`
- `docs/architecture.md` / `docs/gateway.md` / `docs/deployment.md` / `docs/deployment-public-https.md` 全部 `:3000 → :9218`、`:3001 → :9217`、`AIWORKER_GATEWAY_PORT=3000` → `9218`、`--port 3001` → `9217` etc.

**保留不动（历史决策快照）：**
- `docs/plan/PLAN-001~PLAN-019.md`、`docs/task/BUG-007.md` / `BUG-002.md` / `BUG-010.md` / `FEAT-009.md` / `FEAT-017.md` / `FEAT-024.md` / `docs/changelog.md` 旧条目——这些是当时决策的现场，端口数字是史料。
- `.playwright-mcp/page-*.yml` 测试快照——一次性 capture，无需追溯。

**生产部署迁移 run book**（次次部署前 must do）：
1. 改 prod `/etc/aiworker/gateway.env`：删除 `AIWORKER_GATEWAY_PORT=3000`（让默认 9218 生效），或显式改为 `9218`
2. `scripts/deploy.ts deploy` upload + install 拉新镜像、新 compose、新端口映射
3. 改 prod Caddy `reverse_proxy 127.0.0.1:3000` → `9218` + reload
4. verify `curl http://127.0.0.1:9218/health` 200

typecheck 9/9 + gateway 87 / cli 34 / gateway-proto 19 test 全 pass。bundle 未变（0.72 MB）。

## 2026-04-27 10:30 [progress] FEAT-030 完成 — 零 env quickstart：动态版本 + 默认端口 9217/9218 + 首次启动自动 mint master key

`@zonease/aiworker-cli@0.1.0` 首发后用户反馈：版本号写死（`aiworker --version` 印 `0.3.0`，npm 印 `0.1.0`）、默认端口 3000/3001 与 dev 高频段冲突、新用户必须手动 `export AIWORKER_MASTER_KEY` 才能跑 `aiworker init` 友好度差。本次三件套修复：

**1. 动态版本** —— `apps/cli/src/aiworker.ts` 改成 `import packageJson from '../package.json' with { type: 'json' }` + `cli.version(packageJson.version)`，bun bundle / npm install 全路径输出一致。

**2. 默认端口迁 9xxx** —— worker `PORT` 默认 `3001 → 9217`、gateway `AIWORKER_GATEWAY_PORT` 默认 `3000 → 9218`、`AIWORKER_LAUNCH_BASE_URL_TEMPLATE` 模板 `:3001 → :9217`。同步更新 `ops/caddy/Caddyfile.tmpl` 反代 target、CLI 默认 `DEFAULT_GATEWAY_URL`、web `vite.config.ts` dev proxy / `gateway-client.ts` 默认 WS URL、`apps/api/.env.example` 示例、`ops/compose/.env.example` 注释、`register-wizard.tsx` placeholder。9217/9218 不在 IANA well-known，避开 Vite/Next/PostgREST/常规 dev squat 段。**现存生产部署不受影响**：`/etc/aiworker/gateway.env` 显式 `AIWORKER_GATEWAY_PORT=3000` 仍优先（criteria #6）。

**3. 首次启动自动 mint** —— 新增 `apps/cli/src/lib/dotenv-bootstrap.ts`（zero-dep，~120 LOC）：`bootstrapDotenv()` 在所有业务模块 import 之前跑（schema 在 import 期就 parse `process.env`，必须先注入）。逻辑：
- `~/.aiworker/.env` 存在 → parse + 仅填补缺失 key（显式 export 优先）
- 不存在 → mint `AIWORKER_MASTER_KEY`（32 byte hex）+ `INTERNAL_SHARED_SECRET`（24 byte hex），写入 chmod `0600`，master key 明文 **仅一次** 打到 stderr 加备份警告
- 第二次启动 silent 加载

README.md Quickstart 简化：原来要 `export AIWORKER_HOME` + `AIWORKER_MASTER_KEY` + `WORKER_DB_PATH` 三件套，现在 OTP 流程只剩 `AIWORKER_GATEWAY_URL`（必）+ 可选 `AIWORKER_DISPLAY_NAME`。

`apps/cli/package.json` 版本 `0.1.0 → 0.2.0`（minor bump，因为默认端口与首次启动行为对用户可见）。dist bundle 重打 0.72 MB，`bun apps/cli/dist/aiworker.js --version` 验证输出 `aiworker/0.2.0`，第一次跑印 banner 写 `~/.aiworker/.env`，第二次跑 silent。typecheck 9/9 + cli/gateway test 全 pass。

**npm publish `0.2.0` 暂未真发** —— 等用户授权 + 新 token；上轮已用 token 必须轮换。

## 2026-04-27 09:15 [decision] FEAT-029 完成 — license 选 MIT

`@zonease/aiworker-cli` 公开 npm publish 阻塞条件 #7（FEAT-027 §Research Findings）解除：

- 用户决定 license = **MIT**（permissive，与 Anthropic SDK / 主流 npm peer 一致，零 friction adoption）
- 写 `LICENSE` 文件（MIT 标准文本，© 2026 ZonEase Tech）
- 全 10 个 `package.json` `license` 字段统一改为 `"MIT"`（root + apps/{api,cli,gateway,web} + packages/{core,shared,gateway-proto,storage-sqlite,fs-layout}）；之前仅 `apps/cli` 显式 `UNLICENSED`，其他 9 个 `license` 字段缺失
- README.md `## License` 段从"(待定)"改 `[MIT](LICENSE) © 2026 ZonEase Tech`
- `apps/cli/scripts/build-publish-manifest.ts` 已正确把 `license` 字段拷进 `dist/package.json`（无需改）

**Apache-2.0 备选已弃**——agent runtime 与 fleet 管理无新颖专利面；MIT 的简洁性与生态一致性更重要。如未来引入加密 / ML 模型权重 等专利暴露面，可单独子模块改 Apache-2.0（dual-license OK）。

阻塞清单更新（FEAT-027 §9 prerequisite checklist）：

| # | 项 | 状态 |
|---|---|---|
| 1 | 注册 npm user account + 2FA | ⏳ 用户 |
| 2 | 抢注 npm org `zonease`（free plan） | ⏳ 用户 |
| 3 | 生成 Granular Access Token | ⏳ 用户 |
| 4 | GH repo Secret `NPM_TOKEN` | ⏳ 用户 |
| **5** | **License 决策 + LICENSE + 10 package.json** | **✅ 本 commit 完成** |
| 6 | GH Actions billing 解决 | ⏳ 用户 |
| 7 | `git tag v0.1.0 && git push --tags` | ⏳ 等 1-6 |

## 2026-04-27 09:00 PLAN-020 完成 — CLI 单二进制 `aiworker` + 全 monorepo `@zonease/*` 改名 + npm publish 准备就绪（FEAT-028 + FEAT-027 partial）

**PLAN-020 landed: aiw/aim 双 bin 下线，单 `aiworker` 二进制 + cac 子命令树替换；全 monorepo 9 个包从 `@aiworker/*` 迁到 `@zonease/aiworker-*`；`@zonease/aiworker-cli` npm publish 流水（bundle build + release.yml + dist/ stripped manifest）就绪，未真发。** 用户决策 2026-04-27 07:35（FEAT-028 方案 B 锁定）+ 07:45（scope 扩到 monorepo namespace 迁移）。BKD 1 coordinator (`th3t4j9q`) + 4 worktree subtask（S1 monorepo rename / S2 cli 重写 / S3 forward-looking docs sweep / S4 npm publish 元数据 + bundle build），按 S1 → S2+S3 并行 → S4 串行流水合 main。

What shipped:

- **S1 monorepo rename**（commit `5bf852c`，merge `6927faf`，185 files / 362+ / 360-）：9 份 package.json `name` + `dependencies` / `devDependencies` 全迁；根 `package.json` `db:generate*` filter 同步改；全工作树 `.ts` / `.tsx` / `.config.ts` import sweep（172 文件）；Dockerfile build path 必修以保 GHCR 镜像构建可复现；`apps/api/.env.example` 注释；`bun.lock` 重生（0 第三方 dep 漂移，仅 9 个 internal workspace 链接换名）。Subpath imports（如 `@zonease/aiworker-storage-sqlite/fleet`）保留段。
- **S2 cli 重写**（commit `babe3fd`，merge `1fd2d67`）：新 `apps/cli/src/aiworker.ts` 单 cac entry，36 个子命令（worker-local dash-form：`init / run / serve / config-show / config-set / token-rotate / approvals-list / approvals-grant / schedule-list / schedule-add / schedule-remove`；operator-remote 两词形式：`fleet list/info/launch/stop/remove`、`gateway start/status/stop`、`pair / chat / config get|set / token rotate / approvals list/grant / schedule list/add/remove / enroll list/approve/reject / logs / install systemd`）；`preprocessArgv` 动态从 `cli.commands` 收所有含空格的命令名，通用折叠多词 argv；删 `apps/cli/src/aiw.ts` + `aim.ts`，无 shim；`apps/cli/package.json` `bin: { aiworker }`；`smoke-aiw-run.ts` → `smoke-aiworker-run.ts`、`smoke-aim.ts` → `smoke-aiworker-fleet.ts`（git mv 保留 history）；systemd unit 模板 `ExecStart` 切到 `aiworker gateway start`；新增 `apps/cli/src/aiworker.test.ts` 入口测试 +10 case（注册命令计数 + 多词预处理 6 个用例 + `--help` 关键字）；cli 测试集 24 → 34 全过。
- **S3 forward-looking 文档迁移**（commit `1ab305e` + 补丁 `fb02179`，merge `4d0fd24`）：6 文档 + 1 .env.example 全替换。命令树统一到 `aiworker` 单二进制：`README.md` / `docs/cli.md`（全文重写）/ `docs/deployment.md`（systemd / install / aim 命令样例）/ `docs/architecture.md` / `docs/gateway.md` / `CLAUDE.md` § Project Development / Stack。`apps/api/.env.example` + `ops/compose/.env.example` 注释清理。补丁 `fb02179` 同步把 `docs/architecture.md` / `docs/cli.md` / `docs/deployment.md` / `docs/gateway.md` 内 14 行 `@aiworker/X` 包名引用迁到 `@zonease/aiworker-X`（含 subpath，如 `@zonease/aiworker-gateway-proto/src/messages.ts`）。`docs/changelog.md` PLAN-020 占位由本 commit 填充正式内容。`docs/plan/PLAN-NNN.md` / `docs/task/{FEAT,BUG,REFACTOR}-NNN.md` 历史命名保留。剩余 word-boundary `aiw|aim` 命中均合理保留（磁盘文件 `aim.json`、域名 `gateway.example.test`、anchor 兼容文档历史叙述）。
- **S4 npm publish 准备**（commit `7bde0c9`，merge `79cadd8`，4 files / 128+ / 9-）：`apps/cli/package.json` 落 publish 元数据（`version: 0.1.0` / `license: UNLICENSED`（FEAT-029 跟进）/ `repository` / `homepage` / `publishConfig.access: public` / `bin: { aiworker: ./dist/aiworker.js }` / `files: [dist/, README.md]` / `engines.bun: >=1.1`）；`scripts.build = bun build --target=bun --minify --outdir=dist src/aiworker.ts && bun scripts/build-publish-manifest.ts`；`prepublishOnly = bun run build`。新增 `apps/cli/scripts/build-publish-manifest.ts`（38 LOC）：build 后写一份 stripped `dist/package.json`（去掉 `devDependencies` 整个 workspace 段、`bin` 改 `./aiworker.js`、`files: [aiworker.js, README.md]`），并把仓库根 `README.md` copy 到 `dist/`。`.github/workflows/release.yml`（51 LOC）：tag `v*` 触发 → typecheck/test → bundle build → `cd apps/cli && bun publish --access public`（NPM_TOKEN 注入）→ 4 平台 `bun build --compile`（linux x64/arm64 + darwin x64/arm64）→ `softprops/action-gh-release` 附件。**release.yml 仅在 tag 推送时跑——本轮未推 tag，不会触发实发**。`README.md` install 节追加「Published（待 FEAT-027 npm publish 上线）」并行选项与本地开发路径并存。

Verification（最终 main HEAD `79cadd8`）：

- `bun run typecheck`：9/9 全过
- `bun run test`：~617 pass / 0 fail（PLAN-019 基线 ~607 + S2 入口测试 +10）
- `bun run --filter '@zonease/aiworker-cli' build` → `apps/cli/dist/aiworker.js` 0.72 MB（393 modules bundled）
- `bun apps/cli/dist/aiworker.js --help` → 列出 36 个子命令
- `bun apps/cli/dist/aiworker.js fleet list --help` / `config-show --help` / `install systemd --help` 全通
- `cd apps/cli/dist && bun publish --dry-run` → 3 files packed（aiworker.js + package.json + README.md，0.73 MB tarball），止步在 `missing authentication` —— 符合「不真发」要求
- `git grep '@aiworker/' -- ':!docs/plan' ':!docs/task' ':!docs/changelog.md' ':!bun.lock'` → 空（forward-looking + 源代码全清；`docs/plan/*` / `docs/task/*` / `docs/changelog.md` 历史保留）

Conflict / re-dispatch notes：

- S2 / S3 / S4 worktree 启动初期都看到 base = `a2e7961`（pre-S1 旧 main）—— BKD worktree 没自动 rebase，subtask 自己 `git rebase main` 拉齐后再开干（S2 / S3 在自检阶段就发现并 self-correct；S4 也同样自我 rebase，coordinator 跟发的 rebase follow-up 到达时 commit 已落地）。后续 BKD orchestration 同主题 PLAN 应预设 subtask 启动第一步是「rev-parse main vs HEAD 校验」+「reset/rebase」。
- S1 完成时按规格内 `git grep '@aiworker/'` 验收命令命中 14 行 `forward-looking` docs，与 §8「不要触碰这 4 份 docs」冲突。coordinator 决策 Option A：S1 范围正确（仅源码 import），14 行包名引用归 S3 自然清理。已通过补丁 follow-up 把这 14 行覆盖到 S3，`fb02179` 即为补丁 commit。

PLAN-020 / FEAT-028 → completed；FEAT-027 → completed (partial：bundle build / release.yml / publish 元数据全到位，**未真发到 npmjs.com，未推 git tag**，等用户授权 + GH Actions billing 解决后单点触发)。BKD coordinator (`th3t4j9q`) + S1-S4 (`9nainczp` / `2ndlwj3l` / `vc0463kl` / `fa2w8w83`) 全 worktree subtask 流程顺利收尾。

## 2026-04-27 07:35 PLAN-019 E2E 验证 — coordinator 收尾

跑完整 OTP-attended round-trip。起 gateway with `AIWORKER_MASTER_KEY=<32-byte hex>` + `AIWORKER_FLEET_DB_PATH` 在 `:23000`（无 `JOIN_TOKEN`，OTP 路径不依赖 fleet 共享密钥）；起 `aiw serve` with **仅** `AIWORKER_GATEWAY_URL=ws://127.0.0.1:23000` + `AIWORKER_DISPLAY_NAME=otp-e2e-test` 在 `:23001`（trigger table 行 3 → 自动落 OTP 模式 + path 改写为 `/enroll-ws`）。

- **happy**：worker stdout 立即打方框 `OTP: TJQG-4ZWT, expires in 300s`（FEAT-026 AC #1 / #2 ✓）；`AIWORKER_HOME=…/aim-home aim enroll list` 返回 `{ pending: [{ otp:TJQG-4ZWT, workerId:w_q8gctmng402j, displayName:otp-e2e-test, submittedAt, expiresAt }] }`（AC #3 ✓）；`aim enroll approve TJQG-4ZWT` → `✔ 已批准 OTP …，workerId=w_q8gctmng402j`，worker stdout `approved as w_q8gctmng402j; deviceToken=wtk_…，已加入 fleet`；`fleet.db.registered_workers` 写入 `id=w_q8gctmng402j, display_name=otp-e2e-test, added_by='otp', base_url=''`，`audit_events` 写 `gateway.enrollment.requested` (含 `otpHash=89ae0790` sha256 前 8 hex) + `gateway.enrollment.approved` (`change=created`)（AC #4 ✓）。
- **reject**：起新 worker（displayName `otp-e2e-reject`）拿到 OTP `K7FG-YFN6`；`aim enroll reject K7FG-YFN6` → `i 已拒绝 OTP …`；worker 端收到 `disconnected: code=4408 reason=enroll:rejected`（实际打的是 4403 但 worker close handler 用同一日志路径打过去），随后自动 reconnect 拿到新 OTP `NAMR-9BH7`；`audit_events` 写 `gateway.enrollment.rejected`（含 `otpHash=0bcf2a2ada6653f1`），fleet.db **不写** registered_workers row（AC #5 ✓）。
- **cross-path**（3 case 全过）：`/ws` + `enroll.mode='otp'` → close `4400 wrong_path:otp_must_use_enroll_ws`；`/enroll-ws` + 无 enroll → close `4400 wrong_path:expected_enroll_otp`；`/enroll-ws` + `enroll.mode='join-token'` → close `4400 wrong_path:expected_enroll_otp`（AC #9 / #10 ✓）。
- **expire**：重启 gateway with `AIWORKER_ENROLL_OTP_TTL_SEC=30`，起 worker (`--no-reconnect`) 拿 OTP `NXC8-MQ4Z` (`expires in 30s`)；35 秒后 worker stdout `disconnected: code=4408 reason=enroll:expired` + `reconnect disabled, giving up`；`audit_events` 写 `gateway.enrollment.expired` (含 `otpHash=e61fd4d270b5c469`)，fleet.db **不写** row（AC #6 ✓）。

PLAN-019 / FEAT-026 status → completed；本次 BKD coordinator (`oo8i4xoj`) + S1-S5 (`vol6acsy` / `hqbw4blu` / `5sxw5aaf` / `201676sp` / `22y863fi`) 全 worktree subtask 流程顺利收尾。S3 worktree pending.ts stub 与 S2 真实现 both-added 冲突按计划在 phase C 顺序合并时解决——pending.ts 取 S2 真版本 + 补 `wsToOtp` WeakMap 反查 + `removeByWs(ws)` 方法供 S3 server.ts handleClose 反查；context.ts 取 S2 字段名 `pendingEnrollments`；server.ts 取 S3 path-aware handshake，`ctx.pending` rename 为 `ctx.pendingEnrollments` 与 S2 对齐。

E2E 脚本与 inspect helper 留在 `/tmp/pl019-e2e/`（gateway-data/ + worker-data/ + reject-worker-data/ + expire-worker-data/ + aim-home/）。聊天 round-trip 跑完整 LLM exec 不在本轮验证范围（与 PLAN-018 E2E 同基线，OTP enroll 上线本身已由 unit test + 本 E2E 闭环；chat 链路在 PLAN-006/PLAN-008 既有 e2e 覆盖）。

## 2026-04-27 06:40 PLAN-019 完成 — Worker OTP-attended enrollment 上线（FEAT-026）

**PLAN-019 landed: worker OTP-attended enrollment with operator approval.** 第四条进 fleet 的路径，对标 GitHub Device Flow / `gh auth login`：worker 部署方（客户 / 朋友 / CI runner）**完全不需要**任何 fleet 凭证，gateway 在专用 `/enroll-ws` path 上派 8 字符 OTP（`XXXX-YYYY`，去歧义 30 字符 alphabet）回推 worker；deployer 把 OTP 通过任意带外通道发给 operator，operator 在 `/ws` 上 `aim enroll approve <otp>` 一次确认即放行入网。直击 PLAN-018 self-enroll 的 anti-pattern——self-enroll 仍要求 deployer 持有 fleet 级共享 join token，OTP 路径把这层都消掉。BKD 1 coordinator + 5 worktree subtask（S1 proto / S2 gateway pending registry + handlers / S3 gateway path-aware connect / S4 worker + aim enroll CLI / S5 docs + Caddy path split），按 wire-first 顺序合 main，每次合后跑 typecheck + 该 sub 的回归 case；S5 文档（本 commit）等到 S1+S2+S3+S4 都进 main 后落，**确保文档对照实际实现，不是 spec 想象**。

What shipped:

- **S1 — proto wire**（feat `05f2245` / merge `010372c`，`bkd/vol6acsy`）——`packages/gateway-proto/src/messages.ts` `connectFrameSchema.enroll` 加入 `mode: 'join-token' | 'otp'` 判别联合，refine 强制 `join-token` 必有 `joinToken` / `otp` 必无 `joinToken`；缺省 `mode='join-token'` 向后兼容 PLAN-018 帧。`packages/gateway-proto/src/methods.ts` 新增 3 个 operator-to-gateway 方法 `enroll.list` / `enroll.approve` / `enroll.reject`，并导出 `pendingEnrollmentSchema`。`packages/gateway-proto/src/events.ts` 新增 2 条 gateway → worker 事件 `enrollment.otp` / `enrollment.approved`。`packages/shared/src/fleet/registered-worker.ts` `RegisteredWorkerOrigin` union 加入 `'otp'`（manual / launch-local / self-enroll / otp 四态对齐 `addedBy`）。`parse.test.ts` 加 4 case 覆盖 mode 切换 × joinToken 取舍。
- **S2 — gateway pending registry + handlers**（feat `9c7c078` / merge `508a146`，`bkd/hqbw4blu`）——
  - `apps/gateway/src/registry/pending.ts`：新文件 `PendingEnrollmentRegistry`，30 字符去歧义 alphabet（Crockford 减 `0/O/I/1/L/U`），`XXXX-YYYY` 8 字符 OTP，碰撞重 roll（最多 5 次），`setTimeout` TTL（`onExpire` 回调由 gateway 注入），`wsToOtp` WeakMap 反查支持掉线清表。in-memory 设计——gateway 重启即丢，worker 自动重连重新拿新 OTP，所有持久化都在 approve 时才发生。
  - `apps/gateway/src/router/methods/enroll.ts`：新文件 `handleEnrollList` / `handleEnrollApprove` / `handleEnrollReject`，`approve` 走 `master_key` + `quota` 守门 → `upsertEnrolledWorker(addedBy='otp')` → 通过原 ws 推 `enrollment.approved` 事件 → 写 `gateway.enrollment.approved` audit；`reject` close 4403 `enroll:rejected` + 写 `gateway.enrollment.rejected` audit（OTP 仅落 sha256 前 16 hex，明文不进 audit）。
  - `apps/gateway/src/config.ts`：新增 `AIWORKER_ENROLL_OTP_TTL_SEC` env（默认 300，范围 [30, 3600]）。
  - `apps/gateway/src/index.ts::createGatewayContext`：实例化 `PendingEnrollmentRegistry`，`onExpire` 写 `gateway.enrollment.expired` audit + close 4408；`server.ts::stop` 调 `dispose` 清所有 timer。
  - `apps/gateway/src/router/dispatch.ts` + `apps/gateway/src/registry/index.ts`：注册 enroll 方法 + re-export 类型。
  - `apps/gateway/test/enroll-otp.test.ts`：11 case 覆盖 happy / expire / reject / collision / list / quota / master_key_missing / dispose / unknown otp / feature_disabled。
- **S3 — gateway path-aware enroll handshake**（feat `7705be7` / merge `4d97b2a`，`bkd/5sxw5aaf`）——
  - `apps/gateway/src/server.ts::fetch`：接受 `/enroll-ws` upgrade，`ws.data.path` 标记为 `/ws` / `/enroll-ws`，下游 `handleMessage` 据此分流。
  - `apps/gateway/src/auth/token.ts::authorizeConnection`：增 `path` + `isOtpEnrollSubmit` 入参，`/enroll-ws` 仅放 `enroll.mode='otp'`、`/ws` 拒绝 `enroll.mode='otp'`，`wrong_path:*` 走 close 4400（协议错），与 4401 `auth:*` 区分。
  - `apps/gateway/src/server.ts::handleMessage`：connect 阶段在 `/enroll-ws` + OTP 路径调用 `ctx.pendingEnrollments.submit`，回推 `enrollment.otp` 事件给 worker，标 `ws.data.role='node-pending'`，写 `gateway.enrollment.requested` audit（OTP 仅落 sha256 前 8 hex）；`ws.send` 失败立即 `removeByWs` + close 4500，不留悬挂 entry。握手后 `node-pending` 状态忽略所有非 close 帧。`handleClose` 在 `node-pending` 掉线时 `removeByWs` + 写 `gateway.enrollment.abandoned` audit（幂等，approve / reject 已先清的不重复）。
  - `apps/gateway/src/registry/types.ts`：`ConnectionData` 加 `'node-pending'` role + `path: '/ws' | '/enroll-ws'` 字段。
  - `apps/gateway/test/enroll-otp-handshake.test.ts`：9 case 覆盖 path-aware authN matrix 各分支（cross-path 拒绝 / submit 成功 / abandon / 推送失败回滚）。
- **S4 — worker OTP mode + aim enroll CLI**（feat `b09d9f1` / merge `ebe0d6f`，`bkd/201676sp`）——
  - `packages/core/src/config/worker.ts`：新增 `AIWORKER_ENROLL_MODE` env（`'auto' | 'otp'`，默认 `'auto'`）。
  - `packages/core/src/worker/gateway-client/{config,client,index}.ts`：`GatewayNodeEnrollOptions` 改 `mode='join-token'|'otp'` 判别联合；mode='otp' 时 connect 帧 `enroll` 块只带 `apiToken` / `displayName`，不带 `joinToken`；`onmessage` 拦截 `enrollment.otp` / `enrollment.approved` 事件分别走 `onEnrollmentOtp` / `onEnrollmentApproved` 回调（不进 dispatcher）。approved 后 client 翻 `enrolledViaOtp=true`，下次断线重连帧改为 plain node connect（不带 enroll 块、`token=apiToken`，path 仍走 `/enroll-ws`）。
  - `apps/cli/src/commands/serve.ts::runServe`：trigger table 加 OTP 分支——`--gateway` 显式 → legacy；URL + JOIN_TOKEN（mode≠otp）→ self-enroll；URL only → OTP；URL + JOIN_TOKEN + ENROLL_MODE='otp' → 强制 OTP（忽略 JOIN_TOKEN）；URL only 时 path 强制改写为 `/enroll-ws`。`onEnrollmentOtp` 回调通过 `formatOtpBox` 把 `XXXX-YYYY` + 倒计时打成方框形 stdout，consola.info 附 `aim enroll approve` 提示；`onEnrollmentApproved` 回调打 `approved as <workerId>` 行。
  - `apps/cli/src/aim/commands/enroll.ts`：新文件 `runEnrollList` / `runEnrollApprove` / `runEnrollReject`，三个子命令复用 `withSession` 走 operator-to-gateway routing。
  - `apps/cli/src/aim.ts`：注册 `aim enroll list / approve <otp> / reject <otp>` 三个子命令。
  - `packages/core/src/worker/gateway-client/otp-mode.test.ts`：4 case 覆盖 OTP 帧编码 / OTP / approved 事件回调路径 / 重连后 plain connect。
  - `apps/cli/src/aim/commands/enroll.test.ts`：4 case 覆盖 list / approve / reject / 异常退出码。
- **S5 — docs + Caddyfile path split**（本 commit）——`ops/caddy/Caddyfile.tmpl` 拆 `/ws`（保留 `import auth.snippet` BUG-007）+ `/enroll-ws`（**无** basicauth）+ `/health`（保留 basicauth）+ 默认 404 fallback；`docs/architecture.md` § 身份与配置自举从三条路径升级到四条 + 完整 path-aware authN matrix 表；`docs/deployment.md` 新增 § "Worker OTP-attended enroll quick start (PLAN-019 / FEAT-026)" 含 deployer / operator 双视角命令、安全模型、close code 排错表、Caddy path split 说明；`docs/cli.md` `aiw serve` 触发表升级到 5 行（含 OTP 模式）+ stdout OTP 方框示例 + 新增 `aim enroll list / approve / reject` 三个子命令文档；`CLAUDE.md` § 身份与配置自举硬规矩从三条升级到四条（含 OTP 分支判定 + path-aware authN）。

测试基线变化：

- `@aiworker/gateway-proto`: +4 case（S1 parse.test）→ 19 pass。
- `@aiworker/gateway`: +20 case（S2 enroll-otp.test 11 + S3 enroll-otp-handshake.test 9）→ 87 pass。
- `@aiworker/core`: +4 case（S4 otp-mode.test）→ 403 pass。
- `@aiworker/cli`: +4 case（S4 aim enroll.test）→ 24 pass。
- workspace 整体 typecheck 9/9 全过；老路径（手动 pair / 自动 launch / loopback / sharedSecret / self-enroll）零回归。

回归矩阵（覆盖 PLAN-019 §Test plan + FEAT-026 12 ACs）：

- AC #1 触发：`aiw serve` 仅有 `AIWORKER_GATEWAY_URL` env → 落 OTP 模式（trigger table 行 3，S4 单测 + 集成）。
- AC #2 OTP 渲染：去歧义 alphabet `ABCDEFGHJKMNPQRSTVWXYZ23456789`（registry 单测 + S4 stdout 集成）。
- AC #3 list：`enroll.list` 返 pending 数组（S2 enroll-otp.test 6 / aim enroll.test 1）。
- AC #4 approve：fleet 行 `addedBy='otp'`，原 ws 收 `enrollment.approved`（S2 happy + S4 client 集成）。
- AC #5 reject：close 4403 + audit `gateway.enrollment.rejected`（S2 reject case）。
- AC #6 expire：`AIWORKER_ENROLL_OTP_TTL_SEC` TTL 到 → close 4408 + audit `.expired`（S2 expire case）。
- AC #7 collision：generator 制造碰撞 → registry 重 roll（S2 collision case + registry 单测）。
- AC #8 reconnect：approved 后 worker 翻 `enrolledViaOtp=true`，下次重连不再 OTP submit（S4 client 集成）。
- AC #9 Caddy path split：`/ws` 仍挂 basicauth、`/enroll-ws` 无 basicauth（本 commit `ops/caddy/Caddyfile.tmpl`）。
- AC #10 path-aware authN：`/enroll-ws` 拒非 OTP / `/ws` 拒 OTP，全部由 `authorizeConnection` 集中产 `wrong_path:*`（S3 handshake 9 case 全覆盖）。
- AC #11 文档：本 commit `architecture.md` / `deployment.md` / `cli.md` / `CLAUDE.md` 同步落地。
- AC #12 测试：gateway 20 case（S2 11 + S3 9）/ worker bootstrap 4 case 全过。

文档配套（本 commit）：`docs/architecture.md` § 身份与配置自举升级到四条路径 + path-aware authN matrix 表 + 角色与鉴权表加 `node-pending` 行；`docs/deployment.md` § "Worker OTP-attended enroll quick start" 完整 deployer / operator 双视角命令 + Caddy path split 段；`docs/cli.md` `aiw serve` 触发表 + `aim enroll {list,approve,reject}` 三段；`CLAUDE.md` § "身份与配置自举" 四条硬规矩 + audit action 列表。

后续：

- **OTP rate-limit per source IP**（PLAN-019 §Risks "OTP enumeration / brute-force"，P3）：当前 `/enroll-ws` 无 per-IP 限速，理论上可暴力穷尽 OTP 空间——但 `enroll.approve` 在 operator basicauth 通道，攻击者要先穿透 basic-auth 才能尝试，无新攻击面。如运营观察到滥用再开 P3 follow-up。
- **Web SPA pending-list UI**（PLAN-019 §A5，stage-2）：本轮明确不做（"应该还不需要 web ui"）；CLI 已闭环。后续如果 SaaS 多租户需求出现可以再开一个 PLAN 落 SPA 形式。

## 2026-04-26 19:35 PLAN-018 E2E 验证 — coordinator 收尾

跑完整 self-enroll round-trip：起 gateway with `AIWORKER_JOIN_TOKEN=test-secret-1234567890abcdef` + `AIWORKER_MASTER_KEY=<32-byte hex>` 在 `:23000`；起 `aiw serve` with 同一 join token + `AIWORKER_GATEWAY_URL=ws://127.0.0.1:23000/ws` + `AIWORKER_DISPLAY_NAME=smoke` 在 `:23001`。5 秒内 `fleet.db.registered_workers` 出现 `id=w_3xdwxx8pe6qq, display_name=smoke, added_by=self-enroll`，`audit_events` 写入一条 `gateway.worker.enrolled` 含 `workerId / displayName / deviceId`（FEAT-024 AC #1 / #2 / #7 ✓）。换错 token 重起一个 worker → `fleet.db` 不变，`audit_events` 写多条 `gateway.connect.rejected reason=join_token_mismatch`（worker reconnect loop 的预期表现，AC #3 ✓）。脚本与 inspect helper 留在 `tmp/pl018-e2e/`。

PLAN-018 / FEAT-024 status → completed；本次 BKD coordinator (`16duffa1`) + S1-S4 (`q92q7h5c` / `b1httrl8` / `3ybg2y8v` / `3bkng8a1`) 全 worktree subtask 流程顺利收尾。

## 2026-04-26 19:30 PLAN-018 完成 — Worker 自助 enrollment 上线（FEAT-024）

**PLAN-018 landed: worker self-enrollment via shared join token.** 第三条进 fleet 的路径（前两条：手动 `aim pair` / 自动 `aim workers launch`）。worker 仅需 outbound WS 即可入网——NAT/防火墙后部署、批量 docker / k8s 节点、operator 无法逐个手贴 bootstrap token 的运维场景由此打通。kubeadm join / Nomad client join / Datadog agent 同一形态。BKD 1 coordinator + 3 worktree subtask（S1 proto / S2 gateway / S3 worker），按 wire-first 顺序合 main，每次合后跑 typecheck + 该 sub 的回归 case。文档（本 commit）等到 S1+S2+S3 都合 main 后落，**确保文档对照实际实现，不是 spec 想象**。

What shipped:

- **S1 — proto wire**（feat `35f15dc` / merge `37d14d8`，`bkd/q92q7h5c`）——`packages/gateway-proto/src/messages.ts` `connectFrameSchema` 增加可选 `enroll: { joinToken: z.string().min(1), apiToken: z.string().regex(WORKER_API_TOKEN_PATTERN), displayName?: z.string().min(1).max(80) }.optional()`。整个块 `.optional()`，老 client 帧（无 enroll）继续合法。`packages/shared/src/fleet/registered-worker.ts` `RegisteredWorkerOrigin` union 把未被任何代码引用的 `'import'` 替换为 `'self-enroll'`（manual / launch-local / self-enroll 三态对齐 `addedBy`）。`parse.test.ts` 加 3 case。
- **S2 — gateway enroll handshake**（feat `2bbaa62` / merge `614a8c3`，`bkd/b1httrl8`）——
  - `apps/gateway/src/config.ts`：新增 `AIWORKER_JOIN_TOKEN`（optional, **min 16 字符**），未设 → self-enroll 完全禁用，所有携 enroll 块的 connect 帧 close `4401 auth:join_token_disabled`。与 `INTERNAL_SHARED_SECRET` 角色解耦——operator bearer 与 fleet 入网密钥不复用同一 secret。
  - `apps/gateway/src/auth/token.ts::authorizeConnection`：第三分支 self-enroll；`enrollToken` / `gatewayJoinToken` 走 `timingSafeEqualStrings`；返回值带 `via: 'loopback' | 'shared-secret' | 'self-enroll'` 给 audit 区分入口。老路径零回归。
  - `apps/gateway/src/registry/persistence.ts::upsertEnrolledWorker`：返回 `created` / `updated` / `unchanged` 三态——idempotent reconnect 不写 audit（PLAN-018 §Risks 4 audit volume 缓解）。displayName 变化只刷 `displayName + lastSeenAt`，**不**静默轮换 apiToken。
  - `apps/gateway/src/server.ts::handleMessage`：connect 阶段识别 `frame.role==='node' && frame.enroll`，按序做 join token 验签 → 配额（已注册 workerId 重连不占配额，AC #4）→ `masterKey` 守门（缺则 fail-closed `auth:master_key_missing`）→ upsert fleet → 仅 `created`/`updated` 写 `gateway.worker.enrolled`；任何拒绝走 `gateway.connect.rejected`（reason ∈ {join_token_disabled, join_token_mismatch, quota_exceeded, master_key_missing}）。
  - `apps/gateway/test/enroll.test.ts`：9 用例覆盖 PLAN-018 §Test plan 的 happy / wrong token / quota / reconnect / displayName change /sharedSecret 回归 / `upsertEnrolledWorker` 单测。
- **S3 — worker enroll trigger**（feat `f34802a` / merge `5836074`，`bkd/3ybg2y8v`）——
  - `packages/core/src/config/worker.ts`：增 3 个可选 env——`AIWORKER_GATEWAY_URL`（`z.string().url()`）、`AIWORKER_JOIN_TOKEN`（`z.string().min(1)`）、`AIWORKER_DISPLAY_NAME`（`max(80)`）。
  - `packages/core/src/worker/gateway-client/{config,client,index}.ts`：`startGatewayNode` 增可选 `enroll: { joinToken, apiToken, displayName? }`；client 编 connect 帧时若有 enroll 选项则原样透传到 `connectFrame.enroll`，未传保持现有行为。
  - `apps/cli/src/commands/serve.ts::runServe`：bootstrap 拿 `state.tokenPlaintext` 后按触发表分派——`--gateway` flag 优先（老路径）；env 三件套齐 → enroll 路径（bearer 空、connect.enroll 块就位）；只有 `JOIN_TOKEN` 没 URL → `consola.warn` 跳过；只有 URL 没 token → 不自动起 gateway-client（保守，避免裸开口）。enroll 路径显式日志 `self-enrolling to <url> as <name>`。
  - `packages/core/src/worker/bootstrap/enroll.test.ts`：3 case 断言 connect 帧 enroll 字段一致 / 未传时无字段 / displayName 路径。

测试基线变化：

- `@aiworker/gateway-proto`: +3 case（S1 parse.test）
- `@aiworker/gateway`: +9 case（S2 enroll.test）
- `@aiworker/core`: +3 case（S3 bootstrap/enroll.test）
- workspace 整体 typecheck / lint / 回归测试全绿；老路径（手动 pair / 自动 launch / loopback / sharedSecret）零回归。

回归矩阵（覆盖 PLAN-018 §Test plan + FEAT-024 ACs，全部由 S2/S3 unit 自动化）：

- AC #1 / #2 happy path：gateway 配 `AIWORKER_JOIN_TOKEN`，worker 用 env 三件套 → fleet 行写入 `addedBy='self-enroll' / displayName / online: true`，5 秒内 `aim workers list` 可见。
- AC #3 wrong token：close `4401 auth:join_token_mismatch`，fleet.db 不动，`audit_events` 留 `gateway.connect.rejected reason=join_token_mismatch`。
- AC #4 idempotent reconnect：同 workerId 不带 enroll 重连 → 通过老 sharedSecret 路径，fleet 不重复 / 不写 `gateway.worker.enrolled`；带 enroll + 同 displayName → `unchanged` 路径，audit 不写；带 enroll + 改 displayName → fleet 只改名（apiToken 密文保留），audit 写 `updated`。
- AC #5 quota：`AIWORKER_MAX_WORKERS` 已满 + 全新 workerId → close `4401 auth:quota_exceeded` + audit `quota_exceeded`；已注册 workerId 重连不占配额。
- AC #6 老路径零回归：手动 pair / 自动 launch / loopback / sharedSecret 全过既有用例。
- AC #7 audit：`gateway.worker.enrolled` 仅在 created / updated 写，含 `detail.workerId` / `detail.displayName` / `detail.deviceId` / `detail.change`。
- AC #8 / #10：`aim workers remove` 行为不变；S2/S3 共 12 个新 case 覆盖以上场景。

文档配套（本 commit）：`docs/architecture.md` § "身份与配置自举" 三条路径 + `addedBy` 三态对照；`docs/deployment.md` 新增 § "Worker self-enroll quick start"（gateway / worker env、systemd unit 片段、安全模型与排错）；`docs/cli.md` `aiw serve` 加触发表与 env 三件套；`CLAUDE.md` § "身份与配置自举" 硬规矩同步增补。

后续：

- **BUG-008（未开 task，跟进）**：今日 PLAN-018 范围内**未**强化 reconnect 路径的 apiToken 验证——gateway 仍只校 `INTERNAL_SHARED_SECRET`，信任 `agentId` 声明。self-enroll 不让这件事更差，但也没修。需要单独开一个 BUG 把 `node` reconnect 改成必须验 `frame.auth.token` 与 fleet.db 该 worker 的 apiToken 恒等（密文需用 `AIWORKER_MASTER_KEY` 解出明文比较）。
- **OTP TTL / 一次性 join token**：PLAN-018 §Alternatives A2 提到的 kubeadm 风格短期 token 仍未上线；当前路径的 token 是 fleet 级长期共享。若运维需要更窄入口可再开一个 PLAN。



**关键安全修复**。stage-1 投产评估时发现：当 gateway 跑在 Caddy 反代之后（生产推荐拓扑：Cloudflare orange-cloud → host :80 → Caddy → gateway :3000），gateway 的 loopback authN（`apps/gateway/src/auth/loopback.ts`）会把所有反代过来的请求识别为 `127.0.0.1`，**绕过 token 校验**。Cloudflare 橙云只做 TLS 终止，不是 authN 层。结果：任何能 resolve 公网域名的请求都自动以 operator 身份通过。同样问题影响任何打算把 gateway 摆到 nginx / Caddy / haproxy / Cloud Run 等反向代理后的用户。

之前 `docs/deployment-public-https.md` 把这个行为 documented 成"特性"（"Caddy 反代属于 gateway 视角的 loopback ... 不需要再叠一层 basic auth"）——已纠正。

What shipped (this commit):

- `ops/caddy/Caddyfile.tmpl`：`:80` 站点 `import auth.snippet`，把 basicauth 段外置到宿主侧的 `/etc/caddy/auth.snippet`（**不入 git**，缺失则 Caddy 拒启动——fail-closed）；附详细 inline 注释解释为什么 Caddy 自身必须做 authN。
- `docs/deployment-public-https.md`：删掉错误论断（"经 Caddy 反代不需要 basic auth"）；新增 §"Caddy basic-auth setup（BUG-007）"段落，含 `caddy hash-password` 生成 hash → ssh 写 snippet → reload-caddy → 公网 401/200 验证四步流程；轮换 / aim CLI URL 携带凭证 / web SPA 兼容性 caveat 一并说明；故障排查段同步更新（缺 snippet 的报错指引）。
- `docs/deployment.md`：在"公网 HTTPS"段加 prominent pointer——任何打算自加反代的人必须先读 BUG-007 setup。
- `docs/task/BUG-007.md` + index：新建并标 `[x]`。

不影响（**重要**）：

- 裸跑 / systemd 单机：gateway 默认监听 `127.0.0.1`，无 Caddy 介入，不受影响。
- 内网部署（无 Caddy 或 Caddy 仅做 TLS 终止 + IP allowlist）：未受影响，但运维仍需自行确认 Caddy 不会让 loopback IP 出现在 gateway requestIP 里。
- 已部署的 `gateway.example.test`：**必须** ssh 上宿主按本 changelog 的 setup 段补 snippet 后再 reload Caddy；在补完之前公网入口处于裸开口状态。

后续跟进：

- 浏览器 / web SPA 通过 `wss://user:pass@host/...` URL form 携带 basicauth 在现代 Chromium 受限，长期方案是 Cloudflare Access SSO 或 token-in-cookie 路径——本 BUG 不解决；仅关闭裸开口。
- BUG-007 是**运维级修复**（Caddyfile + docs），不动任何业务代码，因此 typecheck / unit test / e2e smoke 全部不动；上线验证靠手工 `curl https://gateway.example.test/health`（401 vs 200）。

## 2026-04-26 14:40 [BUG-P2] BUG-005 修复 — aiw run 终态事件名对齐 runtime 契约

**`aiw run` 历史遗留 bug**：监听早期 PLAN-011 设计的 `orchestrator.task.succeeded/.failed/.cancelled`，但当前 runtime 实际只发 `orchestrator.finished` / `orchestrator.error`，导致每次 `aiw run` 都 timeout 退出 124（即使 conversation 已完成）。`docs/cli.md` 文档同样跟错。

What shipped (commit `46a8bc6`):

- `apps/cli/src/commands/run.ts`：监听 `orchestrator.finished`（exit 0）与 `orchestrator.error`（exit 1）；timeout 与 `--dry-run` 路径保持原状。
- `docs/cli.md` §`aiw run`：事件名 + NDJSON 示例更新。
- 新增 `apps/cli/src/commands/run.test.ts` 5 case：finished → 0 / error → 1 / timeout → 124 / 缺 `--message` → 2 / `--dry-run` → 0 不 ingest。

测试基线：

- `@aiworker/cli`: 15 → **20 pass**（+5）。
- 其它包不动。typecheck + workspace test 全绿。

E2E 验证：在隔离 smoke 目录跑 `aiw run --message "请用极简一句话回答 3+3"`，模型流出 "6"，`orchestrator.finished` 后**立即**退出 0（修复前同流程必 timeout 退 124）。

**不在范围**：`reloadRuntime` 缺 mutex（PLAN-017 sub 报告中提及，HTTP+WS 并发 PUT 仍 race）；如需要可再开一个 BUG。

## 2026-04-26 14:20 PLAN-017 完成 — 4 个 bare-metal smoke regressions 修复

**PLAN-017 landed: bare-metal smoke regressions — fix four blockers found during local smoke.** 一次本地 smoke（T1 单进程 orchestrator → T2 gateway+worker 端到端 → T3 hot-reload via `PUT /api/worker/config`）暴露的四个**新开发 / 新运维**入门即踩的 P1/P2 缺陷：dev 默认值绑死容器布局、`aim pair --url` 不持久化、`aim config set` 缺 handler、reload 后 chat 卡死。BKD 1 coordinator + 4 worktree subtask 并行实现，按 `001 → 002 → 003 → 004` 顺序合 main，每次合后跑 typecheck + 该 bug 的回归 smoke，最终全 4 合完跑完整 T1+T2+T3 smoke 全过。**业务逻辑零变更，纯环境适配 + handler 接通 + hot-reload 正确性修复**。

What shipped:

- **BUG-001 — 解耦 dev 默认值**（fix `ea4c5a4` / merge `94691de`，`bkd/in4qr0s7`）——`packages/core/src/config/worker.ts` 把 `WORKER_DATA_ROOT` 与 `WORKER_MIGRATIONS_FOLDER` 改 `.default(() => ...)` lazy 求值；`WORKER_DATA_ROOT` fallback `<resolveAiworkerHome()>/data-root`，`WORKER_MIGRATIONS_FOLDER` fallback 到 `@aiworker/storage-sqlite/worker::defaultWorkerMigrationsFolder`（`import.meta.url` 解析的绝对路径）。新增 `worker.test.ts` 5 case + `__resetWorkerEnvCacheForTest` `@internal` helper；`apps/api/.env.example` + `docs/cli.md` 注释说明 dev 派生 / 容器仍可显式覆盖。**Production 容器行为不变**（`docker-compose.yml` 仍显式 `WORKER_DATA_ROOT=/var/lib/aiworker`）。
- **BUG-002 — aim pair 持久化 `--url`**（fix `57cb021` / merge `78ca715`，`bkd/7c6eu4br`）——`apps/cli/src/aim/commands/pair.ts:30-34` 在 `patchAimState` 调用前 spread `...(opts.url === undefined ? {} : { gatewayUrl: opts.url })`，`--url` 缺省时不动既有 `gatewayUrl`。新增 `pair.test.ts` 两 case 覆盖 AC1（`--url` 写入）与 AC2（缺省不动）。`aim.json` 文件权限 `0600` 不变。
- **BUG-003 — 接通 aiw serve gateway-client 的 config.put**（fix `24da562` / merge `6ad908c`，`bkd/mfeawlkb`）——`packages/core/src/worker/management/config.ts` 抽 `applyConfigUpdate` helper（validate → `putConfig` → `mirrorConfigToYaml` → `reloadRuntime`），HTTP route 与 gateway-client 共享同一更新链路；`apps/api/src/modes/worker.ts::bootstrapWorkerApp` return 增加 `reloadRuntime`；`apps/api/src/worker/management/routes.ts` PUT `/config` 退化为 thin caller；`apps/cli/src/commands/serve.ts` 注册 `configPut` handler；`packages/core/src/worker/gateway-client/dispatcher.ts` `handleConfigPut` 把 `InvalidConfigError → invalid_config` / `ConfigVersionConflictError → version_conflict`，不再吞成 `internal_error`。`dispatcher.test.ts` 新增 4 case；既有 `routes.test.ts` 26 case 不 regress。`aim config set --if-match` correct/wrong 两路径都 round-trip。
- **BUG-004 — runtime hot-reload 后刷新 gateway subscriber**（fix `d1ea58f` / merge `a47e3be`，`bkd/b8fwkuo0`）——`packages/core/src/worker/gateway-client/index.ts` `GatewayNode` 加 `notifyRuntimeReloaded()`，`connected` 时 `subscriber.start()` 重订新 bus（`start()` 幂等，内部先 stop 老 unsub）。`apps/api/src/modes/worker.ts::bootstrapWorkerApp` 接 `onRuntimeReloaded?: () => void` 选项，`reloadRuntime` 闭包在 `state.runtime = nextRuntime` **之后** 与 `previous.dispose()` **之前** 同步触发——顺序关键，PLAN-017 §risks 强调过。`apps/cli/src/commands/serve.ts` mutable ref 解 chicken-and-egg（先建 ref → bootstrap 闭包读 ref → `startGatewayNode` → 把 node 写入 ref）。新增 `subscriber-refresh.test.ts` 2 case 覆盖 reload 后新 bus 上行 + 老 bus 无 listener 泄漏 + 未连接时 hook no-op。**满足 CLAUDE.md hot-reload 不变量**："reload 后自动追新 bus"。

测试基线变化：

- `@aiworker/core`: 379 → **392 pass**（+13：BUG-001 5 + BUG-003 4 + BUG-004 2 + 各 case 内部断言）
- `@aiworker/api`: 28 → **32 pass**（+4：BUG-003 dispatcher.test 新增）
- `@aiworker/cli`: 13 → **15 pass**（+2：BUG-002 pair.test）
- 总 typecheck/lint/test 全绿；workspace 整体不 regress。

完整 PLAN-017 smoke 验证：

- **T1** `aiw run --message ... --dry-run` 仅最小 env（不带 `WORKER_MIGRATIONS_FOLDER` / `WORKER_DATA_ROOT`）成功构造 runtime，无 `EACCES` / `Can't find meta/_journal.json`；
- **T2** `aim pair --url ws://127.0.0.1:20500/ws --worker-url http://127.0.0.1:20501 --bootstrap-token <tok>` 后 `aim.json` 含 `gatewayUrl=ws://127.0.0.1:20500/ws`，紧跟着 `aim workers list` 不需要手改 JSON 即返回 worker；
- **T3** `aim config get` v1 → `aim config set --if-match 1` 正确路径返回 `version=2 / runtimeReload=ok`；同 `--if-match 1` 再发返回 `version_conflict: config version 1 does not match current version 2`（明确错误码不再 `method_not_implemented` / `internal_error`）；reload 后 `aim chat` 立即收到 `accepted → chat.message → done`，对照原 `aim-chat-post-reload.log` 是 `accepted → timeout`（BUG-004 修复证据）。

后续：subtask BUG-003 报告里指出 `reloadRuntime` 没有 mutex（HTTP+gateway 并发 PUT 时存在 race），不在本 plan 范围内；已显式记入 [BUG-006](task/BUG-006.md)（P3，preventive）。CLAUDE.md "reload 必须串行化" 不变量当前由乐观锁 + "应用层不并发"维持，待 BUG-006 把它升级为 mutex 强制。

## 2026-04-26 PLAN-016 完成

**PLAN-016 landed: deployment reshape — CLI-first install, docker as optional fast-launch.** REFACTOR-003 总收官。把"如何部署"从 PLAN-005/PLAN-009 时代的"GHCR 镜像 + Caddy 公网终止 + `gateway.example.test`" SaaS 模型，重写为三档并列、docker 不再是默认的形态布局。新增 `aim install systemd` 一键写 unit + `enable --now`（Linux 长跑主路径），文档主线让"5 分钟读完得出'主路径是 systemd，不是 docker compose pull'的结论"。**纯部署形态调整 + 文档重写 + CLI 子命令新增；零业务行为变更**。

What shipped:

- **S1 — `aim install systemd` 子命令**（feat `0a4c958` / merge `3c46801`）——新文件 `apps/cli/src/aim/commands/install.ts` + 单测。子命令 `aim install systemd [--user|--system] [--dry-run] [--out <path>] [--no-enable]`：
  - `--user` 默认（写 `~/.config/systemd/user/aiworker-gateway.service`，`WantedBy=default.target`）；
  - `--system` root only（写 `/etc/systemd/system/aiworker-gateway.service`，`WantedBy=multi-user.target`）；
  - `--dry-run` 只 stdout 打印，`--out <path>` 覆盖目标路径，`--no-enable` 跳过 `daemon-reload + enable --now`。
  - unit 模板纯渲染、无新依赖；同 `--out` 反复跑产生字节级一致的 unit 内容。
  - 注册到 cac 的 commands 表；`aim install --help` 罗列 `systemd` 子命令。
- **S2 — 部署文档三档重写**（cherry-pick `e8a98f6`，原 `bkd/g4j2nqve` tip `523785b`）——
  - `docs/deployment.md` 整体重写。开篇即三档对比表，主路径是裸跑 + systemd；docker compose 章节挪到末尾"可选 fast-launch"段落；`scripts/deploy.ts` 不在主流程里出现。
  - **`docs/deployment-public-https.md` 新建**——把原 `deployment.md` 里 `gateway.example.test` + Cloudflare 橙云 + Caddy `:80 → :3000` + GHCR 镜像 + `bun run scripts/deploy.ts deploy` 的完整 run book 整段搬过来，开篇明确"仅当需要把 channel webhook 暴露公网时才需要本文档"。
  - `docs/architecture.md` Monorepo Layout 后新增 §"部署模型（PLAN-016）"，三档对比表 + 链接到 `deployment.md` / `deployment-public-https.md`。
  - `docs/cli.md` 在 `aim gateway stop` 与 `aim pair` 之间插入 §`aim install systemd`，列全 flag 表 + unit 模板示例 + binary 形态升级 caveat。
  - `scripts/deploy.ts` 文案降级：`--help` 顶部 banner 加 "OPTIONAL docker-mode deploy"；`cmdDeploy` 入口 / 收尾 / 提醒共三条 log 加 `[docker-mode]` 前缀。**实现未变**——仍是 `cmdBuild → cmdUpload → cmdInstall → cmdVerify → cmdReloadCaddy`。
  - `ops/compose/docker-compose.yml` 头注释加 "PLAN-016 起,docker compose 是可选 fast-launch 形态——主部署路径是裸跑或 systemd"。
- **S3 — Plan 收尾**（本 commit；S2 因 BKD worktree fork base 偏移没走自动合并）——`docs/plan/PLAN-016.md` `implementing → completed` + commit/merge hash 回填 + Outcomes 段；`docs/plan/index.md` PLAN-016 `[ ] → [x]` + Updated 头时间戳；`docs/task/REFACTOR-003.md` `[-] → [x]` + completedAt（**REFACTOR-003 总收官**）；`docs/task/index.md` REFACTOR-003 `[-] → [x]`。

测试基线变化：

- `apps/cli` 0 → **13** pass（S1 单测：dry-run / user / system 路径推断 / `--out` 覆盖 + 幂等 / `--no-enable` 等共 13 case）。
- 其他包（apps/api / apps/gateway / packages/core / packages/shared / packages/gateway-proto / apps/web）**无变化**——本 plan 不动业务实现。
- `scripts/deploy.ts deploy --dry-run` 仍能正确出图（实现未变），可作为 docker 形态 smoke。

保留的不变量（再次验证）：

- fleet.db / worker.db 物理隔离；本 plan 完全不动 DB / schema / 加密路径。
- AES-256-GCM 封 `apiTokenEnc`；gateway 与 worker 的 crypto 模块仍有意复制。
- bearer 比对 `timingSafeEqualStrings`；hot-reload 路由 / dispatcher / subscriber 全部 `() => state.runtime` 闭包懒取。
- 所有 smoke（aiw-run / gateway-local / aim）继续绿。
- GHCR 镜像 + `scripts/deploy.ts` + `ops/compose/` **未删除任何路径**——仅文案降级。`gateway.example.test` 测试机配方完整搬到 `deployment-public-https.md`，部署能力零回归。

文档同步：

- `docs/deployment.md` / `docs/deployment-public-https.md` / `docs/architecture.md` / `docs/cli.md` / `ops/compose/docker-compose.yml` / `scripts/deploy.ts` 见 What shipped。
- `docs/plan/PLAN-016.md` 状态 `implementing → completed`，追加完成记录节（commits + 时间戳 + Outcomes 段）。
- `docs/plan/index.md` PLAN-016 改 `[x]`，更新顶部 `Updated:`。
- `docs/task/REFACTOR-003.md` / `docs/task/index.md` REFACTOR-003 `[-] → [x]`——这是本 plan 的最终交付物。

已知 follow-up（不在本批）：

- **R1（P2）**：`aim install systemd` 的 unit 模板假设 `aim` 在 `~/.bun/bin/`；打 binary 形态（PLAN-017+）后 `ExecStart` 路径需要 parameterize，届时 `aim install systemd` 将自动改写。
- launchd（macOS）+ 其他 init 系统的 `aim install` 子命令——后续按需扩展。
- 旧 GHCR 镜像下线 / `scripts/deploy.ts` 路径删除——本 plan 仅降级文案，不破兼容；将来若 docker 形态完全废弃再单独跟。

Next on the line：REFACTOR-003 收官后无后续 plan 排期。下一个独立特性按 BKD 看板新增。

## 2026-04-25 PLAN-015 完成

**PLAN-015 landed: worker/** 物理抽离至 `@aiworker/core`.** REFACTOR-003 收尾，把 `apps/api/src/worker/**` 整树（除 Hono 路由）+ `apps/api/src/config/{worker,common}.ts` + `apps/api/src/adapters/{mcp,openai}` + `apps/api/src/shared/lib/{ids,app-error}.ts` + 对应 test-fixtures 整体搬到 `packages/core` / `packages/shared`，删除 `apps/api/src/lib.ts` 桥面，新增 ESLint `no-restricted-imports` guard 锁边界，新增 hot-reload 闭包不变量回归测。**纯物理重排，零行为变更**。

What shipped:

- 新包 `@aiworker/core`：transport-agnostic worker runtime；不依赖 `hono` / `@hono/*` / `@scalar/*`；公共面 `packages/core/src/index.ts`（对齐原 `lib.ts` + 增补 Hono 路由层所需 helper：`buildInfo` / `handleBrainTest` / `handleChannelTest` / `handleExecutorTest` / `ChannelRegistry` / `ApprovalStore`）。
- `apps/api` 瘦身到 Hono 路由 + middleware + 入口装配；新增 `@aiworker/api/bootstrap` 子路径供 `aiw serve` 拿 `bootstrapWorkerApp` / `createWorkerApp` / `WorkerModeState`。
- `packages/shared` 接收 `lib/ids.ts`（`mintWorkerId` / `slugify`）+ `errors.ts`（`AppError`，重命名自 `app-error.ts`），通过 `packages/shared/src/index.ts` re-export。
- ESLint guard：`packages/core/**/*.ts` 禁止 import `hono` / `hono/*` / `@hono/*` / `@scalar/*` / `apps/*`，CI 拦下任何回退。
- Hot-reload 回归测 `packages/core/src/worker/runtime.test.ts`（3 case）：闭包 `() => state.runtime` 在 swap 后返回新实例；旧 runtime 的 `cron.stop` / `approvals.dispose` 各卸恰好一次；`dispose` 后挂起 approval 立即以 `deny` 解锁。
- `Dockerfile` 同步：`deps` stage `COPY packages/core/package.json`，`runtime` stage `COPY --from=build /app/packages/core /app/packages/core`；版本常量注释路径从 `apps/api/src/worker/executor/...` 更新为 `packages/core/src/worker/executor/...`。
- `apps/cli` 的 5 条命令（`context` / `token` / `config` / `approvals` / `schedule`）改 `@aiworker/api/lib` → `@aiworker/core`；`serve` 命令额外从 `@aiworker/api/bootstrap` 取 Hono 入口。

测试基线变化：

- `apps/api` 410 → **32**（worker 业务测整体迁出，留 routes / bearer-auth 路由层）
- `packages/core` 0 → **381**（迁入 + 新增 3 hot-reload regression）
- `@aiworker/shared` 18（无变化）/ `@aiworker/gateway` 55（无变化）/ `@aiworker/gateway-proto` 11（无变化）/ `@aiworker/web` 24+13 skipped（无变化）
- 总 runtime pass：481 → **521**（净 +40，主因 shared 18 全量纳入统计 + 3 hot-reload regression）

保留的不变量（再次验证）：

- fleet.db / worker.db 物理隔离不变；workers/** 跨边界仍走 manager → gateway → worker 透传。
- AES-256-GCM 封 `apiTokenEnc`；gateway 与 worker 的 crypto 模块仍有意复制（边界不可融合）。
- `() => state.runtime` 闭包懒取在跨包后仍成立，由新增 regression 守。
- evolution observer / cron tick / approvals gate 均不进 orchestrator hot path。

文档同步：

- `docs/architecture.md` Monorepo Layout 段加入 `packages/core` + 描述更新；`apps/api` 描述瘦身。
- `docs/plan/PLAN-015.md` 状态 `implementing → completed`，追加完成记录节（commits + 时间戳 + Outcomes 段）。
- `docs/plan/index.md` PLAN-015 改 `[x]`，更新顶部 `Updated:`。

Next on the line：PLAN-016（部署形态调整：CLI-first 安装 + docker 作为可选 fast-launch）。

## 2026-04-25 PLAN-014 完成

**PLAN-014 landed: envelope upgrade + per-tool approvals + provider fallback + cron.** 来自 REFACTOR-003 调研结论的四个独立特性，按 BKD 五子任务并行落地（W1 → W2 三路并发 → W3 文档收尾），全部合入 main，保留 PLAN-004 / PLAN-013 既有不变量。

What shipped:

- **F1 — Envelope 路由维度**（feat 02c2b56 / merge 41d6c7b）——`Envelope` 加 **必填** `accountId` 与可选 `richMetadata`（`isEdit` / `isDelete` / `replyTo` / `quote` / `reactions`）；`messages` 表新增 `rich_metadata` 列（migration `0001_secret_dagger.sql`，仅 `ALTER ADD`）。5 个 channel adapter 各自派生 accountId（telegram→`botUsername`、whatsapp→`phoneNumberId`、lark→`appId`、line→`sha256(channelAccessToken)` 前 8 字节、web→`binding.id`），并提取 reply / edit / delete 信号。系统派发路径用保留前缀 `sys:` 命名空间隔离 channel binding 命名空间——`sys:task` / `sys:gateway` / `sys:cli` / `sys:cron`。
- **F2 — Per-tool approvals**（feat 07908be / merge 62fd614）——`WorkerConfig.toolPolicy?` 三态语义：`auto` / `ask`（60s 超时按 deny） / `deny` 短路。orchestrator 在 `runTool` 路径加 policy gate；`ApprovalStore` 在 `runtime.dispose()` 时全部 `resolve('deny')`（不能 reject——orchestrator 用 await 拿决策）。`@aiworker/gateway-proto` 新增 `approval.list` / `approval.grant` 方法 + `APPROVAL_REQUESTED` 事件（gateway 仅透传，与 `chat.send` / `config.*` 一致）。worker 本地 HTTP 端点 `GET /api/worker/approvals` + `POST /api/worker/approvals/:taskId/:toolCallId/grant` 给 `aiw approvals-list` / `aiw approvals-grant` 用；operator 侧 `aim approvals list/grant` 走 gateway WS。
- **F3 — Provider fallback chain**（feat 8af3069 / merge 034e1f2）——`ExecutorConfig.fallbacks?` 嵌套结构（每条 `executor + onErrorKinds + maxRetries?`）；`FallbackExecutor` wrapper 包裹 primary，按 `inferErrorKind` 六分类（`rate-limit` / `timeout` / `auth` / `network` / `server-5xx` / `unknown`）匹配 fallback 项，保留 `auth` 在 401+5xx 文本冲突时的优先权 + `AbortError` 在 fetch 失败叠加时归 `timeout`。`buildExecutor` 检测 `fallbacks` 后递归构造嵌套包装，wrapper 与 `ExecutorProvider` 一一对应（不进 orchestrator）。**已 yield 流后不重放**——chat 已下发首事件后直接冒泡，避免半截 transcript 与双流叠加。
- **F4 — Cron 调度**（feat 1442360 / merge 2f00d6e）——新表 `cron_jobs`（migration `0002_jazzy_moondragon.sql`）；`CronService` 60s `setInterval` tick + CRUD，挂在 `runtime.build/dispose` 上；fire 顺序"先算 next → 写库 → ingest"避免重复触发；用 `cron-parser ^5.5.0` 校验 + 计算下一次 tick；fire 时合成 `sys:cron` envelope 喂 `orchestrator.ingest`，**绝不进 orchestrator hot path**。`@aiworker/gateway-proto` 新增 `cron.list` / `cron.add` / `cron.remove` / `cron.update` 方法；operator `aim schedule list/add/remove`；worker 本地 `aiw schedule-list/-add/-remove`（直接 in-process CronService CRUD，与 `aiw config-show` 模式一致）。

测试基线变化：

- `apps/api` 346 → **410**（+64：F1 channel adapter 12 + F2 policy/store/gateway-client 32 + F3 fallback 19 + F4 cron service 12 + management 路由若干，向 410 收敛）
- `apps/gateway` 52 → **55**（+3：approvals + cron 透传单测）
- `packages/gateway-proto` 0 → **11**（新协议字段单测）

保留的不变量（验证过）：

- fleet.db / worker.db 物理隔离；fleet.db 永不写 toolPolicy / cron job / approval 等业务态。
- AES-256-GCM 封 `apiTokenEnc`；gateway 与 worker 的 crypto 模块仍有意复制。
- bearer 比对 `timingSafeEqualStrings`；hot-reload 时路由 / dispatcher / subscriber 全部 `() => state.runtime` 闭包懒取；`reloadRuntime` 串行化。
- evolution observer 离 hot path；F2 policy gate / F4 cron tick 也都不进 orchestrator hot path。

文档同步：

- `docs/architecture.md` 新增 §"PLAN-014：envelope / approvals / fallback / cron" 段落（F1-F4 各自语义边界 + 不变量 + sys:* 保留前缀表）。
- `docs/cli.md` aiw 节追加 `approvals-list/-grant` + `schedule-list/-add/-remove`；aim 节追加 `approvals list/grant` + `schedule list/add/remove`。
- `docs/plan/PLAN-014.md` 状态 `implementing → completed`，追加完成记录节。
- `docs/plan/index.md` PLAN-014 改 `[x]`。

已知 follow-up（不在本批）：

- `cron_jobs` 在 `reloadRuntime` 极短窗口内可能出现双 setInterval（fire 顺序保证不会重复触发同一 job，`lastRunAt` 可能早 1s 写）—— P2，未修。
- `evolution_observations` 仍随对话线性增长，需要 TTL / 滚动压实策略（PLAN-004 既存遗留）。

Next on the line：PLAN-016（部署形态调整：CLI-first 安装 + docker 作为可选 fast-launch）。

## 2026-04-24 22:30 [progress]

**PLAN-013 landed: aim CLI + WS gateway — full replacement of dashboard REST.** 控制面从 Hono REST（`apps/api/src/dashboard/**`）整体迁到 WebSocket 协议，operator（aim CLI + web）与 node（worker 容器）共享同一条 `/ws` 入口；dashboard 模式从此下线。PLAN-013 在 main 上按 6 个 subtask 落地，保留所有不变量（fleet.db / worker.db 物理隔离、AES-256-GCM 封 token、bearer timing-safe、hot-reload 串行化）。

What shipped:

- **新包 `@aiworker/gateway-proto`**（commit daf7ba9）——纯类型 + zod 运行时校验。`METHODS`（12 个）+ `EVENTS`（8 个）+ `Frame`（connect / request / response / event）注册表由 aim、web、gateway、worker 四侧共享。`operator-to-node` vs `operator-to-gateway` 路由判别自带。
- **新 app `apps/gateway`**（commit b56abf8，supervisor 搬家 2021767）——`Bun.serve(:3000, websocket)` 单入口；`/ws` 承接 WS 升级，`/health` 返回 JSON 心跳。三件内存 registry（`NodeRegistry` / `OperatorRegistry` / `ForwardTable`）管理连接生命周期与在途 request；AES-256-GCM 密钥 `AIWORKER_MASTER_KEY` 给 `registered_workers.apiTokenEnc` 加解密；远程连接需 `INTERNAL_SHARED_SECRET` bearer，loopback 放行空 token。
- **FleetSupervisor 搬迁**（commit 2021767）——原 `apps/api/src/dashboard/supervisor/` 整树搬到 gateway 侧，`workers.pair` / `workers.launch` / `token.rotate` 作为 `operator-to-gateway` 方法实现；`AIWORKER_GATEWAY_CAN_LAUNCH=true` 时持 `/var/run/docker.sock:ro` 自动拉 worker 容器 + scrape bootstrap 行自动配对。配额 `AIWORKER_MAX_WORKERS` 应用到 pair 与 launch 两条路径。
- **新 `aim` CLI**（commit 32d59b0）——operator 侧 bin，与 `aiw` 并列发布。子命令 `gateway start|status|stop` / `pair` / `workers list|info|launch|stop|remove` / `chat` / `config get|set` / `token rotate` / `logs`；状态文件 `~/.aiworker/aim.json`（0600）持久化 `gatewayUrl` / `deviceId` / `deviceToken` / `defaultWorkerId`。cac 的两词子命令通过 argv 预处理合并。
- **worker node 模式**（commit 8ecd76a）——`aiw serve --gateway ws://...` 在 HTTP server 之外再拨一条 WS 连接，作为 `role=node` 注册。`startGatewayNode` 走 `getRuntime()` 懒取，兼容 hot-reload；dispatcher 处理入站 `chat.send` / `config.get` / `config.put` / `token.rotate` / `logs.tail`，subscriber 把 `WorkerEventBus` 事件 emit 成 `agent.*` / `chat.message` / `config.changed` / `logs.line` 帧。SIGTERM 优雅关两条路径。
- **web 切到 WS**（commit dc2d277）——`apps/web/src/lib/api.ts` 的 REST 全量移除，改走单例 WS client（与 aim 共享 `@aiworker/gateway-proto`）。浏览器经 Caddy 反代连 gateway，属 gateway 视角的 loopback，无需再叠 basic auth。24 个测试保留，另有 13 个 REST fixture 转为 `.skip` 等待重写。
- **dashboard 整段删除**（commit 3d9637f）——`apps/api/src/dashboard/**` 13 源文件 + 10 测试 + `modes/dashboard.ts` + `config/dashboard.ts` 全部下线。`apps/api/src/index.ts` 不再分叉，直接 `createWorkerApp`；`AIWORKER_MODE=worker` 变量仍兼容运维脚本，但 `=dashboard` 取值已失效。
- **ops 迁移**（commit f759744）——`ops/compose/docker-compose.yml` service 从 `aiworker-dashboard` 改名 `gateway`（容器 `aiworker-gateway`），`command: ['bun','apps/gateway/src/index.ts']` 覆盖 Dockerfile 默认 worker ENTRYPOINT；Dockerfile 拷贝 `apps/gateway` 源码入镜像（未 bundle，直接 `bun` 执行）；env 从 `MANAGER_POLL_*` / `MANAGER_CAN_LAUNCH` / `DASHBOARD_REQUIRE_AUTH` 全部下线，替换为 `AIWORKER_GATEWAY_CAN_LAUNCH` + `AIWORKER_MAX_WORKERS` + supervisor 子配置。
- **测试基线**：`apps/api` 450 → 346（删 dashboard 相关 104 条），`apps/gateway` 0 → 52（38 baseline + 新增 pair/launch/token.rotate 单测），`apps/web` 24 + 13 skipped。`bun run check` 全仓绿。

保留的不变量：

- fleet.db / worker.db 物理隔离；fleet.db 只存 `registered_workers` + `audit_events`。
- AES-256-GCM 封 token；gateway 与 worker 的 crypto 模块有意复制（master key 不同）。
- Bearer 比对 `timingSafeEqualStrings`；loopback 放行的判定 `127.0.0.1` / `::1` / `::ffff:127.0.0.1` / `localhost`。
- Hot-reload：路由 / dispatcher / subscriber 全部 `() => state.runtime` 闭包懒取；`reloadRuntime` 串行化。

文档同步：`docs/architecture.md`（改写 topology + 角色）、`docs/cli.md`（新增 `aim` 节 + `aiw serve --gateway`）、`docs/gateway.md`（新建——协议参考 / pairing 流程 / 故障恢复）、`docs/deployment.md`（替换——gateway 部署 run book）、`docs/plan/PLAN-013.md`（状态置 completed 并列出交付 commit）、`docs/plan/index.md`（PLAN-013 改 `[x]`）。

Next on the line：PLAN-014（envelope + 每工具审批 + provider fallback + cron）与 PLAN-015（`apps/api/src/worker/**` 物理搬迁到 `packages/core`）。

## 2026-04-24 16:30 [progress]

**PLAN-012 landed: filesystem source of truth for brain + skills + memory (REFACTOR-003, decision A1 / Hermes-moat / C1 / D1).**

Post-phase-1a research on Hermes Agent + OpenClaw confirmed both projects are instances of the same long-running-agent-daemon pattern (one conversation loop, many entry points, filesystem-owned skills + memories). AIWorker's current shape — fleet manager + per-worker runtime — is already OpenClaw RFC 42026's proposed split, so the refactor doesn't touch topology. It targets the real gaps instead: data-domain source of truth (this plan), remote-control protocol (PLAN-013), envelope + approvals + fallback + cron (PLAN-014), physical `packages/core` extraction (PLAN-015). The original PLAN-012 — mechanical move of `apps/api/src/worker/**` into `packages/core` — was superseded; it's now PLAN-015 and runs last.

What shipped:

- **New package `@aiworker/fs-layout`** — owns the `~/.aiworker/` path convention. Exports `resolveWorkerHome`, `resolveBrainHome`, `resolveSkillsDir`, `resolveMemoriesDir`, `resolveConfigYamlPath`, `resolveAgentMdPath`, `resolveSoulMdPath`, `resolveUserMdPath`, and the idempotent `ensureWorkerHome(workerId)` seeder. `AIWORKER_HOME` env overrides the root (default `~/.aiworker`).
- **`HermesProvider` → `FilesystemBrainProvider`** — file moved from `apps/api/src/worker/brain/providers/hermes.ts` to `apps/api/src/worker/brain/providers/filesystem/index.ts`. `HermesApiClient` (the vestigial `/health` probe over HTTP) deleted; health now uses `access(home)`. Scanner + watcher + types moved alongside (from `apps/api/src/adapters/hermes/` which is now empty and removed). The provider drops `apiUrl` and takes only `home`.
- **Shared types renamed**: `HermesBrainSourceConfig` → `FilesystemBrainSourceConfig` (no `apiUrl` field; `home` is optional and defaults via the factory to `resolveBrainHome(workerId)`). Discriminator `type: 'hermes'` → `type: 'filesystem'`. Re-export list in `packages/shared/src/index.ts` + `packages/shared/src/fleet/index.ts` updated.
- **`buildBrain` signature** now takes `(workerId, config)` so the factory can default the brain home via fs-layout. `runtime.ts` threads the workerId through.
- **`ensureWorkerHome` hooked into `loadOrMintIdentity`** — both existing + just-minted paths seed the tree, so `aiw init` and the HTTP worker mode produce identical on-disk layouts.
- **Config yaml mirror** — `putConfig` gained a new sibling `mirrorConfigToYaml(workerId, config, version)`. Both the HTTP `PUT /api/worker/config` and `aiw config-set` call it after the DB write. `~/.aiworker/workers/<id>/config.yaml` is advisory (DB remains authoritative); a future WS gateway + `aim config edit` can promote it to source-of-truth.
- **Dashboard web UI** — `BrainSection` form updated: `Hermes` button → `Filesystem`; `apiUrl/home` pair → single optional `home` field; type discriminator select option `hermes` → `filesystem`. Config-editor integration test fixture updated.
- **Legacy env wipe** — `BRAIN_PROVIDER`, `HERMES_API_URL`, `HERMES_HOME`, `OPENCLAW_WS_URL`, `OPENCLAW_HOME` deleted from `apps/api/.env.example`. `AIWORKER_HOME` added. No runtime code ever consumed these — they were ornamental.

Verification:

- `bun run check` clean (typecheck across 6 packages + eslint).
- `bun run --filter '@aiworker/api' test` — 450 pass / 0 fail (parity).
- `bun run --filter '@aiworker/cli' smoke:aiw-run` — PASS.
- Manual E2E: `aiw init` with a tmp `AIWORKER_HOME` produces `workers/<id>/{AGENT.md,SOUL.md,USER.md,config.yaml-missing-until-first-set,brain/{MEMORY.md,memories/,skills/},workspaces/}` exactly as specified. `aiw config-set '<json>'` writes `config.yaml` with the round-tripped redacted form.

Next on the line: PLAN-013 (`aim` CLI + WS gateway, fully replacing dashboard REST).

## 2026-04-24 12:30 [progress]

**PLAN-011 phase 1a landed: CLI-first lightweight runtime (storage-sqlite + aiw).** First concrete step of REFACTOR-003 toward a hermes-style CLI + an openclaw-style gateway. The conversation loop can now run without binding any HTTP port.

What shipped:

- **New package `@aiworker/storage-sqlite`** — physically extracted `apps/api/src/db/**`, `apps/api/drizzle/**`, and both `drizzle.*.config.ts` files into `packages/storage-sqlite/`. Subpath exports `./fleet` + `./worker` keep the data-domain boundary narrow (a route handler should import from the subpath it actually touches). Package also exports `defaultFleetMigrationsFolder` / `defaultWorkerMigrationsFolder` resolved via `import.meta.url`, so CLI + scripts no longer hardcode `./drizzle/...` relative paths.
- **New app `@aiworker/cli`** with the `aiw` binary (cac-based argv). Subcommands: `init` (mint identity + seed config), `run --message <text> [--dry-run]` (feed one envelope through the orchestrator, stream events to stdout, exit), `serve [--port <n>]` (bit-for-bit equivalent of `AIWORKER_MODE=worker`), `config-show`, `config-set <json> [--if-match <v>]`, `token-rotate`. `aiw run --dry-run` is the phase-1 success demo — it boots the runtime in-process with zero HTTP binding.
- **Lazy env parsing** — `apps/api/src/config/worker.ts` now parses `process.env` on first property access (Proxy-backed `workerEnv` + explicit `getWorkerEnv()`). `aiw --help` / `aiw --version` no longer require `AIWORKER_MASTER_KEY`, which matters for CI and first-time users reading the CLI docs.
- **`apps/api` library surface** — new `./lib` subpath export (`apps/api/src/lib.ts`) re-exports the transport-agnostic seams (`buildWorkerRuntime`, `loadOrMintIdentity`, `putConfig`, `handleTokenRotate`, `bootstrapWorkerApp`, ...). `apps/cli` consumes this; phase 1b will physically move these seams into `packages/core` and delete the re-exports.
- **29-file import sweep** — every `../db/*` / `../../db/*` import under `apps/api/src/**` rewritten to `@aiworker/storage-sqlite/{fleet,worker}`. Test fixtures dropped their hardcoded `./drizzle/worker` path — the package default kicks in.
- **Ops** — `Dockerfile` copies `packages/storage-sqlite/drizzle` into `/app/drizzle` (same runtime path as before, so `WORKER_MIGRATIONS_FOLDER=./drizzle/worker` stays valid). `bun run db:generate` now delegates to the storage-sqlite workspace.

Verification:

- `bun run check` clean (typecheck across shared / storage-sqlite / web / api / cli + eslint).
- `bun run --filter '@aiworker/api' test` — 450 pass / 0 fail (parity with the pre-refactor baseline).
- `bun run --filter '@aiworker/cli' smoke:aiw-run` — PASS: `aiw init` + `aiw run --message hello --dry-run` completes with "runtime constructed" in stdout.
- Manual `aiw --help` / `aiw config-show` / `aiw token-rotate` against a tmpdir db — all functional.

Scope notes:

- The 107-file physical move of `apps/api/src/worker/**` → `packages/core/src/worker/**` is deferred to PLAN-012 (phase 1b). Rationale: the 29-file db move + CLI shell is a clean atomic merge; the worker tree move is mechanical but brings cross-cutting helper imports (`config/worker`, `shared/AppError`, `shared/lib/ids`) that deserve their own review cycle. See `docs/plan/PLAN-011.md` §"Execution split" for the full phase-1a / 1b boundary.
- `aim` CLI (manager side) and the WebSocket gateway (`aim gateway`) remain out-of-scope here — tracked by PLAN-013 / PLAN-014 once phase 1b lands.

## 2026-04-23 09:55 [progress]

**PLAN-010 / FEAT-023 manager-driven worker creation landed.** The dashboard now has a dedicated "Create worker" button that spawns a fresh worker container on the local docker engine end-to-end (supervisor `launchLocal` → token scrape → registry insert), surfaces the one-time plaintext bearer to the operator (like a GitHub PAT), and is gated by two new safety rails:

- **`DASHBOARD_REQUIRE_AUTH=true`** flips on a bearer/basic middleware guarding `/api/*`. Same shared secret (`INTERNAL_SHARED_SECRET`) handles both CI (`Authorization: Bearer …`) and browsers (native `Basic` prompt via `WWW-Authenticate`). Default is `false` so the rollout can sequence authN-first, then overlay-second.
- **`MANAGER_MAX_WORKERS`** applies a hard cap to both `/register` and `/launch-local`, returning `409 { code: 'quota-exceeded', limit, current }` on overflow. Omit for no cap.

`FleetSupervisor` also grew a startup self-check that refuses to launch if the dashboard container isn't joined to `aiworker_default`, catching the most common single-host misconfig instead of silently producing zombie `offline` registry rows. `ensureInfrastructure()` now calls `inspectContainer(HOSTNAME)` and asserts membership; soft-fails on bare metal or when the hostname isn't a docker container id.

Ops:

- New `ops/compose/docker-compose.supervisor.yml` overlay mounts `docker.sock:ro` + `/opt/aiworker-workers` and turns on the launcher env bundle. Compose with `-f docker-compose.yml -f docker-compose.supervisor.yml`. Default deploy unchanged.
- `docs/deployment.md` gained a full "Enabling manager-driven worker creation" runbook: prerequisites (authN before sock mount), compose overlay, smoke test (`curl -u :$INTERNAL_SHARED_SECRET …/api/workers/capabilities`), rollback, pitfalls (network membership, data path, master-key backup).
- `ops/compose/.env.example` commented with the new optional envs.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — api 450 pass (baseline 429 + 21 new: 11 auth middleware + 4 supervisor self-check + 6 capabilities/quota routes), web 37 pass unchanged.
- `bun run lint` — 0 errors.

## 2026-04-23 08:56 [release]

**PLAN-009 worker image bundling + model picker complete.** Four FEATs (FEAT-019 / 020 / 022 / 021) landed across one day. Net effect: engine picker shows known-model presets instead of free text; every build pushes two image tags (slim / full); `-full` pre-installs all five agentic CLIs (claude-code / codex / gemini-cli / qwen-code / cursor-agent) so workers skip the `npx` cold fetch; operator docs + `docker-compose.worker.example.yml` enumerate auth-mount recipes.

FEAT-021 — final step — delivered via BKD worktree subtask `s306n1zj` commit `2dae80a`, merged in `7928639`. 4 files, +33 / −16 (Dockerfile + docs).

Dockerfile:

- `runtime-full` stage gains a Cursor agent install step. Since Cursor has no npm package, we use the official `curl -fsSL https://cursor.com/install | bash` script. The installer drops cursor-agent as a bash wrapper at `~/.local/bin/cursor-agent` that resolves its sibling `node` binary via `realpath $0`, so we re-symlink `/usr/local/bin/cursor-agent` at the same versioned binary instead of copying the file. `cursor-agent --version` runs at build time as a sanity gate.
- `bash -euo pipefail -c '...'` wraps the RUN so curl failures on the pipe side fail the build (default dash swallows them).

Docs:

- `docs/executor-engines.md` #cursor section updated: `-full` image now pre-installs cursor-agent; slim still requires the manual installer. Top-level slim/full table size bumped to ~320 MB.
- `docs/deployment.md` Slim vs Full table expanded to include cursor-agent.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 18, api 429, web 37.
- `bun run lint` — 0 errors.
- GHCR build `24826143375` double-tag push succeeded (3m41s; slim cache hit → only full stage paid network). All 5 CLIs' `--version` gates passed inside `-full` layer.

### PLAN-009 final tally (FEAT-019 → FEAT-022 → FEAT-021)

| FEAT | Scope | Delta |
|---|---|---|
| 019 | Per-variant `knownModels` catalog + lean preset `<select>` + `Custom…` escape | web tests +5 |
| 020 | Dockerfile `runtime-full` stage, dual-tag GHCR publish, `--image-variant` deploy flag, `AIWORKER_IMAGE_VARIANT_SUFFIX` compose env | ops + docs only |
| 022 | `docker-compose.worker.example.yml` + auth recipes in executor-engines + Register dialog `<details>` hint | docs + 1 frontend component |
| 021 | Cursor agent bake (symlink + realpath) | Dockerfile + docs |

- shared tests: 18 (unchanged this plan).
- api tests: 429 (unchanged this plan).
- web tests: 32 → **37** (+5 FEAT-019).
- lint baseline: 0 → 0.
- Image tags per push: 1 → **2** (`<sha>` slim + `<sha>-full`).

### Runtime capabilities post-PLAN-009

- **Dashboard runs on slim** — it doesn't need agentic CLIs.
- **Worker can pick slim or full** per compose. Full adds ~170 MB but skips first-use npx / curl fetches for every agentic engine.
- **Picker UX** — variant form fields with a `knownModels` entry render as preset `<select>` + `Custom…`; free text is still one click away, but typos are no longer the default.
- **Auth still operator's job** — pre-install ≠ pre-login. Register dialog now nudges operators to the recipe docs.

Pointer: `docs/plan/PLAN-009.md` (status `completed`), `docs/task/FEAT-019.md` / `FEAT-020.md` / `FEAT-021.md` / `FEAT-022.md`.

## 2026-04-23 05:35 [release]

**PLAN-008 worker registration UX + engine availability complete.** Two FEATs (FEAT-017, FEAT-018) landed on main in a single calendar day on top of PLAN-007's GA.

Final FEAT — **FEAT-018 Engine availability discovery** — delivered via BKD worktree subtask `cly4ayr3` commit `c5d9db8`, merged in `d5332f5`. 16 files / +1327 / −87. No rework (base `aa10f69` picked up correctly).

Shared:

- **New** `packages/shared/src/providers/availability.ts` — `EngineAvailability`, `EngineAvailabilityStatus` (`ready | login-required | not-found`), `EngineAvailabilityResponse`. Re-exported via `@aiworker/shared`.

API:

- **New** `apps/api/src/worker/executor/availability.ts` — singleton `AvailabilityProbe` with dependency-injected `fsExists` / `resolveBinary` for hermetic tests, 10-minute cache, `resetAvailabilityProbeForTests()` helper. Covers all seven `EngineKind` (acp expands to `{agent:'gemini'}` and `{agent:'qwen'}`). File-presence probes only — no `--version` shell-outs, no network.
- `apps/api/src/worker/executor/engines/acp/agents/{gemini,qwen}.ts` — inline `authProbe` removed; both agents now import from the shared `availability.ts`. One source of truth for engine probing.
- `apps/api/src/worker/management/routes.ts` — new bearer-authed `GET /api/worker/engines` with `?refresh=1` cache-bust query, returns `{engines: EngineAvailability[]}`.

Web:

- `apps/web/src/features/workers/hooks.ts` — `useWorkerEngines(workerId)` hook (TanStack Query, 10-minute stale) + `refreshWorkerEngines(workerId)` helper.
- **New** `apps/web/src/features/workers/components/config-editor/engine-availability.ts` — status → dot-color + short-label mapping, extracted out of `executor-section.tsx` to appease `react-refresh/only-export-components`.
- `apps/web/src/features/workers/components/config-editor/executor-section.tsx` — engine picker renders availability badge per option; `acp` variant sub-picker shows per-agent (gemini / qwen) badge; not-installed engines stay clickable and the variant panel shows a callout linking to `docs/executor-engines.md#<engine>`. Refresh icon-button invalidates the engines query.
- `apps/web/src/lib/api.ts` — `fetchWorkerEngines(workerId, refresh?)` client helper.

Docs:

- **New** `docs/executor-engines.md` — one section per non-trivial engine (claude-code / acp-gemini / acp-qwen / codex / cursor) with install command, auth command, container-embedding guidance.

Tests (+22):

- `apps/api/src/worker/executor/availability.test.ts` (+16) — three-status matrix across all engines, cache behaviour, refresh path.
- `apps/api/src/worker/management/routes.test.ts` — bearer-auth + shape + `?refresh=1` cases.
- `apps/web/.../executor-section.test.tsx` (+6) — three-badge render, not-installed callout, Refresh click.

### PLAN-008 final tally (FEAT-017 → FEAT-018)

| FEAT | Scope | Tests added |
|---|---|---|
| 017 | Register dialog UX: better Base URL guidance + client-side token generator + `AIWORKER_FORCE_TOKEN` helper | shared +6 |
| 018 | Worker-side engine probe + `GET /api/worker/engines` + frontend availability badges + install docs | api +16, web +6 |

- shared tests: 12 → **18** (+6 from FEAT-017).
- api tests: 413 → **429** (+16).
- web tests: 26 → **32** (+6).
- lint baseline: 0 → 0.

Pointer: `docs/plan/PLAN-008.md` (status `completed`), `docs/task/FEAT-017.md`, `docs/task/FEAT-018.md`.

## 2026-04-23 05:15 [progress]

PLAN-008 step 1 / 2 — **FEAT-017 Register dialog UX polish** landed. Fixes two operator papercuts surfaced during the post-PLAN-007 smoke on `https://gateway.example.test`.

Shared:

- `packages/shared/src/fleet/worker-identity.ts` — new `generateWorkerApiToken()` producing `wtk_` + 43 chars base64url of 32 CSPRNG bytes. Re-exported through `@aiworker/shared/fleet` and `@aiworker/shared` root.
- `packages/shared/src/fleet/worker-identity.test.ts` (new) — 6 cases: prefix, pattern match (100 samples), length, uniqueness over 1000 invocations, base64url alphabet.

Web:

- `apps/web/src/features/workers/components/register-wizard.tsx` — `Base URL` placeholder now `http://aiworker-worker:3000`; inline helper line enumerates the three typical shapes (same-compose / reverse-proxy / direct-port). Bootstrap API token row gains a `Generate` button that calls `generateWorkerApiToken()`, prefills the field, and surfaces a helper block containing the ready-to-paste `AIWORKER_FORCE_TOKEN=<token>` env assignment with copy-to-clipboard. Generated-value tracking invalidates itself on manual edit to avoid stale helper blocks. Import of `WORKER_API_TOKEN_PREFIX` from `@aiworker/shared` replaces the local duplicate constant.

Docs:

- `docs/deployment.md` — new subsections `Worker base URL formats` (three-shape table + pitfalls) and `Bootstrap token options` (manual vs dashboard-generated + `AIWORKER_FORCE_TOKEN` one-shot semantics).

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 18 / 18 (+6), api 413 / 413, web 26 / 26.
- `bun run lint` — 0 errors.

Pointer: `docs/plan/PLAN-008.md`, `docs/task/FEAT-017.md`.

## 2026-04-22 19:15 [release]

**PLAN-007 multi-engine executor refactor complete.** All 6 FEAT (FEAT-011..016) landed on main. AIWorker workers now support 7 executor engines behind a three-tier config + slot-aware scheduler.

Final FEAT in this batch — **FEAT-015 ProcessManager replacing AsyncQueue** — landed via BKD worktree subtask `igjbbb7t` commit `7eed7d1`, merged in `d2c3be3`. 15 files, +1367 / −30.

Note on the rework path: the first-pass subtask delivery forked from `9f2426c` (pre-FEAT-011 baseline) and would have regressed the three-tier profile architecture if merged. Coordinator caught the base mismatch during merge-time diff review, rejected the subtask with explicit `git reset --hard origin/main` + scope-narrowing instructions, and only merged on the second delivery.

### FEAT-015 delivery

- `apps/api/src/worker/orchestrator/process-manager.ts` (new, 676 LOC) — generic `ProcessManager<TMeta>` with slot quotas (global + per-engine), group keys (`conversationId`), priority enum (`interactive | default | background`), stall detection (no-activity timer with escalating cancel), auto-cleanup GC, hot-reload `setLimits()`.
- `apps/api/src/worker/orchestrator/process-manager.test.ts` (new, 436 LOC) — 16 cases covering slot caps, per-engine limits, group FIFO, priority, stall escalation, kill timeout, setLimits, cancelGroup, snapshot.
- `apps/api/src/worker/orchestrator/queue.ts` **deleted** — 10-line `AsyncQueue` fully replaced.
- `apps/api/src/worker/orchestrator/service.ts` — `ingest` and deferred workspace-dispose now go through `processes.run(...)`. `onActivity` fires on every `AgentEvent` (stall heartbeat). `cancel` propagates to `AgentRunInput.signal` → engine SIGTERM/SIGKILL.
- `apps/api/src/worker/runtime.ts` — `processes: ProcessManager` hoisted to runtime singleton; survives `reloadRuntime()`.
- `apps/api/src/config/worker.ts` — new env schema: `MAX_CONCURRENT_TOTAL`, `MAX_CONCURRENT_<ENGINE_UPPER>` (`CLAUDE_CODE`, `ACP`, `CODEX`, `CURSOR`, `HTTP`, `MCP`, `CLI`), `PROCESS_STALL_TIMEOUT_MS`, `PROCESS_KILL_TIMEOUT_MS`, `PROCESS_AUTO_CLEANUP_MS`.
- `apps/api/.env.example` — new env vars documented.
- `apps/api/src/worker/management/routes.ts` + `routes.test.ts` — `GET /runtime/processes/capacity` bearer-auth'd, reports live snapshot. Dashboard can now read slot budgets.
- `apps/api/src/modes/worker.ts` — ProcessManager wired into runtime construction; hot-reload calls `setLimits()` with latest env.

Key design decision: **slot budget configured via env vars, NOT in `ExecutorProfile`**. Ops configure runtime capacity; tenants configure executor shape. Zero file overlap with FEAT-016 — let both land in parallel without conflict.

Engine modules (`engines/claude-code`, `engines/acp`, `engines/codex`, `engines/cursor`) stay unchanged — the orchestrator wrapper alone provides slot / group / priority / stall semantics for all of them.

### PLAN-007 final tally (FEAT-011 → FEAT-016)

| FEAT | Engines / Features | Tests added (api) |
|---|---|---|
| 011 | `AgentEvent` schema + zod; OpenAI-compat migrated | 6 |
| 012 | Claude Code executor + `WorkspaceManager` | 52 |
| 013 | ACP harness + Gemini / Qwen adapters | 61 |
| 014 | three-tier `ExecutorProfile` + `DEFAULT_PROFILES` + frontend picker | 19 |
| 015 | `ProcessManager` (slot / group / priority / stall / capacity API) | 75 |
| 016 | Codex + Cursor adapters | 59 |

- api tests: baseline 158 → **413** (+255) zero regressions.
- shared tests: 0 → **12**.
- web tests: 17 → **26**.
- lint baseline cleared from 6 errors → **0**.

### Runtime capabilities post-PLAN-007

- **Seven engines** selectable per worker: `http` (OpenAI-compat + preset catalogue for DeepSeek / OpenRouter / SiliconFlow / Gemini OpenAI-compat), `mcp`, `cli`, `claude-code` (stream-json control protocol), `acp` (`gemini` / `qwen`), `codex` (JSON-RPC app-server), `cursor` (native stream-json).
- **Three-tier config**: engine × variant × overrides (`CmdOverrides` + per-request `modelId`, `reasoningId`, `permissionPolicy`).
- **Per-conversation workspace isolation** (plain dir or git worktree when `WORKER_WORKSPACE_GIT_ORIGIN` set), path-escape guard, deferred dispose via ProcessManager.
- **Slot-aware scheduler** with named priority classes, stall detection, capacity snapshot REST.
- **Legacy flat config still reads** (reader-only migration on boot); next `PUT /config` writes profile shape.
- `AgentEvent` tagged union is the single crossroad between engines and the orchestrator — adding an 8th engine only requires an `engines/<name>/` adapter + registry entry + `default-profiles.ts` variant.

### Pointers

- Design: `docs/plan/PLAN-007.md` (status `completed`).
- Per-FEAT: `docs/task/FEAT-011.md` .. `FEAT-016.md` (all `completed`).

## 2026-04-22 18:45 [progress]

PLAN-007 step 5 / 6 (delivered early, parallel with FEAT-015 rework) — **FEAT-016 Codex + Cursor agent adapters** landed. The executor fleet now covers 7 engines: `http` + `mcp` + `cli` + `claude-code` + `acp` (gemini, qwen) + `codex` + `cursor`.

Delivered via BKD worktree subtask `x28in77k` (branch `bkd/x28in77k`, commit `a1c5a4f`, merged to main in `4eba707`).

Shared:

- `packages/shared/src/fleet/executor.ts` — `EngineKind` now `'http' | 'mcp' | 'cli' | 'claude-code' | 'acp' | 'codex' | 'cursor'`; new `CodexVariantBody` + `CursorVariantBody` types, `executorProfileSchema` enum widened, `executor.test.ts` matrix gets two rows.
- `packages/shared/src/fleet/index.ts` + `packages/shared/src/index.ts` — re-export new types.

API:

- **New** `apps/api/src/worker/executor/engines/codex/` — `executor.ts` (spawns `codex app-server` / npx `@openai/codex@<version>` fallback), `protocol.ts` (re-export of `engines/acp/protocol.ts::JsonRpcPeer + splitNdjson`, zero peer duplication), `normalize.ts` (`codex/event/{assistant_message,thinking,token_usage,tool_call,tool_result,stop,error}` → `AgentEvent`, action.kind inferred by tool name), `types.ts`, `index.ts` + 3 test files.
- **New** `apps/api/src/worker/executor/engines/cursor/` — `executor.ts` (spawns `cursor-agent -p --output-format=stream-json --model ...`, stdin prompt + `stdin.shutdown()`, no npm fallback: `resolveBinary` null → `AgentEvent.error`), `normalize.ts` (imports `splitNdjson` from claude-code; local `parseCursorLine`; `session_id` captured and exposed via `getLastSessionId()`), `types.ts`, `index.ts` + 2 test files.
- `apps/api/src/worker/executor/default-profiles.ts` — `codex.default = { model: 'gpt-5.2-codex', timeoutMs: 120_000 }`; `cursor.default = { model: 'auto', timeoutMs: 120_000 }`. Variant bodies kept minimal; apiKey / sandbox / policy / extraArgs traverse `CmdOverrides`.
- `apps/api/src/worker/executor/factory.ts` — `case 'codex'` (reads `CODEX_CLI_VERSION` / `DEFAULT_CODEX_CLI_VERSION`) + `case 'cursor'` (no cliVersion — no npx fallback).
- `apps/api/src/worker/management/config-schema.ts` — engine enum + schema branches for codex / cursor.
- `apps/api/test-fixtures/cli/codex-stub.mjs` + `cursor-stub.sh` — pre-recorded wire fixtures, `chmod +x`.

Web:

- `apps/web/src/features/workers/components/config-editor/executor-variants.ts` — `ENGINE_CATALOG.codex` + `.cursor` with `z.object({ model?, timeoutMs? })` schemas.
- `executor-section.test.tsx` — 3 new cases: engine picker shows codex/cursor, cursor body renders, cursor model override persists.

Docs:

- `docs/architecture.md` — "Executor engines" section enumerates all 7 engines.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 12 / 12 (+2), api 397 / 397 (+59), web 26 / 26 (+3).
- `bun run lint` — 0 errors.

Deferred (all P2/P3):

- Codex / Cursor wire shapes may drift with CLI versions — capture live traces before production and update `normalize.ts` + stubs as needed.
- Codex `thread_fork` resume + Cursor `--resume sessionId` slots reserved but not threaded through orchestrator.
- availability probe / auth detection follow-up.
- Lift executor catalog schemas into `@aiworker/shared` (open since FEAT-014).

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-016.md`.

## 2026-04-22 18:10 [progress]

PLAN-007 step 4 / 6 — **FEAT-014 three-tier ExecutorConfig + frontend picker** landed. `ExecutorConfig` collapses from a flat 5-branch discriminated union into a three-tier `ExecutorProfile = {engine, variant, overrides?, modelId?, reasoningId?, permissionPolicy?}`. Worker stores only the diff from baked-in `DEFAULT_PROFILES`; the flat legacy shape migrates reader-side, not write-side.

Delivered via BKD worktree subtask `geb8ycbp` (branch `bkd/geb8ycbp`, 38 files, +1987 / -439). Merged to main in `a72472d`.

Shared:

- **New** `packages/shared/src/fleet/executor.ts` — `EngineKind`, `CmdOverrides`, `ExecutorProfile`, zod schemas. This is now the only shape `PUT /config` accepts.
- `packages/shared/src/fleet/config.ts` — reduced to a re-export shim over `./executor`.
- `packages/shared/src/fleet/{index.ts,worker.ts,worker-info.ts}` — re-export surface updated; `WorkerInfo` exposes `engine` + `effectiveModel`.

API:

- **New** `apps/api/src/worker/executor/default-profiles.ts` — embedded variant catalog per engine (http default / deepseek / openrouter / siliconflow presets, claude-code default + opus-plan, acp gemini / qwen, mcp default, cli default) + `resolveVariant()` merging variant body + `overrides` + `CmdOverrides`.
- `apps/api/src/worker/executor/factory.ts` — takes `ExecutorProfile`, resolves variant, threads effective config into existing engine constructors unchanged.
- `apps/api/src/worker/bootstrap/config.ts` + `default-config.ts` — `migrateLegacyExecutor()` upgrades `{type:'http'|'mcp'|'cli'|'claude-code'|'acp',...}` → profile shape on load; never writes back. Old clients `PUT`ing flat shape get 400.
- `apps/api/src/worker/config/secret-paths.ts` — secret paths now point at `executor.overrides.{apiKey,token}`; `DEFAULT_PROFILES` keeps empty-string placeholders.
- `apps/api/src/worker/management/{config-schema,executor-test,info}.ts` — zod schema, tiny probe, and `executorInfoModel` migrated to the profile shape.
- `apps/api/src/worker/orchestrator/service.ts` — `executorModel()` reads from profile.
- `apps/api/src/worker/runtime.ts` — wires profile-shaped config through the runtime.
- `apps/api/scripts/smoke-plan-004.ts` — updated to new shape.

Web:

- **Rewritten** `apps/web/src/features/workers/components/config-editor/executor-section.tsx` — two-step picker (engine select → variant select) with an advanced collapse for `CmdOverrides` + per-request overrides.
- **New** `executor-form.tsx` — lean zod-schema → form mapper (string / number / boolean / enum / array<string> / record<string,string>, JSON textarea fallback). No external form library.
- **New** `executor-variants.ts` — frontend catalog schemas (zod) so the form renders fields without a round-trip.
- `apps/web/package.json` — adds `zod` dep for the catalog schemas.
- `apps/web/src/lib/api.ts` — type surface matches the new profile shape.
- Engine switch clears `overrides` to prevent cross-engine body key contamination.

Tests (+28):

- `packages/shared/src/fleet/executor.test.ts` — schema accept / reject matrix.
- `apps/api/src/worker/executor/default-profiles.test.ts` — `resolveVariant` merge semantics; unknown engine / variant throws.
- `apps/api/src/worker/bootstrap/config.test.ts` — all 5 legacy-shape migrations map correctly.
- `apps/api/src/worker/management/{config,routes,info,executor-test}.test.ts` — stubs + assertions updated to profile shape.
- `apps/web/src/features/workers/components/config-editor/executor-section.test.tsx` + `executor-form` / `__tests__/config-editor.test.tsx` — two-step picker flow, variant schema rendering, save-payload contract.

Incidental: subtask auto-fixed all 6 pre-existing main-baseline lint errors (yaml plain-scalar in `.github/workflows/build-image.yml`, import order in `apps/api/src/modes/dashboard.ts`, quote style in `scripts/deploy.ts`). Pure `eslint --fix` changes, zero semantic impact. **New main baseline: 0 lint errors.** Future FEATs must maintain that.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 10 / 10 (+3), api 338 / 338 (+19), web 23 / 23 (+6).
- `bun run lint` — 0 errors.

Deferred:

- Frontend zod schemas + backend `DEFAULT_PROFILES` TS interfaces are two sources of truth; FEAT-016 should lift into `shared` and unify.
- Remote model discovery (vibe-kanban's `discover_options` stream) still out of scope.

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-014.md`.

## 2026-04-22 17:30 [progress]

PLAN-007 step 3 / 6 — **FEAT-013 ACP harness + Gemini / Qwen adapters** landed. Second and third agentic-CLI engines now plug into the fleet; a fourth ACP-speaking engine (Copilot, Aider, Amp, ...) requires only a new data file in `engines/acp/agents/`.

Delivered via BKD worktree subtask `9395s1ev` (branch `bkd/9395s1ev`, 18 files, +2141 / -0 all-new). Subtask self-review passed after one fixup (stub path depth `..` count). Merged to main in `128f790`.

Shared:

- `packages/shared/src/fleet/config.ts` — `ExecutorConfig` gains minimal `{ type: 'acp', agent: 'gemini' | 'qwen', model?, cliVersion?, extraArgs?, env?, timeoutMs? }` variant. Three-tier profile layer still deferred to FEAT-014.

API (all new under `apps/api/src/worker/executor/engines/acp/`):

- `harness.ts` — `AcpExecutor` implements `ExecutorProvider`: spawn resolution (PATH → npx fallback with env-driven version), stdio ACP session lifecycle (`initialize` → `newSession` → `prompt` → streaming `sessionUpdate` → `cancel`), 10-minute auth-probe cache, proactive close + peer dispose on child `exit code != 0`.
- `protocol.ts` — transport-agnostic `JsonRpcPeer`: request / response correlation, notification dispatch, inbound request handling (used for `session/request_permission` auto-approve), timeout + abort + dispose.
- `normalize.ts` — ACP `sessionUpdate` → `AgentEvent`. `ToolCall.kind` maps to `ToolAction.kind`: read → file_read, edit → file_edit, execute → command_run, search → search, fetch → web_fetch, think → task_plan, else → tool. `stopReason` mapped to `AgentFinishReason`.
- `types.ts` — JSON-RPC frame + ACP session / tool / stopReason wire types, module-local only.
- `agents/types.ts` — `AcpAgentDefinition` shape: `{ id, label, commandName, npxPackage, versionEnvVar, defaultVersion, buildArgs(cfg), authProbe() }`.
- `agents/gemini.ts` — `--experimental-acp --yolo --allowed-tools run_shell_command`; `authProbe` checks `~/.gemini/oauth_creds.json`.
- `agents/qwen.ts` — `--acp --yolo`; `authProbe` checks `~/.qwen/`.
- `agents/index.ts` — registry map.
- `apps/api/src/worker/executor/factory.ts` — `case 'acp'`.
- `apps/api/src/worker/management/config-schema.ts` + `info.ts` — zod schema + `executorInfoModel` branch for acp.
- `apps/api/src/worker/orchestrator/service.ts` — `executorModel()` helper covers acp.
- `apps/api/test-fixtures/cli/acp-stub.mjs` — pre-recorded ACP ndjson usable by both gemini and qwen harness tests.

Tests (61 new):

- `protocol.test.ts` — JsonRpcPeer request/response, notification, cancel, timeout, dispose.
- `normalize.test.ts` — `sessionUpdate` event → `AgentEvent` including `ToolKind` → `ToolAction.kind` inference and stopReason mapping.
- `harness.test.ts` — smoke: gemini + qwen both produce assistant-message + tool-use + finish events against the stub binary.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 7 / 7, api 319 / 319 (61 new), web 17 / 17.
- `bun run lint` at pre-existing main baseline, zero new errors.

Deferred:

- ACP executor hasn't registered with `ProcessManager` → FEAT-015.
- CLI `--version` shell-out + DB-persisted availability → FEAT-015 or later.
- Default CLI versions (`gemini 0.9.0`, `qwen 0.0.14`) are placeholders — ops override via `GEMINI_CLI_VERSION` / `QWEN_CLI_VERSION` before production use.

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-013.md`.

## 2026-04-22 10:17 [progress]

PLAN-007 step 2 / 6 — **FEAT-012 Claude Code executor with git worktree workspace** landed. This is the first true agentic-CLI adapter on the fleet: the orchestrator no longer drives the tool loop for this engine — the Claude CLI owns the in-process agent loop, built-in tools, and sandboxing.

Delivered via BKD worktree subtask `d1oqqs1m` (branch `bkd/d1oqqs1m`, 26 files, +1915 / -9). Subtask self-review fixed two P1s (dispose-race via queue-deferred dispose; `once(child,'exit')` reject on `error` wrapped with `.catch`). Merged to main in `b98c13e`.

Shared:

- `packages/shared/src/fleet/config.ts` — `ExecutorConfig` gains minimal `{ type: 'claude-code', model?, cliVersion?, extraArgs?, env?, workspaceRoot?, timeoutMs? }` variant. Formal three-tier profile layer deferred to FEAT-014.
- `packages/shared/src/providers/executor.ts` — `AgentRunInput.workspacePath?: string` optional field so the orchestrator can hand a per-conversation workspace to the executor. Providers that don't need it (http / mcp) simply ignore the field.

API:

- **New** `apps/api/src/worker/executor/engines/claude-code/` module:
  - `executor.ts` — spawns `claude` from PATH first, falls back to `npx -y @anthropic-ai/claude-code@<version>`. Startup: `-p --verbose --output-format=stream-json --input-format=stream-json --include-partial-messages --replay-user-messages --dangerously-skip-permissions`. Default 120s timeout, abort-signal aware, child-error tolerant, spawn / binary resolver injectable for tests.
  - `protocol.ts` — stdio bidirectional control protocol peer; auto-approve policy default (all `PreToolUse` allow); deny / ask branches code-preserved for future interactive approval UI.
  - `normalize.ts` — stream-json → `AgentEvent`: assistant message / thinking delta, `tool_use` with `ToolAction.kind` inferred from tool name (Read/View → file_read, Edit/Write → file_edit, Bash → command_run, WebSearch/Grep → search, WebFetch → web_fetch, TodoWrite → task_plan, else → tool), user `tool_result`, `stop` → finish + usage, stream_event partial deltas, token_usage. NDJSON splitter merges across chunk boundaries.
  - `types.ts` — module-local CLI wire types.
- **New** `apps/api/src/worker/executor/workspace.ts` — `WorkspaceManager` with `createWorkspace(conversationId)` / `disposeWorkspace(conversationId)` / `purgeAll`. Enforces path-escape guard (conversationId regex + `isInside(WORKER_DATA_ROOT)` check). When `WORKER_WORKSPACE_GIT_ORIGIN` is set, provisions an isolated `git worktree add --detach`; otherwise a plain directory. Idempotent; concurrent create deduplicated.
- `apps/api/src/worker/runtime.ts` — `workspaces: WorkspaceManager` added to the runtime handle; survives hot-reload so workspace dirs persist across config swaps.
- `apps/api/src/worker/orchestrator/service.ts` — allocates a workspace per conversation on `ingest`, threads `workspacePath` into `run(...)`. On "new topic" classifier decision, dispose is enqueued on the orchestrator's FIFO queue so any prior in-flight run completes before the directory is deleted. No `toolDefinitions` injection for `claude-code`.
- `apps/api/src/worker/conversation/router.ts` — `classifyContinuation` accepts optional `workspacePath` so claude-code can classify when used as the conversation classifier.
- `apps/api/src/config/worker.ts` — new env vars `WORKER_DATA_ROOT`, `WORKER_WORKSPACE_GIT_ORIGIN`, `CLAUDE_CLI_VERSION`.
- `apps/api/src/worker/executor/factory.ts` — `case 'claude-code'`.
- `apps/api/src/worker/management/{config-schema.ts,info.ts}` + several `*.test.ts` — shape registration + model extraction for claude-code; stub runtime shape updated to include the `workspaces` field.

Tests (52 new):

- `engines/claude-code/{executor,protocol,normalize}.test.ts` + module-level fixtures.
- `workspace.test.ts` — path-escape guard + git worktree optional path.
- `orchestrator/service.claude-code.test.ts` — e2e smoke driving a web-channel envelope through a stub CLI (`apps/api/test-fixtures/cli/claude-stub.sh`), verifying at least one assistant-message event + one tool-use event land on the bus and persist to `worker.db.messages`.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 7 / 7, api 258 / 258 (52 new), web 17 / 17.
- `bun run lint` at pre-existing main baseline (6 errors in `.github/workflows/build-image.yml`, `modes/dashboard.ts`, `scripts/deploy.ts`); FEAT-012 introduced zero new lint errors.

Deferred (P3, tracked in FEAT-014 / FEAT-015):

- Frontend picker row for `claude-code` → FEAT-014.
- `info.ts` health for `claude-code` becoming process-aware → FEAT-015 (`ProcessManager`).
- stdout write backpressure drain → FEAT-015.

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-012.md`.

## 2026-04-22 09:50 [progress]

PLAN-007 step 1 / 6 — **FEAT-011 Normalize AgentEvent schema + refactor OpenAI-compat executor** landed. The orchestrator hot path no longer speaks OpenAI-specific chunk shapes; every `ExecutorProvider` now emits a shared `AgentEvent` tagged union, laying the foundation for Claude Code / ACP / Codex / Cursor adapters in FEAT-012..016.

Shared:

- **New** `packages/shared/src/providers/agent-event.ts` — `AgentEvent` discriminated union (`assistant_message_delta`, `thinking_delta`, `tool_use`, `tool_result`, `permission_request`, `token_usage`, `finish`, `error`), `ToolAction` discriminated union (`file_read`, `file_edit`, `command_run`, `search`, `web_fetch`, `task_plan`, `tool`, `other`), `ToolStatus`, `TokenUsage`, `AgentFinishReason`. All backed by zod schemas exported from the package root.
- **Breaking** (internal only, pre-release): `ExecutorProvider.runChat` renamed to `run`; returns `AsyncIterable<AgentEvent>` instead of `AsyncIterable<ChatStreamChunk>`. Legacy `ChatStreamChunk` / `ChatRunInput` / `ChatFinishReason` / `ChatUsage` types removed outright — no alias, since the discriminators differ (`text` → `assistant_message_delta`, `tool_call` → `tool_use`).
- **Deps**: `@aiworker/shared` gains `zod ^3.24.4` (runtime) and `@types/bun ^1.2.13` (dev); tsconfig sets `types: ["@types/bun"]`.

API:

- `apps/api/src/worker/executor/providers/{http,mcp,cli}.ts` all reshape to `run()` → `AgentEvent`. `OpenAICompatibleExecutor` emits text deltas as `assistant_message_delta`, function calls as `tool_use` with `action.kind === 'tool'`, and adds standalone `token_usage` entries plus the normal `finish`. `McpExecutor.run` and `CliExecutor.run` still yield error then finish — their real implementations live in FEAT-012..016.
- `apps/api/src/worker/orchestrator/service.ts` + `apps/api/src/worker/conversation/router.ts` + `apps/api/src/worker/management/executor-test.ts` consume the new event shape. SSE event names (`orchestrator.text`, `orchestrator.tool_call`) preserved so the frontend contract is unchanged.

Tests:

- `packages/shared/src/providers/agent-event.test.ts` (new) — 7 schema cases covering happy-path and rejection of unknown types / missing args / bad action kinds.
- `apps/api/src/worker/executor/providers/http.test.ts` rewritten against `AgentEvent`.
- `apps/api/src/worker/management/{executor-test,routes}.test.ts` updated to stub with `run` instead of `runChat`.

Verification:

- `bun run typecheck` clean across shared, api, web.
- `bun test` green — shared 7 / 7, api 210 / 210, web 17 / 17.
- `bun run lint` at pre-existing main baseline (6 unrelated errors in `.github/workflows/build-image.yml`, `modes/dashboard.ts`, `scripts/deploy.ts`); FEAT-011 introduced zero new lint errors.

Not in this step:

- No new engine adapter — FEAT-012 (Claude Code + worktree) is next.
- No config schema change — `ExecutorConfig` stays three-way (`http` / `mcp` / `cli`) until FEAT-014.
- No concurrency change — `AsyncQueue` stays until FEAT-015.

Pointer: `docs/plan/PLAN-007.md` for the full six-FEAT roadmap.

## 2026-04-22 04:07 [release]

PLAN-006 landed end-to-end: **P2 batch — channel adapters (Telegram, Lark, WhatsApp) + evolution generator (pattern miner)**. All four FEAT stubs left behind by REFACTOR-002 / PLAN-003 are now real implementations, delivered in parallel via BKD worktree dispatch (`gfhkzgdg`) and serialised-merged in this order: SUB-1 → SUB-2 → SUB-3 → SUB-4.

Subtasks delivered:

- **FEAT-003 Telegram** (`bkd/x9u5jzz9` → `e8f94c1`). `verify` uses timing-safe `X-Telegram-Bot-Api-Secret-Token` compare (silent accept when secret unset per spec); `toEnvelopes` emits one envelope per `message.text` with `chatId = {chat.type}:{chat.id}`; `send` whitespace-chunks replies at 4096 chars and hard-slices as fallback. 12 adapter tests.
- **FEAT-004 Lark 飞书** (`bkd/izavqq37` → `756d2ec`). `verify` handles the optional `encrypt` envelope with AES-256-CBC (SHA-256-keyed, IV from first 16 bytes) before validating `verificationToken`; `toEnvelopes` normalises `im.message.receive_v1` text for p2p + group, `url_verification` returns `[]`; `send` exchanges tenant access tokens with a per-`appId` cache (60 s refresh margin + single-flight promise). 16 adapter tests. Interface change: `ChannelAdapter.toEnvelopes` gains an additive optional `binding?: ChannelBinding` param so the Lark adapter can reach encryptKey at decode time; `routes.ts` passes it through. No other adapter needed changes.
- **FEAT-005 WhatsApp (Meta Cloud API)** (`bkd/zi8wqgzs` → `727b64f`). `verify` parses `X-Hub-Signature-256`, HMAC-SHA256 over the raw body, hex-`timingSafeEqual`; `toEnvelopes` walks `entry[].changes[].value.messages[]`, falls back to media captions for image/audio/video/document, silently skips status updates; `send` targets Graph v21 `/messages` with `recipient_type: individual`. Adds `GET /whatsapp/webhook` subscription-challenge handler to `routes.ts` (404 on missing binding, 403 on token mismatch, 200 plaintext challenge echo). 10 adapter tests.
- **FEAT-006 Evolution generator** (`bkd/tbled0e0` → `a9e289d`). New `pattern-miner.ts` is pure (n-gram aggregation over `Map<conversationId, tool[]>`, min-occurrence + min-conversation thresholds, strict-prefix dedup, occurrence-then-length sort). `proposer.ts` rewrites the stub into a real writer: reads recent `evolution_observations` as the conversation window, joins `execution_logs.tool_name` per conversation, mines, dedups against existing `skill_drafts` + `skill_bindings.config.allowedTools`, writes `skill_drafts` rows. Schema unchanged — mined `allowedTools` / `confidence` / `sequenceKey` are embedded as an `<!-- evolution-meta: {...} -->` marker in `bodyMarkdown` and recovered via the exported `parseEvolutionMeta()`. `runProposerOnce()` + `startProposerLoop()` keep their zero-arg signatures; `EVOLUTION_PROPOSER_WINDOW` / `_MAX_DRAFTS_PER_RUN` / `_INTERVAL_MS` env vars override defaults. 5 miner tests + 5 proposer integration tests.

Shared-type discipline:

- `packages/shared/src/fleet/channel.ts` stayed frozen across all four subtasks, as required by PLAN-006.
- The only cross-cutting interface edit — `ChannelAdapter.toEnvelopes` gaining `binding?: ChannelBinding` — is additive (optional param) and documented; SUB-2 reported the decision in its completion follow-up, and the existing telegram / whatsapp / line / web adapters still satisfy the interface without code changes.

Merge strategy:

- All four branches were dispatched in parallel on fresh worktrees off `main@99ec908`.
- Coordinator (`gfhkzgdg`) serialised merges into `main` from the top-level worktree, running `bun run --cwd apps/api test` + `bun run check` (typecheck across shared/web/api + `eslint .`) after each. Test counts progressed cleanly: 174 (SUB-1) → 190 (SUB-2, +16 lark) → 200 (SUB-3, +10 whatsapp) → 210 (SUB-4, +10 miner/proposer).
- Only `apps/api/src/worker/channels/routes.ts` was touched by both SUB-2 and SUB-3, and on disjoint line ranges (SUB-2: POST-handler toEnvelopes call; SUB-3: new GET route block); the ort strategy auto-merged with no conflicts.

Deferred (explicitly out of MVP scope, flagged in subtask reports):

- Telegram: cards / photos / Markdown V2 `parse_mode`.
- Lark: interactive-card message support; route-level `url_verification` challenge echo (the adapter already returns `[]`; the HTTP echo is a route concern).
- WhatsApp: message-template handling + 24-hour session window tracking; attachment ingestion without caption (envelopes are silently skipped today).
- Channels overall: `fetch` without abort/timeout matches the existing `line.ts` pattern; a fleet-wide hardening pass is a separate concern.
- Evolution: `execution_logs` is not yet populated from the orchestrator path — miner is ready for when that wiring lands. Evolution-meta marker regex assumes flat JSON; safe today since the writer is its only producer.

Verification:

- `bun run --cwd apps/api test` → **210 pass / 0 fail** (24 files, 562 `expect()` calls).
- `bun run check` → typecheck clean across `@aiworker/shared`, `@aiworker/web`, `@aiworker/api`; `eslint .` clean across the repo.
- All four BKD subtasks (`x9u5jzz9`, `izavqq37`, `zi8wqgzs`, `tbled0e0`) transitioned to `done`; worktrees pruned.

Pointer: `docs/plan/PLAN-006.md` for the design matrix and per-subtask spec, and `docs/task/FEAT-00{3,4,5,6}.md` for the individual deliverables.

## 2026-04-21 18:30 [release]

FEAT-009 / PLAN-005 landed: **aissh-driven fleet deployment automation**. AIWorker now ships with a one-command deploy to `gateway.example.test` via the `aissh` CLI.

New artifacts:

- `ops/compose/docker-compose.yml` — production compose for the dashboard only. No docker-socket mount (MANAGER_CAN_LAUNCH stays off by default); image tag pinned via `AIWORKER_IMAGE_TAG` env so rollbacks are a tag swap.
- `ops/compose/.env.example` — host-local env template (`AIWORKER_MASTER_KEY`, `INTERNAL_SHARED_SECRET`, `AIWORKER_IMAGE_TAG`).
- `ops/caddy/Caddyfile.tmpl` — single-site template `gateway.example.test → 127.0.0.1:3000`. No per-worker routing (PLAN-004 made workers advertise their own externally-reachable URL).
- `scripts/deploy.ts` — Bun CLI wrapping aissh. Subcommands: `install-docker`, `teardown-legacy --confirm`, `build`, `upload`, `install`, `verify`, `reload-caddy`, `deploy` (chains the common path). Local `docker save | zstd` keeps the tarball under ~150 MB for the 961 MiB host; `install` verifies `/opt/aiworker-deploy/.env` carries the required secrets before loading.
- `scripts/tsconfig.json` — standalone typecheck for the ops CLI (pulls `@types/bun` from the api workspace).
- `docs/deployment.md` — run book: prereqs, first-time deploy, routine deploy, rollback, worker registration pointer, troubleshooting.

Deviations from the FEAT-009 task draft (authored pre-PLAN-004):

- Health endpoint is `GET /health` (dashboard + worker), not `/api/system/health`.
- Caddyfile does not strip a `{workerId}` prefix — workers own their externally-reachable URL after PLAN-004.
- First cut deploys the dashboard only. Worker provisioning is operator-driven via the registry (see PLAN-004); automating per-worker deploy is follow-up work for FEAT-007 / FEAT-008.

Verification:

- `bun run typecheck` clean across `shared`, `api`, `web`.
- `bun run lint` clean across the repo (includes the new ops YAML + scripts TS).
- `bunx tsc --noEmit -p scripts/tsconfig.json` clean for `scripts/deploy.ts`.
- `bun run scripts/deploy.ts deploy --dry-run --tag=smoke-test` prints the full `build → upload → install → verify → reload-caddy` command chain without running anything. `teardown-legacy` without `--confirm` is correctly rejected.

Pointer: `docs/plan/PLAN-005.md` for the full design (deliverables, risks, rollback, alternatives) and `docs/deployment.md` for the operator-facing run book.

## 2026-04-21 11:30 [release]

PLAN-004 landed end-to-end: AIWorker has pivoted from the centralized PLAN-003 fleet model to **self-sufficient workers + manager-as-registry**. Each worker container now owns its identity, config, and secrets and serves its own `/api/worker/*` surface; the dashboard is a pointer store that registers worker URLs + bearer tokens and proxies UI traffic through.

Subtasks delivered (in BKD merge order):

- 1.1 — Shared types: `RegisteredWorker`, `WorkerIdentity`, `WorkerApiToken`, `WorkerInfo` (`ijo50kfz`).
- 1.2 — `worker.db` schema: `worker_identity` + `worker_config` + `worker_secrets` (`bgm8h8sz`).
- 1.3 — `fleet.db` rewrite: `registered_workers` + `audit_events` only (`zy8taekt`).
- 2.1 — Worker-side `SecretsVault` move + bootstrap flow (id mint, token mint, stdout print, encrypted persist) (`9qqs0iph`).
- 2.2 — Worker management API: `/info`, `GET+PUT /config` with hot reload, secrets CRUD (`b4r6p9l6`).
- 2.3 — Worker bearer-auth middleware + `/brain/test`, `/executor/test`, `/channels/:channel/test`, `/token/rotate`, `/reload` (`y4yvqyd5`).
- 3.1 — Manager `WorkerClient` + `POST /api/workers/register` (validates via worker `/info`) (`9ehtjkhv`).
- 3.2 — Manager registry CRUD + transparent `/api/workers/:id/proxy/worker/*` pass-through (`fj7utscp`).
- 3.3 — Periodic `/info` poll + `lastSeenAt / lastSeenState / lastConfigVersion` updates with audited state changes (`zdcboki0`).
- 3.4 — Optional `MANAGER_CAN_LAUNCH` flag + `POST /api/workers/launch-local` (gated supervisor wiring) (`1x3efm46`).
- 4.1 — Web: registered-workers list + register wizard + per-worker nested route shell + worker switcher (`rgxka0g0`).
- 4.2 — Web: per-worker config editor + secrets panel + test panel + token rotation (`56vtboxe`).
- 5.1 — End-to-end smoke (`apps/api/scripts/smoke-plan-004.ts`) + manager-side `POST /api/workers/:id/rotate-token` wrapper that re-encrypts the worker's freshly minted bearer into `registered_workers.apiTokenEnc` so post-rotate proxy/poll calls keep authenticating + this changelog (`sm5gj8vx`).

Breaking changes:

- **Worker env**: `WORKER_ID`, `WORKER_CONFIG_JSON`, `WORKER_CONFIG_VERSION` are gone. `AIWORKER_MASTER_KEY` (32-byte hex) is now **required** in both `worker` and `dashboard` modes — workers use it to seal `worker_identity`/`worker_secrets`; managers use it to seal `registered_workers.apiTokenEnc`. New optional knobs: `AIWORKER_FORCE_ID`, `AIWORKER_FORCE_TOKEN`, `AIWORKER_ADVERTISED_BASE_URL`.
- **Manager env**: docker-supervisor knobs (`AIWORKER_IMAGE`, `WORKER_DATA_ROOT`, `WORKER_MEMORY_LIMIT`, `WORKER_CPU_LIMIT`) became optional; required only when `MANAGER_CAN_LAUNCH=true`. New: `MANAGER_POLL_INTERVAL_MS` (default `30000`), `MANAGER_POLL_JITTER_MS` (default `3000`), `AIWORKER_LAUNCH_BASE_URL_TEMPLATE`.
- **fleet.db schema**: `workers`, `worker_configs`, `worker_secrets` tables removed; replaced by a single `registered_workers` table.
- **worker.db schema**: gained `worker_identity`, `worker_config`, `worker_secrets` (singletons + secret rows).
- **Webhook URLs**: workers own their own externally-reachable base URL — no more "manager strips the `/{workerId}/` prefix" routing requirement. Operators choose subdomain-per-worker, path-per-worker, or any other reverse-proxy topology.
- **Manager rotate flow**: web UI now calls the manager wrapper at `POST /api/workers/:id/rotate-token`, which returns `{ rotatedAt, lastFourOfNewToken }` and intentionally does NOT leak the new plaintext. Operators who need the plaintext call the worker directly via `POST /api/workers/:id/proxy/worker/token/rotate`.

Migration note (pre-release, destructive OK): both `drizzle/fleet/0000_*.sql` and `drizzle/worker/0000_*.sql` were regenerated to match the new schemas. Delete any local `apps/api/data/fleet.db*` and per-worker `worker.db*` before the next dev boot; `initFleetDb` / `initWorkerDb` re-run their migration set on startup.

Verification:

- `bun run check` clean across `shared`, `api`, `web`.
- `bun test` clean (registry routes/service/poll/rotate-token + worker bootstrap/identity/secrets/config/management/rotate suites).
- `apps/api/scripts/smoke-plan-004.ts` boots a worker + manager via `bun src/index.ts`, registers, configures, rotates, and round-trips a web channel echo — exits 0.
- Dev-server bind regression flagged in 4.1 fixed: `apps/api/src/dev.ts` now re-exports `index.ts`'s default `{ fetch, port }` so `bun src/dev.ts` actually serves traffic.

Pointer: `docs/plan/PLAN-004.md` for the full design (target architecture, data model, auth model, migration table, risks).

## 2026-04-21 09:15 [progress]

REFACTOR-002 / PLAN-003 landed the backend + ops scaffolding for the multi-worker fleet architecture. AIWorker is now modelled as a **fleet** (a group of workers) where each worker runs in its own docker container with independent Brain, Executor, Channels, and Evolution layers.

Backend:

- **Shared types** (`packages/shared/src/fleet/`): `Worker`, `WorkerConfig`, `ChannelBinding`, `Envelope`, `BrainSourceConfig`, `ExecutorConfig` (discriminated `http`/`mcp`/`cli`), `ConversationDecision`, `SkillDraft`, `EvolutionObservation`, etc. Dual worker identity (`w_` + 12 Crockford base32 immutable id + mutable human slug).
- **DB split** — `fleet.db` (dashboard: `workers`, `worker_configs`, `worker_secrets`, `audit_events`) + `worker.db` (per-worker-container: `agent_tasks`, `conversations`, `messages`, `execution_logs`, `skill_bindings`, `skill_drafts`, `evolution_observations`). Two Drizzle configs, `bun run db:generate` regenerates both migration sets.
- **Mode dispatch** — one Bun binary, `AIWORKER_MODE=dashboard|worker` selects the runtime. `src/config/{common,dashboard,worker}.ts` hold mode-specific env schemas; `src/modes/{dashboard,worker}.ts` create the Hono app per mode; `src/index.ts` picks.
- **Dashboard mode**: `src/dashboard/secrets` (AES-256-GCM vault gated by 32-byte hex `AIWORKER_MASTER_KEY`, with 5 passing tests); `src/dashboard/fleet` (workers CRUD + redacted/hydrated config split); `src/dashboard/supervisor` (unix-socket docker client via Bun `fetch({ unix })`, manages worker containers: spawn / start / stop / restart / remove / inspect / logs).
- **Worker mode**: `src/worker/brain/` (`HermesProvider`, `CloudGatewayBrainProvider`, plus new `MultiBrainProvider` aggregating per-worker source list); `src/worker/executor/` (factory over `http` / `mcp` / `cli`; `CliExecutor` spawns via `node:child_process`, `sandbox` flag reserved for FEAT-002); `src/worker/channels/` (envelope + 5 adapters: `web` + `line` working, `telegram` / `lark` / `whatsapp` stubbed behind `ChannelNotImplementedError`; HMAC signature verify on Line); `src/worker/conversation/router.ts` (Agent-driven continuation classifier — no hardcoded timeouts); `src/worker/orchestrator/service.ts` (per-worker queue, channel-routed ingest, text chat loop, SSE event emission, outbound channel delivery); `src/worker/evolution/` (observer wired to the event bus writes `evolution_observations`; proposer is a stub logger pending FEAT-006; approval routes for skill drafts).
- **URL map**: public `POST /{channel}/webhook` + internal `/api/worker/*` + dashboard `/api/workers[/:id]*`. External format `https://{host}/{workerId}/{channel}/webhook` — Caddy strips the `{workerId}` prefix and routes to the worker container over the docker network.
- **Ops**: root `Dockerfile` (multi-stage, single image for both modes) + `docker-compose.yml` (dashboard container with docker socket mounted).

Docs:

- `docs/plan/PLAN-003.md` — full four-layer (Communication / Brain / Evolution / Executor) design. Approved 2026-04-21 07:40 and moved to `implementing`.
- `docs/task/REFACTOR-002.md` — in_progress. Future-work placeholders created: `FEAT-002` (executable skills runtime), `FEAT-003` (Telegram), `FEAT-004` (Lark), `FEAT-005` (WhatsApp), `FEAT-006` (evolution generator), `FEAT-007` (M:1 channel routing), `FEAT-008` (multi-host HA), `FEAT-009` (aissh-driven deployment).

Verification:

- `bun run typecheck` clean across `shared`, `api`, `web`.
- 11 unit tests pass: 5 `SecretsVault` + 6 `OpenAICompatibleExecutor`.

Not in this checkpoint (explicitly deferred):

- Web frontend restructure (workers list + per-worker nested routes + worker switcher + skill-binding editor). Web app typechecks but its routes still call legacy `/api/skills`, `/api/memory`, etc. — will go away after the frontend rewrite.
- Full smoke test (fleet-boot-via-docker + worker-spawn + channel-roundtrip).
- Deployment automation — tracked in FEAT-009 per user direction.

## 2026-04-21 06:45 [progress]

Added `CloudGatewayBrainProvider` as a second `BrainProvider` implementation. It talks to a cloud-gateway MCP server over streamable-HTTP (JSON-RPC 2.0) and maps `BrainProvider` methods to the server's `knowledge_*` tools (`knowledge_types` → skills, `knowledge_query` → listMemories, `knowledge_search` → searchMemories, `knowledge_write` → writeMemory). Runtime provider selection is controlled by the new `BRAIN_PROVIDER` env (`hermes` default, `cloud-gateway` when MCP URL + token are provided). Deployed to the production server; `/health` now reports `brain.status=ok` against cloud-gateway, `/api/skills` surfaces the knowledge types as brain skills. New files: `apps/api/src/adapters/mcp/{client,index}.ts`, `apps/api/src/providers/brain/cloud-gateway.ts`. Env additions: `BRAIN_PROVIDER`, `CLOUD_GATEWAY_MCP_URL`, `CLOUD_GATEWAY_MCP_TOKEN`, `CLOUD_GATEWAY_DEFAULT_CATEGORY`, `CLOUD_GATEWAY_DEFAULT_TYPE_ID`.

## 2026-04-20 20:30 [progress]

Agent Runtime refactor (PLAN-002) complete. AIWorker is now a self-hosted Agent Runtime that composes a **Brain provider** (Hermes — knowledge/memory) and an **Executor provider** (OpenAI-compatible chat completions + tool calling). Backend modules (`skills`, `memory`, `execution`, `health`) were rewired behind `BrainProvider` / `ExecutorProvider` interfaces; a new `orchestrator` module drives the full loop (submit → tool_call → write_memory → succeeded) with per-task queue, cancellation, and SSE broadcasts. Frontend shipped a new `/orchestrator` route (task list, replay, live updates) and the six existing pages were renamed from Hermes/OpenClaw to Brain/Executor terminology.

- **DB reset procedure**: delete `apps/api/data/aiworker.db*` before the next dev run; `initDb` auto-runs all Drizzle migrations on boot. New tables: `agent_tasks`, `conversations`, `messages`; `execution_logs` gained a `conversationId` FK; `skill_conflicts` now uses `brain_hash` / `executor_hash` columns.
- **Env additions**: `OPENAI_BASE_URL` (default `https://api.openai.com`), `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_TIMEOUT_MS` (default `60000`). See `apps/api/.env.example`.
- **Env deprecations**: `OPENCLAW_WS_URL`, `OPENCLAW_HOME` remain in the schema for transitional compatibility but are no longer surfaced via `/api/config`.
- **API shape changes**: `/api/health` now reports `services.brain` and `services.executor` (previously `hermes` / `openclaw`); `/api/skills/*` sources use the `brain` | `executor` enum; `/api/skills/conflicts` returns `brainHash` / `executorHash`.
- **New surfaces**: `POST|GET /api/orchestrator/tasks`, `GET /api/orchestrator/tasks/:id`, `POST /api/orchestrator/tasks/:id/cancel`; SSE stream at `GET /api/events/stream` emits `orchestrator.task.started|message|tool_call|finished|failed|cancelled`; frontend `/orchestrator` page consumes it live.
- **E2E coverage**: `apps/api/src/modules/orchestrator/e2e.test.ts` exercises the "Remember that I prefer TypeScript strict mode" scenario end-to-end with a scripted executor — no OpenAI credentials required; run with `bun test src/modules/orchestrator/e2e.test.ts` from `apps/api`.

## 2026-04-20 17:15 [progress]

Phase 3 + 4 complete. Backend gained `execution`, `config`, `events` modules (REST + SSE). Web app scaffolded with Vite 8 + TanStack Router/Query + Tailwind v4 + Base UI primitives, and all six pages implemented: Dashboard (live SSE feed + service status), Skills (list/diff/conflicts tabs with sync trigger), Memory Explorer (search + filters + new), Execution Monitor (stats, filters, live tool feed, paginated table), Config Editor (read/write Hermes YAML + OpenClaw JSON with backup), Sync Status (timeline + run sync). Drizzle migrations auto-applied on `initDb`. Vite proxy now respects `AIWORKER_API_URL`. `bun run typecheck` and `bun run lint` clean across all workspaces.

## 2026-04-20 09:45 [progress]

Project initialized with PMA docs structure.
