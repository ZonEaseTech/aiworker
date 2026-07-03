# AIWorker Web 操作台重构设计（cockpit redesign）

- 日期：2026-06-22
- 范围：`apps/aiworker-web`（管理员薄控制台）前端体验重构
- 状态：设计已与用户对齐并批准，进入实现

## 1. 问题与根因

用户主观反馈：web 体验不够简洁直观、没有清晰的能力边界、用户旅程割裂、聚焦信息过少、操作步骤偏多——主观上甚至**比手动开一个 Paseo 实例还麻烦**。

经代码勘察 + 社区最佳实践调研，与用户对齐的**根因（A：结构性）**：

> 当前 web 不是一个"完成一件事"的工具，而是一个"管理五种数据"的后台。它把"给员工开一个 AI worker"这一件事，拆成了 5 张并列的 CRUD 表（Assignment / Environment / Provider / Soul / Audit），并把后端数据模型原样翻译成 UI，等于让管理员替系统做数据录入。

具体证据（重构前）：

- 真正"干活"的 `/provisioning` 页**不在导航里**，只能从 Dashboard 深链进入（`apps/aiworker-web/src/pages/admin-pages.test.tsx:218` 断言其不收录）。
- 首次开通需先在 3 个独立页面建好 Environment / Provider / Soul，再建 Assignment，再深链进 provisioning 走 确认→开通→发入口；依赖齐全也要 6–7 步，首次 15–20 步、填 15–27 个字段。
- Dashboard 计算了 `buildMetrics` 却**未渲染**；一眼看不到"谁开通/谁卡住"的全局态。
- Assignment / Soul release / Handoff / receipt 等内部名词裸露、UI 零解释；"员工开通"一词同时指"看的列表"和"做的动作"。

## 2. 已确认的产品决策

1. **根因 = A（结构性）**。落地从 A 的最小可行版本切入：以 assignment 为唯一主对象的单一旅程；C 类表层问题（命名/空状态/术语）在新结构里顺手解决，不单独做。
2. **使用频率 = 高频**。→ 排除多步向导（NN/g：向导只适合"新手 + 不常做"）；目标是常驻**操作台（cockpit）**，行内一键操作，不弹多步对话。
3. **审批步骤 = C**：风险检查有价值但不应是独立步骤。→ 把 4 项 Approval Checks **前移成"新建时的实时校验门"**（绿了才让开通），取消独立"管理员确认"步骤；流程从 `建依赖 → 建 Assignment → 确认 → 开通 → 发入口` 塌缩成 `操作台上新建（实时校验）→ 一键开通 → 入口就地出现`。
4. **高频主旋律 = 甲为主、乙为稳定态常态**：甲＝给"新员工"开通（多半要新建 Environment/可能 Provider）；乙＝给"已有员工/机器"加能力（基本复用、极快）。两条路必须**同表、同一新建入口**承载。

## 3. 北极星形态

**assignment（人 × 目标机）= 唯一主对象 = 首页 = 操作台。** Soul / Provider / Environment 降级为 assignment 的属性/可复用库。

社区印证（均带来源，见调研记录）：OOUX 单主对象、Tailscale（设备中心）/1Password（人中心）/Kandji 坚持不拆表；Fly `fly launch` / Vercel 导入屏 / Render diff-then-apply 把 connect→configure→provision 融成一条流水线；Backstage/Cortex 从模板 schema 自动生成表单 + smart defaults + 确认前零副作用；GOV.UK「Do less / Do the hard work to make it simple」——管理工具绝不该比它替代的手动操作更费力。

## 4. 关键界面与行为

### 4.1 操作台（fleet table）= 新首页

- 顶部「需我处理」焦点条：按状态分组的待办计数 pill（如 `待开通 N` `待发入口 N` `失败 N` `全部 N`），点击即筛选；右侧搜索（员工/能力）+ 主按钮 `+ 新开通`。
- 主表行 = 一个 assignment，列：**员工**（姓名+邮箱）、**能力 (Soul)**（名+版本）、**目标机 (Environment)**、**状态**（生命周期 badge）、**操作**（行内、随状态变化的单一主操作）。
- 排序：按"该不该动手"——失败置顶、其次待开通/待发入口，Live/稳定态置灰下沉。
- 失败行：置顶 + 行内写明原因（如"provider 未授权"）+ `重试`，绝非红点终态。
- 行内一等操作随状态切换：`开通` / `发入口` / `重试` / `⋯`（查看详情）。
- 甲/乙同表标记：新建机器标 `●新建`，复用机器标 `●复用`。

### 4.2 新建抽屉（甲/乙同一入口）

