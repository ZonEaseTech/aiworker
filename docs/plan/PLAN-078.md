# PLAN-078 Real Codex-backed worker validation campaign

- **status**: completed
- **createdAt**: 2026-05-03 13:09
- **relatedTask**: FEAT-047

## 现状

1. `/Users/ben/projects/aiben` 可作为本机调试目录。
2. 本机 Codex CLI 已登录，验证 Codex executor 时应保持真实用户 `HOME`，只隔离 AIWorker project state。
3. 前序 QA 已覆盖 Codex-backed worker 的会话连续性、Worker Admin 慢响应、task lifecycle 等问题，但 executor bootstrap/capability projection 还缺一条 focused campaign。
4. 当前 `aiben` 可复现几个关键状态：worker project layout 存在、Codex CLI 可用、executor capability manifest 可能为空、task executor 选择可能仍不是 Codex。

## 方案

设计一条真实机器 validation campaign，贯穿 PLAN-074 到 PLAN-076 的交付：

1. 准备：
   - 使用 `/Users/ben/projects/aiben` 或其 `tmp/` 子目录。
   - 保留真实 `HOME` 以读取 Codex auth。
   - 不把 secret 写入 `.aiworker/*.json` 或 worker configJson。
2. 验证点：
   - `aiworker scope` / `doctor` / `executor doctor` 输出区分 project、runtime config、executor-native capability。
   - executor selection 命令能把 task executor 切到 `codex/default`。
   - Codex MCP declaration dry-run 与 apply 行为符合当前 CLI。
   - `aiworker run --dry-run` 能构建 Codex-backed runtime。
   - 真实 one-turn smoke 能返回 assistant reply，并记录 executor-native binding。
3. 记录：
   - 保存命令、版本、输出摘要和发现的问题到 PMA task/plan/changelog。
   - 对发现的 bug 另开 BUG/TODO，不在 validation plan 中顺手扩大实现。

## 范围

- 本机真实验证脚本或手工 runbook。
- 聚焦 CLI/runtime smoke，不跑 fleet/gateway。
- QA 记录和 follow-up bug/task 创建。

## 非范围

- 不部署测试服。
- 不启动 fleet gateway。
- 不修改 Codex 用户级全局配置，除非用户显式批准。
- 不把真实 secret 或 token 写入仓库。

## 风险

1. 真实 Codex CLI 行为会受本机版本和用户配置影响；记录版本与关键 help 输出。
2. MCP apply 可能修改用户级或 project-scope engine config；必须先 dry-run，并限制在测试目录。
3. 长跑 smoke 可能受网络、模型延迟、Codex 服务状态影响；失败要区分产品 bug 与外部环境。

## 验证

- `codex --version`
- `codex mcp --help`
- `aiworker scope`
- `aiworker doctor`
- `aiworker executor doctor --engine codex`
- `aiworker executor mcp sync --engine codex --dry-run`
- `aiworker config show`
- `aiworker run --message "..." --dry-run`
- 可选真实 one-turn `aiworker run --message "..."`

## 交付标准

形成一条可重复的 local Codex-backed worker validation path，能证明 executor bootstrap 从 engine selection 到 capability projection 再到真实 run 都是连贯的；残留问题进入独立 PMA task。

## 完成记录

- 2026-05-03 13:44：完成 `/Users/ben/projects/aiben` local validation，保持真实用户 `HOME`，未修改 Codex 用户级全局配置，未写入明文 secret。
- 命令摘要：`codex --version` -> `codex-cli 0.128.0`；`aiworker scope` -> project scope；`aiworker doctor` -> PASS；`aiworker executor select --engine codex` -> dry-run current/target 均为 `codex/default`；`aiworker executor doctor --engine codex` -> WARN（manifest 空）但 configured executor 与 Codex binary PASS；`aiworker executor mcp sync --engine codex --dry-run` -> no enabled MCP servers；`aiworker run --message "hello" --dry-run` -> runtime constructed；`aiworker up --dry-run` -> executor readiness WARN non-blocking。
- 真实 one-turn 未重复执行：FEAT-046 同日已在同一目录完成真实 Codex-backed one-turn smoke；本计划聚焦 executor bootstrap/projection dry-run 与 runtime construction。
