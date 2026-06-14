---
name: release-loop
description: "Use inside an AIWorker checkout when a releasable change is ready to ship to npm. Drives the full iterate-and-release loop: branch → PR → merge main → push a `v*` or `aiworker-v*` tag → CI publishes the single package @zonease/aiworker-cli (npm dist-tag derived from the tag name) → verify with `npm view`. Trigger when you (or the user) want to cut/ship a release, bump the publishable version, publish to npm, push a release tag, or continue the next release round (\"发版\", \"打 tag\", \"发 rc\", \"release\", \"publish\", \"ship\"). A development agent is authorized to run this end-to-end, including the public npm publish, without asking each time; the safety guards are built in. Do NOT use outside an AIWorker checkout, for ordinary feature work that is not being released, or for the generic OMC `release` skill."
---

# AIWorker CLI 迭代与发版闭环

把一个可发布的改动从工作区送上 npm 的可重复闭环：阶段性开发 → PR → 合并 main → 打 `v*`/`aiworker-v*` tag → CI 发版 → `npm view` 验证 → 下一轮。这是发版执行 workflow，写给 agent；它取代旧双 CLI 发版流程。

> 本 skill 是流程 runbook，不是 canonical 合同。优先级低于 `AGENTS.md` 与 canonical docs（`docs/architecture|protocol|runtime|soul-authoring|testing.md`）；与它们冲突时以后者为准。

## Trigger Gate（用前确认三条，全中才用）

1. **AIWorker repo 身份**：从 cwd 定位 git root；确认根 `AGENTS.md` 含 `AIWorker Agent Bootstrap`、`.github/workflows/release.yml` 存在、唯一可发布包 `apps/aiworker-cli/package.json`（`@zonease/aiworker-cli`）存在。
2. **发版意图**：你或用户要发版 / bump 版本 / 打 tag / publish npm / 续下一轮发版。普通 feature 开发（不发版）不触发本 skill。
3. **非 OMC release**：这是 AIWorker 专属闭环，不是通用 OMC release。

## 谁用 / 何时用 / 授权

- **谁**：在 AIWorker 上干活的开发 agent。这套发版流程是你的常规能力。
- **何时**：每完成一个可发布的阶段（feature / 优化 / 修复）后。不必等人开口，也不必每次重新设计流程——直接按下面步骤走。
- **授权**：你被授权自主走完整闭环，**含打 tag 触发公开 npm 发布**，无需逐次向用户申请。安全不靠“先问人”，而靠内置硬门兜底：发版前本地过 `release:check`、CI 强制 tag↔package 版本一致、npm 版本不可覆盖、`release:check` 失败发生在 publish 之前 = 零发布副作用可重试。
- **唯一要先问人的例外**：跨越既往明确裁决（例如要切 GA 但当前明确只走 rc 线）、或要改这套流程本身的不变量。

## 不变量（违反即停，先回到这里对照）

- **可发布包只有一个**：`@zonease/aiworker-cli`（`apps/aiworker-cli`）。它就是本项目的产品核心。其余 `souls/*`、`packages/*`、web/runtime/daemon 包面不发布 npm。
- **版本号 source of truth = `apps/aiworker-cli/package.json`** 的 `version` 字段。`dist/package.json` 由 `bun run build` 重生，不要手改。
- **发版触发 = push tag**（`.github/workflows/release.yml` 被 `tags: ['v*','aiworker-v*']` 驱动；合并 main 不发版，只跑 lint/main gates）：
  - `aiworker-v<version>` → 发布 `@zonease/aiworker-cli`。
  - `v<version>` → 同一路径，保留单包发布的短 tag。
- **渠道由 version 派生，不手改 workflow**：剥掉 tag 前缀（`aiworker-v`/`v`）得 version；version 含 `-`（SemVer prerelease）→ 取 `-` 后首段（`rc.4`→`rc`），不含 `-` → `latest`。
- **tag 的版本号必须等于 `apps/aiworker-cli/package.json` 的 `version`**。不一致 → release.yml 的 version-assert 步骤 fail-fast，绝不发版。
- **npm 版本不可覆盖**：一旦某 `version` 发过，重发同版本必失败。改了就 bump，绝不复用版本号。
- **带 rc tag 的发布分支若要合 main，必须 merge-commit 或 `--ff-only`，绝不 squash/rebase**（squash 会孤儿化已存在的 tag）。常规姿势是「先合 main，再在 main 上打 tag」，分支本身不携带 tag。
- 改架构不为旧自研运行时/控制面 E2E 妥协。代码改动配聚焦契约测试，非 docs/instruction/纯格式的改动跑 code-review-graph。

## tag 方案与渠道派生约定

