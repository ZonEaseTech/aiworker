# FEAT-044 Executor capability projection commands

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-01 13:54
- **claimedAt**: 2026-05-01 13:54
- **completedAt**: 2026-05-01 14:05
- **plan**: PLAN-055

## 描述

为 worker 增加 executor 原生能力的快速配置入口，先覆盖 Codex / Claude Code 的 project-scope MCP 配置。

本任务只处理 Executor capability：engine 自己运行时可用的 MCP server、未来 engine-native skill/plugin、sandbox/approval/project config 等。它不复用 Brain capability、filesystem brain skill、Soul capability pack 或 orchestrator capability registry 作为配置入口。

## 验收标准

1. 新增独立的 `.aiworker/executor-capabilities.json` manifest，记录 executor capability 期望状态；manifest 与 `.aiworker/mcp.json`、`.aiworker/skills/`、`capability-packs.json` 语义隔离。
2. `aiworker executor mcp add <name>` 可为 `codex` 或 `claude-code` 写入 project-scope MCP server 声明，并支持 `--dry-run`。
3. `aiworker executor mcp sync --engine <engine> --dry-run` 输出将调用的 engine 官方 CLI 命令；非 dry-run 通过官方 CLI 投影到 engine project config。
4. `aiworker executor doctor --engine <engine>` 检查 manifest、engine 支持度、CLI 是否可用、MCP 声明是否缺关键字段或包含明文 secret。
5. Secret-like 字段只能使用 `{ "secretRef": "..." }`，不能把明文写入 `.aiworker/executor-capabilities.json` 或 engine project config。
6. 文档和 help 明确使用 `executor mcp` / `engine plugin` 等限定词，避免和 brain skill / project capability pack 混淆。

## 依赖

- **relates to**: FEAT-039, PLAN-041, FEAT-014, FEAT-018
- **blocks**: executor MCP 快速配置体验、未来 engine-native skill/plugin projection

## 笔记

- 2026-05-01 13:54：用户确认 Brain capability 与 Executor capability 必须隔离。PLAN-041 S3 的静态 `aiworker doctor` 保留为 project capability draft validator；本任务新增独立 executor capability projection 面。
- 2026-05-01 14:05：完成 MVP。新增 `.aiworker/executor-capabilities.json`、`aiworker executor mcp add/sync`、`aiworker executor doctor`、Codex/Claude Code project-scope MCP projection、secretRef 安全校验和聚焦测试。
