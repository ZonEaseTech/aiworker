# PLAN-073 Worker local brain activation and lifecycle

- **status**: completed
- **createdAt**: 2026-05-03 13:03
- **approvedAt**: 2026-05-03 13:03
- **relatedTask**: FEAT-046

## 现状

1. `aiworker init --soul <preset>` 会创建 `.aiworker/AGENT.md`、`SOUL.md`、`USER.md`、`MEMORY.md`、`ROLLUP.md`、`skills/`、`memories/`、`mcp.json`、`policy.json`、`toolsets.json` 和 `capability-packs.json`。
2. `ContextManager` 会直接通过 `@zonease/aiworker-fs-layout` 读取项目 persona 文件，所以 Soul voice 和 memory index 文本即使没有 runtime brain source，也能进 system prompt。
3. runtime brain 行为仍依赖 `WorkerConfig.brains`：skill 列表走 `brain.listSkills()`，capability decision 使用这些 skill，pre-compaction memory flush 走 `brain.writeMemory()`。
4. 调查时 fresh worker 的 `DEFAULT_EMPTY_CONFIG` 仍是 `brains: []` 与空 `brainWriteTarget`，导致 filesystem skills 和 writable long-term memory 默认未激活。
5. `/Users/ben/projects/aiben` 复现了这个状态：`doctor` 通过，因为它验证的是 project capability draft；但 `config show` 仍报告 runtime brain 配置为空。

## 方案

按长期 PMA track 拆小阶段推进：

1. **S1 - Default local filesystem brain**
   - 新 seed 的 worker 默认写入一个 writable filesystem brain source。
   - source path 保持隐式 `config: {}`，由 `resolveBrainHome(workerId)` 判断 project / user scope。
   - executor 默认值保持不变。
   - 更新把 `brains: []` 当默认形态的聚焦测试和文档示例。
2. **S2 - Runtime brain diagnostics**
   - 在 worker info、brain test 和 CLI diagnostics 中清楚展示 local brain source 状态。
   - 保持 `aiworker doctor` 零副作用，并明确它验证 draft；runtime 状态来自已初始化 worker config。
3. **S3 - Brain inspection commands**
   - 增加只读命令查看 filesystem brain skills 和 memories，不启动 HTTP/admin。
   - 在 admission 规则明确前不新增 mutating skill/memory 命令。
4. **S4 - Memory and skill admission**
   - 定义 generated memory / skill / policy proposal 如何从 pending evidence 进入 approved filesystem write。
   - 继续保持 Brain capability 与 Executor capability 的命名、存储和投影隔离。
5. **S5 - Real worker validation**
   - 使用 `/Users/ben/projects/aiben` 作为本地测试项目。
   - 测 Codex executor 时保持真实用户 `HOME` 读取登录态，只隔离 AIWorker state。
   - 验证 Soul prompt、本地 filesystem brain 和 durable memory 行为端到端可用。

## 范围

本计划实现范围：

- `packages/core/src/worker/bootstrap/default-config.ts`
- `packages/core/src/worker/brain/diagnostics.ts`
- `packages/core/src/worker/management/info.ts`
- `packages/core/src/worker/management/brain-test.ts`
- `apps/cli/src/commands/worker/brain.ts`
- `apps/cli/src/aiworker.ts` / `apps/cli/src/help.ts`
- `apps/web/src/worker/api.ts` / `apps/web/src/worker/features/test/test-panel.tsx`
- default config seed 与 config management 聚焦测试
- fresh project init 后 `config show` / `brain status` / `brain skills` / `brain memories` 的 CLI integration 覆盖
- README / architecture / CLI 文档中旧的 empty-brain 默认示例
- PMA task、plan、changelog 状态同步

## 非范围

- 不迁移已经初始化且显式 `brains: []` 的 worker。
- 不修改 executor MCP、engine plugin、engine-native skill projection。
- 不新增 mutating brain command。
- 本切片不发布 release。

## 风险

1. 现有 operator 可能把 `brains: []` 当成显式 “no local brain” 配置。S1 只改新 seed 默认值，不重写已有 config。
2. 现有测试和文档有些地方故意使用空 brain fixture。S1 只更新默认 seed 相关断言，不批量改所有空 fixture。
3. `FilesystemBrainProvider.health()` 要求解析出的 brain home 存在。bootstrap 已确保 worker home；project init 已创建 `.aiworker/skills` 与 `.aiworker/memories`。S1 不额外增加 runtime 目录写入。

