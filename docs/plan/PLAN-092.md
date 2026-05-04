# PLAN-092 Worker/Fleet status, events, and audit aggregation

- **status**: draft
- **createdAt**: 2026-05-04 11:22
- **relatedTask**: FEAT-051

## 现状

WorkerEventBus、gateway forwarding、Worker Admin 和 Fleet Admin 已有基础，但聚合体验仍可强化。

## 方案

1. 定义 worker status summary：brain、executor adapter、runtime version、presence。
2. Fleet UI 聚合 workers、audit、recent events。
3. Worker Admin 保持 worker-local data plane，不跨视角读取 fleet。
4. CLI `fleet` 命令输出更强调 aggregation。

## 范围

- docs first。
- 后续可触达 CLI/UI/API。

## 非范围

- 不新增 executor capability inventory。
- 不把 worker conversations 写入 fleet.db。

## 风险

聚合状态不能泄露 worker-local secrets 或 conversation content；fleet 层只放摘要。

## 验证

- future API/UI tests。
