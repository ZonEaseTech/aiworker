---
name: release-loop
description: "Use inside an AIWorker checkout when a releasable change is ready to ship to npm. Drives the full iterate-and-release loop: branch → PR → merge main → push a `v*` tag → CI publishes @zonease/aiworker-cli + @zonease/aiworker-host-cli (npm dist-tag derived from the tag name) → verify with `npm view`. Trigger when you (or the user) want to cut/ship a release, bump the publishable version, publish to npm, push a release tag, or continue the next release round (\"发版\", \"打 tag\", \"发 rc\", \"release\", \"publish\", \"ship\"). A development agent is authorized to run this end-to-end, including the public npm publish, without asking each time; the safety guards are built in. Do NOT use outside an AIWorker checkout, for ordinary feature work that is not being released, or for the generic OMC `release` skill."
---

# AIWorker 迭代与发版闭环

把一个可发布的改动从工作区送上 npm 的可重复闭环：阶段性开发 → PR → 合并 main → 打 `v*` tag → CI 发版 → `npm view` 验证 → 下一轮。这是发版执行 workflow，写给 agent；它取代了旧的 `RELEASE_LOOP.md`。

> 本 skill 是流程 runbook，不是 canonical 合同。优先级低于 `AGENTS.md` 与 canonical docs（`docs/architecture|protocol|runtime|soul-authoring|testing.md`）；与它们冲突时以后者为准。

## Trigger Gate（用前确认三条，全中才用）

1. **AIWorker repo 身份**：从 cwd 定位 git root；确认根 `AGENTS.md` 含 `AIWorker Agent Bootstrap`、`.github/workflows/release.yml` 存在、两个可发布包 `apps/worker-cli/package.json`（`@zonease/aiworker-cli`）与 `apps/host-cli/package.json`（`@zonease/aiworker-host-cli`）存在。
2. **发版意图**：你或用户要发版 / bump 版本 / 打 tag / publish npm / 续下一轮发版。普通 feature 开发（不发版）不触发本 skill。
3. **非 OMC release**：这是 AIWorker 专属闭环，不是通用 `oh-my-claudecode:release`。

## 谁用 / 何时用 / 授权

- **谁**：在 AIWorker 上干活的开发 agent。这套发版流程是你的常规能力，不是只给某个特定会话或人类的。
- **何时**：每完成一个可发布的阶段（feature / 优化 / 修复）后。不必等人开口，也不必每次重新设计流程——直接按下面的步骤走。
- **授权**：你被授权自主走完整闭环，**含打 `v*` tag 触发公开 npm 发布**，无需逐次向用户申请。安全不靠“先问人”，而靠内置硬门兜底：发版前本地过 `release:check`（第 3 步）、CI 强制 tag↔package 版本一致（不一致绝不发）、npm 版本不可覆盖、`release:check` 失败发生在 publish 之前 = 零发布副作用可重试。
- **唯一要先问人的例外**：跨越既往明确裁决（如当前“仍不打 GA、只走 rc 线”）、或要改这套流程本身的不变量。其余照常自主走。

## 不变量（违反即停，先回到这里对照）

- **可发布包只有两个，是两个独立产品，支持独立版本**：`@zonease/aiworker-cli`（`apps/worker-cli`，worker 线）、`@zonease/aiworker-host-cli`（`apps/host-cli`，host 线）。其余 `souls/*`、`packages/*`、`apps/*-web` 全是 `private: true`，不发 npm。两包**可独立版本独立发**（per-line tag），也可组合同版本同发（`v*` tag）——见下「tag 方案」。
- **版本号 source of truth = 两个 `package.json`**：`apps/worker-cli/package.json` + `apps/host-cli/package.json` 的 `version` 字段。`dist/package.json` 由 `bun run build` 重生，不要手改。独立发版时各包版本可不同；组合 `v*` 发版时两包须同版本。
- **发版触发 = push tag，三种方案**（`.github/workflows/release.yml` 被 `tags: ['v*','worker-v*','host-v*']` 驱动；合并 main 不发版，只跑 `lint.yml`）：
  - `worker-v<version>` → **只发 worker-cli**（release-worker job；host job 被 `if` 跳过）。**worker GA = 打 `worker-v1.0.0`**，只把 worker-cli 的 `latest` 切到 v1、host 不动。
  - `host-v<version>` → **只发 host-cli**（release-host job）。
  - `v<version>` → 旧组合，**同发两包同版本**（向后兼容）。
