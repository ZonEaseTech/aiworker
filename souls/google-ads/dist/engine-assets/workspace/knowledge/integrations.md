# 工具集成蓝图（Phase 2，占位）

> **v1 范围声明**：本 Soul 是 descriptor-only 的知识资产束，**v1 不实现任何 live 工具 / API 调用**。本文是 Phase 2 的设计蓝图，不在 v1 运行热路径上。
> **密钥红线**：以下任何工具的真实凭据（OAuth client secret / refresh token / developer token / API key / service-account JSON）**永不进入 descriptor、数据库、receipt、日志、诊断输出、OpenAPI 示例或 UI**。Phase 2 接入时凭据由作者自有的 native MCP 配置文件持有，AIWorker 只消费规范化事件，绝不复制密钥。

---

## Phase 2 可接入工具（本地餐饮代运营）

| 工具 | 能做什么 | 需要的授权 / 密钥（作者自管，不进 descriptor） | 接入形态 |
| --- | --- | --- | --- |
| **Google Ads API** | 读账户结构 / 本地搜索词报告 / 到店 / 来电 / 路线指标；（受限）变更出价、否定词、RSA、地理定向；拉 IS / Ad Strength | OAuth2（client id/secret + refresh token）+ developer token + login-customer-id（MCC）| 原生 MCP（作者本地 config，密钥本地持有）|
| **Google Business Profile API** | 读 / 校验 GBP 资料（类目 / NAP / 营业时间 / 属性 / 菜单 / 照片）、评价与帖子、本地排名相关信号；批量管理多客户门店 | OAuth2（GBP scope）+ account/location id | 原生 MCP |
| **GA4 Data API** | 拉网站订位 / 在线订餐转化、漏斗、来源，做基准对照与复盘 | OAuth2 或 service account（property 级权限）| 原生 MCP |
| **Google Maps / Places API** | 校验门店信息、商圈竞争、距离 / 半径数据（辅助本地定向）| API key（Maps Platform）| 原生 MCP（只读）|
| **Merchant Center / Content API**（外卖 / 在线订餐有商品 feed 时）| 读 / 校验订餐商品 feed、disapproval、属性完整度 | OAuth2 + merchant id | 原生 MCP |
| **Keyword Planner（含于 Google Ads API）** | 本地词建议、月搜量、竞争度、预估 CPC（按地区）| 同 Google Ads API | 原生 MCP |

> **注**：外卖第三方平台（LINE MAN / Grab / foodpanda）的订单数据在各自封闭平台，**通常无公开 Google Ads 归因 API**——Phase 2 也只能做平台后台数据的人工 / 半自动交叉，不可声称端到端归因（见 playbook §6）。

## 接入约束（Phase 2）

1. **原生 MCP 形式**：所有 live 能力以原生 MCP server 接入（codex / claude-code 各自 config），凭据写在作者本地、AIWorker 不读 Soul 私有模块、不解释域字段。
2. **只读优先**：Phase 2 先开只读（拉数据做诊断 / 复盘），写操作（改出价 / 加否定词 / 发布 RSA / 改 GBP）需显式审批，走 native engine 的 approval。
3. **多客户隔离**：代运营经 MCC 管多客户，Phase 2 接入须按客户 customer-id / GBP location 隔离数据与操作，禁止跨客户串数据（见 playbook §8）。
4. **密钥隔离**：见顶部红线。descriptor 仍只含 `protocol / identity / engine` 资产束，无 api / capability。
5. **配额与合规**：Google Ads API 有 developer token 访问级别与日配额；GBP / GA4 / Maps / Content API 各有 quota；接入须遵守各 API ToS 与各市场数据合规（泰国 PDPA；面向 EU 食客叠加 Consent Mode v2，见 playbook §6）。

## v1 当前替代

v1 无 live 工具时，所有 skill 以「客户提供的导出数据 / GBP 截图 / Google Ads 报表 / POS 餐期数据 / 手填」为输入，产出 `templates/` 成品骨架填充结果与可执行优化清单；指标对照走 `benchmarks.md` 静态基准（Restaurants & Food 行 + 本地动作经验区间）。
