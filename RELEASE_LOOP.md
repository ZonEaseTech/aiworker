# AIWorker 迭代与发版闭环（agent runbook）

> 写给 agent 的可重复执行手册，不是人类教程。一轮 = 阶段性开发 → PR → 合并 main → 打 tag → CI 发版 → 验证 npm 已发布 → 下一轮。
> 这是运维/流程 runbook，不是 canonical 合同文档（`docs/` 被 `docs:check` 锁死为固定 5 文件，故落仓根，与 `deploy/RUNBOOK.md` 同级别）。
> 不变量优先级低于 `AGENTS.md` 与 canonical docs；与它们冲突时以后者为准。

## 不变量（违反即停，先回到这里对照）

- **可发布包只有两个，永远同版本号同步发**：`@zonease/aiworker-cli`（`apps/worker-cli`）、`@zonease/aiworker-host-cli`（`apps/host-cli`）。其余 `souls/*`、`packages/*`、`apps/*-web` 全是 `private: true`，不发 npm。
- **版本号 source of truth = 两个 `package.json`**：`apps/worker-cli/package.json` + `apps/host-cli/package.json` 的 `version` 字段。`dist/package.json` 由 `bun run build` 重生，不要手改。两处必须一致。
- **发版唯一触发 = push `v*` tag**。`.github/workflows/release.yml` 只被 `tags: ['v*']` 驱动。合并到 `main` **不**发版（只跑 `lint.yml`）。没有 tag 就没有 npm 发布。
- **渠道由 tag 名派生，不手改 workflow**：agent 选渠道 = 选 tag 名。见下表。`release.yml` 的「Derive npm dist-tag」步骤从 `GITHUB_REF_NAME` 解析，两处 `npm publish` 用派生出的 `--tag`。
- **tag 名的版本号必须等于两个 `package.json` 的 `version`**（`v1.0.0-rc.5` ⇔ 两包都是 `1.0.0-rc.5`）。渠道从 **tag 名**派生、发布的版本号从 **package.json** 取，两者必须自洽，否则会把 rc 发进 `latest` 或把稳定版发进 `rc`。`release.yml` 在 `release:check` 前用「Assert git tag matches package versions」步骤 fail-fast 守这条：不一致秒级红、绝不发版。**bump（第 4 步）和打 tag（第 8 步）是两个独立动作，最易错位——务必让 tag 名 = 两包版本号。**
- **npm 版本不可覆盖**：一旦某 `version` 发过，重发同版本必失败。改了就 bump，绝不复用版本号。
- **带 rc tag 的发布分支若要合 main，必须 merge-commit 或 `--ff-only`，绝不 squash/rebase**（squash 会孤儿化已存在的 tag）。本闭环的常规姿势是「先合 main，再在 main 上打 tag」，分支本身不携带 tag，故常规 feature 分支用任意合并方式都可；只有当分支已被 rc tag 指向时才受此约束。
- **`release:check` 是权威发版门**，由 CI 在 tag push 后跑（见 `release.yml`）。它必须精确等于 `docs/testing.md` 的 Current Release Gates 清单；改门要同步改 `docs/testing.md` + 根 `package.json`，否则 `docs:check` 红。
- 改架构不为旧 E2E 妥协（见 `AGENTS.md`）。代码改动配聚焦契约测试，非 docs/instruction/纯格式的改动跑 code-review-graph。

## 渠道与版本号派生约定

| tag 名示例 | 解析出的 npm dist-tag | 含义 / `npm i` 默认行为 |
| --- | --- | --- |
| `v1.0.0-rc.4` | `rc` | 预发布，进 `rc` 渠道；`npm i @zonease/aiworker-cli` **不**装它 |
| `v1.0.0-beta.1` | `beta` | 预发布，进 `beta` 渠道（预留，解析取 `-` 后首个字母标识） |
| `v1.0.0` | `latest` | 正式 GA，成为 `npm i` 默认安装版，覆盖旧 `latest` |

派生规则（`release.yml` 内实现）：tag 含 `-`（SemVer prerelease）→ 取 `-` 后的字母标识（`rc.4`→`rc`）；不含 `-` → `latest`。**所以要发哪个渠道，只改你打的 tag 名，不碰 workflow。**

> GitHub Release 的 prerelease 标志同样从 tag 名派生：`prerelease: ${{ contains(github.ref_name, '-') }}`（含 `-` 即 prerelease）。**触发条件 = 首个干净 GA tag（`vX.Y.Z`）落地前必须确认它已生效**：在没有任何稳定版时，rc 占着 GitHub「Latest release」徽章无害；一旦切了第一个 GA，未标 prerelease 的 rc 会抢走 GA 的 `/releases/latest` 二进制。

> 当前状态锚点（执行前用 `npm view` 复核，勿凭此条拍板）：`@zonease/aiworker-cli` 的 `latest` 还停在 pre-refactor 的 `0.19.3`，`rc` 在 `1.0.0-rc.x`。即默认 `npm i` 仍装旧版——这正是将来切 GA（打干净 `vX.Y.Z`）要解决的事。

