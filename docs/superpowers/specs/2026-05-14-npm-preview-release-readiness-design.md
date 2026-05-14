# npm preview release readiness design

## Decision

本次目标是 `0.x public preview release`，不是 1.0。

外部用户应该能直接通过 npm 入口启动 AIWorker local Host：

```bash
bunx @zonease/aiworker-cli daemon foreground --port 9217
npx @zonease/aiworker-cli daemon foreground --port 9217
```

发布包必须让 fresh local user 看到可运行的 Host Web、local API、worker DB migration、
official HR/QA Soul App bootstrap 和 app-projected catalog。HR/QA Soul App 的业务内容、
onboarding 深度和第三方 authoring 体验可以标记为 preview，但包本身不能依赖源码仓库路径才能启动。

Host auth 不纳入本次 release gate。

## Current Baseline

源码态已经具备关键能力：

- `bun apps/cli/src/aiworker.ts app bootstrap official` 可以安装并启用 HR/QA。
- `aiworker app validate apps/aiworker-hr` 和 `apps/aiworker-qa` 通过。
- `aiworker app smoke apps/aiworker-hr` 和 `apps/aiworker-qa` 通过 standalone + Host mounted smoke。
- `@zonease/aiworker-cli` 单测通过。

dist/npm 态仍有 P0 缺口：

- `apps/cli/dist/aiworker.js daemon foreground` 可以启动 `/health`，但 `/` 返回 Worker Web build not found。
- dist daemon 的 `/api/local/apps` 为空，official app bootstrap 没有在发布包中闭环。
- `apps/cli/dist/aiworker.js app bootstrap official` 仍解析源码仓库相对路径 `apps/aiworker-*`，发布包内没有 official app manifests/assets。
- `apps/cli/scripts/smoke-aiworker-run.ts` 仍验证旧 `run/runs/lessons promote` 链路，已经不能代表当前 Host/Soul App release gate。

## Release Standard

### P0: external npm runtime works

Fresh temp home 下，使用 dist 包或 npm packed tarball 启动：

```bash
AIWORKER_HOME=<tmp> WORKER_DB_PATH=<tmp>/aiworker.db \
  aiworker daemon foreground --host 127.0.0.1 --port <free-port>
```

必须满足：

- `/health` 返回 200；
- `/` 返回 Host Web Shell HTML；
- `/assets/*`、`/fonts/*`、`/engine-icons/*` 能从发布包读取；
- `/api/local/apps` 包含 enabled 或 installed official HR/QA apps；
- `aiworker app bootstrap official` 在 dist/npm 环境下成功，不依赖 monorepo `apps/` 路径；
- `aiworker app list`、`soul list`、`template list --soul aiworker-hr` 能看到 app-projected catalog。

### P0: package is self-contained

发布包需要包含运行期必需资源：

- CLI shim 和 Bun bundle；
- worker DB migrations；
- Worker Web static bundle；
- official HR/QA manifests；
- official HR/QA manifest 引用的 schemas、prompts、review rubrics、packs、migrations；
- official HR/QA mounted/standalone entry runtime 能启动所需的 app code 或等价可执行产物。

Host 仍不能把 HR/QA 领域语义内置进 core/API。打包可以携带 first-party app 资源，但安装/启用路径仍必须走 manifest registry。

### P0: release smoke matches current product path

新增或替换 release smoke，覆盖：

```text
npm/dist entry
  -> daemon foreground
  -> Worker Web static
  -> official app bootstrap
  -> app/soul/template catalog
  -> one minimal worker/workspace/session path when a mocked executor is available
```

旧的 `run/runs/lessons promote` smoke 不再作为 release gate。若保留，只能标记为 historical 或删除。

### P1: preview messaging is explicit

README、CLI guide 和 deployment guide 应说明：

- 当前发版是 `0.x preview`；
- Host Web/API/official app bootstrap 是承诺可运行面；
- HR/QA Soul App 业务流、third-party authoring、SDK/runtime npm 独立发布仍是 preview 或后续目标；
- Host auth 暂不在本次 release scope。

## Architecture

发布包运行时仍遵守当前 Host/Soul App 合同：

