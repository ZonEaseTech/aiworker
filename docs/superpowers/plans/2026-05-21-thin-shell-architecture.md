# Thin Shell Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AIWorker 从四层治理型平台精简为 Local Shell + Engine Bridge for Soul Apps，与 `docs/architecture.md` Constraint Registry 完全对齐。

**Architecture:** Big-bang 一次性删除。先砍 shared 类型（brain/soul/scope/capabilities/vertical-soul/worker-pack），再清 storage schema，精简 core runtime，裁 API 端点，最后清 Web UI。

**Tech Stack:** TypeScript, Bun, Drizzle ORM (SQLite), Hono (OpenAPI), React 19, @micro-zoe/micro-app

---

### Task 1: 删除 shared 包中的 Brain Kernel 和治理类型

**Files:**
- Remove: `packages/shared/src/brain/` (全部 14 个文件)
- Remove: `packages/shared/src/soul/` (全部 28 个文件)
- Remove: `packages/shared/src/scope/` (全部 3 个文件)
- Remove: `packages/shared/src/capabilities.ts` + `packages/shared/src/capabilities.test.ts`
- Remove: `packages/shared/src/vertical-soul.ts` + `packages/shared/src/vertical-soul.test.ts`
- Remove: `packages/shared/src/worker-pack.ts` + `packages/shared/src/worker-pack.test.ts`
- Remove: `packages/shared/src/profile-promotion.ts` + `packages/shared/src/profile-promotion.test.ts`
- Remove: `packages/shared/src/soul-workbench.ts` + `packages/shared/src/soul-workbench.test.ts` + `packages/shared/src/soul-workbench-catalog.ts`
- Remove: `packages/shared/src/executor-capabilities.ts` + `packages/shared/src/executor-capabilities.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 删除 brain/ 目录**

```bash
rm -rf packages/shared/src/brain
```

- [ ] **Step 2: 删除 soul/ 目录**

```bash
rm -rf packages/shared/src/soul
```

- [ ] **Step 3: 删除 scope/ 目录**

```bash
rm -rf packages/shared/src/scope
```

- [ ] **Step 4: 删除独立治理/领域文件**

```bash
rm packages/shared/src/capabilities.ts packages/shared/src/capabilities.test.ts
rm packages/shared/src/vertical-soul.ts packages/shared/src/vertical-soul.test.ts
rm packages/shared/src/worker-pack.ts packages/shared/src/worker-pack.test.ts
rm packages/shared/src/profile-promotion.ts packages/shared/src/profile-promotion.test.ts
rm packages/shared/src/soul-workbench.ts packages/shared/src/soul-workbench.test.ts
rm packages/shared/src/soul-workbench-catalog.ts
rm packages/shared/src/executor-capabilities.ts packages/shared/src/executor-capabilities.test.ts
```

- [ ] **Step 5: 重写 shared/src/index.ts，只保留 Layer 0 + Layer 1 导出**

用以下内容替换 `packages/shared/src/index.ts`：

```typescript
export { AppError } from './errors'
export { mintWorkerId, slugify, WORKER_ID_ALPHABET, WORKER_ID_PATTERN } from './lib/ids'

export {
  localAppearanceSchema,
  localComposerMentionSchema,
  localEngineInvocationSchema,
  localEngineInvocationStatusSchema,
  localEngineStatusSchema,
  localExecutionModeSchema,
  localFileKindSchema,
  localFileSchema,
  localFileSourceSchema,
  localJsonObjectSchema,
  localSessionEventSchema,
  localSessionEventTypeSchema,
  localSessionSchema,
  localSessionStatusSchema,
  localSettingSchema,
  localSettingsConfigSchema,
  localTurnSchema,
  localTurnStatusSchema,
  localWorkerOverlayAssetKindSchema,
  localWorkerOverlayAssetSchema,
  localWorkerOverlayAssetSourceSchema,
  localWorkerOverlaySaveSchema,
  localWorkerOverlaySchema,
  localWorkerSchema,
  localWorkerStatusSchema,
  localWorkspaceSchema,
  localWorkspaceStatusSchema,
} from './local-workspace'

