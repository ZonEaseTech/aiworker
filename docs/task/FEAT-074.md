# FEAT-074 Soul App broker permission hardening

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14 01:16
- **plan**: PLAN-306
- **relatesTo**: FEAT-072, FEAT-073, packages/shared, apps/api, apps/aiworker-hr, apps/aiworker-qa

## 背景

Host 已经能通过 generic action/search endpoint 调用 Soul App 声明的 shell
descriptor。下一步必须补上调用前的 broker 权限硬约束：descriptor 被声明只代表 Host
可以定位它，不代表当前 app、scope 和 grant 一定可以调用它。

## 目标

- 将 shell action/search 的 `requiredPermissions` 变成可校验的 manifest contract。
- Host 在调用 mounted Soul App 前执行 broker 权限判断。
- 未声明、未授权或 scope 不匹配的 action/search 不进入 mounted service。
- 官方 HR/QA manifest 对 primary action、refresh、drawer、search 和 settings 声明最小权限。
- 聚焦测试覆盖允许、拒绝、格式错误和服务未触达路径。

## 非目标

- 不接入真实 Logto。
- 不接入真实 S3/GCP bucket。
- 不实现 connector marketplace。
- 不让 Host 理解 HR profile 或 QA release gate 字段语义。

## 验收标准

- `requiredPermissions` 只接受 `kind:action:target` 形式。
- action/search 调用前必须通过 Host broker 权限判断。
- 权限拒绝时返回稳定错误，且 mounted service 不被调用。
- HR/QA manifest 声明 app-owned action/search 所需 broker 权限。
- focused tests、lint boundary、diff check、code-review-graph 通过。

## 验证

- `bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts`
- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' test`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-qa' typecheck`
- `bun run --filter '@zonease/aiworker-qa' validate`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

`crg:review` exited 0 and reported static private-helper gaps for
`bootstrapWorkerApp`, `decideDescriptorRequiredPermissions`,
`parseRequiredPermission`, `isSoulAppPermissionKind`, and
`isSoulAppPermissionAction`. These paths are covered through
`worker.local.test.ts` HTTP-level action/search allowed and denied cases,
including the assertion that denied descriptor permissions do not call the
mounted service.