## 一轮闭环（按序执行，命令可直接抄）

每步带确切命令。`<pkg>` 指两个可发布包，`<version>` 指本轮目标版本（如 `1.0.0-rc.4`），`<tag>` = `v<version>`。

### 1. 起分支（绝不在 main 上改）
```sh
git checkout main && git pull --ff-only
git checkout -b <type>/<slug>   # 例: feat/xxx、fix/xxx、chore/release-xxx
```

### 2. 阶段性开发
- 范围收口到本阶段（destructive refactor 在 1.0 前允许，但别越界）。
- TDD：先写聚焦契约测试再写实现（见 `AGENTS.md` / Superpowers）。
- UI 用 `packages/ui` shadcn 原语，不自造组件系统。

### 3. 本地预检（cheap、high-signal，先挡住最可能的红）
```sh
bun run docs:check        # 守 AGENTS.md(≤90 行/必含串) + release.yml 结构 + canonical docs
bun run test:contracts    # 架构/边界不变量
bun run lint              # eslint + soul-app 边界 + ui:check + docs:check
bun run typecheck
```
触及运行时/产物/版本号时，追加权威门（重，可后台跑）：
```sh
bun run build && bun run release:check
```
> `release:check` 是 CI tag 发版前会跑的同一道门；本地先跑一遍可避免「打了 tag 却在 CI 挂掉、白烧一个 tag」。涉及不可逆公开发版时，打 tag 前应本地过 `release:check`。

### 4. bump 版本（决定版本号 = 决定渠道）
两个 `package.json` 的 `version` 同步改成 `<version>`：
```sh
# apps/worker-cli/package.json 与 apps/host-cli/package.json 的 "version"
```
要发 rc → `1.0.0-rc.N`；要发 GA → 干净 `1.0.0`。改完 `bun run build` 让 dist 跟上，再跑相关 smoke。

### 5. commit + push 分支 + 开 PR
```sh
git add -A
git commit            # 中文 conventional commit；尾部按仓库约定加 Co-Authored-By
git push -u origin HEAD
gh pr create --base main --title "<中文标题>" --body "<中文说明>"
```

### 6. 等 PR CI 绿
```sh
gh pr checks --watch          # lint.yml：lint + web lint/test/build/cycle/size
```

### 7. 合并到 main
```sh
gh pr merge --squash --delete-branch   # 常规 feature 分支
# 若该分支已被 rc tag 指向：改用 --merge（merge-commit）或 --ff-only，绝不 squash
```

### 8. 打 tag + 推 CI 发版
```sh
git checkout main && git pull --ff-only
git tag <tag>                 # 例: v1.0.0-rc.4（tag 名即决定渠道）
git push origin <tag>         # 唯一发版触发
```

### 9. 监控 release.yml
```sh
gh run watch                  # 跟最新 run
# 顺序：install → playwright → release:check → compile 4 binaries
#       → package bundles → smoke artifacts → publish <pkg>(派生渠道) → attach GH release
```

### 10. 验证 npm 已发布（权威，轮询直到出现）
```sh
npm view @zonease/aiworker-cli@<version> version
npm view @zonease/aiworker-host-cli@<version> version
npm view @zonease/aiworker-cli dist-tags     # 确认进了预期渠道
```
> `smoke:npm-package` 验的是**本地 pack 的 tarball**，不是已发布包；「验证 npm 已发布」必须用 `npm view <pkg>@<version>` 实查 registry。

### 11. 收尾 + 下一轮
- 把本轮的非显然决策/陷阱写进项目记忆或本 runbook。
- 回到第 1 步开下一轮（开发 / 优化 / 修复）。

## 失败处置

- **CI `release:check` 红**：发版步骤不会执行（无 npm 副作用）。删 tag、修、重打：
  ```sh
  git push origin --delete <tag> && git tag -d <tag>
  # 修复并合并后重新第 8 步
  ```
- **`release:check` 绿但 `npm publish` 红**：常见 = 版本号已发过（不可覆盖，bump 后重来）/ `NPM_TOKEN`（GH secret）失效 / `--access public` 权限。查 run 日志对症。
- **tag 已 push 但想改内容**：不要 force-move 已驱动过发布的 tag。bump 到下一个版本号重走。
- **PR CI（lint.yml）红**：在分支上修，重 push，回第 6 步。

## 关键文件锚点

- `.github/workflows/release.yml` — tag 发版管线（release:check → compile → package → smoke → publish 派生渠道 → attach）。
- `.github/workflows/lint.yml` — PR/push main 的 lint + web 门。
- `apps/worker-cli/package.json` / `apps/host-cli/package.json` — 版本 source of truth。
- 根 `package.json` `release:check` — 权威门聚合器，须等于 `docs/testing.md` Current Release Gates。
- `docs/testing.md` — Current Release Gates + Release Exit Criteria（post-compile artifact proof）的 canonical 定义。
