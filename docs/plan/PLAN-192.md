# PLAN-192 OD-style local worker reboot

- **status**: implementing
- **owner**: local
- **createdAt**: 2026-05-09 16:31
- **approvedAt**: 2026-05-09 16:36
- **relatedTask**: REFACTOR-026

## Current State

AIWorker 当前实现已经有很多正确的低层组件：

- `apps/cli` 能初始化 project-scope `.aiworker/`，选择 executor，启动 `serve`，提交 `run`；
- `apps/api` 暴露 worker REST/SSE，并托管 Worker Admin；
- `packages/core` 有 executor adapter、conversation、orchestrator、Brain Journal、Gate、Admission、Case、Inbox、Cron、Channel；
- `apps/web` 有 worker chat / brain / cases / config / approvals / cron 等页面。

问题是这些能力是 governance-first 的堆叠，不是 OD-style 产品回路。用户进入系统时看到的是 Brain/Gate/Case/Admission/Fleet 等抽象，而不是：

```text
选择业务技能和领域上下文 -> 发起 work order -> executor 在真实 workspace 里工作 -> 产物和证据实时出现 -> 可复盘、可晋升为长期经验
```

Open Design 当前参照形态：

- local daemon 是唯一 privileged process；
- web 是 artifact 工作台；
- SQLite 在 `.od/app.sqlite` 存 project / conversation / message / tabs / run metadata；
- files under `.od/projects/<id>/` 是产物 truth；
- `SKILL.md` + `DESIGN.md` + discovery prompt 是核心产品资产；
- `/api/runs` + SSE 是 web 与 daemon 的统一执行协议；
- executor CLI 只在 project cwd 下运行，不被 OD 重建成内置 agent platform。

## Product Pivot

本轮接受一个明确 pivot：

> AIWorker local worker should be an Open Design-style business workbench, not a governance-first Project Brain kernel.

领域差异只体现在 worker packs：

| Open Design | AIWorker reboot |
| --- | --- |
| Design skill | Worker skill，例如 codebase review、candidate screen、PM spec、QA audit |
| Design system | Domain system，例如 repo conventions、role rubric、roadmap style、finance policy |
| Project folder | Worker workspace / scope folder |
| Artifact preview | Case artifact / report / file preview |
| Prompt template | Work-order template |
| Daemon run | Worker run |
| Critique | Review / lesson candidate |
| Media output | Business deliverable files |

这意味着 GOALS.md 与 docs/architecture.md 需要先被改写，否则实现阶段会继续被旧 Brain Governance Kernel 牵引。

## Proposal

按 8 个 slice 落地，每个 slice 独立提交，必要时单独创建子 task/plan。

1. **S0 — Product reset docs**
   - 改写 `GOALS.md`、`docs/architecture.md`、README/CLI docs 的 worker 定位。
   - 明确 fleet/gateway deferred，不作为默认体验。
   - 验证：docs diff review + `git diff --check`。

2. **S1 — Worker daemon run contract**
   - 新建或重塑本地 run service，对齐 OD `/api/runs` 模型：create/list/show/events/cancel。
   - CLI `run`、HTTP submit、web chat 都走同一个 run service。
   - 保留 executor adapter，但把 Journal/Gate/Admission 从主 run path 下沉为可选 observers。
   - 验证：focused core/API tests。

3. **S2 — Workspace and metadata model**
   - 收敛 worker.db：workspace/project metadata、conversations、messages、runs、artifact index、reviews。
   - 真实产物留在 workspace 文件夹；DB 不复制业务内容。
   - 允许 destructive migration，因为 1.0 前不保 legacy。
   - 验证：storage migration/tests + CLI smoke。

4. **S3 — Worker packs**
   - 用 OD `SKILL.md` / `DESIGN.md` 语法做 AIWorker `worker-skills/` 与 `domain-systems/`。
   - 内置 developer、hr-recruiting、project-manager、qa-reviewer 等 packs。
   - 选择逻辑只做 prompt composition，不做领域 workflow engine。
   - 验证：pack parser tests + init/list/show tests。

