# FEAT-051 Strengthen Worker/Fleet aggregation surface

- **status**: in-progress
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-04 11:22
- **claimedAt**: 2026-05-04 13:10
- **plans**: PLAN-091, PLAN-092

## 描述

强化 AIWorker 的第二个卖点：worker/fleet aggregation。AIWorker 负责让多个
worker 可注册、可路由、可观察、可审计、可远程操作；gateway control plane
和 worker data plane 是产品价值，而不是 executor feature parity。

## ActiveForm

围绕 operator 管理体验强化 fleet topology、worker presence、事件流、审计、
远程 chat/config/logs 和 Worker Admin/Fleet Admin 的可视化。

## 依赖

- **blocked by**: FEAT-048
- **blocks**: fleet management polish
- **relates to**: FEAT-040, FEAT-045, QA-002, QA-003

## 验收标准

1. 文档和 UI 把 AIWorker 表达为 worker/fleet 聚合层。
2. operator 能清楚理解 gateway、worker、brain、external executor 的拓扑。
3. fleet/worker 状态、事件、审计和远程操作的边界清楚，避免和 executor runtime 混在一起。

## 阶段计划

1. `PLAN-091`：fleet/worker 拓扑与 operator 文档。
2. `PLAN-092`：worker 状态、事件、审计聚合体验。

## 笔记

- 2026-05-04 11:22：该任务聚焦 control plane 与 aggregation surface，不引入 executor isolation。
- 2026-05-04 13:15：完成 PLAN-091。`docs/architecture.md` 的 mermaid topology 标注为 canonical source；`README.md` 与 `docs/deployment.md` 顶部都加 “Operator topology” 段，ASCII / 文字版同源，明确 gateway = control plane 只持指针 + audit，worker = data plane 持 worker.db + Project Brain，external executor 只在 worker 内由薄 adapter 调用。
