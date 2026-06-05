---
name: prd-writer
description: 给一个真实 TTPOS 功能写完整 PRD = 能直接发 GitHub、过 ttpos-bot 5 维质量门的 feature issue：背景/用户故事/可测 AC/范围/多租户终端影响/代码定位/关联/指标/灰度。
---

# PRD 撰写（TTPOS · 过 5 维质量门）

## 产出物

一份完整《PRD》（对齐 `templates/prd.md`），**同时是能过 ttpos-bot 5 维质量门的 GitHub feature issue 正文**：背景 / 用户故事 / 可测 AC（≥3）/ 范围与非目标 / 多租户与终端影响 / 优先级(sprint) / 代码定位 / 关联 / 指标 / 灰度里程碑。

## 前置输入

- 已通过的机会评估（理想来自 `opportunity-assessment`）。
- 目标门店角色 × 终端、核心 Job、约束（多租户/终端/市场/工程）。

## 引用资产

- 方法论：`knowledge/product-playbook.md` §2（PRD 结构、INVEST、5 维质量门 §2.5）+ §6（多租户灰度、终端风险）。
- 指标口径：playbook §4 / `knowledge/benchmarks.md` §5。
- 骨架：`templates/prd.md`、`templates/user-story.md`。自检：`templates/review-checklist.md`（5 维逐维）。

## 步骤

1. **标题**：动作 + 症状/价值，**禁方括号前缀**（`[FEAT]` 直接封顶 title_specificity）。
2. **背景 + Job**：现状痛 + 哪个经营指标恶化 + Job Story + 业务目标（关联北极星）。
3. **用户故事 + AC**：可独立交付小故事，每条 Given/When/Then，**≥3 条可测**，覆盖边界/空/错误/多终端差异/多租户隔离。
4. **范围/非目标**：写清本期哪些终端/市场/单店还是连锁；显式 Out of Scope。
5. **多租户与终端影响**：shop 库 or saas 库、新表/migration、终端风险分级、HQ/连锁差异。
6. **优先级**：Priority + 算 sprintCandidateScore（交 `backlog-prioritization`）。
7. **代码定位**：给真实表/模型/终端模块指针（code_locality，不卡门但建议写满）。
8. **关联**：父 Epic / 相似 issue / 受影响终端 + 版本（context_links，gating）。
9. **指标 + 灰度**：经营指标口径（分子/分母/时间窗/表/时区）+ 护栏 + 按 company_uuid 灰度。
10. **过门自检**：用 `review-checklist.md` 逐维自评，gating 4 维之和 ≥ feature 阈值（默认 5/8），建议尽量满 8。

## 填好的范例（TTPOS · 自助餐按人数起单算价 · feature issue 片段）

> 标题（过 title_specificity=2，无前缀）：
> **`自助餐按成人/儿童人数起单并自动算价，消除高峰漏算人头少收费`**

**## 背景**
现状：自助餐结账靠收银手动按人头选「成人/儿童」套餐再加总，高峰翻台时漏选/错选导致**少收费**（客单价口径偏低）。近 30 天某 5 家自助餐店人工抽查发现约 6% 账单人头与实到不符（数据来源：门店巡店记录，**合理假设**待埋点确认）。
Job：`当 自助餐高峰翻台时，收银 想要 按成人/儿童人数一键起单并自动算价，以便 不漏算人头、加快开台`。
业务目标：自助餐店**客单价**回正 + **翻台率**提升（北极星=翻台率）。

**## 用户故事**
- US-1 作为 收银(pos)，我希望 开台时输入成人/儿童人数即自动套用对应价并生成账单，以便 不手动逐项加。
- US-2 作为 店长(shop)，我希望 配置自助餐各客群价与限时规则，以便 不同时段/客群定价。
- US-3 作为 顾客(kiosk)，我希望 自助点餐时选人数后看到应付，以便 自助起单（本期只读展示，下单仍收银确认）。

