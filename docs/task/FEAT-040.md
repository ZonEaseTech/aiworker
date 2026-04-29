# FEAT-040 Fleet 统一入口管理非同 host worker

- **status**: pending
- **priority**: P1
- **owner**: (未分配)
- **createdAt**: 2026-04-29 18:10
- **plan**: PLAN-042

## 描述

把 fleet 明确升级为公网唯一中枢入口：operator 通过 fleet 域名管理已 pair / enroll 的 worker，即使 worker 不在同一台 host、同一内网，甚至只有 outbound WebSocket 连接，也应能被 fleet 管理。

目标不是把浏览器重定向到 worker 自己的 `baseUrl`，而是在 fleet gateway 下提供受控 worker 管理入口，例如：

```text
https://aiw.jbcnet.co.jp/admin/          # fleet 管理面
https://aiw.jbcnet.co.jp/w/<workerId>/   # 某个 worker 的管理入口
```

所有 worker 管理请求仍由 fleet 进行鉴权、审计、路由和转发；worker 的 config、secrets、conversations、messages 等业务数据继续留在 `worker.db`，不落入 `fleet.db`。

首期不引入额外 public baseUrl 配置：对外管理地址直接由 `workerId` 派生。只要 worker 已 pair / enroll，fleet 默认提供 `/w/<workerId>/` 代理；worker 是否与 fleet 同 host 不应影响入口形态。

## 验收标准

1. `https://<fleet-domain>/w/<workerId>/` 能作为 worker 管理入口，根路径 `/<workerId>` 仅作为可选兼容重定向，且只匹配合法 `WORKER_ID_PATTERN`。
2. pair / enroll 成功后默认启用 `/w/<workerId>/` 代理入口；不要求 operator 额外配置 worker public baseUrl。
3. 浏览器永不获得 worker bearer token；gateway 服务端负责按 workerId 路由并注入必要身份。
4. `fleet.db` 仍只保存 worker 指针、加密 token 和 audit，不保存 worker config、secrets、messages、conversations。
5. worker 管理能力优先通过 gateway proto / WS 方法实现；现有 `baseUrl` 只保留为兼容字段或未来优化，不作为首期路由依据。
6. 公网部署下 `/admin/*`、`/w/*`、`/ws`、`/api/*` 等入口必须继续 fail-closed，依赖 Cloudflare Access / Caddy auth / 等效外部鉴权层。
7. 所有跨 worker 管理请求有 audit：operator、workerId、method/path、结果、耗时、错误码。
8. Worker UI 在 fleet-hosted 模式下使用 same-origin gateway bridge，不再直连 `/api/worker/*` 的真实 worker host。
9. SSE / 长连接能力有明确超时、取消和 backpressure 策略，避免单个 operator 拖垮 gateway。

## 依赖

- **blocked by**: 用户批准 PLAN-042
- **relates to**: FEAT-032, PLAN-022, FEAT-033, FEAT-034, FEAT-035, BUG-013, BUG-019, BUG-020, FEAT-024, FEAT-026
- **blocks**: Fleet 单域名管理体验、NAT 后 worker 管理、worker admin 公网入口收敛

## 笔记

- 2026-04-29 18:10：根据讨论确认方向：非同 host worker 可以被 fleet 管理，关键是 worker 主动连 fleet gateway；路径级 worker admin 应放在 fleet 域名下，但主线应走 gateway-native WS/RPC，而不是依赖 gateway 反向直连 worker。
- 2026-04-29 18:18：收窄方案：对外地址直接用 `workerId` 派生，pair / enroll 后默认代理 `/w/<workerId>/`；首期不围绕 `baseUrl` 做复杂 fallback 设计。