5. **S4 — CLI daemon lifecycle**
   - 重新整理 CLI：`aiworker init` 生成 local worker workspace；`aiworker daemon` 或等价 canonical command 启动 daemon/web；`aiworker run` 提交 work order。
   - root help 必须像 OD `tools-dev` 一样说明 start / stop / status / logs / inspect / check。
   - 验证：CLI help snapshots、daemon start smoke、bundle build。

6. **S5 — Worker web workbench**
   - 重构 Worker Admin 第一屏为 OD-style workbench：skill/domain picker、composer、run timeline、file/artifact panel、case/review panel。
   - 现有 Brain/Admission/Config/Cron 页面默认降级到 secondary/admin。
   - 验证：web build、component tests、Playwright/browser visual smoke。

7. **S6 — Review and lesson promotion**
   - 把现有 Gate/Brain Engine/Admission/Case 改成 run 后复盘：review result、lesson candidate、promote to durable context。
   - 不再让 governance terminology 压在首轮 work order 之前。
   - 验证：review/admission focused tests + local worker dogfood。

8. **S7 — Cleanup, release, and evidence**
   - 删除或隐藏旧默认路径、陈旧命名和重复 API。
   - 更新 docs/changelog、PMA task/plan。
   - 跑聚焦 gate、全量 check/build、source local smoke、published package harness。
   - 根据结果发布下一版。

## Scope

第一轮批准后，优先改：

- `GOALS.md`
- `docs/architecture.md`
- README / CLI docs
- `apps/cli/src/aiworker.ts`
- `apps/cli/src/commands/worker/*`
- `apps/api/src/worker/*`
- `apps/web/src/worker/*`
- `packages/core/src/worker/*`
- `packages/storage-sqlite/src/worker/*`
- `packages/shared/src/soul/*` 或新的 worker pack surface

明确暂不改：

- `packages/gateway*`
- `apps/web/src/fleet/*`
- gateway enrollment / remote worker / public deployment routes
- desktop / Electron

## Risks

- **产品语义冲突**：当前 GOALS 是 governance runtime；本方案把 worker 主路径改成 business workbench。必须先接受并落文档，否则实现会自相矛盾。
- **迁移破坏性**：worker.db schema 和 CLI command tree 可能破坏 0.12.x 行为。1.0 前允许，但每个 slice 要明确删除理由。
- **OD 参照误读**：OD 的 `server.ts` 很大且仍有 `@ts-nocheck`，不能复制巨石结构；只复制 run/workspace/skill/artifact 产品拓扑。
- **范围回流**：fleet/gateway 一旦重新进入默认路径，S1-S5 会被拖回旧控制面问题。
- **验证成本**：这不是单次 build 能证明的改造，必须用真实 local worker smoke 和 web smoke 收口。

## Alternatives

1. **保留当前 Project Brain north star，只做 UI 简化。**
   - 代价：不会解决“产品无法推进”的根因，只是把复杂度换皮。

2. **直接 fork/copy Open Design 架构和技术栈。**
   - 代价：Next/Express/Node24 与本仓库 Bun/Hono/Vite/release pipeline 冲突；会制造第二个产品，而不是重构 AIWorker。

3. **只做 developer repo worker，放弃 HR/PM 等业务域。**
   - 代价：短期更容易验证，但违背用户本次“适用领域区分”的方向；建议作为第一个 smoke pack，而不是产品边界。

推荐方案是复制 OD 的产品语法和运行拓扑，保留本仓库的 Bun/Hono/React/Vite 发布基础。

## Verification

每个 slice 至少运行对应 focused tests。完整收口前运行：

- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- source-local worker daemon smoke
- Worker web browser smoke
- CLI bundle smoke
- published-package compact harness if release is included

## Progress

- 2026-05-09 16:31：调查 Open Design 当前 `main` (`4c15ea4`) 与本仓库 worker/CLI/web 结构，创建 draft proposal。
- 2026-05-09 16:36：按用户授权进入实施；S0 聚焦产品北极星与目标架构文档重置，不改 runtime code。
- 2026-05-09 16:55：S1A 通过 REFACTOR-027 / PLAN-193 完成 `/api/worker/runs` 兼容层，web submit/continue 已改走 run contract。