export type {
  LocalAppearance,
  LocalComposerMention,
  LocalEngineInvocation,
  LocalEngineInvocationStatus,
  LocalEngineStatus,
  LocalExecutionMode,
  LocalFile,
  LocalFileKind,
  LocalFileSource,
  LocalJsonObject,
  LocalSession,
  LocalSessionEvent,
  LocalSessionEventType,
  LocalSessionStatus,
  LocalSetting,
  LocalSettingsConfig,
  LocalTurn,
  LocalTurnStatus,
  LocalWorkerOverlay,
  LocalWorkerOverlayAsset,
  LocalWorkerOverlayAssetKind,
  LocalWorkerOverlayAssetSource,
  LocalWorkerOverlaySaveInput,
  LocalWorker,
  LocalWorkerStatus,
  LocalWorkspace,
  LocalWorkspaceStatus,
} from './local-workspace'

export {
  agentEventSchema,
  agentFinishReasonSchema,
  tokenUsageSchema,
  toolActionSchema,
  toolStatusSchema,
} from './providers'
export type {
  AgentEvent,
  AgentFinishReason,
  AgentRunInput,
  AgentTask,
  AgentTaskStatus,
  BrainMemory,
  BrainProvider,
  BrainSkill,
  BrainSkillBody,
  BrainWatchEvent,
  ChatMessage,
  EngineAvailability,
  EngineAvailabilityResponse,
  EngineAvailabilityStatus,
  EngineKind,
  EngineSessionBinding,
  ExecutorProvider,
  ExecutorTool,
  MemoryFilter,
  TokenUsage,
  ToolAction,
  ToolCall,
  ToolStatus,
  WriteMemoryInput,
} from './providers'

export {
  buildHostedSoulApp,
  hostedSoulAppSchema,
  hrSoulAppManifest,
  isLoopbackMountedServiceUrl,
  mountedContributionForManifest,
  namespaceSoulAppCapabilityId,
  parseNamespacedSoulAppCapabilityId,
  parseSoulAppManifestJson,
  projectSoulAppCapabilityTemplate,
  projectSoulAppCapabilityTemplates,
  projectSoulAppDefaultTemplates,
  projectSoulAppSoul,
  qaSoulAppManifest,
  referenceSoulAppManifests,
  SOUL_APP_PROTOCOL,
  soulAppApiSchema,
  soulAppCapabilitySchema,
  soulAppCompatibilitySchema,
  soulAppConnectorAccessSchema,
  soulAppConnectorNeedSchema,
  soulAppConnectorsSchema,
  soulAppEngineAssetSourceSchema,
  soulAppEngineAssetsSchema,
  soulAppEngineTargetSchema,
  soulAppExportsSchema,
  soulAppHealthcheckKindSchema,
  soulAppHealthcheckSchema,
  soulAppHealthStatusSchema,
  soulAppIdSchema,
  soulAppInstallSourceKindSchema,
  soulAppManifestIssueCodeSchema,
  soulAppManifestIssueSeveritySchema,
  soulAppManifestSchema,
  soulAppManifestValidationIssueSchema,
  soulAppManifestValidationStatusSchema,
  soulAppMcpClientEngineAssetsSchema,
  soulAppMcpServerEngineAssetsSchema,
  soulAppMcpServerTransportSchema,
  soulAppModeSchema,
  soulAppMountedContributionSchema,
  soulAppMountedSurfaceRendererSchema,
  soulAppMountedSurfaceSchema,
  soulAppMountedSurfaceScopeSchema,
  soulAppPackRefSchema,
  soulAppPackSourceSchema,
  soulAppPermissionActionSchema,
  soulAppPermissionKindSchema,
  soulAppPermissionSchema,
  soulAppProjectionKindSchema,
  soulAppProjectionReceiptEntrySchema,
  soulAppProjectionReceiptSchema,
  soulAppProtocolSchema,
  soulAppRegistryStatusSchema,
  soulAppRequiredPermissionSchema,
  soulAppSkillEngineAssetsSchema,
  soulAppSoulSchema,
  soulAppStorageMigrationSchema,
  soulAppStorageSchema,
  soulAppUiContributionKindSchema,
  soulAppUiRouteSchema,
  soulAppUiSchema,
  soulAppUiSlotSchema,
  soulAppVersionSchema,
  soulAppWorkbenchActionRoleSchema,
  soulAppWorkbenchActionSchema,
  soulAppWorkbenchConfigurationSchema,
  soulAppWorkbenchSchema,
  soulAppWorkbenchSearchSchema,
  soulAppWorkspaceContextSchema,
  soulAppWorkspaceCwdDescriptorSchema,
  soulAppWorkspaceCwdSourceSchema,
  soulAppWorkspaceEngineAssetsSchema,
  soulAppWorkspaceTerminalContextSchema,
  soulAppWorkspaceTypeSchema,
  validateSoulAppManifest,
} from './soul-app'
export type {
  HostedSoulApp,
  MountedMicroAppChildEvent,
  MountedMicroAppHostData,
  SoulAppApi,
  SoulAppCapability,
  SoulAppCompatibility,
  SoulAppConnectorAccess,
  SoulAppConnectorNeed,
  SoulAppConnectorProtocol,
  SoulAppConnectors,
  SoulAppEngineAssets,
  SoulAppEngineAssetSource,
  SoulAppEngineTarget,
  SoulAppEventProtocol,
  SoulAppExports,
  SoulAppHealthcheck,
  SoulAppHealthcheckKind,
  SoulAppHealthStatus,
  SoulAppInstallSourceKind,
  SoulAppIntentClassification,
  SoulAppLifecycleProtocol,
  SoulAppManifest,
  SoulAppManifestIssueCode,
  SoulAppManifestIssueSeverity,
  SoulAppManifestParseMalformed,
  SoulAppManifestParseOk,
  SoulAppManifestParseResult,
  SoulAppManifestValidationIssue,
  SoulAppManifestValidationOptions,
  SoulAppManifestValidationResult,
  SoulAppManifestValidationStatus,
  SoulAppMcpClientEngineAssets,
  SoulAppMcpServerEngineAssets,
  SoulAppMcpServerTransport,
  SoulAppMode,
  SoulAppMountedContribution,
  SoulAppMountedSurface,
  SoulAppMountedSurfaceRenderer,
  SoulAppMountedSurfaceScope,
  SoulAppPackRef,
  SoulAppPackSource,
  SoulAppPermission,
  SoulAppPermissionAction,
  SoulAppPermissionKind,
  SoulAppProjectionKind,
  SoulAppProjectionReceipt,
  SoulAppProjectionReceiptEntry,
  SoulAppProtocol,
  SoulAppProtocolHandlers,
  SoulAppProtocolResult,
  SoulAppRegistryStatus,
  SoulAppRequiredPermission,
  SoulAppRuntimeProtocol,
  SoulAppScopedContext,
  SoulAppSessionContext,
  SoulAppSkillEngineAssets,
  SoulAppSoul,
  SoulAppStorage,
  SoulAppStorageMigration,
  SoulAppUi,
  SoulAppUiContributionKind,
  SoulAppUiContributionProtocol,
  SoulAppUiRoute,
  SoulAppUiSlot,
  SoulAppVersion,
  SoulAppWorkbench,
  SoulAppWorkbenchAction,
  SoulAppWorkbenchActionRole,
  SoulAppWorkbenchConfiguration,
  SoulAppWorkbenchSearch,
  SoulAppWorkspaceContext,
  SoulAppWorkspaceCwdDescriptor,
  SoulAppWorkspaceCwdSource,
  SoulAppWorkspaceEngineAssets,
  SoulAppWorkspaceTerminalContext,
  SoulAppWorkspaceType,
} from './soul-app'