- 单一 `+ 新开通` 入口，**抽屉/行内**完成，不跳页、不走多步向导。
- 乙（复用，目标极快）：挑员工 + 挑 Soul + 目标机/账号默认带出已有 → 实时校验 → 可立即开通。
- 甲（新员工）：在**同一个抽屉内内联创建** Environment（及必要时 Provider），不再跳到独立页建依赖；smart defaults 预填可推断字段（如 owner email 跟随员工、PASEO_HOME 由 userSlug 派生、provider 默认复用）。
- 实时校验门（替代审批）：展示 4 项 check（员工范围 / 后台账号 / 设备所有权 / 发送入口可达）的实时状态；全绿才点亮"创建并可开通"。确认前零副作用（仅 `/api/plan` 预览，不落地）。

### 4.3 生命周期状态机

`草稿 → 校验中 → 待开通 → 开通中 → Ready/待入口 → Live`，外加 `失败`（可重试，非终态）。

- **lifecycle 与 health 两轴分离**（Kandji 模式）：lifecycle 是上面这条主线；health（如 provider 授权、daemon 可达）作为旁证/失败原因，不混入主状态。
- 单独命名「已开通未生效」= `Ready/待入口`（ready ≠ live；`ready` 仅表示 AIWorker 已备好 workspace 与 handoff，不表示员工已接入）。

### 4.4 Provider 降级

Provider（后台 AI 账号）从主表移除（高频下基本复用、当列噪音大），降级为 assignment 详情里的属性 + "资源"页里可建可选的库对象。

### 4.5 导航收敛为四项

`操作台 / 能力库 (Soul) / 资源 (机器 + 账号) / 记录`。

- 操作台是唯一"干活"页；`/provisioning` 不再是隐藏深链——开通/发入口等动作在操作台行内或详情抽屉内完成。
- "能力库"= Soul release 登记/浏览；"资源"= Environment + Provider 两类可复用库；"记录"= audit/handoff。

### 4.6 概念与术语

- 协议名词（Soul / Assignment / Paseo / Provider）对管理员受众保留，但**首次出现给一句白话解释**（GitHub fork/PAT 式），不堆 tooltip（NN/g：tooltip 不该是烂标签的拐杖）。
- 空状态当教学（Polaris/Atlassian/Stripe）：每个库页/操作台无数据时讲清"这是什么、下一步做什么、去哪做"，用祈使式 CTA。

## 5. 不变量与约束（AGENTS.md 硬约束，必须保持）

- Web 后端**不是 SoT**；所有创建/编辑写动作经 `aiworker` CLI spawn 代写，由 CLI 落地元数据。
- Provider 只存 `secret://` 引用，绝不在 UI/DB/receipt/log 里落 literal secret。
- 不 render/fork/proxy/observe Paseo runtime/workspace/session/provider traffic。
- 不引入 ad-hoc component systems；沿用既有 shadcn 基线与 `packages/ui` 原语。
- `ready` 语义不变（仅表示 AIWorker 侧就绪，不代表可读 session/日志）。

## 6. 非目标（Out of scope）

- 不做员工侧 UI（Paseo owns it）。
- 不在浏览器内做 Soul authoring（仍是 register 已 build 的 release）。
- 不改后端协议/数据模型本身；本次是前端体验重构 + 必要的 web BFF 读模型聚合（仍走 CLI 代写约束）。
- 不引入 i18n 框架（文案中文为主 + 协议名词留英，渐进改）。

## 7. 验收标准（用户可见）

1. 打开 web 默认落在**操作台**；一眼看到「需我处理」的待办分组计数与待办行。
2. 给**新员工**（甲）开通：从 `+ 新开通` 到拿到 handoff 全程**不跳页**，缺失的机器/账号可在同一抽屉内内联创建。
3. 给**已有员工/机器**（乙）加能力：挑员工 + 挑 Soul 即可，目标机/账号默认带出，数步内可开通。
4. 没有独立"审批"步骤；4 项风险 check 作为新建时实时门呈现，未全绿不能开通。
5. 失败的 assignment 在操作台置顶、写明原因、可一键重试。
6. 导航仅四项；不存在"必须深链才能进入的干活页"。
7. 关键内部名词在首次出现处有一句白话解释；各库页有教学型空状态。
8. 全程不违反第 5 节任一不变量（无 literal secret、写经 CLI 代写、不代理 Paseo runtime）。

## 8. 验证方式（按项目惯例）

- 聚焦 contract 测试覆盖被触及面；更新/新增 `apps/aiworker-web` 单测与既有断言（如导航项集合、provisioning 深链断言需随结构调整）。
- **真浏览器可用性门**（项目反复证明能抓单测/HTTP 漏的真 bug）：dev/static 起站，肉眼 + 截图核对甲路/乙路两条主旅程跑通。
- `bun run typecheck` / `bun run lint` / `bun run test:contracts` / `bun run test` / `bun run build` 全绿。
- 对代码改动跑 code-review-graph（除非纯文档/格式）。
- 合并前跑能证明被触及面的最小新鲜验证。
