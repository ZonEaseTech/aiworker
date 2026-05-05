# PLAN-115 Brain Governance Kernel 决策后的 backlog reset

- **status**: completed
- **createdAt**: 2026-05-05 23:48
- **approvedAt**: 2026-05-05 23:48
- **completedAt**: 2026-05-05 23:48
- **relatedTask**: DOC-006

## 现状

DOC-005 / PLAN-114 已明确：

- Brain Kernel 只守治理不变量；
- 领域语义、业务判断、下一步规划交给 LLM / executor；
- admission 是 durable mutation 的权限边界，不是 workflow system；
- decision events 必须如实标注 heuristic / LLM、observe_only / enforced；
- executor native memory / MCP / plugins / auth 不属于 AIWorker canonical Brain。

在这个决策之后，旧 pending backlog 有三类风险：

1. 旧大包计划会把开发者带回“继续补 Brain 硬逻辑”的方向。
2. 旧验证任务已经被 QA-006 的更强证据覆盖，继续挂 pending 会制造双轨。
3. 真实发布缺陷不能被一刀切 reject，否则后续开发缺少可执行入口。

## 方案

按三类处理所有 DOC-005 之前的未完成项。

### A. 关闭旧入口

- `PLAN-080`：rejected。旧的 Soul / brain / executor validation follow-up
  大包不再作为实现入口；Codex observability 由 `BUG-070` 承接，重复 harness
  未来按 Governance Kernel regression 重新开。
- `BUG-050`：rejected / superseded。被 `BUG-070` 覆盖，后者有 0.8.0 发布验证
  的跨 engine 证据。
- `TODO-008`：rejected / superseded。旧 harness 范围过宽，未来重开时必须围绕
  DOC-005 后的 governance regression。
- `TODO-007`：rejected / deferred。Worker Admin polish 与本次架构断代无关，未来
  UI 专项再重开。

### B. 完成验证证据

- `QA-006`：completed。它作为 0.8.0 published end-to-end debug campaign 已完成；
  本轮把所有发现 triage 到保留或关闭的任务中。
- `BUG-015` / `REFACTOR-007`：status hygiene。两者在 `docs/task/index.md` 已经是
  completed，且当前代码能看到对应实现面；本轮只同步文件内 stale
  `in-progress` / `in-review` 状态。

### C. 保留为决策后的实现入口

- `BUG-066`：Truthfulness contract。后续不是默认实现“Brain decision LLM”，而是让
  runtime / CLI / UI / docs 诚实暴露 decision source、mode 与 enforce 状态。
- `BUG-067`：Classifier fallback diagnostics。保留为 BUG-066 的观测性前置。
- `BUG-068`：Admission LLM-facing entry point。保留为 Governance Kernel 的写入入口，
  不是领域 workflow engine。
- `BUG-074`：Admission bypass guardrail。保留为“LLM 声称已提交但 AIWorker DB 为空”
  的 runtime/operator 警告。
- `BUG-069`：Codex session continuity。保留为 Project Brain 投影与跨轮一致性的
  executor adapter 缺陷。
- `BUG-070`：Codex tool-call observability。保留为跨 engine audit / approval /
  observability 缺陷，并取代 BUG-050。
- `BUG-071`：Doctor status truthfulness。保留为 operator trust / status contract
  缺陷。
- `BUG-072`：Init secret stdout safety。保留为安全 UX 缺陷。
- `BUG-073`：CLI group help discovery。保留为 onboarding UX 缺陷。
- `TODO-026`：Executor recommendation contract。保留为 advisory vs enforced 的
  executor selection 语义收口。
- `BUG-051`：MCP arg UX。保留为低优先级 executor overlay UX 缺陷，脱离 rejected
  PLAN-080。

## 后续开发顺序

1. **P1 Truthfulness layer**：`BUG-066` + `BUG-067`。
   先把 runtime status、events、CLI/UI 文案全部改成真实 contract：heuristic /
   LLM、observe_only / enforced、fallback reason、raw classifier diagnostic。不要在
   这个切片里默认接管 LLM decision。
2. **P1 Admission governance bridge**：`BUG-068` + `BUG-074`。
   给 LLM 一个正式、可发现、非 debug 的 AIWorker admission proposal 入口，并加
   bypass guardrail。目标是 durable mutation 必须回到 AIWorker admission。
3. **P1 Executor parity**：`BUG-069` + `BUG-070`。
   先修 Codex chat-id continuity，再修 Codex tool-call observability。目标是不同
   executor 在 Project Brain 投影、跨轮上下文、审计事件上可比较。
4. **P2 Safety / operator trust**：`BUG-072` + `BUG-071`。
   先处理 init token / master-key 输出安全，再统一 doctor PASS/WARN 语义。
5. **P3 Onboarding polish**：`BUG-073` + `TODO-026` + `BUG-051`。
   收口 group help、executor recommendation contract、MCP arg passthrough UX。
6. **Regression harness**：在 1-3 完成后重开新 TODO。
   新 harness 必须验证 Governance Kernel 真实不变量：decision truthfulness、
   admission DB delta、engine-native memory bypass warning、chat-id continuity、
   tool-call observability、Soul boundary/risk policy。

## 风险

1. **过度关闭**：如果把真实发布缺陷也 reject，会让后续实现没有 PMA 入口。本计划只关闭
   旧大包和被覆盖项，保留 shipped defects。
2. **旧语义回流**：如果保留 BUG-066 但不重写口径，开发者会继续以为下一步是做 heavy
   Brain LLM。保留项必须写清“Truthfulness first”。
3. **测试债转移**：关闭 TODO-008 后如果不写后续 harness 触发条件，验证会再次退回手工
   shell。本计划把 harness 放到 P1 slices 之后重开。

## 范围

- PMA task / plan status and notes
- stale task status hygiene for already-closed items
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不修 runtime / CLI / API / UI 代码。
- 不新增 DB migration。
- 不提交新的 regression harness。
- 不关闭已经完成的历史任务。

## 验证

- `rg -n "^- \\[ \\]" docs/task/index.md docs/plan/index.md`
- `git diff --check`
- 新增 PMA 文件 `git diff --no-index --check`

## 进度

- 2026-05-05 23:48：完成 backlog reset。旧入口关闭，保留项改写为 DOC-005 后的开发入口，后续开发顺序写入本计划。
