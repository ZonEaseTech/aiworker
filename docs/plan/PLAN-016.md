# PLAN-016 Deployment reshape — CLI-first install, docker as optional fast-launch

- **status**: draft
- **createdAt**: 2026-04-24 19:15
- **relatedTask**: REFACTOR-003
- **dependsOn**: PLAN-013（gateway/aim/aiw 已就位，CLI 形态成立）

## Why

PLAN-013 让 manager 控制面切到 WS gateway（`aim gateway start` 直接 run），但 `scripts/deploy.ts` + `ops/compose/docker-compose.yml` + `docs/deployment.md` 还停在 PLAN-005/PLAN-009 时代的"GHCR 镜像 + Caddy 公网终止 + `gateway.example.test`"SaaS 部署模型上。这跟 hermes / openclaw 的 CLI-first 哲学是错位的——两边都没有"production deploy"概念，就是 `npm i -g` / `curl install.sh` 在用户机器上跑，远程访问走 Tailscale / SSH tunnel。

## Goal

把"如何把 aiworker 部署起来"重新定义成三个并列档位，docker 从默认降级为可选：

1. **裸跑（main path）**：`bun install -g @aiworker/cli`（或 `bun build --compile` 单 binary）→ `aim gateway start`，systemd unit / launchd / 直接前台。无 docker、无公网、无 Caddy。
2. **systemd 服务化**：在 Linux 主机上用 systemd unit 把 gateway / worker 跑成长期服务。有 `aim install systemd` 子命令一键写 unit + enable。
3. **docker（可选 fast-launch）**：现有 `ops/compose/` + `scripts/deploy.ts` 保留，但定位降为"懒人快速试用"或"`aim workers launch` per-worker docker 隔离"，不是 canonical deploy 路径。

## Scope（待 PLAN-014/015 落完后细化）

- `docs/deployment.md` 重写：三档分开，主路径是裸跑。
- `aim install systemd [--user|--system]`：渲染 unit 到 `/etc/systemd/system/aiworker-gateway.service`（或用户 unit），`systemctl enable --now`。
- `aim install --help` 启始 docs/install.md 的入口。
- `scripts/deploy.ts` 文案整体降级（`docker compose deploy` 而不是 `deploy`），保留实现。
- `ops/compose/docker-compose.yml` 的注释顶部加"optional fast-launch"声明。
- `Dockerfile` 的 ENTRYPOINT/CMD 维持 worker 模式，gateway 模式留 compose 显式 `command:` 覆盖（已是这样）。
- 把 `gateway.example.test` + Cloudflare 橙云 + Caddy `:80 → :3000` 单独拆到 `docs/deployment-public-https.md`，标注"仅当需要把 channel webhook 暴露公网时才装"。

## Out of scope

- 真正打 binary（`bun build --compile` + GitHub Releases artefact）— 留给 PLAN-017 或 PLAN-014 之后再排。
- 任何代码改动；本 plan 主要是 docs + 一个轻量 `aim install` 命令。
- 旧 GHCR 镜像下线；保留兼容性。

## Acceptance criteria（草拟）

- 新读者读 `docs/deployment.md` 能在 5 分钟内得出"我应该 `aim install systemd` 而不是 `docker compose pull`"的结论。
- `aim install systemd` 能在 Linux 上幂等写 unit 并 `systemctl enable --now`，不破坏现有 docker 部署。
- `bun run check` 绿，无新依赖（systemd unit 渲染纯字符串模板）。
