# PLAN-092 Worker/Fleet status, events, and audit aggregation

- **status**: completed
- **createdAt**: 2026-05-04 11:22
- **completedAt**: 2026-05-04 13:25
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

## 完成记录

- 2026-05-04 13:25：完成 worker/fleet aggregation surface 的契约文档。
  - `docs/architecture.md` 新增 “Worker/Fleet aggregation surface” 子章节，固化两层数据源（fleet.db pointer + audit / per-worker `/info`）与 status summary 字段表（identity / presence / runtimeVersion / brain / executor / channels），明确 conversations / messages 永不出 worker.db。
  - 同章节列出 UI/CLI 边界：Fleet UI 只走 gateway WS、Worker Admin 只走本机 worker REST、CLI fleet 命令按 method routing 表分流，没有任何路径绕过 gateway 直连 worker REST。
  - `docs/cli.md` Fleet 管理段顶部加入 “fleet.db 层” vs “per-worker `/info` 层” 的输出分流说明，`fleet list` 与 `fleet info` 章节同步指出 brain / executor / runtimeVersion 字段现取不缓存。
- 不新增 executor capability inventory；fleet.db 仍只持指针 + audit；conversations 不进 fleet.db。
- 验证：
  - `rg -n "Worker/Fleet aggregation surface" docs/architecture.md` 命中预期位置
  - 没有触及代码，无需 typecheck/test gate
