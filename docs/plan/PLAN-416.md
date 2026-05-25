# PLAN-416 Mounted stylesheet dark theme isolation repair

- **status**: completed
- **owner**: Codex
- **createdAt**: 2026-05-26
- **relatedTask**: BUG-159

## 调查结论

真实浏览器复现显示：

- `appearance` 为 `system`；
- dark color-scheme 下 Host 设置了 `html.dark` 和 `data-theme="dark"`；
- mounted HR universal workbench URL 和 micro-app data 均为 `theme=dark`；
- 但 mounted app 后注入的 stylesheet 里有全局 `:root` light tokens，加载顺序晚于
  Host `.dark` tokens，导致 Host shell computed `--background` 回到浅色。

这不是 Soul App 领域 UI 问题，而是 Host/Soul mounted UI runtime 的样式隔离边界
问题。

## 实施

1. 将共享 UI 暗色 token selector 从 `.dark` 提升为 `:root.dark`，让 Host
   dark tokens 在 specificity 上压过后加载的 mounted `:root`。
2. 在 universal workbench runtime、HR mounted route/widget、QA mounted widget 的
   dark HTML 中补 body-level `dark` class，适配 micro-app 会剥离 child
   `<html>` 的行为。
3. 更新 HR/QA/runtime tests，覆盖 dark body class。
4. 更新 `scripts/check-web-ui-components.ts`，要求 dark theme variables 使用
   `:root.dark`，并禁止裸 `.dark { ... }` token block。

## 验证

- `bun run --filter '@zonease/aiworker-soul-app-runtime' test src/index.test.ts --test-name-pattern "dark universal workbench theme"`
- `bun run --filter '@zonease/aiworker-hr' test host-adapter/index.test.ts`
- `bun run --filter '@zonease/aiworker-qa' test host-adapter/index.test.ts`
- `bun test scripts/check-web-ui-components.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx --test-name-pattern "system appearance|resolved dark Host theme|updates mounted route theme data"`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-qa' typecheck`
- `bun run ui:check`
- `git diff --check`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-hr' build:styles`
- `bun run --filter '@zonease/aiworker-qa' build:styles`
- Browser dark system verification at `http://127.0.0.1:5173`: Host
  `--background=oklch(0.141 0.005 285.823)`, shell `data-theme=dark`,
  mounted URL/data `theme=dark`, console errors 0.
- Browser light system verification at `http://127.0.0.1:5173`: shell
  `data-theme=light`, mounted URL/data `theme=light`, console errors 0.

