# PLAN-287 Soul App isolation brokers and permission boundary

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 21:00
- **relatedTask**: FEAT-063

## Current State

AIWorker 当前边界主要围绕 local daemon、worker、workspace、session、artifact 和
review/memory。Soul App 化后，扩展面会新增 UI/API/storage/connector/event handler。
这些扩展必须通过 Host broker 获取 scoped 能力，不能拿到 Host 内部服务或 secret。

## Decision

Host 为 Soul App 提供 brokered capability，不提供 raw internal access：

```text
Soul App -> scoped SDK client -> Host broker -> storage / connector / engine / artifact / review / memory
```

所有 broker request 都带 appId、workerId、workspaceId、sessionId、operator context 和
permission decision。

## Proposal

### 1. Permission Model

Manifest 声明权限：

- `storage:<namespace>`；
- `connector:<type>:read` / `connector:<type>:write`；
- `artifact:<type>:read` / `artifact:<type>:write`；
- `review:create` / `memory:propose`；
- `ui:<slot>`；
- `api:<scope>`。

Host enable 时把权限转换为 operator-visible approval surface。

### 2. Storage Broker

App-owned domain tables/files 必须位于 app namespace。Host metadata 继续拥有 worker、
workspace、session、artifact、review、memory 的通用索引。

Rules:

- no cross-app namespace access by default；
- migrations must be app-scoped；
- uninstall/disable must preserve audit metadata；
- export must produce source-tagged app data。

### 3. Connector Broker

Soul App 只声明 connector needs。实际 auth、token、rate limit、redaction 和 evidence
materialization 由 Host Connector Broker 执行。

### 4. Engine Broker

Soul App 不直接调用 Codex/Claude/Cursor 等 engine。它只能返回 prompt/context/rubric、
artifact schema 和 review guidance。Host 创建 engine invocation 并记录 audit。

### 5. UI/API Scoped Context

UI/API contribution 获得：

- current app；
- current worker；
- current workspace；
- current session；
- declared capability；
- scoped clients。

不得获得 Host global store、raw DB handle、vault secret 或其他 app runtime object。

### 6. Memory Boundary

Memory 默认写入 app/soul namespace。跨 Soul 共享通过：

- explicit export/import；
- Host-level policy；
- review-approved organization memory promotion。

## Scope

In scope:

- Permission declaration schema and validation.
- Brokered scoped clients for storage, connector, artifact, review and memory.
- Engine invocation ownership guardrail.
- Audit events for broker requests.
- Web/CLI permission display and denial UX.
- Tests for forbidden cross-app access.

Out of scope:

- Container sandboxing.
- Enterprise RBAC beyond local operator approval.
- Remote policy server.
- Automatic cross-Soul memory sharing.

## Risks

- **安全边界过弱**：第三方 app 可读 secret 或其他 app 数据。
  Mitigation: no raw handles; scoped broker clients only.
- **开发体验过重**：权限太细导致 app author 难以启动。
  Mitigation: provide manifest presets and clear denial errors.
- **审计不可追溯**：connector/evidence 使用无法回放。
  Mitigation: every broker request emits app/workspace/session scoped audit.

## Verification Plan

- Permission schema tests。
- Storage namespace isolation tests。
- Connector broker mock tests with audit assertions。
- Engine ownership tests proving app cannot create raw invocation。
- Web/CLI permission approval and denial UX tests。
- `git diff --check`。
- code-review-graph update/review after code changes。

## Progress

- 2026-05-12 21:00: Drafted as a full isolation and permission feature plan. No
  implementation started.
- 2026-05-12 23:58: Claimed for goal-mode implementation after FEAT-060..062
  completion. Scope is constrained to Host-owned scoped broker primitives,
  app-scoped storage/audit records, local daemon broker routes, SDK client
  helpers and focused denial/audit tests. Host still does not execute arbitrary
  external Soul App API/UI handlers in this slice.
- 2026-05-13 00:18: Completed the scoped broker implementation. Host now owns
  brokered app storage, connector evidence reads, review/memory proposal paths,
  raw-engine denial and audit events. SDK, CLI, API and Worker Web expose the
  permission boundary without giving Soul Apps raw Host internals.

## Implementation Record

- Added `soul_app_storage_records` and `soul_app_audit_events` to worker DB with
  repository helpers and migrations.
- Added `createSoulAppBroker(...)` in core for permission decisions, storage
  isolation, connector evidence mocks, review/memory creation paths, and raw
  engine invocation denial.
- Added local daemon `/api/local/apps/:appId/broker/*` routes and OpenAPI
  entries for permissions, storage, connector evidence, audit and engine denial.
- Extended the SDK client with broker route helpers, and added CLI/Web permission
  display so operators can inspect app declarations before use.

## Verification

- `bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' test`
- Focused typechecks for storage-sqlite, core, api, soul-app-sdk, cli, and web.
