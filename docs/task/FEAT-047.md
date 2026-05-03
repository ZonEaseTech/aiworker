# FEAT-047 Worker executor bootstrap and capability lifecycle

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-03 13:09
- **claimedAt**: 2026-05-03 13:09
- **plans**: PLAN-074, PLAN-075, PLAN-076, PLAN-077, PLAN-078

## 描述

Worker 的 orchestrator 初始化已经能落下 Soul、persona、policy、runtime
capability 草案，并在运行时组织上下文。但 task executor 仍缺少同等清晰的
first-run lifecycle：新 worker 可能仍停在 `http/default` stub executor；
executor capability manifest 可能为空；即使 `codex` CLI 可用，MCP/skill/plugin
等 engine-native 能力也未必已经投影到 engine project config。

本长期任务把 executor bootstrap 拆成独立阶段：先让 ready 语义准确，再修正
Codex MCP 投影漂移，然后提供 operator 可控的 executor 选择/初始化入口，最后
扩展 engine-native capability 生命周期并用真实 Codex-backed worker 验证。

## ActiveForm

按 PMA 分阶段推进 worker executor bootstrap、projection、diagnostics 和真实
机器验证；保持 Brain capability 与 Executor capability 隔离。

## 依赖

- **blocked by**: none
- **blocks**: none
- **relates to**: FEAT-038, FEAT-042, FEAT-044, FEAT-045, FEAT-046, QA-002, PLAN-055, PLAN-063

## 验收标准

1. Executor readiness 不再把 “empty manifest + CLI exists” 表达成完整就绪；输出能区分 engine selected、engine CLI available、capability declared、projection compatible。
2. Codex MCP projection 与当前 `codex mcp add` 参数面兼容，dry-run 和 apply 都能通过测试覆盖。
3. Operator 有明确、低副作用的 executor bootstrap 入口，可以把本地 worker 从默认 stub executor 切到 Codex/Claude 等 engine，而不自动写 engine project config。
4. `.aiworker/executor-capabilities.json` 继续只表达 executor-native 期望状态，不复用 `.aiworker/mcp.json`、brain skill、Soul capability pack 或 runtime toolset。
5. Secret-like 字段仍只能存 ref；非 dry-run projection 不隐式 hydrate 或写入明文 secret。
6. `/Users/ben/projects/aiben` 可作为真实本机 Codex-backed worker 验证目录，保持真实用户 `HOME`，只隔离 AIWorker 项目状态。
7. 每个阶段都有独立 PMA plan、聚焦验证命令和完成记录。

## 阶段计划

1. `PLAN-074`：Executor readiness 语义与 first-run 引导。
2. `PLAN-075`：Codex MCP projection 参数兼容。
3. `PLAN-076`：Executor 选择/初始化命令。
4. `PLAN-077`：Engine-native capability lifecycle 扩展。
5. `PLAN-078`：真实 Codex-backed worker validation campaign。

## 笔记

- 2026-05-03 13:09：确认这是长期任务，按 PMA 落一个 umbrella task 和多阶段 plan 后再分阶段执行。
- 2026-05-03 13:09：调查发现 `/Users/ben/projects/aiben` 中 `executor doctor --engine codex` 因 `codex` binary 存在而 PASS，但 `aiworker up --dry-run` 仍显示 `no executor capabilities declared`；这说明当前 PASS 只代表 CLI 可见，不代表 executor 已具备 engine-native 能力。
- 2026-05-03 13:09：本机 `codex mcp add --help` 不支持当前 AIWorker dry-run 生成的 `--scope` / `--transport` 参数；Codex projection 需要按当前官方 CLI 参数面修正。
- 2026-05-03 13:44：完成 `PLAN-074..078`。`executor doctor` / `up` 现在区分 configured task executor、engine CLI、declared executor-native capabilities 与 projection compatibility；Codex projection 改为当前 `codex mcp add` 参数面；新增 `executor select` 显式切换 task executor；`.aiworker/executor-capabilities.json` 扩展 engine plugin / skill / policy lifecycle descriptor，并提供 `executor capability list/show` 只读检查。
- 2026-05-03 13:44：验证通过：`bun test apps/cli/src/commands/worker/executor.test.ts`；`bun test apps/cli/src/commands/worker/up.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/worker/init.integration.test.ts packages/shared/src/executor-capabilities.test.ts`；`bun run --filter '@zonease/aiworker-cli' typecheck`；`bun run --filter '@zonease/aiworker-core' typecheck`；`bun run --filter '@zonease/aiworker-shared' typecheck`；`bun run typecheck`；`bun run lint -- apps/cli/src/commands/worker/executor.ts apps/cli/src/commands/worker/up.ts apps/cli/src/aiworker.ts apps/cli/src/help.ts packages/shared/src/executor-capabilities.ts packages/core/src/index.ts`。
- 2026-05-03 13:44：`/Users/ben/projects/aiben` 真实 HOME smoke：`codex-cli 0.128.0`；`scope` project；`doctor` PASS；`executor select --engine codex` dry-run 显示当前已是 `codex/default`；`executor doctor --engine codex` 为 WARN（manifest 空，但 CLI 可用、task executor 已选）；`executor mcp sync --engine codex --dry-run` 报 no enabled MCP servers；`run --message "hello" --dry-run` 成功构建 Codex runtime；`up --dry-run` 在 stage 4 显示 executor readiness WARN 且 non-blocking。
