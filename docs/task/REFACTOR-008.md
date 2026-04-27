# REFACTOR-008 baseline lint debt 清零

- **status**: done
- **priority**: P3
- **owner**: bkd/w4qsc5uc
- **createdAt**: 2026-04-27 16:42
- **completedAt**: 2026-04-27
- **discovered**: 2026-04-27 — 代码审查（`nnid9urk`）批 P0+P1+P2 收官时 `bun run lint` 显示 60 errors / 0 warnings，但与 audit 批前 baseline (`648adf5`) 同等，本次 0 引入。

## Description

仓库 ESLint 60 个 error 都是历史遗留 style 类，不是逻辑错；CI release.yml 当前**只跑 typecheck + test 不跑 lint**，所以发布不被它拦，但本地 `bun run lint` 一直亮红。集中清掉避免后续 PR 在 lint output 里淹没真正的新增问题。

### 已知错误分布

执行 `bun run lint`（HEAD = `f54c0c6`）：

| 类型 | 文件 | 数量 | 备注 |
|---|---|---|---|
| `jsonc/sort-keys` | 8 个 `package.json`（root + apps/* + packages/* 大部分） | 8 | `license` 应在 `scripts` / `exports` 之前——历史 antfu config rule 后改没 `--fix` 过 |
| `node/prefer-global/process` | `apps/cli/src/aiworker.ts` 单文件 | ~52 | `process` 全局换 `import process from 'node:process'`，CLI 入口里被反复用 |

合计 60 errors，**43 可被 `--fix` 自动修**（即 jsonc/sort-keys 全部 + 少量 process import）。剩下手工补 `import process from 'node:process'`。

## Acceptance criteria

1. `bun run lint` 退出码 0（0 errors / 0 warnings）。
2. `apps/cli/src/aiworker.ts` 在文件顶部显式 `import process from 'node:process'`，所有 `process.*` 引用走 import 而非 global。
3. 8 个 `package.json` 用 `--fix` 排序 key，diff 仅 key 顺序变化、无 value 变更。
4. typecheck + test 全套照旧通过（不引入回归）。
5. 在 `.github/workflows/` 任一 CI workflow 里加一步 `bun run lint`（防止 lint debt 未来回灌）——可以在现有 `build-image.yml` 或 `release.yml` 顶部插一步，或者新建 `lint.yml` PR check。

## Implementation Notes

### 一键自动化部分
```bash
bunx eslint . --fix
```
跑完会清掉 8 个 `package.json` 排序 + 任何能自动修的 process import。剩下的看 `bun run lint` 输出再手补。

### 不变量

- 改 `package.json` key 顺序**不**改 build / publish 行为（Bun / npm 都不依赖 key 序）。但要确认 `bun.lock` 不被无关变更带飞——只 git add 8 个 package.json，不 add lock。
- `aiworker.ts` 是 CLI 入口，`process.exit` / `process.argv` / `process.env` 都用得到；import 后所有调用点行为零差异。
- 加 CI lint step 必须在已有 typecheck / test step 之前或并行；不要让 lint 失败拦发布通道，先用 `continue-on-error: true` 或 PR 阶段拦截。

## ActiveForm

Running `bunx eslint --fix` for the auto-fixable bulk and adding `import process from 'node:process'` to apps/cli/src/aiworker.ts, plus a CI lint step.

## Resolution（2026-04-27）

实际修法（与 task acceptance criteria 略有差异，记录如下）：

- **8 个 `package.json` sort-keys**：`bunx eslint . --fix` 一键完成，仅 key 顺序变更，无 value diff。`apps/cli/package.json` 顺手把 `files` 数组 `["dist/", "README.md"]` 排成 `["README.md", "dist/"]`（`jsonc/sort-array-values`），不影响 publish。
- **`process` global**：实际真正报 `node/prefer-global/process` 的是 `apps/cli/src/lib/dotenv-bootstrap.ts`（11 处），`apps/cli/src/aiworker.ts` 已有 `import process` 在第 2 行。给 `dotenv-bootstrap.ts` 顶部补 `import process from 'node:process'`，所有调用点零差异。
- **`aiworker.ts` 的 `import/first`**：原 `bootstrapDotenv()` 调用夹在 import 中间触发 22 个 `import/first` error。eslint `--fix` 会把调用挪到所有 import 之后——**这破坏了 FEAT-030 的关键不变量**（`packages/core` zod schema 在 import 期就 parse `process.env`，必须先注入）。改法：抽 `apps/cli/src/lib/bootstrap.ts`（side-effect-only：`import + 调用 bootstrapDotenv()`），在 `aiworker.ts` 用 `import './lib/bootstrap'` 替代调用——side-effect import 仍是 import 行，`import/first` 满足，模块加载顺序保证 dotenv 先跑。`perfectionist/sort-imports` 想把 side-effect 排到 external 之后，与不变量冲突，用区段 `eslint-disable` 豁免并写明理由。
- **`aim/daemon.ts` 的 `style/max-statements-per-line` + `style/brace-style`**：原 `try { closeSync(out) }` / `catch { /* ... */ }` 单行写法，展开为多行块。共 6 处。
- **`apps/cli/scripts/build-publish-manifest.ts`**：`prefer-template` + `perfectionist/sort-named-imports` 由 `--fix` 自动完成。
- **CI lint step**：新建 `.github/workflows/lint.yml`，PR + push main 触发 `bun run lint`。**没**叠在 `release.yml`，避免 lint 失败拦 npm publish 通道；release.yml 仍只跑 typecheck + test + bundle + publish。

最终验证：`bun run lint` 0 error / 0 warning，`bun run typecheck` 全绿，`bun test` 全套通过。

## Dependencies

- **blocked by**: 无
- **blocks**: 任何后续以 lint clean 为门槛的 release 自动化（如把 lint 变 release.yml 必经 step）

## Notes

- 本任务故意不与 P0/P1/P2 安全 fix 同 commit——保持安全 fix commit 范围纯净，diff review 不被 style 噪声淹没。
- audit 报告里没单列这条，发版后顺手清。
