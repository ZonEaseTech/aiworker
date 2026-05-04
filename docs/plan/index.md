# AIWorker - Plan Index

> Updated: 2026-05-04

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
- [~] [**PLAN-021 Worker 项目级落位 + 上下文连贯 + skill/MCP per-worker + 自我迭代闭环**](PLAN-021.md) `2026-04-27`
- [x] [**PLAN-022 复活并重构 Worker + Fleet Web UI（epic）**](PLAN-022.md) `2026-04-27`
- [x] [**PLAN-023 Phase A — Worker 项目级落位（fs-layout scope + CLI init/scope）**](PLAN-023.md) `2026-04-27`
- [x] [**PLAN-024 Phase A hardening — project-scope CLI placement**](PLAN-024.md) `2026-04-28`
- [x] [**PLAN-025 Release readiness hardening for 0.4.0**](PLAN-025.md) `2026-04-28`
- [x] [**PLAN-026 Codex app-server protocol compatibility for 0.4.1**](PLAN-026.md) `2026-04-28`
- [x] [**PLAN-027 Codex session continuity and reset controls**](PLAN-027.md) `2026-04-28`
- [x] [**PLAN-028 OpenClaw-style worker session control plane**](PLAN-028.md) `2026-04-28`
- [x] [**PLAN-029 Gateway chat accepted id continuation**](PLAN-029.md) `2026-04-28`
- [x] [**PLAN-030 Restore Web Tailwind utility generation**](PLAN-030.md) `2026-04-28`
- [x] [**PLAN-031 Publish aiworker CLI 0.4.4**](PLAN-031.md) `2026-04-28`
- [x] [**PLAN-032 Extended 0.4.4 validation campaign**](PLAN-032.md) `2026-04-28`
- [x] [**PLAN-033 Admin surface fail-closed posture**](PLAN-033.md) `2026-04-28`
- [x] [**PLAN-034 Integrate reviewed 0.4.4 repairs and optimizations**](PLAN-034.md) `2026-04-28`
- [x] [**PLAN-035 Publish aiworker CLI 0.4.5**](PLAN-035.md) `2026-04-29`
- [x] [**PLAN-036 Keep aiworker serve in foreground**](PLAN-036.md) `2026-04-29`
- [x] [**PLAN-037 Tolerate Codex app-server reconnect notifications**](PLAN-037.md) `2026-04-29`
- [x] [**PLAN-038 Web UI 视觉系统收敛**](PLAN-038.md) `2026-04-29`
- [x] [**PLAN-039 Worker 决策管线：意图识别、能力选择与质量门禁**](PLAN-039.md) `2026-04-29`
- [x] [**PLAN-040 发布 aiworker CLI 0.4.6**](PLAN-040.md) `2026-04-29`
- [~] [**PLAN-041 Worker 初始化与 Soul 生命周期：安全 init、模板预置、能力包与更新治理**](PLAN-041.md) `2026-04-29`
- [x] [**PLAN-042 Fleet 统一入口管理非同 host worker**](PLAN-042.md) `2026-04-29`
- [x] [**PLAN-043 code-review-graph 开发工作流接入**](PLAN-043.md) `2026-04-29`
- [x] [**PLAN-044 Fleet Audit log 内部表格滚动**](PLAN-044.md) `2026-04-29`
- [x] [**PLAN-045 发布 aiworker CLI 0.4.7**](PLAN-045.md) `2026-04-30`
- [x] [**PLAN-046 发布 aiworker CLI 0.4.8**](PLAN-046.md) `2026-04-30`
- [x] [**PLAN-047 优化 npx / bunx CLI 启动体验**](PLAN-047.md) `2026-04-30`
- [x] [**PLAN-048 优化 CLI help 信息架构**](PLAN-048.md) `2026-04-30`
- [x] [**PLAN-049 发布 aiworker CLI 0.4.9**](PLAN-049.md) `2026-04-30`
- [x] [**PLAN-050 Project-scope engine cwd preservation**](PLAN-050.md) `2026-04-30`
- [x] [**PLAN-051 Orchestrator 控制执行器与任务执行器解耦**](PLAN-051.md) `2026-04-30`
- [x] [**PLAN-052 发布 aiworker CLI 0.4.10**](PLAN-052.md) `2026-04-30`
- [x] [**PLAN-053 优化 init 后引导与 Soul 能力测试流程**](PLAN-053.md) `2026-05-01`
- [x] [**PLAN-054 稳定 CLI test gate 并拆分 Soul preset 模块**](PLAN-054.md) `2026-05-01`
- [x] [**PLAN-055 Executor capability projection commands**](PLAN-055.md) `2026-05-01`
- [x] [**PLAN-056 标记废弃 PMA 方案与 capability 边界**](PLAN-056.md) `2026-05-01`
- [x] [**PLAN-057 清理陈旧 PMA 待办状态**](PLAN-057.md) `2026-05-01`
- [x] [**PLAN-058 清理 CLI 运行时旧命名前缀**](PLAN-058.md) `2026-05-02`
- [x] [**PLAN-059 Worker info runtimeVersion 发布版本注入**](PLAN-059.md) `2026-05-02`
- [x] [**PLAN-060 Rename CLI operator module away from aim**](PLAN-060.md) `2026-05-02`
- [x] [**PLAN-061 reloadRuntime in-process serialization**](PLAN-061.md) `2026-05-02`
- [x] [**PLAN-062 CLI IA canonical worker/fleet/gateway command tree**](PLAN-062.md) `2026-05-02`
- [x] [**PLAN-063 Worker quick start `aiworker up`**](PLAN-063.md) `2026-05-02`
- [x] [**PLAN-064 发布 aiworker CLI 0.5.0**](PLAN-064.md) `2026-05-02`
- [x] [**PLAN-065 Worker Admin SSE keepalive for slow replies**](PLAN-065.md) `2026-05-02`
- [x] [**PLAN-066 Worker Admin selected conversation continuation**](PLAN-066.md) `2026-05-02`
- [x] [**PLAN-067 `aiworker init` Soul prompt under legacy home collision**](PLAN-067.md) `2026-05-02`
- [x] [**PLAN-068 Persist orchestrator task lifecycle rows**](PLAN-068.md) `2026-05-02`
- [x] [**PLAN-069 Executor tiny probe hard timeout**](PLAN-069.md) `2026-05-02`
- [x] [**PLAN-070 Worker Admin locked state without bearer token**](PLAN-070.md) `2026-05-02`
- [x] [**PLAN-071 发布 aiworker CLI 0.5.1**](PLAN-071.md) `2026-05-03`
- [x] [**PLAN-072 发布 aiworker CLI 0.5.2**](PLAN-072.md) `2026-05-03`
- [x] [**PLAN-073 Worker local brain activation and lifecycle**](PLAN-073.md) `2026-05-03`
- [x] [**PLAN-074 Executor readiness semantics and first-run guidance**](PLAN-074.md) `2026-05-03`
- [x] [**PLAN-075 Codex MCP projection compatibility**](PLAN-075.md) `2026-05-03`
- [x] [**PLAN-076 Executor selection bootstrap command**](PLAN-076.md) `2026-05-03`
- [x] [**PLAN-077 Engine-native capability lifecycle beyond MCP**](PLAN-077.md) `2026-05-03`
- [x] [**PLAN-078 Real Codex-backed worker validation campaign**](PLAN-078.md) `2026-05-03`
- [x] [**PLAN-079 发布 aiworker CLI 0.5.3**](PLAN-079.md) `2026-05-03`
- [ ] [**PLAN-080 Soul brain executor validation follow-up fixes**](PLAN-080.md) `2026-05-03`
- [x] [**PLAN-081 Claude Code streamed text append-only contract**](PLAN-081.md) `2026-05-04`
- [x] [**PLAN-082 Codex text replay evidence closeout**](PLAN-082.md) `2026-05-04`
- [x] [**PLAN-083 Product positioning PMA tracking and AGENTS guidance**](PLAN-083.md) `2026-05-04`
- [x] [**PLAN-084 Product positioning docs refresh**](PLAN-084.md) `2026-05-04`
- [x] [**PLAN-085 Executor capability overlay semantics**](PLAN-085.md) `2026-05-04`
- [x] [**PLAN-086 Ambient executor readiness and doctor semantics**](PLAN-086.md) `2026-05-04`
- [x] [**PLAN-087 Executor CLI wording and help cleanup**](PLAN-087.md) `2026-05-04`
- [x] [**PLAN-088 Project Brain asset model**](PLAN-088.md) `2026-05-04`
- [x] [**PLAN-089 Brain diagnostics and onboarding UX**](PLAN-089.md) `2026-05-04`
- [x] [**PLAN-090 Brain admission and approval roadmap**](PLAN-090.md) `2026-05-04`
- [ ] [**PLAN-091 Worker/Fleet topology and operator docs**](PLAN-091.md) `2026-05-04`
- [ ] [**PLAN-092 Worker/Fleet status, events, and audit aggregation**](PLAN-092.md) `2026-05-04`
- [ ] [**PLAN-093 Bring-your-own executor thin adapter contract**](PLAN-093.md) `2026-05-04`
- [ ] [**PLAN-094 Hermes thin adapter spike**](PLAN-094.md) `2026-05-04`
- [ ] [**PLAN-095 OpenClaw configured runtime spec**](PLAN-095.md) `2026-05-04`