export type { ExecutionEvent, MemoryEntry, ServiceStatus, SkillMeta } from './types'
```

注意：移除了 `localArtifactSchema`、`localArtifactStatusSchema`、`LocalArtifact`、`LocalArtifactStatus`、`soulAppArtifactTypeSchema`、`SoulAppArtifactType`、`SoulAppArtifactProtocol`、`SoulAppArtifactValidationResult`、`soulAppMemoryAdmissionPolicySchema`、`SoulAppMemoryAdmissionPolicy`、`SoulAppMemory`、`soulAppMemorySchema`、`SoulAppReviewProtocol`、`SoulAppReviewRubric`、`SoulAppSearchRequest`、`SoulAppSearchResult`、`SoulAppProtocolViewSummary`。

- [ ] **Step 6: 运行 typecheck 确认 shared 包自身无编译错误**

```bash
bun run --filter '@zonease/aiworker-shared' typecheck
```

Expected: 可能报其他包引用已删除类型的错误，shared 自身应通过。

- [ ] **Step 7: 提交**

```bash
git add packages/shared/src/
git commit -m "refactor: 移除 Brain Kernel、治理类型和领域内容定义

移除 brain/ soul/ scope/ capabilities vertical-soul worker-pack
profile-promotion soul-workbench executor-capabilities。
shared 包只保留 Layer 0 原子类型和 Layer 1 结构合约。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 清理 shared/local-workspace.ts 中的 Artifact 类型

**Files:**
- Modify: `packages/shared/src/local-workspace.ts`

