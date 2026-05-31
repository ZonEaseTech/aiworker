# AIWorker 边界统一设计:五层概念职责 + 包边界收口

- 日期:2026-05-31
- 分支:`codex/aiworker-refactor-dev-loop`
- 状态:已验证盘点 + 收口设计(待 writing-plans 转计划)
- **吸收并取代**:`docs/superpowers/specs/2026-05-30-monorepo-boundary-audit-design.md`(包层 F-items 已并入本文 §6,F7 已撤销)
- 范围:概念边界(host/soul/worker/workspace/session 五层职责划分)+ 边界相关包层异味
- 不在范围:通用复杂度度量;以及本文 §7 列出的 6 个 v1-完成度 product-bet 的最终实现(本次只决策不实现)

## 1. 背景、方法与核心信号

两条线在此汇合:
- **概念边界 review**:dynamic workflow(45 agent / 6 接缝 / 对抗式验证)深挖五层之间的边界。
- **包边界审计**:上一轮对 monorepo 包边界的盘点(F-items)。

**核心信号:边界划分整体干净,归属本身无跨概念错放。** workflow 的 33 条候选渗漏经对抗验证后**仅 1 条**成立为真·边界违反(且为守护空洞,P3,代码今天合规)。其余多为「行为自洽但命名 stale」或「v1 稀疏未接线」或「该用户拍板的 product-bet」。**真正待办 = 把自洽但命名/文档滞后的现状显式化 + 拍板少量决策,不是修活体违规。**

方法:**契约测试锁定 + 按严重度**。每条 P1+ 收口项点名 locking test,挂 `release:check`。

**检测口径护栏**(防误报,plan 全量复扫须遵守):① 捕获动态 `import()`;② 扫 src 外消费(souls 的 scripts/soul.config、daemon dynamic、mount 资产);③ 排除 test/fixture 与字符串字面量;④ exports-aware(声明子路径不算越界);⑤ **doc-contract 逐字严格**——`scripts/check-doc-contract.ts` 对多段 canon 文案做精确字符串断言,任何 canon 编辑必须在同一 TDD 步同步更新其 pin 串,否则 `test:contracts` 红。

## 2. 五层干净职责模型(应 promote 进 canonical docs)

| 层 | 干净拥有(ownsCleanly,本质) | 不得拥有(mustNotOwn) |
|---|---|---|
| **Host**(控制面) | in-memory WorkerRegistry(workerId 键)、worker 追踪视图、host-cli/web 壳、只 import worker-control-protocol、把 soul 身份当**不透明 key** 消费 | session/invocation/projection/engine 进程/domain/secret · descriptor & workbench-entry 解析 · 领域 UI 渲染 · 运行时类型本体 |
| **Soul**(定义/template) | SoulDescriptorV1 协议本体、HostedSoulApp 投影、domain state/UI/API/outputs、descriptor 生产、engine target 声明、SDK authoring | worker 运行实例状态 · 被投影资产所有权 · Host 集成逻辑 · **worker/session 寻址职责** |
| **Worker**(运行实例) | workers 表+级联子表(runtime 真相源)、workerId 铸造、LocalWorkerRuntime 编排、engine invocation+进程观察、projection 编排者、broker + passive control server | 被投影资产的**材料化**(归 engine-projection)· engine-bridge 内部 · Host 控制面职责 · soul domain 字段解释 |
| **Workspace**(locator) | workspaces 表(rootPath 唯一索引)= locator 权威、locator metadata+root 指针、CRUD+越界守卫、session/files 的级联父 | root 下被投影 engine 资产 · root 下业务文件(归 Soul/user)· projection receipt 身份 · session 的 lifecycle/执行态 |
| **Session**(执行生命周期单元) | sessions 表 = lifecycle locator、三态 `active/archived/deleted`、capabilityId 寻址、engine 选择冻结、follow-up 锚点 | engine 执行/process 态(归 engine_invocations)· native session ref(归 bridge)· domain payload · capability 的 domain 语义 |

