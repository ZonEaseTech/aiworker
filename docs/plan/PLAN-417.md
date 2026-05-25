# PLAN-417 Real E2E round5 repair and harness hardening

- **status**: completed
- **owner**: Codex
- **createdAt**: 2026-05-26
- **completedAt**: 2026-05-26
- **relatedTask**: BUG-160
- **superpowersSpec**: docs/superpowers/specs/2026-05-26-real-e2e-round5-repair-harness-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-26-real-e2e-round5-repair-harness.md

## Context

本计划承接 `tmp/real-e2e-audit-2026-05-26-round5/` 的审查结果。第 5 轮没有 P0；
本批次修复 P1 CLI Claude Code command resolution、P2 HR universal composer 默认
capability readiness，并把 P3 Browser screenshot fallback 与 theme diagnostics 纳入真实
E2E harness。

## Proposal

1. 在 Host-owned core 层提取 local engine catalog、scan 和 resolution helper。
2. 让 API local settings 与 CLI session start / turn send 共享同一套 engine id 到
   executable 的解析语义。
3. 在 session 创建前对未知或未安装 local engine 失败，避免 executor 才报
   `Executable not found`。
4. 修正 shared `SessionComposer` controlled Select trigger，让默认 capability 的可见
   label 与 submit readiness 同步。
5. 补充 universal workbench / shared UI 回归测试，覆盖默认 capability 初始化。
6. 新增 Playwright mounted evidence capture 脚本，输出 screenshot、layout、console 和
   theme diagnostics。
7. 通过 focused package tests、UI governance、boundary audit、mounted client rebuild、
   browser evidence 和 code-review-graph 收口。

## Verification

- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-ui' test`
- `bun run --filter '@zonease/aiworker-ui' typecheck`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run ui:check`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`
- `bun run --filter '@zonease/aiworker-hr' build:client`
- `bun run --filter '@zonease/aiworker-qa' build:client`
- Browser evidence under `tmp/real-e2e-round5-repair-2026-05-26/`
- `bun run crg:update`
- `bun run crg:review`
- `git diff --check`

## Completion Summary

Focused Core/API/CLI/UI/Soul workbench/Web verification passed, including the shared local engine resolution path and HR composer default capability readiness. Governance checks passed through `bun run ui:check` and the Host/Soul completion audit. Official HR/QA mounted client bundles were rebuilt before browser evidence capture. Playwright evidence under `tmp/real-e2e-round5-repair-2026-05-26/browser/` covers desktop and 390px mounted diagnostics plus manual HR composer readiness for worker `e2e-hr-claude-20260525`.
