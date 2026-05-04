# PLAN-090 Brain admission and approval roadmap

- **status**: completed
- **createdAt**: 2026-05-04 11:22
- **completedAt**: 2026-05-04 13:00
- **relatedTask**: FEAT-050

## 现状

Architecture 已经规定 generated memory / brain skill / policy proposal 写入
filesystem 前必须经 operator approval，但还没有可执行 roadmap。

## 方案

1. 定义 pending brain proposal model。
2. 每个 proposal 必须包含 evidence、scope、confidence、rollback。
3. CLI / API / UI approval surface 分阶段实现。
4. pre-compaction memory flush 继续作为已允许 runtime 写入路径，其他 mutating brain command 另开任务。

## 范围

- roadmap docs。
- future schema/API plan。

## 非范围

- 本计划不直接落 DB migration。
- 不接入 executor capability。

## 风险

如果 admission 太重，会损害轻量定位；只对 generated durable changes 上 approval，普通 read-only brain inspection 保持简单。

## 验证

- docs/task + docs/plan review。

## 完成记录

- 2026-05-04 13:00：完成 admission roadmap 文档化。
  - `docs/architecture.md` 在 Project Brain asset model 后新增 “Brain admission roadmap” 子章节，明确 4 段路线：
    1. Proposal 模型字段（evidence / scope / confidence / rollback / summary）。
    2. Storage 选型（worker.db 新表 `brain_admission_proposals` + `brain_admission_decisions`，**不**进 fleet.db；schema migration 单独 PMA）。
    3. Approval surface 三档：CLI `aiworker brain admission ...`、API `apps/api/src/worker/brain/admission/*`、Worker Admin 新视图。
    4. 唯一免审 runtime 写入：pre-compaction memory flush。
  - 显式红线：admission flow 不复用 executor MCP / engine plugin 通路，命名严格 `brain admission` / `brain memory` / `brain skill` / `project policy`。
- 不直接落 DB migration、不实现 admission CLI/API/UI；这些进入后续独立 PMA 任务。
- 验证：
  - `rg -n "Brain admission roadmap" docs/architecture.md` 命中预期位置
  - 没有触及代码，无需 typecheck/test gate
