# PLAN-014 Envelope upgrade + per-tool approvals + provider fallback + cron

- **status**: completed
- **createdAt**: 2026-04-24 15:45
- **revisedAt**: 2026-04-24 19:15
- **approvedAt**: 2026-04-24 19:15
- **completedAt**: 2026-04-25 06:30
- **relatedTask**: REFACTOR-003
- **dependsOn**: PLAN-013（gateway 已就位；F2 操作员审批走 WS event）
- **commits**: 02c2b56, 41d6c7b, 8af3069, 034e1f2, 07908be, 62fd614, 1442360, 2f00d6e

## Summary

四个独立但相关的小特性打包在一个 plan 里走 review，每个都是 BKD 一个 worktree subtask。PLAN-013 之后的"功能进展"批次。

## Decisions（来自 REFACTOR-003 调研结论 + 用户落点）

四个特性都直接来自 hermes / openclaw 调研报告（见 2026-04-24 16:30 changelog 条目）：

- **F1 envelope** 来自调研 Q5——openclaw 的 envelope 用 `(channel, accountId, peer)` 三元组路由；aiworker 当前缺 `accountId` 和结构化 `richMetadata`。
- **F2 approvals** 来自调研 Q4——openclaw 把 sandboxing 做成基础层，per-tool 审批是首选执行保真手段。
- **F3 fallback** 来自调研 Q7——hermes 的 fallback chain 是 `OpenRouter → Anthropic → MiniMax`；aiworker 单 provider 单点。
- **F4 cron** 来自调研 Q8——hermes / openclaw 都内置；aiworker 没有，但有 evolution 自学习的 moat 路线，cron 是必要的"自驱"手段。

## F1 — Envelope upgrade

### Context

`packages/shared/src/fleet/channel.ts:Envelope` 当前字段：`workerId / channel / chatId / threadId? / userId? / userDisplayName? / text / attachments? / receivedAt / raw`。`messages` 表存了 `content` 文本但没有结构化 metadata 副本，富文本编辑/引用/删除事件在转换层丢失。

### Workstream

- 在 `Envelope` 加 `accountId: string`（每 channel 的 bot/凭据身份；openclaw 的同名字段；同 channel 多 bot 的关键路由维度）。
- 加 `richMetadata?: { isEdit?: boolean; isDelete?: boolean; replyTo?: { authorId: string; text: string }; quote?: string; reactions?: Array<{ emoji: string; count: number }> }`。
- 改 `messages` schema：新增 `richMetadata` 列（`text/json`，可选）；写入路径在 `apps/api/src/worker/orchestrator/service.ts::persistUserMessage` 把 envelope 的 `richMetadata` 一并落盘。
- 改所有 channel adapter（`apps/api/src/worker/channels/adapters/{telegram,whatsapp,lark,line,web}.ts`）的 `toEnvelopes` 实现：
  - `accountId` 从 channel credentials 派生（telegram 用 bot username、whatsapp 用 phoneNumberId、lark 用 appId、line 用 channelAccessToken hash 前 8 字节、web 用 channel binding id）。
  - `richMetadata` 由各 adapter 从原始 payload 提取 reply/edit/delete 信号。
- 新增 drizzle migration（不破坏现有 `messages` 行）。

### Acceptance

- `Envelope` zod schema（如有）+ TS 类型加新字段；旧 `accountId` 缺失视为校验错。
- 所有 5 个 adapter test 加一条"输出 envelope 包含正确 accountId"断言；至少 telegram + whatsapp 加一条 reply richMetadata 断言。
- Migration 落盘，`bun run db:generate:worker` 不空 diff。
- `apps/api` 测试（基线 346）保持绿；`bun run check` 绿。

### Files in scope

- `packages/shared/src/fleet/channel.ts`
- `packages/storage-sqlite/src/worker/schema.ts` + 新 migration
- `apps/api/src/worker/channels/adapters/*.ts`（5 个 adapter）+ 对应 `*.test.ts`
- `apps/api/src/worker/orchestrator/service.ts`（persist 路径）
- `apps/api/src/worker/conversation/router.ts`（如查询 richMetadata）

## F2 — Per-tool approvals

### Context

`WorkerConfig` 当前没有 toolPolicy。orchestrator 在 tool_call 路径直接执行（`apps/api/src/worker/orchestrator/service.ts` 的 `runTool` 路径）。skills 的 SKILL.md frontmatter 当前只有 `name/description/version/capabilities`。

### Workstream

- 扩 `WorkerConfig`：新增可选 `toolPolicy: { default: 'auto' | 'ask' | 'deny'; rules: Array<{ pattern: string; action: 'auto' | 'ask' | 'deny' }> }`。`pattern` 是 tool name glob。
- orchestrator tool-call 路径加 policy gate：
  - `auto` → 直接跑（现状）
  - `ask` → 抛 `ApprovalRequired` event 到 `runtime.bus`，挂起 promise，等 grant；超时（默认 60s）按 deny 处理
  - `deny` → 短路返回合成 assistant 消息 `"tool {name} blocked by policy"`，不进 executor
