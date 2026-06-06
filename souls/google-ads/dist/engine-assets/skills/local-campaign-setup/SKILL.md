---
name: local-campaign-setup
description: 出本地投放方案——PMax 门店目标 + 本地搜索结构、地理半径定向、出价选型、否定词与 cannibalization 处理。
---

# 本地投放方案（PMax 门店目标 + 本地搜索）
## 输出纪律

回答从结果开始：先给结论、交付物、必要假设或需要用户补充的关键信息，再给细节。可以在内部读取 AGENTS、knowledge、templates 或 MCP 配置，但不要把内部过程写成用户可见开场。不要以“使用 `skill` / 我会按 / 我会先 / 我先读取 / 已确认”开头；除非用户明确要求解释过程或需要说明阻塞原因，否则不叙述工具调用和资产读取过程。


**产出物**：一份填好的本地投放方案，符合 `templates/local-campaign-plan.md`。

## 前置：必须先确认的输入

- GBP 已 verified（否则先 gbp-optimization）
- 首要本地动作 + 目标值、月预算
- 门店半径 / 商圈、近 30 天本地转化量（决定出价 / 是否上 PMax）
- 转化追踪是否就绪（否则先 conversion-tracking）

## knowledge / templates 引用

- 方法论：`knowledge/local-restaurant-ads-playbook.md` §2（渠道分工 + PMax vs 本地搜索决策树 + cannibalization）/ §4（本地搜索词 + 地理定向 + 否定词）/ §5（出价门槛）
- 骨架：`templates/local-campaign-plan.md`
- 基准：`knowledge/benchmarks.md`（Restaurants & Food，估点击 / 成本是否现实）

## 步骤（端到端）

1. **目标对齐**：本地动作 → 主指标 → 半径内近 30 天转化量是否够门槛。
2. **渠道分工**：按 §2 决策树——小店先本地搜索攒量，达量上 PMax 门店目标；品牌 / 核心本地词独立。
3. **campaign 拆分**：按门店 + 渠道（非关键词颗粒）；保证转化密度。
4. **本地搜索 ad group**：菜系×地点×意图分层，含泰语「附近」词。
5. **地理定向**：半径 / presence；排跨城。
6. **出价选型**：本地小店常 Max Conversions / Max Clicks 起步（§5）。
7. **否定词 + cannibalization**：账户 / campaign 级否定；PMax brand exclusions + campaign-level negatives。

## 填好的范例（曼谷泰式火锅店本地投放）

**门店**：สุกี้บ้านเรา（素坤逸），GBP 已 verified；月预算 ฿30,000；目标到店 + 来电 + 订位；半径内近 30 天本地转化 ~22（来电 + 路线 + 订位，**< 30 门槛**）。

| Campaign | 渠道 | 半径 | 目标动作 | 出价策略 | 日预算 | 近30天转化 | 达门槛 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suki-Search-Brand | 本地搜索 | 素坤逸+品牌 | 来电/路线 | Max Clicks（保护位）| ฿150 | 8 | 是（品牌）|
| Suki-Search-Local | 本地搜索 | 驾车 5 km | 来电/路线/订位 | **Max Conversions（攒量）** | ฿450 | 14 | 否（<30，先攒）|
| Suki-PMax-Store | PMax 门店目标 | GBP 门店 | 到店 | **暂缓**至本地搜索 ≥30/月 | — | — | 未达量 |

**本地搜索 ad group（Suki-Search-Local，STAG）**：
- `Suki-NearMe`（词组+精确）：**ร้านสุกี้ใกล้ฉัน**（附近的火锅店）、**สุกี้ใกล้ฉัน**、hot pot near me
- `Suki-Sukhumvit`（词组）：**สุกี้ สุขุมวิท**、泰式火锅 素坤逸、hot pot Sukhumvit
- `Buffet-Scenario`（广泛+智能出价+强否定）：**บุฟเฟ่ต์ สุกี้**（火锅自助）、ที่กินกับครอบครัว（家庭聚餐）

**地理定向**：驾车 5 km（火锅驾车圈）+ presence（人在该地，排游客泛兴趣误触）；排曼谷其他城区。
**否定词**：账户级 รับสมัครงาน（招聘）/ สูตร（菜谱）/ batch；campaign 级排只做堂食外的外送泛词若该月不主推外卖。

**决策点**：本地搜索 14 转化 < 30 门槛 → **不上 tCPA、不上 PMax 门店目标**，先 Max Conversions 攒到 ≥30/月再切（playbook §5）；PMax 暂缓避免黑盒喂不饱 + 抢品牌词虚高（cannibalization，§2）。品牌词独立 Brand campaign 保位，防 PMax / 竞品截。

## 交付前自检清单

- [ ] GBP verified（地基已稳）
- [ ] 渠道顺序符合 §2 决策树（<30 转化先本地搜索、缓 PMax）
- [ ] campaign 按门店 + 渠道拆，非关键词颗粒
- [ ] 本地搜索含泰语「附近 / 菜系 + 地点」词，分层 STAG
- [ ] 地理半径 + presence 定向，排跨城
- [ ] 出价门槛与转化量匹配，不达标用攒量策略
- [ ] 否定词 + PMax cannibalization（brand exclusions + campaign-level negatives）已处理

## 边界

不保证到店 / 排名 / ROI；出价门槛是 campaign 级近 30 天；store visits 为建模值；真实 API 是 Phase 2（`knowledge/integrations.md`），密钥不进 descriptor/DB/日志；合规以官方政策与本地法规为准。
