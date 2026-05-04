# PLAN-091 Worker/Fleet topology and operator docs

- **status**: completed
- **createdAt**: 2026-05-04 11:22
- **completedAt**: 2026-05-04 13:15
- **relatedTask**: FEAT-051

## 现状

Gateway / worker / fleet topology 已经可用，但产品文档仍容易被 executor 叙事抢走重点。

## 方案

1. 以 operator 视角重写 worker/fleet topology。
2. 明确 gateway 只持 fleet pointers/audit；worker 持 worker.db 和 project brain。
3. 外部 executor 只在 worker 内由 adapter 调用，不进入 fleet.db。
4. README 和 deployment docs 用同一张拓扑图。

## 范围

- architecture / deployment docs。
- README topology snippets。

## 非范围

- 不改 gateway protocol。
- 不改 enrollment。

## 风险

要避免把 fleet 描述成中心化 worker 数据平面；fleet.db 仍只能存指针和 audit。

## 验证

- docs review。

## 完成记录

- 2026-05-04 13:15：完成 operator topology 收口。
  - `docs/architecture.md` Product Positioning 段标注两张 mermaid 图为 **canonical source**，README 与 deployment.md 都引用它。
  - `README.md` 顶部新增 “Operator topology（一图 canonical）” 章节，ASCII 拓扑图明确 Gateway = control plane（fleet.db 只持指针 + audit）/ Worker = data plane（worker.db + Project Brain）/ External executor 只在 worker 内被薄 adapter 调用三条要点。
  - `docs/deployment.md` 顶部加 “Operator topology（部署前必读）” 段，三档部署形态都共享同一拓扑。
- 不改 gateway protocol、不改 enrollment。
- 验证：
  - `rg -n "Operator topology" README.md docs/deployment.md docs/architecture.md` 命中预期位置
  - 没有触及代码，无需 typecheck/test gate
