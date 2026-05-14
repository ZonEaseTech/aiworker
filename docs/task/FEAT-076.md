# FEAT-076 Soul App permission visibility and install review

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14 02:05
- **plan**: PLAN-308
- **relatesTo**: FEAT-074, FEAT-075, packages/core, apps/api, apps/web, packages/shared

## 背景

Host 已经能在 mounted action/search 前执行 descriptor `requiredPermissions`
检查，也已经把 storage 变成 provider-backed broker capability。下一步要让
operator 在启用 Soul App 前看见它请求了什么平台能力、依赖哪些 connector，以及
哪些 shell/protocol descriptor 会触发额外权限。

## 目标

- 为 Host 增加 Soul App security review projection。
- 在 local daemon API 暴露 generic app review route。
- enable/disable 响应返回 review，便于 UI 刷新后仍保持同一 contract。
- Settings 的 Soul Apps 区域展示 manifest permissions、connector needs 和
  descriptor requiredPermissions。
- Settings 支持 generic enable/disable app，不加入 HR/QA 专属审批逻辑。

## 非目标

- 不接入真实 connector marketplace。
- 不阻塞官方 app bootstrap 的现有行为。
- 不把 Host 改成解释 HR profile、QA release gate 或任何领域对象。
- 不实现真实 Logto/S3/GCP/vault provider。

## 验收标准

- review API 在 app code 执行前即可返回 permission/connector/descriptor 摘要。
- missing required connector 以 warning 暴露，但不改变当前 enable 语义。
- UI 能在 disabled app 上先看见 review，再执行 enable。
- UI enable/disable 后刷新 workspace data，并保持 Soul Apps 不回到 worker rail。
- focused tests、typecheck、lint、diff check 和 CRG 通过。

## 验证

- `bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run lint`
- `git diff --check`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run crg:update`
- `bun run crg:review`

## 结果

Host now projects installed Soul App security review from manifest permissions,
connector needs and descriptor `requiredPermissions` before app code runs.
Worker Web Settings can show that review and call generic enable/disable app
lifecycle endpoints without HR/QA-specific approval logic.
