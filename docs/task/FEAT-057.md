# FEAT-057 Worker Case operating surface

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 05:55
- **claimedAt**: 2026-05-09 05:55
- **completedAt**: 2026-05-09 12:11
- **plans**: PLAN-183, PLAN-184, PLAN-185, PLAN-186, PLAN-187, PLAN-188, PLAN-189
- **relatesTo**: GOALS.md, FEAT-056, QA-022, REL-029

## 背景

FEAT-056 已完成 developer repo worker proof loop：Brain Journal、Gate verdict、
Brain Engine review、repair/rerun、Brain Inbox 和 authority preflight 已能证明
AIWorker 可以包住外部 executor 的一次任务结果。

新的产品判断是：proof loop 不能成为用户主界面。AIWorker 不应继续像 harness / eval
平台，而应把一次 worker 工作投影成 operator 能直接判断的 Worker Case：

1. worker 做了什么；
2. 结果能不能放行；
3. 风险和 authority 边界是什么；
4. 哪些经验值得进入 Project Brain；
5. 这条链路是否可复盘、可重跑、可审计。

## 目标

把 FEAT-056 的 proof-loop 底座产品化为 **Worker Case operating surface**：

1. 从现有 Journal/Gate/Inbox 派生 Case File，不新增第二套事实源。
2. 用 Review Decision 替代 raw Gate 作为 operator 默认判断入口。
3. 用 Lessons Queue 替代底层 Brain Inbox 作为批量学习审核入口。
4. 保持 BYO executor 边界：AIWorker 只治理 Brain、worker state、case evidence 和
   AIWorker-brokered surfaces，不治理 unmanaged ambient executor authority。
5. 通过 source gate、published package、harness 和 dogfood 证明流程跑顺，而不只是 API 跑通。

## 非目标

- 不做通用 trace / observability dashboard。
- 不做通用 eval 平台或 benchmark runner。
- 不做 executor tool loop、sandbox、MCP firewall 或 cloud permission broker。
- 不自动写 canonical Brain memory。
- 不在本 epic 内内建 HR / finance / legal / ops 领域 workflow engine。
- 不破坏 FEAT-056 已有 Journal/Gate/Inbox raw debug surface。

## 验收标准

1. 一个 task 可以通过 REST 和 CLI 查看 Case File，且 Case File 明确包含 work order、
   outcome、review decision、evidence、risk、lineage、lesson candidates。
2. operator 可以从 Review Decision 判断 `ready_to_ship`、`needs_review`、
   `needs_rerun` 或 `blocked`，且每条理由带 source/mode/evidence ref。
3. Lessons Queue 能从 Case File 解释候选 lesson 的来源、risk、confidence、target 和
   admission proposal 状态。
4. Worker Admin 默认入口能以 Case 为中心审查任务，而不是要求用户读 raw Journal。
5. Fleet 只聚合 case summary / status，不复制 worker Brain payload。
6. release 验证至少覆盖 source gate、CLI bundle、published-package smoke、compact
   governance harness 和一轮 source-backed case dogfood。

## 分阶段计划

1. **PLAN-183**：Case File / Review Decision / Lessons Queue contract。
2. **PLAN-184**：BrainCaseService projection。
3. **PLAN-185**：Worker Case REST + CLI surface。
4. **PLAN-186**：Worker Admin Cases UI。
5. **PLAN-187**：Lessons Queue batch review。
6. **PLAN-188**：Fleet case summary projection。
7. **PLAN-189**：dogfood falsification campaign and release readiness。

## 风险

- 如果 Case File 只是 raw Journal 重命名，产品仍然像 harness。
- 如果 Review Decision 不足以快速判断结果，operator 仍要读 transcript。
- 如果 Lessons Queue 过度自动化，会重新变成 opaque auto-memory。
- 如果 Fleet 复制过多 worker data，会违反 worker data-plane 边界。
- 如果 release 只做 source tests，不跑 published package 和 harness，就无法证明流程跑顺。

## 笔记

- 2026-05-09 05:55：根据产品转型结论创建 FEAT-057。首批实现先做只读 Case File
  projection + REST/CLI，避免把产品一次性拖进通用 observability/eval 平台。
- 2026-05-09 06:45：完成 source MVP 的 Case contract、REST/CLI、Worker Admin UI
  与 Fleet-hosted worker bridge。PLAN-187 的批量 Lessons Queue 审核仍保持 pending；
  先通过 per-case propose + 既有 Brain admission 状态机 dogfood，避免过早批量写入
  canonical Brain。
- 2026-05-09 12:11：FEAT-057 按 source MVP + 发布包验证关闭。Case File、
  Review Decision、per-case Lessons Queue、Worker REST/CLI、Worker Admin UI 与
  fleet-hosted worker bridge 已随 `@zonease/aiworker-cli@0.12.0` 发布并通过 source
  gates、published package smoke、GitHub Release、main workflows 和 compact
  governance harness。PLAN-187 批量 Lessons Queue review 不纳入本轮完成标准，作为
  后续是否需要降低 operator 审核成本的独立产品判断保留。
