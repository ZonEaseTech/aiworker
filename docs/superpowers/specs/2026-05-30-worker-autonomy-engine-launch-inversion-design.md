# Worker 自治 · Engine 启动权倒置 — 设计 Spec

- 日期：2026-05-30
- 状态：已确认设计，待转 implementation plan
- 范围类型：destructive refactor（1.0 前允许），结构倒置 + 文档/约束重写 + 最小 Host↔Worker 控制接口

## 1. 背景与目标

当前 canonical 合同（`docs/architecture.md` / `docs/runtime.md`）把 AIWorker 定义为
"CLI-first **local** product，Host 是 shell/locator/mount/bridge，Host 准备 engine
invocation 并观察 native engine"。即 **Host 持有运行时与 engine 启动权**。

本次重构做一次**控制面/数据面倒置**：

- **engine 启动权从 Host 移交给 Worker。**
- **Worker 成为最小可独立启动的 app**：自带 web / engine 启动 / runtime / projection /
  bridge / storage，**没有 Host 也能完整使用**（硬约束）。
- **Host 收缩为可选控制面**：顶级分发者 / 便捷管理者 / 权限分配者 / connector 授权者，
  并通过 mount worker 的配置 micro-app 来**配置** worker。

产出不止代码计划，还要**重写架构文档的思想与约束**，让下一个 agent 不会再按旧的
"Host-launches-engine" 模型继续做。

### 关键现实（降低风险评级）

worker 运行时**已经在代码里存在**：`packages/host-runtime/src/` 内部已分为
`worker/`（`executor.ts`、`session-engine.ts`、`engine-env.ts`、`local-engine-resolver.ts`
等 = 启动/执行 engine 的运行时）与 `host/`（`identity-provider.ts`、`runtime.ts` = host
编排+身份）；`host-daemon/src/modes/worker` 亦已存在。

因此本次倒置 **不是从零重写**，而是：把已存在的 `worker/` 缝隙**提升为一等自治 worker 面
（拿走 engine 启动权）**，把 `host/` **缩成真正的控制面**，加文档/约束重写 + 最小控制协议。

## 2. 决策记录（已锁定）

| # | 决策 | 结论 |
|---|---|---|
| D1 | Host 残余职责 | Host 完全可选；worker 自带 web 可独立运行是硬约束；**mount 的意义是让 Host 通过 worker 的 micro-app 去配置 worker（management mount，不是 employee mount）** |
| D2 | Soul vs Worker | **Worker = Soul App 的运行实例**；Soul = Template = 产品定义（descriptor-producing），保留；`aiworker worker create --soul freeform`，`--soul` ≡ `--template` |
| D3 | spec 范围 | 聚焦结构倒置 + 文档/约束重写 + 最小 Host↔Worker 控制接口；connectors / delivery-profile 数据模型 / 隔离 driver(container/VM) / gateway 鉴权细化 → roadmap 另开 |
| D4 | 入口拓扑 | 单一 `aiworker` CLI = worker 运行时入口（CLI-first 仍是 worker 本地入口，不需 Host）；Host 是另一个可选面 |
| D5 | 目录隔离 | 在现有 `apps/`/`souls/`/`packages/` 三桶内**加前缀**隔离面专属代码；共享能力包保留原名 |
| D6 | 发版形态 | **隔离**：worker 与 host 各自独立 binary/web，worker 制品零 host 依赖；硬约束 **worker-\* 禁止 import host-\*** |

## 3. 三层心智模型

```text
Soul / Template   产品定义 (descriptor-producing) —— 现有 souls/* + SDK，保留
      │ aiworker worker create --soul freeform   (--soul ≡ --template)
      ▼
Worker instance   自治运行体：自带 web / engine 启动 / runtime / projection / bridge / storage
      ▲ 可选、单向（Host 是 client，worker 是被动控制 server）
Host              控制面：分发 / 管理 / 权限分配 / connector 授权 + mount worker 配置 micro-app
```

- **员工心智**：打开 worker 的 web → workspace / session / composer 工作。员工**直连 worker
  web**，不经 Host，也不感知 worker / Soul / engine / Host 分层。
- **管理者心智**：通过 host-web 分发/管理/授权，并 mount worker 的配置 micro-app 来配置它。

