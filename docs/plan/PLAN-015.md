# PLAN-015 Physical extraction — move worker/** into @aiworker/core

- **status**: implementing
- **createdAt**: 2026-04-24 15:45
- **revisedAt**: 2026-04-25 12:30
- **approvedAt**: 2026-04-25 12:30
- **relatedTask**: REFACTOR-003
- **supersedes**: 原 PLAN-012 mechanical move 草稿（已废）
- **dependsOn**: PLAN-012 / PLAN-013 / PLAN-014（功能层都到位，剩纯物理重排）

## Why

REFACTOR-003 一路从 PLAN-011 phase 1a 到 PLAN-014 都用 `apps/api/src/lib.ts` 这个临时桥面来让 `apps/cli` / `apps/gateway` 消费 worker runtime。这是当时为了避免和功能演进抢同一份 diff 故意推迟的债。功能层已稳，现在收。

## Current shape (post-PLAN-014)

`apps/api/src/worker/` 现状：

- 14 个顶级模块：`bootstrap / brain / channels / config / conversation / cron / events / evolution / executor / gateway-client / management / orchestrator / runtime.ts / secrets`
- 129 个 ts 文件 / 18,833 行（PLAN-011 时是 107 / 15,075；增长来自 PLAN-013 gateway-client + PLAN-014 cron / approvals / fallback）
- 9 个文件还在用 `../../shared` 或 `../../config` 跨层 import（即跨 worker 边界的 helper 依赖）

`apps/api/src/lib.ts` 当前 re-export ~17 项，被 `apps/cli/src/{context,commands/{schedule,token,config,approvals,serve}}.ts` 6 个文件消费。

## Proposal

**一次原子大移动 + 一次文档收尾。** 不切碎，因为中间任何一刀都会留下不能编译的状态——worktree 模式天然能装下大 diff，review 看的是终态而不是中间。

### S1 — 物理搬迁 + import 重写 + ESLint guard + 回归测

#### 1. 新包 `packages/core`

- `packages/core/{package.json, tsconfig.json}` — name `@aiworker/core`，type `module`，exports 仅 `.`，依赖 `@aiworker/{shared,storage-sqlite,fs-layout,gateway-proto}` + `drizzle-orm` + `cron-parser` + `consola` + `zod`。**不**依赖 `hono` / `@hono/*` / `@scalar/*`。
- `packages/core/src/index.ts` — 公共 re-export 面，对齐 `apps/api/src/lib.ts` 现有 17 项。

#### 2. `git mv` 物理搬

```
apps/api/src/worker/                    → packages/core/src/worker/
apps/api/src/config/worker.ts           → packages/core/src/config/worker.ts
apps/api/src/config/common.ts           → packages/core/src/config/common.ts
apps/api/src/shared/lib/ids.ts          → packages/shared/src/lib/ids.ts
apps/api/src/shared/AppError.ts         → packages/shared/src/errors.ts
apps/api/src/shared/middleware/*        → 留在 apps/api/src/shared/middleware/（Hono 中间件，是 transport 层）
apps/api/src/shared/index.ts            → 拆：AppError 走 shared，requestLogger/errorHandler 留 apps/api
```

`apps/api/src/lib.ts` 删除。

#### 3. Import 重写

