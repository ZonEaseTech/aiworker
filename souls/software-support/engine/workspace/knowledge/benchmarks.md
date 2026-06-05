# SaaS 支持基准数据（benchmarks）— 行业口径，TTPOS 落地校准

> 引擎参考。**每条数字标来源 URL 或「待核实」**；检索日期 2026-06-04。
> 这些是**行业 SaaS 支持基准**（CSAT/CES/FCR/MTTR/SLA），用于给 TTPOS 客服设目标的参照。**TTPOS 专属基准（餐饮 POS、泰国/中国/日本市场）暂无实测，均标「待核实/按自身趋势」**，不可把行业区间当 TTPOS KPI 直接下达。
> 数字纪律：SaaS 专属 FCR/CES 分位「待核实」；SLA 分钟数为**通行区间口径**，TTPOS 无官方合同，落地按合同校准。
> SLA/升级矩阵的**唯一权威表**见 `templates/sla-matrix.md`（本文与其分钟数必须逐字一致）。

---

## 1. 体验指标基准（CSAT / CES / FCR，行业 SaaS）

| 指标 | 参考值 / 区间 | 口径说明 | 来源（检索 2026-06-04） |
| --- | --- | --- | --- |
| CSAT（SaaS 平均） | 约 78% | 领先公司 85–90%；竞争目标 80+、优秀 85+ | fullview.io/blog/csat-benchmarks-by-industry ; Freshworks 2025 基准报告 PDF |
| CSAT（B2B SaaS 平均） | 约 68% | 企业客户 72–75% > SMB 60–65% | ltvplus.com/customer-service/saas-cx-metrics/ |
| CSAT × 首响 | 1h 内→86；24–48h→72 | 首响越快 CSAT 越高 | Freshworks 2025 基准报告 PDF ; ltvplus.com |
| CES | 比 CSAT 预测忠诚度强约 1.8x | 高费力 96% 转不忠诚；低费力 94% 更忠诚 | armatis.com/.../nps-ces-csat（CEB/Gartner「Effortless Experience」业界广引，原文待核实） |
| CES（SaaS 分位/量表分布） | **待核实** | 搜索未给 SaaS 专属基准 | — |
| FCR（eCommerce/通用参考） | 约 70%，头部至 80% | 与 CSAT 相关性最高，FCR↑带动 CSAT↑ | sqmgroup.com/.../fcr-customer-satisfaction-comparison ; fullview.io/blog/customer-support-metrics |
| FCR（SaaS 专属 / TTPOS 专属） | **待核实** | 仅有 eCommerce/通用区间；TTPOS 餐饮 POS 无实测 | — |

> 来源 URL（完整）：
> - https://www.fullview.io/blog/csat-benchmarks-by-industry
> - https://www.ltvplus.com/customer-service/saas-cx-metrics/
> - https://company-assets.freshworks.com/marketing/freshdesk/Customer-Service-Benchmark-Report-2025.pdf
> - https://www.armatis.com/en/2025/09/26/nps-ces-csat-which-customer-experience-metrics-should-you-choose/
> - https://www.sqmgroup.com/resources/library/blog/fcr-customer-satisfaction-comparison-industry-and-call-reason
> - https://www.fullview.io/blog/customer-support-metrics

---

## 2. 事故恢复指标（MTTR / MTTA / MTBF / MTTF，Atlassian 通用口径）

| 指标 | 定义 | 公式 | 「好」阈值 |
| --- | --- | --- | --- |
| MTTR | 故障后系统恢复平均时长（可指 repair/respond/resolve/recovery，团队需自定口径） | 总停机时长 ÷ 事故数 | **无单一标准/因系统而异**；对比自身 30 天滚动窗口趋势 |
| MTTA | 告警触发到开始处理的平均时长 | 确认总时长 ÷ 事故数 | 越低越好；衡量响应度 |
| MTBF | 相邻故障间平均运行时长（可靠性） | 总正常运行时长 ÷ 故障数 | 越高越好 |
| MTTF | 不可修复件平均寿命 | — | 越高越好 |

