# FEAT-079 App-owned search index broker

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14 11:47
- **plan**: PLAN-311
- **relatesTo**: FEAT-073, FEAT-074, FEAT-077, packages/shared, packages/core, apps/api, packages/soul-app-sdk

## 背景

Host 已经能调用 Soul App 声明的 search provider，但还没有一个 app-scoped
index broker 让 Soul App 主动推送非权威 searchable descriptors。最终架构需要
Host 提供搜索定位能力，同时不能解释 HR profile、QA release gate 等领域结果。

## 目标

- 扩展 Soul App permission contract，支持 `search:read/write:<appId>`。
- 增加 Host-owned app-scoped search index broker。
- 允许 Soul App 推送 title/summary/reference 级描述符。
- 暴露 `/api/local/apps/{appId}/broker/search` 查询和 upsert 路由。
- SDK 增加 broker search helper。

## 非目标

- 不做全文搜索引擎、embedding、ranking 或跨 app 全局搜索 UI。
- 不把 Host search index 变成 HR/QA 领域事实来源。
- 不持久化真实业务字段或 profile/release verdict。
- 不替换现有 app-owned mounted search provider。

## 验收标准

- 未声明 `search` permission 的 app 无法写入或读取 index broker。
- index record 只保存 app id、id、kind、title、summary、reference 和 scope ids。
- query 只基于 descriptor 文本过滤，返回结果标记为 non-authoritative。
- API 和 SDK 都通过 public app-scoped broker route 使用 search index。
- focused tests、typecheck、lint、diff check 和 CRG 通过。

## 验证

- `bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts`
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

Host now supports app-scoped search broker permissions and a non-authoritative
search index broker. Soul Apps can upsert/query title, summary, reference and
scope descriptors through public broker routes and SDK helpers while preserving
domain result meaning inside the app.
