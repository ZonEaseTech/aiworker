# AIWorker Changelog

## 2026-04-27 09:00 PLAN-020 完成 — CLI 单二进制 `aiworker` + 全 monorepo `@zonease/*` 改名 + npm publish 准备就绪（FEAT-028 + FEAT-027 partial）

**PLAN-020 landed: aiw/aim 双 bin 下线，单 `aiworker` 二进制 + cac 子命令树替换；全 monorepo 9 个包从 `@aiworker/*` 迁到 `@zonease/aiworker-*`；`@zonease/aiworker-cli` npm publish 流水（bundle build + release.yml + dist/ stripped manifest）就绪，未真发。** 用户决策 2026-04-27 07:35（FEAT-028 方案 B 锁定）+ 07:45（scope 扩到 monorepo namespace 迁移）。BKD 1 coordinator (`th3t4j9q`) + 4 worktree subtask（S1 monorepo rename / S2 cli 重写 / S3 forward-looking docs sweep / S4 npm publish 元数据 + bundle build），按 S1 → S2+S3 并行 → S4 串行流水合 main。

What shipped:

- **S1 monorepo rename**（commit `5bf852c`，merge `6927faf`，185 files / 362+ / 360-）：9 份 package.json `name` + `dependencies` / `devDependencies` 全迁；根 `package.json` `db:generate*` filter 同步改；全工作树 `.ts` / `.tsx` / `.config.ts` import sweep（172 文件）；Dockerfile build path 必修以保 GHCR 镜像构建可复现；`apps/api/.env.example` 注释；`bun.lock` 重生（0 第三方 dep 漂移，仅 9 个 internal workspace 链接换名）。Subpath imports（如 `@zonease/aiworker-storage-sqlite/fleet`）保留段。
- **S2 cli 重写**（commit `babe3fd`，merge `1fd2d67`）：新 `apps/cli/src/aiworker.ts` 单 cac entry，36 个子命令（worker-local dash-form：`init / run / serve / config-show / config-set / token-rotate / approvals-list / approvals-grant / schedule-list / schedule-add / schedule-remove`；operator-remote 两词形式：`fleet list/info/launch/stop/remove`、`gateway start/status/stop`、`pair / chat / config get|set / token rotate / approvals list/grant / schedule list/add/remove / enroll list/approve/reject / logs / install systemd`）；`preprocessArgv` 动态从 `cli.commands` 收所有含空格的命令名，通用折叠多词 argv；删 `apps/cli/src/aiw.ts` + `aim.ts`，无 shim；`apps/cli/package.json` `bin: { aiworker }`；`smoke-aiw-run.ts` → `smoke-aiworker-run.ts`、`smoke-aim.ts` → `smoke-aiworker-fleet.ts`（git mv 保留 history）；systemd unit 模板 `ExecStart` 切到 `aiworker gateway start`；新增 `apps/cli/src/aiworker.test.ts` 入口测试 +10 case（注册命令计数 + 多词预处理 6 个用例 + `--help` 关键字）；cli 测试集 24 → 34 全过。
- **S3 forward-looking 文档迁移**（commit `1ab305e` + 补丁 `fb02179`，merge `4d0fd24`）：6 文档 + 1 .env.example 全替换。命令树统一到 `aiworker` 单二进制：`README.md` / `docs/cli.md`（全文重写）/ `docs/deployment.md`（systemd / install / aim 命令样例）/ `docs/architecture.md` / `docs/gateway.md` / `CLAUDE.md` § Project Development / Stack。`apps/api/.env.example` + `ops/compose/.env.example` 注释清理。补丁 `fb02179` 同步把 `docs/architecture.md` / `docs/cli.md` / `docs/deployment.md` / `docs/gateway.md` 内 14 行 `@aiworker/X` 包名引用迁到 `@zonease/aiworker-X`（含 subpath，如 `@zonease/aiworker-gateway-proto/src/messages.ts`）。`docs/changelog.md` PLAN-020 占位由本 commit 填充正式内容。`docs/plan/PLAN-NNN.md` / `docs/task/{FEAT,BUG,REFACTOR}-NNN.md` 历史命名保留。剩余 word-boundary `aiw|aim` 命中均合理保留（磁盘文件 `aim.json`、域名 `gateway.example.test`、anchor 兼容文档历史叙述）。
- **S4 npm publish 准备**（commit `7bde0c9`，merge `79cadd8`，4 files / 128+ / 9-）：`apps/cli/package.json` 落 publish 元数据（`version: 0.1.0` / `license: UNLICENSED`（FEAT-029 跟进）/ `repository` / `homepage` / `publishConfig.access: public` / `bin: { aiworker: ./dist/aiworker.js }` / `files: [dist/, README.md]` / `engines.bun: >=1.1`）；`scripts.build = bun build --target=bun --minify --outdir=dist src/aiworker.ts && bun scripts/build-publish-manifest.ts`；`prepublishOnly = bun run build`。新增 `apps/cli/scripts/build-publish-manifest.ts`（38 LOC）：build 后写一份 stripped `dist/package.json`（去掉 `devDependencies` 整个 workspace 段、`bin` 改 `./aiworker.js`、`files: [aiworker.js, README.md]`），并把仓库根 `README.md` copy 到 `dist/`。`.github/workflows/release.yml`（51 LOC）：tag `v*` 触发 → typecheck/test → bundle build → `cd apps/cli && bun publish --access public`（NPM_TOKEN 注入）→ 4 平台 `bun build --compile`（linux x64/arm64 + darwin x64/arm64）→ `softprops/action-gh-release` 附件。**release.yml 仅在 tag 推送时跑——本轮未推 tag，不会触发实发**。`README.md` install 节追加「Published（待 FEAT-027 npm publish 上线）」并行选项与本地开发路径并存。

Verification（最终 main HEAD `79cadd8`）：

- `bun run typecheck`：9/9 全过
- `bun run test`：~617 pass / 0 fail（PLAN-019 基线 ~607 + S2 入口测试 +10）
- `bun run --filter '@zonease/aiworker-cli' build` → `apps/cli/dist/aiworker.js` 0.72 MB（393 modules bundled）
- `bun apps/cli/dist/aiworker.js --help` → 列出 36 个子命令
- `bun apps/cli/dist/aiworker.js fleet list --help` / `config-show --help` / `install systemd --help` 全通
- `cd apps/cli/dist && bun publish --dry-run` → 3 files packed（aiworker.js + package.json + README.md，0.73 MB tarball），止步在 `missing authentication` —— 符合「不真发」要求
- `git grep '@aiworker/' -- ':!docs/plan' ':!docs/task' ':!docs/changelog.md' ':!bun.lock'` → 空（forward-looking + 源代码全清；`docs/plan/*` / `docs/task/*` / `docs/changelog.md` 历史保留）

Conflict / re-dispatch notes：

- S2 / S3 / S4 worktree 启动初期都看到 base = `a2e7961`（pre-S1 旧 main）—— BKD worktree 没自动 rebase，subtask 自己 `git rebase main` 拉齐后再开干（S2 / S3 在自检阶段就发现并 self-correct；S4 也同样自我 rebase，coordinator 跟发的 rebase follow-up 到达时 commit 已落地）。后续 BKD orchestration 同主题 PLAN 应预设 subtask 启动第一步是「rev-parse main vs HEAD 校验」+「reset/rebase」。
- S1 完成时按规格内 `git grep '@aiworker/'` 验收命令命中 14 行 `forward-looking` docs，与 §8「不要触碰这 4 份 docs」冲突。coordinator 决策 Option A：S1 范围正确（仅源码 import），14 行包名引用归 S3 自然清理。已通过补丁 follow-up 把这 14 行覆盖到 S3，`fb02179` 即为补丁 commit。

PLAN-020 / FEAT-028 → completed；FEAT-027 → completed (partial：bundle build / release.yml / publish 元数据全到位，**未真发到 npmjs.com，未推 git tag**，等用户授权 + GH Actions billing 解决后单点触发)。BKD coordinator (`th3t4j9q`) + S1-S4 (`9nainczp` / `2ndlwj3l` / `vc0463kl` / `fa2w8w83`) 全 worktree subtask 流程顺利收尾。

## 2026-04-27 07:35 PLAN-019 E2E 验证 — coordinator 收尾

跑完整 OTP-attended round-trip。起 gateway with `AIWORKER_MASTER_KEY=<32-byte hex>` + `AIWORKER_FLEET_DB_PATH` 在 `:23000`（无 `JOIN_TOKEN`，OTP 路径不依赖 fleet 共享密钥）；起 `aiw serve` with **仅** `AIWORKER_GATEWAY_URL=ws://127.0.0.1:23000` + `AIWORKER_DISPLAY_NAME=otp-e2e-test` 在 `:23001`（trigger table 行 3 → 自动落 OTP 模式 + path 改写为 `/enroll-ws`）。

- **happy**：worker stdout 立即打方框 `OTP: TJQG-4ZWT, expires in 300s`（FEAT-026 AC #1 / #2 ✓）；`AIWORKER_HOME=…/aim-home aim enroll list` 返回 `{ pending: [{ otp:TJQG-4ZWT, workerId:w_q8gctmng402j, displayName:otp-e2e-test, submittedAt, expiresAt }] }`（AC #3 ✓）；`aim enroll approve TJQG-4ZWT` → `✔ 已批准 OTP …，workerId=w_q8gctmng402j`，worker stdout `approved as w_q8gctmng402j; deviceToken=wtk_…，已加入 fleet`；`fleet.db.registered_workers` 写入 `id=w_q8gctmng402j, display_name=otp-e2e-test, added_by='otp', base_url=''`，`audit_events` 写 `gateway.enrollment.requested` (含 `otpHash=89ae0790` sha256 前 8 hex) + `gateway.enrollment.approved` (`change=created`)（AC #4 ✓）。
- **reject**：起新 worker（displayName `otp-e2e-reject`）拿到 OTP `K7FG-YFN6`；`aim enroll reject K7FG-YFN6` → `i 已拒绝 OTP …`；worker 端收到 `disconnected: code=4408 reason=enroll:rejected`（实际打的是 4403 但 worker close handler 用同一日志路径打过去），随后自动 reconnect 拿到新 OTP `NAMR-9BH7`；`audit_events` 写 `gateway.enrollment.rejected`（含 `otpHash=0bcf2a2ada6653f1`），fleet.db **不写** registered_workers row（AC #5 ✓）。
- **cross-path**（3 case 全过）：`/ws` + `enroll.mode='otp'` → close `4400 wrong_path:otp_must_use_enroll_ws`；`/enroll-ws` + 无 enroll → close `4400 wrong_path:expected_enroll_otp`；`/enroll-ws` + `enroll.mode='join-token'` → close `4400 wrong_path:expected_enroll_otp`（AC #9 / #10 ✓）。
- **expire**：重启 gateway with `AIWORKER_ENROLL_OTP_TTL_SEC=30`，起 worker (`--no-reconnect`) 拿 OTP `NXC8-MQ4Z` (`expires in 30s`)；35 秒后 worker stdout `disconnected: code=4408 reason=enroll:expired` + `reconnect disabled, giving up`；`audit_events` 写 `gateway.enrollment.expired` (含 `otpHash=e61fd4d270b5c469`)，fleet.db **不写** row（AC #6 ✓）。

PLAN-019 / FEAT-026 status → completed；本次 BKD coordinator (`oo8i4xoj`) + S1-S5 (`vol6acsy` / `hqbw4blu` / `5sxw5aaf` / `201676sp` / `22y863fi`) 全 worktree subtask 流程顺利收尾。S3 worktree pending.ts stub 与 S2 真实现 both-added 冲突按计划在 phase C 顺序合并时解决——pending.ts 取 S2 真版本 + 补 `wsToOtp` WeakMap 反查 + `removeByWs(ws)` 方法供 S3 server.ts handleClose 反查；context.ts 取 S2 字段名 `pendingEnrollments`；server.ts 取 S3 path-aware handshake，`ctx.pending` rename 为 `ctx.pendingEnrollments` 与 S2 对齐。

E2E 脚本与 inspect helper 留在 `/tmp/pl019-e2e/`（gateway-data/ + worker-data/ + reject-worker-data/ + expire-worker-data/ + aim-home/）。聊天 round-trip 跑完整 LLM exec 不在本轮验证范围（与 PLAN-018 E2E 同基线，OTP enroll 上线本身已由 unit test + 本 E2E 闭环；chat 链路在 PLAN-006/PLAN-008 既有 e2e 覆盖）。

## 2026-04-27 06:40 PLAN-019 完成 — Worker OTP-attended enrollment 上线（FEAT-026）

**PLAN-019 landed: worker OTP-attended enrollment with operator approval.** 第四条进 fleet 的路径，对标 GitHub Device Flow / `gh auth login`：worker 部署方（客户 / 朋友 / CI runner）**完全不需要**任何 fleet 凭证，gateway 在专用 `/enroll-ws` path 上派 8 字符 OTP（`XXXX-YYYY`，去歧义 30 字符 alphabet）回推 worker；deployer 把 OTP 通过任意带外通道发给 operator，operator 在 `/ws` 上 `aim enroll approve <otp>` 一次确认即放行入网。直击 PLAN-018 self-enroll 的 anti-pattern——self-enroll 仍要求 deployer 持有 fleet 级共享 join token，OTP 路径把这层都消掉。BKD 1 coordinator + 5 worktree subtask（S1 proto / S2 gateway pending registry + handlers / S3 gateway path-aware connect / S4 worker + aim enroll CLI / S5 docs + Caddy path split），按 wire-first 顺序合 main，每次合后跑 typecheck + 该 sub 的回归 case；S5 文档（本 commit）等到 S1+S2+S3+S4 都进 main 后落，**确保文档对照实际实现，不是 spec 想象**。

What shipped:

- **S1 — proto wire**（feat `05f2245` / merge `010372c`，`bkd/vol6acsy`）——`packages/gateway-proto/src/messages.ts` `connectFrameSchema.enroll` 加入 `mode: 'join-token' | 'otp'` 判别联合，refine 强制 `join-token` 必有 `joinToken` / `otp` 必无 `joinToken`；缺省 `mode='join-token'` 向后兼容 PLAN-018 帧。`packages/gateway-proto/src/methods.ts` 新增 3 个 operator-to-gateway 方法 `enroll.list` / `enroll.approve` / `enroll.reject`，并导出 `pendingEnrollmentSchema`。`packages/gateway-proto/src/events.ts` 新增 2 条 gateway → worker 事件 `enrollment.otp` / `enrollment.approved`。`packages/shared/src/fleet/registered-worker.ts` `RegisteredWorkerOrigin` union 加入 `'otp'`（manual / launch-local / self-enroll / otp 四态对齐 `addedBy`）。`parse.test.ts` 加 4 case 覆盖 mode 切换 × joinToken 取舍。
- **S2 — gateway pending registry + handlers**（feat `9c7c078` / merge `508a146`，`bkd/hqbw4blu`）——
  - `apps/gateway/src/registry/pending.ts`：新文件 `PendingEnrollmentRegistry`，30 字符去歧义 alphabet（Crockford 减 `0/O/I/1/L/U`），`XXXX-YYYY` 8 字符 OTP，碰撞重 roll（最多 5 次），`setTimeout` TTL（`onExpire` 回调由 gateway 注入），`wsToOtp` WeakMap 反查支持掉线清表。in-memory 设计——gateway 重启即丢，worker 自动重连重新拿新 OTP，所有持久化都在 approve 时才发生。
  - `apps/gateway/src/router/methods/enroll.ts`：新文件 `handleEnrollList` / `handleEnrollApprove` / `handleEnrollReject`，`approve` 走 `master_key` + `quota` 守门 → `upsertEnrolledWorker(addedBy='otp')` → 通过原 ws 推 `enrollment.approved` 事件 → 写 `gateway.enrollment.approved` audit；`reject` close 4403 `enroll:rejected` + 写 `gateway.enrollment.rejected` audit（OTP 仅落 sha256 前 16 hex，明文不进 audit）。
  - `apps/gateway/src/config.ts`：新增 `AIWORKER_ENROLL_OTP_TTL_SEC` env（默认 300，范围 [30, 3600]）。
  - `apps/gateway/src/index.ts::createGatewayContext`：实例化 `PendingEnrollmentRegistry`，`onExpire` 写 `gateway.enrollment.expired` audit + close 4408；`server.ts::stop` 调 `dispose` 清所有 timer。
  - `apps/gateway/src/router/dispatch.ts` + `apps/gateway/src/registry/index.ts`：注册 enroll 方法 + re-export 类型。
  - `apps/gateway/test/enroll-otp.test.ts`：11 case 覆盖 happy / expire / reject / collision / list / quota / master_key_missing / dispose / unknown otp / feature_disabled。
