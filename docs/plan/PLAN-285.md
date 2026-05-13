# PLAN-285 Host Soul App registry and mount runtime

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-12 21:00
- **relatedTask**: FEAT-061

## Current State

AIWorker Host 目前可以管理 Soul worker、workspace、session 和 artifact，也能在 Web
中通过内置 renderer 呈现 HR 专业工作台。但这种方式是仓库内部编译期注册，不足以让
外部 `aiworker-hr` / `aiworker-qa` 以独立项目身份挂载进 Host。

## Decision

Host 引入 Soul App registry，负责安装状态、启用状态、manifest 校验、contribution
注册、namespace 分配、healthcheck 和 mount 生命周期。Host 只消费 `soul-app/v1`
协议，不绑定某个垂直 app 的源码结构。

## Proposal

### 1. Registry Storage

在 Host metadata 中记录：

- app id、version、protocol、install source；
- enabled/disabled/error 状态；
- manifest digest；
- enabled capabilities 和 mounted contribution points；
- healthcheck result；
- upgrade/rollback metadata。

### 2. CLI/API Surface

目标命令和 API：

```text
aiworker app list
aiworker app show <id>
aiworker app install <path-or-package>
aiworker app enable <id>
aiworker app disable <id>
aiworker app doctor <id>
```

```text
GET    /api/local/apps
POST   /api/local/apps/install
GET    /api/local/apps/:appId
POST   /api/local/apps/:appId/enable
POST   /api/local/apps/:appId/disable
POST   /api/local/apps/:appId/healthcheck
```

### 3. Mount Runtime

Host enable 时执行：

1. read manifest；
2. validate compatibility；
3. assign namespace；
4. register capabilities and workspace types；
5. register UI/API contribution descriptors；
6. run healthcheck；
7. expose app state to Web Shell。

### 4. Web Shell Integration

Host Shell 负责：

- Soul App catalog；
- app-specific route boundaries；
- slot rendering；
- error and disabled states；
- worker/workspace/session context injection into UI contributions。

Soul App UI 不接管全局 navigation、settings、auth、current worker/workspace/session
ownership。

### 5. API Namespace

Mounted API 必须位于：

```text
/api/local/apps/:appId/*
```

或等价 scoped prefix。App API 只能通过 Host-provided scoped context 访问 storage、
connector、artifact 和 review services。

## Scope

In scope:

- Registry persistence and state model.
- CLI/API app lifecycle surface.
- Web catalog and mounted contribution rendering.
- Namespace collision handling.
- Healthcheck and failure UX.
- Tests for install/enable/disable/mount behavior.

Out of scope:

- Protocol schema definition, tracked by PLAN-284.
- Standalone app runtime, tracked by PLAN-286.
- HR/QA extraction, tracked by PLAN-288.
- Remote marketplace.

## Risks

- **Route collision**：app route 覆盖 Host route。
  Mitigation: app routes must live under app namespace or declared shell slots.
- **State drift**：manifest 更新后 registry 仍使用旧 capability。
  Mitigation: store manifest digest and force revalidation on enable/upgrade.
- **Host leakage**：UI/API contribution 获得 Host 内部对象。
  Mitigation: pass only scoped SDK context, not internal daemon services.

## Verification Plan

- Registry unit tests for install/enable/disable/error states。
- API route tests for app lifecycle。
- CLI snapshot/integration tests for `aiworker app` commands。
- Web tests for app catalog, disabled state, mounted slot rendering and fallback。
- Root or focused typecheck/lint/build according to touched packages。
- Browser smoke for one mounted app and one disabled app。
- `git diff --check`。
- code-review-graph update/review after code changes。

## Progress

- 2026-05-12 21:00: Drafted as a full Host mounting feature plan. No
  implementation started.
- 2026-05-12 22:22: Claimed for implementation after PMA proposal approval.
  Scope is constrained to Host-side registry persistence, static manifest
  install/enable/disable/healthcheck, CLI/API/Web catalog surfaces, capability
  projection, tests, and PMA documentation sync. Runtime execution of external
  Soul App UI/API code, standalone SDK, isolation brokers, and HR/QA extraction
  remain deferred to PLAN-286..289.
- 2026-05-12 22:47: Completed the constrained PLAN-285 slice. Host now stores
  static Soul App manifests in `worker.db`, revalidates compatibility on enable
  and healthcheck, projects enabled app Souls/capability templates into the Host
  catalog, exposes app lifecycle through CLI/API/Web, and reserves the scoped
  app API namespace without importing or executing vertical app code.

## Implementation Record

- Added shared Host projection helpers for mounted Soul Apps, including
  namespaced capability ids and mounted contribution descriptors.
- Added `soul_apps` worker metadata storage, repository functions, migration and
  lifecycle tests.
- Added core registry functions for path/inline install, enable, disable,
  healthcheck and combined Host catalog discovery.
- Wired local daemon routes for app lifecycle plus `/api/local/apps/:appId/*`
  namespace reservation, and used the combined catalog for Soul/template/worker
  and session creation flows.
- Added CLI `app list/show/install/enable/disable/doctor`, and switched Soul,
  template, worker and session commands to the Host catalog.
- Added Worker Web app catalog loading and a lifecycle status panel in the
  worker rail.

## Verification

- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-storage-sqlite' typecheck`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:build`
- `bun run crg:review`
