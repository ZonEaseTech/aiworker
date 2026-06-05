# 工作流与工具集成（现状 + Phase 2 蓝图）

> **状态：本节分两部分。**
> - **§1 现有工作流（现状）**：TTPOS 今天真实在用的 GitHub + ttpos-bot 协作流，PM soul 必须套这套，不另造系统。这是「PM 在哪里干活」的描述，**不是 v1 要在热路径上连的工具**。
> - **§2 Phase 2 集成蓝图**：未来若把 PM 产出自动落地到这些工具，会怎么接。v1 不实现。
> v1 产品经理 Soul 是 **descriptor-only**：只提供方法论（`knowledge/`）、成品骨架（`templates/`）、工作流（`skills/`），不连接任何真实 API / 密钥。

## 安全边界（强约束，任何阶段都成立）
- **密钥绝不进 descriptor、DB、receipt、日志、诊断输出、OpenAPI 示例或 UI。**
- 支付商户号、EDC 密钥、shop 库连接串、Lark/GitHub token、商户 PII（店名/手机/会员信息）**绝不写入任何资产、范例或 issue**。
- Phase 2 工具集成走原生引擎自管的 MCP（author-owned native MCP 文件），密钥只存在于作者自管的本地配置中，AIWorker 不复制、不投影、不落库。
- v1 的 `mcp/` 目录仅为占位，不含任何真实凭证。

---

## §1 现有工作流（TTPOS 现状，PM 必须套）

### 1.1 协作三件套
- **飞书 Lark**：需求接入、对内同步、评审讨论。
- **GitHub Issues + GitHub Project**：所有缺陷 / 需求 / Epic 的**唯一工单载体**。issue 进 Project，有 Status / Priority / SP / Iteration 等字段。
- **ttpos-bot**：自动化协作机器人，对 GitHub 工单跑质量门 + PM 扫描 + sprint 评分。角色 `super_admin|admin|customer_service|pm|developer|member`（PM = `pm`）。

### 1.2 ttpos-bot 与 PM 相关的能力（现状，非 v1 接入）
| 能力 | 说明 | 对应 playbook |
| --- | --- | --- |
| 工单质量门 | 对每条 issue 评 5 维（title_specificity/narrative_completeness/verifiable_items/code_locality/context_links），4 维 gating 满分 8；阈值 `ISSUE_QUALITY_THRESHOLD_{BUG\|FEATURE\|EPIC}` | §2.5 |
| PM 超期扫描 | 每日扫 Project，产出 triage_stale / in_progress_stale / review_stale / unassigned_work / high_priority_waiting / needs_estimate / sprint_candidate / sprint_risk | §3.4 |
| sprint 候选评分 | `urgency+estimateFit+age`，容量默认 40 SP | §3.1 |

### 1.3 ttpos-bot MCP 工具面（PM 在 ttpos-bot 里实际可用的工具，现状）
> 来源：`ttpos-bot/packages/mcp-tools/src/tools/`。这是 ttpos-bot 自己的 MCP，**不是本 soul v1 要连的**；列出是为了让 PM 知道现有流程里有哪些动作可走。

- `draft_issue` / `create_issue`：起草 / 创建 GitHub issue（draft 会先过质量门评分给反馈）。
- `update_issue` / `comment_issue`：更新字段 / 评论。
- `query_board` / `query_issue` / `find_similar_issues`：查 Project 看板 / 单 issue / 相似 issue（补 context_links）。
- `sprint_progress`：查当前 sprint 进度 / 容量。
- `pm_action`：拉 PM 超期扫描产出的待办动作。
- `experience` / `memory`：经验值体系 / 团队记忆（团队 20 级体系，非 PM 热路径）。

> PM 用法：写需求 → `draft_issue` 看质量门反馈补到过门 → `create_issue`；排期 → `query_board` + `sprint_progress` 看容量 → 用 §3.1 公式排候选 → 决策 `sprint_risk` / 批准 `sprint_candidate`（人工批准才写 Project 字段）；每日 `pm_action` 清超期。

---

## §2 Phase 2 集成蓝图（v1 不实现）

### 2.1 GitHub + ttpos-bot 直连
把 `prd-writer` / `backlog-prioritization` 产出**直接落成 GitHub issue/Epic**（经 ttpos-bot draft→质量门→create），并读 `query_board`/`sprint_progress`/`pm_action` 把 backlog 实况喂回 skills。
接入形态：MCP 工具做「draft/create/update issue」「读 board/sprint/pm_action」，写操作（尤其改 Project 字段、加入 sprint）须**二次确认 + 人工批准**；PM 仍对优先级与范围负责。

### 2.2 经营数据 / 报表
- **ttpos-report（只读 SQL）/ 自建 OLAP**：按 §5 表 lineage 拉客单价/翻台/退单/出品时长/外卖占比/会员，喂 `metrics-framework` / `experiment-design` 做实测，替换 `benchmarks.md` 里的「待核实」区间为门店真实值。
接入形态：MCP 暴露**只读查询**工具（严守「仅 SELECT」），多租户按 company_uuid 隔离；PM 仍按 `knowledge/` 判据解读，不让工具替代判断。

### 2.3 文档协作
- **飞书文档**：把 PRD、实验方案、复盘同步成团队可协作文档，评审意见回流。
接入形态：MCP 做「发布/更新文档」，模板仍来自 `templates/`，保证结构一致。

## §3 v1 与 Phase 2 的关系
| 维度 | v1（当前） | Phase 2（蓝图） |
| --- | --- | --- |
| 工单 | 产出过质量门的 Markdown issue/PRD，人工录入 GitHub | MCP 经 ttpos-bot draft→create 直连 |
| 排期 | 用 §3.1 公式手算 sprint 评分 | MCP 读 board/sprint 实况 + 写 Project 字段（人工批准） |
| 数据 | 用户口述/粘贴，标事实/假设 | ttpos-report/OLAP 只读查询，按 company_uuid 隔离 |
| 密钥 | 无 | author-owned native MCP，绝不进 descriptor/DB/日志 |

**结论**：v1 的价值在「方法论 + 判断力 + 过质量门/合 sprint 的可交付成品」，不依赖任何外部工具即可交活；Phase 2 把成品自动落地 + 用真实经营数据替换假设，但判断逻辑始终留在 `knowledge/` 与 skills 中。
