# FEAT-002 Executable skills runtime (sandbox)

- **status**: closed
- **priority**: P3
- **owner**: local
- **createdAt**: 2026-04-21 07:30
- **closedAt**: 2026-05-01 14:53

## 关闭标记 / Reopen Guidance

本任务作为 2026-04-21 的远期占位已关闭。它早于当前 Brain capability / Executor capability 边界，容易被误读为 executor-native plugin 或 engine skill 运行时。

未来如确实需要“可执行 skill”，请重新发起一个更窄的 brain/runtime executable skill sandbox 任务，并明确：

- 不等同于 Codex / Claude Code 等 engine-native plugin。
- 不复用 `.aiworker/executor-capabilities.json`。
- 必须先定义 sandbox、权限模型、approval、审计和 rollback。

## Description

Add support for executable skills alongside declarative skills. AIWorker MVP ships with declarative skills only (markdown/JSON prompt templates + tool allowlist sourced from a Brain provider). This task tracks the future work to let skills also carry executable code that runs in a sandbox when the Agent invokes them.

Deferred from REFACTOR-002 / PLAN-003 so the multi-worker fleet MVP stays tractable.

Open questions to answer when picking this up:

- Sandbox runtime: one-shot docker container vs Bun worker thread vs deno-sandbox vs wasm
- Permission model: which worker resources (brain write, executor call, outbound network) can a skill touch
- Skill package format: extension of agentskills.io (declarative) or a new schema
- Distribution: Brain-hosted vs local skills directory per worker
- Approval workflow: who signs off on a newly proposed executable skill

## ActiveForm

Planning executable skills runtime (deferred)

## Dependencies

- **blocked by**: REFACTOR-002 (multi-worker fleet must land first)
- **blocks**: (none)

## Notes

Brought up during PLAN-003 scoping on 2026-04-21; user explicitly deferred to keep the multi-worker fleet MVP tractable. The L4 `ExecutorConfig` union already reserves a `sandbox: boolean` flag on the `cli` variant — the plumbing is stubbed; this task finishes the wiring.

Pick up only after declarative skills prove the orchestration model and FEAT-006 (Evolution generator) has a working approval flow.
