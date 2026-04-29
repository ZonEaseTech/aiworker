# FEAT-039 Worker 初始化与 Soul 生命周期：安全 init、模板预置、能力包与更新治理

- **status**: in_progress
- **priority**: P1
- **owner**: BKD h71mijcz
- **createdAt**: 2026-04-29 17:50
- **claimedAt**: 2026-04-29 18:04
- **plan**: PLAN-041

## 描述

在 FEAT-036 已有 project-scope `aiworker init` / `aiworker scope` 基础上，把初始化从“创建目录和 worker.db”升级为“配置一个可长期工作的项目级 worker”。

本任务覆盖用户进入路径：防覆盖初始化、选择或自定义 Soul、快速预置 Skill/MCP/Tool、生成或同步外部 agent 适配文件，以及未来云端 Soul 更新的 diff / pin / approval 机制。它与 FEAT-038 / PLAN-039 配套：PLAN-039 定义 worker runtime 如何决策、执行和自我迭代；本任务定义这些能力如何被安全、快速、可审计地配置出来。

## 验收标准

1. `aiworker init` 默认不覆盖已有 `.aiworker/`、`AGENTS.md`、`CLAUDE.md`、`.agents/`、`.claude/` 等文件；检测到现有 worker 时只进入诊断/合并提示。
2. 初始化 wizard 支持选择预置 Soul：developer、project-manager、devops-sre、product-designer、qa-reviewer、support-operator、finance-ops、hr-recruiting、general-assistant，以及 `customize`。
3. `customize` 能通过少量问题生成 `SOUL.md`、`AGENT.md`、policy、toolsets 和 capability pack 选择草案。
4. 选择 Soul 后能预置对应 Skill、MCP、Toolset、policy 和可选外部 agent adapter；`.aiworker/` 始终是权威源，外部文件只作为投影或导入来源。
5. Skill/MCP/Tool 快速配置命令必须先 validation 再启用：Skill metadata、MCP server 启动/list tools/schema、tool allowlist/denylist、secret ref 和权限策略都要通过检查。
6. 超出 Soul 职责范围的请求有明确响应策略：通用处理、请求启用能力、handoff proposal、拒绝高风险/越权操作。
7. 未来 `aiworker soul update` 只允许 diff / proposal / approval / backup / apply 流程，不允许云端模板静默覆盖本地 Soul。
8. 自我迭代写入 memory/skill/policy 前必须带 evidence、scope、confidence、source、review 结果和 rollback/audit 信息；低质量或冲突内容只能保留为 pending proposal。

## 依赖

- **blocked by**: 用户批准 PLAN-041
- **relates to**: FEAT-031, PLAN-021, FEAT-036, PLAN-023, FEAT-038, PLAN-039
- **blocks**: Worker 快速配置体验、Soul 模板生态、Skill/MCP/Tool capability pack、受控自我迭代收录治理

## 笔记

- 2026-04-29 17:50：根据讨论补充产品入口设计。关键决策：`init` 默认 safe/idempotent；Soul 选择应在初始化早期发生；`customize` 是正式路径；`.aiworker/` 为权威源，`AGENTS.md` / `CLAUDE.md` / `.agents` / `.claude` 为 adapter 投影；云端 Soul 更新必须 pin/diff/approval；自我迭代默认 proposal，不默认自动写入。
- 2026-04-29 18:04：用户批准开工。按 BKD 编排执行，控制单 session 范围；先派发 S1 init preflight/dry-run diff 小切片。
- 2026-04-29 18:18：S1 已通过 BKD 子任务 `urey7cyc` 合入 main，merge commit `8284aa5`。本阶段新增 `aiworker init --dry-run`、init preflight 报告、外部 agent 文件检测和 persona 文件保留回归测试。Post-merge 验证：`bun test --timeout=15000 apps/cli/src/commands/init.integration.test.ts`、`bun run --filter @zonease/aiworker-cli test`、`bun run --filter @zonease/aiworker-cli typecheck`、目标 `eslint`、committed diff check 均通过。
