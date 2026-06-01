# product-bet #1 决议:daemon-per-worker fleet

- **状态**:DECIDED(2026-06-01)
- **范围**:本轮**只决策**(产出本 decision spec + canon 促进的输入);实现见 §7 Phase 拆分 / writing-plans。
- **上游**:`docs/superpowers/specs/2026-05-31-boundary-unified-design.md` §7.1
- **canon 锚点**:`AGENTS.md`(产品边界)、`docs/architecture.md`、`docs/protocol.md`(181–195)、`docs/runtime.md`

## 1. 背景:待拍板的 product-bet

boundary-unified-design §7.1 标记 product-bet #1 待决:

> `/api/control/worker` 用 `listWorkers()[0]` 自描述,多 worker 下静默取第一个并漂移。

spec 给的二分(A=single-operator reject 守卫 / B=多-worker broker workerId 选择器)是**贫乏的**:它把"一 daemon 一 worker"误等同于"放弃 fleet"。关键消歧:

- **single-operator ≠ single-worker**:`protocol.md:187` 的 "single-operator local model" 是**信任**声明(单一可信本地操作者 → `rootPath` 不约束),不是**基数**声明,它不预先决定 A。
- Host:worker 基数(fleet)与 daemon:worker 基数(进程拓扑)是**两个正交维度**。

## 2. 决策

经两步产品意图澄清:

1. **Host:worker = 1:N(fleet)** —— Host 是可选控制面,分发 / 管理 / 授权 / broker 多个 worker。
2. **daemon:worker = 1:1(daemon-per-worker)** —— 每个 worker 是自己的 daemon 进程:自有本地壳 + 被动控制面 + **自有 storage root**(单 `WORKER_DB_PATH`,已是现状,`packages/worker-daemon/src/modes/worker.ts:154`)。
3. **fleet = N 个 worker daemon 进程**,Host 经 registry `{workerId, templateId, endpoint}`(`host-control`)**按 endpoint** 跨实例 broker。

机制对应 §7.1 的 "A 类"(reject 守卫),但**产品语义是经多 daemon 的 fleet**,不是单 worker。选 daemon-per-worker 而非"一 daemon 多路复用 N worker"的核心理由:多路复用把 N 个 worker 缠进共享进程(进程 / 崩溃 / 资源耦合);daemon-per-worker 让每个 worker 是**干净、隔离、完整的独立单元**。

## 3. Worker 纯净不变量(load-bearing)

本决议的**核心约束**,高于机制细节。fleet 是从外面套上去的**即插即用外壳**,worker 保持纯净:

- **Worker daemon 是完整独立单元**,携带**零** fleet/Host 感知:不存 Host endpoint、不存 fleet-成员状态、无"向 Host 注册"逻辑。
- **方向单向**:Worker 是**被动控制 server**(暴露 `/api/control/worker` 等控制面),**Host 是主动 client**;Host 从外部(运维 out-of-band 配置)**发现并连入** worker endpoint;**Worker 永不 push / 注册到 Host**。这把 `worker-*↛host-*` import 禁令从"包依赖规则"坐实为**运行时方向规则**。
- **fleet 成员状态完全在 Host 侧**:registry 住 `host-control`,worker 一无所知。
- **即插即用 = 纯外部**:插入 fleet = Host 学到 endpoint(外部配置);拔出 = Host 忘掉 endpoint,worker 照常 standalone 跑。**worker 二进制 / 行为不因 fleet 在场或缺席而改变**。
- `workerId` 是 worker **自己 mint 的固有身份**(`mintWorkerId`,`worker-runtime`),**非** fleet 强加;Host 只从外部引用它(故 C3/C5 引用 workerId 不污染 worker)。

## 4. 锁定的可观察契约(锁契约,不锁内部结构)

> daemon-per-worker 是进程 / 部署基数,**不要求**拆内部 `Map<workerId, runtime>`。N 个 daemon 各持 ≤1 元素的 Map 即满足本决策。Map 拆不拆是 **plan 级实现选择**(保留 ≤1 元素低风险;拆除是可选硬化,防漂移回多路复用)——**不属本产品决策**。