- `apps/api/src/worker/**` 内部相对 import 不变（搬迁后整体相对位置一致）。
- worker/** 里 `../../shared` / `../../config` 跨层 → 9 处改 `@aiworker/core/...` 或 `@aiworker/shared/...`（依据搬到哪边）。
- `apps/api/src/modes/worker.ts` 把 `../worker/...` → `@aiworker/core`。
- `apps/api/src/index.ts` `APP_MODE` 分发不变（仍调用 `modes/worker.ts`）。
- `apps/cli/src/context.ts` + 6 个 commands → `@aiworker/api/lib` 改 `@aiworker/core`。
- `apps/gateway/` 如有引用 worker pieces 同样改。

#### 4. ESLint `no-restricted-imports` 守

`packages/core/.eslintrc` 或根 `eslint.config` 加规则：`packages/core/**` 禁止从 `apps/**`、`hono`、`@hono/*`、`@scalar/*` 导入。CI 跑 lint 时即可拦下回退。

#### 5. Hot-reload 回归测

新增 `apps/api/src/worker/management/routes.test.ts`（或现有同文件加 case）：`PUT /api/worker/config` 触发 `reloadRuntime` → 旧 runtime 的 `dispose()` 被调用恰好一次（observer + cron + approvals 全卸） → 下一个 `chat.send` 走新 runtime。这 case 是 PLAN-015 的硬护栏——验证 `() => state.runtime` 闭包懒取在跨包搬迁后仍然成立。

#### 6. drizzle-kit 配置

`packages/storage-sqlite/drizzle.*.config.ts` 不动（schema 未挪）。

### S2 — Docs + changelog + plan close

- `docs/architecture.md` Monorepo Layout 追加 `packages/core`。
- `docs/cli.md` 不动（aim/aiw 子命令不变）。
- `docs/changelog.md` 加条目。
- `docs/plan/PLAN-015.md` 状态 implementing → completed + commits。
- `docs/plan/index.md` PLAN-015 `[-]` → `[x]`。

## Acceptance criteria

- `bun run check` 全绿（含新 ESLint guard）。
- `bun test` 总数不减：`apps/api`（基线 410，搬迁后约 360-380，因为 worker/** 测试归 core 了，core 包独立测；总 pass 数应保持）；`packages/core` 新出现 ~50 测试（搬过去的）；`apps/gateway` 55；`apps/web` 24+13。
- `apps/api/src/lib.ts` 不存在；`grep -r '@aiworker/api/lib' apps packages` 零命中。
- `grep -rE "from ['\"]hono" packages/core/src` 零命中。
- 所有 smoke 仍绿：`smoke-aiw-run` / `smoke-local`(gateway) / `smoke-aim`。
- Docker image build 不破（Dockerfile 里 `COPY --from=build /app/packages/core` 加进去）。

## Risks

- **R1（P1）** Hot-reload 回归——任何 `new X(runtime)` 模式如果在跨包搬迁过程中误把 runtime 引用 eager capture 进 closure，会导致 PUT /api/worker/config 后旧实例没 dispose。**Mitigation**：S1 必须包含回归测，先红后绿。
- **R2（P1）** Bun workspace `@aiworker/core` 自身依赖 `@aiworker/storage-sqlite`，存储侧已经引入 `bun:sqlite`——`bun build --target bun` 链路要保持通畅。**Mitigation**：S1 完工后 `bun run --filter '@aiworker/api' build` 验证产物。
- **R3（P2）** ESLint sort-imports 大量自动重排会让 diff 翻一倍，模糊真正的语义改动。**Mitigation**：S1 在第一次 commit 的 message 里说明 "diff 大头是 import 重排"。
- **R4（P2）** Dockerfile copy 阶段没把 `packages/core` 抓进去 → 镜像启动 module-not-found。**Mitigation**：S1 改 Dockerfile + 跑 `docker build --target runtime` 本地验证（如 docker 可用）。

## Out of scope

- 任何行为变更——纯重排。
- 部署形态调整（PLAN-016 单独）。
- web `.skip` 测试重写（PLAN-013 历史 follow-up，不在此）。
- evolution_observations 滚动压实（PLAN-004 历史 follow-up）。

## Dispatch plan (BKD)

2 subtask，全部 worktree。

| Wave | Subtask | 依赖 |
|---|---|---|
| W1 | S1 物理搬迁 + 回归测 + ESLint | 无 |
| W2 | S2 docs + changelog + plan 收尾 | W1 merge 后 |

每个 subtask 强制 `/pma-cr` 自审、报告模板、回报 coordinator。
