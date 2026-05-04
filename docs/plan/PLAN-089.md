# PLAN-089 Brain diagnostics and onboarding UX

- **status**: completed
- **createdAt**: 2026-05-04 11:22
- **completedAt**: 2026-05-04 12:50
- **relatedTask**: FEAT-050

## 现状

`aiworker init` 和 `aiworker up` 已经引导用户选择 Soul 并查看 brain status，
但 Project Brain 的“可用/缺失/下一步”提示还可以更直接。

## 方案

1. `init` next steps 以 Project Brain 为第一组操作。
2. `doctor` 或 `brain status` 明确展示 brain home、write target、skills、memories。
3. Worker Admin Test 面板把 brain 状态放在 executor 之前。
4. 空 skills/memories 时给出可操作但不强制写入的建议。

## 范围

- CLI onboarding text。
- Worker Admin brain diagnostics text。
- focused tests。

## 非范围

- 不自动生成新的 memories/skills。
- 不改变 executor selection。

## 风险

过度提示会显得啰嗦；保持 first-run guidance 强、repeat-run 简洁。

## 验证

- CLI init/up focused tests。
- Worker Admin component tests if UI touched。

## 完成记录

- 2026-05-04 12:50：完成 brain diagnostics 与 onboarding UX 强化。
  - `apps/cli/src/commands/worker/init.ts` 把 project 与 user scope 的 next-steps 都重排：标题加 “Project Brain comes first; executor is bring-your-own”；步骤 2/3 强制把 `brain identity` 与 `aiworker brain status` 排在 doctor 与 executor 前。
  - `apps/cli/src/commands/worker/doctor.ts` 在 capability validation 输出前加 “Brain identity” 子段（AGENT/SOUL/USER/MEMORY 的 PASS/WARN）+ 一句指向 `aiworker brain status` 的 runtime hint。
  - `apps/cli/src/commands/worker/brain.ts` `brain status` 输出新增 `assets` 块：identity（AGENT/SOUL/USER + root）、`skillCount`、`memoryCount`，空状态给出非强制 hint。
  - `apps/web/src/worker/features/test/test-panel.tsx` Test 面板 header 文案明确 brain → executor → channel 顺序。BrainTestCard 已经先于 ExecutorTestCard 与 ChannelTestCard，结构无需调整。
- 验证：
  - `bun run --filter '@zonease/aiworker-cli' typecheck` ✅
  - `bun test apps/cli/src/commands/worker/doctor.test.ts apps/cli/src/commands/worker/init.integration.test.ts` ✅ 18/18 pass
  - `bun run --filter '@zonease/aiworker-web' typecheck` ✅
  - `bun run --filter '@zonease/aiworker-web' test` ✅ 16 files / 59 tests pass
  - `bun x eslint <changed files>` 无告警
