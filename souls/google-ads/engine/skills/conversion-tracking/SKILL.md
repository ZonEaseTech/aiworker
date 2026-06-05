---
name: conversion-tracking
description: 出本地转化追踪方案——到店/来电/路线/订餐转化动作与价值、GBP 关联、GA4 + Ads、Enhanced Conversions、归因缺口披露与泰国 PDPA，产出可填的本地转化追踪清单。
---

# 本地转化追踪方案（到店 / 来电 / 路线 / 订餐）

**产出物**：一份填好的本地转化追踪方案，符合 `templates/conversion-tracking-checklist.md`。

## 前置：必须先确认的输入

- 首要本地动作（到店 / 来电 / 路线 / 订位 / 在线订餐 / 外卖）
- 客单价 AOV + 毛利（算转化价值）
- GBP 是否与 Ads 关联、是否有自有网站 / 订位 / 订餐页、外卖平台

## knowledge / templates 引用

- 方法论：`knowledge/local-restaurant-ads-playbook.md` §6（本地转化类型 + 可追踪性 + 到店建模 / 外卖归因硬骨头 + 泰国 PDPA）
- 骨架：`templates/conversion-tracking-checklist.md`
- 价值口径：§1（盈亏平衡反推）

## 步骤（端到端）

1. **定义转化动作**：按首要本地动作选（来电 / 路线 / 订位 / 订餐 / 到店）。
2. **可追踪性分级**：来电 / 路线 / 网站订位 = 高；到店 = 中（建模）；外卖第三方 = 低（缺口）。
3. **基础设施**：GBP↔Ads 关联、GA4↔Ads、call reporting、Enhanced Conversions、**去重**。
4. **价值口径**：到店 / 订单价值 = AOV × 毛利（动态，非固定）。
5. **归因缺口披露**：到店建模、外卖第三方不可闭环，用代理三件套（路线 + 来电 + GBP 互动）。
6. **PDPA 合规**：落地页 consent / 隐私政策。
7. **验证**：端到端各跑一次。

## 填好的范例（曼谷泰式火锅店转化追踪）

**门店**：สุกี้บ้านเรา，AOV ฿550 × 毛利 60% = **单到店价值 ฿330**；目标到店 + 来电 + 订位；有简易订位页、外卖接 LINE MAN。

| 本地转化 | 启用 | 追法 | 可追踪性 | 有效口径 |
| --- | --- | --- | --- | --- |
| 来电 | ✓ | call ext + Google call reporting | 高 | 通话 ≥ 30 秒才算（过滤误拨）|
| 路线 | ✓ | GBP / location ext「获取路线」点击 | 高（代理）| 到店意图近似 |
| 网站订位 | ✓ | GA4 + Ads tag（订位完成）+ Enhanced Conv | 高 | 去重、传 ฿330 |
| 到店 store visits | ✓（若达阈值）| Google 建模（GBP 关联）| 中（建模）| 标「建模值」|
| 外卖 LINE MAN | 代理 | 落地页跳 LINE MAN 点击 + 平台后台月度交叉 | 低（缺口）| 标「前端代理，不可闭环」|

**基础设施**：GBP↔Ads 已关联（store visits + location ext 前提）；GA4 建「订位完成」事件并导入 Ads，**与 Ads 原生 tag 去重**（择一计）；call reporting 开 + 最短 30 秒；Enhanced Conversions 在订位 / 来电匹配。

**价值与缺口**：订位 / 到店传 ฿330；盈亏平衡到店成本上限 ฿330（超则收半径 / 降目标）。**向客户书面披露**：到店为 Google 建模值（量不够则无此指标）；LINE MAN 外卖在其 app 内完成、Google Ads 看不到，只能用「落地页跳转点击 + LINE MAN 后台订单」人工月度交叉，**不可声称端到端归因**。

**PDPA**：订位页加 PDPA 合规 cookie/consent + 隐私政策（Enhanced Conversions 收 email/phone 须告知 / 合法依据）。

**决策点**：店太小、近 30 天点击 / 数据不足 → **可能没有 store visits 建模指标** → 复盘主用代理三件套（路线 + 来电 + GBP 互动）作到店近似，并明确告知客户「到店为估算，非精确归因」（playbook §6）。来电设 30 秒门槛避免误拨灌水虚高转化。

## 交付前自检清单

- [ ] 每个本地转化标可追踪性（高 / 中建模 / 低缺口）
- [ ] GBP↔Ads + GA4↔Ads 关联；转化去重（不双计）
- [ ] call reporting 设最短通话时长
- [ ] 转化价值 = AOV × 毛利（动态），盈亏平衡成本上限已算
- [ ] 到店建模 + 外卖归因缺口**书面披露**给客户
- [ ] 代理三件套（路线 + 来电 + GBP 互动）已定义
- [ ] 泰国 PDPA consent / 隐私政策落地
- [ ] 端到端各跑一次验证

## 边界

不保证转化量 / ROI；store visits 为建模值、外卖不可闭环归因，绝不夸大；真实 API 接入是 Phase 2（`knowledge/integrations.md`），密钥不进 descriptor/DB/日志；数据合规以泰国 PDPA + 各市场本地法规与官方政策为准，不替代法务。
