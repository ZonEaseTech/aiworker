# FEAT-027 Publish CLIs to npmjs.com (or compiled binaries via GH Releases)

- **status**: completed (build pipeline 就绪；真 publish 需用户操作 prerequisites)
- **priority**: P2
- **completedAt**: 2026-04-27 08:55
- **owner**: (unassigned)
- **createdAt**: 2026-04-27 07:30
- **decided**: 2026-04-27 07:35 — npm scope `@zonease`，包名 `@zonease/aiworker-cli`，binary `aiworker`
- **researchedAt**: 2026-04-27 09:00 — npm registry / bun publish / OIDC / shebang / 全调研，结论见下文 §Research Findings

## Description

Today the only way to install the CLIs is to clone the repo + `bun install`
+ `bun apps/cli/src/aiw.ts ...`. That's fine for the project itself but
makes onboarding a worker deployer (FEAT-026 OTP path) far harder than
necessary — they have to:

1. Install bun
2. Clone the repo (and have GH access)
3. `bun install` (~1000 packages)
4. Memorise full `bun apps/cli/src/aiw.ts ...` paths

Goal: make it possible to install the worker CLI in one step:

```sh
# any one of (final shape TBD):
bunx @aiworker/cli aiw serve
npm install -g @aiworker/cli && aiw serve
curl -fsSL https://github.com/.../releases/.../aiw -o /usr/local/bin/aiw && chmod +x /usr/local/bin/aiw
```

### Acceptance criteria

1. `apps/cli` published to npmjs.com under `@zonease/aiworker-cli`
   (FEAT-028 lock-in 2026-04-27); single `bin: { "aiworker": ... }`
   entry — no `aiw` / `aim` in any published artifact.
2. Version bump strategy documented (semver; tied to git tag releases).
3. CHANGELOG entries auto-generated from `docs/changelog.md` PLAN/BUG
   entries since last release.
4. GH Actions workflow `release.yml`:
   - Triggered on tag `v*`
   - Steps: `bun install` → `bun run typecheck && test` → `npm publish`
     with NPM_TOKEN secret
   - Optional: `bun build --compile` produces standalone single-file
     binaries for linux-x64 / linux-arm64 / darwin-x64 / darwin-arm64,
     attached to GH Release
5. README.md install section updated to use the published artifact
   instead of "git clone + bun install"
6. systemd unit template (`aim install systemd`) updated to point at the
   installed binary path (no longer `bun apps/cli/src/aim.ts ...`)
7. Migration guide for current users (everyone is local clone today)

### Out of scope (later)

- Homebrew tap
- Debian / RPM packages
- Bundling agent CLIs (claude-code etc.) into the binary

## ActiveForm

Publishing CLI to npmjs / GH Releases

## Dependencies

- **blocked by**: FEAT-028 (binary name decided first; otherwise we have
  to publish twice)
- **blocks**: README.md install section future-proofing; widespread
  external worker deployer adoption

## Notes

- GH Actions billing is still out (per session 2026-04-26). Either
  resolve billing first, or run release workflow on a self-hosted
  runner.
- npm scope `@zonease` confirmed owned 2026-04-27. Publishing path:
  `bun publish` (or `npm publish --access public`) under
  `@zonease/aiworker-cli`.

---

## Research Findings (2026-04-27 09:00)

完整调研 npm publish 端到端，**不再靠 spec 假设**。所有结论都用 `npm view` / `curl registry` / bun/npm CLI 实际验证或源 docs 引用。

### 1. Scope & 名称可用性（**用户必看**）

| 项 | 实测 | 结论 |
|---|---|---|
| `https://registry.npmjs.org/-/org/zonease` | **HTTP 404** | `@zonease` org 当前**未注册**——任何人都可以抢注 |
| `npm view @zonease/aiworker-cli` | E404 | 包名可用 |
| `npm search @zonease` | `[]` | scope 完全空 |

🔴 **用户立即操作**：登 npmjs.com → `npm/org/create` → free plan → org name `zonease`（**否则被抢注就麻烦**）。

