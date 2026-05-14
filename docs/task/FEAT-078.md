# FEAT-078 Identity boundary

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14 11:41
- **plan**: PLAN-310
- **relatesTo**: FEAT-076, FEAT-077, packages/core, apps/api

## 背景

Host local daemon 目前用 inline bearer token middleware 保护 `/api/local/*`，
mounted Soul App 会收到签名 mount context，但 Host 还没有一个可替换的 auth
provider contract。后续 Logto 不能直接散落进 API middleware 或 Soul App 分支里；
Soul App 也不应该从原始请求 header/cookie 推断身份。

## 目标

- 在 core 中定义 Host auth provider interface 和 local bearer provider。
- 保持当前 `AIWORKER_LOCAL_TOKEN` / `token` 行为兼容。
- 将认证后的 operator identity 作为 Host-owned projection 注入 broker scope。
- 将 identity 和 broker grants 放入 signed mount context，让 mounted Soul App 只消费签名上下文。
- 保持 caller `authorization`/`cookie` 等原始 header 不转发给 Soul App。

## 非目标

- 不接真实 Logto SDK。
- 不新增用户/组织/租户 DB schema。
- 不实现 RBAC UI。
- 不把 Soul App 改成读取 Host auth cookie 或 bearer token。

## 验收标准

- local bearer provider 使用常量时间比较并返回稳定 operator identity。
- 未配置 token 时保持当前本地开放行为。
- 配置 token 后，合法 bearer 请求在 broker scope 和 mount context 中得到 Host identity。
- mounted service 不再依赖 caller 原始 auth/cookie 来识别用户。
- focused tests、typecheck、lint、diff check 和 CRG 通过。

## 验证

- `bun run --filter '@zonease/aiworker-core' test src/host/identity-provider.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## 结果

Host local bearer auth now sits behind a replaceable auth provider interface.
Authenticated local operator identity is projected into app-scoped broker scope
and signed mount context, while caller cookies and caller authorization headers
remain stripped before mounted Soul App services receive requests.
