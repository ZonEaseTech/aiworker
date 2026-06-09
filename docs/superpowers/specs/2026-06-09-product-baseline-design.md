# AIWorker 产品基线

> 状态：已与用户对齐（2026-06-09 brainstorming）。本文件是产品基线的**策略性表述**，锚定 canonical docs；它不取代 canon，而是把 canon 的工程合同翻译成"定位 / 面向群体 / 价值 / 旅程 / 目标"的产品口径。canon 永远是权威：`docs/architecture.md`、`docs/protocol.md`、`docs/runtime.md`、`docs/soul-authoring.md`、`docs/testing.md`。

## 0. 口径来源与方法

- 权威来源：`docs/architecture.md`（Position / Phase 2 Product MVP）+ `AGENTS.md`（Product Boundary）+ `docs/testing.md`（Phase 2 MVP Experience Proof Scope）+ 四个真实域 Soul（`souls/hr-manager`、`software-support`、`product-manager`、`google-ads`）。
- 非权威、且有漂移：`README.*`。README "它为谁而建" 偏个人 power-user 口径，且其架构段（中文版 line 118）残留已废弃的 "Host 把 Workbench 框成 micro-app" 说法，与 architecture.md 的 no-mount/no-iframe/no-render 规则冲突。README 不在 `AGENTS.md` 的 Authority 五文档清单内，**只作证据、不作定位依据**。处置见 §7。
- 一个被 canon 关闭的伪命题：曾担心"AIWorker 是个人本地 AI worker（README 口径）vs 组织能力复制平台（architecture 口径）"是二选一。它不是。canon 的 Position 是首段且明确——组织能力复制是北极星；standalone 只是证明运行时成立的 **v1 底座**，不是另一个定位。

## 1. 定位

**一句话**：AIWorker 是一个**让"一个懂行的人的专业能力"被打包、迭代、再低成本复制成"一群员工的产能"的本地优先 AI 运行时层**。

- **不是什么**：不是给开发者的 IDE / coding agent；不是租用的云端 agent 平台；不是 RPA / 工作流编排工具。
- **是什么**：一个**运行时层**——把"一个原生引擎 + 一个能力模板（Soul）"变成自托管、自带 Workbench、开箱即用的 AI 工作者（Worker）。本地优先，引擎中立（Codex / Claude Code）。
- **三层杠杆**：`Soul = 能力载体` ／ `Host = 迭代+复制的杠杆` ／ `Worker = 员工侧开箱即用的终端`。
- **北极星 vs 底座**：北极星 = 组织级能力复制（Phase 2，Host 是杠杆）；v1 = 只发 standalone Worker（证明运行时成立的底座），不是与北极星竞争的另一个定位。

## 2. 面向群体

三个角色：

| 角色 | 是谁 | 关心什么 |
| --- | --- | --- |
| **能力作者（expert author）** | 团队里"懂行的人"——资深 HR / 客服 / PM / 投放专家 | 把打法做成 Soul、快速迭代，**不必把 Soul 变成 app 或后端** |
| **组织管理员（administrator）** | 分配能力、管权限的人 | 把一份已发布能力**可见地**复制给一群人，管版本、灰度、回滚、connector 授权 |
| **员工（employee）** | **不懂技术**的一线执行者 | "我的 AI 工作者已就绪"——不学 Soul / descriptor / MCP / 引擎 / Host |

**真正买单的组织** = 拥有"一个专家 + 一批需要复制该专家能力的员工"的公司。现有四个真实域 Soul 已钉死画像：**TTPOS**（餐饮 POS SaaS，中国 + 泰国出海）的人事经理 / 软件客服 / 产品经理 / 谷歌推广代运营——全是公司能力复制给员工，不是个人玩具。TTPOS 是当前标杆案例。

## 3. 产品价值

**核心公式：一个人的能力 → 全员的产能。一次编写，处处复制。**

