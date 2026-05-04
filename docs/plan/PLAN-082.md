# PLAN-082 Codex text replay evidence closeout

- **status**: completed
- **createdAt**: 2026-05-04 10:12
- **approvedAt**: 2026-05-04 10:33
- **completedAt**: 2026-05-04 10:34
- **relatedTask**: BUG-053

## 现状

1. `BUG-053` 跟踪 Codex executor 疑似在 streamed text delta 后 replay 最终
   assistant text 的问题。该问题与 `BUG-052` 的 Claude Code 真实复现相似，
   但需要单独确认 Codex 的实际 notification shape。
2. 本地 `codex --version` 为 `codex-cli 0.128.0`。使用真实 `HOME`、
   临时 project-scope worker、`codex/default` 运行安全 marker prompt 后，
   `aiworker run` 只输出多段 append-only `orchestrator.text`：
   `BUG`、`053`、`_MARK`、`ER`、`_`、`202`、`605`、`04`，随后
   `orchestrator.finished`；没有完整最终文本 replay。
3. 直接探测 `codex app-server` 0.128.0 的原始 JSON-RPC notification 后，
   观察到 assistant text 走 `item/agentMessage/delta`，params keys 为
   `delta`、`itemId`、`threadId`、`turnId`；随后是
   `thread/tokenUsage/updated` 与 `turn/completed`。未观察到
   `codex/event/assistant_message` 或 full-text snapshot。
4. 源码 fallback pin `@openai/codex@0.121.0` 也不接受 legacy
   `thread_start`，实际协议为 current `thread/start` / `turn/start`。该探针
   的 turn 因上游执行失败结束，没有 assistant text，但足以说明 fallback
   版本不走 legacy `codex/event/assistant_message` lifecycle。
5. 当前静态代码仍保留 legacy normalizer：`codex/event/assistant_message`
   有 `delta` 时发 delta、没有 `delta` 时 fallback 到 full `text`。如果未来或
   未知 legacy server 同一轮先发 delta 再发 full `text`，该代码会产生 replay；
   但本次真实 current Codex 探针没有确认这条路径。

## 方案

推荐按“证据关闭”处理，而不是补一个未确认的 production guard：

1. 保持 Codex executor production 行为不变。当前支持路径已观察为
   `item/agentMessage/delta` append-only，没有 replay。
2. 调整 Codex current-protocol stub，使它发出多段 assistant deltas，而不是单个
   `OK`，更贴近真实 0.128.0 的安全 marker 形态。
3. 增加/收紧 Codex executor 测试：断言 current protocol 的多段 delta 串联后
   等于最终文本一次，且事件流中没有额外 full-text delta。
4. 更新 `BUG-053`、`docs/task/index.md` 和 changelog：记录 sanitized evidence，
   将任务完成为 “not reproduced on current Codex path”。

## 风险

1. Codex app-server notification shape 仍不是稳定公开 API。当前结论只覆盖
   本地 `codex-cli 0.128.0` 和 fallback pin `0.121.0` 的可观测行为。
2. 不加 hypothetical legacy guard 意味着极旧或未知 legacy app-server 如果真的
   发送 delta + full text，仍可能 replay；但当前 pinned / PATH 版本都不走该路径。
3. 本地真实 Codex 探针会触发 Codex 自身插件/analytics warning；这些 warning
   与 AIWorker event contract 无关，不应写入任务证据。

## 范围

- `packages/core/test-fixtures/cli/codex-stub.mjs`
- `packages/core/src/worker/executor/engines/codex/executor.test.ts`
- `docs/task/BUG-053.md`
- `docs/task/index.md`
- `docs/plan/PLAN-082.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不改变 Worker Admin、CLI、gateway 或 orchestrator append 行为。
- 不新增 `orchestrator.text` snapshot event 或 `payload.text` 字段。
- 不扩大到 `BUG-050` 的 Codex tool activity raw-event mapping。
- 不提交本地 `.aiworker/`、`worker.db`、`.env`、raw Codex logs 或 prompt
  transcript。
- 不修改 Codex executor legacy lifecycle 支持，除非审批时明确选择硬化方案。

## 替代方案

1. Legacy hardening：在 Codex executor 层维护一段 per-turn streamed assistant
   text state，若同一轮随后出现 `codex/event/assistant_message.text` 且以前缀
   replay 已流出的文本，则只发剩余 suffix 或完全 suppress。优点是防御未知
   legacy replay；缺点是当前真实 Codex 未确认该路径，会增加状态逻辑和维护面。
2. Runtime-level dedupe：在 orchestrator 层对所有 executor 做文本去重。该方案
   太宽，会掩盖 engine adapter 语义错误，也可能误删合法重复文本，不建议。

## 验证计划

- Passed: `bun test packages/core/src/worker/executor/engines/codex/executor.test.ts`
- Passed: `bun test packages/core/src/worker/executor/engines/codex/normalize.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-core' typecheck`
- Done before implementation approval: temporary project-scope worker + real
  Codex safety marker prompt, recording only `orchestrator.text` delta sequence
  and terminal event.

## 结果

- `BUG-053` was closed as not reproduced on the current Codex path.
- Current-protocol Codex stub now emits multiple append-only
  `item/agentMessage/delta` chunks matching the observed real event shape.
- Codex executor coverage asserts those chunks concatenate to the final marker
  once and do not include an extra full-text delta.
- Production Codex executor, orchestrator, CLI, Worker Admin, and gateway
  behavior remain unchanged.

## 批注

- 2026-05-04 10:12：完成本地真实 Codex current-protocol 探针。未复现 final
  text replay；推荐以证据关闭并补 current delta regression 覆盖。
- 2026-05-04 10:33：Approved and claimed for implementation.
- 2026-05-04 10:34：Implemented, verified, and completed.