```text
npm CLI package
  -> aiworker daemon
  -> Host Web Shell + local API + worker.db
  -> packaged official app manifests/assets
  -> normal install/enable registry lifecycle
  -> Soul worker / workspace / session
```

核心原则：

- Host 启动、托管和注册 Soul Apps，但不解释 HR/QA 领域内容。
- Official Soul Apps 是随 CLI 发行的 first-party resources，不是 Host core 内置 domain modules。
- dist 路径解析必须基于 CLI package location，而不是源码 repo root。
- source checkout 与 dist/npm 路径使用同一套 lifecycle，差异只在资源定位。

## Components

### CLI package builder

`apps/cli/scripts/build-publish-manifest.ts` 负责生成 self-contained publish directory：

- 写入 stripped `dist/package.json`；
- 复制 Web static；
- 复制 DB migrations；
- 复制 official app release resources；
- 保证 `npm pack --dry-run` 能看到所有 P0 runtime resources。

### Runtime resource locator

CLI/API/core 需要一个发布态安全的 resource locator：

- source checkout 优先解析 repo `apps/aiworker-*` 和 `apps/web/dist/worker`；
- dist/npm 环境解析 package-local `official-apps/*` 和 `web/worker`；
- 解析失败时返回明确错误，提示是缺少发布资源而不是要求用户先 build source checkout。

### Official app bootstrap

`bootstrapOfficialSoulApps` 保持 app id allowlist，但 manifest path 由 locator 提供。

它只安装 manifest 并启用 app，不导入 official app `src` 作为 Host domain dependency。

### Release smoke

发布 smoke 应以 dist/npm entry 为被测对象，而不是源码 `apps/cli/src/aiworker.ts`。

smoke 使用临时 `AIWORKER_HOME`、临时 port、mocked executor 或 catalog-only path，完成后清理临时目录和进程。

## Data Flow

1. 用户通过 `bunx` 或 `npx` 调用 `aiworker daemon foreground`。
2. shell shim 找到 Bun 并执行 `aiworker-bun.js`。
3. CLI 初始化 worker DB，运行发布包内 migrations。
4. daemon bootstrap 通过 locator 找到 package-local official app manifests。
5. Host registry 以 normal install/enable lifecycle 写入 `worker.db`。
6. API 托管 package-local Web static。
7. Web/API 查询 Host catalog，显示 app-projected Souls/templates。

## Error Handling

- Web static 缺失：返回明确 release packaging error，包含 package-local expected path。
- Official app resource 缺失：bootstrap result 标记 `error`，CLI release smoke 失败。
- Manifest asset 缺失：`app validate` 输出 `missing_asset`，不能默默跳过。
- Dist smoke 启动失败：打印 daemon stdout/stderr、port、temp home 路径，并确保进程清理。
- npx 无 Bun runtime：沿用现有 shim 提示，说明 AIWorker CLI 是 Bun-native。

## Testing

P0 验证命令：

```bash
bun run --filter '@zonease/aiworker-cli' test
bun run --filter '@zonease/aiworker-web' build
bun run --filter '@zonease/aiworker-cli' build:bundle
cd apps/cli/dist && npm pack --dry-run --json
bun run --filter '@zonease/aiworker-cli' smoke:dist-release
```

跨包改动后还要跑：

```bash
bun run check
bun run test
bun run build
```

如果修改 production code，完成前运行：

```bash
bun run crg:update
bun run crg:review
```

## Non-Goals

- 不把本次发版定义为 1.0。
- 不要求 HR/QA Soul App 达到完整业务产品成熟度。
- 不要求 third-party Soul App authoring 在独立 npm 项目里完整闭环。
- 不发布 `@zonease/aiworker-soul-app-sdk` 或 `@zonease/aiworker-soul-app-runtime` 为独立 npm 包，除非实现计划证明这是 P0 必需。
- 不实现 Host auth、Logto、cloud storage、real connector marketplace 或远程控制面。

## Acceptance

本设计完成后的 release 判断是：

- 外部 npm 用户无需 clone repo 即可启动 Host Web/API。
- official HR/QA 可以随发布包进入 Host registry。
- CLI guide 与 README 不再承诺源码态才成立的路径。
- release smoke 验证的是当前 Host/Soul App product path。
- 所有未完成 Soul App 业务能力以 preview 方式明确标注，不伪装成 1.0。
