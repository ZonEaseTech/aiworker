# REFACTOR-029 Add worker artifact metadata index

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 17:06
- **claimedAt**: 2026-05-09 17:06
- **completedAt**: 2026-05-09 17:12
- **plan**: PLAN-195
- **relatesTo**: REFACTOR-026, REFACTOR-027, REFACTOR-028, PLAN-192, packages/storage-sqlite/src/worker/schema.ts, packages/core/src/worker

## 背景

S1 已经让 web/daemon/CLI 共享 `/api/worker/runs`，但 worker 还没有 OD-style
artifact metadata 面。当前可见产物仍散在：

- `agent_tasks.result`；
- conversation messages；
- Brain Case projection；
- Brain artifact registry。

这些结构不是本轮 worker workbench 的默认 artifact index。Open Design 的关键约束是：
项目文件夹拥有真实文件，SQLite 只保存 project / conversation / message / tabs 等元数据。
AIWorker S2A 先补 worker artifact metadata index，给后续 workbench 文件/报告面板提供稳定数据源。

## 目标

1. 在 `worker.db` 增加 `worker_artifacts` 表。
2. 新增 core service，支持 register/list/get，并保证 artifact path 是 workspace-relative path。
3. 新增 worker REST read surface：`GET /api/worker/artifacts` 与 `GET /api/worker/artifacts/:id`。
4. Web client 增加 `WorkerArtifact` type 与 `listWorkerArtifacts()` / `getWorkerArtifact()`，
   避免与 Brain artifact registry client 混名。
5. 补充 storage/core/API/web focused tests。

## 非目标

- 不实现文件上传、写文件、删除文件或 raw file serving。
- 不扫描 workspace 文件树。
- 不替换 Brain artifact registry。
- 不重写 conversations/messages schema。
- 不改 Worker Web UI 第一屏；UI workbench 留给 S5。

## 验收标准

- `worker_artifacts` 支持按 run、conversation、status 列表查询。
- register 同一个 relative path 时 upsert 同一 artifact，而不是制造重复行。
- API list/show 返回 normalized artifact shape。
- Web API client 能调用新的 read surface。
- 相关 focused tests、typecheck、diff check 和 CRG 审查通过。

## 实现记录

- 新增 `worker_artifacts` worker.db table，真实文件仍由 workspace folder 拥有。
- 新增 `WorkerArtifactService`，支持 relative path normalization、register upsert、list/get。
- 新增 `GET /api/worker/artifacts` 与 `GET /api/worker/artifacts/:id`。
- Web API client 使用 `listWorkerArtifacts()` / `getWorkerArtifact()`，避免与 Brain
  artifact registry 的 `listArtifacts()` 混名。

## 验证

- `bun run --filter '@zonease/aiworker-storage-sqlite' test -- src/worker/index.test.ts`
  passed: 16 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-core' test -- src/worker/artifacts/service.test.ts`
  passed: 4 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-api' test -- src/worker/artifacts/routes.test.ts src/modes/worker.openapi.test.ts`
  passed: 5 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/api.test.ts`
  passed: 10 pass / 0 fail。
- CRG impact-radius follow-up covered run contract neighbors:
  - `bun run --filter '@zonease/aiworker-core' test -- src/worker/runs/service.test.ts`
    passed: 5 pass / 0 fail。
  - `bun run --filter '@zonease/aiworker-api' test -- src/worker/runs/routes.test.ts`
    passed: 5 pass / 0 fail。
  - `bun run --filter '@zonease/aiworker-cli' test -- src/commands/worker/run.test.ts`
    passed: 8 pass / 0 fail。
- Changed package typecheck passed for `@zonease/aiworker-storage-sqlite`,
  `@zonease/aiworker-core`, `@zonease/aiworker-api`, and `@zonease/aiworker-web`。
- `git diff --check` passed。
- CRG passed: `detect-changes` risk 0.50, 0 affected flows；`get_impact_radius`
  marked DB/API blast radius high, so run service/API/CLI neighbor tests were run and passed.
