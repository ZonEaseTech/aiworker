# PLAN-080 Soul brain executor validation follow-up fixes

- **status**: draft
- **createdAt**: 2026-05-03 23:33
- **approvedAt**: (pending)
- **relatedTask**: QA-003

## 现状

2026-05-03 在 `/Users/ben/projects/aiben` 完成了一轮本地验证：

1. 9 个内置 Soul 都能 fresh init，并在真实 Codex-backed 回复中明确身份、
   主要职责、思考取舍和风险边界。
2. 每个 Soul 对应的 runtime brain 都挂载 project-scope writable
   `local-filesystem`，`brain status` healthy，并能发现非敏感 probe skill /
   memory。
3. Codex executor selection、executor-native MCP 声明、doctor 和 dry-run
   projection 通过；额外声明 Claude Code MCP 后，Claude Code doctor 和
   dry-run projection 也通过。
4. Codex executor 实际创建并读回了 `/Users/ben/projects/aiben/tmp` 下的
   marker 文件，说明真实手脚能力可用。

同时暴露出 3 个后续工作：

1. `BUG-050`：真实 Codex 文件/命令活动没有进入 AIWorker
   `orchestrator.tool_call` 事件流，当前只看到最终文本与
   `orchestrator.finished`。
2. `BUG-051`：`executor mcp add --arg -y` 被 CLI option parser 当成未知
   option，必须写成 `--arg=-y`。
3. `TODO-008`：这次矩阵是手工 shell 组合，尚未沉淀成可重复、可脱敏、
   可审计的验证 harness。

相关代码面：

- `packages/core/src/worker/executor/engines/codex/normalize.ts`
- `packages/core/src/worker/executor/engines/codex/executor.ts`
- `packages/core/test-fixtures/cli/codex-stub.mjs`
- `apps/cli/src/commands/worker/executor.ts`
- `apps/cli/src/aiworker.ts`
- `apps/cli/src/commands/worker/executor.test.ts`
- optional local validation script under `apps/cli/scripts/` or `scripts/`

## 方案

分 3 个小切片推进，按顺序执行。

### S1 - Codex tool event observability (`BUG-050`)

1. 先补一个 raw-event capture 开关，仅用于本地 QA，输出到 `tmp/` 并默认关闭。
2. 用真实 Codex hand probe 捕获 current app-server 对 shell/file activity 的
   notification shape。
3. 在 `normalizeCodexNotification()` 中只映射确认过的 tool activity 事件。
4. 扩展 Codex stub，让 current protocol 能发出同类 tool activity fixture。
5. 断言真实或 stubbed run 会产生 `AgentEvent.tool_use`，并由 orchestrator
   转成 `orchestrator.tool_call`。

### S2 - MCP stdio arg UX (`BUG-051`)

1. 调查 CAC / 当前 argv preprocess 对 repeated option 的解析边界。
2. 优先支持 `--arg -y`，如果 parser 无法安全支持，则明确只支持
   `--arg=-y` 和文档/help 示例。
3. 增加 CLI test：`--arg=-y`、`--arg @pkg`、多次 `--arg`、未知 option
   仍应失败。
4. 确认 `executor mcp sync --engine codex --dry-run` 继续输出
   `codex mcp add <name> -- npx -y ...`。

### S3 - Repeatable validation harness (`TODO-008`)

1. 把本次手工矩阵固化为 local-only harness：
   - static mode：不调用 live executor，只跑 init/doctor/brain/executor
     readiness；
   - live mode：保持真实 `HOME`，对每个 Soul 跑一次 JSON identity probe；
   - hand mode：只对指定 Soul 跑文件写读探针。
2. 输出 manifest：命令、exit code、artifact path、redaction status、每条
   验收需求对应证据。
3. 所有 token / secret-like 文本统一 redaction。
4. 文档只写 sanitized summary，不提交本机 `worker.db`、`.env`、raw Codex
   logs 或 prompt 原文。

## 风险

1. Codex app-server event shape 不是稳定公开 API。S1 必须 additive 且通过
   fixture 锁定已观察形态，不能 broad-map 未确认事件。
2. Raw-event capture 容易泄露 prompt、路径或环境细节。必须默认关闭、写入
   `tmp/`，并明确不纳入仓库文档。
3. 放宽 CLI option parser 可能影响全局 unknown-option 防护。S2 需要聚焦
   executor mcp add 的 `--arg`，不要改变全 CLI 行为。
4. Live validation 依赖本机 Codex 登录态和网络状态。S3 必须把 live mode
   标成 optional，并保留 static mode 作为 release 前可重复 gate。

## 工作量

- S1：P2，小到中等。涉及 Codex normalizer、stub fixture、executor/orchestrator
  聚焦测试和一次本机 smoke。
- S2：P3，小。主要是 CLI parser/help/test。
- S3：P2，中。偏脚本和 redaction 质量，避免影响 runtime。

## 非范围

- 不改变 Brain capability 与 Executor capability 的边界。
- 不自动把 executor MCP 声明投影到用户全局 engine config。
- 不把 live model 输出作为单元测试依赖。
- 不连接 fleet/gateway。
- 不发布新版本；release 另开 `REL-*`。

## 验证计划

Focused gates:

- `bun test packages/core/src/worker/executor/engines/codex/normalize.test.ts packages/core/src/worker/executor/engines/codex/executor.test.ts`
- `bun test packages/core/src/worker/orchestrator/service.history.test.ts`
- `bun test apps/cli/src/commands/worker/executor.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`

Local smoke:

- `/Users/ben/projects/aiben` static harness run across all built-in Soul presets.
- Optional live harness run across all built-in Soul presets with real Codex.
- One Codex hand probe that creates and reads a marker file under
  `/Users/ben/projects/aiben/tmp`.
- `aiworker executor mcp add filesystem-probe --engine codex --transport stdio --command npx --arg=-y --arg=@modelcontextprotocol/server-filesystem --arg=.`
- If S2 chooses direct support: same command with `--arg -y` must pass.

## 批注

- 2026-05-03 23:33：Created from QA-003 evidence. Awaiting approval before
  implementation.
