# TTPOS 产品 Playbook（方法论 / 框架 / 决策树 / 反模式）

> 引擎参考知识，非百科罗列。所有 skill 通过本文件的 **§1–§6 锚点**引用方法论。
> 行业基准数字见 `knowledge/benchmarks.md`；现有工作流与工具见 `knowledge/integrations.md`。
> 数字纪律：sprint 评分 / 超期阈值 / 质量门口径来自 ttpos-bot 真实代码（`packages/domain/src/pm/actions.ts`、`packages/domain/src/quality/reviewer.ts`），按其落地，不臆改。
> 口径纪律：TTPOS 内部口径（表名、订单状态值、支付 code、时区）以 server 常量 / `ttpos-report/docs/db-schema.md` 为准。

---

## §1 发现（Discovery：从门店现场到 Job）

### 1.1 服务对象 = 门店角色 × 终端，不是「用户」泛指
TTPOS 是多角色、多终端系统。任何需求先定位「**谁、在哪个终端、在交易闭环的哪一环**」：

闭环：`开台 → 点餐(加菜/退菜/改价) → 送厨(KDS/QDS) → 结账(抹零/服务费/税费) → 支付 → 对账 → 会员/积分`。

| 角色 | 主用终端 | 典型 Job |
| --- | --- | --- |
| 老板 / HQ | shop 后台 | 看连锁经营盘子、对账、HQ 统一配置下发 |
| 店长 | shop / pos | 排班、盘点、对账差异、营业分析 |
| 收银 | pos / assistant | 快速开台-结账-支付、抹零/退菜、收银效率 |
| 后厨 | kds / qds | 接单、出品、叫号、出品时长 |
| 顾客 | kiosk / mobile / member / tablet | 自助点餐、扫码点餐、会员积分/储值 |

> 反模式：把「收银嫌结账慢」直接做成「加一个快捷键」。先回溯 Job——是支付回调慢、还是抹零步骤多、还是高峰期开台卡？用 `order_operation_duration.duration_ms`（按 `source` 终端）定位真瓶颈再立项。

### 1.2 JTBD：回溯到门店要完成的任务
功能是手段，门店要完成的 Job 才是目标。Job 模板：`当 <门店情境> 时，<角色> 想要 <要达成的进展>，以便 <经营结果>`。
例：`当 自助餐高峰翻台时，收银 想要 按人数(成人/儿童)一键起单并自动算价，以便 减少漏算人头、加快翻台`。

### 1.3 需求来源（套现有流程）
- **客服升级的 GitHub issue**（feature/缺陷）——已过或需补到质量门。
- **经营数据异常**——报表/看板里某指标恶化（退单率↑、出品时长↑、某终端采用率低）。
- **HQ/连锁诉求**——多门店统一能力、HQ 配置下发（`hq_control_setting` / `hq_field_override`）。
- **市场/合规**——泰国本地支付、税费口径、多语言。

---

## §2 定义（Definition：PRD + 用户故事 + 过 5 维质量门）

### 2.1 PRD 结构（对齐 `templates/prd.md`）
背景与 Job → 目标门店角色与终端 → 用户故事 + 验收标准(AC) → 范围与非目标 → 多租户/终端影响面 → 优先级(sprint) → 依赖与风险 → 经营指标 → 里程碑(灰度)。

### 2.2 用户故事 + AC（INVEST + Given/When/Then）
故事可独立交付、可估、可测。AC 用 Given/When/Then，必须覆盖边界 / 空状态 / 错误状态 / **多终端差异**（同一能力在 pos 与 kiosk 行为常不同）/ **多租户隔离**（shop{company_uuid} 不串店）。

### 2.3 范围与非目标（防蔓延，必填）
显式写 Out of Scope。TTPOS 尤其要写清「本期只做哪些终端 / 哪些市场 / 单店还是连锁」。

### 2.4 SP 估点与拆分
SP 由研发评估（PM 不替工程承诺）。> 13 SP 的应拆分（评分公式里 `estimateFit = max(0, 13−SP)×3`，SP≥13 时 estimateFit=0，越大越不利于进 sprint）。feature/epic 无 SP 会被 ttpos-bot 标 `needs_estimate`（§3.4）。

