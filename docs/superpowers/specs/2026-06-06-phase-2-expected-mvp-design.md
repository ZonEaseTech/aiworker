# AIWorker Phase 2 Expected MVP Design

日期：2026-06-06

状态：校正版阶段目标。用户已要求由 Codex 接管并按 goal 模式推进；本 spec 收敛 Phase 2 可落地 MVP，避免把 Host dev loop 误判为 Phase 2 完成。

## Plain Judgment

上一轮完成的是 Host 技术开发闭环，不是 Phase 2 期望目标。

Phase 2 Expected MVP 必须让管理员在 Host 里完成一条可见、可解释、可验证的分发旅程：

```text
选择员工企业邮箱 -> 选择 aissh server -> 选择 Soul release
-> 创建 assignment -> 得到一次性 provision command / aissh exec command
-> Worker 主动 check-in -> Host 显示闭环状态
```

Logto 真实对接和 Worker Access Tunnel 可以滞后，但不能因此把 UI 做成临时表单。Host Web 必须已经像控制台，而不是一张开发测试卡片。

## User And Scenario

目标用户：

- 懂行的人：把专业能力做成 Soul release。
- 管理员：给员工开通一个专属 AIWorker。
- 员工：打开自己的 Worker，使用开箱即用的 Workbench。

MVP 只落管理员分发旅程。Soul Builder 的 web 编辑和员工 Worker Access 真通道是后续阶段；本轮只保留明确入口和状态边界。

管理员要解决的问题不是“Host API 能不能写入一条数据”，而是：

- 我知道有哪些服务器可选。
- 我知道有哪些 Soul release 可分发。
- 我知道开通给了哪个员工。
- 我知道下一步应该执行什么命令。
- 我知道 aissh 成功不等于 Worker 可用。
- 我知道 Worker 已经主动 check-in，闭环成立。

## Product Core

AIWorker 的核心仍然是：

> 让一个懂行的人，把一套专业能力做成 Soul、快速迭代，再低成本复制给一群不懂技术的员工；每个员工因此拥有一个开箱即用的专属 AI 工作者。

本轮不能引回旧思维：

- 不做 mount。
- 不做 micro-app。
- 不做 Host-rendered Worker Workbench。
- 不引入 Soul Profile。
- 不把 config raw editor 塞进开通流程。

## Approaches Considered

### A. 继续当前 Dev Loop UI

保留当前居中表单和卡片列表，只修 API root。

优点：最快。

缺点：产品体验不成立。管理员看不到 Host 控制台结构，开通、状态、配置、命令全混在一屏卡片里，无法代表 Phase 2。

结论：不采用。

### B. 一次做完整 Logto + Tunnel + Gateway

同时做真实登录、access adapter WebSocket reverse tunnel、员工 `/workers/:workerId` 可访问。

优点：最接近最终 Phase 2。

缺点：风险过大。Logto 和 tunnel 都是高复杂边界，会拖慢当前 Host 分发体验验收，并把失败点从产品形态转移到基础设施。

结论：不作为本轮目标。

### C. Expected MVP Control Console

把 Host Web 做成真实控制台：左导航、主列表、右抽屉；API 提供 assignment + options；CLI 与 Web 使用同一份 Host API 合同；Worker check-in 仍是真实闭环；Logto/tunnel 以状态门和边界说明滞后。

优点：满足用户可见体验，保持实现可控，和现有 storage/check-in 能力衔接。

缺点：还不能让员工真正通过公网打开 Worker。

结论：采用。

## MVP Scope

### In Scope

- Host API 继续使用 `127.0.0.1:9117`。
- Host Web 继续使用 `127.0.0.1:5050/host`。
- API root 和 `/host` 在 dev 下给出明确 Web URL，不再只显示一行 `AIWorker Host`。
- `GET /api/host/assignments` 返回真实 assignment views。
- `POST /api/host/assignments` 创建真实 assignment，返回一次性 provision command。
- `GET /api/host/options` 返回 Host Web/CLI 所需候选：
  - `servers`: 来自 `aissh server list`。
  - `soulReleases`: 来自 repo official Soul descriptors。
  - `auth`: 当前 Logto 状态边界。
  - `access`: 当前 Worker Access Tunnel 状态边界。
