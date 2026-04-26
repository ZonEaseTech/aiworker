# PLAN-016 Deployment reshape — CLI-first install, docker as optional fast-launch

- **status**: completed
- **createdAt**: 2026-04-24 19:15
- **revisedAt**: 2026-04-26 09:30
- **approvedAt**: 2026-04-26 09:30
- **completedAt**: 2026-04-26 10:30
- **relatedTask**: REFACTOR-003
- **dependsOn**: PLAN-013 / PLAN-014 / PLAN-015（CLI 形态完整 + 文件系统 source-of-truth + core 抽离）
- **commits**: 0a4c958, 3c46801（S1）, e8a98f6（S2 cherry-pick）

## Outcomes

落地分两个 subtask：

- **S1 — `aim install systemd` 子命令**（feat `0a4c958` / merge `3c46801`）：BKD subtask `bkd/fl6hv9vl` 自动合并，13 个 case 单测覆盖 dry-run / user / system / `--out` / `--no-enable` / unit 模板字段断言。`aim install --help` + `aim install systemd --dry-run` 渲染合法 systemd unit。
- **S2 — 部署文档三档重写**（cherry-pick `e8a98f6`，原 `bkd/g4j2nqve` tip `523785b`）：BKD subtask 完成 commit 但因 fork base 早于 S1 merge 没走自动合并；本 session 在主分支 cherry-pick 接入，diff 干净（与 S1 文件 zero overlap）。`docs/deployment.md` / `docs/deployment-public-https.md` / `docs/architecture.md` / `docs/cli.md` / `ops/compose/docker-compose.yml` / `scripts/deploy.ts` 全部按 §S2 spec 落地。
- **S3 — Plan + task 收尾**（本 commit）：S3 没单独走 BKD subtask（W2 dispatch 在 S1+S2 全 merge 后才发，但 S2 没自动合 → 本 session 主分支收完）。本 commit 同时完成：PLAN-016 status / outcomes / commits 字段；plan/index PLAN-016 `[ ] → [x]`；REFACTOR-003 task `[-] → [x]` + completedAt + outcomes 总收官段；task/index REFACTOR-003 `[-] → [x]`。

测试基线变化（PLAN-016 完成态）：

- `apps/cli` 0 → **13** pass（S1 单测，全在 `apps/cli/src/aim/commands/install.test.ts`）。
- 其他包（apps/api / apps/gateway / packages/core / packages/shared / packages/gateway-proto / apps/web）**无变化** —— 本 plan 不动业务实现。
- `bun run check` 9 包全绿；3 个 smoke（aiw-run / gateway-local / aim）全绿。

跟原 §Acceptance criteria 对账：

- ✅ `aim install systemd --dry-run` 输出合法 systemd unit（验过）。
- ✅ `aim install systemd --out /tmp/test-aiw.service --no-enable` 幂等写文件（单测覆盖）。
- ✅ `docs/deployment.md` 主路径 = systemd（开篇三档对比表 + 形态二段落即给出 `aim install systemd`）。
- ✅ `bun run check` 全绿；新单测 13 case（≥ 4 要求达成 3 倍）。
- ✅ `bun test` 总数 +13。
- ✅ 所有 smoke 继续绿。
- ✅ `scripts/deploy.ts deploy --dry-run` 仍能正确出图（实现未变）。
- ✅ REFACTOR-003 task 推到 `[x]` —— 本 commit 即时完成。

Follow-up（不在本 plan）：

- **R1（P2）** unit 模板假设 `~/.bun/bin/aim`；打 binary 形态时（PLAN-017+）`ExecStart` 路径需要 parameterize。
- launchd（macOS）+ 其他 init 系统的 `aim install` 子命令——后续按需扩展。
- 旧 GHCR 镜像下线 / `scripts/deploy.ts` 路径删除——本 plan 仅降级文案，不破兼容；将来若 docker 形态完全废弃再单独跟。
- BKD coordinator 的 worktree-fork-base 偏移问题（S2 没走自动合并的根因）值得在 BKD 侧单独跟踪——理论上 W2 dispatch 时应当从 S1 merge 后的 main rebase。