| tag 示例 | 发哪个包 | npm dist-tag | 含义 / `npm i` 默认行为 |
| --- | --- | --- | --- |
| `aiworker-v1.0.0-rc.12` | `@zonease/aiworker-cli` | `rc` | AIWorker CLI 预发布，进 `rc`；`npm i @zonease/aiworker-cli` 默认不装 |
| `aiworker-v1.0.0` | `@zonease/aiworker-cli` | `latest` | AIWorker CLI GA，默认安装版切到 v1 |
| `v1.0.0-rc.12` | `@zonease/aiworker-cli` | `rc` | 单包短 tag，同上 |
| `v1.0.0` | `@zonease/aiworker-cli` | `latest` | 单包短 tag GA |

派生规则（`release.yml` 内）：剥 tag 前缀得 version → 含 `-` 取 `-` 后字母标识、不含 `-` → `latest`。

> 当前状态锚点（执行前用 `npm view` 复核，勿凭此条拍板）：`@zonease/aiworker-cli` 的 rc 线在 `1.0.0-rc.x`。默认安装版何时切到重构后的 GA，以第一次干净 `vX.Y.Z` / `aiworker-vX.Y.Z` 为准。

## 一轮闭环（按序执行，命令可直接抄）

每步带确切命令。`<version>` 指本轮目标版本（如 `1.0.0-rc.13`），`<tag>` = `aiworker-v<version>` 或 `v<version>`。

### 1. 起分支（绝不在 main 上改）
```sh
git checkout main && git pull --ff-only
git checkout -b <type>/<slug>
```

### 2. 阶段性开发
- 范围收口到本阶段；destructive refactor 在 1.0 前允许，但别拉回旧自研运行时/控制面功能。
- TDD：先写聚焦契约测试再写实现。
- AIWorker CLI 只做 assignment/provisioning/audit/handoff/Soul projection；员工 workspace/runtime/UI/session/provider orchestration 属于 Paseo。

### 3. 本地预检（cheap、high-signal，先挡住最可能的红）
```sh
bun run docs:check
bun run test:contracts
bun run lint
bun run typecheck
```
触及发布产物/版本号时，追加权威门：
```sh
bun run build
bun run smoke:dist-release
bun run release:check
```
> `release:check` 是 CI tag 发版前会跑的同一道门；打 tag 前本地先跑一遍，避免 tag push 后 CI 才失败。

> ⚠️ **陷阱：`cmd | tail` 掩盖退出码。** 需要可靠退出码时用 `set -o pipefail`，或对判绿用的那次跑别接管道。

### 4. bump 版本（决定版本号 = 决定渠道）
改 `apps/aiworker-cli/package.json` 的 `version` 为 `<version>`。

要发 rc → `1.0.0-rc.N`；要发 GA → 干净 `1.0.0`。改完 `bun run build` 让 dist 跟上，再跑 smoke/release check。

### 5. commit + push 分支 + 开 PR
```sh
git add -A
git commit
git push -u origin HEAD
gh pr create --base main --title "<中文标题>" --body "<中文说明>"
```

### 6. 等 PR CI 绿
```sh
gh pr checks --watch
```

### 7. 合并到 main
```sh
gh pr merge --squash --delete-branch
# 若该分支已被 rc tag 指向：改用 --merge 或 --ff-only，绝不 squash
```

### 8. 打 tag + 推 CI 发版
```sh
git checkout main && git pull --ff-only
git tag <tag>
git push origin <tag>
```

### 9. 监控 release.yml
```sh
gh run watch
```
关键阶段：install → release:check → derive channel → publish `@zonease/aiworker-cli` from `apps/aiworker-cli/dist`。

### 10. 验证 npm 已发布（权威，轮询直到出现）
```sh
npm view @zonease/aiworker-cli@<version> version
npm view @zonease/aiworker-cli dist-tags
```
> `smoke:dist-release` 验的是本地 pack 的 tarball，不是已发布包；发布验证必须用 `npm view` 实查 registry。

### 11. 收尾 + 下一轮
- 把本轮非显然决策/陷阱写进项目记忆或本 skill。
- 回到第 1 步开下一轮（开发 / 优化 / 修复）。

## 失败处置

- **CI `release:check` 红**：发版步骤不会执行（无 npm 副作用）。删 tag、修、重打：
  ```sh
  git push origin --delete <tag> && git tag -d <tag>
  # 修复并合并后重新第 8 步
  ```
- **`release:check` 绿但 `npm publish` 红**：常见 = 版本号已发过 / `NPM_TOKEN` 失效 / `--access public` 权限。查 run 日志对症。
- **tag 已 push 但想改内容**：不要 force-move 已驱动过发布的 tag。bump 到下一个版本号重走。
- **PR CI 红**：在分支上修，重 push，回第 6 步。

## 关键文件锚点

- `.github/workflows/release.yml` — tag 发版管线：`release:check` 后发布 `@zonease/aiworker-cli`。
- `.github/workflows/lint.yml` / `.github/workflows/main-gates.yml` — PR/main 的确定性门。
- `apps/aiworker-cli/package.json` — 唯一发布包版本 source of truth。
- 根 `package.json` `release:check` — 发布前聚合门。
- `docs/testing.md` — canonical gate 定义。
