# FEAT-058 Case-driven Project Brain learning loop validation

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 15:00
- **claimedAt**: 2026-05-09 15:00
- **completedAt**: 2026-05-09 15:52
- **plans**: PLAN-190
- **relatesTo**: GOALS.md, FEAT-057, QA-023, REL-030

## 背景

REL-030 已发布 Worker Case operating surface，但真实手动 worker dogfood 暴露出产品闭环仍未成立：

1. 同一 conversation 里的多个 task Case 会串到最后一轮 assistant / gate；
2. heuristic observe-only quality gate 会把 Case 包装成 `ready_to_ship`；
3. Codex native thread 已经保存扩展历史时，AIWorker 仍把完整历史重放给 executor，长对话会放大 context；
4. Admin Chat 主入口容易把 AIWorker 做成 executor harness，而不是 Project Brain learning loop。

## 目标

用最小源码改动验证新的产品判断：

> AIWorker is not the place you work. AIWorker is the Project Brain sidecar where native-agent work is reported, reviewed, admitted, projected, and later verified.

本轮必须证明：

1. Case 是 task-scoped evidence，不是 conversation-scoped transcript；
2. 没有 semantic / Brain Engine review 的 heuristic pass 不能被标为 `ready_to_ship`；
3. Codex current-protocol resumed thread 下，AIWorker 不再把完整 conversation history 重放给 native executor；
4. 失败 Case 可以产生明确 rerun / review 结论，Brain 学习只能从 Case evidence 出发。

## 非目标

- 不重构 Worker Admin Chat UI。
- 不做通用 hook / subagent 框架。
- 不实现 Fleet 新能力。
- 不发布 1.0 GA。
- 不承诺治理 unmanaged ambient executor authority。

## 验收标准

1. 同一 conversation 下多个 task 的 Case 各自绑定自己的 assistant message、gate 和 event count。
2. failed task 不能读取后续成功 task 的 assistant / gate。
3. pure heuristic observe-only pass + succeeded task 只能得到 `needs_review`，不能得到 `ready_to_ship`。
4. Brain Engine reviewed pass 仍可得到 `ready_to_ship`。
5. Codex current native thread resume 只发送 system / Project Brain capsule 与 latest user request，不发送旧 user / assistant history。
6. 聚焦测试通过，并记录 source dogfood / falsification 结论到 QA-024。

## 风险

- 收紧 `ready_to_ship` 可能让 UI 里已有 Case 更保守，但这是符合 truthfulness contract 的行为。
- 对 Codex resumed prompt 的改动必须保留 stale binding fallback：native thread 丢失时仍要能用 DB-rendered context 恢复。
- 这轮只证明源码闭环，不扩大到 published package release，除非后续验证显示有必要。

## 结果

完成最小闭环验证：

1. `BrainJournalService` 的 task trace 只采集 task-owned Journal events，并按 `assistantMessageId` / task 时间窗收窄 message evidence，避免同一 conversation 下多 task 串证据。
2. `BrainCaseService` 优先绑定 task result 中的精确 assistant message；Review Decision 不再把 pure heuristic observe-only pass 标成 `ready_to_ship`。
3. Brain Engine `reviewed/pass` 在没有 heuristic gate 时可成为 `brain-engine-review` 来源的 pass verdict；硬治理不变量仍优先。
4. Codex current native thread resume 只发送 system / Project Brain capsule 与最新 user request；stale binding fallback 仍回到完整 DB-rendered context。
5. `GOALS.md` 与 `docs/architecture.md` 已明确 Admin Chat 是 debug/admin 面，主产品闭环是 native executor work → task-scoped Case evidence → Brain review/admission/projection。

验证见 QA-024。