- **C1 基数不变量(daemon-layer)**:每 daemon 至多一个 **active** worker。落为 **daemon 层不变量**——在 create path(C2)+ bootstrap(C4)处强制,由 daemon 进程内的 **async 创建锁**串行化 create 临界区(check-active + insert 原子化)。**不碰存储 schema**:storage-sqlite 保持通用的多-worker-capable primitive(与本节开头"锁契约不锁内部"同理——storage 持 N 行 = Map 持 N runtime,同类,不全局约束)。
  - **为何进程内锁足够(勿日后"硬化"回 DB 索引)**:daemon-per-worker 下每个 daemon 是其 DB 的**唯一写者**(单 `dbPath`/进程 + storage-sqlite 单例连接),故进程内锁给出**完整串行化**——正是 TOCTOU 防护所需,无需多写者工具(全局 unique index)。索引是多写者工具,用在单写者世界里既过度约束,又会打破 storage 层自带的多-active 测试(`packages/storage-sqlite/src/worker/index.test.ts:1032` 显式断言 2 个同-appId active worker 可共存;该测试经 `upsertWorker` 直插、在 daemon 守卫之下,**保留不动**)。
  - 锁是 daemon create path 的**内部**机制,零 fleet/Host 感知,符合 §3 纯净不变量。
- **C2 reject 守卫**:`POST /api/workers` 已有 active worker 时拒绝(定义错误码,建议 `409 Conflict`)。语义 "one *active* worker per daemon",**archive-then-recreate 允许**(archived 行不计)。**分层**:C2 的 check-active + create 临界区被 C1 的进程内 async 锁包裹,使"检测已有 active → 拒绝"原子化、无 TOCTOU。C1 与 C2 是同一不变量的两面(C1 = 串行化保证,C2 = 优雅 409 表层),**非**两层冗余兜底。
- **C3 control 去漂移**:`/api/control/worker`(`worker-daemon/src/modes/worker.ts:223`)取该 daemon 唯一 active worker,去掉 `listWorkers()[0]`;**不需 workerId 选择器**;`WorkerDescribe` payload 仍携 workerId 作身份。
- **C4 bootstrap**:重建 ≤1 个 active worker runtime(DB 可含 1 active + N archived)。停止假设加载 N。fresh daemon(零 worker)→ 经 `POST /api/workers` 铸第一个(无 active,允许)。
- **C5 workerId locator 矩阵**:**absent → 隐式 self;present → 必须 == 本 daemon active workerId,否则拒绝;每路由 required/optional 维持当前 `protocol.md`(181–195)契约不变**。standalone CLI/web 省略 workerId 必须正常(防 400 standalone 路径)。standalone workerId 身份源 = `/api/control/worker` 或 `/api/info` 查得。

## 5. 不变量(必须不破)

- `worker-*` 不 import `host-*`(+ §3 运行时方向规则)
- Host descriptor-only
- inversion guards G0–G6
- session 列举经 workspace 推导(`3aaee55a`)
- **Worker 脱离 Host 独立运行**(启一个 worker daemon = 启该 worker 本地壳,Host 仅可选 broker)
- **每 daemon 独立 storage root(C1 正确性前提 = 单写者)**:C1 的进程内创建锁只在每个 daemon 是其 DB 的**唯一写者**时才保证 "每 daemon 至多一 active"。若两个 daemon 指向同一 `WORKER_DB_PATH`,各自的进程内锁互不可见 → 跨进程竞态可造出 2 个 active。Phase 2 fleet 供给**必须**保证 distinct-root-per-daemon(此即单写者前提)。

## 6. 子决策(已定)

- **(a)** 守卫 active-keyed → 是,做成 **daemon 层不变量 + 进程内 async 创建锁**(C1);**不**用存储 schema 全局 unique index(单写者世界里过度约束,且打破 storage 自带多-active 测试)。
- **(b)** daemon 层 workerId → **validate-to-self**(薄自一致校验,挡 Host broker 误投把 worker-A 请求投到 worker-B endpoint;**非** fleet 感知)+ absent→隐式 self 矩阵(C5)。
- **(c)** Host registry 持久化 + endpoint 发现 → **Phase 2**,canon 标 roadmap。

## 7. Phase 拆分