- [ ] **Step 1: 从 local-workspace.ts 移除 LocalArtifact 相关定义**

在 `packages/shared/src/local-workspace.ts` 中，删除 `localArtifactSchema`、`localArtifactStatusSchema` 的定义和对应的 TypeScript 类型 `LocalArtifact`、`LocalArtifactStatus`。

- [ ] **Step 2: 运行 shared typecheck 确认**

```bash
bun run --filter '@zonease/aiworker-shared' typecheck
```

- [ ] **Step 3: 提交**

```bash
git add packages/shared/src/local-workspace.ts
git commit -m "refactor: 从 local-workspace 移除 LocalArtifact 类型定义

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 清理 shared/soul-app 中的 Review/Artifact/Memory Protocol 类型

**Files:**
- Modify: `packages/shared/src/soul-app/manifest.ts`
- Modify: `packages/shared/src/soul-app/protocol.ts`
- Modify: `packages/shared/src/soul-app/index.ts`

- [ ] **Step 1: 从 manifest.ts 移除 review/artifact/memory 相关 schema**

在 `packages/shared/src/soul-app/manifest.ts` 中：
- 删除 `soulAppArtifactTypeSchema` 及其类型 `SoulAppArtifactType`
- 删除 `soulAppMemorySchema` 及其类型 `SoulAppMemory`
- 删除 `soulAppMemoryAdmissionPolicySchema` 及其类型 `SoulAppMemoryAdmissionPolicy`
- 删除 `SoulAppManifest` 类型中 `artifacts`、`memory` 字段
- 更新 `validateSoulAppManifest` 移除对 artifacts/memory 的验证逻辑
- 移除 `SoulAppPermissionKind` 中的 `review`、`memory`、`artifact` 枚举值
- 移除 `REQUIRED_PERMISSION_RE` 中对应的匹配
- 移除 `SoulAppUiContributionKind` 中的 `review-panel`
- 移除 `SoulAppMountedSurfaceScope` 中的 `review`

- [ ] **Step 2: 从 protocol.ts 移除 review/artifact protocol 类型**

在 `packages/shared/src/soul-app/protocol.ts` 中：
- 删除 `SoulAppReviewProtocol` 类型
- 删除 `SoulAppReviewRubric` 类型
- 删除 `SoulAppArtifactProtocol` 类型
- 删除 `SoulAppArtifactType`（如果在此定义）
- 删除 `SoulAppArtifactValidationResult` 类型
- 从 `SoulAppProtocolHandlers` 中移除 `review` 和 `artifact` 字段
- 从 `SoulAppExports` 中移除 `review` 字段
- 删除 `SoulAppSearchRequest`、`SoulAppSearchResult`、`SoulAppProtocolViewSummary` 类型

- [ ] **Step 3: 更新 index.ts 的 re-exports**

在 `packages/shared/src/soul-app/index.ts` 中，移除 protocol.ts 中已删除类型的 re-export。

- [ ] **Step 4: 运行 typecheck**

```bash
bun run --filter '@zonease/aiworker-shared' typecheck
```

- [ ] **Step 5: 提交**

```bash
git add packages/shared/src/soul-app/
git commit -m "refactor: 从 soul-app protocol 移除 review/artifact/memory 类型

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 清理 storage-sqlite schema — 移除 artifacts/audit_events/storage_records 表

**Files:**
- Create: `packages/storage-sqlite/drizzle/worker/0006_drop_business_tables.sql`
- Modify: `packages/storage-sqlite/drizzle/worker/meta/0006_snapshot.json`
- Modify: `packages/storage-sqlite/drizzle/worker/meta/_journal.json`
- Modify: `packages/storage-sqlite/src/worker/schema.ts`
- Modify: `packages/storage-sqlite/src/worker/index.ts`

- [ ] **Step 1: 创建 migration 0006 SQL 文件**

创建 `packages/storage-sqlite/drizzle/worker/0006_drop_business_tables.sql`：

```sql
DROP TABLE `artifacts`;
--> statement-breakpoint
DROP TABLE `soul_app_audit_events`;
--> statement-breakpoint
DROP TABLE `soul_app_storage_records`;
```

- [ ] **Step 2: 更新 _journal.json 添加 migration 0006 条目**

在 `packages/storage-sqlite/drizzle/worker/meta/_journal.json` 的 `entries` 数组中追加：

```json
{
  "idx": 6,
  "version": "6",
  "when": <current_timestamp_ms>,
  "tag": "0006_drop_business_tables",
  "breakpoints": true
}
```