## 验证

Focused gates:

- `bun test packages/core/src/worker/bootstrap/bootstrap.test.ts packages/core/src/worker/management/config.test.ts`
- `bun test packages/core/src/worker/management/info.test.ts packages/core/src/worker/management/brain-test.test.ts`
- `bun test apps/cli/src/commands/worker/init.integration.test.ts`
- `bun test apps/cli/src/aiworker.test.ts apps/cli/src/commands/worker/init.integration.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `/Users/ben/projects/aiben` fresh project smoke:
  - `aiworker config show`
  - `aiworker brain status`
  - `aiworker brain skills`
  - `aiworker brain memories`
  - `aiworker doctor`
  - `aiworker run --message "hello" --dry-run`
  - `aiworker run --message "请用中文简短回复：local brain smoke" --timeout-ms 180000`
  - `GET /api/worker/info`
  - `POST /api/worker/brain/test`

## Progress

- [x] S1 - Default local filesystem brain
- [x] S2 - Runtime brain diagnostics
- [x] S3 - Brain inspection commands
- [x] S4 - Memory and skill admission
- [x] S5 - Real worker validation

## S1 Result

已完成新 seed 默认本地 filesystem brain：

- 新 `worker_config` 默认包含一个 writable `local-filesystem` source。
- source 保持 `config: {}`，实际路径仍由 `resolveBrainHome(workerId)` 解析。
- executor 默认值不变。
- 已初始化且显式为空的旧 config 不迁移。

验证：

- Passed: `bun test packages/core/src/worker/bootstrap/bootstrap.test.ts packages/core/src/worker/management/config.test.ts`
- Passed: `bun test apps/cli/src/commands/worker/init.integration.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-core' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-cli' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-core' test`
- Passed: `/Users/ben/projects/aiben` fresh project smoke:
  - `aiworker config show` reports `local-filesystem`
  - `aiworker doctor` reports `PASS`
  - `aiworker run --message "hello" --dry-run` constructs the runtime

## S2-S5 Result

已完成 worker brain lifecycle 的剩余阶段：

- `describeBrainSource()` 成为 core 内部共用的只读诊断 helper。
- `GET /api/worker/info` 与 `POST /api/worker/brain/test` 现在会展示 source
  priority、read-only、write-target、filesystem home / cloud URL，并避免泄露 secret。
- `aiworker brain status`、`aiworker brain skills`、`aiworker brain memories`
  与对应 `aiworker worker brain ...` canonical 命令已接入，只读、不启动 HTTP/admin、
  不写入 filesystem brain artifact。
- Worker Admin 的 brain test 行展示 write target、read-only、priority、home /
  aggregate health。
- Brain admission 边界已写入 `docs/architecture.md`：generated memory / brain
  skill / policy proposal 进入 filesystem 前必须带 evidence、scope、confidence、
  rollback 并经 operator approval；新增 mutating brain command 必须另开 PMA。

验证：

- Passed: `bun test packages/core/src/worker/management/info.test.ts packages/core/src/worker/management/brain-test.test.ts`
- Passed: `bun test apps/cli/src/aiworker.test.ts apps/cli/src/commands/worker/init.integration.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-core' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-cli' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `/Users/ben/projects/aiben` real worker smoke:
  - `brain status` reports healthy `local-filesystem` with home `/Users/ben/projects/aiben/.aiworker`
  - `brain skills` finds `Aiben Brain Smoke Skill`
  - `brain memories --query aiben-brain-smoke` finds persisted filesystem memory
  - `doctor` reports `PASS`
  - `run --message "hello" --dry-run` constructs the runtime
  - Codex-backed `run --message "请用中文简短回复：local brain smoke"` reaches `orchestrator.finished`
  - `GET /api/worker/info` reports brain `healthy`, `writeTarget: true`, and executor `codex`
  - `POST /api/worker/brain/test` reports source-level healthy diagnostics

Out-of-scope gate note:

- `bun run --filter '@zonease/aiworker-cli' test` currently has 2 failures in
  `src/commands/worker/executor.test.ts` because the worktree also contains
  executor MCP projection changes from FEAT-047 whose tests still assert the
  old command argument shape. FEAT-046 focused CLI integration tests pass.
