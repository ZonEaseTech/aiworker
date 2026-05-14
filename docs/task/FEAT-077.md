# FEAT-077 Broker provider registry

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14 11:33
- **plan**: PLAN-309
- **relatesTo**: FEAT-075, FEAT-076, packages/shared, packages/core, apps/api, packages/soul-app-sdk

## 背景

Storage broker 已经具备 provider 注入点，但 Host 还没有一个统一的 provider
registry 来声明 storage、connector、audit、secret 等平台能力由谁提供、当前是否可用、
是否只是未来实现。没有这个 registry，后续 S3/GCP bucket、vault-ref、Logto grant
等能力容易以散点配置或领域分支进入 Host。

## 目标

- 定义公开的 Soul App broker provider registry schema/type。
- 在 core 中提供纯 provider registry projection，覆盖 local SQLite、connector settings、
  local audit ledger 和 future cloud/vault providers。
- 在 broker/API 暴露 app-scoped provider metadata，让 Soul App SDK 可查询 Host 能力边界。
- 保持 provider metadata 不泄漏 token、secret、真实对象路径或领域内容。
- 更新架构/开发文档，明确 registry 是 Host 平台定位而非领域解释。

## 非目标

- 不接入真实 S3/GCP/vault SDK。
- 不改变现有 connector enable/disable 语义。
- 不把 provider registry 做成 HR/QA 专属审批或领域配置。
- 不新增 DB migration。

## 验收标准

- provider registry 至少声明 `storage.local-sqlite`、`storage.s3`、
  `storage.gcp-bucket`、`audit.local-sqlite`、`secret.vault-ref` 和当前 connector rows。
- API 可通过 `/api/local/apps/{appId}/broker/providers` 返回 metadata。
- SDK 暴露 `client.broker.providers.list()` 且仍只调用 public local daemon route。
- 测试覆盖 metadata shape、connector settings projection、no-secret payload、OpenAPI path。
- focused tests、typecheck、lint、diff check 和 CRG 通过。

## 验证

- `bun run --filter '@zonease/aiworker-shared' test src/soul-app/provider.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' test src/index.test.ts`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## 结果

Host now publishes a typed broker provider registry that names local SQLite
storage/audit providers, connector settings providers, and future S3/GCP/vault
providers as metadata. Soul App SDK can read the registry through the public
app-scoped broker route without importing Host internals.