- **对作者**：能力沉淀为可版本化资产（Soul），改一次全员受益；不被迫做成 app / 后端。
- **对管理员**：复制 = 分发一个 assignment（已发布 Soul 版本 + 授权 connector + 权限 + gateway/profile），readiness、灰度、回滚都看得见。
- **对员工**：零学习成本的专属 AI 工作者，开箱即用。
- **结构性差异化**：本地优先 · 引擎中立 · descriptor-only **不锁定** · 密钥绝不外泄 · **Worker 永不依赖 Host**（自治边界代码层强制，`worker-*` 不 import `host-*`）。

## 4. 用户旅程

**v1（单人闭环 = 底座，实际只有一个角色：作者/运营者既写又用）**

```text
aiworker start → 绑定 Soul 的 Worker 就绪 → 建 workspace → 开 session(chat)
  → 首条消息=首次引擎 invocation → follow-up → cancel/完成 → Workbench 渲染 chat → 归档
```

**Phase 2（三角色链 = 真正的产品旅程）**

```text
能力作者 发布 Soul 版本
  → 管理员 assignment 分配给员工/组（授权 connector · 权限 · gateway/profile）
    → 员工 收到/启动专属 Worker
      → 打开自己的 Workbench 直接开工（不学任何技术概念）
  ↻ 作者发新版本，管理员灰度/回滚
```

**Phase 2.1（受管远程访问）**

```text
员工浏览器 → Host /workers/:workerId → Logto → assignment → Worker 反向 tunnel → Worker 自有 Workbench
```

Host 只做企业 URL + 鉴权边界，**绝不 mount / iframe / render** Workbench；Host / tunnel 宕机不影响 Worker 本地运行。

## 5. 期望目标

范围（用户裁定）：**产品有效性目标 + 分阶段退出标准 / DoD**；不含商业量化 KPI，不单列竞争定位。

### A. 产品有效性（北极星：Phase 2 MVP 必须证明三件事）

- **作者体验成立**：一套专业能力能被打包、发布、迭代，**而不必把 Soul 变成 app 或后端**。
- **管理员体验成立**：一份已发布能力能**可见地**复制给多名员工——assignment、connector 授权、gateway/profile、Worker readiness、灰度/回滚状态都看得见。
- **员工体验成立**：结果感觉是"**我的 AI 工作者已就绪**"，而非技术部署 / Host 仪表盘 / 嵌入页 / 配置苦工。

（与 `docs/testing.md` 的 "Phase 2 MVP Experience Proof Scope" 一致。）

### B. 分阶段退出标准 / DoD

| 阶段 | Definition of Done | Forcing function（退出硬门） |
| --- | --- | --- |
| **v1 — standalone 底座** | Freeform 独立闭环在 Host 缺席下全程跑通：SDK 编写 → descriptor 构建 → descriptor-only 安装 → 绑定 Worker → workspace → worker config overlay → projection → session → 首次 invocation → follow-up → cancel/完成 → Workbench 渲染 chat → 归档 | 零配置 `aiworker start` 单端口起；`release:check` 全绿（含 `test:browser:freeform` 独立运行证明） |
| **Phase 2 — 分发 MVP** | 三角色链闭环：作者发布版本 → 管理员 assignment 分配 → 员工拿到专属 Worker 直接开工；作者发新版、管理员可灰度/回滚 | **第一个真员工开通并跑通 native engine 真回合** + **≥2 名并发真员工** + 经 zonease.org |
| **Phase 2.1 — 受管远程访问** | 员工经 `Host /workers/:id → Logto → assignment → Worker 反向 tunnel → Worker 自有 Workbench` 访问；Host 不 render；Host / tunnel 宕机不影响 Worker 本地运行 | 真实双机互联活跑 |

贯穿三阶段的不变量：**Worker 永不依赖 Host** · Host 永不进运行热路径 · Host 永不读 session / invocation / projection / engine / secret · `worker-*` 不 import `host-*`（代码层强制）。