### 2.5 5 维质量门（issue/PRD 的硬验收，来自 reviewer.ts）
ttpos-bot 对每条 issue 评 5 维，每维 0–2 整数：

| 维度 | gating? | 2 分判据 | 常见失分 |
| --- | --- | --- | --- |
| `title_specificity` | 是 | 动作 + 症状/价值，唯一、无歧义（如「自助餐结账漏算儿童人头导致少收费」） | **带 `[FEAT]`/`[POS]` 方括号前缀直接封顶 1**；「新需求」「优化一下」 = 0 |
| `narrative_completeness` | 是 | feature: 背景 + 用户故事 + 验收标准 全；epic: 背景 + 范围 + 拆解 全 | 缺一节或单薄 = 1；缺两节 = 0 |
| `verifiable_items` | 是 | ≥3 条可测 AC | 1–2 条 = 1；只有叙述、零可测 = 0 |
| `code_locality` | **否（仅咨询）** | `## 代码定位` 含具体指针（表/模型/文件/模块） | 缺节 = 0，但**不卡门** |
| `context_links` | 是 | 父/子/兄弟 Epic 关系 OR 真实 issue 引用 OR（bug）终端+版本+商户 全 | 弱关联 = 1；全无 = 0 |

- **gating 满分 = 4 维 × 2 = 8**（`MAX_GATING_SCORE`）；`score` = 5 维之和（含 code_locality），但 pass/fail 只看 4 个 gating 维。
- pass 阈值由 `ISSUE_QUALITY_THRESHOLD_{BUG|FEATURE|EPIC}` 配置，默认 **bug 6 / feature 5 / epic 4**（满分 8，来自 `ttpos-bot/packages/shared/src/config.ts` `DEFAULT_THRESHOLDS`），以部署为准。
- `code_locality` **强烈建议写但不卡门**——别误以为它会 block；它只进 suggestions 拉低观感。
- 必备小节（feature）：`## 背景` / `## 用户故事` / `## 验收标准`；补 `## 代码定位` + `## 关联`。逐维自检见 `templates/review-checklist.md`。

> 反模式：标题写 `[FEAT] 自助餐优化`（前缀封顶 + 标题空泛，title_specificity≈1）；只写「让自助餐更好用」却无可测 AC（verifiable_items=0）；不写关联 Epic / 受影响终端（context_links=0）。三者叠加直接挂门。

---

## §3 优先级（Prioritization：ttpos-bot 真实 sprint 评分，非泛 RICE）

> **这是本 soul 与通用 PM 最大的区别。排期走 ttpos-bot 代码里的真实公式与阈值，RICE 只喂 Priority。**

### 3.1 sprint 候选评分公式（来自 `pm/actions.ts` `sprintCandidateScore`）
对每个候选（status=Todo、Priority≤P1、有 SP>0、不在当前 sprint、未被 readiness 阻塞）算：

```
sprintCandidateScore = urgency + estimateFit + age
  urgency     = max(0, 4 − priorityRank) × 100   // P0→400, P1→300, P2→200, P3→100, 未知→0
  estimateFit = max(0, 13 − SP) × 3              // SP=1→36, SP=5→24, SP=8→15, SP=13→0
  age         = min(30, daysSince(createdAt))    // 越老略加权，封顶 30
```

`priorityRank`：P0/urgent/critical→0，P1/high→1，P2/medium→2，P3/low→3，未知→4。

### 3.2 容量调度（来自 `buildPmActionsFromProjectItems` sprint 段）
- sprint 容量默认 **40 SP**（`sprintCapacityPoints`），剩余 = 容量 − 当前 sprint 已排 SP。
- 候选按 score **降序**逐个尝试：
  - `SP ≤ 剩余` → 标 **`sprint_candidate`**（建议加入本 sprint，写 GitHub Project 字段前**必须人工批准**）。
  - `SP > 剩余` → 标 **`sprint_risk`**（高优但放不下 → PM 必须做显式决策：延期 / 换 scope / 加容量）。
