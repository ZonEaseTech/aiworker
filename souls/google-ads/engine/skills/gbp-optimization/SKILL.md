---
name: gbp-optimization
description: 出 Google Business Profile 优化方案——类目/NAP/餐饮属性/菜单/照片/评价/帖子/预订链接，作为本地餐饮付费的前置地基。
---

# Google Business Profile 优化方案
## 输出纪律

回答从结果开始：先给结论、交付物、必要假设或需要用户补充的关键信息，再给细节。可以在内部读取 AGENTS、knowledge、templates 或 MCP 配置，但不要把内部过程写成用户可见开场。不要以“使用 `skill` / 我会按 / 我会先 / 我先读取 / 已确认”开头；除非用户明确要求解释过程或需要说明阻塞原因，否则不叙述工具调用和资产读取过程。

**产出物**：一份填好的 GBP 优化方案，符合 `templates/gbp-optimization-checklist.md`。

## 前置：必须先确认的输入

- 门店 GBP 是否认领 verified（未 verified 则一切免谈）
- 当前主类目 / NAP / 营业时间 / 属性 / 菜单 / 照片 / 评价现状
- 招牌菜清单、价位、是否可订位 / 在线订餐链接

## knowledge / templates 引用

- 方法论：`knowledge/local-restaurant-ads-playbook.md` §3（GBP 三因子：相关性 / 距离 / 知名度 + 餐饮专项清单）
- 骨架：`templates/gbp-optimization-checklist.md`
- 联动：§2（GBP 是 PMax 门店目标 / location extension 的地基）

## 步骤（端到端）

1. **认领与验证**：确认 verified；未则先 verify。
2. **相关性**：主类目精确（非泛 Restaurant）+ 次类目；NAP 跨平台一致；营业时间含节假日。
3. **餐饮属性**：dine-in/takeaway/delivery、订位、价位、设施。
4. **菜单与照片**：上传含价菜单 + 招牌菜高质量照片。
5. **知名度**：评价获取 + 100% 回复；GBP 帖子定期发带本地 CTA。
6. **预订 / 订餐链接** + 与付费联动（location extension / PMax 关联）。
7. 按 ROI / 成本排优先级，列本月必做。

## 填好的范例（曼谷泰式火锅店 GBP）

**门店**：สุกี้บ้านเรา（素坤逸）。现状：已认领但**未 verified**、主类目泛「Restaurant」、菜单未传、评价 28 条评分 4.1 但近半年无新评、照片仅 3 张门面。

| 清单项 | 现状 → 行动 |
| --- | --- |
| 认领 verified | 未 verified → **第一优先**：完成验证（明信片 / 视频） |
| 主类目 | 泛「Restaurant」→ 改 **ร้านสุกี้ / Hot pot restaurant**；次类目 Buffet restaurant、Thai restaurant |
| NAP 一致 | 与 LINE MAN 页电话不一致 → 统一 |
| 餐饮属性 | 补：dine-in + delivery、可订位、价位 ฿฿、有停车 |
| 菜单 | 缺 → 上传含价菜单；招牌「สุกี้น้ำซุปกระดูกหมู / 猪骨汤底火锅」配图 |
| 照片 | 仅 3 张 → 补环境 / 招牌菜 / buffet 台，定期月更 |
| 评价 | 近半年无新评 → 到店桌牌引导扫码评价 + 回复全部历史评价（含 1 条差评专业回应）|
| 帖子 | 无 → 每周发：buffet 限时价 / 新汤底，带「ดูเส้นทาง 路线」「โทรเลย 来电」CTA |
| 预订链接 | 无 → 接订位链接 + LINE MAN 订餐（标注外卖归因缺口）|

**本月必做（高 ROI 先做）**：① verify（解锁一切）② 改主类目 ร้านสุกี้（直接吃「附近火锅」本地词）③ 传菜单 + 招牌菜照片（提升点击与到店决策）。评价靠到店引导慢积累，列为持续项。

**决策点**：verify 与改类目是「解锁型」动作（不做则 PMax 门店目标 / location extension 拿不到准确数据，付费打折扣），必须排在任何付费扩量之前（playbook §3）。

## 交付前自检清单

- [ ] verified 已确认 / 已安排（否则方案不可执行）
- [ ] 主类目精确（非泛 Restaurant），次类目补齐
- [ ] NAP 跨官网 / 外卖 / 社媒一致
- [ ] 菜单（含价）+ 招牌菜照片 + 餐饮属性齐
- [ ] 评价回复 100% + 获取机制 + 帖子节奏（带本地 CTA）
- [ ] 与 location extension / PMax 门店目标的联动已说明
- [ ] 优先级按 ROI / 成本排序，标「解锁型」动作先做

## 边界

GBP 排名受相关性 / 距离 / 知名度多因子影响，不保证 local pack 排名；真实 GBP API 是 Phase 2（`knowledge/integrations.md`），密钥不进 descriptor/DB/日志；内容 / 促销以官方 GBP 与本地法规为准。