## Why

PLAN-013 让 manager 控制面切到 WS gateway（`aim gateway start` 直接 run），但 `scripts/deploy.ts` + `ops/compose/docker-compose.yml` + `docs/deployment.md` 还停在 PLAN-005 / PLAN-009 时代的 "GHCR 镜像 + Caddy 公网终止 + `gateway.example.test`" SaaS 部署模型上。这跟 hermes / openclaw 的 CLI-first 哲学错位——两边都没有 "production deploy" 概念，就是 `npm i -g` / `curl install.sh` 在用户机器上跑，远程访问走 Tailscale / SSH tunnel。

REFACTOR-003 收官的最后一笔：把"如何部署"重新定义。

## Goal

部署形态降级为三档并列，docker 从默认变可选：

1. **裸跑（main path）**：`bun install -g @aiworker/cli`（或后续 `bun build --compile` 单 binary）→ `aim gateway start` 前台 / `aiw serve` 前台。无 docker、无公网、无 Caddy。开发 + 单机用户的默认。
2. **systemd 服务化**：Linux 主机上 `aim install systemd [--user|--system]` 一键写 unit + `systemctl enable --now`。长跑 / 服务器场景。
3. **docker（可选 fast-launch）**：保留 `ops/compose/` + `scripts/deploy.ts` + GHCR image，但定位降级为"懒人快速试用"或"`aim workers launch` per-worker docker 隔离"。**不再是 canonical 部署路径。**

公网 HTTPS（Cloudflare + Caddy + `gateway.example.test`）从主 `deployment.md` 拆出来到独立 `deployment-public-https.md`，标注"仅当需要把 channel webhook 暴露公网时才装"。

## Scope（已细化）

### S1 — `aim install systemd` 子命令

新文件：`apps/cli/src/aim/commands/install.ts` + `apps/cli/src/aim/commands/install.test.ts`。

子命令：

- `aim install systemd [--user|--system] [--dry-run] [--out <path>] [--no-enable]`
  - `--user`（默认 systemd 用户实例）：写 `~/.config/systemd/user/aiworker-gateway.service`
  - `--system`（root only）：写 `/etc/systemd/system/aiworker-gateway.service`
  - `--dry-run`：只打印 unit 内容，不写盘
  - `--out <path>`：覆盖目标路径（测试 + 异常布局用）
  - `--no-enable`：写文件后不调 `systemctl daemon-reload + enable --now`，留给运维手动操作

unit 内容（模板字符串，纯渲染，无新依赖）：

```ini
[Unit]
Description=AIWorker gateway daemon
After=network.target

[Service]
Type=simple
ExecStart=%h/.bun/bin/aim gateway start
Restart=on-failure
RestartSec=5
Environment=AIWORKER_HOME=%h/.aiworker

[Install]
WantedBy=default.target
```

`--system` 形态下 `%h` 替换为操作员 home 或 hardcode `/var/lib/aiworker`，`WantedBy` 改 `multi-user.target`。

`aim` 注册到 cac 的 commands 表；`aim install --help` 罗列 `systemd` 子命令。

### S2 — 部署文档三档重写

- **`docs/deployment.md`** — 整体重写。主路径是裸跑 + systemd。docker compose 章节挪到末尾"可选 fast-launch"段落，标注"如果你不需要 docker 隔离，跳过本节"。`scripts/deploy.ts` 不在主流程里出现。
- **`docs/deployment-public-https.md`** — **新建**。把原 `deployment.md` 里 `gateway.example.test` + Cloudflare 橙云 + Caddy `:80 → :3000` + GHCR 镜像 + `bun run scripts/deploy.ts deploy` 的 run book 整段挪过来。开篇明确"仅当需要把 channel webhook 暴露公网时才需要本文档"。
- **`docs/architecture.md`** Monorepo Layout 段下面加"部署模型"小节，指向 `deployment.md` 的三档。
- **`docs/changelog.md`** 加 PLAN-016 完成条目。
- **`scripts/deploy.ts`** 文案降级：`--help` 顶部 banner 加 "optional docker-mode deploy; see docs/deployment.md for the recommended CLI-first path"；`cmdDeploy` log 文案前缀加 `[docker-mode]` 区分。**不动实现**。
- **`ops/compose/docker-compose.yml`** 头注释加"optional fast-launch — see docs/deployment.md"。
- **`docs/cli.md`** 加 `aim install systemd` 章节。

