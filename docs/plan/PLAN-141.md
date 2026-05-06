# PLAN-141 发布 aiworker CLI 0.9.5

- **status**: completed
- **createdAt**: 2026-05-06 14:35
- **approvedAt**: 2026-05-06 14:35
- **completedAt**: 2026-05-06 14:46
- **relatedTask**: REL-021

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.9.4`。
2. 远端不存在 `v0.9.5` tag。
3. 本地 `main` 在 `b3befbe`，包含未提交的 `BUG-082 / PLAN-140` Brain bridge
   修复。
4. 用户要求 chat bridge 问题先只补 PMA 文档，不进入本次发版修复范围。
5. 工作区存在无关 `.codex/config.toml` 改动，发版提交必须排除。

## 方案

1. 记录 `BUG-083` 为 pending backlog，只写 PMA 文档，不改 chat 代码。
2. Bump `apps/cli/package.json` 从 `0.9.4` 到 `0.9.5`，同步 README latest。
3. 跑本地 release gates：
   - `bun install --frozen-lockfile`
   - `bun run typecheck`
   - `bun run lint`
   - `bun run test`
   - `bun run build`
   - CLI run / fleet smoke
   - dist manifest version check
   - built CLI `--version` check
   - `git diff --check`
   - `bun publish --dry-run --access public` from `apps/cli/dist`
4. 用 conventional commits 提交 Brain bridge 修复与 release bump。
5. 打 `v0.9.5` annotated tag。
6. Push `main` 与 tag，监控 GitHub Actions release workflow，然后验证 npm
   与 GitHub Release。

## 风险

1. GitHub repository 的 `NPM_TOKEN` 缺失或过期会导致 release workflow 在
   publish 阶段失败。
2. 本次只修 Brain bridge，chat continuation bridge 仍是 `BUG-083` pending。
3. `.codex/config.toml` 是无关本地改动，必须保持未提交。

## 范围

- `BUG-082 / PLAN-140` Brain bridge 修复。
- `BUG-083` PMA backlog 文档。
- 0.9.5 release metadata、README latest、CLI package version、dist artifact。

## 非范围

- 不修 `BUG-083` chat continuation bridge。
- 不修改 release workflow（`.github/workflows/release.yml`）。
- 不 bump 其它 workspace package version（仅 cli 发 npm）。
- 不提交 `.codex/config.toml`。

## 验证

同 REL-021 的 Validation 列表。

## 进度

- 2026-05-06 14:35：PLAN-141 / REL-021 创建；chat issue 记录为
  `BUG-083` pending；开始 0.9.5 release gates。
- 2026-05-06 14:46：本地 release gates、publish dry-run pack 阶段、release
  commit/tag push、GitHub Actions release、npm latest、bunx 与 GitHub Release
  asset 验证均完成；`BUG-083` 仍保持 pending backlog。
