# 本地转化追踪方案（成品骨架）

> 填空即用。引用 `knowledge/local-restaurant-ads-playbook.md` §6（到店 / 来电 / 路线 / 订餐 + 归因硬骨头 + 泰国 PDPA）。**如实标注到店建模与外卖归因缺口，不夸大可追踪性。**

## 0. 上下文

- 客户 / 门店：____｜ 首要本地动作：____
- 客单价 AOV：____｜ 毛利率：____ → 单转化价值 = AOV × 毛利 = ____（喂出价用）

## 1. 转化动作清单与可追踪性

| 本地转化 | 是否启用 | 追法 | 可追踪性 | 有效口径 |
| --- | --- | --- | --- | --- |
| 来电 calls | __ | call ext / call-only / 号码点击 + call reporting | 高 | 通话 ≥ __ 秒才算 |
| 路线 directions | __ | GBP / location ext「获取路线」点击 | 高（互动/代理）| — |
| 网站订位 | __ | GA4 + Ads tag（订位完成）| 高 | 去重 |
| 在线订餐 | __ | GA4 + Ads tag（下单成功）| 高 | 传 value |
| 到店 store visits | __ | Google 建模（需 GBP 关联 + 阈值）| 中（建模）| 标「建模值」 |
| 外卖（第三方）| __ | 落地页跳转点击 + 平台后台交叉 | 低（归因缺口）| 标「前端代理，不可闭环」 |

## 2. 追踪基础设施

- [ ] GBP 与 Google Ads 账户关联（store visits / location ext 前提）
- [ ] GA4 已建 + 与 Ads 关联；转化事件：____
- [ ] Ads 转化动作建好；**去重**（GA4 导入 vs Ads 原生 tag 不双计）
- [ ] call reporting 开启 + 最短通话时长设定
- [ ] Enhanced Conversions（网站订位 / 订餐 / 来电匹配）：SHA-256 哈希第一方数据

## 3. 转化价值口径

- 到店 / 订位价值：____（AOV × 毛利，非固定值）
- 在线订餐：传**动态订单金额** value
- 盈亏平衡到店 / 订单成本上限：____（见 playbook §6）

## 4. 归因缺口披露（硬骨头，必填）

- store visits 是建模值，门店 / 数据量不够则无此指标：已告知客户 是 / 否
- 外卖经 LINE MAN / Grab 在 app 内完成，无法回传 Google Ads：用代理 = ____（落地页跳转点击）+ 平台后台月度交叉
- 代理指标三件套（到店意图近似）：路线点击 + 来电 + GBP 互动

## 5. 本地合规（泰国 PDPA）

- [ ] 落地页 PDPA 合规 cookie / consent 提示 + 隐私政策
- [ ] Enhanced Conversions 的 email/phone 收集有合法依据 / 告知
- [ ] （如面向 EU 食客）叠加 Consent Mode v2
- 合规以官方政策 + 本地法规为准，不替代法务

## 6. 验证

- [ ] Google Tag Assistant / 测试转化触发正常
- [ ] 来电 / 路线 / 订位各跑一次端到端验证
- [ ] 无双计；value 正确传入；建模 / 代理项已标注口径
