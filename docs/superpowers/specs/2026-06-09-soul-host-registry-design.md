# Soul 发布/分发到 Host —— Slice 1:Host 持久化 Soul Release Registry

日期:2026-06-09
状态:设计已确认(autopilot,用户裁决:完整闭环分片递进,本片做 Slice 1)

## 背景与问题

AIWorker 的 Host 是 Phase 2 控制面。canonical 架构(`docs/architecture.md`)规定 Host 拥有
"Soul release metadata: published versions, rollout state, and rollback records",Phase 2 MVP 闭环是:

```text
expert author -> published Soul version -> Host assignment -> employee Worker
```

**当前现状(已证实的洞)**:Host 的可分配 Soul 列表完全靠 `apps/host-cli/src/host-options.ts`
里的 `buildHostOptions()` 扫描 **本地 repo** `souls/<id>/dist/soul.descriptor.json`,且只认硬编码的
5 个 `OFFICIAL_SOUL_IDS`,产出临时的 `soulReleases`(`releaseRef = <id>@dev`,`source: 'official'`)。
后果:

- **npm 安装的生产 Host 根本没有 `souls/` 目录 → `soulReleases` 恒为空 → 管理员无法给员工分配任何 Soul。**
  当前机制只对 repo-checkout 的 dev 环境有效。
- `soulReleaseRef` 仅作为 assignment 上的装饰性字符串。Worker 回连(`provision-client.ts`)拿到它,
  但 **Worker 不从 Host 拉 descriptor**;Worker 用自带 bundle 的 descriptor
  (`worker-runtime/src/soul-app/official-definitions.ts` 硬编码 repo 相对路径,生产 worker-cli 只 bundle 了 freeform)。
  即 **当前没有 Host→Worker 的 descriptor 投递**。

## 范围(用户裁决)

- 完整闭环 = Host 持久化 soul release registry(版本化 publish + rollout/rollback)+ Host→Worker descriptor 投递。
- 交付节奏 = **分片递进**。
- 「可选」= 仅强调"Host 本身是可选控制面",**不是**功能开关。

**本片 = Slice 1**:让生产 Host 拥有真实、持久化、可配置的可分配 Soul 目录,堵住"生产空列表"这个最硬的洞。

### Slice 边界

- **Slice 1(本片)**:Host 持久化 soul registry + publish/list CLI + Host API 路由 +
  `/api/host/options` 改从 registry 读 + dev seed 兜底 + canonical 文档登记。**不碰 worker。**
- **Slice 2(后续)**:Host→Worker descriptor 投递,`soulReleaseRef → descriptor` 端到端。
- **Slice 3(后续)**:rollout/rollback 跨 assignment + host-web 专用 publish/发布 UI。

## 架构决策

1. **descriptor 内容存 host.db(方案 A)**。descriptor 是 KB 级小 JSON;存进 host.db 让 soul registry
   成为单一可备份事实源,Slice 2 投递直接读 DB。Host 把 descriptor 当 **不透明发布产物** 存储,
   不解释任何 domain 字段 —— 符合 canonical 的 descriptor-only 边界。

2. **版本号由 publish 命令提供**,不进 descriptor。descriptor v1 按 canon 不含 version 字段
   (`protocol` / `identity` / `engine`),不扩展该契约。`releaseRef = <soulId>@<version>`;
   `--version` 缺省 = 该 soulId 在 registry 中的下一个单调整数(从 1 起)。

3. **生产事实源 = registry**。`buildHostOptions().soulReleases` 改为从 host.db registry 读,
   不再扫 repo `souls/`。dev/E2E 通过 seed 兜底(见下)。

4. **鉴权完全镜像现有 `/api/host/assignments` POST**(`host:admin`)。不新增权限种类、不扩 allowlist。

## 组件设计

### 1. 存储 `packages/storage-sqlite/src/host`

- 新表 `host_soul_releases`(`schema.ts`):
  - `release_ref` TEXT PRIMARY KEY(`<soulId>@<version>`)
  - `soul_id` TEXT NOT NULL
  - `name` TEXT NOT NULL
  - `version` INTEGER NOT NULL
  - `descriptor_json` TEXT NOT NULL(完整 descriptor 内容,不透明存储)
  - `source` TEXT NOT NULL(`official` | `custom`,默认 `custom`)
  - `published_at` TEXT NOT NULL
  - `published_by` TEXT NOT NULL(caller class,如 `cli` / `web`,非用户身份)
  - 索引:`soul_id`;`(soul_id, version)` unique。
- `runHostMigrations()` 追加 `CREATE TABLE IF NOT EXISTS host_soul_releases (...)` + 索引,沿用现有 idempotent 风格。
- 新函数(`index.ts`):
  - `publishSoulRelease(input): HostSoulReleaseRow` —— 校验 descriptor v1 结构(复用 `soul-descriptor` 校验器);
    version 缺省=`max(version for soulId)+1`;`assertNoLiteralSecrets(descriptorJson, 'host_soul_releases.descriptorJson')`
    拒绝携带字面密钥的 descriptor;`releaseRef` 冲突则报错(同 soulId@version 不可重复 publish)。
  - `listSoulReleases(limit?): HostSoulReleaseRow[]`
  - `getSoulRelease(releaseRef): HostSoulReleaseRow | null`
