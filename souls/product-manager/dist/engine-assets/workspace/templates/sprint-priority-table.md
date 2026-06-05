# Sprint 优先级评分表（ttpos-bot 真实公式）

> 排期 = ttpos-bot `sprintCandidateScore`，**不是 RICE 直接拍**。公式与容量见 `knowledge/product-playbook.md` §3。
> RICE/Kano 只用来定 Priority 字段（见 `knowledge/benchmarks.md` §1），Priority → priorityRank → urgency。

## 评分公式（来自 `pm/actions.ts`）
```
sprintCandidateScore = urgency + estimateFit + age
  urgency     = max(0, 4 − priorityRank) × 100   # P0→400 P1→300 P2→200 P3→100 未知→0
  estimateFit = max(0, 13 − SP) × 3              # SP=1→36 SP=5→24 SP=8→15 SP≥13→0
  age         = min(30, daysSince(createdAt))    # 封顶 30
```
进评分的候选条件：status=Todo、Priority≤P1、SP>0、不在当前 sprint、未被 readiness 阻塞。

## 候选评分表
**当前 sprint 容量**：<默认 40> SP　**已排**：<…> SP　**剩余**：<容量−已排> SP

| # | issue | Priority | priorityRank | SP | age(天) | urgency | estimateFit | age 分 | **score** | 容量判定 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | #<号> <标题> | P_ | _ | _ | _ | _ | _ | _ | **_** | sprint_candidate / sprint_risk |
| 2 | | | | | | | | | | |
| 3 | | | | | | | | | | |

> 按 score 降序逐个尝试：SP≤剩余 → `sprint_candidate`（需人工批准才写 Project）；SP>剩余 → `sprint_risk`（PM 决策：延期/换 scope/加容量）。

## 超期清理（来自 `pm/actions.ts` 阈值，每日扫描）
| kind | 条件 | 命中 issue | 决策 |
| --- | --- | --- | --- |
| triage_stale | Triage 高优>2天 / 低优>7天 | #… | … |
| in_progress_stale | In Progress>3天 | #… | … |
| review_stale | In Review>1天 | #… | … |
| high_priority_waiting | ≤P1 Todo 未进 sprint 未估点 | #… | … |
| needs_estimate | feature/epic 无 SP | #… | … |

## 显式取舍
- **未进 sprint 的高优**：<#… 为何 sprint_risk / 决策>。
- **单独通道（不被评分系统性低估）**：战略/平台/合规型大投入低 Reach 需求 <…>，人工提 P 或独立 Epic。
- **结论**：本 sprint 纳入 <#…>；下沉 <#…>，待 <条件> 重评。
