# 行业基准、评分锚点与 TTPOS 经营指标口径

> 调研得来的事实 / 框架 / 区间，供 skill 引用。**每条标来源或「待核实」**。检索日期 2026-06-04。
> 两类数据严格分开：
> - **§1–§4 通用框架/基准**：海外 + 跨垂直公开来源，对 TTPOS 仅作**量级参考**，目标须用门店自身数据校准。
> - **§5 TTPOS 内部口径**：来自 server 常量 / `ttpos-report/docs/db-schema.md`，是**确定口径**（不是基准），引用须按其落地。

---

## 1. RICE 评分锚点（Intercom 原版，仅用于定 Priority 字段）

> 在 TTPOS，RICE **只用来判断该需求是 P0/P1/P2/P3**（→ ttpos-bot priorityRank → urgency），**不直接当排期分**。真正的本 sprint 排期走 `product-playbook.md` §3.1 公式。

来源：Intercom Blog "RICE: Simple prioritization for product managers" <https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/>（检索 2026-06-04）；辅证 ProductPlan <https://www.productplan.com/glossary/rice-scoring-model>。

| 维度 | 取值口径 | 锚点 | 来源 |
| --- | --- | --- | --- |
| Reach | 固定周期内影响门店数 / 订单数；统一周期 | 实数（如「每月 300 家门店」） | Intercom |
| Impact | 对单门店经营影响强度（乘数） | 3 巨大 / 2 高 / 1 中 / 0.5 低 / 0.25 极小 | Intercom |
| Confidence | 对估计的信心 | 100% 高 / 80% 中 / 50% 低；<50% = moonshot | Intercom |
| Effort | 投入（人月） | 实数，不足一月记 0.5；与研发 SP 估点呼应 | Intercom |

公式：`RICE = (Reach × Impact × Confidence) / Effort`。
**如何用**：同批需求 Reach 用同一周期；对齐 Impact 锚点（3/2/1/0.5/0.25 对应什么级别的门店经营变化）；RICE 高 → 提 Priority → 进 ttpos-bot sprint 评分。

---

## 2. ttpos-bot sprint 评分与超期阈值（TTPOS 真实排期口径，非基准）

> 来源：`ttpos-bot/packages/domain/src/pm/actions.ts`（确定值，按代码落地，不臆改）。完整公式/动作见 `product-playbook.md` §3。

- 候选评分：`urgency(max(0,4−priorityRank)×100) + estimateFit(max(0,13−SP)×3) + age(min(30,天数))`。
- 容量默认 **40 SP**；放得下 = `sprint_candidate`（需人工批准），放不下 = `sprint_risk`。
- 超期阈值：triage 高优 **>2 天** / 低优 **>7 天**；in_progress **>3 天**；in_review **>1 天**。
- 战术 kind 每 issue 每扫描封顶 2 条（按 severity）；sprint 类不封顶。

---

## 3. A/B 实验样本量速查（通用统计，量级参考）

来源：abtasty "Sample Size Calculation" <https://www.abtasty.com/blog/sample-size-calculation/>；Evan Miller 计算器 <https://www.evanmiller.org/ab-testing/sample-size.html>；X/Twitter Eng "Power, MDE, bucket size" <https://blog.x.com/engineering/en_us/a/2016/power-minimal-detectable-effect-and-bucket-size-estimation-in-ab-tests>（均检索 2026-06-04）。

标准参数：显著性 α = **0.05**（双侧 Z=1.96）；功效 power = **0.80**（Z=0.84）。

速算法则（α=0.05, power=0.8，**每组**）：
```
n ≈ 16 × p(1−p) / (绝对提升)²      # p = 基线率，绝对提升 = p₂ − p₁
```
严谨式：`n = (Z(α/2)+Z(β))² × [p₁(1−p₁)+p₂(1−p₂)] / (p₂−p₁)²`（每组）。

> **POS 场景注意聚类**：样本单位常是门店/会话/订单，同店订单相关 → 按门店随机时**有效样本是门店数**，订单级 n 会高估功效。跨完整营业周期取样（强日内/周末效应）。

参考量级（双侧 α=.05 / power=.8，每组；来源：Optimizely/Statistics.tools 计算器，检索 2026-06-04，标量级）：

