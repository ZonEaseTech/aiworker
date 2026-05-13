# PLAN-284 Soul App protocol and manifest contract

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-12 21:00
- **relatedTask**: FEAT-060

## Current State

AIWorker 当前架构以 local daemon 和 Soul-bound worker 为中心。HR 工作台已经证明
每个 Soul 需要专业产品面，但领域能力仍主要在 Host 仓库内部表达。现有 Soul pack
适合承载 prompt、domain system、capability template 和 review rubric，不足以表达
可独立部署、可挂载、可带 UI/API/storage/connector 扩展的垂直应用。

## Decision

引入 `Soul App` 作为 Soul 的可独立产品单位，并定义 `soul-app/v1` manifest 与协议面。

```text
Soul Pack = content assets
Soul App  = pack + domain API + domain UI + artifact schema + connector needs

Host      = runtime, registry, shell, permission boundary
Soul App  = vertical product logic and domain contract
```

Host 必须先只读 manifest，完成兼容性、权限、协议版本和贡献点校验，再决定是否启用
对应 app。读取 manifest 不得执行 Soul App 代码。

## Proposal

### 1. Manifest Schema

定义 `SoulAppManifest`，至少覆盖：

- `id`、`name`、`version`、`protocol`；
- `compatibility.host` 和可选 `compatibility.sdk`；
- `modes.standalone`、`modes.hostMounted`；
- `soul`、`pack`、`capabilities`、`workspaceTypes`、`artifactTypes`；
- `ui.routes`、`ui.panels`、`ui.artifactPreviews`、`ui.reviewPanels`；
- `api.entry` 与 scoped route prefix；
- `storage.namespace`、`storage.migrations`；
- `connectors.required`、`connectors.optional`；
- `memory.namespace`、`memory.admissionPolicy`；
- `permissions`、`healthcheck`、`exports`。

### 2. Protocol Surface Definitions

把协议面拆成稳定接口，而不是一个万能 plugin hook：

- `LifecycleProtocol`：install、enable、disable、upgrade、healthcheck；
- `RuntimeProtocol`：resolveCapability、prepareSessionContext、
  enrichTurnContext、classifyIntent；
- `ArtifactProtocol`：schema、validateArtifact、renderPreview、extractMetadata；
- `ReviewProtocol`：createReviewRubric、evaluateArtifact、proposeMemoryCandidate；
- `EventProtocol`：onSessionCreated、onTurnCompleted、onArtifactCreated、
  onReviewAccepted；
- `ConnectorProtocol`：declareConnectorNeeds、requestScopedAccess、readEvidence；
- `UIContributionProtocol`：routes、panels、workspace widgets、artifact previews。

### 3. Compatibility And Failure Semantics

Host 启用前必须给出确定性结果：

- unsupported protocol；
- incompatible host version；
- missing required connector；
- invalid storage namespace；
- unsafe permission request；
- missing UI/API entry；
- invalid artifact schema。

错误必须能被 CLI/Web 显示为 operator 可理解的状态。

### 4. Pack Relationship

Soul App 可以引用一个或多个 Soul pack，也可以内嵌 pack assets。Host 仍可直接加载
轻量 Soul pack，但只有 Soul App 能贡献 API、UI、storage 和 connector 扩展。

## Scope

In scope:

- Shared manifest schema and validation types.
- Protocol surface type definitions.
- Manifest examples for `aiworker-hr` and `aiworker-qa`.
- CLI/API/Web 文档说明 manifest 校验与错误语义。
- Focused schema tests.

Out of scope:

- Host registry implementation, tracked by PLAN-285.
- Standalone SDK/runtime, tracked by PLAN-286.
- Isolation broker implementation, tracked by PLAN-287.
- HR/QA extraction, tracked by PLAN-288.

## Risks

- **协议过宽**：一次性定义太多 hook 会制造未实现承诺。
  Mitigation: v1 只定义 Host/Soul App 必须交互的面，具体 hook 可以标注 optional。
- **协议过窄**：只支持 prompt pack 会无法支撑独立产品。
  Mitigation: manifest 必须包含 UI/API/artifact/storage/connector 能力声明。
- **执行代码过早**：manifest 发现阶段执行 app 代码会破坏安全边界。
  Mitigation: discovery 只读静态 manifest，runtime entry 在 enable 后按权限加载。

## Verification Plan

- Manifest schema unit tests。
- Invalid manifest fixture tests covering compatibility and permission errors。
- Example HR/QA manifest validation。
- Typecheck for shared protocol package。
- Docs diff review。
- `git diff --check`。
- code-review-graph review if implementation includes code; docs-only changes may skip it with explanation.

## Progress

- 2026-05-12 21:00: Drafted as a full feature plan after Soul App / Host
  topology discussion. No implementation started.
- 2026-05-12 21:46: Claimed for implementation after current-contract and
  shared/API/Web/CLI structure investigation. Scope remains limited to shared
  manifest schema, protocol type surfaces, HR/QA fixtures, focused tests, and
  PMA documentation sync.
- 2026-05-12 22:02: Implemented the shared `soul-app/v1` contract under
  `packages/shared/src/soul-app/`. The implementation is static-manifest only:
  validation reads JSON/object data and returns deterministic issue codes; it
  does not import or execute Soul App code. HR and QA fixtures validate through
  the same schema. Host registry, mount runtime, standalone SDK, brokers,
  extraction, and scaffold remain out of scope for PLAN-285..289.
- 2026-05-12 22:09: Completed verification. Passed focused shared typecheck and
  tests, root typecheck/lint/test, `git diff --check`, and code-review-graph
  build/review. code-review-graph reports risk 0.60 with residual test-gap
  hints for `validateSoulAppManifest` / `parseSoulAppManifestJson`, but those
  paths are directly covered by `packages/shared/src/soul-app/manifest.test.ts`.
