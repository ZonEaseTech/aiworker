# PLAN-139 发布 aiworker CLI 0.9.4

- **status**: implementing
- **createdAt**: 2026-05-06 14:07
- **approvedAt**: 2026-05-06 14:07
- **relatedTask**: REL-020

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.9.3`。
2. GitHub Release latest 是 `v0.9.3`，非 draft / 非 prerelease。
3. 本地 `main` 在 `f434851`，包含已验证但未提交的 production hotfix：
   - `BUG-079` public `/w*` route；
   - `BUG-080` registered OTP worker reconnect；
   - `BUG-081` fleet-hosted Worker Admin bearer bridge auth。
4. 生产 `aiwork` 已热修验证：
   - Worker shell `/w/w_8jbcm249cxn4/` 返回 `200`；
   - 无 bearer 的 `/w/.../api/worker/info` 返回 gateway `401`；
   - registered worker token 可访问 bridge 并返回 `200`。

## 方案

1. Bump `apps/cli/package.json` 从 `0.9.3` 到 `0.9.4`。
2. 同步 README latest、`REL-020` / `PLAN-139` / `docs/changelog.md`。
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
4. 用 conventional commits 提交 hotfix 与 release bump。
5. 打 `v0.9.4` annotated tag。
6. push `main` 与 tag，监控 GitHub Actions release workflow，然后验证 npm
   与 GitHub Release。

## 风险

1. GitHub repository 的 `NPM_TOKEN` 缺失或过期会导致 release workflow 在
   publish 阶段失败。
2. `/w*` 认证边界由 Caddy Basic Auth 移到 gateway worker bearer auth，必须
   确认缺 token / 错 token fail-closed。
3. 生产热修过 gateway bundle 与 Caddyfile，正式 release 后仍需确认远端 runtime
   与 release artifact 行为一致。

## 范围

- Gateway `/w/:workerId/api/worker/*` bearer auth。
- Caddy `/w*` public shell + gateway bridge routing template。
- Worker Admin bearer fetch 行为与测试。
- OTP registered reconnect fix。
- Release docs and CLI version bump.

## 非范围

- 不修改 release workflow（`.github/workflows/release.yml`）。
- 不 bump 其它 workspace package version（仅 cli 发 npm）。
- 不处理本地既有 `.codex/config.toml` / `.claude/scheduled_tasks.lock` 脏文件。

## 验证

同 REL-020 的 Validation 列表。

## 进度

- 2026-05-06 14:07：PLAN-139 / REL-020 创建，进入 release gates。
- 2026-05-06 14:12：本地 release gates 通过：install frozen lockfile、
  typecheck、lint、test、build、CLI run/fleet smoke、dist 版本检查、built CLI
  `--version`、`git diff --check`、npm dry-run pack。
