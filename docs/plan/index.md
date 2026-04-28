# AIWorker - Plan Index

> Updated: 2026-04-28 10:40

## Usage

Each plan is a single line linking to its detail file. All detailed information lives in `docs/plan/PLAN-NNN.md`.

### Format

- [ ] [**PLAN-001 Short plan title**](PLAN-001.md) `YYYY-MM-DD`

### Status Markers

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Draft / Pending review |
| `[-]`  | Approved / Implementing |
| `[x]`  | Completed |
| `[~]`  | Rejected / Abandoned |

### Rules

- Only update the checkbox marker; never delete the line.
- New plans append to the end.
- See each `PLAN-NNN.md` for full details.

---

## Plans

- [x] [**PLAN-001 AIWorker product build — monorepo scaffold and core modules**](PLAN-001.md) `2026-04-20`
- [x] [**PLAN-002 Refactor AIWorker into self-hosted Agent Runtime**](PLAN-002.md) `2026-04-20`
- [x] [**PLAN-003 Refactor AIWorker into multi-worker fleet runtime**](PLAN-003.md) `2026-04-21`
- [x] [**PLAN-004 Self-sufficient worker + manager-as-registry**](PLAN-004.md) `2026-04-21`
- [x] [**PLAN-005 aissh-driven fleet deployment automation**](PLAN-005.md) `2026-04-21`
- [x] [**PLAN-006 P2 batch — channel adapters + evolution generator**](PLAN-006.md) `2026-04-21`
- [x] [**PLAN-007 Multi-engine executor refactor**](PLAN-007.md) `2026-04-22`
- [x] [**PLAN-008 Worker registration UX + engine availability**](PLAN-008.md) `2026-04-23`
- [x] [**PLAN-009 Worker image bundling + model picker**](PLAN-009.md) `2026-04-23`
- [x] [**PLAN-010 Manager-driven worker creation + dashboard authN + quota**](PLAN-010.md) `2026-04-23`
- [x] [**PLAN-011 CLI-first lightweight runtime (core extraction + aiw / aim / gateway)**](PLAN-011.md) `2026-04-24`
- [x] [**PLAN-012 Filesystem source of truth for brain + skills + memory**](PLAN-012.md) `2026-04-24`
- [x] [**PLAN-013 aim CLI + WS gateway (full replacement of dashboard REST)**](PLAN-013.md) `2026-04-24`
- [x] [**PLAN-014 Envelope upgrade + per-tool approvals + provider fallback + cron**](PLAN-014.md) `2026-04-24`
- [x] [**PLAN-015 Physical extraction — move worker/** into @aiworker/core**](PLAN-015.md) `2026-04-24`
- [x] [**PLAN-016 Deployment reshape — CLI-first install, docker as optional fast-launch**](PLAN-016.md) `2026-04-24`
- [x] [**PLAN-017 Bare-metal smoke regressions — fix four blockers found during local smoke**](PLAN-017.md) `2026-04-26`
- [x] [**PLAN-018 Worker self-enrollment via shared join token**](PLAN-018.md) `2026-04-26`
- [x] [**PLAN-019 Worker OTP-attended enrollment (operator-approved join, CLI-only)**](PLAN-019.md) `2026-04-27`
- [x] [**PLAN-020 CLI rename to `aiworker` + npm publish under `@zonease/aiworker-cli`**](PLAN-020.md) `2026-04-27`
- [-] [**PLAN-021 Worker 项目级落位 + 上下文连贯 + skill/MCP per-worker + 自我迭代闭环**](PLAN-021.md) `2026-04-27`
- [-] [**PLAN-022 复活并重构 Worker + Fleet Web UI（epic）**](PLAN-022.md) `2026-04-27`
- [x] [**PLAN-023 Phase A — Worker 项目级落位（fs-layout scope + CLI init/scope）**](PLAN-023.md) `2026-04-27`
- [x] [**PLAN-024 Phase A hardening — project-scope CLI placement**](PLAN-024.md) `2026-04-28`
- [x] [**PLAN-025 Release readiness hardening for 0.4.0**](PLAN-025.md) `2026-04-28`
- [-] [**PLAN-026 Codex app-server protocol compatibility for 0.4.1**](PLAN-026.md) `2026-04-28`
