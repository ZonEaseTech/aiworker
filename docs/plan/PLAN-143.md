# PLAN-143 Route pre-compaction memory flush through Brain admission

- **status**: completed
- **createdAt**: 2026-05-06 23:48
- **approvedAt**: 2026-05-06 23:48
- **completedAt**: 2026-05-06 23:55
- **relatedTask**: BUG-085

## 现状

1. Governance Kernel 决策已经明确：generated durable Brain mutation 必须回到
   admission，Brain hard logic 只守 scope、evidence、redaction、rollback、audit
   等治理不变量。
2. `BrainAdmissionService.apply()` 已经是当前 canonical memory materializer，
   并覆盖 pending/approved/applied/rejected/secret-scan-block 路径。
3. `runPreCompactionMemoryFlush()` 仍保留早期 FEAT-037 的免审写入：suppressed
   executor 输出非空时直接调用 `BrainProvider.writeMemory()`。
4. 该路径会让 LLM-generated memory 绕过 admission，因此是轻量治理边界上的
   P1 结构缺陷。

## 方案

1. 将 pre-compaction memory flush 的持久化行为改为创建 `memory-add` admission
   proposal：
   - deterministic id，避免同一 compaction checkpoint 重复提交；
   - evidence 指向 conversation 和 compacted message range；
   - payload 使用现有 `memory-add` schema；
   - status 保持 `pending`，不自动 approve/apply。
2. 更新 `memory-flush` audit message 与 session compaction metadata：
   - 成功生成 proposal 时标记为 `proposed`，并记录 proposal id；
   - 空输出仍为 `empty`；
   - duplicate proposal 视为 already proposed，不阻塞 compaction；
   - admission 写入失败不阻塞 compaction，但记录 failed。
3. 更新相关 tests：
   - 原“直接写 memory”测试改为断言 no `BrainProvider.writeMemory()` calls；
   - 断言 `brain_admission_proposals` 中出现 pending `memory-add` proposal；
   - 保留 compaction summary、audit row、session memoryFlushAt 行为。
4. 更新文档：
   - `docs/architecture.md` 移除 pre-compaction 免审写入例外；
   - `docs/cli.md` 同步 admission state 已落 DB；
   - `docs/governance-node-status.md` residual risk 反映新边界。

## 风险

1. 现有 session status 仍叫 `memoryFlush`，这次保持字段名不变，避免扩大 API
   变更；语义从 applied memory flush 收敛为 admission proposal flush。
2. 可能影响依赖 pre-compaction 自动长期记忆的旧测试；按 1.0 前无 legacy
   兼容原则，优先治理边界。
3. Duplicate proposal id 必须可预测且安全处理，否则 compaction 重试可能制造噪声。

## 范围

- `packages/core/src/worker/orchestrator/service.ts`
- `packages/core/src/worker/orchestrator/service.history.test.ts`
- `docs/architecture.md`
- `docs/cli.md`
- `docs/governance-node-status.md`
- PMA task/plan/changelog/index

## 非范围

- 不改变 admission DB schema。
- 不改变 Worker Admin Brain UI。
- 不改变 executor adapter。
- 不发布 release。

## 验证

1. `bun test packages/core/src/worker/orchestrator/service.history.test.ts`
2. `bun test packages/core/src/worker/brain/admission/service.test.ts`
3. `bun run --filter '@zonease/aiworker-core' typecheck`
4. `bun run --filter '@zonease/aiworker-core' test`
5. `bun run lint`
6. `git diff --check`

## 进度

- 2026-05-06 23:48：创建 BUG-085 / PLAN-143，开始实现 pre-compaction memory
  flush admission 化。
- 2026-05-06 23:55：实现完成。pre-compaction generated memory 改为 pending
  `memory-add` admission proposal；orchestrator history、admission service、
  core package test/typecheck、repository lint 与 `git diff --check` 均通过。