| 基线率 | MDE（相对） | 目标率 | 每组样本量量级 | 备注 |
| --- | --- | --- | --- | --- |
| 3% | +10% 相对 | 3.3% | 约 5 万 | 计算器量级 |
| 20% | +10% 相对 | 22% | 数千 / 组 | 速算外推，待精算 |

> 标「待精算」的引用前须用计算器精算，不要当事实。

---

## 4. North Star / AARRR / Kano / JTBD（框架出处）

- 北极星 + AARRR：Amplitude "Pirate Metrics" <https://amplitude.com/blog/pirate-metrics-framework>（检索 2026-06-04）。AARRR = Acquisition/Activation/Retention/Referral/Revenue（Dave McClure）。POS 落地见 §5 + playbook §4。
- Kano：Qualtrics <https://www.qualtrics.com/articles/strategy-research/kano-analysis/>；Folding Burritos <https://foldingburritos.com/blog/kano-model/>（检索 2026-06-04）。
- JTBD Job Story：Userpilot <https://userpilot.com/blog/jobs-to-be-done-template/>（检索 2026-06-04）。

---

## 5. TTPOS 内部经营指标口径（确定口径，来自 db-schema / server）

> 来源：`ttpos-report/docs/db-schema.md`、`ttpos-server-go/main/app/{model,constant}`。这是**口径**不是基准——引用时按表 lineage 落地，目标值用门店自身数据定。

### 5.1 多租户与时间
- saas 库 `ttpos_company` / `ttpos_company_setting`；每店 shop{company_uuid} 库。聚合在店内做，连锁在 saas 汇总。
- 时间戳 **Unix 秒**（`create_time`/`finish_time`/`completed_time`），按 `ttpos_company_setting.timezone` 换算（默认 Asia/Bangkok=UTC+7）。**例外**：`ttpos_order_operation_duration` 的 start/end/duration 是**毫秒**。

### 5.2 指标 → 表 lineage（口径锚点）
| 指标 | 数据源（表 + 关键字段/状态） |
| --- | --- |
| 客单价 / 销售额 | `ttpos_sale_bill`（status=1, finish_time）；堂食消耗 `ttpos_sale_order_material` |
| 外卖单 / 外卖占比 | `ttpos_takeout_order`（order_state=40 完成, completed_time>0）；`ttpos_takeout_order_material`（非所有店有，先查 information_schema） |
| 翻台率 | `ttpos_desk`（status 0未开台/1已开台）+ `ttpos_sale_bill` 时序 |
| 出品时长 | `ttpos_kitchen_efficiency_analysis`（min/max/avg/count, date_string, timezone） |
| 操作/收银效率 | `ttpos_order_operation_duration`（**duration_ms 毫秒**, action, source 终端, status 1成功/0失败） |
| 退单 | `ttpos_return_order` |
| 会员 | `ttpos_member`（point/balance/consumption_count/accumulated_consumption_amount） |
| 盘点/对账 | `ttpos_stock_reconciliation`（type 3日/4周/5月盘, status 0未提交/1待审/2已审）；仓库流水 `ttpos_warehouse_in_out_log`（scene 0采购/1销售/5调拨, log_type 0入/1出） |
| 多语言名 | `name` 字段为 JSON，`$.zh/$.en/$.th` 提取 |

### 5.3 终端（10 个）与风险分级
- 终端：pos / shop / kds / qds / assistant / tablet / kiosk / mobile / menu / member。
- 风险：高 = pos / 支付 / 订单（100% 测试覆盖）；中高 = kiosk；中 = shop/kds/qds/tablet；较低 = menu/member。来源：`ttpos-flutter/README.md`（测试策略 + 应用完成度）。

### 5.4 市场与支付（来自 server 常量）
- 泰国（主）：PromptPay / LINE Pay / TrueMoney / SCB / KBANK；中国：微信/支付宝；日本：信用卡/IC/QR。具体 code 以 `ttpos-server-go/.../constant/payment.go` 为准，**code 值不在本文写死，用前查常量**。

---

## 6. 待核实 / 仅区间（不可当事实）

- POS / 餐饮 SaaS 同口径的翻台率、客单价、退单率、kiosk 自助点餐采用率行业基准——暂缺权威公开来源，标待核实，落地用门店自身数据。
- §3 表中标「待精算」的样本量数字，引用前用计算器精算。
- 各市场支付 code 精确值——以 server 常量为准，不在本文档固化。
