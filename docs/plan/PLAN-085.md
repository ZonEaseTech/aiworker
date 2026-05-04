# PLAN-085 Executor capability overlay semantics

- **status**: completed
- **createdAt**: 2026-05-04 11:22
- **completedAt**: 2026-05-04 12:00
- **relatedTask**: FEAT-049

## 现状

`.aiworker/executor-capabilities.json` 目前被实现为 executor-native capability
manifest，包含 MCP、engine plugin、engine skill 和 engine policy descriptor。
这套设计仍然容易把 AIWorker 带向维护外部 executor 生态的方向。

## 方案

把该文件的产品语义降级为 **project executor overlay / bootstrap hints**：

1. 只表达项目希望外部 executor 具备的建议或声明。
2. 不声明这是 effective capability source of truth。
3. 不承诺屏蔽 user/host 级 MCP、skill、plugin 或 native session。
4. 对支持官方 project config 的 engine，保留 best-effort projection helper。

## 范围

- shared schema 命名/注释和文档语义。
- CLI 输出中 “declared executor-native capabilities” 的措辞收口。
- 旧 projection 行为的兼容说明。

## 非范围

- 不删除现有 manifest 文件。
- 不实现 hermetic executor mode。
- 不迁移已有 project 文件。

## 风险

旧用户可能已经把该 manifest 当作 project config helper；收口时保留命令但改变文案，避免破坏工作流。

## 验证

- schema tests 保持通过。
- CLI executor tests 根据新文案更新。
- docs grep 不再出现“完整能力来源”类承诺。

## 完成记录

- 2026-05-04 12:00：完成 manifest 语义降级。
  - `packages/shared/src/executor-capabilities.ts` 增加文件头 JSDoc 与每个导出的语义注释，明确 overlay/hint 边界；保留所有导出名（含 legacy `executorNativeCapabilityDescriptorSchema`）。
  - `apps/cli/src/commands/worker/executor.ts` 收口 4 处用户可见文案：doctor 标题、overlay entries 计数、capability list 空提示、`executor.capability_manifest_empty` 与 doctor empty-manifest warning message。issue code、Status 标签、退出码语义不变。
  - `packages/fs-layout/src/index.ts` 同步 layout 注释为 overlay/hint 措辞。
  - 跟随更新 `apps/cli/src/commands/worker/executor.test.ts` 与 `packages/shared/src/executor-capabilities.test.ts` 的 describe/assert 文案。
- 验证：
  - `bun run --filter '@zonease/aiworker-shared' typecheck` ✅
  - `bun test packages/shared/src/executor-capabilities.test.ts` ✅ 4/4 pass
  - `bun run --filter '@zonease/aiworker-cli' typecheck` ✅
  - `bun test apps/cli/src/commands/worker/executor.test.ts` ✅ 10/10 pass
  - `bun run --filter '@zonease/aiworker-fs-layout' typecheck` ✅
  - `bun test packages/fs-layout/src/index.test.ts` ✅ 18/18 pass
  - `bun x eslint <changed files>` ✅ 无警告
  - `rg -n "executor-native|declared executor|no executor-native" docs/cli.md README.md` 0 命中
