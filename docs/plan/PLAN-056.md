# PLAN-056 标记废弃 PMA 方案与 capability 边界

- **status**: completed
- **createdAt**: 2026-05-01 14:32
- **approvedAt**: 2026-05-01 14:32
- **completedAt**: 2026-05-01 14:37
- **relatedTask**: DOC-003

## 现状

FEAT-044 / PLAN-055 已经把 executor-native capability projection 从 PLAN-041 S3 中拆出并落地。当前 repo 中同时存在几类容易被误用的旧文档：

1. 治理前 FEAT-031 / PLAN-021 仍处于 pending / implementing，但其中的 Phase D 把 `worker_config.mcp.servers`、MCP tool registry、per-worker Skill/MCP 配置混在同一条 master epic 中，已经与当前 Brain/Executor 能力隔离原则冲突。
2. FEAT-038 / PLAN-039 已完成，但其 S2 CapabilityRegistry 中的 `.aiworker/mcp.json` 是 observe-only brain/runtime descriptor，不是 executor-native MCP config。
3. FEAT-039 / PLAN-041 仍在推进，但 S3 已被收敛为 brain/runtime project capability 草案的静态 validation；旧文档里的 `aiworker skill add`、`aiworker mcp add`、`toolset enable` 不能继续作为 executor capability 命令规格。
4. BUG-040 是历史缺口记录，仍列出了当时缺失的快速配置命令，容易被误读为当前实现范围。
5. `docs/architecture.md` 的 project layout 还没有把 `.aiworker/executor-capabilities.json` 和 `.aiworker/mcp.json` 的边界写清楚。

本次治理遵守一个边界原则：Brain capability 与 Executor capability 在设计、存储、同步和投影上隔离。AIWorker 对 executor-native MCP/skill/plugin 的职责是声明、校验、dry-run 和通过 engine 官方 CLI/config 投影；不把这些能力混入 brain/runtime project capability draft。

## 方案

1. 关闭旧 master 入口：
   - `docs/task/FEAT-031.md` 标记为 `closed`，说明已被多个后续 task/plan 拆分替代。
   - `docs/plan/PLAN-021.md` 标记为 `rejected`，保留历史内容但在顶部增加废案警示和替代路径。
   - 同步 `docs/task/index.md` 与 `docs/plan/index.md` 标记为 `[~]`。
2. 补边界警示：
   - 在 FEAT-038 / PLAN-039 增加“历史语义限定”，明确 `.aiworker/mcp.json` 只表示 observe-only brain/runtime descriptor。
   - 在 FEAT-039 / PLAN-041 增加“当前有效范围”，明确 S3 只覆盖 static doctor；executor-native projection 归 FEAT-044 / PLAN-055。
   - 在 BUG-040 增加“历史记录，不是当前规格”的提示。
3. 更新架构文档：
   - 在 project layout 中加入 `.aiworker/executor-capabilities.json`。
   - 明确 `.aiworker/mcp.json` 与 `executor-capabilities.json` 的职责边界。
4. 记录治理结果：
   - 更新 `docs/changelog.md`。
   - 完成 DOC-003 / PLAN-056 状态同步。

## 风险

1. **过度标记导致历史不可读**：保留原文，只在顶部和关键冲突段落加警示与替代路径。
2. **误伤仍有效内容**：FEAT-038 / PLAN-039、FEAT-039 / PLAN-041 只加语义限定，不关闭已完成或仍推进的有效计划。
3. **索引状态漂移**：同步 detail status 与 index marker，并在 changelog 留记录。

## 工作量

文档治理切片，预计修改 `docs/task/`、`docs/plan/`、`docs/architecture.md`、`docs/changelog.md`。不涉及代码、schema 或测试数据。

## 备选方案

1. **删除旧 plan/task**：不采用。PMA 规则要求保留历史线索，用户也明确不需要删除。
2. **只更新 AGENTS.md**：不够。其他开发成员通常会从 PMA plan/task 入口认领工作，必须在 docs 入口处直接阻断误用。
3. **只关闭 FEAT-031 / PLAN-021**：不够。已完成计划中的旧 MCP 语义仍可能被引用，需要加局部警示。

## 批注

- 2026-05-01 14:32：用户批准执行深度废案和标记处理，要求不删除旧 plan / feature，只阻断废弃冲突事项被继续使用。
- 2026-05-01 14:37：实施完成并进入验证。保留所有旧文件，仅通过 status、index marker、顶部警示、局部替代路径和架构边界说明阻断误用。
