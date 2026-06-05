# 《<功能名：动作 + 价值，无方括号前缀>》PRD / GitHub Issue

> 本模板**双用**：既是 PRD，也是能直接发到 GitHub、过 ttpos-bot 5 维质量门的 feature issue 正文。
> **标题硬规则**：动作 + 症状/价值，唯一无歧义；**禁用 `[FEAT]`/`[POS]` 等方括号前缀**（reviewer 明令禁止，带前缀直接把 title_specificity 封顶 1）。
> 例（好）：`自助餐按成人/儿童人数起单并自动算价，减少漏算人头`。例（差）：`[FEAT] 自助餐优化`。
> 逐维自检见 `templates/review-checklist.md`；方法见 `knowledge/product-playbook.md` §2。

| 字段 | 内容 |
| --- | --- |
| 文档状态 | 草稿 / 评审中 / 已定稿 |
| 负责人(PM) | <PM> |
| 类型 | feature / epic |
| Priority | P0 / P1 / P2 / P3（→ sprint 评分 urgency，定级见 §6） |
| 受影响终端 | pos / shop / kds / qds / assistant / tablet / kiosk / mobile / menu / member（勾选） |
| 市场 | 泰国(主) / 中国 / 日本 / …（默认市场 + 差异见 §5） |
| 多租户范围 | 单店 / 连锁(HQ) / 全平台；shop{company_uuid} 库 or saas 库 |

## 背景
> 对应质量门 `narrative_completeness`。
- **现状与为什么现在做**：门店现场什么痛、哪个经营指标恶化（引数据，标事实/假设）。
- **要解决的 Job**：`当 <门店情境> 时，<门店角色> 想要 <进展>，以便 <经营结果>`。
- **业务目标**：关联北极星 / 经营指标（客单价/翻台/退单/出品时长/终端采用，见 `metrics-framework`）。

## 目标用户与场景
- **目标角色 × 终端**：谁、在哪个终端、在交易闭环（开台→点餐→送厨→结账→支付→对账→会员）的哪一环。
- **核心场景**：1–3 个高频真实门店场景（不是边角）。

## 用户故事
> 对应 `narrative_completeness`。结构见 `templates/user-story.md`。
- **US-1** 作为 <角色>，我希望 <能力>，以便 <价值>。
- **US-2** …

## 验收标准
> 对应质量门 `verifiable_items`（**≥3 条可测**才得 2 分）。每条 Given/When/Then，覆盖边界/空/错误/**多终端差异**/**多租户隔离**。
| # | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | … | … | …（可测、有明确判据） |
| AC2 | … | … | …（含边界/空状态） |
| AC3 | … | … | …（含错误/异常） |

## 范围与非目标
- **本期范围（In Scope）**：哪些终端 / 市场 / 单店还是连锁。
- **非目标（Out of Scope）**：明确不做什么（防蔓延，必填）。

## 多租户与终端影响面
- **库**：shop{company_uuid} 库改动？saas 库改动？是否新表/改表（需 migration + 旧版本 app 兼容）。
- **终端差异**：同能力在各终端的行为差异（如 pos vs kiosk）。
- **HQ/连锁**：`hq_control_setting` / `hq_field_override` 下发逻辑，连锁 vs 单店差异。
- **终端风险**：涉 pos/支付/订单(高风险)需 100% 测试覆盖 + 回滚开关。

## 优先级（sprint 评分）
> 对应质量门 `context_links`（用 Priority + 受影响终端补强）。RICE/Kano 只定 Priority，本 sprint 排期走评分公式。详见 `templates/sprint-priority-table.md`、playbook §3。
- **Priority**：P_，依据（RICE/Kano 简述）。
- **SP**：<研发估点>（无 SP 会被标 needs_estimate；>13 应拆分）。
- **sprintCandidateScore** = urgency + estimateFit + age = <算式与结果>。

## 代码定位
> 对应质量门 `code_locality`（**强烈建议、不卡门**，但缺它拉低观感）。给真实表/模型/终端/模块指针。
- 后端表/模型：如 `ttpos_buffet_package` / `BuffetCustomerTypePrice` / `ttpos_desk_map_layout.DeskMapLayout`。
- 终端模块：如 flutter `apps/pos` 收银开台流程 / `apps/kiosk` 自助点餐。
- 涉及常量：如 `ttpos-server-go/.../constant/payment.go`（支付 code，不在此固化值）。

## 关联
> 对应质量门 `context_links`（**gating**，必写）。父 Epic / 子任务 / 相似 issue + 受影响终端 + 版本。
- 父 Epic：#<Epic 号>；相似 issue：#<号>。
- 版本：server v2.23.x / flutter v2.22.x（旧端兼容说明）。

## 依赖与风险
- **依赖**：上下游服务 / 第三方（支付渠道、外卖平台 Grab/LINE MAN）。
- **风险**：技术/数据/合规/时间 + 缓解；硬骨头单列。
- **假设**：标「待验证猜想」+ 验证方式（交 `experiment-design`）。

## 衡量指标
> 口径见 playbook §4 / `metrics-framework`。
- **北极星 / 关联指标**：本项目预期如何影响（如翻台率）。
- **关键成功指标**：看哪几个、目标值（用门店自身数据推）、口径（分子/分母/时间窗/数据源表/时区 Asia/Bangkok）。
- **护栏指标**：不能恶化的（如客单价、支付成功率、退单率）。

## 里程碑（多租户灰度）
| 阶段 | 交付 | 灰度切口（按 company_uuid/门店） | 时间(建议，研发对齐) |
| --- | --- | --- | --- |
| MVP | 最小核心闭环 | 内部店 | <…> |
| 灰度 | 放量比例/门店 | 少量真实门店 → 扩量 | <…> |
| 全量 | 回滚开关 + 监控就位 | 全量 | <…> |