- [ ] **Step 3: 创建 0006_snapshot.json**

复制 `0005_snapshot.json` 为 `0006_snapshot.json`，从 tables 中移除 `artifacts`、`soul_app_audit_events`、`soul_app_storage_records` 三个表的定义。

- [ ] **Step 4: 从 schema.ts 移除三张表的 Drizzle 定义**

在 `packages/storage-sqlite/src/worker/schema.ts` 中：
- 删除 `artifacts` 表定义（第 208-229 行）
- 删除 `soulAppStorageRecords` 表定义（第 261-282 行）
- 删除 `soulAppAuditEvents` 表定义（第 284-306 行）

- [ ] **Step 5: 从 schema.ts import 中移除已删除类型**

在 `packages/storage-sqlite/src/worker/schema.ts` 顶部 import 中移除 `SoulAppManifest`、`SoulAppManifestValidationIssue`、`SoulAppRegistryStatus`、`SoulAppHealthStatus`（这些来自 shared，但 schema.ts 只用到了 soulApps 表的状态枚举，如果移除 storage_records 和 audit_events 后不再需要这些类型）。

确认 `soulApps` 表仍需要的 import，移除多余的。

- [ ] **Step 6: 从 storage index.ts 移除已删除表的 repository 函数**

在 `packages/storage-sqlite/src/worker/index.ts` 中，删除所有引用 `artifacts`、`soulAppStorageRecords`、`soulAppAuditEvents` 的查询函数。

- [ ] **Step 7: 运行 storage-sqlite 测试**

```bash
bun run --filter '@zonease/aiworker-storage-sqlite' test
```

Expected: 测试失败——更新测试文件以匹配新 schema（移除 artifact/storage/audit 相关测试用例）。

- [ ] **Step 8: 更新 storage-sqlite 测试文件**

在 `packages/storage-sqlite/src/worker/index.test.ts` 中：
- 移除 artifact 相关测试
- 移除 soul_app_storage_records 相关测试
- 移除 soul_app_audit_events 相关测试
- 更新表列表断言

- [ ] **Step 9: 运行测试确认通过**

```bash
bun run --filter '@zonease/aiworker-storage-sqlite' test
```

Expected: PASS

- [ ] **Step 10: 提交**

```bash
git add packages/storage-sqlite/
git commit -m "refactor: 从 worker.db 移除 artifacts/audit_events/storage_records 表

新增 migration 0006。业务数据和 KV 存储下沉到 Soul App 自有存储。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 移除 core 中的 profile-ledger 和 storage-provider

**Files:**
- Remove: `packages/core/src/worker/profile-ledger.ts` + `packages/core/src/worker/profile-ledger.test.ts`
- Remove: `packages/core/src/soul-app/storage-provider.ts`
- Remove: `packages/core/src/soul-app/search-index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: 删除 profile-ledger、storage-provider、search-index**

```bash
rm packages/core/src/worker/profile-ledger.ts packages/core/src/worker/profile-ledger.test.ts
rm packages/core/src/soul-app/storage-provider.ts
rm packages/core/src/soul-app/search-index.ts
```

- [ ] **Step 2: 从 core/src/index.ts 移除相关导出**

在 `packages/core/src/index.ts` 中：
- 移除 `createSqliteSoulAppStorageProvider`、`SoulAppStorageProvider`、`SoulAppStoragePutInput` 的导出
- 移除 profile-ledger 相关导出（如有）

- [ ] **Step 3: 提交**

