# FEAT-002 Executable skills runtime (sandbox)

- **status**: pending
- **priority**: P3
- **owner**: (unassigned)
- **createdAt**: 2026-04-21 07:30

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
