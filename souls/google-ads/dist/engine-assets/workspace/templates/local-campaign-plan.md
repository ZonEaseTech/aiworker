# 本地投放方案（成品骨架）

> 填空即用。引用 `knowledge/local-restaurant-ads-playbook.md` §2（渠道分工）/ §4（本地搜索 + 地理定向）/ §5（出价门槛）。本地餐饮颗粒度宜粗：一店一 PMax 门店目标 + 一组本地搜索。

## 0. 目标对齐（动结构前必填）

- 客户 / 门店：____（引用 client-brief）
- 首要本地动作：____（到店 / 来电 / 路线 / 订餐）｜ 主指标 / 目标值：____
- 月预算（总）：____｜ GBP verified：是 / 否（否则先做 gbp-optimization）
- 门店半径内近 30 天本地转化量：____（决定能否上自动出价 / PMax，见 §5）

## 1. Campaign 层（按门店 + 渠道拆，非按关键词颗粒）

| Campaign | 渠道 | 门店 / 半径 | 目标动作 | 出价策略 | 日预算 | 近30天本地转化 | 达门槛 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <店>-Search-Brand | 本地搜索 | 门店周边 | 来电/路线 | Manual/Max Clicks（保护位）| ___ | ___ | 是/否 |
| <店>-Search-Local | 本地搜索 | 半径 X km | 来电/路线/订餐 | Max Conversions（攒量）| ___ | ___ | 是/否 |
| <店>-PMax-Store | PMax 门店目标 | GBP 门店 | 到店/local actions | Max Clicks→tROAS | ___ | ___ | 是/否 |
| <店>-DemandGen-Awareness | Demand Gen | 商圈 | 认知/路线 | （认知，按需）| ___ | ___ | — |

## 2. Ad Group 层（本地搜索，单主题）

| Campaign | Ad Group | 意图 | 关键词示例（含泰语）| 匹配类型 | 关联 |
| --- | --- | --- | --- | --- | --- |
| <店>-Search-Local | Cuisine-NearMe | 附近 + 菜系 | ร้านสุกี้ใกล้ฉัน / hot pot near me | 词组+精确 | location ext（GBP）|
| <店>-Search-Local | Cuisine-Area | 菜系 + 地点 | สุกี้ สุขุมวิท / 泰式火锅 素坤逸 | 词组 | call ext |
| <店>-Search-Local | Buffet-Scenario | 场景 / 餐期 | บุฟเฟ่ต์ สุกี้ / 家庭聚餐火锅 | 广泛+智能出价+强否定 | sitelink（菜单/订位）|

## 3. 地理定向（本地命脉）

- 半径 / 商圈：____（按业态：咖啡步行圈 / 火锅驾车圈）
- 定位选项：**presence（人在该地）**，非 presence or interest
- 排除区域：____（跨城 / 配送范围外）

## 4. 否定词体系

- 账户级：招聘 / 加盟 / 菜谱 / 批发 / 招工 / รับสมัครงาน / สูตรอาหาร
- campaign 级：____（排跨城地点 / 只做堂食则排外卖词）
- PMax campaign-level negatives：____（排品牌 / 已被本地搜索覆盖词，处理 cannibalization）

## 5. cannibalization 处理（PMax vs 本地搜索 / 品牌）

- 品牌 / 核心本地词归独立本地搜索 campaign（exact/phrase）
- PMax 开 brand exclusions + campaign-level negatives
- 复盘区分增量到店 vs PMax「抢功」

## 6. 决策记录（取舍）

- 为何先本地搜索 / 后 PMax：____（转化量 <20–30，先攒，见 §5）
- 出价为何用攒量策略：____（本地小店转化稀薄）
- 地理半径取舍：____（业态决定步行 vs 驾车圈）
