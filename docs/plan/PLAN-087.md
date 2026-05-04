# PLAN-087 Executor CLI wording and help cleanup

- **status**: draft
- **createdAt**: 2026-05-04 11:22
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
