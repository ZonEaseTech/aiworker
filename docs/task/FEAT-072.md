# FEAT-072 Host platform locator and capability shell boundary

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-13 20:00
- **plan**: PLAN-304
- **relatesTo**: FEAT-060, FEAT-061, FEAT-063, FEAT-066, FEAT-071, docs, packages/shared, packages/core, apps/api, apps/web, apps/aiworker-hr, apps/aiworker-qa

## 背景

Soul App 已经可以 standalone，也可以 Host mounted。Host 的职责必须收敛为平台定位、
能力 broker 和 shell contract，不能继续滑向 Soul App domain state owner。

## 目标

将 Host / Soul App 边界落成硬约束：Host 管 app lifecycle、identity/security、platform
capabilities、protocol discovery、permissioned invocation 和 shell rendering；Soul App
管 domain state、artifact/profile composition、review meaning、memory meaning、search
semantics 和 domain audit。

## 非目标

- 不接入真实 Logto。
- 不接入真实 S3/GCP provider。
- 不新增 marketplace、remote control plane、gateway 或 fleet。
- 不重做 HR/QA 业务功能。
- 不让 Host 直接读取 Soul App 内部 DB 或 app-local workspace。

## 验收标准

- 文档、skill、manifest/protocol schema、reference apps、API 和 Worker Web 都使用 Host
  platform locator / capability shell 语义。
- Host 只能消费 Soul App protocol-exposed views/actions/search/settings descriptors。
- Header actions 由 Soul App descriptor 声明，Host 只负责渲染 shell slot。
- Host 不把 artifact/review/memory/search 当作默认主数据；缓存必须标记为
  non-authoritative。
- HR/QA validate、smoke、focused tests、root gates 和 code-review-graph 通过。

## 验证

- `bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-qa' typecheck`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-qa' validate`
- `bun run --filter '@zonease/aiworker-hr' smoke`
- `bun run --filter '@zonease/aiworker-qa' smoke`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- Browser smoke on `http://localhost:5173/`