**## 验收标准**（verifiable_items：≥3 条可测）
| # | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | 自助餐套餐已配成人/儿童价（BuffetCustomerTypePrice） | pos 开台输入 成人2/儿童1 | 账单金额 = 成人价×2 + 儿童价×1，2 秒内生成 |
| AC2 | 该套餐开启限时(IsLimitTime=1, LimitTime=90min) | 起单后超 90 分钟 | 触发提醒(ReminderOrderTime)，并按规则停止加菜(NonOrderingTime) |
| AC3 | 输入人数为 0 或为空 | 点「起单」 | 置灰并提示「请输入人数」，不生成账单 |
| AC4 | 同一 company 下 A 店改了价，B 店不受影响 | B 店开台 | 用 B 店(shop{company_uuid}) 自己的价，租户隔离 |
| AC5 | 旧版本 pos app(< 支持版本) | 打开自助餐开台 | 降级为旧手动流程，不崩溃（多端版本不齐兼容） |

**## 范围与非目标**
- 范围：pos 起单算价 + shop 配置 + kiosk **只读展示**；主市场泰国 + 中国。
- 非目标：kiosk 自助直接下单闭环（二期）；按时段动态浮动定价（二期）；外卖渠道自助餐（不适用）。

**## 多租户与终端影响面**
- 库：shop{company_uuid} 库（套餐价、限时规则）；无 saas 库改动。
- 终端：pos(高风险，100% 覆盖+回滚开关) / shop(配置) / kiosk(中高，只读)。
- HQ/连锁：连锁可由 HQ 下发统一自助餐价（`hq_field_override`），单店可覆盖——需在配置页标明覆盖关系。

**## 优先级（sprint 评分）**
Priority=P0（漏算=直接少收钱，Impact 高 + 头部自助餐店 Reach）。SP=8（研发估）。sprintCandidateScore = urgency400 + estimateFit15 + age12 = **427**（详见 `backlog-prioritization`）。

**## 代码定位**（code_locality，建议写满）
- 后端：`ttpos_buffet_package`（`IsLimitTime`/`LimitTime`/`NonOrderingTime`/`ReminderOrderTime`/`OpenOverallDiscount`），客群价 `BuffetCustomerTypePrice`（buffet_package_uuid 关联），含菜 `BuffetProduct`（IsShowCashier/IsShowKitchen…）。
- 终端：flutter `apps/pos` 开台流程 + `apps/shop` 自助餐配置页 + `apps/kiosk` 只读展示；`packages/model` 自助餐 model。

**## 关联**（context_links，gating）
- 父 Epic：#<自助餐能力 Epic>；相似 issue：#<历史「自助餐限时」issue>。
- 受影响终端：pos / shop / kiosk；版本：server v2.23.x / flutter v2.22.x（旧端 AC5 兼容）。

**## 衡量指标**
- 北极星：自助餐店**翻台率**（完成账单数 ÷ 桌台数，`ttpos_desk`+`ttpos_sale_bill`，按门店时区 Asia/Bangkok）。
- 关键：自助餐**客单价**回正（净销售额 ÷ 有效账单数，`ttpos_sale_bill` status=1）；人头吻合率（埋点）。
- 护栏：开台 duration_ms 不上升（`ttpos_order_operation_duration`，source=pos）；退单率不上升。

**## 里程碑（灰度）**：MVP（pos 起单算价）→ 内部店 → 3–5 家真实自助餐店灰度 → 全量（回滚开关 + 翻台/客单看板）。

**过门自检**：title_specificity 2（无前缀+动作症状）/ narrative_completeness 2（背景+故事+AC 全）/ verifiable_items 2（5 条 AC）/ code_locality 2（表+字段+终端）/ context_links 2（Epic+终端+版本）→ gating 4 维 = **8/8**，稳过阈值。

## 自检清单

- [ ] 标题无方括号前缀，动作+症状/价值。
- [ ] AC ≥3 条可测，覆盖边界/空/错误/**多终端差异**/**多租户隔离**/旧版本兼容。
- [ ] 非目标显式（含本期终端/市场/单店连锁范围）。
- [ ] 写了多租户(库)、终端风险、HQ/连锁差异。
- [ ] `## 代码定位`（真实表/字段/终端）+ `## 关联`（Epic/终端/版本）都在。
- [ ] 经营指标口径无歧义（分子/分母/时间窗/数据源表/时区），含护栏；目标用门店自身数据推。
- [ ] 用 `review-checklist.md` 逐维自评，gating 4 维之和 ≥ feature 阈值（默认 5/8），力求满 8。

## 边界

- PRD 优先级与里程碑是建议，SP/工期由研发评估，PM 不替工程承诺。
- 不臆造门店数据；缺数据标假设并给验证方式（交 `experiment-design`）。
- 代码定位指针是给研发的线索，不代表 PM 拍板实现方案。