- 导出类型 `HostSoulReleaseRow`、`PublishSoulReleaseInput`。

### 2. Host API `apps/host-cli/src/host-server.ts`

- `POST /api/host/soul-releases`:body `{ descriptor: object, version?: number }`。
  校验 descriptor v1;落库;返回 `{ release }`(descriptor 内容在响应里可回显,Slice 1 不裁剪)。
  **管理员鉴权,镜像 `/api/host/assignments` POST 的鉴权与错误形态(401/403)。**
- `GET /api/host/soul-releases`:返回 `{ releases }`(列出 registry;可含 descriptor 摘要,Slice 1 直接返回行)。
- `/api/host/options` 的 `soulReleases` 字段改为从 registry 读(`listSoulReleases()` 投影成
  现有 `HostSoulReleaseOption` 形态:`{ id, name, releaseRef, source, descriptorPath? }`;
  `descriptorPath` 不再适用,改为省略或留空)。

### 3. host-cli `apps/host-cli/src/aiworker-host.ts`

- `aiworker-host soul publish <descriptorPath> [--version <n>] [--host <url>]`:
  读本地 `dist/soul.descriptor.json` → 解析 JSON → POST `/api/host/soul-releases`。
- `aiworker-host soul list [--host <url>]`:GET `/api/host/soul-releases`,`printJson`。
- doctor 可加一条 info/warn:registry 为空(可选,低优先级)。

### 4. dev/测试种子

- `buildHostOptions` 不再扫 repo `souls/`(改读 registry,见组件 2)。
- `serve` 加 **dev-only** `--seed-souls-dir <dir>`:Host 启动且 registry 为空时,
  自动 publish 该目录下已 build 的 descriptor(扫 `<dir>/*/dist/soul.descriptor.json`),`source: 'official'`。
  - `dev:host` workflow 传 repo `souls/`,保持 dev/E2E 仍看到官方 souls。
  - 单测直接调 `publishSoulRelease()` 种子。
  - browser E2E 走 seed flag。

### 5. canonical 文档

- `docs/architecture.md`:Host Ownership 段明确 Host 拥有 **持久化 soul release registry**,
  将已发布 descriptor 作为 **不透明发布产物** 存储(descriptor-only,不解释 domain);
  soul releases 来自 publish 而非 repo scan。
- `docs/protocol.md`:登记新 host API 路由(`POST/GET /api/host/soul-releases`)+ host-cli `soul` 命令 +
  registry 概念;`soulReleaseRef → descriptor` 投递到 worker 明确标注为 **Slice 2(Phase 2 后续)**。
- `docs/testing.md`:登记覆盖账本条目(storage / host-server / host-cli / browser)。

## 数据流(Slice 1)

```text
author: aiworker soul build  ->  souls/<id>/dist/soul.descriptor.json
admin:  aiworker-host soul publish <descriptor> --version N
          -> POST /api/host/soul-releases  (host:admin)
          -> publishSoulRelease(): 校验 + secret-guard + 落 host_soul_releases
host-web / assignment form:
          GET /api/host/options -> soulReleases (来自 registry)
          -> 管理员从真实 registry 选 release 创建 assignment
```

## 错误处理

- publish:descriptor 结构非法 → 400;含字面密钥 → 拒绝(secret-guard 抛错 → 400/500 镜像现有);
  releaseRef 重复 → 409(同 soulId@version 已存在)。
- 鉴权失败 → 401/403,形态与 `/api/host/assignments` 一致。
- registry 为空(生产未 publish)→ `soulReleases: []`,host-web 已有空态/错误展示。

## 测试策略

- **storage 契约测试**:publish/list/get、version 自增、releaseRef 唯一冲突、secret-guard 拒绝、迁移 idempotent。
- **host-server 路由测试**:POST/GET soul-releases、鉴权(401/403)、descriptor 校验失败、`/api/host/options` 从 registry 读。
- **host-cli 命令测试**:`soul publish` / `soul list`(注入 fetch),错误路径。
- **browser E2E**:seed → host-web Souls 面板显示 registry 内容 + assignment 表单可选。
- 验证用 `bun run --filter <pkg>` 在各包 cwd 跑(避免根 .env Logto 泄漏);完成前跑 code-review-graph。

## 明确不做(Slice 2/3)

- Host→Worker descriptor 投递、`soulReleaseRef → descriptor` 端到端解析、worker 侧任何改动。
- rollout / rollback 跨 assignment。
- host-web 专用 publish / 发布 / 版本管理 UI(Slice 1 仅 SoulsPanel 列表数据源切换,UI 结构不新增)。
- 扩展 descriptor v1 契约(不加 version 字段)。
```
