---
name: metrics-framework
description: 定义 TTPOS 产品的经营度量体系——选门店北极星、拆 POS 指标树、钉死口径(分子/分母/时间窗/数据源表/时区)、给看板与告警，产出 POS 产品指标树。
---

# 指标体系（TTPOS · POS 经营指标树）
## 输出纪律

回答从结果开始：先给结论、交付物、必要假设或需要用户补充的关键信息，再给细节。可以在内部读取 AGENTS、knowledge、templates 或 MCP 配置，但不要把内部过程写成用户可见开场。不要以“使用 `skill` / 我会按 / 我会先 / 我先读取 / 已确认”开头；除非用户明确要求解释过程或需要说明阻塞原因，否则不叙述工具调用和资产读取过程。

## 产出物

一份《门店北极星 + POS 指标树 + 看板定义》：单一北极星、分层指标树、每个指标的口径（含**数据源表 + 时区**）、看板与告警规格。**用 POS 经营指标，不是泛 DAU/留存。**

## 前置输入

- 门店业态（正餐/自助餐/快餐/外卖重店）与核心经营价值。
- 可采集数据（按 §5 表 lineage：sale_bill / desk / kitchen_efficiency / order_operation_duration / return_order / member / takeout）。

## 引用资产

- 方法论：`knowledge/product-playbook.md` §4（一店一北极星、指标树、口径、反模式）。
- 口径：`knowledge/benchmarks.md` §5（TTPOS 指标→表 lineage、Unix 秒 vs 毫秒、多租户/时区）。

## 步骤

1. **定北极星**：按业态选 1 个经营领先指标（正餐/自助=翻台率；外卖重店=外卖占比；会员驱动=复购率）。拒绝虚荣/滞后（如累计 GMV）。
2. **拆指标树**：北极星 → 一级驱动 → 二级可观测 → 团队动作；每层可被上层解释。
3. **定口径**：每指标写清分子/分母/时间窗/**数据源表**/时区（Unix 秒 + 门店时区 Asia/Bangkok；`order_operation_duration` 是**毫秒**）/多租户隔离（按 company_uuid）。
4. **看板/告警**：分层看板、刷新频率、护栏告警阈值。

## 填好的范例（TTPOS · 自助餐/正餐店指标树）

**1. 北极星**：**翻台率**（时段内某桌完成账单数 ÷ 桌台数）。
理由：牵引「开台→点餐→送厨→结账→支付→对账」全链路效率，是门店赚钱的核心节奏，领先于月营收（滞后）。拒绝「累计销售额」（虚荣/滞后，不指导日常动作）。

**2. 指标树**
```
北极星：翻台率（按门店、按营业日，时区 Asia/Bangkok）
├─ 开台速度：开台 duration_ms 中位数 ← 收银上手/桌台地图（动作：地图化开台 → 见 prd-writer 桌台地图）
├─ 出品时长：avg 出品时长 ← 后厨效率/KDS（动作：KDS 超时告警、出品排程）
├─ 结账速度：结账+支付 duration_ms ← 抹零/支付回调（动作：自助餐按人数算价 → 减手动）
├─ 翻台空档：完成账单→下次开台间隔 ← 翻台清桌/带位
└─ 自助餐专项：人头吻合率 ← 按人数起单算价（动作：自助餐人数管理）
驱动收入侧（非北极星但同盯）：
├─ 客单价（sale_bill）  ├─ 退单率（return_order）  ├─ 外卖占比（takeout_order）  └─ 会员复购（member）
```

**3. 口径定义（节选，含表 lineage）**
| 指标 | 分子 | 分母 | 时间窗 | 数据源表（关键字段） | 备注 |
| --- | --- | --- | --- | --- | --- |
| 翻台率 | 营业日完成账单数 | 桌台数 | 营业日（门店时区） | `ttpos_sale_bill`(status=1, finish_time) + `ttpos_desk` | 按 company_uuid 分店算 |
| 开台 duration | — | — | 滑动窗 | `ttpos_order_operation_duration`(action=开台, source, **duration_ms 毫秒**) | 区别于秒级时间戳 |
| 出品时长 | — | avg | 日 | `ttpos_kitchen_efficiency_analysis`(avg, date_string, timezone) | 已按商品聚合 |
| 客单价 | 净销售额 | 有效账单数 | 营业日 | `ttpos_sale_bill`(status=1) | 抹零口径需对齐 |
| 退单率 | 退单(菜)金额/次数 | 总销售 | 营业日 | `ttpos_return_order` | 护栏常用 |
| 外卖占比 | 完成外卖单 | 全部完成单 | 营业日 | `ttpos_takeout_order`(order_state=40, completed_time>0) | 部分店无 takeout_material 表，先查 schema |
| 会员复购 | 复购会员数 | 会员数 | 月 | `ttpos_member`(consumption_count, accumulated_consumption_amount) | — |

> **口径纪律**：时间戳 Unix 秒按 `ttpos_company_setting.timezone`（默认 Asia/Bangkok）换算；**`order_operation_duration` 是毫秒**，勿混。跨店汇总在 saas 维度做，店内聚合按 shop{company_uuid}，**不串店**。

**4. 看板 / 告警**
- 分层：北极星（翻台率，按门店/营业日）→ 四个一级驱动（开台/出品/结账/空档）→ 收入侧（客单价/退单/外卖/会员）。连锁加 HQ 汇总层（saas）。
- 看趋势 + **门店对比**（找掉队店），不只看连锁总数（掩盖单店问题）。
- 告警：翻台率日环比 < −X%、出品时长 avg 超阈值、退单率突升、某终端 duration_ms 异常 → 触发排查。

## 自检清单

- [ ] 北极星唯一、是**经营领先指标**（按业态选，非虚荣/滞后，非泛 DAU）。
- [ ] 指标树每层可被上层解释，末端挂得上团队动作（关联具体功能/skill）。
- [ ] 每指标口径无歧义（分子/分母/时间窗/**数据源表**/时区/多租户隔离）。
- [ ] 标清 Unix 秒 vs `order_operation_duration` 毫秒；时区按门店换算。
- [ ] 跨店汇总按 company_uuid 隔离，连锁加 HQ 层 + 门店对比。
- [ ] 采不到的指标标「待补埋点/待补表」，不拿估算冒充实测。

## 边界

- 行业基准（benchmarks §1–§4）只判量级，目标值用门店自身数据推；§5 是确定口径，按表 lineage 落地。
- 采不到的指标标待补，不臆造；POS 不按日活产品建模（按营业/翻台/客单）。