## 4. 归属模型（写进 canonical docs，替换 `docs/architecture.md` 46–59 行）

### Worker（自治运行体）拥有

- 它运行的 Soul descriptor / template
- workspace locator + workspace root
- session lifecycle（active / archived / deleted）
- engine invocations（queued…lost）+ engine process state
- **engine 启动权**（engine-bridge：discover / start / follow-up / cancel / reattach /
  reconciler）← 本次搬走的权
- projection（engine-facing 文件、receipts、cleanup）
- worker-scoped config overlays（skills / MCP / entry-file CRUD）
- 自己的 web（员工 workspace/session/composer）+ app-owned API proxy
- 自己的 storage（SQLite）+ fs-layout
- 自己做 redaction

### Host（可选控制面）拥有

- worker registry：有哪些 worker、身份 / endpoint / health
- 分配元数据：给某 worker 指派了哪个 template/soul、哪些 connectors、哪个 engine/gateway
  profile、哪些权限（= delivery profile 的**归属**落在这；完整数据模型本 spec 不做）
- 权限分配 + connector 授权（控制面权威；connector 实现 deferred）
- 分发：provision / 拉起 worker（委托 worker 自己的 bootstrap）
- management mount：挂 worker 的配置 micro-app 来配置 worker
- **不持有** engine 进程、不持有 session/invocation runtime、不碰 domain state、不碰 secrets

### Soul / Template（定义，不变）拥有

descriptor 产出、micro-app、composer、能力声明、engine target 声明、authoring SDK。

## 5. 硬约束（写进文档，防下一个 agent 跑偏）

- **C1** Worker 必须能完全脱离 Host 独立运行（create → session → invocation → engine 启动
  → web）。Host 永不在运行时热路径上。
- **C2** engine 启动权只存在于 worker（engine-bridge 由 worker-runtime 消费）。Host 不得
  spawn / 观察 / 持有 engine 进程。
- **C3** Host 仅控制面：分发 / 管理 / 授权 / connector + management-mount。Host 不得拥有
  session、invocation、projection、engine、domain state、secrets。
- **C4** Soul = Template 仅定义（descriptor-producing）；worker 是其运行实例。
- **C5** Host↔Worker 只经最小控制契约通信；契约 **transport-agnostic**，**当前唯一载体是
  mounted 配置 micro-app**，预留未来非 web transport（不得写死成"必须走 web"）。Host 不得
  越过契约读 worker 运行时 / 领域内部。**worker 被动、Host 发起、worker 永不主动连 Host。**
- **C6** secret 边界不变：两个面都不得把 secret 落进 descriptor / DB / receipt / log /
  diagnostic / UI。

## 6. Monorepo 重构映射（prefix within existing buckets）

```text
apps/
  worker-cli/   ← rename apps/cli   bin 仍叫 aiworker；worker 运行时入口（aiworker worker create/start…）
  worker-web/   ← rename apps/web   worker 自带员工 web（workspace/session/composer）
  host-cli/     ← NEW               bin aiworker-host；控制面 CLI（分发/管理/授权）
  host-web/     ← NEW               控制面 web + mount worker 配置 micro-app

packages/
  # worker 面
  worker-runtime/           ← rename host-runtime（其 src/worker/* + soul-app/ + config/ 是主体）
  worker-daemon/            ← rename host-daemon（broker API，服务 worker 自己的 cli/web/mounted app；并暴露 worker 侧控制契约面，今由 mounted 配置 micro-app 驱动，契约 transport-agnostic 故未来可直连绑定）
  # host 面
  host-control/             ← NEW（从 host-runtime/src/host/* 抽出的真控制面：registry/分发/授权；经载体消费控制契约，今经 mounted micro-app，未来可非 web 直连）
  worker-control-protocol/  ← NEW（Host↔Worker 控制契约：transport-agnostic 的 verb/shape/校验 schema；今由 mounted 配置 micro-app 承载，被 worker-daemon 侧与 host-control 侧消费；预留非 web transport 绑定）
  # 能力包（保留原名，consumer 翻转为 worker / 文档重新定性）
  engine-bridge/            engine 启动机制 —— 文档改写为「worker 拥有 engine 启动权，经此包」
  engine-projection/        被 worker-runtime 消费
  soul-app-runtime/         被 worker 消费（跑 soul app）
  soul-workbench/           被 worker 消费（serve workbench）+ 被 host 消费（mount 配置 micro-app）
  soul-protocol/            定义层协议（descriptor/broker route/config envelope/mounted workbench/app-owned API），不变
  soul-app-sdk/             定义层 authoring，不变
  storage-sqlite/           worker 拥有自己的库；host-control 也用它存 registry/assignment
  fs-layout/  ui/           共享，不变

souls/
  aiworker-freeform/        定义层（= template），不变
```

