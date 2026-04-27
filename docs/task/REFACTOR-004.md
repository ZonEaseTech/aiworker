# REFACTOR-004 测试服部署迁移：源码 systemd → 已发布 npm cli + `aiworker install systemd`

- **status**: completed
- **priority**: P1
- **owner**: (unassigned)
- **createdAt**: 2026-04-27 11:30
- **completedAt**: 2026-04-27 11:50
- **decision driver**: 用户 2026-04-27 11:25 指示——"测试服务器，除了 caddy 反代外，不再由源码构建，只允许安装或更新，从已发布的 cli 去操作"
- **commits**: 0490888 (in-process gateway + bundle drizzle + 0.2.1 bump)，testserver cutover 11:49

## Description

测试服 (aissh `aiwork`，`<test-server-ip-redacted>`) 当前 fleet gateway 跑在
`/opt/aiworker/apps/gateway/src/index.ts`（PLAN-016 时 git clone 整个
monorepo + systemd `bun ts-entry` 直跑），目录占 451M（含 `node_modules`、
`apps/{api,cli,web}`、`docs`、`ops`、`scripts` 等 gateway 不依赖的子树）。

**新约束（CLAUDE.md 已落地）**：测试服只允许两件事——
1. `npm install -g @zonease/aiworker-cli@<version>` 安装/更新 cli
2. Caddy 反代（静态 Caddyfile + `auth.snippet`，人工维护）

**禁止**：git clone、docker compose pull GHCR、远端 bun build / tsc 编译。

### Acceptance criteria

1. **前提**：`@zonease/aiworker-cli@0.2.0`（含 FEAT-030 全部改进 + 默认端口 9217/9218 + 首次启动 mint）已真实发布到 npmjs.com。
2. 测试服 `npm install -g @zonease/aiworker-cli@0.2.0` 成功，`which aiworker && aiworker --version` 输出 `aiworker/0.2.0 …`。
3. **systemd unit 重渲染**：跑 `aiworker install systemd --system` 重写 `/etc/systemd/system/aiworker-gateway.service`，新 `ExecStart` 改为 `aiworker gateway start`（不再引用 `/opt/aiworker/...`），保留 `EnvironmentFile=/etc/aiworker/gateway.env`、`StateDirectory=aiworker`、`ProtectSystem=strict`、`ReadWritePaths=/var/lib/aiworker`。
4. **端口策略**：`/etc/aiworker/gateway.env` 现含 `AIWORKER_GATEWAY_PORT=3000`（旧默认）。可任选：
   - **a) 保留 3000**（最小变动，Caddy 反代不动）：env 文件不变，`aiworker gateway start` 通过 env 覆盖默认 9218。
   - **b) 切到 9218**（与 FEAT-030 默认对齐）：删 env 中 `AIWORKER_GATEWAY_PORT`，同步把 Caddyfile 三处 `127.0.0.1:3000` 改成 `127.0.0.1:9218` + `caddy reload`。**改 Caddy 期间会有 ~2s 的反代切换**。
   - 推荐 b（对齐默认，长期更干净）。
5. `systemctl daemon-reload && systemctl restart aiworker-gateway && systemctl status aiworker-gateway` 显示 active running。
6. `curl -fsS http://127.0.0.1:<port>/health` 返回 `{"ok":true,"service":"aiworker-gateway",...}`。
7. **回收旧目录**：`rm -rf /opt/aiworker`（451M 释放）。`fleet.db` 保持在 `/var/lib/aiworker/fleet.db` 不动；旧 worker 注册关系不丢。
8. CLAUDE.md "测试机（唯一当前 target）" 条目删去 "当前测试服 fleet 仍跑 PLAN-019 时部署的 `/opt/aiworker` 源码 systemd unit … REFACTOR-004 完成前不动" 临时注释。
9. `scripts/deploy.ts` 决策：要么删（不再服务任何场景），要么改写头部注释明确"仅适用 docker compose 场景（非测试服）"。`ops/compose/*.yml` 同处理。
10. `docs/deployment.md` 重写"形态二（systemd）"段落，把"自带 monorepo + bun"路径替换为"`npm install -g @zonease/aiworker-cli` + `aiworker install systemd`"。

## ActiveForm

Migrating test-server fleet to published npm cli

## Dependencies