- **渠道由 version 派生，不手改 workflow**：剥掉 tag 前缀（`worker-v`/`host-v`/`v`）得 version；version 含 `-`（SemVer prerelease）→ 取 `-` 后首段（`rc.4`→`rc`），不含 `-` → `latest`。两处 `npm publish` 用派生的 `--tag`。
- **tag 的版本号必须等于对应 `package.json` 的 `version`**：per-line tag 只校验对应包（`worker-v1.0.0` ⇔ worker-cli=`1.0.0`），`v*` 组合校验两包。不一致 → release.yml 的 version-assert 步骤 fail-fast 秒级红、绝不发版。**bump 和打 tag 是两个独立动作，最易错位。**
- **npm 版本不可覆盖**：一旦某 `version` 发过，重发同版本必失败。改了就 bump，绝不复用版本号。
- **带 rc tag 的发布分支若要合 main，必须 merge-commit 或 `--ff-only`，绝不 squash/rebase**（squash 会孤儿化已存在的 tag）。本闭环的常规姿势是「先合 main，再在 main 上打 tag」，分支本身不携带 tag，故常规 feature 分支用任意合并方式都可；只有当分支已被 rc tag 指向时才受此约束。
- **发版门已拆成两道独立门**，由 CI 在 tag push 后并行跑（见 `release.yml`）：worker `release:check`（`release-worker` job）+ host `release:check:phase2`（`release-host` job）。两 job **无 `needs` 耦合**，host 门红只挡 host-cli 发布、不挡 worker-cli。`release:check` 须精确等于 `docs/testing.md` 的 worker gate 清单、`release:check:phase2` 须等于 Phase 2 gate 清单；改门要同步改 `docs/testing.md` + 根 `package.json`（+ `scripts/check-doc-contract.ts` 双门契约），否则 `docs:check`/`test:contracts` 红。注意：worker 门里的全仓 `build`/`typecheck`/`lint` 仍会因 host 的**编译/类型/lint**错误而红（有意为之，只隔离 host 的 **flaky 测试**）。
- 改架构不为旧 E2E 妥协（见 `AGENTS.md`）。代码改动配聚焦契约测试，非 docs/instruction/纯格式的改动跑 code-review-graph。

## tag 方案与渠道派生约定

| tag 示例 | 发哪个包 | npm dist-tag | 含义 / `npm i` 默认行为 |
| --- | --- | --- | --- |
| `worker-v1.0.0-rc.12` | 只 worker-cli | `rc` | worker 预发布，进 `rc`；`npm i @zonease/aiworker-cli` **不**装 |
| `worker-v1.0.0` | 只 worker-cli | `latest` | **worker GA**，worker-cli 默认安装版切到 v1（host 不动） |
| `host-v1.0.0-rc.12` | 只 host-cli | `rc` | host 预发布，独立节奏 |
| `v1.0.0-rc.11` | 两包同发 | `rc` | 旧组合，两包同版本同渠道（向后兼容） |

派生规则（`release.yml` 内）：剥 tag 前缀得 version → 含 `-` 取 `-` 后字母标识、不含 `-` → `latest`。**要发哪条线哪个渠道，只选 tag 名，不碰 workflow。** 完整三线编排见 `docs/superpowers/specs/2026-06-12-three-line-dev-orchestration.md`。

> GitHub Release 的 prerelease 标志同样从 tag 名派生：`prerelease: ${{ contains(github.ref_name, '-') }}`（含 `-` 即 prerelease）。**触发条件 = 首个干净 GA tag（`vX.Y.Z`）落地前必须确认它已生效**：在没有任何稳定版时，rc 占着 GitHub「Latest release」徽章无害；一旦切了第一个 GA，未标 prerelease 的 rc 会抢走 GA 的 `/releases/latest` 二进制。

> 当前状态锚点（执行前用 `npm view` 复核，勿凭此条拍板）：`@zonease/aiworker-cli` 的 `latest` 还停在 pre-refactor 的 `0.19.3`，`rc` 在 `1.0.0-rc.x`。即默认 `npm i` 仍装旧版——这正是将来切 GA（打干净 `vX.Y.Z`）要解决的事。

