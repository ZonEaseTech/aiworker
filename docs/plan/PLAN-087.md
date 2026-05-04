# PLAN-087 Executor CLI wording and help cleanup

- **status**: completed
- **createdAt**: 2026-05-04 11:22
- **completedAt**: 2026-05-04 12:20
- **relatedTask**: FEAT-049

## 现状

CLI help、command descriptions 和 docs 中仍有 “executor-native capability lifecycle”
等偏平台化措辞。

## 方案

1. `executor select` 保持为 task executor selection。
2. `executor mcp add/sync` 表述为 project overlay helper / best-effort projection。
3. `executor capability list/show` 表述为 overlay descriptor inspection。
4. 所有说明都明确 “effective executor capabilities include engine/user/host state outside AIWorker control”。

## 范围

- `apps/cli/src/help.ts`
- `apps/cli/src/aiworker.ts` command descriptions
- `docs/cli.md`
- README snippets

## 非范围

- 不改命令名称。
- 不删除命令。

## 风险

命令名称短期仍叫 `capability`，可能继续让人误解；本计划先用说明文字收口，是否重命名另开计划。

## 验证

- CLI help snapshot tests。
- `bun run --filter '@zonease/aiworker-cli' typecheck`。

## 完成记录

- 2026-05-04 12:20：完成 CLI 文案清洗。
  - `apps/cli/src/help.ts` 的 6 条 executor 命令 summary 全部改为 overlay/hint 措辞，并把 doctor 描述补充 “(不探测 user/host ambient capabilities)”。
  - `apps/cli/src/aiworker.ts` 顶层 5 条与 `worker executor ...` 镜像 5 条命令描述同步更新；不重命名命令、不删除任何子命令。
  - `apps/cli/src/commands/worker/up.ts` 的 stage 4 readiness 注释、跳过提示和 next-step 提示同步成 overlay 措辞。
  - `apps/cli/src/commands/worker/executor.ts` 中两条 error/issue 文案 (`invalid project executor overlay manifest`、`Secret-like project executor overlay field`) 同步改写。
- 验证：
  - `bun run --filter '@zonease/aiworker-cli' typecheck` ✅
  - `bun test apps/cli/src/commands/worker/executor.test.ts` ✅ 11/11 pass
  - `bun test apps/cli/src/commands/worker/up.test.ts apps/cli/src/aiworker.test.ts` ✅ 38/38 pass
  - `bun x eslint <changed files>` ✅
  - `rg -n "executor 原生|executor-native|executor capability manifest" --glob '!docs/{plan,task,changelog.md}'` 仅剩 AGENTS.md 中的 brain/executor 边界规则（保留，是结构性原则不是 manifest 描述）
