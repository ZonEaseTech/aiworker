# PLAN-086 Ambient executor readiness and doctor semantics

- **status**: draft
- **createdAt**: 2026-05-04 11:22
- **relatedTask**: FEAT-049

## 现状

`executor doctor` 当前输出区分 task executor、engine CLI、declared capabilities
和 projection compatibility，但还没有清楚说明外部 executor 可能加载 user/host
级 ambient capability。

## 方案

更新 readiness model：

1. `binary/auth likely ready`：engine 是否可调用、登录态是否可能存在。
2. `ambient runtime`：明确 user/host capabilities may be loaded and are not managed by AIWorker。
3. `project overlay`：只检查 overlay 文件是否存在、是否格式正确、是否可 best-effort projection。
4. `blocking policy`：只有配置错误、secret 明文或命令失败才 FAIL；空 overlay 仍只是 WARN/INFO。

## 范围

- `apps/cli/src/commands/worker/executor.ts`
- CLI tests
- docs/cli.md

## 非范围

- 不扫描所有 user-level MCP/skill/plugin。
- 不实现 capability inventory。
- 不做 isolation。

## 风险

如果输出太保守，用户会误以为 executor 不可用；如果太乐观，又会误解为 AIWorker 管理了所有能力。文案要直接、短、可操作。

## 验证

- Focused executor CLI tests。
- `aiworker executor doctor --engine codex` smoke。
