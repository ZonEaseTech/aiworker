---
name: backlog-prioritization
description: 用 ttpos-bot 真实 sprint 评分（urgency+estimateFit+age）+ 容量调度 + 超期阈值给一批 TTPOS 候选需求排期，产出含算式与取舍的 Sprint 优先级表，而非泛 RICE。
---

# Backlog 排期（TTPOS Sprint 评分 + 超期阈值）
## 输出纪律

回答从结果开始：先给结论、交付物、必要假设或需要用户补充的关键信息，再给细节。可以在内部读取 AGENTS、knowledge、templates 或 MCP 配置，但不要把内部过程写成用户可见开场。不要以“使用 `skill` / 我会按 / 我会先 / 我先读取 / 已确认”开头；除非用户明确要求解释过程或需要说明阻塞原因，否则不叙述工具调用和资产读取过程。


## 产出物

一张《Sprint 优先级评分表》（对齐 `templates/sprint-priority-table.md`）：每个候选算出 `sprintCandidateScore`、按容量定 `sprint_candidate` / `sprint_risk`、列超期清理动作 + 显式取舍。**用 ttpos-bot 真实公式，不是 RICE 直接拍。**

## 前置输入

- 一批 GitHub Project 候选（≥3 个）的：Status、Priority（P0–P3）、SP、createdAt（→ age）、是否在当前 sprint。
- 当前 sprint 容量与已排 SP（`sprint_progress` / `query_board` 可查）。

## 引用资产

- 方法论：`knowledge/product-playbook.md` §3（评分公式 §3.1、容量 §3.2、RICE 仅定 Priority §3.3、超期阈值 §3.4）。
- 口径：`knowledge/benchmarks.md` §1（RICE→Priority）+ §2（sprint 评分确定值）。
- 骨架：`templates/sprint-priority-table.md`。

## 步骤

1. **定 Priority（RICE/Kano 仅在此用）**：用 RICE/Kano 判断每项该是 P0/P1/P2/P3，写入 GitHub Priority 字段 → priorityRank。
2. **筛候选**：只有 status=Todo、Priority≤P1、SP>0、不在当前 sprint、未被 readiness 阻塞的进 sprint 评分。**P2/P3 不进评分**（只走超期扫描）。无 SP 的高优先标 `needs_estimate`。
3. **算 score**：`urgency=max(0,4−priorityRank)×100`，`estimateFit=max(0,13−SP)×3`，`age=min(30,天数)`，三者相加。
4. **容量调度**：按 score 降序逐个尝试，剩余 = 容量−已排。SP≤剩余 → `sprint_candidate`（需人工批准）；SP>剩余 → `sprint_risk`（PM 决策）。
5. **超期清理**：列 triage_stale / in_progress_stale / review_stale / high_priority_waiting / needs_estimate 命中项 + 动作。
6. **取舍结论**：本 sprint 纳入哪些、谁下沉、战略/平台需求走单独通道。

## 填好的范例（TTPOS · 某 sprint 候选排期）

> 背景：当前 sprint 容量 **40 SP**，已排 22 SP → **剩余 18 SP**。下列候选已估点、在 GitHub Project Todo。priorityRank：P0→0、P1→1、P2→2。
> RICE 已用于定 Priority（如「自助餐漏算人头=直接少收钱」→ Impact 高 + 头部自助餐店 Reach → 提到 P0）。

| # | issue | Priority | SP | age(天) | urgency | estimateFit | age 分 | **score** | 容量判定 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 自助餐按成人/儿童人数起单并自动算价 | P0 | 8 | 12 | 400 | 15 | 12 | **427** | sprint_candidate |
| 2 | 外卖聚合对账(Grab/LINE MAN)差异自动标记 | P1 | 5 | 25 | 300 | 24 | 25 | **349** | sprint_candidate |
| 3 | 会员积分跨店通兑 | P1 | 3 | 6 | 300 | 30 | 6 | **336** | sprint_candidate |
| 4 | 桌台地图拖拽布局编辑 | P1 | 13 | 20 | 300 | 0 | 20 | **320** | **sprint_risk** |
| — | KDS 出品超时告警 | **P2** | 2 | 30 | — | — | — | **不进评分** | 仅走超期扫描 |

**算式逐项**（验证）：
- #1 自助餐：urgency=(4−0)×100=400；estimateFit=(13−8)×3=15；age=min(30,12)=12 → **427**。
- #4 桌台地图：urgency=(4−1)×100=300；estimateFit=(13−13)×3=**0**（SP=13 卡到 estimateFit 归零，这是公式对大块需求的内建惩罚）；age=20 → **320**。

**容量调度**（按 score 降序，剩余从 18 起）：
- #1（427, SP8）：8≤18 → `sprint_candidate`，剩余 18−8=**10**。
- #2（349, SP5）：5≤10 → `sprint_candidate`，剩余 10−5=**5**。
- #3（336, SP3）：3≤5 → `sprint_candidate`，剩余 5−3=**2**。
- #4（320, SP13）：13>剩余 2 → **`sprint_risk`**（高优但放不下）。

**硬骨头决策（#4 桌台地图 sprint_risk）**：score 不低但 13 SP 放不下剩余 2 SP。PM 三选一并显式记录：(a) **拆分**——把「拖拽布局编辑器」与「门店端只读渲染地图」拆成两个 issue（编辑器 8 SP / 渲染 5 SP），渲染先进本 sprint；(b) 延到下 sprint 首位；(c) 换 scope，把 #3（3 SP）下沉为它腾容量。**不可硬塞超容量**。建议 (a)：拆分后渲染部分（5 SP）刚好不行（剩余 2），故下 sprint 优先；本 sprint 维持 #1#2#3。

**超期清理（同批扫描命中）**：
| kind | issue | 动作 |
| --- | --- | --- |
| review_stale | #某 PR 在 In Review 2 天 | 催 reviewer，>1 天阈值已破，高 severity |
| needs_estimate | 「会员储值到期提醒」(feature, 无 SP) | 找研发要 SP/confidence，否则不进评分 |
| high_priority_waiting | #某 P1 Todo 未估点未进 sprint | 先 needs_estimate 再排 |

**结论**：本 sprint 纳入 #1 #2 #3（共 16 SP，剩余 2 SP）；#4 桌台地图拆分后下 sprint 优先；KDS（P2）不进本轮，留超期扫描观察。`sprint_candidate` 写入 GitHub Project Iteration 字段前**必须人工批准**。

## 自检清单

- [ ] Priority 用 RICE/Kano 定，且 score 用 §3.1 公式**逐项算对**（urgency/estimateFit/age 可复核）。
- [ ] 只把 Priority≤P1 + 有 SP 的候选纳入评分；P2/P3、无 SP 项正确排除并给去向。
- [ ] 容量调度按 score 降序、剩余正确递减；放不下的标 `sprint_risk` 不硬塞。
- [ ] `sprint_risk` 给了显式决策（拆分/延期/换 scope），不是放着不管。
- [ ] 列了超期清理动作（review>1 / in_progress>3 / triage>2(低优>7)）。
- [ ] 注明 `sprint_candidate` 需人工批准才写 Project 字段。

## 边界

- score 是排序与容量输入，不是排期承诺；最终需走 ttpos-bot 与研发对齐 SP。
- SP 由研发估，PM 不替工程估点；拿不到数据标假设。
- 战略/平台/合规型大投入低 Reach 需求走单独通道（人工提 P 或独立 Epic），不被评分系统性低估。
