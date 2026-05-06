# PLAN-135 发布 aiworker CLI 0.9.3

- **status**: in_progress
- **createdAt**: 2026-05-06 12:38
- **approvedAt**: 2026-05-06 12:38
- **relatedTask**: REL-019

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.9.2`。
2. GitHub Release latest 是 `v0.9.2`，非 draft / 非 prerelease。
3. 本地 `main` 与 `origin/main` 对齐在 `12ef938`。
4. 自 `v0.9.2` 之后，本地已完成 `FEAT-055 / PLAN-134`：
   - worker-local `.env` 加载并持久化 gateway enrollment startup env；
   - README / CLI / deployment / architecture docs 明确 `AIWORKER_HOME` 是
     worker runtime state root，不是 cwd alias；
   - focused dotenv tests、CLI typecheck、CLI test suite、lint、diff check
     已通过。

## 方案

1. Bump `apps/cli/package.json` 从 `0.9.2` 到 `0.9.3`。
2. 同步 README latest、`REL-019` / `PLAN-135` / `docs/changelog.md`。
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
4. 用 conventional commit 提交 release bump：`chore(release): 发布 CLI 0.9.3`。
5. 打 `v0.9.3` annotated tag。
6. push `main` 与 tag，监控 GitHub Actions release workflow，然后验证 npm
   与 GitHub Release。

## 风险

1. GitHub repository 的 `NPM_TOKEN` 缺失或过期会导致 release workflow 在
   publish 阶段失败。
2. 本次包含 worker startup env 持久化逻辑，需重点确认 CLI package tests、
   build 后 `--version`、dist manifest version 与 smoke 均通过。
3. 同机多 worker 的 durable env 行为依赖当前 scope 解析；docs 必须避免把
   `AIWORKER_HOME` 讲成 cwd alias。

## 范围

- `apps/cli/package.json`
- `README.md`, `README.zh-CN.md`
- `docs/task/REL-019.md`
- `docs/task/index.md`
- `docs/plan/PLAN-135.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不修改 release workflow（`.github/workflows/release.yml`）。
- 不 bump 其它 workspace package version（仅 cli 发 npm）。
- 不处理本地既有 `.codex/config.toml` / `.claude/scheduled_tasks.lock` 脏文件。

## 验证

同 REL-019 的 Validation 列表。

## 进度

- 2026-05-06 12:38：PLAN-135 / REL-019 创建，进入 release gates。
- 2026-05-06 12:44：本地 release gates 全通过：frozen install、root
  typecheck、root lint、root test、root build、CLI run smoke、CLI fleet smoke、
  dist manifest version=`0.9.3`、built CLI `--version` 返回
  `aiworker/0.9.3 linux-x64 node-v24.3.0`、`git diff --check`。`bun publish
  --dry-run --access public` 已输出 pack 清单并在认证阶段停于
  `missing authentication`；实际 npm publish 由 tag-triggered GitHub
  workflow 使用仓库 `NPM_TOKEN`。