## 一轮闭环（按序执行，命令可直接抄）

每步带确切命令。`<pkg>` 指两个可发布包，`<version>` 指本轮目标版本（如 `1.0.0-rc.6`），`<tag>` = `v<version>`。

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

> ⚠️ **陷阱：`cmd | tail` 掩盖退出码。** `bun run release:check 2>&1 | tail -N` 的退出码（以及后台任务通知里的「exit code 0」）是 **`tail` 的**，不是 `release:check` 的——`release:check` 失败（exit 1）也会被报成 0。**判绿不能只看管道/通知退出码**，必须读输出尾巴确认没有 `error: script "..." exited with code N`、且最后一道门 `check` 真的收尾（如 `docs contract ok`）。需要可靠退出码时：用 `set -o pipefail`、读 `${PIPESTATUS[0]}`，或对判绿用的那次跑**别接 `| tail`**（输出落文件后再 `tail` 文件）。

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
git tag <tag>                 # 选哪条线+哪个渠道 = 选 tag 名(见「tag 方案」):
                              #   worker-v1.0.0-rc.6 → 只发 worker-cli@rc
                              #   worker-v1.0.0      → worker GA(只切 worker-cli latest)
                              #   host-v1.0.0-rc.6   → 只发 host-cli@rc
                              #   v1.0.0-rc.6        → 旧组合,同发两包
git push origin <tag>         # 发版触发
```

### 9. 监控 release.yml
```sh
gh run watch                  # 跟最新 run
# 两个并行 job(无 needs 耦合)：
#   release-worker: install → playwright → assert tag==worker 版本 → release:check → compile 4 binaries
#                   → package bundles → smoke artifacts → derive 渠道 → publish worker-cli → attach GH release
#   release-host:   install → playwright → assert tag==host 版本 → release:check:phase2 → derive 渠道 → publish host-cli
#   host 门红只挡 host-cli,不挡 worker-cli
```

### 10. 验证 npm 已发布（权威，轮询直到出现）
```sh
npm view @zonease/aiworker-cli@<version> version
npm view @zonease/aiworker-host-cli@<version> version
npm view @zonease/aiworker-cli dist-tags     # 确认进了预期渠道、latest 是否如预期
```
> `smoke:npm-package` 验的是**本地 pack 的 tarball**，不是已发布包；「验证 npm 已发布」必须用 `npm view <pkg>@<version>` 实查 registry。

### 11. 收尾 + 下一轮
- 把本轮的非显然决策/陷阱写进项目记忆或本 skill。
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
- **测试门 flaky（并发负载偶发失败）**：worker 门 `release:check` 的 `bun run test:worker`、host 门 `release:check:phase2` 的 `bun run test:host` + phase2 浏览器 spec（host-lifecycle tmux / phase2 三 spec）在并发/有遗留进程时会偶发失败（已知非确定性，非版本改动引入）。判别 = **隔离重跑该包**：`bun run --filter '<失败包>' test`；绿即 flake。flake 不是确定性失败，CI 干净 runner 更不易复现。门失败发生在 publish **之前** = 零发布副作用，故 CI 上遇 flake 直接 `gh run rerun <run-id>` 重试**同一个 tag**（无需删 tag / bump）。只有确定性失败才走上面「删 tag、修、重打」。host flake 现在只挡 `release-host` job、worker-cli 照常发。

## 关键文件锚点

- `.github/workflows/release.yml` — tag 发版管线，两个无 `needs` 耦合的并行 job：`release-worker`(release:check → compile → package → smoke → publish worker-cli → attach) + `release-host`(release:check:phase2 → publish host-cli)。
- `.github/workflows/lint.yml` — PR/push main 的门：`lint` job(lint + web) + `checks` job(typecheck + test:contracts 确定性门)。
- `apps/worker-cli/package.json` / `apps/host-cli/package.json` — 版本 source of truth。
- 根 `package.json` `release:check`(worker 门) + `release:check:phase2`(host 门) — 两个门聚合器，分别须等于 `docs/testing.md` 的 worker / Phase 2 gate 清单。
- `docs/testing.md` — Current Release Gates + Release Exit Criteria（post-compile artifact proof）的 canonical 定义。