```bash
git add packages/core/src/
git commit -m "refactor: 移除 profile-ledger、storage-provider、search-index

profile 管理下沉到 Soul App。KV 存储由 Soul App 自行管理。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 精简 core/worker/runtime.ts — 移除 review/profile/artifact 注入

**Files:**
- Modify: `packages/core/src/worker/runtime.ts`
- Modify: `packages/core/src/worker/runtime.test.ts`

- [ ] **Step 1: 从 runtime.ts 移除 buildInvocationPrompt 中的 review/hints/profile 注入**

在 `packages/core/src/worker/runtime.ts` 中：
- 移除 `buildInvocationPrompt` 中注入 `"Review rubric:"` 行的逻辑
- 移除 capability hints 注入逻辑
- 移除 profile context 注入逻辑
- 移除 `materializeSessionContext` 中写入 `capability/SKILL.md`、`capability/prompt.md`、`capability/review.md` 的逻辑
- Session context 目录精简为只写 `cwd.txt`、`engine.json`、`soul-app.json`

- [ ] **Step 2: 从 runtime.ts 移除 artifact discovery 和 profile bootstrap**

在 `packages/core/src/worker/runtime.ts` 中：
- 移除 `captureResult` 中的 `discoverInvocationArtifacts()` 调用和 artifact 注册逻辑
- 移除 `createWorkspace` 中的 `bootstrapProfileWorkspace()` 调用
- 移除对 `profile-ledger` 的 import

- [ ] **Step 3: 从 runtime.ts 移除 LocalExecutorArtifact/Review/Lesson 引用**

- 移除对 `LocalExecutorArtifact`、`LocalExecutorReview`、`LocalExecutorLesson` 类型的 import 和使用
- `captureResult` 不再返回 artifact 列表

- [ ] **Step 4: 从 events.ts 移除 artifact event kind**

在 `packages/core/src/worker/events.ts` 中，从 `LocalWorkerEventKind` 移除 `artifact` 事件类型。

- [ ] **Step 5: 更新 runtime.test.ts**

更新测试文件：移除 artifact discovery、profile bootstrap、review rubric 注入相关的测试用例。保留 session/turn/invocation 基础流程测试。

- [ ] **Step 6: 运行 core 测试**

```bash
bun run --filter '@zonease/aiworker-core' test
```

Expected: 可能有其他依赖 broken 的测试失败。专注于 runtime 相关测试通过。

- [ ] **Step 7: 提交**

```bash
git add packages/core/src/worker/runtime.ts packages/core/src/worker/runtime.test.ts packages/core/src/worker/events.ts
git commit -m "refactor: 精简 Worker Runtime 移除 review/profile/artifact 注入

session context 只写 cwd/engine/soul-app。不再构建包含 review rubric
和 capability hints 的 invocation prompt。移除 artifact discovery。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 精简 core/worker/executor.ts — 移除 Artifact/Review/Lesson 类型

**Files:**
- Modify: `packages/core/src/worker/executor.ts`
- Modify: `packages/core/src/worker/executor.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: 从 executor.ts 移除 Artifact/Review/Lesson 类型和逻辑**

在 `packages/core/src/worker/executor.ts` 中：
- 删除 `LocalExecutorArtifact` interface 定义
- 删除 `LocalExecutorReview` type（如有）
- 删除 `LocalExecutorLesson` type（如有）
- 删除 `discoverInvocationArtifacts` 函数
- `LocalExecutorResult` 移除 `artifacts`、`reviews`、`lessons` 字段
- `LocalExecutorFailure` 移除 `artifacts` 字段

- [ ] **Step 2: 更新 core/src/index.ts 移除已删除类型的导出**

在 `packages/core/src/index.ts` 中：
- 移除 `LocalExecutorArtifact`、`LocalExecutorReview`、`LocalExecutorLesson` 的导出

- [ ] **Step 3: 更新 executor.test.ts**

移除 artifact discovery 相关测试。保留 engine 调用基础测试。

- [ ] **Step 4: 运行 core 测试**

```bash
bun run --filter '@zonease/aiworker-core' test
```

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/worker/executor.ts packages/core/src/worker/executor.test.ts packages/core/src/index.ts
git commit -m "refactor: 从 executor 移除 Artifact/Review/Lesson 类型

engine 输出不再解析为 Host 拥有的 artifact/review/lesson。
输出解析下沉到 Soul App。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: 精简 core/host/runtime.ts — 移除 template enrichment

**Files:**
- Modify: `packages/core/src/host/runtime.ts`
- Modify: `packages/core/src/host/runtime.test.ts`

- [ ] **Step 1: 从 runtime.ts 移除 enrichTemplateMetadata**

- 删除 `enrichTemplateMetadata` 方法（向 template 注入 capability prompt 和 review rubric 的逻辑）
- 移除对已删除的 shared 类型（VerticalSoul、CapabilityTemplate、WorkerPack 等）的 import

- [ ] **Step 2: 更新 runtime.test.ts**

移除 template enrichment 相关的测试用例。

- [ ] **Step 3: 运行 core 测试**

```bash
bun run --filter '@zonease/aiworker-core' test
```

- [ ] **Step 4: 提交**

```bash
git add packages/core/src/host/
git commit -m "refactor: 从 HostRuntime 移除 template enrichment

capability prompt 和 review rubric 不再由 Host 注入。
Soul App 通过 engine-assets 投影自行管理领域指令。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: 移除 API 端点 — artifacts/files/souls/templates/events