### Phase 1(product-bet #1 核心 / standalone 收口,可独立落地 + 可测)

- C1–C5 + promote 决策与 §3 纯净不变量进 canon(architecture / protocol / runtime)+ 契约测试 pin。(boundary-unified-design §7.1 已在本 decide 轮标 DECIDED 并交叉引用本 spec,不再属 Phase 1。)
- **全部落在 `worker-daemon`(+ canon docs + 契约测试),无存储 schema 迁移**(C1 在 daemon 层,storage 不动)。
- **不写一行 fleet 代码**;全是"让 daemon 干净地只承载一个 worker"的*内在*收口,使 worker **更纯**。
- **完成态(必须在 canon 写明)**:standalone 单-daemon 路径完整可用;**fleet brokering 尚待 Phase 2**——别误读成 "fleet 已成"。in-memory registry + 无 endpoint 发现意味着 fleet 此刻不可用,这是**自洽中间态当且仅当 canon 说明**。

### Phase 2(fleet 真接线,更大,后续)

- Host endpoint broker——registry 持久化(当前 in-memory,`host-control` "persistence is roadmap")+ endpoint 发现 / 健康。**纯 Host 侧**(§3 保证 worker 不动)。
- **必须保证** distinct-root-per-daemon(见 §5),否则破坏 C1 进程内锁的单写者前提(跨进程竞态可造出 2 active)。
- **待答**:endpoint 供给机制。§3 纯净不变量禁止 worker push/注册到 Host,故 Host 须以**无 worker push** 的方式学到 N 个 endpoint——即外部 / 运维 / orchestrator 驱动的供给。"out-of-band 配置"是占位说法,Phase 2 须定具体机制(勿误以为已解决)。

## 8. 非目标 / 本轮范围

- 本轮**只决策**:产出本 decision spec + 更新 boundary-unified-design §7.1 交叉引用(已做)。
- canon 促进 + 契约测试 + 实现 = Phase 1,经 writing-plans 排期(本轮不实现)。
- product-bet #2(assignment/lifecycle)及 §7 其余项**不在**本决议范围。

## 9. writing-plans 输入(Phase 1)

plan 应:

1. 先写 / 扩 locking test 红再修绿(TDD):C1 并发创建测试(并发双 POST 经进程内锁串行化 → 第二个得 `409`,DB 不出现 2 active)、C2 reject(`409` + archive-then-recreate 放行)、C3 control 单 worker(含 **zero-active 态**:fresh daemon / archived-to-zero 时 `/api/control/worker` 的行为须定义,不止 fresh→POST 创建)、C4 bootstrap ≤1 active、C5 workerId 矩阵(absent / present-match / present-mismatch)。
2. **必须决:bootstrap 遇 >1 active 的脏 DB 行为**。无存储索引 ⇒ 无 create 期约束失败;脏数据(旧多路复用 DB / 旧无守卫创建)改在 **bootstrap 的 `for (const worker of listWorkers())` 循环**(`packages/worker-daemon/src/modes/worker.ts:189`)处浮现。plan 须三选一并测之:(i) fail-fast、(ii) archive-extras-保留一个、(iii) repair-to-one。须是**决策**,非意外。
3. **测试 churn 枚举(显式任务,非抽样)**:repo-wide grep 出在**单次 `app()` boot 内**有 ≥2 个 `/api/workers` POST 抵 `201` 的 daemon 测试(已知 `worker.local.test.ts:872-873` requested-root + sibling-root;`:345/:358/:1598` 等 raw POST 需逐一核——daemon **重启**复用同一单 worker 的测试**不算**)。逐个改:或拆多 daemon/DB,或经 `upsertWorker` 直插绕过路由作 fixture。**全量列出**。
4. canon 编辑(§3 纯净不变量 + C1–C5 + Phase 1 完成态声明)同步 `check-doc-contract.ts` / `refactor-contract.test.ts` pin 串 + OpenAPI(若 C2 错误码 / C5 矩阵触及)。
5. 每步落到 `test:contracts` / `lint` / `release:check` 之一。
6. **Phase 1 无存储 schema 迁移**(C1 在 daemon 层,storage 不动);**不触 fleet 代码**(Phase 2)。