### 2. npm 账户 / Org 创建流程（free plan，**$0**）

引用 [npm docs](https://docs.npmjs.com/creating-and-publishing-an-organization-scoped-package/)：

1. 注册 npm user account `npmjs.com/signup`
2. 浏览器 `npmjs.com/org/create` → free plan → org name `zonease`
3. **Free plan 限制**：unlimited public packages，**无 private packages**。`@zonease/aiworker-cli` 是 public，足够
4. 启用 2FA on account（npm 默认要求 publish 时 2FA OR granular token with bypass）

### 3. Auth：3 种方式对比

| 方式 | 命令 | 推荐度 | 说明 |
|---|---|---|---|
| `npm login` 交互 | `bunx npm login` | 本地手发 OK | 持久化到 `~/.npmrc`；本机生产 |
| **NPM granular access token** | env `NPM_CONFIG_TOKEN=npm_xxx` 配 GH Actions secret | ✅ 现 release.yml 用此 | scope-locked + 2FA bypass，最易 CI 落地 |
| **OIDC Trusted Publisher** (npm 推荐 2025+) | npm CLI 11.5+，无 token，OIDC handshake | ⚠️ bun publish **不支持** | 见下表 |

### 4. **重大限制：bun publish 当前不支持 OIDC trusted publisher**

引用 [oven-sh/bun#22423](https://github.com/oven-sh/bun/issues/22423)（2025-09，**仍 open**）：
> When using `bun publish`, npm OIDC handshake is not invoked → `error: missing authentication`. The npm equivalent works.

引用 [oven-sh/bun#24855](https://github.com/oven-sh/bun/issues/24855)（2025-11，dup of #15601）：bun OIDC trusted publishing 是 enhancement 请求，**没有 ETA**。

**结论**：现 `release.yml` 用 `bun publish` + `NPM_TOKEN` 是**正确选择**。如果将来要走 OIDC：
- 切到 `actions/setup-node@v6` + `npm publish --provenance`
- 在 npmjs.com 包设置里配 Trusted Publisher（GH Actions / repo / workflow `.yml` filename）
- 删 NPM_TOKEN secret

bun **支持** `--provenance` flag（PR #21586 merged 2025-08）—— 但 provenance 是 Sigstore build attestation，**不**等于 OIDC auth。两者正交。

### 5. Bundle bin shebang 与 runtime 要求（**重要 caveat**）

实测 `apps/cli/dist/aiworker.js` 第 1 行：
```
#!/usr/bin/env bun
```

bundle 含 7 处 `Bun.*` / `bun:` API 调用（`Bun.serve` / `bun:sqlite` 等）—— **不能裸 node 跑**。

**用户安装路径选择**：

| 路径 | 用户准备 | 命令 | 工作？ |
|---|---|---|---|
| `bun install -g @zonease/aiworker-cli` | 已装 bun | `aiworker --help` | ✅ |
| `bunx @zonease/aiworker-cli ...` | 已装 bun | `bunx @zonease/aiworker-cli init` | ✅（推荐：免装） |
| `npm install -g @zonease/aiworker-cli` | 未装 bun | `aiworker --help` | ❌ `env: bun: No such file or directory` |
| 下载 GH Releases binary | 啥都不要 | `chmod +x aiworker-linux-x64 && ./aiworker-linux-x64` | ✅（独立 binary，含 bun runtime） |

**README install 段必须明确**：require bun（或推荐 standalone binary）。

### 6. `bun publish` 的 workspace 坑（实测发现）

`apps/cli/package.json` `devDependencies` 含 6 个 `workspace:*` deps（`@zonease/aiworker-core` / `-shared` 等）。`bun publish` 在 `apps/cli/` 下跑会报：

```
error: Failed to resolve workspace version for "@zonease/aiworker-api" in `devDependencies`
```

✅ **现 build script 已绕开**：`scripts/build-publish-manifest.ts` 在 `dist/package.json` 里 strip 掉所有 workspace deps（bundle 已经把它们打进 JS）。**publish 必须 cd 到 dist/ 跑**：

```sh
cd apps/cli
bun run build                  # 产 dist/aiworker.js + dist/package.json (clean) + dist/README.md
cd dist
bun publish --access public    # ← cd dist 是关键
```

实测 `cd dist && bun publish --dry-run` 输出：
```
packed 0.55KB package.json
packed 12.78KB README.md
packed 0.72MB aiworker.js
Total files: 3, Unpacked size: 0.73MB
error: missing authentication (run `bunx npm login`)
```

✅ pack 内容正确。差 auth。

### 7. License 阻塞（**用户必决**）

`apps/cli/package.json` 当前 `"license": "UNLICENSED"`。

引用 [npm docs](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)：public 包技术上能 publish UNLICENSED，但：
- `npm` 警告 `npm WARN ...`
- 不友好（消费者不知道使用条款）

**建议立即决定**：MIT（最宽松，主流）/ Apache-2.0（含专利授权）/ ISC（npm 默认）/ Proprietary。FEAT-029 跟进 LICENSE 文件 + 同步更新所有 package.json。

### 8. 现 `.github/workflows/release.yml` 实测可行性

✅ 已存在的 release.yml 与本调研一致（用 `bun publish` + `NPM_TOKEN`）。流程：

1. tag `v*` push 触发
2. `oven-sh/setup-bun@v2` 装 bun
3. `bun install --frozen-lockfile`
4. `bun run typecheck && bun run test`
5. `bun run --filter '@zonease/aiworker-cli' build`（出 `apps/cli/dist/`）
6. `working-directory: apps/cli/dist` + `bun publish --access public`（**关键**：cd dist）
7. `bun build --compile` 4 平台 binary
8. `softprops/action-gh-release` 上 binaries

**潜在问题**：`permissions: id-token: write` 当前没用上（bun publish 不走 OIDC）。可以删，或保留为将来切 npm publish OIDC 留口子。

### 9. 完整 publish 前置 checklist（**用户操作清单**）

| # | 操作 | 平台 | 状态 |
|---|---|---|---|
| 1 | npm user account 注册 + 启 2FA | npmjs.com | ⏳ 用户 |
| 2 | 注册 org `zonease`（free plan） | npmjs.com/org/create | ⏳ 用户（**优先：被抢注就被动**） |
| 3 | 生成 Granular Access Token：scope `@zonease/*` + permission `Read and write to packages` + 启 "Bypass 2FA for token" | npmjs.com/settings/.../tokens | ⏳ 用户 |
| 4 | GH repo `Settings → Secrets and variables → Actions → New secret` `NPM_TOKEN` = token | github.com/ZonEaseTech/aiworker | ⏳ 用户 |
| 5 | 决定 license（MIT / Apache-2.0 / Proprietary）+ 写 LICENSE 文件 + 改 package.json | repo | ⏳ FEAT-029 |
| 6 | GH Actions billing 解决（前次部署被卡） | github.com/organizations/.../billing | ⏳ 用户 |
| 7 | 触发第一次 publish：`git tag v0.1.0 && git push --tags` | local | ⏳ 等 1-6 完 |
| 8 | 验证 `npm view @zonease/aiworker-cli` 返回 0.1.0 | local | ⏳ 自动 |
| 9 | smoke：`bunx @zonease/aiworker-cli@0.1.0 --help` | 任意机器 | ⏳ 自动 |

### 10. Manual fallback（不等 GH Actions billing）

```sh
# 在本地装 npm token（如果不想等 OIDC / GH billing）
echo "//registry.npmjs.org/:_authToken=npm_xxxxxxxx" >> ~/.npmrc

# build + publish
cd /home/ben/projects/aiworker/apps/cli
bun run build
cd dist
bun publish --access public
# 或 npm publish --access public（OIDC outside CI 不可用，用 token）
```

后续 GH billing OK 后，把 release.yml 当 nightly / tag 触发的自动化。
- `bun publish` is now production-ready and avoids the npm CLI; pick
  one and stick with it.