**Files:**
- Modify: `apps/api/src/modes/worker.ts`
- Modify: `apps/api/src/modes/worker.local.test.ts`

- [ ] **Step 1: 从 worker.ts 移除 artifacts 端点**

删除所有 `/api/local/artifacts` 路由注册和相关处理函数。

- [ ] **Step 2: 从 worker.ts 移除 files 端点**

删除所有 `/api/local/files`、`/workspaces/*/files` 路由注册和相关处理函数。

- [ ] **Step 3: 从 worker.ts 移除 souls 和 templates 端点**

删除所有 `/api/local/souls`、`/api/local/templates` 路由注册和相关处理函数。

- [ ] **Step 4: 从 worker.ts 移除 global events 端点**

删除 `GET /api/local/events` 路由注册。保留 session-scoped events（`/workers/:workerId/sessions/:sessionId/events`）。

- [ ] **Step 5: 移除 OpenAPI path 注册中的对应条目**

在 `registerLocalOpenApiPaths` 中删除已移除端点对应的 path 定义。

- [ ] **Step 6: 更新 api 测试文件**

```bash
bun run --filter '@zonease/aiworker-api' test
```

Expected: 测试失败。更新 `worker.local.test.ts`：移除 artifacts/files/souls/templates/events 相关测试用例。

- [ ] **Step 7: 运行测试确认通过**

```bash
bun run --filter '@zonease/aiworker-api' test
```

Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add apps/api/
git commit -m "refactor: 移除 artifacts/files/souls/templates/events API 端点

文件读写、artifact 管理下沉到 Soul App 自有 API。
soul/template 目录随 shared 类型移除。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: 清理 Web UI — 移除 artifact/review/lesson 组件

**Files:**
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/worker/session-detail.tsx`
- Modify: `apps/web/src/worker/session-progress.ts`
- Remove: `apps/web/src/features/local-workspace/api/reviews.ts`
- Remove: `apps/web/src/features/local-workspace/api/lessons.ts`
- Remove: `apps/web/src/features/local-workspace/api/profile-revisions.ts`
- Modify: `apps/web/src/features/local-workspace/api/index.ts`
- Modify: `apps/web/src/features/local-workspace/api/types.ts`

- [ ] **Step 1: 删除 API client 文件**

```bash
rm apps/web/src/features/local-workspace/api/reviews.ts
rm apps/web/src/features/local-workspace/api/lessons.ts
rm apps/web/src/features/local-workspace/api/profile-revisions.ts
```

- [ ] **Step 2: 更新 api/index.ts 和 types.ts**

在 `features/local-workspace/api/index.ts` 中移除对上述文件的 re-export。
在 `features/local-workspace/api/types.ts` 中移除 review/lesson/profile 相关类型。

- [ ] **Step 3: 从 worker-studio.tsx 移除 review/lesson 逻辑**

- 删除 `submitReview` 函数
- 删除 `changeLessonStatus` 函数
- 删除 `reviewForSession`、`reviewsForWorkspace`、`selectedReview` 状态
- 删除对已删除 API client 的 import

- [ ] **Step 4: 从 worker-studio.tsx 移除 artifact 状态**

- 删除 `soulArtifacts`、`selectedArtifact`、`artifactPreview` 状态
- 删除 `artifactPreviewReducer`
- 删除 `ArtifactPreviewState` 类型
- 删除 `artifactForSession`、`artifactForWorkspace`、`artifactsForWorkspace` 辅助函数

- [ ] **Step 5: 从 session-detail.tsx 移除 artifact/review 面板**

- 删除 `ArtifactPreviewFrame`、`ArtifactPreviewContent` 组件
- 删除 `ReviewPanelShell` 组件
- 删除 `changeLessonStatus` 相关逻辑
- 保留 session 事件流和基础信息展示

- [ ] **Step 6: 精简 session-progress.ts**

删除 `artifact_finalizing`、`review_ready`、`review_failed`、`reviewed` 阶段。只保留 `empty`、`engine_running`、`failed` 三个阶段。

- [ ] **Step 7: 运行 Web 测试和 typecheck**

```bash
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' test
```

Expected: typecheck 通过，测试可能需要更新。

- [ ] **Step 8: 更新 Web 测试文件**

更新 `worker-studio.test.tsx` 和 `session-detail` 相关测试，移除 artifact/review/lesson 相关测试用例。

- [ ] **Step 9: 运行测试确认通过**

```bash
bun run --filter '@zonease/aiworker-web' test
```

Expected: PASS

- [ ] **Step 10: 提交**

```bash
git add apps/web/
git commit -m "refactor: 从 Web Shell 移除 artifact/review/lesson UI