- gateway 协议加两个 method + 一个 event：
  - operator-to-gateway `approval.grant({ taskId, toolCallId, decision: 'allow' | 'deny' })`
  - operator-to-gateway `approval.list({ workerId? })` 返回挂起的请求
  - gateway-to-operator event `approval.requested({ workerId, taskId, toolCallId, toolName, params, expiresAt })`
- aim CLI 加：
  - `aim approvals list` / `aim approvals grant <taskId> <toolCallId> [--deny]`
- aiw CLI 加：
  - `aiw approvals` 子命令（本地 worker，不经 gateway，方便 dev）

### Acceptance

- `WorkerConfig` schema（zod）+ 默认 config seed `default: 'auto'`（不破坏现有行为）。
- orchestrator service 测试加 3 case：auto / ask 超时 deny / deny 短路。
- gateway 单测加 `approval.requested` 广播 + `approval.grant` 解锁。
- `aim approvals` + `aiw approvals` --help 正常渲染。
- `bun run check` 绿。

### Files in scope

- `packages/shared/src/fleet/config.ts`（toolPolicy 类型）
- `packages/gateway-proto/src/{methods,events}.ts`
- `apps/api/src/worker/orchestrator/service.ts` + `*.test.ts`
- `apps/api/src/worker/management/config-schema.ts`
- `apps/gateway/src/router/methods/`（新 approval handler）
- `apps/cli/src/aim/commands/approvals.ts`（新）
- `apps/cli/src/commands/approvals.ts`（新，aiw 侧）

## F3 — Provider fallback chains

### Context

`ExecutorConfig` 单 provider；`apps/api/src/worker/executor/factory.ts::buildExecutor` switch on `engine`。失败直接抛错给 orchestrator。

### Workstream

- `ExecutorConfig` 加可选字段：
  ```ts
  fallbacks?: Array<{
    executor: ExecutorConfig
    onErrorKinds: Array<'rate-limit' | 'timeout' | 'auth' | 'network' | 'server-5xx' | 'unknown'>
    maxRetries?: number  // 默认 1
  }>
  ```
- 新 wrapper executor `FallbackExecutor`（`apps/api/src/worker/executor/fallback.ts`）：内部持有 primary + fallback executor 列表；`runChat` 抓 primary 异常，按 `inferErrorKind` 分类，匹配的 fallback 上跑下一轮。fallback 自身仍可嵌套 fallback（递归）。
- 错误分类：
  - HTTP 429 / claude-code "rate limited" 字样 → `rate-limit`
  - HTTP 408 / AbortError / engine stall → `timeout`
  - HTTP 401/403 / "invalid api key" → `auth`
  - ECONNREFUSED / ETIMEDOUT / DNS / fetch network err → `network`
  - HTTP 500-599 → `server-5xx`
  - 其他 → `unknown`
- factory 把 `config.executor.fallbacks` 展开成 `FallbackExecutor` 包裹 primary。
- 现有 executor 测试不动；新增 `FallbackExecutor` 单测覆盖 6 种错误分类 + 嵌套 + maxRetries 耗尽。

### Acceptance

- `ExecutorConfig` zod schema 接受 fallback 字段；旧 config 缺失视为空数组（不破坏行为）。
- 新单测 ≥ 8 case，覆盖 6 种错误 kind + 嵌套 + maxRetries。
- 默认 config 不引入 fallback（向前兼容）。
- `bun run check` + `bun test` 绿。

### Files in scope

- `packages/shared/src/fleet/executor.ts`
- `apps/api/src/worker/executor/factory.ts`
- `apps/api/src/worker/executor/fallback.ts`（新）+ `fallback.test.ts`（新）
- `apps/api/src/worker/management/config-schema.ts`

## F4 — Cron scheduling

### Context

无现成 cron。orchestrator 不带 tick loop。aim/aiw 没有 schedule 命令。

### Workstream

- 新 worker.db 表 `cron_jobs`：`id (pk uuid) | expression (text 5-field cron) | prompt (text) | channel (channel_type) | chatId (text) | accountId (text，F1 之后必填) | enabled (bool default true) | lastRunAt (text iso) | nextRunAt (text iso) | createdAt | updatedAt`。
- 新 drizzle migration。
- 新 `apps/api/src/worker/cron/service.ts`：60s tick loop，挂在 runtime（runtime build 时 start，runtime dispose 时 stop）；用 `cron-parser`（小依赖）算 next；fire 时合成 envelope 走 `orchestrator.ingest`。
- aim CLI 加：`aim schedule list <workerId>` / `aim schedule add <workerId> --expression "..." --prompt "..." --channel web --chat-id ...` / `aim schedule remove <workerId> <jobId>`
- aiw CLI 加：同样三个本地形态
- gateway 协议加：operator-to-node `cron.list` / `cron.add` / `cron.remove` / `cron.update`
- worker gateway-client 接 cron 方法转发到本地 `cron/service.ts`

### Acceptance

- migration 落盘 + `bun run db:generate:worker` clean diff。
- `cron-parser` 加进 apps/api 依赖。
- service 单测：tick fire / next 计算 / disabled job 跳过 / dispose 停 tick。
- aim/aiw 命令 --help 渲染。
- `bun run check` 绿。

