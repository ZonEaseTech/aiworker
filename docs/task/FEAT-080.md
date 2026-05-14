# FEAT-080 Official Soul App broker proof closure

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14 12:28
- **plan**: PLAN-312
- **relatesTo**: FEAT-076, FEAT-079, apps/aiworker-hr, apps/aiworker-qa, apps/api, apps/web, packages/shared, packages/soul-app-sdk

## 背景

FEAT-075..079 已经建立 Host/Soul App 的 broker、identity、security review 和
search index 基础能力。代码审计发现这些平台能力虽然存在，但官方 HR/QA Soul
App 还没有完整证明它们：manifest 没声明 `search` 权限，mounted action 没把
app-owned descriptor 写入 search broker，Settings 的 enable 也没有把 security
review 作为门禁。

## 目标

- 修复 Host descriptor `requiredPermissions` 解析与 shared manifest schema 的
  `search` 权限不一致。
- 让 HR/QA 官方 Soul App 声明并使用 `search:read/write:<appId>`。
- 让 HR/QA mounted action 通过 SDK/broker 写入 app-owned search descriptors，
  mounted search 先查询 broker index，再保留 app-owned fallback。
- 让 Worker Web Settings 在启用 Soul App 前消费 `/security-review` 并阻止
  `canEnable=false` 的启用动作。
- 用 focused tests、validate、smoke、root gates 和 code-review-graph 验证。

## 非目标

- 不做全文搜索、embedding、ranking 或跨 app 全局搜索 UI。
- 不让 Host 解释 HR profile、QA release gate 或任何领域字段。
- 不在本轮实现完整 standalone 产品 shell。
- 不接入真实 Logto、S3/GCP bucket、vault 或 connector marketplace。

## 验收标准

- `search` permission 在 manifest schema、API descriptor parser 和 broker decision
  中保持一致。
- 官方 HR/QA manifest 能通过 validate，并包含 search read/write permissions。
- HR/QA action 成功后会通过 Host broker 写入非权威 search descriptor。
- HR/QA mounted search 能返回 broker index 记录，Host 仍不解释结果语义。
- Settings enable 在 `canEnable=false` 时禁用或拒绝启用，并显示 review 问题。
- focused tests、Soul App validate/smoke、root check/build/test 和 CRG 通过。

## 验证

- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-qa`
- `bun run check`
- `bun run build`
- `bun run test`
- `bun run crg:update`
- `bun run crg:review`

## 结果

Completed on 2026-05-14.

- API descriptor permission parsing now accepts `search` with the same
  vocabulary as shared manifest `requiredPermissions`.
- HR/QA official Soul Apps and Host-consumed reference manifests declare
  `search:read/write:<appId>`, publish app-owned broker search descriptors from
  mounted actions, and query the broker index before falling back to app-local
  descriptors.
- Worker Web Settings now fetches Host security review before enabling a Soul
  App and blocks `canEnable=false` without app-specific approval logic.
- Verification passed with focused API/HR/QA/Web tests, HR/QA validate and
  smoke, root `check`, `build`, `test`, `git diff --check`, and
  code-review-graph.
- CRG exited 0 with static test-gap hints for mounted helper functions and test
  fetch mocks; the behavior is covered by HR/QA mounted-service tests, API
  local-daemon tests, and Worker Studio Settings flow tests.
