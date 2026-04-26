# REFACTOR-003 CLI-first lightweight runtime (aiw / aim / gateway)

- **status**: completed
- **priority**: P1
- **owner**: coordinator
- **createdAt**: 2026-04-24 11:40
- **startedAt**: 2026-04-24 11:40
- **completedAt**: 2026-04-26 10:30
- **plans**: PLAN-011, PLAN-012, PLAN-013, PLAN-014, PLAN-015, PLAN-016

## Outcomes

REFACTOR-003 历时 2.5 天（2026-04-24 → 2026-04-26），分 6 个 plan 落地。所有 plan 都 `[x]` 完成；REFACTOR-002 时代的 dashboard REST + 单进程 monolith 形态完全下线，aiworker 现在是"两枚 bin（aiw worker-side + aim operator-side）+ 一个 WS gateway 控制面 + 文件系统 source-of-truth + transport-agnostic core 包"的 CLI-first 形态。

| Plan | 状态 | 关键交付 |
|---|---|---|
| **PLAN-011** Phase 1a — storage-sqlite + aiw 骨架 | `[x]` | `@aiworker/storage-sqlite` 抽离；`apps/cli` + `aiw` bin（init/run/serve/config/token） |
| **PLAN-012** Filesystem source of truth | `[x]` | `~/.aiworker/workers/<id>/` 布局；`HermesProvider → FilesystemBrainProvider`；`@aiworker/fs-layout` 包 |
| **PLAN-013** aim CLI + WS gateway | `[x]` | `apps/gateway` + `@aiworker/gateway-proto` + `aim` bin；dashboard REST 整段删除；web SPA 切 WS |
| **PLAN-014** envelope + approvals + fallback + cron | `[x]` | F1 `Envelope.accountId/richMetadata`；F2 per-tool `toolPolicy` + approval handshake；F3 `FallbackExecutor` + 6 错误分类；F4 `cron_jobs` + tick + `aim/aiw schedule` |
| **PLAN-015** worker/** → @aiworker/core | `[x]` | 物理抽离 + ESLint guard + hot-reload regression；`apps/api` 瘦身到 Hono 路由层 |
| **PLAN-016** deployment reshape | `[x]` | `aim install systemd` 子命令；docs 三档（裸跑 / systemd / docker）；docker 降级为可选 fast-launch |

CLAUDE.md §"Architecture Constraints"列的全部不变量在每个 plan 完成态都验证保留：

- fleet.db / worker.db 物理隔离（gateway 持 fleet，worker 持 worker）。
- AES-256-GCM 封 `apiTokenEnc`；gateway 与 worker 的 crypto 模块仍有意复制。
- bearer 比对 `timingSafeEqualStrings`；hot-reload 路由 / dispatcher / subscriber 全部 `() => state.runtime` 闭包懒取。
- Provider 扩展契约（brain/executor/channel）保持 factory switch 模式，未在 orchestrator 引入 provider-specific 分支。
- Evolution observer + cron + approvals 全部离 hot path（observer 仅持久化、cron 60s tick 与 ingest 解耦、approvals 仅在 ask 状态挂起 promise）。

测试基线累积变化：

- `apps/api` 410 → 32（worker 业务测整体迁出至 core；保留 Hono 路由 / bearer-auth 测）
- `packages/core` 0 → 381（迁入 + 新增 hot-reload 闭包 regression）
- `packages/shared` 18（lib/ids + errors 入 shared 后 +18）
- `apps/gateway` 55（PLAN-013 + PLAN-014 累积）
- `packages/gateway-proto` 11
- `apps/cli` 0 → 13（PLAN-016 S1 install 子命令）
- `apps/web` 24 + 13 skipped（PLAN-013 后维持，13 个 .skip 为 follow-up）

总 `bun run check` 9 包全绿；3 个 smoke（aiw-run / gateway-local / aim）持续绿。

## Follow-ups（已知遗留，不阻塞 task 关 `[x]`）

- web 13 个 `.skip` 测试要基于 WS mock 重写（PLAN-013 历史）。
- `evolution_observations` 滚动压实策略（PLAN-004 历史）。
- `reloadRuntime` 极短窗口内 cron 双 `setInterval` 极小 race（PLAN-014 outcome）。
- `aim install systemd` unit 模板假设 `~/.bun/bin/aim`；打 binary 形态时（PLAN-017+）`ExecStart` 需要 parameterize（PLAN-016 outcome）。
- launchd（macOS）+ 其他 init 系统的 `aim install` 子命令（PLAN-016 outcome）。
- BKD coordinator 的 worktree-fork-base 偏移问题（PLAN-016 S2 因此没走自动合并）值得在 BKD 侧单独跟踪。
- `apps/api/src/worker/<area>/` 路由树仅剩 6 文件，可考虑后续重命名为 `apps/api/src/routes/worker/`（PLAN-015 outcome）。

## Description

Reshape AIWorker from an HTTP-server-first fleet runtime into a **CLI-first lightweight runtime**, inspired by Hermes (CLI + gateway share one conversation loop) and OpenClaw (long-lived local gateway over WebSocket, device-paired clients).

Concrete end state:

- `aiw` — worker-side CLI. Single binary (Bun compile). Can run an interactive REPL without starting any HTTP server, can also `aiw serve` to expose the current worker HTTP surface.
- `aim` — manager-side CLI. Single binary. Talks to one or many `aiw` instances via the gateway; covers everything today's dashboard REST surface exposes (register / launch-local / proxy / audit).
- `gateway` — long-running process (daemon) that fronts CLI + Web UI + worker nodes. Borrows the OpenClaw operator/node split: CLIs connect as operators, worker runtimes connect as nodes. Default bind `127.0.0.1`; remote access via SSH tunnel / Tailscale. Web UI consumes the same protocol, no longer a first-class surface.
- Core runtime (orchestrator + brain + executor + channels + evolution) extracted into a transport-agnostic `packages/core`. HTTP / CLI / gateway are three thin adapters over the same core.

Acceptance criteria (to be finalised during Proposal approval):

- `aiw run` starts a REPL that completes a round-trip conversation against any configured executor with zero HTTP endpoints bound.
- `aiw serve` remains bit-for-bit compatible with the current `AIWORKER_MODE=worker` HTTP surface (routes, payloads, SSE, OpenAPI spec).
- `aim workers …` reproduces the full dashboard REST surface via the gateway protocol; the legacy `AIWORKER_MODE=dashboard` HTTP server can be deprecated behind a flag (not removed in the first pass).
- Architecture Constraints from `CLAUDE.md` remain intact: `fleet.db` / `worker.db` isolation, master-key-guarded vault, bearer-token auth with `timingSafeEqual`, hot-reload runtime, provider-contract extensibility, hop-by-hop header handling.
- Web UI (`apps/web`) consumes the gateway protocol; existing pages (workers list / detail / orchestrator / skills / config) keep working.
- Binaries are produced by CI (`bun build --compile`); distribution channel (GHCR image + raw binary artefact) designed in plan.

## ActiveForm

Refactoring AIWorker into CLI-first lightweight runtime with a gateway remote-control plane

## Dependencies

- **blocked by**: (none)
- **blocks**: future feature work that assumes the current dashboard-REST contract (must land after PLAN-011 phase 1 is merged, or be written against the new core)

## Notes

Related plan: PLAN-011 (investigation + phased migration). No BKD project yet — will be created after proposal approval when scope is final.

References surfaced during investigation:

- Hermes shares `AIAgent.run_conversation()` between `cli.py` and `gateway/run.py`; `~/.hermes/` is the filesystem source of truth for skills + memories.
- OpenClaw runs a single long-lived WebSocket gateway on `127.0.0.1:18789` with TypeBox-validated JSON frames, operator (CLI / mac app / web admin) vs node (mobile / headless) roles, device-pairing challenge-response, loopback auto-approval, remote access via SSH tunnel or Tailscale.
- OpenClaw RFC 42026 proposes splitting the monolithic gateway into `control-plane` + per-agent `runtime` processes with three deploy shapes (`embedded` / `local-split` / `distributed`) — aligns directly with the split we already have (dashboard vs worker), but over a leaner transport.