> 来源：
> - https://www.atlassian.com/incident-management/kpis/common-metrics （Atlassian 一手定义）
> - https://betterstack.com/community/guides/incident-management/mttr-and-other-incident-metrics/

---

## 3. SLA 分级口径（与 `templates/sla-matrix.md` 逐字一致）

本 soul 采用**单一 SLA 矩阵**（综合 MSP/ITSM 通行范式凝练，按 P0–P3）。**TTPOS 暂无官方 SLA 合同：分钟数为通行区间口径，需按合同/产品 SLA 校准**：

| 级别 | 判定 | 首响（工作时间 / 非工作时间） | 解决目标 | 时钟排班 |
| --- | --- | --- | --- | --- |
| P0 | 核心交易链路阻断 / 大面积不可用 / 资金风险，无绕过 | 15 分钟 / 30 分钟 | 持续处理至恢复 | 24×7（不停） |
| P1 | 严重影响主流程，无绕过，影响面有限 | 1 小时 / 2 小时 | 当日 | 24×7 |
| P2 | 一般问题，有绕过或非核心 | 4 工作小时 | 下一工作日 | 8×5 |
| P3 | 轻微 / 体验 / 单点低影响 | 1 工作日 | 排期 | 8×5 |

> Response SLA 在工单分配到组时触发、开始处理时停止；Resolution SLA 在创建时触发、Resolved 时停止。
> **TTPOS 跨时区**：按门店当地营业时段评估紧急度与时钟（playbook §2.2）。
> 来源（SLA 范式 / 起止口径 / 排班）：
> - https://serenitllc.com/blog/msp-sla-guide
> - https://www.freshworks.com/itsm/sla/response-time/
> - https://rootly.com/incident-response/support-levels
> - https://www.atlassian.com/incident-management/kpis/severity-levels

---

## 4. 升级 / 团队结构参考

| 项 | 参考值 | 来源 |
| --- | --- | --- |
| L1 一线承接来单比例 | 约 70–80% | supportyourapp.com/blog/tiered-support/ ; atlassystems.com/blog/l1-l2-l3-support |

> TTPOS 注：L3 = 研发，承接的是**过质量门的 GitHub issue**（playbook §3.1 / §7）。

---

## 5. 事故沟通节奏参考

| 项 | 参考口径 | 来源 |
| --- | --- | --- |
| Statuspage 更新节奏 | 约每 30 分钟（或视情况），直至恢复 | support.atlassian.com/statuspage/docs/incident-communication-tips/ |
| PagerDuty 首条 | 启动后 5 分钟内首条，再 5 分钟内补影响范围 | atlassian.com/incident-management/incident-communication ; incident.io/blog/incident-communication-best-practices |

> TTPOS 注：对商家用飞书 Lark 群/公告，节奏同上；涉支付首条须含「款项安全、逐笔核账」与绕过指引（playbook §5.3）。

---

## 6. 如何用基准诊断 TTPOS 支持健康度

1. **先比趋势再比绝对值**：MTTR/MTTA 无单一行业标准，看自身 30 天滚动窗口是否改善；TTPOS 专属无实测基准，只比自身趋势。
2. **CSAT 低先查首响**：首响 1h vs 24–48h 对应 CSAT 86 vs 72，首响常是 CSAT 的最大杠杆；餐饮商家在营业高峰对首响尤其敏感。
3. **FCR 与 CSAT 一起看**：二者相关性最高；FCR 下滑常预示 CSAT 下滑（但 SaaS/TTPOS 专属 FCR 基准待核实，只比自身趋势）。
4. **SLA 达成率分级看**：P0/P1（交易链路/资金类）的首响/解决达成率应接近 100%；P2/P3 容忍度更高。
5. **涉资金单独跟**：客人已扣款未记账的核账时长与退补完成率，是 TTPOS 特有的健康信号（行业基准无对应，自定口径跟趋势）。
6. **区间不是目标**：CSAT 78%/FCR 70–80% 是**行业参考区间**，不可当成 TTPOS KPI 直接下达——结合自身基线与产品复杂度设定。