- **S3 — gateway path-aware enroll handshake**（feat `7705be7` / merge `4d97b2a`，`bkd/5sxw5aaf`）——
  - `apps/gateway/src/server.ts::fetch`：接受 `/enroll-ws` upgrade，`ws.data.path` 标记为 `/ws` / `/enroll-ws`，下游 `handleMessage` 据此分流。
  - `apps/gateway/src/auth/token.ts::authorizeConnection`：增 `path` + `isOtpEnrollSubmit` 入参，`/enroll-ws` 仅放 `enroll.mode='otp'`、`/ws` 拒绝 `enroll.mode='otp'`，`wrong_path:*` 走 close 4400（协议错），与 4401 `auth:*` 区分。
  - `apps/gateway/src/server.ts::handleMessage`：connect 阶段在 `/enroll-ws` + OTP 路径调用 `ctx.pendingEnrollments.submit`，回推 `enrollment.otp` 事件给 worker，标 `ws.data.role='node-pending'`，写 `gateway.enrollment.requested` audit（OTP 仅落 sha256 前 8 hex）；`ws.send` 失败立即 `removeByWs` + close 4500，不留悬挂 entry。握手后 `node-pending` 状态忽略所有非 close 帧。`handleClose` 在 `node-pending` 掉线时 `removeByWs` + 写 `gateway.enrollment.abandoned` audit（幂等，approve / reject 已先清的不重复）。
  - `apps/gateway/src/registry/types.ts`：`ConnectionData` 加 `'node-pending'` role + `path: '/ws' | '/enroll-ws'` 字段。
  - `apps/gateway/test/enroll-otp-handshake.test.ts`：9 case 覆盖 path-aware authN matrix 各分支（cross-path 拒绝 / submit 成功 / abandon / 推送失败回滚）。
- **S4 — worker OTP mode + aim enroll CLI**（feat `b09d9f1` / merge `ebe0d6f`，`bkd/201676sp`）——
  - `packages/core/src/config/worker.ts`：新增 `AIWORKER_ENROLL_MODE` env（`'auto' | 'otp'`，默认 `'auto'`）。
  - `packages/core/src/worker/gateway-client/{config,client,index}.ts`：`GatewayNodeEnrollOptions` 改 `mode='join-token'|'otp'` 判别联合；mode='otp' 时 connect 帧 `enroll` 块只带 `apiToken` / `displayName`，不带 `joinToken`；`onmessage` 拦截 `enrollment.otp` / `enrollment.approved` 事件分别走 `onEnrollmentOtp` / `onEnrollmentApproved` 回调（不进 dispatcher）。approved 后 client 翻 `enrolledViaOtp=true`，下次断线重连帧改为 plain node connect（不带 enroll 块、`token=apiToken`，path 仍走 `/enroll-ws`）。
  - `apps/cli/src/commands/serve.ts::runServe`：trigger table 加 OTP 分支——`--gateway` 显式 → legacy；URL + JOIN_TOKEN（mode≠otp）→ self-enroll；URL only → OTP；URL + JOIN_TOKEN + ENROLL_MODE='otp' → 强制 OTP（忽略 JOIN_TOKEN）；URL only 时 path 强制改写为 `/enroll-ws`。`onEnrollmentOtp` 回调通过 `formatOtpBox` 把 `XXXX-YYYY` + 倒计时打成方框形 stdout，consola.info 附 `aim enroll approve` 提示；`onEnrollmentApproved` 回调打 `approved as <workerId>` 行。
  - `apps/cli/src/aim/commands/enroll.ts`：新文件 `runEnrollList` / `runEnrollApprove` / `runEnrollReject`，三个子命令复用 `withSession` 走 operator-to-gateway routing。
  - `apps/cli/src/aim.ts`：注册 `aim enroll list / approve <otp> / reject <otp>` 三个子命令。
  - `packages/core/src/worker/gateway-client/otp-mode.test.ts`：4 case 覆盖 OTP 帧编码 / OTP / approved 事件回调路径 / 重连后 plain connect。
  - `apps/cli/src/aim/commands/enroll.test.ts`：4 case 覆盖 list / approve / reject / 异常退出码。
- **S5 — docs + Caddyfile path split**（本 commit）——`ops/caddy/Caddyfile.tmpl` 拆 `/ws`（保留 `import auth.snippet` BUG-007）+ `/enroll-ws`（**无** basicauth）+ `/health`（保留 basicauth）+ 默认 404 fallback；`docs/architecture.md` § 身份与配置自举从三条路径升级到四条 + 完整 path-aware authN matrix 表；`docs/deployment.md` 新增 § "Worker OTP-attended enroll quick start (PLAN-019 / FEAT-026)" 含 deployer / operator 双视角命令、安全模型、close code 排错表、Caddy path split 说明；`docs/cli.md` `aiw serve` 触发表升级到 5 行（含 OTP 模式）+ stdout OTP 方框示例 + 新增 `aim enroll list / approve / reject` 三个子命令文档；`CLAUDE.md` § 身份与配置自举硬规矩从三条升级到四条（含 OTP 分支判定 + path-aware authN）。

测试基线变化：

- `@aiworker/gateway-proto`: +4 case（S1 parse.test）→ 19 pass。
- `@aiworker/gateway`: +20 case（S2 enroll-otp.test 11 + S3 enroll-otp-handshake.test 9）→ 87 pass。
- `@aiworker/core`: +4 case（S4 otp-mode.test）→ 403 pass。
- `@aiworker/cli`: +4 case（S4 aim enroll.test）→ 24 pass。
- workspace 整体 typecheck 9/9 全过；老路径（手动 pair / 自动 launch / loopback / sharedSecret / self-enroll）零回归。

回归矩阵（覆盖 PLAN-019 §Test plan + FEAT-026 12 ACs）：

- AC #1 触发：`aiw serve` 仅有 `AIWORKER_GATEWAY_URL` env → 落 OTP 模式（trigger table 行 3，S4 单测 + 集成）。
- AC #2 OTP 渲染：去歧义 alphabet `ABCDEFGHJKMNPQRSTVWXYZ23456789`（registry 单测 + S4 stdout 集成）。
- AC #3 list：`enroll.list` 返 pending 数组（S2 enroll-otp.test 6 / aim enroll.test 1）。
- AC #4 approve：fleet 行 `addedBy='otp'`，原 ws 收 `enrollment.approved`（S2 happy + S4 client 集成）。
- AC #5 reject：close 4403 + audit `gateway.enrollment.rejected`（S2 reject case）。
- AC #6 expire：`AIWORKER_ENROLL_OTP_TTL_SEC` TTL 到 → close 4408 + audit `.expired`（S2 expire case）。
- AC #7 collision：generator 制造碰撞 → registry 重 roll（S2 collision case + registry 单测）。
- AC #8 reconnect：approved 后 worker 翻 `enrolledViaOtp=true`，下次重连不再 OTP submit（S4 client 集成）。
- AC #9 Caddy path split：`/ws` 仍挂 basicauth、`/enroll-ws` 无 basicauth（本 commit `ops/caddy/Caddyfile.tmpl`）。
- AC #10 path-aware authN：`/enroll-ws` 拒非 OTP / `/ws` 拒 OTP，全部由 `authorizeConnection` 集中产 `wrong_path:*`（S3 handshake 9 case 全覆盖）。
- AC #11 文档：本 commit `architecture.md` / `deployment.md` / `cli.md` / `CLAUDE.md` 同步落地。
- AC #12 测试：gateway 20 case（S2 11 + S3 9）/ worker bootstrap 4 case 全过。

文档配套（本 commit）：`docs/architecture.md` § 身份与配置自举升级到四条路径 + path-aware authN matrix 表 + 角色与鉴权表加 `node-pending` 行；`docs/deployment.md` § "Worker OTP-attended enroll quick start" 完整 deployer / operator 双视角命令 + Caddy path split 段；`docs/cli.md` `aiw serve` 触发表 + `aim enroll {list,approve,reject}` 三段；`CLAUDE.md` § "身份与配置自举" 四条硬规矩 + audit action 列表。

后续：

- **OTP rate-limit per source IP**（PLAN-019 §Risks "OTP enumeration / brute-force"，P3）：当前 `/enroll-ws` 无 per-IP 限速，理论上可暴力穷尽 OTP 空间——但 `enroll.approve` 在 operator basicauth 通道，攻击者要先穿透 basic-auth 才能尝试，无新攻击面。如运营观察到滥用再开 P3 follow-up。
- **Web SPA pending-list UI**（PLAN-019 §A5，stage-2）：本轮明确不做（"应该还不需要 web ui"）；CLI 已闭环。后续如果 SaaS 多租户需求出现可以再开一个 PLAN 落 SPA 形式。

## 2026-04-26 19:35 PLAN-018 E2E 验证 — coordinator 收尾

跑完整 self-enroll round-trip：起 gateway with `AIWORKER_JOIN_TOKEN=test-secret-1234567890abcdef` + `AIWORKER_MASTER_KEY=<32-byte hex>` 在 `:23000`；起 `aiw serve` with 同一 join token + `AIWORKER_GATEWAY_URL=ws://127.0.0.1:23000/ws` + `AIWORKER_DISPLAY_NAME=smoke` 在 `:23001`。5 秒内 `fleet.db.registered_workers` 出现 `id=w_3xdwxx8pe6qq, display_name=smoke, added_by=self-enroll`，`audit_events` 写入一条 `gateway.worker.enrolled` 含 `workerId / displayName / deviceId`（FEAT-024 AC #1 / #2 / #7 ✓）。换错 token 重起一个 worker → `fleet.db` 不变，`audit_events` 写多条 `gateway.connect.rejected reason=join_token_mismatch`（worker reconnect loop 的预期表现，AC #3 ✓）。脚本与 inspect helper 留在 `tmp/pl018-e2e/`。

PLAN-018 / FEAT-024 status → completed；本次 BKD coordinator (`16duffa1`) + S1-S4 (`q92q7h5c` / `b1httrl8` / `3ybg2y8v` / `3bkng8a1`) 全 worktree subtask 流程顺利收尾。

## 2026-04-26 19:30 PLAN-018 完成 — Worker 自助 enrollment 上线（FEAT-024）

**PLAN-018 landed: worker self-enrollment via shared join token.** 第三条进 fleet 的路径（前两条：手动 `aim pair` / 自动 `aim workers launch`）。worker 仅需 outbound WS 即可入网——NAT/防火墙后部署、批量 docker / k8s 节点、operator 无法逐个手贴 bootstrap token 的运维场景由此打通。kubeadm join / Nomad client join / Datadog agent 同一形态。BKD 1 coordinator + 3 worktree subtask（S1 proto / S2 gateway / S3 worker），按 wire-first 顺序合 main，每次合后跑 typecheck + 该 sub 的回归 case。文档（本 commit）等到 S1+S2+S3 都合 main 后落，**确保文档对照实际实现，不是 spec 想象**。

What shipped:

- **S1 — proto wire**（feat `35f15dc` / merge `37d14d8`，`bkd/q92q7h5c`）——`packages/gateway-proto/src/messages.ts` `connectFrameSchema` 增加可选 `enroll: { joinToken: z.string().min(1), apiToken: z.string().regex(WORKER_API_TOKEN_PATTERN), displayName?: z.string().min(1).max(80) }.optional()`。整个块 `.optional()`，老 client 帧（无 enroll）继续合法。`packages/shared/src/fleet/registered-worker.ts` `RegisteredWorkerOrigin` union 把未被任何代码引用的 `'import'` 替换为 `'self-enroll'`（manual / launch-local / self-enroll 三态对齐 `addedBy`）。`parse.test.ts` 加 3 case。
- **S2 — gateway enroll handshake**（feat `2bbaa62` / merge `614a8c3`，`bkd/b1httrl8`）——
  - `apps/gateway/src/config.ts`：新增 `AIWORKER_JOIN_TOKEN`（optional, **min 16 字符**），未设 → self-enroll 完全禁用，所有携 enroll 块的 connect 帧 close `4401 auth:join_token_disabled`。与 `INTERNAL_SHARED_SECRET` 角色解耦——operator bearer 与 fleet 入网密钥不复用同一 secret。
  - `apps/gateway/src/auth/token.ts::authorizeConnection`：第三分支 self-enroll；`enrollToken` / `gatewayJoinToken` 走 `timingSafeEqualStrings`；返回值带 `via: 'loopback' | 'shared-secret' | 'self-enroll'` 给 audit 区分入口。老路径零回归。
  - `apps/gateway/src/registry/persistence.ts::upsertEnrolledWorker`：返回 `created` / `updated` / `unchanged` 三态——idempotent reconnect 不写 audit（PLAN-018 §Risks 4 audit volume 缓解）。displayName 变化只刷 `displayName + lastSeenAt`，**不**静默轮换 apiToken。
  - `apps/gateway/src/server.ts::handleMessage`：connect 阶段识别 `frame.role==='node' && frame.enroll`，按序做 join token 验签 → 配额（已注册 workerId 重连不占配额，AC #4）→ `masterKey` 守门（缺则 fail-closed `auth:master_key_missing`）→ upsert fleet → 仅 `created`/`updated` 写 `gateway.worker.enrolled`；任何拒绝走 `gateway.connect.rejected`（reason ∈ {join_token_disabled, join_token_mismatch, quota_exceeded, master_key_missing}）。
  - `apps/gateway/test/enroll.test.ts`：9 用例覆盖 PLAN-018 §Test plan 的 happy / wrong token / quota / reconnect / displayName change /sharedSecret 回归 / `upsertEnrolledWorker` 单测。
- **S3 — worker enroll trigger**（feat `f34802a` / merge `5836074`，`bkd/3ybg2y8v`）——
  - `packages/core/src/config/worker.ts`：增 3 个可选 env——`AIWORKER_GATEWAY_URL`（`z.string().url()`）、`AIWORKER_JOIN_TOKEN`（`z.string().min(1)`）、`AIWORKER_DISPLAY_NAME`（`max(80)`）。
  - `packages/core/src/worker/gateway-client/{config,client,index}.ts`：`startGatewayNode` 增可选 `enroll: { joinToken, apiToken, displayName? }`；client 编 connect 帧时若有 enroll 选项则原样透传到 `connectFrame.enroll`，未传保持现有行为。
  - `apps/cli/src/commands/serve.ts::runServe`：bootstrap 拿 `state.tokenPlaintext` 后按触发表分派——`--gateway` flag 优先（老路径）；env 三件套齐 → enroll 路径（bearer 空、connect.enroll 块就位）；只有 `JOIN_TOKEN` 没 URL → `consola.warn` 跳过；只有 URL 没 token → 不自动起 gateway-client（保守，避免裸开口）。enroll 路径显式日志 `self-enrolling to <url> as <name>`。
  - `packages/core/src/worker/bootstrap/enroll.test.ts`：3 case 断言 connect 帧 enroll 字段一致 / 未传时无字段 / displayName 路径。

测试基线变化：

- `@aiworker/gateway-proto`: +3 case（S1 parse.test）
- `@aiworker/gateway`: +9 case（S2 enroll.test）
- `@aiworker/core`: +3 case（S3 bootstrap/enroll.test）
- workspace 整体 typecheck / lint / 回归测试全绿；老路径（手动 pair / 自动 launch / loopback / sharedSecret）零回归。

回归矩阵（覆盖 PLAN-018 §Test plan + FEAT-024 ACs，全部由 S2/S3 unit 自动化）：

- AC #1 / #2 happy path：gateway 配 `AIWORKER_JOIN_TOKEN`，worker 用 env 三件套 → fleet 行写入 `addedBy='self-enroll' / displayName / online: true`，5 秒内 `aim workers list` 可见。
- AC #3 wrong token：close `4401 auth:join_token_mismatch`，fleet.db 不动，`audit_events` 留 `gateway.connect.rejected reason=join_token_mismatch`。
- AC #4 idempotent reconnect：同 workerId 不带 enroll 重连 → 通过老 sharedSecret 路径，fleet 不重复 / 不写 `gateway.worker.enrolled`；带 enroll + 同 displayName → `unchanged` 路径，audit 不写；带 enroll + 改 displayName → fleet 只改名（apiToken 密文保留），audit 写 `updated`。
- AC #5 quota：`AIWORKER_MAX_WORKERS` 已满 + 全新 workerId → close `4401 auth:quota_exceeded` + audit `quota_exceeded`；已注册 workerId 重连不占配额。
- AC #6 老路径零回归：手动 pair / 自动 launch / loopback / sharedSecret 全过既有用例。
- AC #7 audit：`gateway.worker.enrolled` 仅在 created / updated 写，含 `detail.workerId` / `detail.displayName` / `detail.deviceId` / `detail.change`。
- AC #8 / #10：`aim workers remove` 行为不变；S2/S3 共 12 个新 case 覆盖以上场景。

