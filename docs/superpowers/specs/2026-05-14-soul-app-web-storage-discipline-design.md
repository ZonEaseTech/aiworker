# Soul App Web Storage self-check design

## Decision

AIWorker 当前只接收一方/官方 Soul App。Host Web 内同 realm 运行的 Soul
App 被视为 trusted first-party code，不把浏览器 `localStorage` /
`sessionStorage` 视为恶意代码隔离边界。

本 slice 采用轻量自检约束：

- Host browser storage key 必须使用 `aiworker:host:*` 前缀；
- Soul App browser storage 只能通过 SDK/helper 访问 scoped key；
- scoped key 使用 `aiworker:app:<appId>:<workerId>:<workspaceId>:*` 前缀；
- repo 自检阻止官方 Soul App 直接使用裸 `localStorage`、`sessionStorage`
  或 `.clear()`；
- 文档明确：这不是三方安全沙箱。一旦开放 third-party Soul App，同 realm
  运行模式不能继承当前信任模型，必须切换到 isolated renderer、worker/protocol
  或 descriptor-only 方案。

## Current State

- `docs/architecture.md` 已约束 Host broker storage namespace，`storage.namespace`
  必须等于 app id。
- Core broker 和 API 已按 app id、grant、worker/workspace/session context 控制
  `/api/local/apps/:appId/broker/storage/*`。
- `trusted-module` 已在 manifest schema 中保留，但当前 API 拒绝加载，错误信息指向
  future signed first-party module loader。
- `sandboxed-frame` 已存在，但当前讨论的默认风险来自同一 Host Web JS runtime 中的一方
  app 代码，而不是不可信 iframe 插件。
- 历史 docs 中有 Host Web `sessionStorage` auth 和旧 `localStorage` toggle 记录，但它们
  不是当前 Soul App browser storage 合同。

## Threat Model

In scope:

- 一方 Soul App 因疏忽使用裸 `localStorage` key 覆盖 Host preference、theme、auth
  或其他横向状态；
- 一方 Soul App 因疏忽调用 `localStorage.clear()` 或 `sessionStorage.clear()`；
- official app 之间 key 命名冲突；
- standalone 与 Host mounted 模式以后迁移时 key 无法清理或归属不明。

Out of scope:

- 恶意三方 Soul App 逃逸；
- iframe sandbox、独立 origin、CSP sandbox 的完整安全设计；
- browser extension、DevTools、operator 手工改 storage；
- secret storage。secret 仍不得进入 browser storage。

## Architecture

### Trusted first-party contract

Host Web 同 realm 加载的 Soul App 只能是 trusted first-party app。这个模式的目标是
工程纪律，不是浏览器安全隔离。

Host 文档和 manifest authoring 文档需要写清楚：

- 同 realm app 拥有与 Host Web 相同的 browser ambient authority；
- 当前允许这个模式是因为官方 app 与 Host 同一发布/审查边界；
- third-party app 不能默认使用同 realm 加载。

### Scoped storage helper

提供一个轻量 helper，推荐放在 public SDK 或 Web/Soul App 共享 authoring surface 中：

```ts
const storage = createSoulAppWebStorage({
  appId,
  workerId,
  workspaceId,
  sessionId,
})

storage.local.set('filters', value)
storage.session.set('draft', value)
```

helper 负责：

- 生成稳定前缀；
- JSON encode/decode；
- 禁止空 key、绝对 key 和跨 scope key；
- 不暴露 `.clear()`，只暴露 `remove(key)` 和 `clearScope()`；
- `clearScope()` 只删除当前 app/scope 前缀下的 key；
- 在 unavailable storage 环境中返回 typed failure，调用方可以降级为 memory-only。

### Key shape

Host keys:

```text
aiworker:host:<feature>:<key>
```

Soul App keys:

```text
aiworker:app:<appId>:<workerId>:<workspaceId>:local:<key>
aiworker:app:<appId>:<workerId>:<workspaceId>:session:<sessionId>:<key>
```

`sessionId` 只进入 session storage key。workspace-level local storage 不应该因为 session
切换丢失。

### Self-check

新增或扩展 repo 自检脚本，扫描官方 Soul App production source 和未来 app scaffold 输出：

- 禁止 `localStorage`；
- 禁止 `window.localStorage`；
- 禁止 `sessionStorage`；
- 禁止 `window.sessionStorage`；
- 禁止 `.clear()` 直接作用于 Web Storage；
- 允许 SDK/helper 文件自身实现 Web Storage facade；
- 允许测试文件显式覆盖禁止规则。

初始 enforcement 应为 error，因为当前只有一方 app，没有兼容三方生态包袱。若发现历史 Host
Web 使用，需要先分类为 Host-owned key，再迁到 `aiworker:host:*` 或列入明确例外。

## Data Flow

Host mounted official Soul App:

```text
Soul App UI
  -> createSoulAppWebStorage(appId, workerId, workspaceId, sessionId)
  -> scoped local/session facade
  -> browser Web Storage under aiworker:app:<appId>:...
```

Business/domain persistence:

```text
Soul App UI/API
  -> SDK broker client
  -> /api/local/apps/:appId/broker/storage/*
  -> Host broker grant checks
  -> app-scoped storage record or future provider namespace
```

Host preferences:

```text
Host Web Shell
  -> Host storage helper
  -> aiworker:host:<feature>:<key>
```

## Error Handling

- `SecurityError`、quota exceeded、JSON parse failure 都返回 typed result，不抛到 UI 根层。
- SDK/helper 不保存 secret、bearer token、connector credential 或 engine credential。
- 当 scope 缺少 `workerId` 或 `workspaceId` 时，helper 必须显式选择 `app` scope 或拒绝创建，
  避免隐式写入全局 app key。
- `clearScope()` 必须只按当前 helper 前缀删除，不允许全局清空。

## Testing

Focused tests:

- helper 为 Host 和 Soul App 生成预期 key；
- app A 与 app B 同名业务 key 不冲突；
- worker/workspace/session 切换不会覆盖旧 scope；
- `clearScope()` 只删除当前 scope；
- unavailable storage 返回 fallback result；
- self-check 对官方 app 裸 `localStorage/sessionStorage` fixture 报错；
- self-check 允许 helper implementation 和测试例外。

Focused commands should match the touched surface:

- shared SDK/helper tests when helper is in `packages/soul-app-sdk` or shared package；
- CLI/validation tests if wired into `aiworker app validate`；
- `bun run lint` or a focused self-check command if wired into root lint；
- docs-only updates use `git diff --check` and reference search.

## Future Third-Party Gate

开放 third-party Soul App 之前必须新增单独设计，不允许把本设计当作三方安全边界。

Third-party app 的 UI/logic 必须至少满足一个隔离形态：

- `sandboxed-frame` without Host same-origin storage access；
- Web Worker or local service protocol boundary；
- Host-rendered descriptor-only UI；
- signed first-party module loader with separate trust review and explicit direct-access capability。

## Acceptance

- 架构和 authoring 文档明确区分 trusted first-party discipline 与 third-party isolation。
- 官方 Soul App 不再直接使用裸 browser Web Storage API。
- Host-owned browser storage key 使用 `aiworker:host:*` 前缀。
- Soul App browser storage 通过 scoped helper 使用 `aiworker:app:*` 前缀。
- 自检能阻止新裸 Web Storage 用法进入官方 app production code。
- 实现不改变 Host broker storage 的 app-scoped 持久化语义。
