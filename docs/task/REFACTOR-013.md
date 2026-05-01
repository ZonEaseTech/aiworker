# REFACTOR-013 稳定 CLI test gate 并拆分 Soul preset 模块

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-01 12:58
- **claimedAt**: 2026-05-01 12:58
- **completedAt**: 2026-05-01 13:08
- **plan**: PLAN-054

## 描述

继续 FEAT-043 后的两项收尾工作：

1. 修复 `bun run --filter '@zonease/aiworker-cli' test` 中暴露的两个 release gate 红点：
   - `apps/cli/scripts/aiworker-bin-shim.test.ts` 在 macOS 上断言 `/var`，实际 shim 传给 fake bun 的 bundle path 可能规范化为 `/private/var`。
   - `apps/cli/src/aim/commands/common.test.ts` 单跑通过，但整包运行时可能被 `pair.test.ts` / `enroll.test.ts` 的 `mock.module('./common')` 污染。
2. 将内置 Soul preset 从单个聚合对象拆为每个 Soul 一个文件，保留统一 registry 作为唯一导出入口。

验收标准：

1. CLI 包级测试恢复通过，或剩余失败均有明确非本次原因。
2. 每个内置 Soul 有独立模块文件，便于后续独立维护、review 和版本治理。
3. `aiworker init`、`aiworker soul list/show` 和现有测试仍只通过统一 registry 读取 preset。
4. 不改变已生成 `.aiworker/*` 文件结构和 CLI 对外参数。

## 完成描述

已修复 CLI 包级测试中的 npm bin shim 路径断言与 aim command mock 泄漏问题，并把 9 个内置 Soul preset 拆成独立模块。统一 registry 仍作为 `init`、`soul list/show` 和测试的唯一消费入口。

## 依赖

- **blocked by**: (无，用户已批准)
- **relates to**: FEAT-039, PLAN-041, FEAT-043, PLAN-053
- **blocks**: PLAN-041 S3 capability validation

## 笔记

- 2026-05-01 12:58：用户要求继续做 release gate 修复与 Soul preset 独立文件拆分，并准备下一 session 推进 PLAN-041 的 prompt。
- 2026-05-01 13:08：完成实现与验证。`bun run --filter '@zonease/aiworker-cli' test` 已恢复通过；Soul preset 已拆到 `apps/cli/src/soul/presets/*.ts`。
- 验证：
  - `bun test --timeout=30000 apps/cli/scripts/aiworker-bin-shim.test.ts apps/cli/src/aim/commands/common.test.ts apps/cli/src/aim/commands/pair.test.ts apps/cli/src/aim/commands/enroll.test.ts`
  - `bun test --timeout=30000 apps/cli/src/soul/presets.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/init.integration.test.ts`
  - `bun run --filter '@zonease/aiworker-cli' typecheck`
  - `bun run --filter '@zonease/aiworker-cli' test`
  - `bun run lint`
  - `git diff --check`