### S3 — Plan 收尾

- `docs/plan/PLAN-016.md` 状态 implementing → completed + commit hash + 时间戳 + Outcomes 段
- `docs/plan/index.md` PLAN-016 `[ ]` → `[x]` + Updated 头时间戳
- `docs/task/REFACTOR-003.md` 状态 `[-]` → `[x]` + completedAt（**REFACTOR-003 总收官**）
- `docs/task/index.md` REFACTOR-003 `[-]` → `[x]`

## Acceptance criteria

- `aim install systemd --dry-run` 输出合法 systemd unit；`systemd-analyze verify <unit>` 不报错（如 host 有该工具，否则跳过）。
- `aim install systemd --out /tmp/test-aiw.service --no-enable` 幂等写文件；二次执行内容一致。
- 新读者读 `docs/deployment.md` 能在 5 分钟内得出"主路径是 `aim install systemd`，不是 `docker compose pull`"的结论。
- `bun run check` 全绿；新单测 ≥ 4 case（dry-run / user / system / 已存在文件覆盖）。
- `bun test` 总数 +4 起。
- 所有 smoke（aiw-run / gateway-local / aim）继续绿。
- `scripts/deploy.ts deploy --dry-run` 仍能正确出图（实现未变）。
- REFACTOR-003 task 推到 `[x]` —— 这是本 plan 的最终交付物。

## Risks

- **R1（P2）** systemd unit 模板里 `ExecStart=%h/.bun/bin/aim` 假设 bun + aim 在 `~/.bun/bin/`。在打 binary 形态（PLAN-017+）这条路径会变，届时模板要 parameterize。**Mitigation**：unit 模板里加注释指明这是基于"bun-installed aim"的形态，binary 形态升级时同步改。
- **R2（P2）** systemd `--system` 形态下 `aim gateway` 需要监听 :3000 / 数据写到非 root home，权限模型要小心。**Mitigation**：`--user` 是默认，`--system` 在 docs 里标注"需要明确知道在做什么"。
- **R3（P3）** docs 重写会改变 deep link（外部博客/issue 引用旧 URL），冲击有限因为本仓 doc 公开度低。**Mitigation**：deployment-public-https.md 在新 deployment.md 顶部留 "moved" 链接。

## Out of scope

- 真正打 binary（`bun build --compile` + GitHub Releases artefact）→ PLAN-017。
- launchd（macOS）+ 其他 init 系统 → 后续。
- 旧 GHCR 镜像下线；本 plan 只降级文案，不破兼容。
- 把 `gateway.example.test` 这个具体测试机的部署内容删除——只是搬到 deployment-public-https.md。
- 把 `scripts/deploy.ts` 实现重写——只调文案。

## Dispatch plan (BKD)

3 个 subtask，全部 worktree。

| Wave | Subtask | 依赖 |
|---|---|---|
| W1 | S1 `aim install systemd` 实现 + 单测 | 无 |
| W2 | S2 部署文档三档重写 | 无（与 S1 并行可，但合并顺序：S1 先） |
| W3 | S3 plan + task 收尾 + REFACTOR-003 关 `[x]` | W1 + W2 全 merge 后 |

实际编排建议：S1 + S2 并行 dispatch（Wave 1 & 2 合并），S3 单独 wave。

每 subtask 强制 `/pma-cr` 自审、报告模板、回报 coordinator。