### 4 个 carve-point（`host-runtime/src/host/*` 按 C1–C3 切开；实现期最易切错，故写入 spec）

1. `src/host/runtime.ts` → **拆**：engine invocation 编排 → `worker-runtime`；分发/管理编排
   → `host-control`。
2. `src/host/identity-provider.ts` → **拆**：worker 自身身份（who am I）→ worker-runtime；
   用户/权限身份（who's allowed）→ host-control。
3. `src/soul-app/registry.ts` → **拆**：「本 worker 运行的那个 soul」→ worker-runtime；
   「可分发的 template 目录」→ host-control。
4. `src/worker/executor.ts`（BYOK）+ `src/worker/*` 全部 → worker-runtime（BYOK 偏差随之
   re-home 到 worker）。

### 命名纪律

- 不破坏 no-dumping-ground 规则：每个能力包仍是独立命名包，无新建 `shared`/`core` 桶；
  `worker-control-protocol` 是单一职责契约包。
- 包目录 `apps/cli → apps/worker-cli`，binary 名 `aiworker` 不变。
- 协议包名定为 `worker-control-protocol`（已确认）。

## 7. Host↔Worker 最小控制契约（`worker-control-protocol`）

### 契约（transport-agnostic）

worker-control-protocol 只定义**逻辑 verb 与消息形状**，类型里不得 hardcode 任何 transport。
本 spec 只定**最小面**，connectors / delivery 数据模型 deferred：

- **worker.describe** — worker 自描述：身份、所跑 soul/template、版本、能力摘要、health
  （Host registry 消费）；自描述中暴露**配置 micro-app entry**（复用 soul-workbench
  `router-mode="search"`）。
- **worker.health** — 存活。
- **worker.lifecycle** — **实例级**生命周期（provision 后的 stop / decommission 等），
  **不含** session/invocation（那是 worker 内部、员工驱动）。
- **worker.assignment** — 分配信封：authorized connectors / permissions / gateway profile
  ref。**本 spec 只定信封形状 + 版本，不实现 connector**。

### 当前载体 = mounted 配置 micro-app（唯一通道）

今天 Host↔Worker 通信的**载体就是 mounted 的配置 micro-app**：host-web mount worker 的配置
micro-app（worker-owned UI），上面的契约经此 micro-app 面承载。**目前不存在其他直接
Host↔Worker 通道。**

### 预留 transport 扩展（不要写死）

契约与 transport 刻意解耦。未来 `aiworker-host` 可用**非 web transport**（直连控制 API /
RPC / 消息总线…）绑定同一契约，无需改契约本身。实现期必须预留 transport-binding seam；
contract 类型里不得把 micro-app / web 当成唯一 transport。非 web 绑定实现本身 deferred（见 §11）。

### 方向与边界

worker = 被动方，Host = 发起方；worker 永不主动连 Host（保证 C1，载体闲置即可独立运行）。
domain / runtime 一律不上这条契约（C5）。

## 8. 文档/约束重写清单

| 文档 | 关键改写 |
|---|---|
| `AGENTS.md` | Product/Runtime Boundary 重写：Worker 自治拥有 engine 启动；Host=控制面；新 default path；加 monorepo 前缀规则 + worker-\*≠host-\*；写入 C1–C6 |
| `docs/architecture.md` | Position + Ownership 表（46–59 行）换成本 spec §4 三层归属；Monorepo 包列表更新（§6）；Protocol Boundary 增 Host↔Worker 控制契约 + 区分 management-mount vs employee-mount；Runtime Boundary engine 执行归 worker；Decision Coverage Index 增 worker-control-protocol 归属 |
| `docs/runtime.md` | Local Daemon → worker-daemon/worker-runtime；Engine Bridge 归 worker；**BYOK 偏差段从「host-runtime 直发」改写为「worker-runtime 直发」并降级偏差性质**（从「Host 越权」降为「worker 内 non-native-engine fallback」）；Projection 调用方改 worker |
| `docs/protocol.md` | 增 Host↔Worker 控制协议契约（引 worker-control-protocol）；澄清 management-mount |
| `docs/testing.md` | 加 §11 的 G1–G6 守卫到 coverage ledger |