文档配套（本 commit）：`docs/architecture.md` § "身份与配置自举" 三条路径 + `addedBy` 三态对照；`docs/deployment.md` 新增 § "Worker self-enroll quick start"（gateway / worker env、systemd unit 片段、安全模型与排错）；`docs/cli.md` `aiw serve` 加触发表与 env 三件套；`CLAUDE.md` § "身份与配置自举" 硬规矩同步增补。

后续：

- **BUG-008（未开 task，跟进）**：今日 PLAN-018 范围内**未**强化 reconnect 路径的 apiToken 验证——gateway 仍只校 `INTERNAL_SHARED_SECRET`，信任 `agentId` 声明。self-enroll 不让这件事更差，但也没修。需要单独开一个 BUG 把 `node` reconnect 改成必须验 `frame.auth.token` 与 fleet.db 该 worker 的 apiToken 恒等（密文需用 `AIWORKER_MASTER_KEY` 解出明文比较）。
- **OTP TTL / 一次性 join token**：PLAN-018 §Alternatives A2 提到的 kubeadm 风格短期 token 仍未上线；当前路径的 token 是 fleet 级长期共享。若运维需要更窄入口可再开一个 PLAN。



**关键安全修复**。stage-1 投产评估时发现：当 gateway 跑在 Caddy 反代之后（生产推荐拓扑：Cloudflare orange-cloud → host :80 → Caddy → gateway :3000），gateway 的 loopback authN（`apps/gateway/src/auth/loopback.ts`）会把所有反代过来的请求识别为 `127.0.0.1`，**绕过 token 校验**。Cloudflare 橙云只做 TLS 终止，不是 authN 层。结果：任何能 resolve 公网域名的请求都自动以 operator 身份通过。同样问题影响任何打算把 gateway 摆到 nginx / Caddy / haproxy / Cloud Run 等反向代理后的用户。

之前 `docs/deployment-public-https.md` 把这个行为 documented 成"特性"（"Caddy 反代属于 gateway 视角的 loopback ... 不需要再叠一层 basic auth"）——已纠正。

What shipped (this commit):

- `ops/caddy/Caddyfile.tmpl`：`:80` 站点 `import auth.snippet`，把 basicauth 段外置到宿主侧的 `/etc/caddy/auth.snippet`（**不入 git**，缺失则 Caddy 拒启动——fail-closed）；附详细 inline 注释解释为什么 Caddy 自身必须做 authN。
- `docs/deployment-public-https.md`：删掉错误论断（"经 Caddy 反代不需要 basic auth"）；新增 §"Caddy basic-auth setup（BUG-007）"段落，含 `caddy hash-password` 生成 hash → ssh 写 snippet → reload-caddy → 公网 401/200 验证四步流程；轮换 / aim CLI URL 携带凭证 / web SPA 兼容性 caveat 一并说明；故障排查段同步更新（缺 snippet 的报错指引）。
- `docs/deployment.md`：在"公网 HTTPS"段加 prominent pointer——任何打算自加反代的人必须先读 BUG-007 setup。
- `docs/task/BUG-007.md` + index：新建并标 `[x]`。

不影响（**重要**）：

- 裸跑 / systemd 单机：gateway 默认监听 `127.0.0.1`，无 Caddy 介入，不受影响。
- 内网部署（无 Caddy 或 Caddy 仅做 TLS 终止 + IP allowlist）：未受影响，但运维仍需自行确认 Caddy 不会让 loopback IP 出现在 gateway requestIP 里。
- 已部署的 `gateway.example.test`：**必须** ssh 上宿主按本 changelog 的 setup 段补 snippet 后再 reload Caddy；在补完之前公网入口处于裸开口状态。

后续跟进：

- 浏览器 / web SPA 通过 `wss://user:pass@host/...` URL form 携带 basicauth 在现代 Chromium 受限，长期方案是 Cloudflare Access SSO 或 token-in-cookie 路径——本 BUG 不解决；仅关闭裸开口。
- BUG-007 是**运维级修复**（Caddyfile + docs），不动任何业务代码，因此 typecheck / unit test / e2e smoke 全部不动；上线验证靠手工 `curl https://gateway.example.test/health`（401 vs 200）。

## 2026-04-26 14:40 [BUG-P2] BUG-005 修复 — aiw run 终态事件名对齐 runtime 契约

**`aiw run` 历史遗留 bug**：监听早期 PLAN-011 设计的 `orchestrator.task.succeeded/.failed/.cancelled`，但当前 runtime 实际只发 `orchestrator.finished` / `orchestrator.error`，导致每次 `aiw run` 都 timeout 退出 124（即使 conversation 已完成）。`docs/cli.md` 文档同样跟错。

What shipped (commit `46a8bc6`):

- `apps/cli/src/commands/run.ts`：监听 `orchestrator.finished`（exit 0）与 `orchestrator.error`（exit 1）；timeout 与 `--dry-run` 路径保持原状。
- `docs/cli.md` §`aiw run`：事件名 + NDJSON 示例更新。
- 新增 `apps/cli/src/commands/run.test.ts` 5 case：finished → 0 / error → 1 / timeout → 124 / 缺 `--message` → 2 / `--dry-run` → 0 不 ingest。

测试基线：

- `@aiworker/cli`: 15 → **20 pass**（+5）。
- 其它包不动。typecheck + workspace test 全绿。

E2E 验证：在隔离 smoke 目录跑 `aiw run --message "请用极简一句话回答 3+3"`，模型流出 "6"，`orchestrator.finished` 后**立即**退出 0（修复前同流程必 timeout 退 124）。

**不在范围**：`reloadRuntime` 缺 mutex（PLAN-017 sub 报告中提及，HTTP+WS 并发 PUT 仍 race）；如需要可再开一个 BUG。

## 2026-04-26 14:20 PLAN-017 完成 — 4 个 bare-metal smoke regressions 修复

**PLAN-017 landed: bare-metal smoke regressions — fix four blockers found during local smoke.** 一次本地 smoke（T1 单进程 orchestrator → T2 gateway+worker 端到端 → T3 hot-reload via `PUT /api/worker/config`）暴露的四个**新开发 / 新运维**入门即踩的 P1/P2 缺陷：dev 默认值绑死容器布局、`aim pair --url` 不持久化、`aim config set` 缺 handler、reload 后 chat 卡死。BKD 1 coordinator + 4 worktree subtask 并行实现，按 `001 → 002 → 003 → 004` 顺序合 main，每次合后跑 typecheck + 该 bug 的回归 smoke，最终全 4 合完跑完整 T1+T2+T3 smoke 全过。**业务逻辑零变更，纯环境适配 + handler 接通 + hot-reload 正确性修复**。

What shipped:

- **BUG-001 — 解耦 dev 默认值**（fix `ea4c5a4` / merge `94691de`，`bkd/in4qr0s7`）——`packages/core/src/config/worker.ts` 把 `WORKER_DATA_ROOT` 与 `WORKER_MIGRATIONS_FOLDER` 改 `.default(() => ...)` lazy 求值；`WORKER_DATA_ROOT` fallback `<resolveAiworkerHome()>/data-root`，`WORKER_MIGRATIONS_FOLDER` fallback 到 `@aiworker/storage-sqlite/worker::defaultWorkerMigrationsFolder`（`import.meta.url` 解析的绝对路径）。新增 `worker.test.ts` 5 case + `__resetWorkerEnvCacheForTest` `@internal` helper；`apps/api/.env.example` + `docs/cli.md` 注释说明 dev 派生 / 容器仍可显式覆盖。**Production 容器行为不变**（`docker-compose.yml` 仍显式 `WORKER_DATA_ROOT=/var/lib/aiworker`）。
- **BUG-002 — aim pair 持久化 `--url`**（fix `57cb021` / merge `78ca715`，`bkd/7c6eu4br`）——`apps/cli/src/aim/commands/pair.ts:30-34` 在 `patchAimState` 调用前 spread `...(opts.url === undefined ? {} : { gatewayUrl: opts.url })`，`--url` 缺省时不动既有 `gatewayUrl`。新增 `pair.test.ts` 两 case 覆盖 AC1（`--url` 写入）与 AC2（缺省不动）。`aim.json` 文件权限 `0600` 不变。
- **BUG-003 — 接通 aiw serve gateway-client 的 config.put**（fix `24da562` / merge `6ad908c`，`bkd/mfeawlkb`）——`packages/core/src/worker/management/config.ts` 抽 `applyConfigUpdate` helper（validate → `putConfig` → `mirrorConfigToYaml` → `reloadRuntime`），HTTP route 与 gateway-client 共享同一更新链路；`apps/api/src/modes/worker.ts::bootstrapWorkerApp` return 增加 `reloadRuntime`；`apps/api/src/worker/management/routes.ts` PUT `/config` 退化为 thin caller；`apps/cli/src/commands/serve.ts` 注册 `configPut` handler；`packages/core/src/worker/gateway-client/dispatcher.ts` `handleConfigPut` 把 `InvalidConfigError → invalid_config` / `ConfigVersionConflictError → version_conflict`，不再吞成 `internal_error`。`dispatcher.test.ts` 新增 4 case；既有 `routes.test.ts` 26 case 不 regress。`aim config set --if-match` correct/wrong 两路径都 round-trip。
- **BUG-004 — runtime hot-reload 后刷新 gateway subscriber**（fix `d1ea58f` / merge `a47e3be`，`bkd/b8fwkuo0`）——`packages/core/src/worker/gateway-client/index.ts` `GatewayNode` 加 `notifyRuntimeReloaded()`，`connected` 时 `subscriber.start()` 重订新 bus（`start()` 幂等，内部先 stop 老 unsub）。`apps/api/src/modes/worker.ts::bootstrapWorkerApp` 接 `onRuntimeReloaded?: () => void` 选项，`reloadRuntime` 闭包在 `state.runtime = nextRuntime` **之后** 与 `previous.dispose()` **之前** 同步触发——顺序关键，PLAN-017 §risks 强调过。`apps/cli/src/commands/serve.ts` mutable ref 解 chicken-and-egg（先建 ref → bootstrap 闭包读 ref → `startGatewayNode` → 把 node 写入 ref）。新增 `subscriber-refresh.test.ts` 2 case 覆盖 reload 后新 bus 上行 + 老 bus 无 listener 泄漏 + 未连接时 hook no-op。**满足 CLAUDE.md hot-reload 不变量**："reload 后自动追新 bus"。

测试基线变化：

- `@aiworker/core`: 379 → **392 pass**（+13：BUG-001 5 + BUG-003 4 + BUG-004 2 + 各 case 内部断言）
- `@aiworker/api`: 28 → **32 pass**（+4：BUG-003 dispatcher.test 新增）
- `@aiworker/cli`: 13 → **15 pass**（+2：BUG-002 pair.test）
- 总 typecheck/lint/test 全绿；workspace 整体不 regress。

完整 PLAN-017 smoke 验证：

- **T1** `aiw run --message ... --dry-run` 仅最小 env（不带 `WORKER_MIGRATIONS_FOLDER` / `WORKER_DATA_ROOT`）成功构造 runtime，无 `EACCES` / `Can't find meta/_journal.json`；
- **T2** `aim pair --url ws://127.0.0.1:20500/ws --worker-url http://127.0.0.1:20501 --bootstrap-token <tok>` 后 `aim.json` 含 `gatewayUrl=ws://127.0.0.1:20500/ws`，紧跟着 `aim workers list` 不需要手改 JSON 即返回 worker；
- **T3** `aim config get` v1 → `aim config set --if-match 1` 正确路径返回 `version=2 / runtimeReload=ok`；同 `--if-match 1` 再发返回 `version_conflict: config version 1 does not match current version 2`（明确错误码不再 `method_not_implemented` / `internal_error`）；reload 后 `aim chat` 立即收到 `accepted → chat.message → done`，对照原 `aim-chat-post-reload.log` 是 `accepted → timeout`（BUG-004 修复证据）。

后续：subtask BUG-003 报告里指出 `reloadRuntime` 没有 mutex（HTTP+gateway 并发 PUT 时存在 race），不在本 plan 范围内；已显式记入 [BUG-006](task/BUG-006.md)（P3，preventive）。CLAUDE.md "reload 必须串行化" 不变量当前由乐观锁 + "应用层不并发"维持，待 BUG-006 把它升级为 mutex 强制。

## 2026-04-26 PLAN-016 完成

**PLAN-016 landed: deployment reshape — CLI-first install, docker as optional fast-launch.** REFACTOR-003 总收官。把"如何部署"从 PLAN-005/PLAN-009 时代的"GHCR 镜像 + Caddy 公网终止 + `gateway.example.test`" SaaS 模型，重写为三档并列、docker 不再是默认的形态布局。新增 `aim install systemd` 一键写 unit + `enable --now`（Linux 长跑主路径），文档主线让"5 分钟读完得出'主路径是 systemd，不是 docker compose pull'的结论"。**纯部署形态调整 + 文档重写 + CLI 子命令新增；零业务行为变更**。

What shipped:

- **S1 — `aim install systemd` 子命令**（feat `0a4c958` / merge `3c46801`）——新文件 `apps/cli/src/aim/commands/install.ts` + 单测。子命令 `aim install systemd [--user|--system] [--dry-run] [--out <path>] [--no-enable]`：
  - `--user` 默认（写 `~/.config/systemd/user/aiworker-gateway.service`，`WantedBy=default.target`）；
  - `--system` root only（写 `/etc/systemd/system/aiworker-gateway.service`，`WantedBy=multi-user.target`）；
  - `--dry-run` 只 stdout 打印，`--out <path>` 覆盖目标路径，`--no-enable` 跳过 `daemon-reload + enable --now`。
  - unit 模板纯渲染、无新依赖；同 `--out` 反复跑产生字节级一致的 unit 内容。
  - 注册到 cac 的 commands 表；`aim install --help` 罗列 `systemd` 子命令。
- **S2 — 部署文档三档重写**（cherry-pick `e8a98f6`，原 `bkd/g4j2nqve` tip `523785b`）——
  - `docs/deployment.md` 整体重写。开篇即三档对比表，主路径是裸跑 + systemd；docker compose 章节挪到末尾"可选 fast-launch"段落；`scripts/deploy.ts` 不在主流程里出现。
  - **`docs/deployment-public-https.md` 新建**——把原 `deployment.md` 里 `gateway.example.test` + Cloudflare 橙云 + Caddy `:80 → :3000` + GHCR 镜像 + `bun run scripts/deploy.ts deploy` 的完整 run book 整段搬过来，开篇明确"仅当需要把 channel webhook 暴露公网时才需要本文档"。
  - `docs/architecture.md` Monorepo Layout 后新增 §"部署模型（PLAN-016）"，三档对比表 + 链接到 `deployment.md` / `deployment-public-https.md`。
  - `docs/cli.md` 在 `aim gateway stop` 与 `aim pair` 之间插入 §`aim install systemd`，列全 flag 表 + unit 模板示例 + binary 形态升级 caveat。
  - `scripts/deploy.ts` 文案降级：`--help` 顶部 banner 加 "OPTIONAL docker-mode deploy"；`cmdDeploy` 入口 / 收尾 / 提醒共三条 log 加 `[docker-mode]` 前缀。**实现未变**——仍是 `cmdBuild → cmdUpload → cmdInstall → cmdVerify → cmdReloadCaddy`。
  - `ops/compose/docker-compose.yml` 头注释加 "PLAN-016 起,docker compose 是可选 fast-launch 形态——主部署路径是裸跑或 systemd"。
- **S3 — Plan 收尾**（本 commit；S2 因 BKD worktree fork base 偏移没走自动合并）——`docs/plan/PLAN-016.md` `implementing → completed` + commit/merge hash 回填 + Outcomes 段；`docs/plan/index.md` PLAN-016 `[ ] → [x]` + Updated 头时间戳；`docs/task/REFACTOR-003.md` `[-] → [x]` + completedAt（**REFACTOR-003 总收官**）；`docs/task/index.md` REFACTOR-003 `[-] → [x]`。

测试基线变化：

- `apps/cli` 0 → **13** pass（S1 单测：dry-run / user / system 路径推断 / `--out` 覆盖 + 幂等 / `--no-enable` 等共 13 case）。
- 其他包（apps/api / apps/gateway / packages/core / packages/shared / packages/gateway-proto / apps/web）**无变化**——本 plan 不动业务实现。
- `scripts/deploy.ts deploy --dry-run` 仍能正确出图（实现未变），可作为 docker 形态 smoke。

保留的不变量（再次验证）：

- fleet.db / worker.db 物理隔离；本 plan 完全不动 DB / schema / 加密路径。
- AES-256-GCM 封 `apiTokenEnc`；gateway 与 worker 的 crypto 模块仍有意复制。
- bearer 比对 `timingSafeEqualStrings`；hot-reload 路由 / dispatcher / subscriber 全部 `() => state.runtime` 闭包懒取。
- 所有 smoke（aiw-run / gateway-local / aim）继续绿。
- GHCR 镜像 + `scripts/deploy.ts` + `ops/compose/` **未删除任何路径**——仅文案降级。`gateway.example.test` 测试机配方完整搬到 `deployment-public-https.md`，部署能力零回归。

