# FEAT-075 Soul App storage broker provider and app-owned drafts

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14 01:34
- **plan**: PLAN-307
- **relatesTo**: FEAT-074, packages/core, apps/api, apps/web, apps/aiworker-hr, apps/aiworker-qa, packages/soul-app-sdk

## 背景

Host / Soul App 双自治已经完成 manifest、mounted surface、generic action/search
和 descriptor permission guard。下一步要证明 Host 的 platform storage 能力不是概念：
Soul App 可以通过 broker 使用 Host 提供的 app-scoped storage，但 Host 不理解写入内容的
领域语义。

## 目标

- 将 storage broker 抽象为 provider interface，SQLite 作为默认 local provider。
- 保持 broker permission、scope 和 audit 逻辑在 Host。
- 将 action body 的 Host scope 与 app-owned input 分离。
- HR/QA mounted create action 在有 Host context 时通过 SDK broker 写入 app-owned draft。
- Web shell action 调用传递 `scope`，不把 worker/workspace/session 塞进 app input。

## 非目标

- 不接入真实 S3/GCP bucket。
- 不接入真实 Logto。
- 不实现 cloud storage credential broker。
- 不让 Host 解释 HR profile 或 QA release gate 字段。

## 验收标准

- `createSoulAppBroker` 可使用注入的 storage provider。
- 默认 SQLite provider 维持现有 broker storage API 行为。
- action scope 被 Host 用于权限判断并进入 signed mount context。
- HR/QA create action 通过 SDK 调 Host broker storage 路径写入 draft。
- Web shell action 调用传递 `scope`，不把 worker/workspace/session 塞进 app input。
- focused tests、typecheck、validate、lint、diff check 和 CRG 通过。

## 验证

- `bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-qa' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-qa' validate`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

`crg:review` exited 0 and reported static private-helper gaps, including
`serveHostMounted`, mounted service `fetch`, `hrProtocolAction`,
`persistPeopleProfileDraft`, and `readMountContext`. The changed behavior is
covered through HR/QA mounted-service tests, API HTTP-level tests and Web action
payload tests.