### Files in scope

- `packages/storage-sqlite/src/worker/schema.ts` + 新 migration
- `packages/gateway-proto/src/methods.ts`
- `apps/api/src/worker/cron/{service,types}.ts`（新）+ `service.test.ts`（新）
- `apps/api/src/worker/runtime.ts`（接入 tick loop start/dispose）
- `apps/api/src/worker/gateway-client/methods/cron.ts`（新）
- `apps/cli/src/aim/commands/schedule.ts`（新）
- `apps/cli/src/commands/schedule.ts`（新，aiw 侧）
- `apps/gateway/src/router/methods/cron.ts`（新转发）

## Dispatch plan（BKD）

5 个 subtask，全部 worktree。

| Wave | Subtask | 依赖 |
|---|---|---|
| W1 | S1 F1 envelope | 无（先打底，避免后续被强 rebase） |
| W2 | S2 F2 approvals + S3 F3 fallback + S4 F4 cron | W1 merge 后并行 |
| W3 | S5 docs + changelog | W2 全 merge 后 |

每个 subtask 强制 `/pma-cr` 自审、报告模板、回报 coordinator。

## Out of scope

- WS gateway 本身（PLAN-013 已落）。
- `packages/core` 物理抽离（PLAN-015）。
- 部署形态调整（PLAN-016）。
- 形式化能力验证（hermes 风格，未来）。
- 自然语言 cron（"每天早上 9 点"→ cron 表达式）— 让 operator 自己写。
- 多 agent per worker（C1 决定排除）。

## 完成记录

| Subtask | BKD | Branch | feat commit | merge commit | Acceptance 摘要 |
|---|---|---|---|---|---|
| S1 F1 envelope | `lm14vk7i` | `bkd/lm14vk7i` | `02c2b56` | `41d6c7b` | `Envelope.accountId` 必填 + `richMetadata` 可选；`messages.rich_metadata` 列 + migration `0001_secret_dagger.sql`；5 channel adapter 派生 accountId / 提取 reply / edit / delete；保留前缀 `sys:*`（task / gateway / cli / cron）；adapter test 全量更新（5 个） |
| S2 F2 approvals | `ofouh8su` | `bkd/ofouh8su` | `07908be` | `62fd614` | `WorkerConfig.toolPolicy?` 三态语义；orchestrator policy gate（auto / ask 60s 超时按 deny / deny 短路）；`ApprovalStore` `dispose` 时 `decision='deny'` resolve；`approval.list/grant` 方法 + `APPROVAL_REQUESTED` 事件；worker `/approvals` + `/approvals/:taskId/:toolCallId/grant` 本地端点；`aim approvals list/grant` + `aiw approvals-list/-grant` |
| S3 F3 fallback | `rbxh9y78` | `bkd/rbxh9y78` | `8af3069` | `034e1f2` | `ExecutorConfig.fallbacks?` 嵌套；`FallbackExecutor` wrapper + `inferErrorKind` 6 分类（`rate-limit` / `timeout` / `auth` / `network` / `server-5xx` / `unknown`）；factory 递归展开；fallback.test.ts 19 case 覆盖 6 种 kind + 嵌套 + maxRetries 耗尽；已 yield 流后不重放 |
| S4 F4 cron | `psgpvmwf` | `bkd/psgpvmwf` | `1442360` | `2f00d6e` | `cron_jobs` 表 + migration `0002_jazzy_moondragon.sql`；`CronService` 60s tick + CRUD；`cron-parser ^5.5.0`；fire 顺序"先算 next → 写库 → ingest"；runtime build/dispose 接入；`cron.list/add/remove/update` 方法；worker `/cron` CRUD；`aim schedule list/add/remove` + `aiw schedule-list/-add/-remove` |
| S5 docs | `admggnqq` | `bkd/admggnqq` | — | — | architecture / cli / changelog / plan / index 全量同步；commit hash 引用核验通过；`bun run check` 绿 |

测试基线变化：

- `apps/api` 346 → 410（+64）
- `apps/gateway` 55
- `packages/gateway-proto` 11

保留的不变量（与 PLAN-004 / PLAN-013 一致，验证过）：

- fleet.db / worker.db 物理隔离；toolPolicy / cron job / approval 全部归属 worker.db。
- AES-256-GCM 封 token；gateway 与 worker 的 crypto 模块仍有意复制。
- Hot-reload：路由 / dispatcher / subscriber 全部 `() => state.runtime` 闭包懒取；`ApprovalStore.dispose` 与 `CronService.stop` 都接进 `runtime.dispose()`。
- F2 policy gate / F4 cron tick 都不进 orchestrator hot path。

已知 follow-up（不在本 plan 范围）：

- `reloadRuntime` 极短窗口内 cron 双 `setInterval` 极小 race（P2，未修）；fire 顺序保证不会双触发同一 job，但 `lastRunAt` 可能早 1s 写。
- `evolution_observations` 滚动压实策略（PLAN-004 遗留，未在本批处理）。