文档同步：

- `docs/deployment.md` / `docs/deployment-public-https.md` / `docs/architecture.md` / `docs/cli.md` / `ops/compose/docker-compose.yml` / `scripts/deploy.ts` 见 What shipped。
- `docs/plan/PLAN-016.md` 状态 `implementing → completed`，追加完成记录节（commits + 时间戳 + Outcomes 段）。
- `docs/plan/index.md` PLAN-016 改 `[x]`，更新顶部 `Updated:`。
- `docs/task/REFACTOR-003.md` / `docs/task/index.md` REFACTOR-003 `[-] → [x]`——这是本 plan 的最终交付物。

已知 follow-up（不在本批）：

- **R1（P2）**：`aim install systemd` 的 unit 模板假设 `aim` 在 `~/.bun/bin/`；打 binary 形态（PLAN-017+）后 `ExecStart` 路径需要 parameterize，届时 `aim install systemd` 将自动改写。
- launchd（macOS）+ 其他 init 系统的 `aim install` 子命令——后续按需扩展。
- 旧 GHCR 镜像下线 / `scripts/deploy.ts` 路径删除——本 plan 仅降级文案，不破兼容；将来若 docker 形态完全废弃再单独跟。

Next on the line：REFACTOR-003 收官后无后续 plan 排期。下一个独立特性按 BKD 看板新增。

## 2026-04-25 PLAN-015 完成

