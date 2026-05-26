# Real E2E Round 4 Residual Repair Design

## Context

第四轮真实 E2E 审查证据位于
`tmp/real-e2e-audit-2026-05-25-round4/`。该审查基线是
`7369a437`，当前 HEAD 已经包含后续 BUG-157 / PLAN-414 修复提交，因此本批次不重复处理
已经落地的 session 完成态、universal composer 默认能力、Worker Configuration 390px 布局等内容。

本设计只处理当前 HEAD 仍需要收口的 round4 余量：

- CLI engine selection 与 session engine 固化语义。
- Host/Soul mounted theme 对齐。
- mounted universal workbench stale session poller 取消。
- Web Claude 日期上下文 polish。
- 已修 round4 P2 的聚焦回归验证，防止回退。

## Goals

1. `aiworker engine select <engine>` 影响之后新建 session 的 engine 选择。
2. session 创建后 engine 不可中途修改；后续 turn 继承该 session 固化 engine。
3. Host shell 与 mounted Soul App surface 在 light/dark theme 上同步。
4. mounted workbench route/context 切换后不继续轮询旧 worker/session。
5. Host 只提供稳定日期上下文，不改写 engine transcript 或 artifact。
6. 验证覆盖 CLI/API/Core、mounted workbench、Web UI、browser evidence、UI governance、Host/Soul boundary audit 和 code-review-graph。

## Non-Goals

- 不把 engine preference 提升为 Soul App 领域配置或 workspace/session configuration surface。
- 不允许已有 session 通过 CLI/Web 中途切换 engine。
- 不让 Soul App 向 Host header、left panel、toolbar 或 Worker Configuration slot 注册领域 UI。
- 不在 Host transcript 层重写 engine 输出。
- 不重开或重复实现 BUG-157 / PLAN-414 已完成修复。

## Architecture

Host 仍只拥有 start / shell / locate / mount / bridge。engine selection 属于 Host 本机 execution
preference；session engine 是 session 边界上的 Host metadata；mounted theme 是 Host shell context；
polling 生命周期属于 Soul-owned mounted workbench client。

Soul App 只消费 Host 通过 protocol/mount context 提供的 opaque locator 与 theme context。Soul App
不解释 Host engine preference，不保存 Host theme preference，也不向 Host 配置层注册领域字段。

## Engine Contract

`aiworker engine select claude-code` 更新本机 Host execution preference。新建 session 时，CLI 或 Web
按以下优先级解析 engine：

1. CLI 创建 session 时的显式 `--engine <id>`。
2. Host 本机 `engine.default` / local settings selected engine。
3. worker `defaultEngineId`。
4. 保守默认 `codex`。

session 第一轮开始时，实际使用的 `engineId`、`engineCommand` 和 execution metadata 写入 session
metadata、turn metadata 和 invocation metadata。session 创建后 engine immutable：

- `turn send` 默认读取 session metadata 中的 engine。
- 若旧 session 没有 session engine metadata，则优先读取最近一次 invocation 的 engine，再 fallback 到 worker/default/global，并在本次 turn 后补齐 metadata。
- CLI 不开放 `turn send --engine`。如果后续需要兼容旧参数，应明确报错，提示 operator 新建 session。
- Web follow-up turn 固定沿用 session engine，不跟随新的全局 `engine select`。

## Mounted Theme Contract

Host Web 解析 `appearance -> resolvedTheme`，并把 `light|dark` 作为通用 mount context 传给 mounted
Soul App：

- mounted surface URL query 包含 `theme=<resolvedTheme>`。
- micro-app data 包含相同 `theme`。
- app-owned mounted HTML 初始 class / color-scheme 消费同一个 theme。

Soul App runtime 不自行猜测系统主题，也不保存 Host theme preference。默认产品路径下，Host chrome 与
mounted surface 应呈现同一个 effective theme。未来如果 Soul App 需要 app-owned theme mode，只能是
Soul-owned UI 内部选择，不回写 Host，也不要求 Host 解释领域主题语义。

## Poller Contract

mounted universal workbench client 只轮询当前 mount context 下的 selected session。

当 `workerId`、`workspaceId`、`sessionId` 或 `routePrefix` 变化时：

- 取消旧 session poller。
- 清空不属于当前 worker/workspace 的 selected session。
- 只在 `selectedSessionId` 属于当前已加载 sessions 时启动 poll。
- poll URL 必须由当前 mount context 和 selected session 共同生成，不保留上一 worker 的闭包值。

Host 不承担旧 poller 清理的领域逻辑；Host 只传入当前 locator context。

## Date Context

日期 P3 作为 prompt/context polish 处理。Host 在 `LocalWorkerRuntime.buildInvocationPrompt` 中提供稳定执行上下文，例如：

```text
Host execution context:
Current date: 2026-05-25
```

日期来源于 runtime `now()` 的本地日期或 ISO 日期。用户 prompt 自带日期时，Host 不解释、不覆盖，只让 engine 同时看到 Host current date 与 user request。Host 不重写 transcript，不检查 artifact 内容，也不把日期变成 Soul App 领域字段。

## Components

- `apps/cli/src/aiworker.ts`：读取 engine preference，支持 `session start --engine`，禁止 existing session 中途改 engine。
- `packages/core/src/worker/runtime.ts`：固化 session engine metadata，后续 turns 继承 session engine，prompt 增加 Host execution context。
- `apps/api/src/modes/worker.ts`：Web/API session 创建与 turns 采用同一 engine resolution contract。
- `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`：theme consumption 与 poller lifecycle 修复。
- `apps/web/src/worker/studio/mounted-surface.tsx`：确认 URL query 与 micro-app data 使用同一个 resolved theme。
- HR/QA mounted client bundles：变更后必须 rebuild，browser evidence 以 rebuilt assets 为准。

## Error Handling

- 未知 engine：创建 session 前失败，错误指向本机 engine settings。
- 已有 session 缺 engine metadata：用最近 invocation 兼容恢复；无 invocation 时 fallback，并在 metadata 中补齐。
- existing session engine 与当前 global preference 不一致：后续 turn 继续使用 session engine，不提示切换。
- mounted theme 缺失：默认 light，但 test 应覆盖 Host 显式 light/dark。
- stale poller 请求失败：不重试旧 worker/session；当前 context 可正常 refresh。

## Testing

Focused tests:

- Core runtime：成功 session 固化 engine metadata；后续 turn 继承 session engine；旧 session fallback 可恢复。
- CLI：`engine select claude-code` 后新 `session start` 使用 Claude Code；`turn send` 不因后续 `engine select codex` 改 engine；`turn send --engine` 不可用或报错。
- API/Web：new session 使用当前 Host selected engine；existing session follow-up 固定 session engine。
- Workbench：mounted theme context 在 URL/data 中一致；route/context 切换取消旧 session poller。
- Regression：已修 session completed、composer default capability、Worker Configuration 390px 不回退。

Verification commands:

- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run ui:check`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`
- `bun run --filter '@zonease/aiworker-hr' build:client`
- `bun run --filter '@zonease/aiworker-qa' build:client`
- Browser evidence for light/dark mounted theme, stale poller absence, 390px Worker Configuration, composer default capability, and successful session completion.
- `bun run crg:update`
- `bun run crg:review`
- `git diff --check`

## Documentation And Tracking

Implementation should create a new PMA task/plan for round4 residual repair and link it to
`tmp/real-e2e-audit-2026-05-25-round4/`. The task should explicitly state that BUG-157 / PLAN-414 already closed the earlier round4 baseline items and that this batch handles only current HEAD residuals.

Closeout should update `docs/changelog.md` with the actual repaired residuals and verification evidence path.