Host Web 不再渲染领域 artifact 预览、review 面板和 lesson 管理。
这些交互全部由 Soul App 子应用在自己的 micro-app 表面实现。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: 更新 soul-app-sdk 和 soul-app-runtime

**Files:**
- Modify: `packages/soul-app-sdk/src/index.ts`
- Modify: `packages/soul-app-runtime/package.json`

- [ ] **Step 1: 更新 soul-app-sdk 移除对已删除 shared 类型的引用**

在 `packages/soul-app-sdk/src/` 中，更新所有 import，移除对已删除的 shared 类型的引用。

- [ ] **Step 2: 更新 soul-app-runtime package.json 依赖**

移除 `@zonease/aiworker-core` 和 `@zonease/aiworker-storage-sqlite` 的依赖。只保留 `@zonease/aiworker-shared` 和 `@zonease/aiworker-soul-app-sdk`。

- [ ] **Step 3: 更新 soul-app-runtime 源码移除对 core/storage-sqlite 的 import**

Runtime 中的 engine 调用改为通过 soul-app-sdk 的 Host API client 完成。

- [ ] **Step 4: 运行 SDK 和 runtime 测试**

```bash
bun run --filter '@zonease/aiworker-soul-app-sdk' test
bun run --filter '@zonease/aiworker-soul-app-runtime' test
```

- [ ] **Step 5: 提交**

```bash
git add packages/soul-app-sdk/ packages/soul-app-runtime/
git commit -m "refactor: 精简 soul-app-sdk 和 soul-app-runtime 依赖

runtime 不再直接依赖 core 和 storage-sqlite。
engine 调用通过 SDK 的 Host API client 完成。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: 修正官方 Soul App 的引用

**Files:**
- Modify: `apps/aiworker-hr/` 中引用已删除 shared 类型的文件
- Modify: `apps/aiworker-qa/` 中引用已删除 shared 类型的文件

- [ ] **Step 1: 扫描官方 Soul App 中的编译错误**

```bash
bun run --filter '@zonease/aiworker-hr' typecheck 2>&1 | head -50
bun run --filter '@zonease/aiworker-qa' typecheck 2>&1 | head -50
```

- [ ] **Step 2: 修复编译错误**

根据 typecheck 输出，逐文件修复对已删除类型的引用。可能的修复：
- 移除对 `VerticalSoul`、`CapabilityTemplate`、`WorkerPack`、`SoulModule` 等类型的 import
- 移除对 `SoulAppReviewProtocol`、`SoulAppArtifactProtocol` 的引用
- 更新 manifest 结构以匹配精简后的 `SoulAppManifest` 类型

- [ ] **Step 3: 运行 Soul App 测试**

```bash
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-qa' test
```

- [ ] **Step 4: 提交**

```bash
git add apps/aiworker-hr/ apps/aiworker-qa/
git commit -m "refactor: 更新官方 Soul App 适配 thin shell shared 类型

移除对 VerticalSoul/CapabilityTemplate/WorkerPack 等已删除类型的引用。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 13: 全量验证

- [ ] **Step 1: 全量 typecheck**

```bash
bun run typecheck
```

Expected: 全部包 typecheck 通过。

- [ ] **Step 2: 全量 lint**

```bash
bun run lint
```

Expected: 通过（boundary check 脚本 `check-soul-app-boundaries.ts` 也通过）。

- [ ] **Step 3: 全量测试**

```bash
bun run test
```

Expected: 全部测试通过。

- [ ] **Step 4: UI 组件治理检查**

```bash
bun run ui:check
```

Expected: 通过。

- [ ] **Step 5: 全量 check gate**

```bash
bun run check
```

Expected: 全部 gate 通过。

- [ ] **Step 6: 更新 docs/changelog.md**

在 changelog 中记录本次架构重构。

- [ ] **Step 7: 最终提交**

```bash
git add -A
git commit -m "refactor: Thin Shell 架构迁移完成

移除 Brain Kernel（admission/artifact/brief/secret scanner/skill packs）。
移除 Host-owned review/artifact/profile/lesson 概念。
worker.db 只存 Host metadata。
Host API 只暴露路由定位端点。
Engine Bridge 不再构建领域 prompt。
Soul App 通过 micro-app 拥有全部领域 UI/API。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