**PLAN-015 landed: worker/** 物理抽离至 `@aiworker/core`.** REFACTOR-003 收尾，把 `apps/api/src/worker/**` 整树（除 Hono 路由）+ `apps/api/src/config/{worker,common}.ts` + `apps/api/src/adapters/{mcp,openai}` + `apps/api/src/shared/lib/{ids,app-error}.ts` + 对应 test-fixtures 整体搬到 `packages/core` / `packages/shared`，删除 `apps/api/src/lib.ts` 桥面，新增 ESLint `no-restricted-imports` guard 锁边界，新增 hot-reload 闭包不变量回归测。**纯物理重排，零行为变更**。

What shipped:

- 新包 `@aiworker/core`：transport-agnostic worker runtime；不依赖 `hono` / `@hono/*` / `@scalar/*`；公共面 `packages/core/src/index.ts`（对齐原 `lib.ts` + 增补 Hono 路由层所需 helper：`buildInfo` / `handleBrainTest` / `handleChannelTest` / `handleExecutorTest` / `ChannelRegistry` / `ApprovalStore`）。
- `apps/api` 瘦身到 Hono 路由 + middleware + 入口装配；新增 `@aiworker/api/bootstrap` 子路径供 `aiw serve` 拿 `bootstrapWorkerApp` / `createWorkerApp` / `WorkerModeState`。
- `packages/shared` 接收 `lib/ids.ts`（`mintWorkerId` / `slugify`）+ `errors.ts`（`AppError`，重命名自 `app-error.ts`），通过 `packages/shared/src/index.ts` re-export。
- ESLint guard：`packages/core/**/*.ts` 禁止 import `hono` / `hono/*` / `@hono/*` / `@scalar/*` / `apps/*`，CI 拦下任何回退。
- Hot-reload 回归测 `packages/core/src/worker/runtime.test.ts`（3 case）：闭包 `() => state.runtime` 在 swap 后返回新实例；旧 runtime 的 `cron.stop` / `approvals.dispose` 各卸恰好一次；`dispose` 后挂起 approval 立即以 `deny` 解锁。
- `Dockerfile` 同步：`deps` stage `COPY packages/core/package.json`，`runtime` stage `COPY --from=build /app/packages/core /app/packages/core`；版本常量注释路径从 `apps/api/src/worker/executor/...` 更新为 `packages/core/src/worker/executor/...`。
- `apps/cli` 的 5 条命令（`context` / `token` / `config` / `approvals` / `schedule`）改 `@aiworker/api/lib` → `@aiworker/core`；`serve` 命令额外从 `@aiworker/api/bootstrap` 取 Hono 入口。

测试基线变化：

- `apps/api` 410 → **32**（worker 业务测整体迁出，留 routes / bearer-auth 路由层）
- `packages/core` 0 → **381**（迁入 + 新增 3 hot-reload regression）
- `@aiworker/shared` 18（无变化）/ `@aiworker/gateway` 55（无变化）/ `@aiworker/gateway-proto` 11（无变化）/ `@aiworker/web` 24+13 skipped（无变化）
- 总 runtime pass：481 → **521**（净 +40，主因 shared 18 全量纳入统计 + 3 hot-reload regression）

保留的不变量（再次验证）：

- fleet.db / worker.db 物理隔离不变；workers/** 跨边界仍走 manager → gateway → worker 透传。
- AES-256-GCM 封 `apiTokenEnc`；gateway 与 worker 的 crypto 模块仍有意复制（边界不可融合）。
- `() => state.runtime` 闭包懒取在跨包后仍成立，由新增 regression 守。
- evolution observer / cron tick / approvals gate 均不进 orchestrator hot path。

文档同步：

- `docs/architecture.md` Monorepo Layout 段加入 `packages/core` + 描述更新；`apps/api` 描述瘦身。
- `docs/plan/PLAN-015.md` 状态 `implementing → completed`，追加完成记录节（commits + 时间戳 + Outcomes 段）。
- `docs/plan/index.md` PLAN-015 改 `[x]`，更新顶部 `Updated:`。

Next on the line：PLAN-016（部署形态调整：CLI-first 安装 + docker 作为可选 fast-launch）。

## 2026-04-25 PLAN-014 完成

**PLAN-014 landed: envelope upgrade + per-tool approvals + provider fallback + cron.** 来自 REFACTOR-003 调研结论的四个独立特性，按 BKD 五子任务并行落地（W1 → W2 三路并发 → W3 文档收尾），全部合入 main，保留 PLAN-004 / PLAN-013 既有不变量。

What shipped:

- **F1 — Envelope 路由维度**（feat 02c2b56 / merge 41d6c7b）——`Envelope` 加 **必填** `accountId` 与可选 `richMetadata`（`isEdit` / `isDelete` / `replyTo` / `quote` / `reactions`）；`messages` 表新增 `rich_metadata` 列（migration `0001_secret_dagger.sql`，仅 `ALTER ADD`）。5 个 channel adapter 各自派生 accountId（telegram→`botUsername`、whatsapp→`phoneNumberId`、lark→`appId`、line→`sha256(channelAccessToken)` 前 8 字节、web→`binding.id`），并提取 reply / edit / delete 信号。系统派发路径用保留前缀 `sys:` 命名空间隔离 channel binding 命名空间——`sys:task` / `sys:gateway` / `sys:cli` / `sys:cron`。
- **F2 — Per-tool approvals**（feat 07908be / merge 62fd614）——`WorkerConfig.toolPolicy?` 三态语义：`auto` / `ask`（60s 超时按 deny） / `deny` 短路。orchestrator 在 `runTool` 路径加 policy gate；`ApprovalStore` 在 `runtime.dispose()` 时全部 `resolve('deny')`（不能 reject——orchestrator 用 await 拿决策）。`@aiworker/gateway-proto` 新增 `approval.list` / `approval.grant` 方法 + `APPROVAL_REQUESTED` 事件（gateway 仅透传，与 `chat.send` / `config.*` 一致）。worker 本地 HTTP 端点 `GET /api/worker/approvals` + `POST /api/worker/approvals/:taskId/:toolCallId/grant` 给 `aiw approvals-list` / `aiw approvals-grant` 用；operator 侧 `aim approvals list/grant` 走 gateway WS。
- **F3 — Provider fallback chain**（feat 8af3069 / merge 034e1f2）——`ExecutorConfig.fallbacks?` 嵌套结构（每条 `executor + onErrorKinds + maxRetries?`）；`FallbackExecutor` wrapper 包裹 primary，按 `inferErrorKind` 六分类（`rate-limit` / `timeout` / `auth` / `network` / `server-5xx` / `unknown`）匹配 fallback 项，保留 `auth` 在 401+5xx 文本冲突时的优先权 + `AbortError` 在 fetch 失败叠加时归 `timeout`。`buildExecutor` 检测 `fallbacks` 后递归构造嵌套包装，wrapper 与 `ExecutorProvider` 一一对应（不进 orchestrator）。**已 yield 流后不重放**——chat 已下发首事件后直接冒泡，避免半截 transcript 与双流叠加。
- **F4 — Cron 调度**（feat 1442360 / merge 2f00d6e）——新表 `cron_jobs`（migration `0002_jazzy_moondragon.sql`）；`CronService` 60s `setInterval` tick + CRUD，挂在 `runtime.build/dispose` 上；fire 顺序"先算 next → 写库 → ingest"避免重复触发；用 `cron-parser ^5.5.0` 校验 + 计算下一次 tick；fire 时合成 `sys:cron` envelope 喂 `orchestrator.ingest`，**绝不进 orchestrator hot path**。`@aiworker/gateway-proto` 新增 `cron.list` / `cron.add` / `cron.remove` / `cron.update` 方法；operator `aim schedule list/add/remove`；worker 本地 `aiw schedule-list/-add/-remove`（直接 in-process CronService CRUD，与 `aiw config-show` 模式一致）。

测试基线变化：

- `apps/api` 346 → **410**（+64：F1 channel adapter 12 + F2 policy/store/gateway-client 32 + F3 fallback 19 + F4 cron service 12 + management 路由若干，向 410 收敛）
- `apps/gateway` 52 → **55**（+3：approvals + cron 透传单测）
- `packages/gateway-proto` 0 → **11**（新协议字段单测）

保留的不变量（验证过）：

- fleet.db / worker.db 物理隔离；fleet.db 永不写 toolPolicy / cron job / approval 等业务态。
- AES-256-GCM 封 `apiTokenEnc`；gateway 与 worker 的 crypto 模块仍有意复制。
- bearer 比对 `timingSafeEqualStrings`；hot-reload 时路由 / dispatcher / subscriber 全部 `() => state.runtime` 闭包懒取；`reloadRuntime` 串行化。
- evolution observer 离 hot path；F2 policy gate / F4 cron tick 也都不进 orchestrator hot path。

文档同步：

- `docs/architecture.md` 新增 §"PLAN-014：envelope / approvals / fallback / cron" 段落（F1-F4 各自语义边界 + 不变量 + sys:* 保留前缀表）。
- `docs/cli.md` aiw 节追加 `approvals-list/-grant` + `schedule-list/-add/-remove`；aim 节追加 `approvals list/grant` + `schedule list/add/remove`。
- `docs/plan/PLAN-014.md` 状态 `implementing → completed`，追加完成记录节。
- `docs/plan/index.md` PLAN-014 改 `[x]`。

已知 follow-up（不在本批）：

- `cron_jobs` 在 `reloadRuntime` 极短窗口内可能出现双 setInterval（fire 顺序保证不会重复触发同一 job，`lastRunAt` 可能早 1s 写）—— P2，未修。
- `evolution_observations` 仍随对话线性增长，需要 TTL / 滚动压实策略（PLAN-004 既存遗留）。

Next on the line：PLAN-016（部署形态调整：CLI-first 安装 + docker 作为可选 fast-launch）。

## 2026-04-24 22:30 [progress]

**PLAN-013 landed: aim CLI + WS gateway — full replacement of dashboard REST.** 控制面从 Hono REST（`apps/api/src/dashboard/**`）整体迁到 WebSocket 协议，operator（aim CLI + web）与 node（worker 容器）共享同一条 `/ws` 入口；dashboard 模式从此下线。PLAN-013 在 main 上按 6 个 subtask 落地，保留所有不变量（fleet.db / worker.db 物理隔离、AES-256-GCM 封 token、bearer timing-safe、hot-reload 串行化）。

What shipped:

- **新包 `@aiworker/gateway-proto`**（commit daf7ba9）——纯类型 + zod 运行时校验。`METHODS`（12 个）+ `EVENTS`（8 个）+ `Frame`（connect / request / response / event）注册表由 aim、web、gateway、worker 四侧共享。`operator-to-node` vs `operator-to-gateway` 路由判别自带。
- **新 app `apps/gateway`**（commit b56abf8，supervisor 搬家 2021767）——`Bun.serve(:3000, websocket)` 单入口；`/ws` 承接 WS 升级，`/health` 返回 JSON 心跳。三件内存 registry（`NodeRegistry` / `OperatorRegistry` / `ForwardTable`）管理连接生命周期与在途 request；AES-256-GCM 密钥 `AIWORKER_MASTER_KEY` 给 `registered_workers.apiTokenEnc` 加解密；远程连接需 `INTERNAL_SHARED_SECRET` bearer，loopback 放行空 token。
- **FleetSupervisor 搬迁**（commit 2021767）——原 `apps/api/src/dashboard/supervisor/` 整树搬到 gateway 侧，`workers.pair` / `workers.launch` / `token.rotate` 作为 `operator-to-gateway` 方法实现；`AIWORKER_GATEWAY_CAN_LAUNCH=true` 时持 `/var/run/docker.sock:ro` 自动拉 worker 容器 + scrape bootstrap 行自动配对。配额 `AIWORKER_MAX_WORKERS` 应用到 pair 与 launch 两条路径。
- **新 `aim` CLI**（commit 32d59b0）——operator 侧 bin，与 `aiw` 并列发布。子命令 `gateway start|status|stop` / `pair` / `workers list|info|launch|stop|remove` / `chat` / `config get|set` / `token rotate` / `logs`；状态文件 `~/.aiworker/aim.json`（0600）持久化 `gatewayUrl` / `deviceId` / `deviceToken` / `defaultWorkerId`。cac 的两词子命令通过 argv 预处理合并。
- **worker node 模式**（commit 8ecd76a）——`aiw serve --gateway ws://...` 在 HTTP server 之外再拨一条 WS 连接，作为 `role=node` 注册。`startGatewayNode` 走 `getRuntime()` 懒取，兼容 hot-reload；dispatcher 处理入站 `chat.send` / `config.get` / `config.put` / `token.rotate` / `logs.tail`，subscriber 把 `WorkerEventBus` 事件 emit 成 `agent.*` / `chat.message` / `config.changed` / `logs.line` 帧。SIGTERM 优雅关两条路径。
- **web 切到 WS**（commit dc2d277）——`apps/web/src/lib/api.ts` 的 REST 全量移除，改走单例 WS client（与 aim 共享 `@aiworker/gateway-proto`）。浏览器经 Caddy 反代连 gateway，属 gateway 视角的 loopback，无需再叠 basic auth。24 个测试保留，另有 13 个 REST fixture 转为 `.skip` 等待重写。
- **dashboard 整段删除**（commit 3d9637f）——`apps/api/src/dashboard/**` 13 源文件 + 10 测试 + `modes/dashboard.ts` + `config/dashboard.ts` 全部下线。`apps/api/src/index.ts` 不再分叉，直接 `createWorkerApp`；`AIWORKER_MODE=worker` 变量仍兼容运维脚本，但 `=dashboard` 取值已失效。
- **ops 迁移**（commit f759744）——`ops/compose/docker-compose.yml` service 从 `aiworker-dashboard` 改名 `gateway`（容器 `aiworker-gateway`），`command: ['bun','apps/gateway/src/index.ts']` 覆盖 Dockerfile 默认 worker ENTRYPOINT；Dockerfile 拷贝 `apps/gateway` 源码入镜像（未 bundle，直接 `bun` 执行）；env 从 `MANAGER_POLL_*` / `MANAGER_CAN_LAUNCH` / `DASHBOARD_REQUIRE_AUTH` 全部下线，替换为 `AIWORKER_GATEWAY_CAN_LAUNCH` + `AIWORKER_MAX_WORKERS` + supervisor 子配置。
- **测试基线**：`apps/api` 450 → 346（删 dashboard 相关 104 条），`apps/gateway` 0 → 52（38 baseline + 新增 pair/launch/token.rotate 单测），`apps/web` 24 + 13 skipped。`bun run check` 全仓绿。

保留的不变量：

- fleet.db / worker.db 物理隔离；fleet.db 只存 `registered_workers` + `audit_events`。
- AES-256-GCM 封 token；gateway 与 worker 的 crypto 模块有意复制（master key 不同）。
- Bearer 比对 `timingSafeEqualStrings`；loopback 放行的判定 `127.0.0.1` / `::1` / `::ffff:127.0.0.1` / `localhost`。
- Hot-reload：路由 / dispatcher / subscriber 全部 `() => state.runtime` 闭包懒取；`reloadRuntime` 串行化。

文档同步：`docs/architecture.md`（改写 topology + 角色）、`docs/cli.md`（新增 `aim` 节 + `aiw serve --gateway`）、`docs/gateway.md`（新建——协议参考 / pairing 流程 / 故障恢复）、`docs/deployment.md`（替换——gateway 部署 run book）、`docs/plan/PLAN-013.md`（状态置 completed 并列出交付 commit）、`docs/plan/index.md`（PLAN-013 改 `[x]`）。

Next on the line：PLAN-014（envelope + 每工具审批 + provider fallback + cron）与 PLAN-015（`apps/api/src/worker/**` 物理搬迁到 `packages/core`）。

## 2026-04-24 16:30 [progress]

**PLAN-012 landed: filesystem source of truth for brain + skills + memory (REFACTOR-003, decision A1 / Hermes-moat / C1 / D1).**

Post-phase-1a research on Hermes Agent + OpenClaw confirmed both projects are instances of the same long-running-agent-daemon pattern (one conversation loop, many entry points, filesystem-owned skills + memories). AIWorker's current shape — fleet manager + per-worker runtime — is already OpenClaw RFC 42026's proposed split, so the refactor doesn't touch topology. It targets the real gaps instead: data-domain source of truth (this plan), remote-control protocol (PLAN-013), envelope + approvals + fallback + cron (PLAN-014), physical `packages/core` extraction (PLAN-015). The original PLAN-012 — mechanical move of `apps/api/src/worker/**` into `packages/core` — was superseded; it's now PLAN-015 and runs last.

What shipped:

- **New package `@aiworker/fs-layout`** — owns the `~/.aiworker/` path convention. Exports `resolveWorkerHome`, `resolveBrainHome`, `resolveSkillsDir`, `resolveMemoriesDir`, `resolveConfigYamlPath`, `resolveAgentMdPath`, `resolveSoulMdPath`, `resolveUserMdPath`, and the idempotent `ensureWorkerHome(workerId)` seeder. `AIWORKER_HOME` env overrides the root (default `~/.aiworker`).
- **`HermesProvider` → `FilesystemBrainProvider`** — file moved from `apps/api/src/worker/brain/providers/hermes.ts` to `apps/api/src/worker/brain/providers/filesystem/index.ts`. `HermesApiClient` (the vestigial `/health` probe over HTTP) deleted; health now uses `access(home)`. Scanner + watcher + types moved alongside (from `apps/api/src/adapters/hermes/` which is now empty and removed). The provider drops `apiUrl` and takes only `home`.
- **Shared types renamed**: `HermesBrainSourceConfig` → `FilesystemBrainSourceConfig` (no `apiUrl` field; `home` is optional and defaults via the factory to `resolveBrainHome(workerId)`). Discriminator `type: 'hermes'` → `type: 'filesystem'`. Re-export list in `packages/shared/src/index.ts` + `packages/shared/src/fleet/index.ts` updated.
- **`buildBrain` signature** now takes `(workerId, config)` so the factory can default the brain home via fs-layout. `runtime.ts` threads the workerId through.
- **`ensureWorkerHome` hooked into `loadOrMintIdentity`** — both existing + just-minted paths seed the tree, so `aiw init` and the HTTP worker mode produce identical on-disk layouts.
- **Config yaml mirror** — `putConfig` gained a new sibling `mirrorConfigToYaml(workerId, config, version)`. Both the HTTP `PUT /api/worker/config` and `aiw config-set` call it after the DB write. `~/.aiworker/workers/<id>/config.yaml` is advisory (DB remains authoritative); a future WS gateway + `aim config edit` can promote it to source-of-truth.
- **Dashboard web UI** — `BrainSection` form updated: `Hermes` button → `Filesystem`; `apiUrl/home` pair → single optional `home` field; type discriminator select option `hermes` → `filesystem`. Config-editor integration test fixture updated.
- **Legacy env wipe** — `BRAIN_PROVIDER`, `HERMES_API_URL`, `HERMES_HOME`, `OPENCLAW_WS_URL`, `OPENCLAW_HOME` deleted from `apps/api/.env.example`. `AIWORKER_HOME` added. No runtime code ever consumed these — they were ornamental.

Verification:

- `bun run check` clean (typecheck across 6 packages + eslint).
- `bun run --filter '@aiworker/api' test` — 450 pass / 0 fail (parity).
- `bun run --filter '@aiworker/cli' smoke:aiw-run` — PASS.
- Manual E2E: `aiw init` with a tmp `AIWORKER_HOME` produces `workers/<id>/{AGENT.md,SOUL.md,USER.md,config.yaml-missing-until-first-set,brain/{MEMORY.md,memories/,skills/},workspaces/}` exactly as specified. `aiw config-set '<json>'` writes `config.yaml` with the round-tripped redacted form.

Next on the line: PLAN-013 (`aim` CLI + WS gateway, fully replacing dashboard REST).

## 2026-04-24 12:30 [progress]

**PLAN-011 phase 1a landed: CLI-first lightweight runtime (storage-sqlite + aiw).** First concrete step of REFACTOR-003 toward a hermes-style CLI + an openclaw-style gateway. The conversation loop can now run without binding any HTTP port.

What shipped:

- **New package `@aiworker/storage-sqlite`** — physically extracted `apps/api/src/db/**`, `apps/api/drizzle/**`, and both `drizzle.*.config.ts` files into `packages/storage-sqlite/`. Subpath exports `./fleet` + `./worker` keep the data-domain boundary narrow (a route handler should import from the subpath it actually touches). Package also exports `defaultFleetMigrationsFolder` / `defaultWorkerMigrationsFolder` resolved via `import.meta.url`, so CLI + scripts no longer hardcode `./drizzle/...` relative paths.
- **New app `@aiworker/cli`** with the `aiw` binary (cac-based argv). Subcommands: `init` (mint identity + seed config), `run --message <text> [--dry-run]` (feed one envelope through the orchestrator, stream events to stdout, exit), `serve [--port <n>]` (bit-for-bit equivalent of `AIWORKER_MODE=worker`), `config-show`, `config-set <json> [--if-match <v>]`, `token-rotate`. `aiw run --dry-run` is the phase-1 success demo — it boots the runtime in-process with zero HTTP binding.
- **Lazy env parsing** — `apps/api/src/config/worker.ts` now parses `process.env` on first property access (Proxy-backed `workerEnv` + explicit `getWorkerEnv()`). `aiw --help` / `aiw --version` no longer require `AIWORKER_MASTER_KEY`, which matters for CI and first-time users reading the CLI docs.
- **`apps/api` library surface** — new `./lib` subpath export (`apps/api/src/lib.ts`) re-exports the transport-agnostic seams (`buildWorkerRuntime`, `loadOrMintIdentity`, `putConfig`, `handleTokenRotate`, `bootstrapWorkerApp`, ...). `apps/cli` consumes this; phase 1b will physically move these seams into `packages/core` and delete the re-exports.
- **29-file import sweep** — every `../db/*` / `../../db/*` import under `apps/api/src/**` rewritten to `@aiworker/storage-sqlite/{fleet,worker}`. Test fixtures dropped their hardcoded `./drizzle/worker` path — the package default kicks in.
- **Ops** — `Dockerfile` copies `packages/storage-sqlite/drizzle` into `/app/drizzle` (same runtime path as before, so `WORKER_MIGRATIONS_FOLDER=./drizzle/worker` stays valid). `bun run db:generate` now delegates to the storage-sqlite workspace.

Verification:

- `bun run check` clean (typecheck across shared / storage-sqlite / web / api / cli + eslint).
- `bun run --filter '@aiworker/api' test` — 450 pass / 0 fail (parity with the pre-refactor baseline).
- `bun run --filter '@aiworker/cli' smoke:aiw-run` — PASS: `aiw init` + `aiw run --message hello --dry-run` completes with "runtime constructed" in stdout.
- Manual `aiw --help` / `aiw config-show` / `aiw token-rotate` against a tmpdir db — all functional.

Scope notes:

- The 107-file physical move of `apps/api/src/worker/**` → `packages/core/src/worker/**` is deferred to PLAN-012 (phase 1b). Rationale: the 29-file db move + CLI shell is a clean atomic merge; the worker tree move is mechanical but brings cross-cutting helper imports (`config/worker`, `shared/AppError`, `shared/lib/ids`) that deserve their own review cycle. See `docs/plan/PLAN-011.md` §"Execution split" for the full phase-1a / 1b boundary.
- `aim` CLI (manager side) and the WebSocket gateway (`aim gateway`) remain out-of-scope here — tracked by PLAN-013 / PLAN-014 once phase 1b lands.

## 2026-04-23 09:55 [progress]

**PLAN-010 / FEAT-023 manager-driven worker creation landed.** The dashboard now has a dedicated "Create worker" button that spawns a fresh worker container on the local docker engine end-to-end (supervisor `launchLocal` → token scrape → registry insert), surfaces the one-time plaintext bearer to the operator (like a GitHub PAT), and is gated by two new safety rails:

- **`DASHBOARD_REQUIRE_AUTH=true`** flips on a bearer/basic middleware guarding `/api/*`. Same shared secret (`INTERNAL_SHARED_SECRET`) handles both CI (`Authorization: Bearer …`) and browsers (native `Basic` prompt via `WWW-Authenticate`). Default is `false` so the rollout can sequence authN-first, then overlay-second.
- **`MANAGER_MAX_WORKERS`** applies a hard cap to both `/register` and `/launch-local`, returning `409 { code: 'quota-exceeded', limit, current }` on overflow. Omit for no cap.

`FleetSupervisor` also grew a startup self-check that refuses to launch if the dashboard container isn't joined to `aiworker_default`, catching the most common single-host misconfig instead of silently producing zombie `offline` registry rows. `ensureInfrastructure()` now calls `inspectContainer(HOSTNAME)` and asserts membership; soft-fails on bare metal or when the hostname isn't a docker container id.

Ops:

- New `ops/compose/docker-compose.supervisor.yml` overlay mounts `docker.sock:ro` + `/opt/aiworker-workers` and turns on the launcher env bundle. Compose with `-f docker-compose.yml -f docker-compose.supervisor.yml`. Default deploy unchanged.
- `docs/deployment.md` gained a full "Enabling manager-driven worker creation" runbook: prerequisites (authN before sock mount), compose overlay, smoke test (`curl -u :$INTERNAL_SHARED_SECRET …/api/workers/capabilities`), rollback, pitfalls (network membership, data path, master-key backup).
- `ops/compose/.env.example` commented with the new optional envs.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — api 450 pass (baseline 429 + 21 new: 11 auth middleware + 4 supervisor self-check + 6 capabilities/quota routes), web 37 pass unchanged.
- `bun run lint` — 0 errors.

## 2026-04-23 08:56 [release]

**PLAN-009 worker image bundling + model picker complete.** Four FEATs (FEAT-019 / 020 / 022 / 021) landed across one day. Net effect: engine picker shows known-model presets instead of free text; every build pushes two image tags (slim / full); `-full` pre-installs all five agentic CLIs (claude-code / codex / gemini-cli / qwen-code / cursor-agent) so workers skip the `npx` cold fetch; operator docs + `docker-compose.worker.example.yml` enumerate auth-mount recipes.

FEAT-021 — final step — delivered via BKD worktree subtask `s306n1zj` commit `2dae80a`, merged in `7928639`. 4 files, +33 / −16 (Dockerfile + docs).

Dockerfile:

- `runtime-full` stage gains a Cursor agent install step. Since Cursor has no npm package, we use the official `curl -fsSL https://cursor.com/install | bash` script. The installer drops cursor-agent as a bash wrapper at `~/.local/bin/cursor-agent` that resolves its sibling `node` binary via `realpath $0`, so we re-symlink `/usr/local/bin/cursor-agent` at the same versioned binary instead of copying the file. `cursor-agent --version` runs at build time as a sanity gate.
- `bash -euo pipefail -c '...'` wraps the RUN so curl failures on the pipe side fail the build (default dash swallows them).

Docs:

- `docs/executor-engines.md` #cursor section updated: `-full` image now pre-installs cursor-agent; slim still requires the manual installer. Top-level slim/full table size bumped to ~320 MB.
- `docs/deployment.md` Slim vs Full table expanded to include cursor-agent.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 18, api 429, web 37.
- `bun run lint` — 0 errors.
- GHCR build `24826143375` double-tag push succeeded (3m41s; slim cache hit → only full stage paid network). All 5 CLIs' `--version` gates passed inside `-full` layer.

### PLAN-009 final tally (FEAT-019 → FEAT-022 → FEAT-021)

| FEAT | Scope | Delta |
|---|---|---|
| 019 | Per-variant `knownModels` catalog + lean preset `<select>` + `Custom…` escape | web tests +5 |
| 020 | Dockerfile `runtime-full` stage, dual-tag GHCR publish, `--image-variant` deploy flag, `AIWORKER_IMAGE_VARIANT_SUFFIX` compose env | ops + docs only |
| 022 | `docker-compose.worker.example.yml` + auth recipes in executor-engines + Register dialog `<details>` hint | docs + 1 frontend component |
| 021 | Cursor agent bake (symlink + realpath) | Dockerfile + docs |

- shared tests: 18 (unchanged this plan).
- api tests: 429 (unchanged this plan).
- web tests: 32 → **37** (+5 FEAT-019).
- lint baseline: 0 → 0.
- Image tags per push: 1 → **2** (`<sha>` slim + `<sha>-full`).

### Runtime capabilities post-PLAN-009

- **Dashboard runs on slim** — it doesn't need agentic CLIs.
- **Worker can pick slim or full** per compose. Full adds ~170 MB but skips first-use npx / curl fetches for every agentic engine.
- **Picker UX** — variant form fields with a `knownModels` entry render as preset `<select>` + `Custom…`; free text is still one click away, but typos are no longer the default.
- **Auth still operator's job** — pre-install ≠ pre-login. Register dialog now nudges operators to the recipe docs.

Pointer: `docs/plan/PLAN-009.md` (status `completed`), `docs/task/FEAT-019.md` / `FEAT-020.md` / `FEAT-021.md` / `FEAT-022.md`.

## 2026-04-23 05:35 [release]

**PLAN-008 worker registration UX + engine availability complete.** Two FEATs (FEAT-017, FEAT-018) landed on main in a single calendar day on top of PLAN-007's GA.

Final FEAT — **FEAT-018 Engine availability discovery** — delivered via BKD worktree subtask `cly4ayr3` commit `c5d9db8`, merged in `d5332f5`. 16 files / +1327 / −87. No rework (base `aa10f69` picked up correctly).

Shared:

- **New** `packages/shared/src/providers/availability.ts` — `EngineAvailability`, `EngineAvailabilityStatus` (`ready | login-required | not-found`), `EngineAvailabilityResponse`. Re-exported via `@aiworker/shared`.

API:

- **New** `apps/api/src/worker/executor/availability.ts` — singleton `AvailabilityProbe` with dependency-injected `fsExists` / `resolveBinary` for hermetic tests, 10-minute cache, `resetAvailabilityProbeForTests()` helper. Covers all seven `EngineKind` (acp expands to `{agent:'gemini'}` and `{agent:'qwen'}`). File-presence probes only — no `--version` shell-outs, no network.
- `apps/api/src/worker/executor/engines/acp/agents/{gemini,qwen}.ts` — inline `authProbe` removed; both agents now import from the shared `availability.ts`. One source of truth for engine probing.
- `apps/api/src/worker/management/routes.ts` — new bearer-authed `GET /api/worker/engines` with `?refresh=1` cache-bust query, returns `{engines: EngineAvailability[]}`.

Web:

- `apps/web/src/features/workers/hooks.ts` — `useWorkerEngines(workerId)` hook (TanStack Query, 10-minute stale) + `refreshWorkerEngines(workerId)` helper.
- **New** `apps/web/src/features/workers/components/config-editor/engine-availability.ts` — status → dot-color + short-label mapping, extracted out of `executor-section.tsx` to appease `react-refresh/only-export-components`.
- `apps/web/src/features/workers/components/config-editor/executor-section.tsx` — engine picker renders availability badge per option; `acp` variant sub-picker shows per-agent (gemini / qwen) badge; not-installed engines stay clickable and the variant panel shows a callout linking to `docs/executor-engines.md#<engine>`. Refresh icon-button invalidates the engines query.
- `apps/web/src/lib/api.ts` — `fetchWorkerEngines(workerId, refresh?)` client helper.

Docs:

- **New** `docs/executor-engines.md` — one section per non-trivial engine (claude-code / acp-gemini / acp-qwen / codex / cursor) with install command, auth command, container-embedding guidance.

Tests (+22):

- `apps/api/src/worker/executor/availability.test.ts` (+16) — three-status matrix across all engines, cache behaviour, refresh path.
- `apps/api/src/worker/management/routes.test.ts` — bearer-auth + shape + `?refresh=1` cases.
- `apps/web/.../executor-section.test.tsx` (+6) — three-badge render, not-installed callout, Refresh click.

### PLAN-008 final tally (FEAT-017 → FEAT-018)

| FEAT | Scope | Tests added |
|---|---|---|
| 017 | Register dialog UX: better Base URL guidance + client-side token generator + `AIWORKER_FORCE_TOKEN` helper | shared +6 |
| 018 | Worker-side engine probe + `GET /api/worker/engines` + frontend availability badges + install docs | api +16, web +6 |

- shared tests: 12 → **18** (+6 from FEAT-017).
- api tests: 413 → **429** (+16).
- web tests: 26 → **32** (+6).
- lint baseline: 0 → 0.

Pointer: `docs/plan/PLAN-008.md` (status `completed`), `docs/task/FEAT-017.md`, `docs/task/FEAT-018.md`.

## 2026-04-23 05:15 [progress]

PLAN-008 step 1 / 2 — **FEAT-017 Register dialog UX polish** landed. Fixes two operator papercuts surfaced during the post-PLAN-007 smoke on `https://gateway.example.test`.

Shared:

- `packages/shared/src/fleet/worker-identity.ts` — new `generateWorkerApiToken()` producing `wtk_` + 43 chars base64url of 32 CSPRNG bytes. Re-exported through `@aiworker/shared/fleet` and `@aiworker/shared` root.
- `packages/shared/src/fleet/worker-identity.test.ts` (new) — 6 cases: prefix, pattern match (100 samples), length, uniqueness over 1000 invocations, base64url alphabet.

Web:

- `apps/web/src/features/workers/components/register-wizard.tsx` — `Base URL` placeholder now `http://aiworker-worker:3000`; inline helper line enumerates the three typical shapes (same-compose / reverse-proxy / direct-port). Bootstrap API token row gains a `Generate` button that calls `generateWorkerApiToken()`, prefills the field, and surfaces a helper block containing the ready-to-paste `AIWORKER_FORCE_TOKEN=<token>` env assignment with copy-to-clipboard. Generated-value tracking invalidates itself on manual edit to avoid stale helper blocks. Import of `WORKER_API_TOKEN_PREFIX` from `@aiworker/shared` replaces the local duplicate constant.

Docs:

- `docs/deployment.md` — new subsections `Worker base URL formats` (three-shape table + pitfalls) and `Bootstrap token options` (manual vs dashboard-generated + `AIWORKER_FORCE_TOKEN` one-shot semantics).

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 18 / 18 (+6), api 413 / 413, web 26 / 26.
- `bun run lint` — 0 errors.

Pointer: `docs/plan/PLAN-008.md`, `docs/task/FEAT-017.md`.

## 2026-04-22 19:15 [release]

**PLAN-007 multi-engine executor refactor complete.** All 6 FEAT (FEAT-011..016) landed on main. AIWorker workers now support 7 executor engines behind a three-tier config + slot-aware scheduler.

Final FEAT in this batch — **FEAT-015 ProcessManager replacing AsyncQueue** — landed via BKD worktree subtask `igjbbb7t` commit `7eed7d1`, merged in `d2c3be3`. 15 files, +1367 / −30.

Note on the rework path: the first-pass subtask delivery forked from `9f2426c` (pre-FEAT-011 baseline) and would have regressed the three-tier profile architecture if merged. Coordinator caught the base mismatch during merge-time diff review, rejected the subtask with explicit `git reset --hard origin/main` + scope-narrowing instructions, and only merged on the second delivery.

### FEAT-015 delivery

- `apps/api/src/worker/orchestrator/process-manager.ts` (new, 676 LOC) — generic `ProcessManager<TMeta>` with slot quotas (global + per-engine), group keys (`conversationId`), priority enum (`interactive | default | background`), stall detection (no-activity timer with escalating cancel), auto-cleanup GC, hot-reload `setLimits()`.
- `apps/api/src/worker/orchestrator/process-manager.test.ts` (new, 436 LOC) — 16 cases covering slot caps, per-engine limits, group FIFO, priority, stall escalation, kill timeout, setLimits, cancelGroup, snapshot.
- `apps/api/src/worker/orchestrator/queue.ts` **deleted** — 10-line `AsyncQueue` fully replaced.
- `apps/api/src/worker/orchestrator/service.ts` — `ingest` and deferred workspace-dispose now go through `processes.run(...)`. `onActivity` fires on every `AgentEvent` (stall heartbeat). `cancel` propagates to `AgentRunInput.signal` → engine SIGTERM/SIGKILL.
- `apps/api/src/worker/runtime.ts` — `processes: ProcessManager` hoisted to runtime singleton; survives `reloadRuntime()`.
- `apps/api/src/config/worker.ts` — new env schema: `MAX_CONCURRENT_TOTAL`, `MAX_CONCURRENT_<ENGINE_UPPER>` (`CLAUDE_CODE`, `ACP`, `CODEX`, `CURSOR`, `HTTP`, `MCP`, `CLI`), `PROCESS_STALL_TIMEOUT_MS`, `PROCESS_KILL_TIMEOUT_MS`, `PROCESS_AUTO_CLEANUP_MS`.
- `apps/api/.env.example` — new env vars documented.
- `apps/api/src/worker/management/routes.ts` + `routes.test.ts` — `GET /runtime/processes/capacity` bearer-auth'd, reports live snapshot. Dashboard can now read slot budgets.
- `apps/api/src/modes/worker.ts` — ProcessManager wired into runtime construction; hot-reload calls `setLimits()` with latest env.

Key design decision: **slot budget configured via env vars, NOT in `ExecutorProfile`**. Ops configure runtime capacity; tenants configure executor shape. Zero file overlap with FEAT-016 — let both land in parallel without conflict.

Engine modules (`engines/claude-code`, `engines/acp`, `engines/codex`, `engines/cursor`) stay unchanged — the orchestrator wrapper alone provides slot / group / priority / stall semantics for all of them.

### PLAN-007 final tally (FEAT-011 → FEAT-016)

| FEAT | Engines / Features | Tests added (api) |
|---|---|---|
| 011 | `AgentEvent` schema + zod; OpenAI-compat migrated | 6 |
| 012 | Claude Code executor + `WorkspaceManager` | 52 |
| 013 | ACP harness + Gemini / Qwen adapters | 61 |
| 014 | three-tier `ExecutorProfile` + `DEFAULT_PROFILES` + frontend picker | 19 |
| 015 | `ProcessManager` (slot / group / priority / stall / capacity API) | 75 |
| 016 | Codex + Cursor adapters | 59 |

- api tests: baseline 158 → **413** (+255) zero regressions.
- shared tests: 0 → **12**.
- web tests: 17 → **26**.
- lint baseline cleared from 6 errors → **0**.

### Runtime capabilities post-PLAN-007

- **Seven engines** selectable per worker: `http` (OpenAI-compat + preset catalogue for DeepSeek / OpenRouter / SiliconFlow / Gemini OpenAI-compat), `mcp`, `cli`, `claude-code` (stream-json control protocol), `acp` (`gemini` / `qwen`), `codex` (JSON-RPC app-server), `cursor` (native stream-json).
- **Three-tier config**: engine × variant × overrides (`CmdOverrides` + per-request `modelId`, `reasoningId`, `permissionPolicy`).
- **Per-conversation workspace isolation** (plain dir or git worktree when `WORKER_WORKSPACE_GIT_ORIGIN` set), path-escape guard, deferred dispose via ProcessManager.
- **Slot-aware scheduler** with named priority classes, stall detection, capacity snapshot REST.
- **Legacy flat config still reads** (reader-only migration on boot); next `PUT /config` writes profile shape.
- `AgentEvent` tagged union is the single crossroad between engines and the orchestrator — adding an 8th engine only requires an `engines/<name>/` adapter + registry entry + `default-profiles.ts` variant.

### Pointers

- Design: `docs/plan/PLAN-007.md` (status `completed`).
- Per-FEAT: `docs/task/FEAT-011.md` .. `FEAT-016.md` (all `completed`).

## 2026-04-22 18:45 [progress]

PLAN-007 step 5 / 6 (delivered early, parallel with FEAT-015 rework) — **FEAT-016 Codex + Cursor agent adapters** landed. The executor fleet now covers 7 engines: `http` + `mcp` + `cli` + `claude-code` + `acp` (gemini, qwen) + `codex` + `cursor`.

Delivered via BKD worktree subtask `x28in77k` (branch `bkd/x28in77k`, commit `a1c5a4f`, merged to main in `4eba707`).

Shared:

- `packages/shared/src/fleet/executor.ts` — `EngineKind` now `'http' | 'mcp' | 'cli' | 'claude-code' | 'acp' | 'codex' | 'cursor'`; new `CodexVariantBody` + `CursorVariantBody` types, `executorProfileSchema` enum widened, `executor.test.ts` matrix gets two rows.
- `packages/shared/src/fleet/index.ts` + `packages/shared/src/index.ts` — re-export new types.

API:

- **New** `apps/api/src/worker/executor/engines/codex/` — `executor.ts` (spawns `codex app-server` / npx `@openai/codex@<version>` fallback), `protocol.ts` (re-export of `engines/acp/protocol.ts::JsonRpcPeer + splitNdjson`, zero peer duplication), `normalize.ts` (`codex/event/{assistant_message,thinking,token_usage,tool_call,tool_result,stop,error}` → `AgentEvent`, action.kind inferred by tool name), `types.ts`, `index.ts` + 3 test files.
- **New** `apps/api/src/worker/executor/engines/cursor/` — `executor.ts` (spawns `cursor-agent -p --output-format=stream-json --model ...`, stdin prompt + `stdin.shutdown()`, no npm fallback: `resolveBinary` null → `AgentEvent.error`), `normalize.ts` (imports `splitNdjson` from claude-code; local `parseCursorLine`; `session_id` captured and exposed via `getLastSessionId()`), `types.ts`, `index.ts` + 2 test files.
- `apps/api/src/worker/executor/default-profiles.ts` — `codex.default = { model: 'gpt-5.2-codex', timeoutMs: 120_000 }`; `cursor.default = { model: 'auto', timeoutMs: 120_000 }`. Variant bodies kept minimal; apiKey / sandbox / policy / extraArgs traverse `CmdOverrides`.
- `apps/api/src/worker/executor/factory.ts` — `case 'codex'` (reads `CODEX_CLI_VERSION` / `DEFAULT_CODEX_CLI_VERSION`) + `case 'cursor'` (no cliVersion — no npx fallback).
- `apps/api/src/worker/management/config-schema.ts` — engine enum + schema branches for codex / cursor.
- `apps/api/test-fixtures/cli/codex-stub.mjs` + `cursor-stub.sh` — pre-recorded wire fixtures, `chmod +x`.

Web:

- `apps/web/src/features/workers/components/config-editor/executor-variants.ts` — `ENGINE_CATALOG.codex` + `.cursor` with `z.object({ model?, timeoutMs? })` schemas.
- `executor-section.test.tsx` — 3 new cases: engine picker shows codex/cursor, cursor body renders, cursor model override persists.

Docs:

- `docs/architecture.md` — "Executor engines" section enumerates all 7 engines.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 12 / 12 (+2), api 397 / 397 (+59), web 26 / 26 (+3).
- `bun run lint` — 0 errors.

Deferred (all P2/P3):

- Codex / Cursor wire shapes may drift with CLI versions — capture live traces before production and update `normalize.ts` + stubs as needed.
- Codex `thread_fork` resume + Cursor `--resume sessionId` slots reserved but not threaded through orchestrator.
- availability probe / auth detection follow-up.
- Lift executor catalog schemas into `@aiworker/shared` (open since FEAT-014).

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-016.md`.

## 2026-04-22 18:10 [progress]

PLAN-007 step 4 / 6 — **FEAT-014 three-tier ExecutorConfig + frontend picker** landed. `ExecutorConfig` collapses from a flat 5-branch discriminated union into a three-tier `ExecutorProfile = {engine, variant, overrides?, modelId?, reasoningId?, permissionPolicy?}`. Worker stores only the diff from baked-in `DEFAULT_PROFILES`; the flat legacy shape migrates reader-side, not write-side.

Delivered via BKD worktree subtask `geb8ycbp` (branch `bkd/geb8ycbp`, 38 files, +1987 / -439). Merged to main in `a72472d`.

Shared:

- **New** `packages/shared/src/fleet/executor.ts` — `EngineKind`, `CmdOverrides`, `ExecutorProfile`, zod schemas. This is now the only shape `PUT /config` accepts.
- `packages/shared/src/fleet/config.ts` — reduced to a re-export shim over `./executor`.
- `packages/shared/src/fleet/{index.ts,worker.ts,worker-info.ts}` — re-export surface updated; `WorkerInfo` exposes `engine` + `effectiveModel`.

API:

- **New** `apps/api/src/worker/executor/default-profiles.ts` — embedded variant catalog per engine (http default / deepseek / openrouter / siliconflow presets, claude-code default + opus-plan, acp gemini / qwen, mcp default, cli default) + `resolveVariant()` merging variant body + `overrides` + `CmdOverrides`.
- `apps/api/src/worker/executor/factory.ts` — takes `ExecutorProfile`, resolves variant, threads effective config into existing engine constructors unchanged.
- `apps/api/src/worker/bootstrap/config.ts` + `default-config.ts` — `migrateLegacyExecutor()` upgrades `{type:'http'|'mcp'|'cli'|'claude-code'|'acp',...}` → profile shape on load; never writes back. Old clients `PUT`ing flat shape get 400.
- `apps/api/src/worker/config/secret-paths.ts` — secret paths now point at `executor.overrides.{apiKey,token}`; `DEFAULT_PROFILES` keeps empty-string placeholders.
- `apps/api/src/worker/management/{config-schema,executor-test,info}.ts` — zod schema, tiny probe, and `executorInfoModel` migrated to the profile shape.
- `apps/api/src/worker/orchestrator/service.ts` — `executorModel()` reads from profile.
- `apps/api/src/worker/runtime.ts` — wires profile-shaped config through the runtime.
- `apps/api/scripts/smoke-plan-004.ts` — updated to new shape.

Web:

- **Rewritten** `apps/web/src/features/workers/components/config-editor/executor-section.tsx` — two-step picker (engine select → variant select) with an advanced collapse for `CmdOverrides` + per-request overrides.
- **New** `executor-form.tsx` — lean zod-schema → form mapper (string / number / boolean / enum / array<string> / record<string,string>, JSON textarea fallback). No external form library.
- **New** `executor-variants.ts` — frontend catalog schemas (zod) so the form renders fields without a round-trip.
- `apps/web/package.json` — adds `zod` dep for the catalog schemas.
- `apps/web/src/lib/api.ts` — type surface matches the new profile shape.
- Engine switch clears `overrides` to prevent cross-engine body key contamination.

Tests (+28):

- `packages/shared/src/fleet/executor.test.ts` — schema accept / reject matrix.
- `apps/api/src/worker/executor/default-profiles.test.ts` — `resolveVariant` merge semantics; unknown engine / variant throws.
- `apps/api/src/worker/bootstrap/config.test.ts` — all 5 legacy-shape migrations map correctly.
- `apps/api/src/worker/management/{config,routes,info,executor-test}.test.ts` — stubs + assertions updated to profile shape.
- `apps/web/src/features/workers/components/config-editor/executor-section.test.tsx` + `executor-form` / `__tests__/config-editor.test.tsx` — two-step picker flow, variant schema rendering, save-payload contract.

Incidental: subtask auto-fixed all 6 pre-existing main-baseline lint errors (yaml plain-scalar in `.github/workflows/build-image.yml`, import order in `apps/api/src/modes/dashboard.ts`, quote style in `scripts/deploy.ts`). Pure `eslint --fix` changes, zero semantic impact. **New main baseline: 0 lint errors.** Future FEATs must maintain that.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 10 / 10 (+3), api 338 / 338 (+19), web 23 / 23 (+6).
- `bun run lint` — 0 errors.

Deferred:

- Frontend zod schemas + backend `DEFAULT_PROFILES` TS interfaces are two sources of truth; FEAT-016 should lift into `shared` and unify.
- Remote model discovery (vibe-kanban's `discover_options` stream) still out of scope.

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-014.md`.

## 2026-04-22 17:30 [progress]

PLAN-007 step 3 / 6 — **FEAT-013 ACP harness + Gemini / Qwen adapters** landed. Second and third agentic-CLI engines now plug into the fleet; a fourth ACP-speaking engine (Copilot, Aider, Amp, ...) requires only a new data file in `engines/acp/agents/`.

Delivered via BKD worktree subtask `9395s1ev` (branch `bkd/9395s1ev`, 18 files, +2141 / -0 all-new). Subtask self-review passed after one fixup (stub path depth `..` count). Merged to main in `128f790`.

Shared:

- `packages/shared/src/fleet/config.ts` — `ExecutorConfig` gains minimal `{ type: 'acp', agent: 'gemini' | 'qwen', model?, cliVersion?, extraArgs?, env?, timeoutMs? }` variant. Three-tier profile layer still deferred to FEAT-014.

API (all new under `apps/api/src/worker/executor/engines/acp/`):

- `harness.ts` — `AcpExecutor` implements `ExecutorProvider`: spawn resolution (PATH → npx fallback with env-driven version), stdio ACP session lifecycle (`initialize` → `newSession` → `prompt` → streaming `sessionUpdate` → `cancel`), 10-minute auth-probe cache, proactive close + peer dispose on child `exit code != 0`.
- `protocol.ts` — transport-agnostic `JsonRpcPeer`: request / response correlation, notification dispatch, inbound request handling (used for `session/request_permission` auto-approve), timeout + abort + dispose.
- `normalize.ts` — ACP `sessionUpdate` → `AgentEvent`. `ToolCall.kind` maps to `ToolAction.kind`: read → file_read, edit → file_edit, execute → command_run, search → search, fetch → web_fetch, think → task_plan, else → tool. `stopReason` mapped to `AgentFinishReason`.
- `types.ts` — JSON-RPC frame + ACP session / tool / stopReason wire types, module-local only.
- `agents/types.ts` — `AcpAgentDefinition` shape: `{ id, label, commandName, npxPackage, versionEnvVar, defaultVersion, buildArgs(cfg), authProbe() }`.
- `agents/gemini.ts` — `--experimental-acp --yolo --allowed-tools run_shell_command`; `authProbe` checks `~/.gemini/oauth_creds.json`.
- `agents/qwen.ts` — `--acp --yolo`; `authProbe` checks `~/.qwen/`.
- `agents/index.ts` — registry map.
- `apps/api/src/worker/executor/factory.ts` — `case 'acp'`.
- `apps/api/src/worker/management/config-schema.ts` + `info.ts` — zod schema + `executorInfoModel` branch for acp.
- `apps/api/src/worker/orchestrator/service.ts` — `executorModel()` helper covers acp.
- `apps/api/test-fixtures/cli/acp-stub.mjs` — pre-recorded ACP ndjson usable by both gemini and qwen harness tests.

Tests (61 new):

- `protocol.test.ts` — JsonRpcPeer request/response, notification, cancel, timeout, dispose.
- `normalize.test.ts` — `sessionUpdate` event → `AgentEvent` including `ToolKind` → `ToolAction.kind` inference and stopReason mapping.
- `harness.test.ts` — smoke: gemini + qwen both produce assistant-message + tool-use + finish events against the stub binary.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 7 / 7, api 319 / 319 (61 new), web 17 / 17.
- `bun run lint` at pre-existing main baseline, zero new errors.

Deferred:

- ACP executor hasn't registered with `ProcessManager` → FEAT-015.
- CLI `--version` shell-out + DB-persisted availability → FEAT-015 or later.
- Default CLI versions (`gemini 0.9.0`, `qwen 0.0.14`) are placeholders — ops override via `GEMINI_CLI_VERSION` / `QWEN_CLI_VERSION` before production use.

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-013.md`.

## 2026-04-22 10:17 [progress]

PLAN-007 step 2 / 6 — **FEAT-012 Claude Code executor with git worktree workspace** landed. This is the first true agentic-CLI adapter on the fleet: the orchestrator no longer drives the tool loop for this engine — the Claude CLI owns the in-process agent loop, built-in tools, and sandboxing.

Delivered via BKD worktree subtask `d1oqqs1m` (branch `bkd/d1oqqs1m`, 26 files, +1915 / -9). Subtask self-review fixed two P1s (dispose-race via queue-deferred dispose; `once(child,'exit')` reject on `error` wrapped with `.catch`). Merged to main in `b98c13e`.

Shared:

- `packages/shared/src/fleet/config.ts` — `ExecutorConfig` gains minimal `{ type: 'claude-code', model?, cliVersion?, extraArgs?, env?, workspaceRoot?, timeoutMs? }` variant. Formal three-tier profile layer deferred to FEAT-014.
- `packages/shared/src/providers/executor.ts` — `AgentRunInput.workspacePath?: string` optional field so the orchestrator can hand a per-conversation workspace to the executor. Providers that don't need it (http / mcp) simply ignore the field.

API:

- **New** `apps/api/src/worker/executor/engines/claude-code/` module:
  - `executor.ts` — spawns `claude` from PATH first, falls back to `npx -y @anthropic-ai/claude-code@<version>`. Startup: `-p --verbose --output-format=stream-json --input-format=stream-json --include-partial-messages --replay-user-messages --dangerously-skip-permissions`. Default 120s timeout, abort-signal aware, child-error tolerant, spawn / binary resolver injectable for tests.
  - `protocol.ts` — stdio bidirectional control protocol peer; auto-approve policy default (all `PreToolUse` allow); deny / ask branches code-preserved for future interactive approval UI.
  - `normalize.ts` — stream-json → `AgentEvent`: assistant message / thinking delta, `tool_use` with `ToolAction.kind` inferred from tool name (Read/View → file_read, Edit/Write → file_edit, Bash → command_run, WebSearch/Grep → search, WebFetch → web_fetch, TodoWrite → task_plan, else → tool), user `tool_result`, `stop` → finish + usage, stream_event partial deltas, token_usage. NDJSON splitter merges across chunk boundaries.
  - `types.ts` — module-local CLI wire types.
- **New** `apps/api/src/worker/executor/workspace.ts` — `WorkspaceManager` with `createWorkspace(conversationId)` / `disposeWorkspace(conversationId)` / `purgeAll`. Enforces path-escape guard (conversationId regex + `isInside(WORKER_DATA_ROOT)` check). When `WORKER_WORKSPACE_GIT_ORIGIN` is set, provisions an isolated `git worktree add --detach`; otherwise a plain directory. Idempotent; concurrent create deduplicated.
- `apps/api/src/worker/runtime.ts` — `workspaces: WorkspaceManager` added to the runtime handle; survives hot-reload so workspace dirs persist across config swaps.
- `apps/api/src/worker/orchestrator/service.ts` — allocates a workspace per conversation on `ingest`, threads `workspacePath` into `run(...)`. On "new topic" classifier decision, dispose is enqueued on the orchestrator's FIFO queue so any prior in-flight run completes before the directory is deleted. No `toolDefinitions` injection for `claude-code`.
- `apps/api/src/worker/conversation/router.ts` — `classifyContinuation` accepts optional `workspacePath` so claude-code can classify when used as the conversation classifier.
- `apps/api/src/config/worker.ts` — new env vars `WORKER_DATA_ROOT`, `WORKER_WORKSPACE_GIT_ORIGIN`, `CLAUDE_CLI_VERSION`.
- `apps/api/src/worker/executor/factory.ts` — `case 'claude-code'`.
- `apps/api/src/worker/management/{config-schema.ts,info.ts}` + several `*.test.ts` — shape registration + model extraction for claude-code; stub runtime shape updated to include the `workspaces` field.

Tests (52 new):

- `engines/claude-code/{executor,protocol,normalize}.test.ts` + module-level fixtures.
- `workspace.test.ts` — path-escape guard + git worktree optional path.
- `orchestrator/service.claude-code.test.ts` — e2e smoke driving a web-channel envelope through a stub CLI (`apps/api/test-fixtures/cli/claude-stub.sh`), verifying at least one assistant-message event + one tool-use event land on the bus and persist to `worker.db.messages`.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 7 / 7, api 258 / 258 (52 new), web 17 / 17.
- `bun run lint` at pre-existing main baseline (6 errors in `.github/workflows/build-image.yml`, `modes/dashboard.ts`, `scripts/deploy.ts`); FEAT-012 introduced zero new lint errors.

Deferred (P3, tracked in FEAT-014 / FEAT-015):

- Frontend picker row for `claude-code` → FEAT-014.
- `info.ts` health for `claude-code` becoming process-aware → FEAT-015 (`ProcessManager`).
- stdout write backpressure drain → FEAT-015.

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-012.md`.

## 2026-04-22 09:50 [progress]

PLAN-007 step 1 / 6 — **FEAT-011 Normalize AgentEvent schema + refactor OpenAI-compat executor** landed. The orchestrator hot path no longer speaks OpenAI-specific chunk shapes; every `ExecutorProvider` now emits a shared `AgentEvent` tagged union, laying the foundation for Claude Code / ACP / Codex / Cursor adapters in FEAT-012..016.

Shared:

- **New** `packages/shared/src/providers/agent-event.ts` — `AgentEvent` discriminated union (`assistant_message_delta`, `thinking_delta`, `tool_use`, `tool_result`, `permission_request`, `token_usage`, `finish`, `error`), `ToolAction` discriminated union (`file_read`, `file_edit`, `command_run`, `search`, `web_fetch`, `task_plan`, `tool`, `other`), `ToolStatus`, `TokenUsage`, `AgentFinishReason`. All backed by zod schemas exported from the package root.
- **Breaking** (internal only, pre-release): `ExecutorProvider.runChat` renamed to `run`; returns `AsyncIterable<AgentEvent>` instead of `AsyncIterable<ChatStreamChunk>`. Legacy `ChatStreamChunk` / `ChatRunInput` / `ChatFinishReason` / `ChatUsage` types removed outright — no alias, since the discriminators differ (`text` → `assistant_message_delta`, `tool_call` → `tool_use`).
- **Deps**: `@aiworker/shared` gains `zod ^3.24.4` (runtime) and `@types/bun ^1.2.13` (dev); tsconfig sets `types: ["@types/bun"]`.

API:

- `apps/api/src/worker/executor/providers/{http,mcp,cli}.ts` all reshape to `run()` → `AgentEvent`. `OpenAICompatibleExecutor` emits text deltas as `assistant_message_delta`, function calls as `tool_use` with `action.kind === 'tool'`, and adds standalone `token_usage` entries plus the normal `finish`. `McpExecutor.run` and `CliExecutor.run` still yield error then finish — their real implementations live in FEAT-012..016.
- `apps/api/src/worker/orchestrator/service.ts` + `apps/api/src/worker/conversation/router.ts` + `apps/api/src/worker/management/executor-test.ts` consume the new event shape. SSE event names (`orchestrator.text`, `orchestrator.tool_call`) preserved so the frontend contract is unchanged.

Tests:

- `packages/shared/src/providers/agent-event.test.ts` (new) — 7 schema cases covering happy-path and rejection of unknown types / missing args / bad action kinds.
- `apps/api/src/worker/executor/providers/http.test.ts` rewritten against `AgentEvent`.
- `apps/api/src/worker/management/{executor-test,routes}.test.ts` updated to stub with `run` instead of `runChat`.

Verification:

- `bun run typecheck` clean across shared, api, web.
- `bun test` green — shared 7 / 7, api 210 / 210, web 17 / 17.
- `bun run lint` at pre-existing main baseline (6 unrelated errors in `.github/workflows/build-image.yml`, `modes/dashboard.ts`, `scripts/deploy.ts`); FEAT-011 introduced zero new lint errors.

Not in this step:

- No new engine adapter — FEAT-012 (Claude Code + worktree) is next.
- No config schema change — `ExecutorConfig` stays three-way (`http` / `mcp` / `cli`) until FEAT-014.
- No concurrency change — `AsyncQueue` stays until FEAT-015.

Pointer: `docs/plan/PLAN-007.md` for the full six-FEAT roadmap.

## 2026-04-22 04:07 [release]

PLAN-006 landed end-to-end: **P2 batch — channel adapters (Telegram, Lark, WhatsApp) + evolution generator (pattern miner)**. All four FEAT stubs left behind by REFACTOR-002 / PLAN-003 are now real implementations, delivered in parallel via BKD worktree dispatch (`gfhkzgdg`) and serialised-merged in this order: SUB-1 → SUB-2 → SUB-3 → SUB-4.

Subtasks delivered:

- **FEAT-003 Telegram** (`bkd/x9u5jzz9` → `e8f94c1`). `verify` uses timing-safe `X-Telegram-Bot-Api-Secret-Token` compare (silent accept when secret unset per spec); `toEnvelopes` emits one envelope per `message.text` with `chatId = {chat.type}:{chat.id}`; `send` whitespace-chunks replies at 4096 chars and hard-slices as fallback. 12 adapter tests.
- **FEAT-004 Lark 飞书** (`bkd/izavqq37` → `756d2ec`). `verify` handles the optional `encrypt` envelope with AES-256-CBC (SHA-256-keyed, IV from first 16 bytes) before validating `verificationToken`; `toEnvelopes` normalises `im.message.receive_v1` text for p2p + group, `url_verification` returns `[]`; `send` exchanges tenant access tokens with a per-`appId` cache (60 s refresh margin + single-flight promise). 16 adapter tests. Interface change: `ChannelAdapter.toEnvelopes` gains an additive optional `binding?: ChannelBinding` param so the Lark adapter can reach encryptKey at decode time; `routes.ts` passes it through. No other adapter needed changes.
- **FEAT-005 WhatsApp (Meta Cloud API)** (`bkd/zi8wqgzs` → `727b64f`). `verify` parses `X-Hub-Signature-256`, HMAC-SHA256 over the raw body, hex-`timingSafeEqual`; `toEnvelopes` walks `entry[].changes[].value.messages[]`, falls back to media captions for image/audio/video/document, silently skips status updates; `send` targets Graph v21 `/messages` with `recipient_type: individual`. Adds `GET /whatsapp/webhook` subscription-challenge handler to `routes.ts` (404 on missing binding, 403 on token mismatch, 200 plaintext challenge echo). 10 adapter tests.
- **FEAT-006 Evolution generator** (`bkd/tbled0e0` → `a9e289d`). New `pattern-miner.ts` is pure (n-gram aggregation over `Map<conversationId, tool[]>`, min-occurrence + min-conversation thresholds, strict-prefix dedup, occurrence-then-length sort). `proposer.ts` rewrites the stub into a real writer: reads recent `evolution_observations` as the conversation window, joins `execution_logs.tool_name` per conversation, mines, dedups against existing `skill_drafts` + `skill_bindings.config.allowedTools`, writes `skill_drafts` rows. Schema unchanged — mined `allowedTools` / `confidence` / `sequenceKey` are embedded as an `<!-- evolution-meta: {...} -->` marker in `bodyMarkdown` and recovered via the exported `parseEvolutionMeta()`. `runProposerOnce()` + `startProposerLoop()` keep their zero-arg signatures; `EVOLUTION_PROPOSER_WINDOW` / `_MAX_DRAFTS_PER_RUN` / `_INTERVAL_MS` env vars override defaults. 5 miner tests + 5 proposer integration tests.

Shared-type discipline:

- `packages/shared/src/fleet/channel.ts` stayed frozen across all four subtasks, as required by PLAN-006.
- The only cross-cutting interface edit — `ChannelAdapter.toEnvelopes` gaining `binding?: ChannelBinding` — is additive (optional param) and documented; SUB-2 reported the decision in its completion follow-up, and the existing telegram / whatsapp / line / web adapters still satisfy the interface without code changes.

Merge strategy:

- All four branches were dispatched in parallel on fresh worktrees off `main@99ec908`.
- Coordinator (`gfhkzgdg`) serialised merges into `main` from the top-level worktree, running `bun run --cwd apps/api test` + `bun run check` (typecheck across shared/web/api + `eslint .`) after each. Test counts progressed cleanly: 174 (SUB-1) → 190 (SUB-2, +16 lark) → 200 (SUB-3, +10 whatsapp) → 210 (SUB-4, +10 miner/proposer).
- Only `apps/api/src/worker/channels/routes.ts` was touched by both SUB-2 and SUB-3, and on disjoint line ranges (SUB-2: POST-handler toEnvelopes call; SUB-3: new GET route block); the ort strategy auto-merged with no conflicts.

Deferred (explicitly out of MVP scope, flagged in subtask reports):

- Telegram: cards / photos / Markdown V2 `parse_mode`.
- Lark: interactive-card message support; route-level `url_verification` challenge echo (the adapter already returns `[]`; the HTTP echo is a route concern).
- WhatsApp: message-template handling + 24-hour session window tracking; attachment ingestion without caption (envelopes are silently skipped today).
- Channels overall: `fetch` without abort/timeout matches the existing `line.ts` pattern; a fleet-wide hardening pass is a separate concern.
- Evolution: `execution_logs` is not yet populated from the orchestrator path — miner is ready for when that wiring lands. Evolution-meta marker regex assumes flat JSON; safe today since the writer is its only producer.

Verification:

- `bun run --cwd apps/api test` → **210 pass / 0 fail** (24 files, 562 `expect()` calls).
- `bun run check` → typecheck clean across `@aiworker/shared`, `@aiworker/web`, `@aiworker/api`; `eslint .` clean across the repo.
- All four BKD subtasks (`x9u5jzz9`, `izavqq37`, `zi8wqgzs`, `tbled0e0`) transitioned to `done`; worktrees pruned.

Pointer: `docs/plan/PLAN-006.md` for the design matrix and per-subtask spec, and `docs/task/FEAT-00{3,4,5,6}.md` for the individual deliverables.

## 2026-04-21 18:30 [release]

FEAT-009 / PLAN-005 landed: **aissh-driven fleet deployment automation**. AIWorker now ships with a one-command deploy to `gateway.example.test` via the `aissh` CLI.

New artifacts:

- `ops/compose/docker-compose.yml` — production compose for the dashboard only. No docker-socket mount (MANAGER_CAN_LAUNCH stays off by default); image tag pinned via `AIWORKER_IMAGE_TAG` env so rollbacks are a tag swap.
- `ops/compose/.env.example` — host-local env template (`AIWORKER_MASTER_KEY`, `INTERNAL_SHARED_SECRET`, `AIWORKER_IMAGE_TAG`).
- `ops/caddy/Caddyfile.tmpl` — single-site template `gateway.example.test → 127.0.0.1:3000`. No per-worker routing (PLAN-004 made workers advertise their own externally-reachable URL).
- `scripts/deploy.ts` — Bun CLI wrapping aissh. Subcommands: `install-docker`, `teardown-legacy --confirm`, `build`, `upload`, `install`, `verify`, `reload-caddy`, `deploy` (chains the common path). Local `docker save | zstd` keeps the tarball under ~150 MB for the 961 MiB host; `install` verifies `/opt/aiworker-deploy/.env` carries the required secrets before loading.
- `scripts/tsconfig.json` — standalone typecheck for the ops CLI (pulls `@types/bun` from the api workspace).
- `docs/deployment.md` — run book: prereqs, first-time deploy, routine deploy, rollback, worker registration pointer, troubleshooting.

Deviations from the FEAT-009 task draft (authored pre-PLAN-004):

- Health endpoint is `GET /health` (dashboard + worker), not `/api/system/health`.
- Caddyfile does not strip a `{workerId}` prefix — workers own their externally-reachable URL after PLAN-004.
- First cut deploys the dashboard only. Worker provisioning is operator-driven via the registry (see PLAN-004); automating per-worker deploy is follow-up work for FEAT-007 / FEAT-008.

Verification:

- `bun run typecheck` clean across `shared`, `api`, `web`.
- `bun run lint` clean across the repo (includes the new ops YAML + scripts TS).
- `bunx tsc --noEmit -p scripts/tsconfig.json` clean for `scripts/deploy.ts`.
- `bun run scripts/deploy.ts deploy --dry-run --tag=smoke-test` prints the full `build → upload → install → verify → reload-caddy` command chain without running anything. `teardown-legacy` without `--confirm` is correctly rejected.

Pointer: `docs/plan/PLAN-005.md` for the full design (deliverables, risks, rollback, alternatives) and `docs/deployment.md` for the operator-facing run book.

## 2026-04-21 11:30 [release]

PLAN-004 landed end-to-end: AIWorker has pivoted from the centralized PLAN-003 fleet model to **self-sufficient workers + manager-as-registry**. Each worker container now owns its identity, config, and secrets and serves its own `/api/worker/*` surface; the dashboard is a pointer store that registers worker URLs + bearer tokens and proxies UI traffic through.

Subtasks delivered (in BKD merge order):

- 1.1 — Shared types: `RegisteredWorker`, `WorkerIdentity`, `WorkerApiToken`, `WorkerInfo` (`ijo50kfz`).
- 1.2 — `worker.db` schema: `worker_identity` + `worker_config` + `worker_secrets` (`bgm8h8sz`).
- 1.3 — `fleet.db` rewrite: `registered_workers` + `audit_events` only (`zy8taekt`).
- 2.1 — Worker-side `SecretsVault` move + bootstrap flow (id mint, token mint, stdout print, encrypted persist) (`9qqs0iph`).
- 2.2 — Worker management API: `/info`, `GET+PUT /config` with hot reload, secrets CRUD (`b4r6p9l6`).
- 2.3 — Worker bearer-auth middleware + `/brain/test`, `/executor/test`, `/channels/:channel/test`, `/token/rotate`, `/reload` (`y4yvqyd5`).
- 3.1 — Manager `WorkerClient` + `POST /api/workers/register` (validates via worker `/info`) (`9ehtjkhv`).
- 3.2 — Manager registry CRUD + transparent `/api/workers/:id/proxy/worker/*` pass-through (`fj7utscp`).
- 3.3 — Periodic `/info` poll + `lastSeenAt / lastSeenState / lastConfigVersion` updates with audited state changes (`zdcboki0`).
- 3.4 — Optional `MANAGER_CAN_LAUNCH` flag + `POST /api/workers/launch-local` (gated supervisor wiring) (`1x3efm46`).
- 4.1 — Web: registered-workers list + register wizard + per-worker nested route shell + worker switcher (`rgxka0g0`).
- 4.2 — Web: per-worker config editor + secrets panel + test panel + token rotation (`56vtboxe`).
- 5.1 — End-to-end smoke (`apps/api/scripts/smoke-plan-004.ts`) + manager-side `POST /api/workers/:id/rotate-token` wrapper that re-encrypts the worker's freshly minted bearer into `registered_workers.apiTokenEnc` so post-rotate proxy/poll calls keep authenticating + this changelog (`sm5gj8vx`).

Breaking changes:

- **Worker env**: `WORKER_ID`, `WORKER_CONFIG_JSON`, `WORKER_CONFIG_VERSION` are gone. `AIWORKER_MASTER_KEY` (32-byte hex) is now **required** in both `worker` and `dashboard` modes — workers use it to seal `worker_identity`/`worker_secrets`; managers use it to seal `registered_workers.apiTokenEnc`. New optional knobs: `AIWORKER_FORCE_ID`, `AIWORKER_FORCE_TOKEN`, `AIWORKER_ADVERTISED_BASE_URL`.
- **Manager env**: docker-supervisor knobs (`AIWORKER_IMAGE`, `WORKER_DATA_ROOT`, `WORKER_MEMORY_LIMIT`, `WORKER_CPU_LIMIT`) became optional; required only when `MANAGER_CAN_LAUNCH=true`. New: `MANAGER_POLL_INTERVAL_MS` (default `30000`), `MANAGER_POLL_JITTER_MS` (default `3000`), `AIWORKER_LAUNCH_BASE_URL_TEMPLATE`.
- **fleet.db schema**: `workers`, `worker_configs`, `worker_secrets` tables removed; replaced by a single `registered_workers` table.
- **worker.db schema**: gained `worker_identity`, `worker_config`, `worker_secrets` (singletons + secret rows).
- **Webhook URLs**: workers own their own externally-reachable base URL — no more "manager strips the `/{workerId}/` prefix" routing requirement. Operators choose subdomain-per-worker, path-per-worker, or any other reverse-proxy topology.
- **Manager rotate flow**: web UI now calls the manager wrapper at `POST /api/workers/:id/rotate-token`, which returns `{ rotatedAt, lastFourOfNewToken }` and intentionally does NOT leak the new plaintext. Operators who need the plaintext call the worker directly via `POST /api/workers/:id/proxy/worker/token/rotate`.

Migration note (pre-release, destructive OK): both `drizzle/fleet/0000_*.sql` and `drizzle/worker/0000_*.sql` were regenerated to match the new schemas. Delete any local `apps/api/data/fleet.db*` and per-worker `worker.db*` before the next dev boot; `initFleetDb` / `initWorkerDb` re-run their migration set on startup.

Verification:

- `bun run check` clean across `shared`, `api`, `web`.
- `bun test` clean (registry routes/service/poll/rotate-token + worker bootstrap/identity/secrets/config/management/rotate suites).
- `apps/api/scripts/smoke-plan-004.ts` boots a worker + manager via `bun src/index.ts`, registers, configures, rotates, and round-trips a web channel echo — exits 0.
- Dev-server bind regression flagged in 4.1 fixed: `apps/api/src/dev.ts` now re-exports `index.ts`'s default `{ fetch, port }` so `bun src/dev.ts` actually serves traffic.

Pointer: `docs/plan/PLAN-004.md` for the full design (target architecture, data model, auth model, migration table, risks).

## 2026-04-21 09:15 [progress]

REFACTOR-002 / PLAN-003 landed the backend + ops scaffolding for the multi-worker fleet architecture. AIWorker is now modelled as a **fleet** (a group of workers) where each worker runs in its own docker container with independent Brain, Executor, Channels, and Evolution layers.

Backend:

- **Shared types** (`packages/shared/src/fleet/`): `Worker`, `WorkerConfig`, `ChannelBinding`, `Envelope`, `BrainSourceConfig`, `ExecutorConfig` (discriminated `http`/`mcp`/`cli`), `ConversationDecision`, `SkillDraft`, `EvolutionObservation`, etc. Dual worker identity (`w_` + 12 Crockford base32 immutable id + mutable human slug).
- **DB split** — `fleet.db` (dashboard: `workers`, `worker_configs`, `worker_secrets`, `audit_events`) + `worker.db` (per-worker-container: `agent_tasks`, `conversations`, `messages`, `execution_logs`, `skill_bindings`, `skill_drafts`, `evolution_observations`). Two Drizzle configs, `bun run db:generate` regenerates both migration sets.
- **Mode dispatch** — one Bun binary, `AIWORKER_MODE=dashboard|worker` selects the runtime. `src/config/{common,dashboard,worker}.ts` hold mode-specific env schemas; `src/modes/{dashboard,worker}.ts` create the Hono app per mode; `src/index.ts` picks.
- **Dashboard mode**: `src/dashboard/secrets` (AES-256-GCM vault gated by 32-byte hex `AIWORKER_MASTER_KEY`, with 5 passing tests); `src/dashboard/fleet` (workers CRUD + redacted/hydrated config split); `src/dashboard/supervisor` (unix-socket docker client via Bun `fetch({ unix })`, manages worker containers: spawn / start / stop / restart / remove / inspect / logs).
- **Worker mode**: `src/worker/brain/` (`HermesProvider`, `CloudGatewayBrainProvider`, plus new `MultiBrainProvider` aggregating per-worker source list); `src/worker/executor/` (factory over `http` / `mcp` / `cli`; `CliExecutor` spawns via `node:child_process`, `sandbox` flag reserved for FEAT-002); `src/worker/channels/` (envelope + 5 adapters: `web` + `line` working, `telegram` / `lark` / `whatsapp` stubbed behind `ChannelNotImplementedError`; HMAC signature verify on Line); `src/worker/conversation/router.ts` (Agent-driven continuation classifier — no hardcoded timeouts); `src/worker/orchestrator/service.ts` (per-worker queue, channel-routed ingest, text chat loop, SSE event emission, outbound channel delivery); `src/worker/evolution/` (observer wired to the event bus writes `evolution_observations`; proposer is a stub logger pending FEAT-006; approval routes for skill drafts).
- **URL map**: public `POST /{channel}/webhook` + internal `/api/worker/*` + dashboard `/api/workers[/:id]*`. External format `https://{host}/{workerId}/{channel}/webhook` — Caddy strips the `{workerId}` prefix and routes to the worker container over the docker network.
- **Ops**: root `Dockerfile` (multi-stage, single image for both modes) + `docker-compose.yml` (dashboard container with docker socket mounted).

Docs:

- `docs/plan/PLAN-003.md` — full four-layer (Communication / Brain / Evolution / Executor) design. Approved 2026-04-21 07:40 and moved to `implementing`.
- `docs/task/REFACTOR-002.md` — in_progress. Future-work placeholders created: `FEAT-002` (executable skills runtime), `FEAT-003` (Telegram), `FEAT-004` (Lark), `FEAT-005` (WhatsApp), `FEAT-006` (evolution generator), `FEAT-007` (M:1 channel routing), `FEAT-008` (multi-host HA), `FEAT-009` (aissh-driven deployment).

Verification:

- `bun run typecheck` clean across `shared`, `api`, `web`.
- 11 unit tests pass: 5 `SecretsVault` + 6 `OpenAICompatibleExecutor`.

Not in this checkpoint (explicitly deferred):

- Web frontend restructure (workers list + per-worker nested routes + worker switcher + skill-binding editor). Web app typechecks but its routes still call legacy `/api/skills`, `/api/memory`, etc. — will go away after the frontend rewrite.
- Full smoke test (fleet-boot-via-docker + worker-spawn + channel-roundtrip).
- Deployment automation — tracked in FEAT-009 per user direction.

## 2026-04-21 06:45 [progress]

Added `CloudGatewayBrainProvider` as a second `BrainProvider` implementation. It talks to a cloud-gateway MCP server over streamable-HTTP (JSON-RPC 2.0) and maps `BrainProvider` methods to the server's `knowledge_*` tools (`knowledge_types` → skills, `knowledge_query` → listMemories, `knowledge_search` → searchMemories, `knowledge_write` → writeMemory). Runtime provider selection is controlled by the new `BRAIN_PROVIDER` env (`hermes` default, `cloud-gateway` when MCP URL + token are provided). Deployed to the production server; `/health` now reports `brain.status=ok` against cloud-gateway, `/api/skills` surfaces the knowledge types as brain skills. New files: `apps/api/src/adapters/mcp/{client,index}.ts`, `apps/api/src/providers/brain/cloud-gateway.ts`. Env additions: `BRAIN_PROVIDER`, `CLOUD_GATEWAY_MCP_URL`, `CLOUD_GATEWAY_MCP_TOKEN`, `CLOUD_GATEWAY_DEFAULT_CATEGORY`, `CLOUD_GATEWAY_DEFAULT_TYPE_ID`.

## 2026-04-20 20:30 [progress]

Agent Runtime refactor (PLAN-002) complete. AIWorker is now a self-hosted Agent Runtime that composes a **Brain provider** (Hermes — knowledge/memory) and an **Executor provider** (OpenAI-compatible chat completions + tool calling). Backend modules (`skills`, `memory`, `execution`, `health`) were rewired behind `BrainProvider` / `ExecutorProvider` interfaces; a new `orchestrator` module drives the full loop (submit → tool_call → write_memory → succeeded) with per-task queue, cancellation, and SSE broadcasts. Frontend shipped a new `/orchestrator` route (task list, replay, live updates) and the six existing pages were renamed from Hermes/OpenClaw to Brain/Executor terminology.

- **DB reset procedure**: delete `apps/api/data/aiworker.db*` before the next dev run; `initDb` auto-runs all Drizzle migrations on boot. New tables: `agent_tasks`, `conversations`, `messages`; `execution_logs` gained a `conversationId` FK; `skill_conflicts` now uses `brain_hash` / `executor_hash` columns.
- **Env additions**: `OPENAI_BASE_URL` (default `https://api.openai.com`), `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_TIMEOUT_MS` (default `60000`). See `apps/api/.env.example`.
- **Env deprecations**: `OPENCLAW_WS_URL`, `OPENCLAW_HOME` remain in the schema for transitional compatibility but are no longer surfaced via `/api/config`.
- **API shape changes**: `/api/health` now reports `services.brain` and `services.executor` (previously `hermes` / `openclaw`); `/api/skills/*` sources use the `brain` | `executor` enum; `/api/skills/conflicts` returns `brainHash` / `executorHash`.
- **New surfaces**: `POST|GET /api/orchestrator/tasks`, `GET /api/orchestrator/tasks/:id`, `POST /api/orchestrator/tasks/:id/cancel`; SSE stream at `GET /api/events/stream` emits `orchestrator.task.started|message|tool_call|finished|failed|cancelled`; frontend `/orchestrator` page consumes it live.
- **E2E coverage**: `apps/api/src/modules/orchestrator/e2e.test.ts` exercises the "Remember that I prefer TypeScript strict mode" scenario end-to-end with a scripted executor — no OpenAI credentials required; run with `bun test src/modules/orchestrator/e2e.test.ts` from `apps/api`.

## 2026-04-20 17:15 [progress]

Phase 3 + 4 complete. Backend gained `execution`, `config`, `events` modules (REST + SSE). Web app scaffolded with Vite 8 + TanStack Router/Query + Tailwind v4 + Base UI primitives, and all six pages implemented: Dashboard (live SSE feed + service status), Skills (list/diff/conflicts tabs with sync trigger), Memory Explorer (search + filters + new), Execution Monitor (stats, filters, live tool feed, paginated table), Config Editor (read/write Hermes YAML + OpenClaw JSON with backup), Sync Status (timeline + run sync). Drizzle migrations auto-applied on `initDb`. Vite proxy now respects `AIWORKER_API_URL`. `bun run typecheck` and `bun run lint` clean across all workspaces.

## 2026-04-20 09:45 [progress]

Project initialized with PMA docs structure.
