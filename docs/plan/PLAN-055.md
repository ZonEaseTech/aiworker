# PLAN-055 Executor capability projection commands

- **status**: completed
- **createdAt**: 2026-05-01 13:54
- **approvedAt**: 2026-05-01 13:54
- **completedAt**: 2026-05-01 14:05
- **relatedTask**: FEAT-044

## 现状

1. `ExecutorProfile` 已经把执行器按 `engine` / `variant` / `overrides` 分层，但只覆盖选择哪个 engine 与运行参数。
2. PLAN-041 S3 当前新增的 `aiworker doctor` 校验 `.aiworker/policy.json`、`toolsets.json`、`capability-packs.json`、`.aiworker/mcp.json` 与 `.aiworker/skills/`，它更接近 project/brain/runtime capability 草案 validator。
3. Codex / Claude Code 等 agentic CLI 已有各自的 MCP/project 配置入口。AIWorker 不应重复实现它们的配置格式，应作为薄投影层调用官方 CLI 或官方格式。
4. 最新边界决定：Brain capability 与 Executor capability 隔离设计、隔离持久化、隔离同步。executor MCP/skill/plugin 配置不能依赖 brain skill 或 Soul capability pack。

## 方案

### 1. 独立 manifest

新增 `.aiworker/executor-capabilities.json`：

```json
{
  "schemaVersion": 1,
  "engines": {
    "codex": {
      "mcp": {
        "context7": {
          "scope": "project",
          "transport": "streamable-http",
          "url": "https://example.com/mcp"
        }
      }
    }
  }
}
```

它只表达 executor 原生能力期望状态，不表达 brain skill、toolset 或 capability pack。

### 2. CLI MVP

先落地 MCP：

- `aiworker executor mcp add <name> --engine codex|claude-code --scope project --transport ...`
- `aiworker executor mcp sync --engine codex|claude-code [--dry-run]`
- `aiworker executor doctor [--engine codex|claude-code]`

`add` 写 manifest；`sync` 根据 manifest 生成或执行 engine 官方 CLI 命令；`doctor` 校验 manifest、CLI availability 和安全约束。

### 3. 投影策略

第一版只支持 `codex` 与 `claude-code`，并以 `project` scope 为默认。sync 输出/调用类似：

```bash
codex mcp add <name> --scope project ...
claude mcp add <name> --scope project ...
```

如果对应 CLI 不存在或命令失败，AIWorker fail clearly，不猜测写 engine 私有文件。

### 4. Secret 策略

manifest 中所有 token/header/env 等敏感字段只能使用 `secretRef` 对象。MVP 只做校验和 dry-run 安全保护；非 dry-run 遇到 secretRef 时 fail clearly，不把 secretRef 解析成明文，也不把占位符写入 engine project config。

## 范围

- 新增 shared schema 和 CLI command。
- 新增 project layout seed 文件。
- 新增 focused tests 和 CLI 文档。
- 不接入 orchestrator runtime，不改变 executor run path。
- 不实现 brain skill、Soul pack、runtime capability registry 的扩展。
- 不实现非 Codex/Claude Code engine 的 skill/plugin projection。

## 风险

- Codex / Claude CLI 的 MCP add 参数可能随版本变化。MVP 用命令生成和子进程失败信息显式暴露，不写私有格式兜底。
- Secret projection 如果做过深会误写明文。MVP 对 secretRef 只校验和保留；非 dry-run 投影遇到 secretRef 直接失败，不做隐式 hydrate。
- 现有 PLAN-041 S3 文档容易让人误会 `.aiworker/mcp.json` 是 executor MCP。需要同步文档说明它不是 executor projection manifest。

## 验证

- `bun test packages/shared/src/executor-capabilities.test.ts`
- `bun test apps/cli/src/commands/executor.test.ts`
- `bun test apps/cli/src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