## 6. 非目标 / 暂不做（防 scope 蔓延）

- v1 不做云后端、不做控制服务器；Host 全在 Phase 2，且永不在运行热路径。
- 不做 micro-app / mounted workbench / iframe / Host-rendered Worker UI——任何阶段都不把它当产品价值。
- Soul 不提供 UI / app 私有 API / capability 层 / 领域后端。
- 一个 Worker 终生绑定一个 Soul，不做运行期换 Soul。
- Host 不做领域工作流、产品后端、agent runtime、仓库看板、Soul 配置中心。
- 本基线不引入商业量化 KPI（营收 / 付费组织数 / 留存）——需要时另起一轮。

## 7. canon docs update（本轮配套）

基线本身大部分是 canon 已有内容的再表述，故 canon 更新是外科手术式的：促进"被裁决但尚未进 canon"的项，并废弃/更新与 canon 冲突的残留：

1. **`docs/testing.md` 新增 "Phase DoD Forcing Functions" 段**：把分阶段 DoD 的 **forcing functions**（v1 = 零配置 `aiworker start` + `release:check` 全绿；Phase 2 = 第一个真员工经**受管企业访问边界**开通 + native engine 真回合 + ≥2 并发真员工；Phase 2.1 = 真实双机互联活跑）从记忆裁决 promote 进 canon。**只留持久验收形态**，point-in-time 状态（rc tag、机器地址、活跑机器数）仍归记忆、不进合同。testing.md 是 canon 钦定的 "Phase 2 MVP experience acceptance" 归属（见 architecture.md Decision Coverage Index）。
2. **`docs/architecture.md` Position 不动**：复核后认定其首段已无歧义地表述了"组织复制是北极星 / standalone 是底座"；那类误读只发生在 README、不在 architecture.md。重写已正确的最权威段落 = 引入漂移，故跳过。
3. **`AGENTS.md` 不动**：`test:contracts` 校验 "AGENTS.md is a short bootstrap"，不往里塞基线框架。
4. **`docs/protocol.md:242` Fleet 行修正（canon，已做）**：原文 "Fleet owns worker id, worker home, and daemon port" 与 `architecture.md:183`「workerId 是 Worker 自己 mint 的身份、not a fleet-imposed handle」矛盾。代码核实：`mintWorkerId()` 证 Worker 自 mint id；`fleet.ts` / `fleet.json` / `smoke:fleet` 证 fleet 真实分配 per-worker home/port。故**只窄修 id 这一项** → "The Worker mints its own worker id, and worker home and daemon port are fleet-allocated"，不动 home/port（避免反过来与 dev-fleet 模型冲突）。
5. **三语 README 对账（非 canon，已做）**：① 废弃正向 micro-app 框定（`README.*` line 118 / 265 「Host frames Workbench as a sandboxed micro-app」违 `protocol.md:193` no-mount → 改为 over-the-wire 控制合同 + Host 可引导员工到 Workbench URL 但绝不 mount/frame/embed/render/proxy）；② 「它为谁而建 / Who is it for / 対象ユーザー」段轻度 reframe——以「一个专家能力复制给一整支团队」的组织北极星起头，把个人作者口径**从属化**（不删 persona 列表，它是作者画像、合法）。line 27 的负向「no mounted micro-app」是合法禁令、保留。

## 8. 验收

- 基线五节（定位 / 面向群体 / 价值 / 旅程 / 目标）与 canon 不冲突。
- §7 的 canon 更新落地后 `bun run docs:check` 与 `bun run test:contracts` 仍绿。
- 三语 README 的 micro-app 正向残留已废弃、受众段已按北极星 reframe（§7.5）；canon 内只剩负向禁令与历史 teardown 记录。
- 借界项（`appId` 路由 / `--app` flag 命名）仅记录，不在本轮动——碰它=改路由/CLI 契约（非纯 docs）。