## 3. 已决策

- **D1 — soulId/appId 收敛为单一 appId 身份**(用户拍板,= synth 推荐 A):
  `worker.soulId` 列 / `projectedSoul.id` / `ProjectedCapability.soulId` / control 契约 `describe.soulId` 当前**系统性承载 appId 值**,而域 `soulId`(`freeform`)被持久化三份却 live 路径**零回读**。收敛动作:把这些承载 appId 值的字段**更名为 `appId`/`templateId`**,显式承认 v1 worker↔soul/capability 寻址键即 `appId`(它是 descriptor 主身份、唯一、有 kebab 守卫);**域 `soulId` 降级为 descriptor identity 元数据**(停止运行时三处持久化/回读,或保留为纯元数据)。同时修 CLI `--soul` 的 UX papercut(标注 "Soul id" 实需 appId)。**不引入复合键。**
- **D2 — common workbench 归属以 SDK 为准**(承接上一轮 F4 决策,与运行时一致:mounted 走 SDK common workbench)。

## 4. 收口项 — 概念层(severity-ordered + locking test)

| ID | P | 发现 | 修法 | locking test |
|---|---|---|---|---|
| C-HS | P3 | **唯一确认的边界违反(canon-gap,代码今天合规)**:`scripts/check-soul-app-boundaries.ts:171-176` 的 `scanHostImports` 的 `hostRoots` 漏了 `apps/host-cli`、`apps/host-web` → 「Host 不得 import Soul App 内部」对两个真实 host 壳无守卫 | 把两壳加进 `hostRoots`(**窄向量:只补 souls/* 相对 import;切勿用 @zonease 依赖白名单,会误禁 host 合法消费 soul-protocol**) | 两壳出现 `from '../../souls/<app>/...'` 即 fail;当前零违背,锁住干净态 |
| C-ID | P2(严重度)/ **大石头(体量)** | D1 收敛的实现:字段名 stale(soulId 装 appId)+ CLI `--soul` UX papercut。**真实体量是跨层契约级改动,见 §4.1** | 按 D1 更名字段、降级域 soulId、修 `--soul`(详见 §4.1) | 详见 §4.1(契约 schema 测试 + refactor-contract pin + OpenAPI + 迁移测试) |
| C-CANON | P2/P3 | canon 文案滞后于自洽现状 | 见 §5 | `check-doc-contract.ts` pin 串同步更新(它是**要改的对象**) |

### 4.1 C-ID 是「大石头」——跨层契约级改动(非 P2 小修)

D1 的真实爆炸半径(grep 实测)。严重度仍是 P2(命名/清晰,非违规),但**体量最大,应单列为独立 plan/phase**,与廉价卫生项(C-HS/F5/F6/F9/F-DEP)分开排序:

- **存储**:`workers.soulId` 列 → 更名 + 迁移(+ 迁移测试);`discardRetiredSoulMetadata` 查 `['hr','qa']`(SW-5,`storage-sqlite` index.test.ts 守)需随迁移一并处理。
- **投影**:`projectedSoul.id`、`ProjectedCapability.soulId`(均装 appId 值)。
- **编排 / CLI**:orchestrator 寻址;CLI `--soul`(`apps/worker-cli/src/aiworker.ts:1798`)UX papercut。
- **控制契约(G5)**:`packages/worker-control-protocol/src/index.ts:12` 的 `describe.soulId` 是 **Host↔Worker 契约字段**——更名 = **改 G5 契约**。顺带**消解 `describe.soulId`(装 appId)vs `assignment.templateId`(同一身份)的双键名不一致**(HS-3/HW-4),收敛后两者统一。
- **daemon API + OpenAPI**:`packages/worker-daemon/src/modes/worker.ts:212,229(/api/control/worker),316,345,369` 响应里的 `soulId`;`worker/schemas.ts:56`;OpenAPI 响应 schema(`/openapi.json`)。
- **契约测试 pin**:`tests/architecture/refactor-contract.test.ts:1374-1375,1778`(`soulId:'hr'` / `"soulId":"hr"`);`packages/worker-control-protocol/src/index.test.ts:13,18`。
- **协议版本**:因改的是 G5 Host↔Worker 契约,pre-1.0 允许破坏,但应在 `docs/protocol.md` 留**契约变更/版本说明**,并同步 `check-doc-contract.ts` pin。

## 5. 收口项 — Canon 更新(把"自洽但滞后"显式化)

- **protocol.md(控制契约节)**:消歧 `describe.soulId` 与 `assignment.templateId` 同指一 Soul-App/Template 身份,且其承载值是 descriptor `appId` 这一不透明 key(配合 D1)。
- **runtime.md / architecture.md**:显式声明 v1 `assignment`=validate-only echo、`lifecycle`=acknowledge-only(connector 行为 canon 已列 out-of-scope),消除"Host 授权如何作用 Worker"的隐含期待。
- **architecture.md:132-134 / protocol.md:84-90**:把"Host resolves one workbench entry / Host mounts SDK common workbench"的散文归属改名为 **worker-daemon 解析、Host mount**(pre-inversion host-daemon 残留);同步改 `tests/architecture/freeform-mounted-workbench-contract.test.ts:33` stale 标题「Host daemon mount resolver」→「Worker daemon mount resolver」。
- **runtime.md:27-30,204-206**:消歧 session `'deleted'` 是 hard-delete 软删/tombstone 结果,还是独立软终态(与 §7 product-bet 一并落地)。
- **runtime.md(projection/lifecycle 节)**:补一句 session context 文件(`.aiworker/sessions/*`)只随 physical workspace root 删除清理、session lifecycle delete 有意保留。

## 6. 收口项 — 包层(并自上一轮审计;F7 已撤销=plane-prefix 约定 by-design)

| ID | P | 发现 | 修法 | locking test |
|---|---|---|---|---|
| F1 | P1 | `soul-protocol` 环引用:`src/index.ts → soul-app/index.ts → soul-app/registry.ts`(madge 实测) | 断 barrel 回环(**修法为假设**:疑似 registry 直引叶子类型;plan 先读三文件确认 type-vs-value 再定形) | `tests/architecture` 新增 no-cycle 断言 |
| F2 | P1 | `apps/worker-cli/src/aiworker.ts:5` 深穿 `../../../packages/soul-app-sdk/src/index`;且 worker-cli prod(`scaffold.ts`)用 soul-app-sdk 却**未声明依赖**(真幻影,P1 实质;深 type-import 是搭车 hygiene) | 声明 `@zonease/aiworker-soul-app-sdk` 依赖 + 改走包名 | 扩 `package-ownership`:声明依赖完整 + 禁 `../../../packages/*/src` |
| F3 | P2 | `soul-app-runtime` 已实现未接线 + 未用 dep `soul-app-sdk`(canonical 钦定,**不删**;依赖 worker-runtime 是 harness 设计内) | 移除未用 dep;**接线**(让 golden-path/mount 真用 harness)列为 §7 待续 | dep-used 断言 |
| F4 | P2 | `soul-workbench` 桩 + doc/impl 漂移(canonical 钦定,**不删**);三处编码 "owns common workbench"(`soul-authoring.md` + `check-doc-contract.ts:346,349` + `src/index.ts` 的 `owns`) | 按 D2 三处同步校正归属到 SDK;移除过早未用 dep(ui、soul-protocol) | 更新后的 `check-doc-contract.ts` pin + dep-used |
| F5 | P2 | `apps/worker-cli/src/soul-app-boundary.ts:16,40` 的 `HOST_PRIVATE_IMPORT_PREFIXES`/`CURRENT_HOST_PRIVATE_ROOTS` 列的全是 worker 私有包(倒置后 "HOST_PRIVATE" 错位;无契约 pin) | 重命名 `WORKER_PRIVATE_*` | 标识符断言 |
| F8 | P2 | boundary 扫描逻辑重复:`scripts/check-soul-app-boundaries.ts` ↔ `apps/worker-cli/src/soul-app-boundary.ts`(手工并行重实现) | 抽单一 scanner 模块,两处共享 | single-source 断言 |
| F-DEP | P2 | `engine-projection`、`worker-daemon` 声明 `fs-layout` 但 src 零引用(含 type/dynamic) | 移除未用 dep | dep-used 断言 |
| F6 | P3 | `tests/architecture/package-ownership.test.ts:85,100` 标题/变量 stale "host-daemon"(断言已对 worker-daemon) | 仅改标题/变量;`architecture.md:192` 等历史 rename 描述不动 | 已有断言即守 |
| F9 | P3 | `soul-app-boundary.ts` 注释日文,违反 AGENTS.md「注释默认中文」 | 改中文 | lint(难测,review 项) |

## 7. 待拍板 product-bets(计划内待决;本次只决策不实现)

均为 v1-完成度或建模偏好,非渗漏。每条带 synth 建议供拍板:

1. **一 daemon 一 worker?** `/api/control/worker` 用 `listWorkers()[0]` 自描述,多 worker 下静默取第一个并漂移。建议:若 single-operator 本地壳则 A(POST /api/workers 已有 worker 时拒绝);若多 worker broker 则 B(control 加 workerId 选择器)。
2. **assignment/lifecycle 是否落地运行?** 当前 validate-and-echo。建议 A:v1 保持并文档化为有意(canon 已列 connector out-of-scope);B 为后续 feature 接线。
3. **session `deleted` 软态 vs 硬删结果?** 建议 A(统一硬删、'deleted' 收为 reserved 枚举 + 注释),减状态机复杂度;B 仅在需软删审计/恢复时。
4. **rootPath 是否约束在 worker root 内?** `protocol.md:183` 已明许 may-receive-rootPath。建议 B(把开放语义提为 canon 明文);未来多租户再选 A 约束。
5. **删 `sessions.workerId` 直接 FK?**(canon 结构父只有 workspace)。建议 B(保留去规范化父键服务 O(1) 查询/索引,可证永不分叉);若消歧则锁"worker 维度列举经 workspace 推导"中立不变量。
6. **management mount 与 employee mount 是否显式区分?** 都落到 `/api/mount/workbench`。建议 B(v1 视为拓扑区分并写进 canon 加锁);待 host 管理面铺开再评估 A。

另有若干 **layer-local 开放问题**(已收进各层,不阻塞):files 表 vestigial schema(WW-3)、workspace 缺 deleted 态对称(WW-4)、session 双 FK/endedAt 悬空字段/archive 不级联 session(WS-SESS 系列)、namespaced capabilityId 有 encoder 无 decoder(S2)、descriptor→worker-row 翻译两处装配漂移(SW-3)。

## 8. writing-plans 输入

plan 应:① 按 §1 口径全量复扫,确认 §4/§6 发现并补漏;② 把 §4/§5/§6 逐项转 TDD 步骤(先写/扩 locking test 红,再修绿);③ 严重度排序 P1→P3;④ **C-ID(§4.1)是大石头,应单列为独立 plan 或独立 phase**——它是跨层契约级改动(含 G5 契约 + OpenAPI + DB 迁移 + 契约测试 pin),与廉价卫生项(C-HS/F5/F6/F9/F-DEP)分开排序,不要塞进一个臃肿 plan;其 `workers.soulId` 列迁移单列一步并含迁移测试;⑤ §7 的 product-bet 在计划起点逐条向用户确认后再决定是否纳入;⑥ 每步落到 `test:contracts` / `lint` / `release:check` 之一;⑦ §5 canon 编辑与 C-ID 的契约改动必须同步 `check-doc-contract.ts` / `refactor-contract.test.ts` 的 pin 串与 OpenAPI。