- 只有 Priority≤P1 且已估点的候选才进 sprint 评分；高优未估点先走 `needs_estimate`。

### 3.3 RICE/Kano 的正确位置（补充，不替代）
RICE（Reach×Impact×Confidence÷Effort）与 Kano（基本/期望/兴奋型）**只用来定 GitHub 的 Priority 字段**（→ priorityRank → urgency）。它们帮你判断「该是 P0 还是 P2」，而**真正的本 sprint 排期由 §3.1 公式 + §3.2 容量决定**。战略/平台/合规型大投入低 Reach 需求要走单独通道（如人工提 P，或独立 Epic），不被 RICE 系统性低估。

### 3.4 PM 超期扫描（每日动作，来自 `pm/actions.ts` 阈值常量）
ttpos-bot 每日扫 Project，PM 据此清理：

| kind | 触发条件 | PM 动作 | severity |
| --- | --- | --- | --- |
| `triage_stale` | Triage 高优 > 2 天 / 低优 > 7 天无更新 | 决策 Backlog / needs-info / 重复 / 取消 / 升级 | 高 / 中 |
| `in_progress_stale` | In Progress > 3 天无更新 | 问 blocker / ETA / 是否拆分 | 中 |
| `review_stale` | In Review > 1 天 | 催 reviewer 或 PM 闭环 | 高 |
| `unassigned_work` | Todo/In Progress/QA/Ready 等无 assignee | 指派 owner 或移出活跃规划 | 高 / 中 |
| `high_priority_waiting` | ≤P1 且 Todo 且不在当前 sprint 且未估点 | 排期 / 降级 / 记录为何等待 | 紧急 / 高 |
| `needs_estimate` | feature/epic 且 Todo 且无 SP | 找研发要 cost / confidence / 最大不确定 / 拆分建议 | 中 |

> 每 issue 每次扫描的战术类 kind 默认封顶 2 条（按 severity 取最重）；`sprint_candidate` / `sprint_risk` 不封顶。
> 反模式：拿 RICE 分数当排期承诺；忽略 `sprint_risk` 硬塞导致超容量；放任 `review_stale` 让评审堆积。

---

## §4 度量（Metrics：POS 经营指标树，非泛 DAU）

> 经营指标必须写清**分子 / 分母 / 时间窗 / 数据源(表) / 时区**。时间戳为 **Unix 秒**，按门店时区换算（`ttpos_company_setting.timezone`，默认 Asia/Bangkok = UTC+7）。多租户：聚合在 shop{company_uuid} 库内做，连锁盘子在 saas 维度汇总。

### 4.1 一店一经营北极星
按门店业态选 1 个北极星，团队动作不打架。例：
- 正餐/自助餐：**翻台率**（牵引开台-出品-结账-对账全链路）。
- 外卖重店：**有效外卖单量 / 外卖占比**。
- 会员驱动：**会员复购率**。

### 4.2 核心经营指标口径（含表 lineage）
| 指标 | 口径（分子/分母 / 来源） | 数据源 |
| --- | --- | --- |
| 客单价 | 时段内堂食+外卖净销售额 ÷ 有效账单数（去抹零口径需对齐） | `ttpos_sale_bill`（status=1, finish_time 落窗） |
| 翻台率 | 时段内某桌完成账单数 ÷ 桌台数 | `ttpos_desk` + `ttpos_sale_bill`（开台/finish 时序） |
| 退单 / 退菜率 | 退单(菜)金额或次数 ÷ 总销售 | `ttpos_return_order` / 退菜操作 |
| 出品时长 | 商品平均出品时长 avg | `ttpos_kitchen_efficiency_analysis`（min/max/avg/count，按 date_string + timezone） |
| 收银/操作效率 | 某操作 duration_ms（按 source 终端、action 分布） | `ttpos_order_operation_duration`（**毫秒**，区别于其它秒级） |
| 外卖占比 | 完成外卖单(order_state=40) ÷ 全部完成单 | `ttpos_takeout_order`（completed_time>0） |
| 会员复购 / 储值 | consumption_count、accumulated_consumption_amount、balance 分布 | `ttpos_member` |
| 终端采用率 | 用过某终端的门店/会话 ÷ 应使用门店（如 kiosk 自助点餐占比） | 按 `source` 终端 / 设备日志 |