- CLI 增加 `option list`，展示同一份 options，不泄露 secret。
- Web 改成控制台布局：
  - left nav：`AI Workers`、`Souls`、`Activity`、`Settings`。
  - main：AI Workers assignment table/list。
  - right drawer/panel：开通表单、命令、状态时间线、配置摘要。
- 开通流程使用 API options 中的 server 和 soul 候选；允许 fallback 手输，但 UI 首选选择。
- Worker check-in 后，Host Web 显示 `Worker 已报到`。
- 未 ready 前不显示可用的 `打开 Worker`。
- 配置透传第一版只显示只读摘要：
  - Soul release。
  - descriptor 来源。
  - MCP/entry/skills 是否由 Soul release 携带。
  - 不在开通时编辑 Markdown/JSON/TOML。

### Deferred

- 真实 Logto 登录、OIDC 回调、session cookie。
- Worker Access WebSocket reverse tunnel。
- `/workers/:workerId` 真正转发到 Worker Workbench。
- Host web Soul Builder 编辑器。
- 自动 GitHub 拉取 Soul 更新。
- 自动执行 aissh 安装命令作为默认动作。

这些滞后项必须在 UI 和 docs 中作为明确状态门，不得假装 ready。

## URL Contract

开发环境：

```text
http://127.0.0.1:9117/
  Host API dev landing。显示 API/Web URL 和主要 endpoint。

http://127.0.0.1:9117/host
  Host API dev landing。提醒 Web 在 5050/host。

http://127.0.0.1:5050/host
  Host Web 控制台。

http://127.0.0.1:9117/api/host/options
  Host options API。

http://127.0.0.1:9117/api/host/assignments
  Assignment list/create API。

http://127.0.0.1:9117/api/provision/check-in
  Worker check-in API。
```

目标生产合同保持：

```text
https://aiworker.zonease.org/host
https://aiworker.zonease.org/api/host/*
https://aiworker.zonease.org/api/provision/*
https://aiworker.zonease.org/workers/:workerId
```

本轮不实现生产 single-origin gateway，只把合同保持清楚。

## Host Options Contract

`GET /api/host/options` response:

```json
{
  "servers": [
    {
      "id": "693660ea-3c2a-4f15-8b50-7dd9e5651877",
      "name": "aiwork",
      "host": "172.105.219.50",
      "notes": "aiwork项目平台服务器",
      "source": "aissh"
    }
  ],
  "soulReleases": [
    {
      "id": "aiworker-freeform",
      "name": "AIWorker Freeform",
      "releaseRef": "aiworker-freeform@dev",
      "descriptorPath": "souls/aiworker-freeform/dist/soul.descriptor.json",
      "source": "official"
    }
  ],
  "auth": {
    "mode": "dev-static",
    "status": "deferred-logto"
  },
  "access": {
    "mode": "not-ready",
    "status": "deferred-worker-access-tunnel"
  }
}
```

Rules:

- `aissh server list` 失败时返回 `servers: []` 和 `serverSourceError`，Host Web 显示错误态并允许手输 server id。
- Soul descriptor 读取失败时只跳过该 release，并返回 `soulSourceErrors`。
- Options 不包含 aissh token、Logto token、MCP secret、native engine secret。

## Assignment Contract

Assignment 仍是服务端事实账本：

```text
assignment_id
assigned_email
server_ref
soul_release_ref
worker_id
worker_version
workbench_url
status
timestamps
```

创建 assignment 返回：

- `assignment`
- `provisionCommand`
- `aisshCommand`
- `provisionToken` only in creation response

`aisshCommand` 是显式执行建议，不自动执行：

```bash
aissh exec <server_id> "<provisionCommand>" --reason="Provision AIWorker for <email>"
```

