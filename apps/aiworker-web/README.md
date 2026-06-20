# AIWorker Web

AIWorker Web 是面向管理员的主可视化操作台，管理 AIWorker-owned metadata：assignment、Paseo environment、provider 引用、Soul release（register 已 build 的 release）、provisioning plan、audit 与 redacted handoff。它可在 UI 内发起创建/编辑这些元数据，但仍是薄层。

Thin write path：Web 后端**不持有 snapshot source of truth**；所有创建/编辑写动作经 `aiworker` CLI spawn 代写，由 CLI 命令负责落地元数据。provider 只存 `secret://` 引用，绝不落 literal secret。

No runtime proxy：它不渲染、不代理、不观察 Paseo project/workspace/session/runtime/provider traffic；AIWorker 不读取 session。

## 开发命令

```bash
bun run dev
bun run test:aiworker-web
bun run build:aiworker-web
```

## 运行形态

AIWorker Web 是 private admin app。默认只监听 loopback `127.0.0.1:20831`，读取本机
AIWorker control-plane snapshot，并把状态变更写回同一个目录。

首次接入 Logto：

```bash
bun run setup:logto
```

该脚本用当前仓库或 sibling `../aiworker-next` 的 Logto M2M 凭据幂等创建/更新
`AIWorker Web Admin` Traditional app，并把 `LOGTO_CLIENT_ID`、
`LOGTO_CLIENT_SECRET`、`LOGTO_COOKIE_SECRET`、`LOGTO_BASE_URL`、
`LOGTO_ALLOWED_EMAIL_DOMAINS` 写入根目录 ignored `.env`。运行时也接受
`LOGTO_APP_ID` / `LOGTO_APP_SECRET` 作为兼容别名，但本仓库写 canonical
`LOGTO_CLIENT_*`。`LOGTO_BASE_URL` 与 sibling next 一样表示对外可达的
console URL，默认使用 Coder HTTPS 域名
`https://20831--main--ben--ben.coder.tbc.5ok.co`，因此 Logto redirect URI 会注册为
`https://20831--main--ben--ben.coder.tbc.5ok.co/callback`。如果 ignored `.env`
里只保存了旧默认 `http://127.0.0.1:20831`，重跑脚本会迁移到这个 Coder HTTPS
默认值；显式传入的 `LOGTO_BASE_URL` 和自定义 `.env` 值仍然优先。
本地 token-only/fixture preview 可以继续从 loopback 访问；浏览器 SSO 入口会
canonical 到 `LOGTO_BASE_URL`，确保登录 state cookie 和 `/callback` 在同一 origin。

```bash
AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane \
AIWORKER_WEB_ADMIN_TOKEN=<admin-token> \
bun run dev
```

发布构建使用 Vite 静态资产和 portable Bun server bundle；CLI release 会把
`dist-server/server.js` 与 `dist/**` 打包到 `@zonease/aiworker-cli` 的
`web/server.js` / `web/static/**`：

```bash
bun run build:aiworker-web
AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane \
AIWORKER_WEB_ADMIN_TOKEN=<admin-token> \
bun run --filter '@zonease/aiworker-web' start:dist
```

`AIWORKER_CONTROL_PLANE_DIR` 为空时只进入 fixture preview mode；审批不会持久化，
apply/pair 也不会触发真实 `aissh` 或 Paseo。`AIWORKER_WEB_ADMIN_TOKEN` 是本地
admin mutation bearer token，不是企业 SSO/RBAC。管理员在 dashboard bootstrap
面板输入 token 后，浏览器只把它保存在 session/local storage，并随 state-changing
Web API 请求发送；服务端不会把 token 值返回给 `/api/admin-data`。

非 loopback 监听需要显式设置：

```bash
AIWORKER_WEB_HOST=0.0.0.0 AIWORKER_WEB_ALLOW_REMOTE=1 AIWORKER_WEB_REQUIRE_AUTH=1
```

只允许在 Logto 或外层已经有认证的 admin boundary 后面这样部署。Logto 配置完整时，
浏览器访问会走 `/login` -> Logto -> `/callback`；API 自动化仍可使用
`AIWORKER_WEB_ADMIN_TOKEN` bearer。Logto 配置不完整时 Web 会失败闭合并提示运行
`bun run setup:logto`。

## 真实环境验收

从 Web 审批到配对设备的真实 E2E 只能在真实环境中判定通过，需要：

- 真实 `AISSH_TOKEN` 与 target ref；若当前 aissh control plane 需要，则提供 `AISSH_SERVER`；
- 真实 target user HOME；
- target 下真实可用的 Paseo CLI 与 daemon；
- control-plane 里的 `PaseoEnvironment.ownerEmail` 与 assignment user 一致，并有匹配的 `dedication`；
- 已构建的真实 `dist/soul.descriptor.json`；
- 允许当前管理员生成一次 Paseo pairing response 的权限。

通过信号是：Web approval 写入 `approvals.jsonl`，apply 通过 `aissh` 写入 Project workdir
并产生 applied receipt / handoff-ready metadata，pair 只把当次 Paseo pairing
response 显示在当前页面。pairing URL/QR、provider raw output、stdout/stderr transcript
和生成脚本不得写入 approvals、receipts、audit、snapshot、fixtures 或日志。

可执行 gate：

```bash
AIWORKER_WEB_LIVE_E2E=1 \
AIWORKER_WEB_LIVE_E2E_DEDICATED_TARGET=1 \
AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane \
AIWORKER_WEB_ADMIN_TOKEN=<admin-token> \
AIWORKER_WEB_E2E_ASSIGNMENT_ID=<assignment-id> \
AISSH_TOKEN=<aissh-token> \
bun run e2e:aiworker-web:live
```

未设置 `AIWORKER_WEB_LIVE_E2E=1` 时脚本只会报告 SKIP，不会触碰真实 target。
未设置 `AIWORKER_WEB_LIVE_E2E_DEDICATED_TARGET=1` 时脚本会在 mutation 前失败。
该 gate 不读取 `.aissh.yaml` secrets；真实凭据必须来自进程环境。
需要额外验证 headless Project 入口时，可设置 `AIWORKER_WEB_LIVE_E2E_PROJECT_SMOKE=1`；
这只断言 `paseo run --host <owner-loopback-host> --cwd <project-workdir>` 接受并记录了目标 workdir，不代表
provider session 完成、daemon pair 完成，或桌面 Project 已打开。

## shadcn 约束

本应用通过官方 CLI 初始化并维护组件：

```bash
bunx --bun shadcn@latest info --cwd apps/aiworker-web
bunx --bun shadcn@latest docs button card sidebar
bunx --bun shadcn@latest add button card sidebar --yes --cwd apps/aiworker-web
```

主题 token 与 sibling `aiworker-next` 的 shadcn `radix-mira`/`phosphor`/zinc 基线保持一致；合同测试在 `tests/architecture/aiworker-web-contract.test.ts`。