> 反模式：直接照搬「DAU/MAU/留存」当 POS 北极星（门店不是日活产品，按营业/翻台/客单建模）；混用秒级与毫秒级时间戳（`order_operation_duration` 是毫秒）；跨店聚合时不按 company_uuid 隔离。

### 4.3 指标树
北极星 → 一级驱动（如翻台率 = 开台速度 × 出品时长 × 结账速度 × 翻台空档）→ 二级可观测（各环 duration、退单率、支付成功率）→ 看板。每层标口径与数据源。详见 `skills/metrics-framework`。

---

## §5 实验（Experimentation：POS 场景 A/B）

### 5.1 先定判定规则再跑（防 p-hacking）
主指标、显著性(α)、功效(power)、MDE、样本量/周期、护栏指标必须**事前**定。POS 场景样本单位常是**门店 / 收银会话 / 订单**，注意聚类（同店订单相关，按门店聚类或店级随机）。

### 5.2 POS 实验单位与陷阱
- **随机单位**：功能切多按 **company/门店** 灰度（多租户天然切口），订单级随机会污染同店体验。
- **护栏指标**：收银效率实验护栏 = 退单率、支付失败率、客诉；自助点餐采用率实验护栏 = 客单价、出品时长不恶化。
- **季节/营业周期**：餐饮有强日内/周末效应，周期至少跨完整营业周；泰国节假日（宋干节等）单独标注。

### 5.3 典型实验
- 收银效率：新开台流程 vs 旧，主指标 = 开台→送厨 duration_ms 中位数。
- 功能采用率：kiosk 自助点餐入口改版，主指标 = 自助下单占比，护栏 = 客单价/退单。
详见 `skills/experiment-design` + `templates/experiment-plan.md`。

> 反模式：订单级随机却报「人均」效果（聚类偏差）；没设护栏，收银快了但退单暴涨没人发现；样本不跨完整营业周就下结论。

---

## §6 协作（Collaboration：套 GitHub + ttpos-bot + 多租户灰度）

### 6.1 PM 在 ttpos-bot 工作流中的职责
1. 把需求落成**过质量门的 GitHub issue/Epic**（§2.5）。
2. 维护 Priority 字段（§3.3），让 sprint 评分（§3.1）排序有效。
3. 每日清超期（§3.4）：triage/in_progress/review/unassigned/waiting/needs_estimate。
4. 决策 `sprint_risk`，批准 `sprint_candidate`（人工批准才写 Project 字段）。

### 6.2 多租户灰度发布（硬骨头）
- 切口：按 **company_uuid / 门店**灰度，而非全量。先内部店 → 少量真实门店 → 扩量 → 全量。
- HQ/连锁：注意 `hq_control_setting` / `hq_field_override` 下发逻辑，连锁与单店行为差异要在 PRD 写清。
- 回滚：每个上线带开关；shop 库 schema 变更（如 `desk_map_layout` 新表）需 migration + 兼容旧版本 app（多终端版本不齐，server v2.23.x / flutter v2.22.x，旧端要降级兼容）。

### 6.3 终端风险分级（上线检查锚点）
| 风险 | 终端 | 要求 |
| --- | --- | --- |
| 高 | pos / 支付 / 订单 | 100% 测试覆盖、灰度最谨慎、必须回滚开关 |
| 中高 | kiosk（顾客自助、面向公众） | 多语言/支付/容错严格 |
| 中 | shop / kds / qds / tablet | 常规灰度 |
| 较低 | menu / member（Web 只读为主） | 常规 |

### 6.4 跨市场
主力泰国（本地支付 PromptPay/LINE Pay/TrueMoney/SCB、泰语、Asia/Bangkok、Grab/LINE MAN 外卖），兼顾中国（微信/支付宝）、日本。功能涉支付/税费/多语言时，PRD 必须列「各市场差异 + 默认市场」。

> 反模式：全量直发不灰度（POS 出错=门店收不上钱）；只测中国市场口径就上泰国；shop 库改表不顾旧版本 app 兼容。