这样既满足“Host 指定服务器”的体验，又不把真实服务器执行风险放进默认开通动作。

## Host Web Experience

First viewport must read as a control console:

```text
AIWorker Host
左侧导航 | 中间 AI Workers 清单 | 右侧开通/详情抽屉
```

Main list:

- employee email
- worker id / waiting
- server
- soul release
- status
- latest next step

Right drawer default state:

- title: `开通 AI Worker`
- fields:
  - employee email
  - aissh server select
  - Soul release select
- config summary:
  - `配置随 Soul release 透传`
  - `Host 不在开通时编辑 raw config`
- primary action: `创建开通`

After create:

- show one-time provision command.
- show aissh exec command.
- state token only appears once.
- status timeline:
  - `Assignment 已创建`
  - `等待执行 provision command`
  - `等待 Worker check-in`
  - `Worker Access Tunnel 未接入`
  - `Logto 未接入`

Selecting a row changes drawer to detail mode:

- assignment detail.
- timeline.
- copy commands if available in current response only.
- no enabled `打开 Worker` until status is `ready`.

## CLI Experience

CLI must speak the same product language as Web:

```bash
aiworker-host option list --host http://127.0.0.1:9117
aiworker-host assignment create --email bob@zonease.org --server <aissh-server-id> --soul aiworker-freeform@dev
aiworker-host assignment list
```

CLI output:

- JSON by default.
- no provision token in assignment list.
- assignment create may include provision command and aissh command.
- option list may include aissh server ids and Soul release refs.

## State Machine

Current implementation supports:

```text
provisioning -> checked_in -> access_ready -> ready
```

This MVP visibly proves:

```text
provisioning -> checked_in
```

`access_ready` and `ready` remain represented but not falsely triggered.

Status copy:

```text
provisioning: 等待 Worker check-in
checked_in:   Worker 已报到
access_ready: 访问通道已就绪
ready:        可打开 Worker
revoked:      已撤销
archived:     已归档
other:        开通中
```

## Security And Boundary

Assignment security stays server-side:

- exact email gate remains in Host control logic.
- provision token remains one-time, hash-persisted only.
- CLI list and Web list do not receive token values.
- options API never returns credentials.
- Host does not read Worker chat/session/workspace/artifact/native secret.
- `/workers/:workerId` remains not-ready until real access tunnel exists.

Logto boundary in this MVP:

- UI may show `Logto 未接入` as system status.
- code keeps provider-neutral auth adapter.
- no fake Logto login screen.

Worker Access boundary in this MVP:

- access adapter remains in-process boundary module.
- API may return `WORKER_ACCESS_UPGRADE_REQUIRED` or `WORKER_ACCESS_NOT_READY`.
- no fake `ready` or fake Worker page.

## User-Visible Acceptance Criteria

- Opening `http://127.0.0.1:9117/` no longer looks like a broken Host Web page; it points to `http://127.0.0.1:5050/host`.
- Opening `http://127.0.0.1:5050/host` shows a Host control console with left nav, main AI Workers list, and right drawer.
- The right drawer can create an assignment using employee email, aissh server, and Soul release.
- Server options come from real `aissh server list` when available.
- Soul options come from official Soul descriptors.
- Assignment creation shows provision command and aissh exec command once.
- Assignment list never exposes provision token or token hash.
- Worker check-in changes visible status to `Worker 已报到`.
- Checked-in Worker still does not show an enabled `打开 Worker`.
- UI clearly marks Logto and Worker Access Tunnel as deferred/not ready.
- Browser proof verifies the `/host` layout, create flow, check-in flow, and no mount/iframe/micro-app.

## Non-Goals

- Do not implement real Logto.
- Do not implement reverse tunnel.
- Do not make `/workers/:workerId` render Worker content.
- Do not edit Soul files from Host Web.
- Do not add Profile.
- Do not store literal secrets in assignment/options.
- Do not auto-run real aissh exec by default.

