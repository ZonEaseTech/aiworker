# FEAT-056 AIWorker 1.0 developer repo worker proof loop

- **status**: in-progress
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 03:12
- **claimedAt**: 2026-05-09 03:43
- **plans**: PLAN-173, PLAN-174, PLAN-175, PLAN-176, PLAN-177, PLAN-178, PLAN-179, PLAN-180, PLAN-181
- **relatesTo**: GOALS.md, DOC-007, FEAT-054, REFACTOR-019, REFACTOR-021, REFACTOR-022, REFACTOR-024, REFACTOR-025

## 背景

`GOALS.md` 已明确 AIWorker 1.0 的产品判断：先用 developer repo worker 打穿
Project Brain governance proof loop，再扩展 HR / finance / legal / ops 等业务
worker。这个 epic 把该判断拆成可实施、可验证的 PMA 计划，避免后续 session 漂移成
executor 平台、通用 memory layer、通用 sandbox 或泛化 workflow builder。

## 目标

让团队可以把一个真实 repo scope 绑定成长期 AI worker：

1. 外部 executor 负责执行任务。
2. Brain Journal 记录目标、上下文、artifact、tool event、输出和风险信号。
3. Brain Gate 以 hard invariant + Brain Engine review 判断结果是否可放行。
4. 失败时可 repair / rerun / switch-executor / hold，并保留 lineage。
5. 成功或失败后提取 lesson candidate，但只通过 Brain Inbox / admission 进入长期 Brain。
6. authority mode 明确标注 ambient executor authority 与 AIWorker-brokered authority 的边界。
7. 用 aiworker 自身 repo dogfood 证明该闭环优于裸 executor。

## 非目标

- 不做通用 sandbox / container isolation。
- 不做通用 MCP firewall。
- 不做完整 cloud permission broker。
- 不做行业专家规则库或硬编码领域 workflow engine。
- 不自研 executor tool loop。
- 不默认自动写长期 memory。
- 不在 1.0 前扩展多垂直业务 worker 的完整产品面。

## 验收标准

1. 一个 developer repo worker proof loop 可以端到端演示：init scope → select executor →
   run task → journal → gate → repair/rerun or pass → lesson candidate → admission。
2. Gate verdict 对 operator 可见，且区分 hard invariant、Brain Engine review、executor
   claim、human approval、observe-only / enforced。
3. Brain Inbox 能解释候选 lesson 的来源、适用 scope、风险、过期条件和写入目标。
4. authority mode 能明确告诉用户当前任务是否属于 unmanaged ambient executor authority。
5. aiworker 自身 repo 至少完成一轮真实 dogfood 证据采集，并记录成 QA / release-readiness
   material。
6. README / architecture / governance status / GOALS 与实际 1.0 行为一致，不做强于实现的
   产品承诺。

## 分阶段计划

1. **PLAN-173**：proof-loop contract 与现状审计。
2. **PLAN-174**：Brain Journal 数据模型与 task trace surface。
3. **PLAN-175**：Gate verdict contract 与 operator-facing result surface。
4. **PLAN-176**：Brain Engine reviewer contract 与 source/mode truthfulness。
5. **PLAN-177**：repair / rerun / switch-executor / hold orchestration。
6. **PLAN-178**：Brain Inbox 与 lesson candidate admission flow。
7. **PLAN-179**：authority mode labeling 与 high-risk preflight truthfulness。
8. **PLAN-180**：developer repo worker dogfood campaign。
9. **PLAN-181**：1.0 proof-loop docs、governance status 与 release readiness。

## 风险

- 如果先做权限 broker，会把产品拖进安全平台和 cloud proxy 范围。
- 如果先做 memory retrieval，会错过“哪些经验值得进入 Brain”的核心差异化。
- 如果 Gate 不可解释，会变成另一层 opaque LLM judgment。
- 如果 dogfood 不能证明减少重复解释、减少 drift、提升可复盘性，就不应扩展到其它垂直领域。

## 笔记

- 2026-05-09 03:12：根据 `GOALS.md` 的 1.0 产品判断，拆出 FEAT-056 与 PLAN-173..181
  全量计划。本轮仅落盘计划，不实施 runtime 改动。
- 2026-05-09 03:45：完成首个 runtime 切片：PLAN-174 Brain Journal task trace 与
  PLAN-175 Gate verdict surface。`worker.db` 新增 append-only Journal event 表；
  orchestrator 写入 task / decision / gate / executor / tool / admission-bypass 事件；
  Worker API、gateway bridge 与 CLI 均可查看 task Journal。FEAT-056 继续推进
  PLAN-176..181。
- 2026-05-09 03:43：首个 runtime 切片已完成正式 gate：
  `bun run check`、`bun run test`、`bun run build`、`git diff --check` 均通过。
  当前不满足发版条件，因为 PLAN-176..181 尚未实现，1.0 proof loop 还没有
  Brain Engine reviewer、repair/rerun、Brain Inbox、authority mode dogfood 与
  release readiness 证据闭环。
- 2026-05-09 03:50：PLAN-176 完成。新增 bounded Brain Engine reviewer contract；
  LLM quality gate 开启时，orchestrator 通过 control executor 以 no-tools 模式写入
  `brain_engine.review` Journal event；Gate verdict 可同时引用 Kernel invariant、
  Brain Engine review 和 heuristic gate 理由。
- 2026-05-09 03:58：PLAN-177 完成。新增 operator-triggered `rerunTask` 与 REST /
  gateway `orchestrator.tasks.rerun`，rerun 会写 parent/child Journal lineage；
  quality-gate block 会写 `task.held`，每个 parent task 最多 3 个 child rerun，避免
  隐式无限循环。
