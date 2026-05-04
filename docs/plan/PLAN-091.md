# PLAN-091 Worker/Fleet topology and operator docs

- **status**: draft
- **createdAt**: 2026-05-04 11:22
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