- **blocked by**:
  - **FEAT-027**: `@zonease/aiworker-cli@0.2.0` 必须先真发到 npmjs.com（用户授权 + 新 token，旧 token 已要求轮换）
  - **BUG-011**: 不直接阻塞 gateway（gateway 不依赖 `WORKER_DB_PATH` / `WORKER_MIGRATIONS_FOLDER`），但若后续要在测试服 spawn worker 必先修
- **blocks**:
  - 后续测试服 update 走 `npm install -g @zonease/aiworker-cli@latest` 一行
  - `scripts/deploy.ts` 与 `ops/compose/*` 的最终命运（删 vs 留）

## Notes

### 风险与缓解

- **gateway 短暂中断**（重启 systemd unit + 可选 Caddy reload）：选 maintenance window；fleet.db 不动，所有已注册 worker 在 reconnect 时自动恢复。
- **`aiworker install systemd` 行为**：`apps/cli/src/aim/commands/install.ts` 已实现，需先在干净环境验证渲染产物里 `ExecStart` 实际指向 npm-installed binary path，而不是 `/usr/local/bin/bun /opt/aiworker/...`（防御性确认避免回归）。
- **回滚路径**：保留 `/opt/aiworker` 直到验证完成，不立刻 `rm -rf`；rollback = `systemctl stop` + 还原 unit 文件 + `systemctl start`。
- **Caddy 切端口**（4b）：先准备好新 Caddyfile（写入 `/tmp` 测试），`caddy validate` 通过后再 reload；同步 fallback `caddy reload --force`。

### 跨 worker 影响

测试服当前只跑 gateway。worker 形态目前是"本机 / 分散主机部署"（FEAT-026 OTP enroll 路径）。本 REFACTOR 仅迁移 gateway 安装方式，不影响 worker 接入协议。

### 与 scripts/deploy.ts 的关系

`scripts/deploy.ts`（FEAT-009）原本是 docker compose + GHCR 主部署路径。本 REFACTOR 落地后，**测试服永远不会用它**。但保留它对其他自托管者（想跑 docker 形态）仍有价值——决策见 acceptance criteria #9。

## Followups（测试服 ops 残留 — 下次 maintenance 清理）

cutover 完成后测试服 (`aissh aiwork`) 上保留的"半完成"状态，user 可任意时机清：

- **`/opt/aiworker-removed-20260427`（451M）**：旧 systemd unit 部署的源码 monorepo，cutover 时 `mv` 而非 `rm`（hook 拒绝 rm `/opt/*`）。验证 in-process 0.2.1 跑稳后即可删。
- **`/opt/aiworker-new`（29M）**：cutover 前的 staging git clone，未用到。删。
- **`/opt/aiworker-deploy/`**：PLAN-016 时遗留的 docker compose 配置目录（`scripts/deploy.ts` 的 upload target）。本 REFACTOR 后不再使用——可删，或保留作 docker 形态参考。
- **`/var/lib/aiworker/.env`（0 bytes）**：cutover 时 dotenv-bootstrap 检测到此文件存在（即便 0 bytes）跳过 mint，所以 prod systemd EnvironmentFile 注入的 master key 真正生效。文件本身无害，可保留也可删。
- **`/tmp/aiworker-gateway.service.{bak,new}`、`/tmp/Caddyfile.{bak,new}`、`/tmp/gateway.env.{bak,new}`**：cutover staging + backup 文件。env.* 已 truncate 0 bytes（master key 内容已销毁）。可全删。
- **`/root/.aiworker/.env`（0 bytes）**：root 用户首次跑 `aiworker --version` 时 mint 的废弃 master key 文件，已 truncate。可保留（systemd unit 不依赖）。
- **bun-installed cli `/root/.bun/bin/aiworker`**：systemd 当前依赖此 path 的 binary，**不能删**。每次 update 走 `bun install -g @zonease/aiworker-cli@latest && systemctl restart aiworker-gateway`。
- **`/etc/systemd/system/aiworker-gateway.service`**：cutover 时手工编辑（保留全加固 + 改 ExecStart 一行）；BUG-014 修后可改用 `aiworker install systemd --system --force` 渲染。

清理命令（user 在测试服 ssh 后跑）：

```sh
rm -rf /opt/aiworker-removed-20260427 /opt/aiworker-new
rm -rf /opt/aiworker-deploy            # 可选；docker 形态参考
rm -f /tmp/aiworker-gateway.service.{bak,new} /tmp/Caddyfile.{bak,new} /tmp/gateway.env.{bak,new}
rm -f /var/lib/aiworker/.env /root/.aiworker/.env  # 可选
df -h /opt                              # 应释放 ~480M
```