memory `refactor-state-2026-05` / BYOK 两条在实现启动时更新，标记「v1 done」被本阶段取代，
避免下个 session 误判 refactor 已结束。

## 9. 迁移顺序（contract-first，沿用现有 Destructive Migration 纪律）

1. **先 promote 文档**（architecture / runtime / protocol / testing + AGENTS，写入 C1–C6）
   → 权威先行，下个 agent 不跑偏。
2. 加**红的** contract-test 骨架（G1–G6）。
3. 建目标包骨架：`worker-control-protocol`、`host-control`、`apps/host-cli`、`apps/host-web`。
4. **机械 rename**：host-runtime → worker-runtime、host-daemon → worker-daemon、
   apps/cli → worker-cli、apps/web → worker-web（package.json 名 + imports）。
5. **carve** 4 个 carve-point 跨 worker/host 切开。
6. 抽出 host-control + 实现最小控制协议（worker-daemon 出 server / host-control 出 client）。
7. wire host-web 的 management-mount（骨架）。
8. **转绿**：worker standalone golden path 在 **Host 缺席**下全通。
9. 删旧权威/旧名；确保 worker-\* 零 host-\* import。
10. 更新 memory。

## 10. 测试守卫（把 C1–C6 变成硬测试 = 真正的"防跑偏"机制）

- **G1 ↔ C1** worker standalone golden path：**不起 host 进程**，freeform
  create → session → invocation → engine 启动 → web 全通（自治性杀手测试）。
- **G2 ↔ C2** engine 启动符号只被 worker-\* import；host-\* 不得引用 engine 启动。
- **G3 ↔ D6** 依赖方向：worker-\* 的 deps/imports 永不指向 host-\*。
- **G4 ↔ C3** host-control 不暴露 session/invocation/projection/engine/domain/secret 归属。
- **G5 ↔ C5** 唯一 Host→Worker 契约是 worker-control-protocol（今经 mounted 配置 micro-app
  载体）；其余耦合为零；契约类型不得 hardcode transport。
- **G6 ↔ C6** secret redaction 守卫覆盖两面。

## 11. 范围边界与 Roadmap

### 本 spec 覆盖（in-scope）

结构倒置（engine 启动权 → worker、worker 自治、Host → 控制面、Soul=template）+ 文档/约束
重写 + 最小 Host↔Worker 控制接口（§7 信封形状）+ G1–G6 守卫。

### Roadmap（另开 spec，不在本次实现）

- **Connectors 子系统**：授权 / 交付 / 能力（企业服务账号优先、个人授权补充）。
- **Worker Delivery Profile 数据模型**：Worker Product Template 与 Delivery Profile 二分的
  完整结构。
- **隔离 driver**：dev container / prod VM，1 worker instance = 1 独立 worker server。
- **Engine gateway 鉴权细化**：native engine + 官方 env/settings 把 base URL+key 指向企业/
  第三方模型网关（替代账号池/登录官方账号）。
- **Host↔Worker 非 web transport 绑定**：契约已 transport-agnostic 预留；直连控制 API /
  RPC / 消息总线等绑定实现 deferred（micro-app 仍是当前唯一载体）。

## 12. 连带影响

- **BYOK P2 偏差 re-home**：`host-runtime/src/worker/executor.ts` 随 rename 进 worker-runtime，
  偏差从「Host-owned model call」变为「worker-runtime 内 non-native-engine fallback」，
  `docs/runtime.md` 相应改写。
- **memory 取代**：本阶段取代「Freeform v1 done = refactor done」状态；实现启动时更新
  `refactor-state-2026-05` 与 BYOK 两条 memory。
- **supersedes**：本 spec 推翻当前 canonical 的「Host 准备 engine invocation、观察 native
  engine」模型，是新的 refactor 目标。
</content>
</invoke>
