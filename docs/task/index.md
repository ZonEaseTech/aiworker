# AIWorker - Task List

> Updated: 2026-05-04

## Usage

Each task is a single line linking to its detail file. All detailed information lives in `docs/task/PREFIX-NNN.md`.

### Format

- [ ] [**PREFIX-001 Short imperative title**](PREFIX-001.md) `P1`

### Status Markers

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Pending |
| `[-]`  | In progress |
| `[x]`  | Completed |
| `[~]`  | Closed / Won't do |

### Priority: P0 (blocking) > P1 (high) > P2 (medium) > P3 (low)

### Rules

- Only update the checkbox marker; never delete the line.
- New tasks append to the end.
- See each `PREFIX-NNN.md` for full details.

---

## Tasks

- [x] [**FEAT-001 Build AIWorker middleware product**](FEAT-001.md) `P1`
- [x] [**REFACTOR-001 Refactor AIWorker into a self-hosted Agent Runtime**](REFACTOR-001.md) `P1`
- [x] [**REFACTOR-002 Refactor AIWorker into a multi-worker fleet runtime**](REFACTOR-002.md) `P1`
- [~] [**FEAT-002 Executable skills runtime (sandbox)**](FEAT-002.md) `P3`
- [x] [**FEAT-003 Telegram channel adapter**](FEAT-003.md) `P2`
- [x] [**FEAT-004 Lark channel adapter**](FEAT-004.md) `P2`
- [x] [**FEAT-005 WhatsApp channel adapter (Meta Cloud API)**](FEAT-005.md) `P2`
- [x] [**FEAT-006 Evolution generator (Hermes-style skill self-learning)**](FEAT-006.md) `P2`
- [~] [**FEAT-007 M:1 channel routing (multiple workers, one chat)**](FEAT-007.md) `P3`
- [~] [**FEAT-008 Host-level HA and multi-host fleet**](FEAT-008.md) `P3`
- [x] [**FEAT-009 Deployment automation (aissh-driven fleet deploy)**](FEAT-009.md) `P1`
- [~] [**FEAT-010 Publish registry routes into OpenAPI spec**](FEAT-010.md) `P3`
- [x] [**FEAT-011 Normalize AgentEvent schema and refactor OpenAI-compat executor**](FEAT-011.md) `P1`
- [x] [**FEAT-012 Claude Code executor with git worktree workspace**](FEAT-012.md) `P1`
- [x] [**FEAT-013 ACP harness plus Gemini and Qwen adapters**](FEAT-013.md) `P1`
- [x] [**FEAT-014 Three-tier ExecutorConfig and frontend picker**](FEAT-014.md) `P1`
- [x] [**FEAT-015 Process manager replacing AsyncQueue**](FEAT-015.md) `P2`
- [x] [**FEAT-016 Codex and Cursor agent adapters (optional)**](FEAT-016.md) `P3`
- [x] [**FEAT-017 Register worker UX improvements**](FEAT-017.md) `P1`
- [x] [**FEAT-018 Engine availability discovery**](FEAT-018.md) `P1`
- [x] [**FEAT-019 Model picker with known-model catalog per engine**](FEAT-019.md) `P1`
- [x] [**FEAT-020 Bake npm agentic CLIs into the worker image**](FEAT-020.md) `P1`
- [x] [**FEAT-021 Bake Cursor agent into the full image (optional)**](FEAT-021.md) `P3`
- [x] [**FEAT-022 Auth mount recipe + Register dialog hint**](FEAT-022.md) `P2`
- [x] [**FEAT-023 Manager-driven worker creation**](FEAT-023.md) `P1`
- [x] [**REFACTOR-003 CLI-first lightweight runtime (aiw / aim / gateway)**](REFACTOR-003.md) `P1`
- [x] [**BUG-001 Decouple dev defaults for WORKER_DATA_ROOT and WORKER_MIGRATIONS_FOLDER**](BUG-001.md) `P1`
- [x] [**BUG-002 aim pair must persist gatewayUrl to aim.json**](BUG-002.md) `P1`
- [x] [**BUG-003 Wire config.put handler in aiw serve gateway-client**](BUG-003.md) `P2`
- [x] [**BUG-004 Refresh gateway-client subscriber after runtime hot-reload**](BUG-004.md) `P1`
- [x] [**BUG-005 aiw run waits for orchestrator.task.* but runtime emits orchestrator.finished**](BUG-005.md) `P2`
- [x] [**BUG-006 Make reloadRuntime serialisation explicit (in-process mutex)**](BUG-006.md) `P3`
- [x] [**BUG-007 Public Caddy ingress bypasses gateway authN (loopback misidentification)**](BUG-007.md) `P0`
- [x] [**FEAT-024 Worker self-enrollment via shared join token**](FEAT-024.md) `P2`
- [x] [**BUG-008 workerSummarySchema rejects self-enrolled worker (empty baseUrl)**](BUG-008.md) `P1`
- [x] [**FEAT-026 Worker OTP-attended enrollment (operator-approved join)**](FEAT-026.md) `P2`
- [x] [**BUG-009 OTP approve does not upgrade ws to NodeRegistry**](BUG-009.md) `P1`
- [x] [**FEAT-027 Publish CLIs to npmjs.com (or compiled binaries via GH Releases)**](FEAT-027.md) `P2`
- [x] [**FEAT-028 CLI naming redesign (aiw / aim too cryptic)**](FEAT-028.md) `P2`
- [x] [**BUG-010 Runtime log strings still reference `aiw` / `aim` / `aim.json` after PLAN-020 rename**](BUG-010.md) `P3`
- [x] [**FEAT-030 Zero-env-quickstart: dynamic CLI version + new default ports + first-run master-key auto-mint**](FEAT-030.md) `P1`
- [x] [**FEAT-029 License decision + LICENSE file + 9 package.json `license` fields**](FEAT-029.md) `P1`
- [x] [**BUG-011 Worker quickstart 仍要求显式 WORKER_DB_PATH / WORKER_MIGRATIONS_FOLDER（与 FEAT-030 README 承诺不符）**](BUG-011.md) `P3`
- [x] [**REFACTOR-004 测试服部署迁移：源码 systemd → 已发布 npm cli + `aiworker install systemd`**](REFACTOR-004.md) `P1`
- [x] [**BUG-012 `aiworker gateway start` 在 npm install 场景下不能启动（仓库布局假设）**](BUG-012.md) `P1`
- [x] [**BUG-013 `workers.info` / `workers.stop` 在 node-side dispatcher 显式 stub `method_not_implemented`**](BUG-013.md) `P2`
- [x] [**BUG-014 Harden `aiworker install systemd` unit and portable ExecStart**](BUG-014.md) `P2`
- [x] [**BUG-015 worker /api/worker/{orchestrator,evolution,events} 缺 bearer-auth**](BUG-015.md) `P0`
- [x] [**BUG-016 web channel webhook 无验签无鉴权（envelope 注入）**](BUG-016.md) `P0`
- [x] [**BUG-017 Lark verificationToken + WhatsApp verifyToken 非常量时间比较**](BUG-017.md) `P0`
- [x] [**BUG-018 CLI engine 子进程 env 白名单（剔除 AIWORKER_MASTER_KEY 等）**](BUG-018.md) `P1`
- [x] [**BUG-019 Gateway loopback bypass fail-closed 启动断言**](BUG-019.md) `P1`
- [x] [**BUG-020 gateway WebSocket maxPayloadLength + idleTimeout + connect 限频**](BUG-020.md) `P1`
- [x] [**REFACTOR-005 worker.db 缺关键索引（messages / conversations / cron_jobs 等）**](REFACTOR-005.md) `P2`
- [x] [**REFACTOR-006 orchestrator API 入参 zod 校验 + 历史消息分页窗口**](REFACTOR-006.md) `P2`
- [x] [**REFACTOR-007 杂项小修：bus 异常吞 / lark cache / fleet count / secrets key**](REFACTOR-007.md) `P2`
- [x] [**REFACTOR-008 baseline lint debt 清零（package.json sort-keys + cli process global + CI lint step）**](REFACTOR-008.md) `P3`
- [~] [**FEAT-031 Worker 项目级落位 + 上下文连贯 + skill/MCP per-worker + 自我迭代闭环（epic）**](FEAT-031.md) `P1`
- [x] [**FEAT-032 复活并重构 Worker + Fleet Web UI（epic）**](FEAT-032.md) `P1`
- [x] [**REFACTOR-011 fs-layout 引入 project scope 解析 + project layout 模板**](REFACTOR-011.md) `P1`
- [x] [**FEAT-036 CLI `aiworker init` / `aiworker scope` 项目级初始化命令**](FEAT-036.md) `P1`
- [x] [**FEAT-033 Phase 1 — apps/web 静态托管 + 双视角源码骨架**](FEAT-033.md) `P1`
- [x] [**FEAT-034 Phase 2 — Fleet UI MVP**](FEAT-034.md) `P1`
- [x] [**FEAT-035 Phase 3 — Worker UI MVP**](FEAT-035.md) `P1`
- [x] [**REFACTOR-009 Phase 4 — apps/web 独立性强化与回归保护**](REFACTOR-009.md) `P2`
- [x] [**REFACTOR-010 Phase 5 — Web UI 能力补齐与可观测性（可选）**](REFACTOR-010.md) `P3`
- [x] [**BUG-021 Project-scope CLI placement is bypassed by bootstrap env pinning**](BUG-021.md) `P1`
- [x] [**BUG-022 Web admin SPA mount paths break fleet routing and deep links**](BUG-022.md) `P1`
- [x] [**BUG-023 Release blockers after v0.3.0 prevent 0.4.0 publishing**](BUG-023.md) `P1`
- [x] [**BUG-024 Codex executor fails against current Codex app-server protocol**](BUG-024.md) `P1`
- [x] [**BUG-025 Codex executor drops worker conversation history between turns**](BUG-025.md) `P1`
- [x] [**FEAT-037 OpenClaw-style worker session control plane**](FEAT-037.md) `P1`
- [x] [**BUG-027 Gateway chat accepted conversation id cannot be reused for continuation**](BUG-027.md) `P1`
- [x] [**BUG-028 Web UI CSS bundle misses Tailwind utilities**](BUG-028.md) `P1`
- [x] [**REL-001 Publish aiworker CLI 0.4.4**](REL-001.md) `P1`
- [x] [**QA-001 Run extended 0.4.4 validation campaign**](QA-001.md) `P1`
- [x] [**BUG-029 Gateway start fails in a clean cwd without a preexisting data directory**](BUG-029.md) `P1`
- [x] [**BUG-030 Fleet and worker admin mobile layouts overflow under narrow viewports**](BUG-030.md) `P2`
- [x] [**BUG-031 Gateway start persists root WS URL instead of `/ws`**](BUG-031.md) `P1`
- [x] [**BUG-032 Stabilize workspace-wide test gate under concurrent package execution**](BUG-032.md) `P1`
- [x] [**BUG-033 CLI/gateway integration tests can leak gateway processes on timeout**](BUG-033.md) `P1`
- [x] [**TODO-001 Correct Web UI command copy for enrollment and worker management**](TODO-001.md) `P2`
- [x] [**TODO-002 Normalize CLI argument validation and command semantics**](TODO-002.md) `P2`
- [x] [**TODO-003 Refresh Web build config and bundle budget warnings**](TODO-003.md) `P3`
- [x] [**TODO-004 Evaluate app-level admin auth or fail-closed checks**](TODO-004.md) `P2`
- [x] [**TODO-005 Apply safe-env policy to git workspace helper processes**](TODO-005.md) `P3`
- [x] [**TODO-006 Normalize remote CLI PATH and version inspection**](TODO-006.md) `P3`
- [x] [**BUG-034 Web smoke-e2e imports removed gateway package path**](BUG-034.md) `P2`
- [x] [**REL-002 Publish aiworker CLI 0.4.5**](REL-002.md) `P1`
- [x] [**BUG-035 `aiworker serve` exits after starting worker server**](BUG-035.md) `P0`
- [x] [**BUG-036 Codex executor returns app-server reconnect error during fleet validation**](BUG-036.md) `P1`
- [x] [**DOC-001 刷新 AGENTS.md 工作指引**](DOC-001.md) `P3`
- [x] [**REFACTOR-012 按 DESIGN.md 收敛 Web UI 视觉系统**](REFACTOR-012.md) `P2`
- [x] [**FEAT-038 Worker 决策管线：意图识别、能力选择与质量门禁**](FEAT-038.md) `P1`
- [x] [**REL-003 发布 aiworker CLI 0.4.6**](REL-003.md) `P1`
- [~] [**FEAT-039 Worker 初始化与 Soul 生命周期：安全 init、模板预置、能力包与更新治理**](FEAT-039.md) `P1`
- [x] [**FEAT-040 Fleet 统一入口管理非同 host worker**](FEAT-040.md) `P1`
- [x] [**DOC-002 接入 code-review-graph 开发工作流**](DOC-002.md) `P3`
- [x] [**BUG-037 Fleet Audit log table scrolls the whole page**](BUG-037.md) `P2`
- [x] [**REL-004 发布 aiworker CLI 0.4.7**](REL-004.md) `P1`
- [x] [**REL-005 发布 aiworker CLI 0.4.8**](REL-005.md) `P1`
- [x] [**BUG-038 Worker info reports stale runtimeVersion after 0.4.8 upgrade**](BUG-038.md) `P2`
- [x] [**BUG-039 优化 npx / bunx CLI 启动体验**](BUG-039.md) `P1`
- [x] [**FEAT-041 优化 CLI help 信息架构**](FEAT-041.md) `P2`
- [x] [**REL-006 发布 aiworker CLI 0.4.9**](REL-006.md) `P1`
- [x] [**BUG-040 `aiworker init` skips Soul template selection and still creates a stub worker**](BUG-040.md) `P1`
- [x] [**BUG-041 Project-scope engines start outside the project root**](BUG-041.md) `P1`
- [x] [**FEAT-042 Orchestrator 控制执行器与任务执行器解耦**](FEAT-042.md) `P1`
- [x] [**REL-007 发布 aiworker CLI 0.4.10**](REL-007.md) `P1`
- [x] [**FEAT-043 优化 init 后引导与 Soul 能力测试流程**](FEAT-043.md) `P1`
- [x] [**REFACTOR-013 稳定 CLI test gate 并拆分 Soul preset 模块**](REFACTOR-013.md) `P1`
- [x] [**FEAT-044 Executor capability projection commands**](FEAT-044.md) `P1`
- [x] [**DOC-003 标记废弃 PMA 方案与 capability 边界**](DOC-003.md) `P1`
- [x] [**DOC-004 清理陈旧 PMA 待办状态**](DOC-004.md) `P1`
- [x] [**REFACTOR-014 Rename internal CLI operator module away from `aim`**](REFACTOR-014.md) `P2`
- [x] [**REFACTOR-015 CLI IA canonical worker/fleet/gateway command tree**](REFACTOR-015.md) `P1`
- [x] [**REL-008 发布 aiworker CLI 0.4.11**](REL-008.md) `P1`
- [x] [**FEAT-045 Worker quick start `aiworker up`**](FEAT-045.md) `P1`
- [x] [**REL-009 发布 aiworker CLI 0.5.0**](REL-009.md) `P1`
- [x] [**BUG-042 `aiworker up --dry-run` prints `NaN` for omitted port**](BUG-042.md) `P3`
- [x] [**QA-002 Run local Codex-backed worker validation campaign**](QA-002.md) `P1`
- [x] [**BUG-043 Worker Admin chat event stream times out before slow replies**](BUG-043.md) `P1`
- [x] [**BUG-044 Worker Admin chat does not continue the selected conversation**](BUG-044.md) `P1`
- [x] [**BUG-045 Orchestrator task rows stay queued after successful worker execution**](BUG-045.md) `P1`
- [x] [**BUG-046 Executor tiny probe can hang beyond the configured timeout**](BUG-046.md) `P2`
- [x] [**BUG-047 Worker Admin no-token state renders raw auth errors**](BUG-047.md) `P2`
- [ ] [**TODO-007 Polish Worker Admin validation UX from local worker testing**](TODO-007.md) `P3`
- [x] [**BUG-048 `aiworker init` skips Soul prompt when legacy home looks like project scope**](BUG-048.md) `P1`
- [x] [**REL-010 发布 aiworker CLI 0.5.1**](REL-010.md) `P1`
- [x] [**REL-011 发布 aiworker CLI 0.5.2**](REL-011.md) `P1`
- [x] [**FEAT-046 Worker local brain activation and lifecycle**](FEAT-046.md) `P1`
- [x] [**FEAT-047 Worker executor bootstrap and capability lifecycle**](FEAT-047.md) `P1`
- [x] [**BUG-049 User-scope init points to project-only executor doctor**](BUG-049.md) `P3`
- [x] [**REL-012 发布 aiworker CLI 0.5.3**](REL-012.md) `P1`
- [x] [**QA-003 Record Soul brain executor validation campaign**](QA-003.md) `P1`
- [ ] [**BUG-050 Surface live Codex tool activity as AIWorker tool events**](BUG-050.md) `P2`
- [ ] [**BUG-051 Preserve hyphenated executor MCP arg values**](BUG-051.md) `P3`
- [ ] [**TODO-008 Create repeatable Soul brain executor validation harness**](TODO-008.md) `P2`
- [x] [**BUG-052 `orchestrator.text` emits duplicate final text after streamed deltas**](BUG-052.md) `P2`
- [x] [**BUG-053 Codex executor may replay final text after streamed deltas**](BUG-053.md) `P2`
- [x] [**FEAT-048 Product positioning pivot to Project Brain and Worker/Fleet aggregation**](FEAT-048.md) `P1`
- [x] [**FEAT-049 Simplify executor surface around bring-your-own runtimes**](FEAT-049.md) `P1`
- [x] [**FEAT-050 Strengthen Project Brain product surface**](FEAT-050.md) `P1`
- [x] [**FEAT-051 Strengthen Worker/Fleet aggregation surface**](FEAT-051.md) `P1`
- [x] [**FEAT-052 Define bring-your-own executor integration strategy**](FEAT-052.md) `P2`
- [x] [**FEAT-053 Clarify Project scope as worker-bound business scope**](FEAT-053.md) `P1`
- [-] [**FEAT-054 Soul modules and Scope Brain kernel**](FEAT-054.md) `P1`
