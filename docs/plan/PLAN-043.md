# PLAN-043 code-review-graph 开发工作流接入

- **status**: completed
- **createdAt**: 2026-04-29 18:48
- **approvedAt**: 2026-04-29 18:48
- **relatedTask**: DOC-002

## 现状

1. 本机已能通过 MCP 使用 code-review-graph；本机 MCP 配置里已有 `uvx code-review-graph serve`。
2. 仓库下已有 `.code-review-graph/graph.db`，`.gitignore` 已忽略该目录，索引产物不会进入 git。
3. 图谱当前可正常读取 `403` 个文件、`3448` 个节点、`30040` 条边，覆盖 TypeScript、TSX、JavaScript 和 Bash。
4. PATH 上的 `code-review-graph` 是 `2.3.1`，而 `uvx code-review-graph` 是 `2.3.2`；日常命令应统一走 `uvx`。
5. MCP 部分工具当前不稳定：`get_docs_section` 找不到打包文档，`get_hub_nodes` / `get_bridge_nodes` / `get_knowledge_gaps` / `get_surprising_connections` 会抛 `resolve` 相关错误。
6. 仓库尚未注册到 code-review-graph multi-repo registry。

## 方案

1. 在根 `package.json` 增加 `crg:*` 脚本：
   - `crg:status`：读取图谱状态；
   - `crg:update`：按当前 `HEAD` 做增量刷新；
   - `crg:review`：按当前 `HEAD` 做 brief 变更影响分析；
   - `crg:build`：全量重建；
   - `crg:watch`：本地 watch 自动刷新。
2. 更新 `AGENTS.md`：
   - 常用命令区补充 code-review-graph 脚本；
   - 工具偏好区写清 MCP 日常顺序：`get_minimal_context` 起步，review 用 `detect_changes` / `get_affected_flows` / `get_impact_radius`，探索用 `query_graph` / `list_communities` / `list_flows`；
   - 记录当前不稳定端点，避免把工具故障误判成项目问题。
3. 执行 `uvx code-review-graph register /home/ben/projects/aiworker --alias aiworker`。
4. 聚焦验证脚本和 MCP 读取，确认接入可用。

## 风险

- code-review-graph 是开发辅助工具，不应进入产品 runtime 或发布产物。
- `.code-review-graph/graph.db` 含绝对路径和代码结构元数据，必须保持 ignored。
- 不稳定 MCP 端点可能随上游版本修复；当前文档应描述为“当前规避”，不是永久限制。

## 范围

预期改动：

- `package.json`
- `AGENTS.md`
- `docs/task/DOC-002.md`
- `docs/task/index.md`
- `docs/plan/PLAN-043.md`
- `docs/plan/index.md`

## 验证

- Passed: `PATH="$HOME/.bun/bin:$PATH" bun run crg:status`
- Passed: `PATH="$HOME/.bun/bin:$PATH" bun run crg:update`
- Passed: `PATH="$HOME/.bun/bin:$PATH" bun run crg:review`
- Passed: MCP `list_graph_stats` reported `3448` nodes, `30040` edges, `403` files, last updated `2026-04-29T18:51:37`
- Passed: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"`
- Passed: `git diff --check`

## Review State

- 2026-04-29 19:22：实现和验证证据已具备，但本计划产物仍在 dirty main worktree，尚未 commit 或显式验收。保持 `in-review`，不标记 completed/done。
- 2026-04-29 19:36：已随 `AGENTS.md` 与 `package.json` 变更收口，`crg:status` 复验通过；状态更新为 completed。
