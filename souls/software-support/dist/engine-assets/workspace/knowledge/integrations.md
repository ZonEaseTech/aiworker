# TTPOS 工作流与工具集成（integrations）— 现状 + Phase 2 蓝图

> **现有协作工作流（飞书 Lark + GitHub Issues + ttpos-bot）是 TTPOS 的真实流程**；本 soul v1 产出**可直接贴入这些系统的文本成品**，但 v1（standalone Worker）**不接任何真实 API**、不执行 live 调用。
> 「Phase 2 蓝图」描述未来若以 MCP 接入会长什么样，供方法论引用，**不在 v1 运行热路径上**。

---

## 安全与边界（强约束，先读）

- **商户数据与密钥绝不进入** descriptor、DB、receipt、日志、诊断输出、OpenAPI 示例或 UI。
- 真实工单内容、商户 PII（店名/老板手机/账号/会员信息）、支付商户号 / 支付密钥 / EDC 密钥 / shop 库连接串 / Lark/GitHub token **不得**写入本 soul 的任何资产、范例或 KB。本 soul 所有范例均**脱敏**（用 `company_uuid=<REDACTED>`、`txn=[REDACTED]`、`tok_REDACTED` 等占位）。
- 作者自管的原生 MCP 文件**可**含真实密钥，但 AIWorker **不得**把密钥复制进 descriptor/DB/receipt/log/诊断/OpenAPI 示例/UI。
- 监控/状态信号只读公开聚合，不回传任何商户明文数据。

---

## 现有协作工作流（TTPOS 真实流程，v1 产出贴入即用）

### 1. 飞书 Lark（接入与沟通）
- **现状**：商家问题接入、客服/PM/研发对内同步、事故沟通频道都在 Lark。
- **v1 产出**：`incident-comms` 的对内同步块、对商家公告，`csat-followup` 话术，直接贴入 Lark 群/公告。

### 2. GitHub Issues + ttpos-bot（工单与质量门）
- **现状**：所有缺陷/需求/升级的唯一工单载体是 GitHub Issues，进 ttpos-bot 的 Project#1。ttpos-bot 对每条 issue 跑 **5 维质量门**（`title_specificity / narrative_completeness / verifiable_items / code_locality / context_links`，4 维 gating 满分 8，`code_locality` 仅咨询）。角色体系 `super_admin|admin|customer_service|pm|developer|member`。
- **v1 产出**：`ticket-triage` 的升级单 = 直接可粘贴成 GitHub issue 正文，**按 §7 质量门写、能过门**（骨架 `templates/escalation-ticket.md`）。
- **现状补位**：TTPOS 无独立 CSR 系统（ttpos-csr 空仓），本 soul 正是补这块的客服方法论与成品。

---

## Phase 2 集成蓝图（按类，v1 不实现）

### A. 飞书 Lark（MCP）
- **接入形态**：MCP 暴露 `post_to_channel`（事故对内同步频道）、`create_incident_thread`、`post_merchant_notice`（草稿）。
- **价值**：事故对内同步（§5.4）自动发 incident 频道；对商家公告走草稿+人审。
- **边界**：对商家发布必须人审；不自动外发。

### B. GitHub + ttpos-bot（MCP）
- **接入形态**：MCP 暴露 `create_issue / draft_issue / query_board`（参考 ttpos-bot 现有 MCP 工具命名）；`draft_issue` 先过质量门评分再建。
- **价值**：`ticket-triage` 的升级单可直接建成 GitHub issue 并预跑质量门，低分先补再提交。
- **边界**：建 issue/写操作需人确认；issue 正文出 MCP 边界前脱敏；凭据走作者 MCP 配置，不进 descriptor。

### C. 知识库（飞书知识库 / 自建）
- **接入形态**：MCP 暴露 `search_kb / get_article / draft_article`（草稿，不直发布）。
- **价值**：`kb-article` 从已解决工单生成草稿后入 KB 草稿区，走人工审核发布。
- **边界**：发布需人审；草稿不含商户 PII / 内部密钥。

### D. 监控 / 支付与同步健康（只读）
- **接入形态**：MCP 暴露 `get_active_incidents / get_service_health / get_payment_callback_rate`（只读）。
- **价值**：事故定级与对商家公告引用真实告警/支付回调成功率信号。
- **边界**：只读公开聚合；不回传商户明文；状态发布走草稿+人审。

---

## v1 → Phase 2 迁移注记

- v1 的所有 skill 产出都是**可直接贴入 Lark/GitHub 的文本成品**（升级 issue / KB / 事故沟通包 / CSAT 跟进），人工粘贴即可。
- Phase 2 接入后，这些成品的「落地动作」由 MCP 工具承接，方法论（playbook §1–§7）与模板（templates/）不变。
- 任何 Phase 2 集成上线前，必须复核本文件「安全与边界」全部约束（尤其支付密钥/商户号/shop 库连接串绝不出本 soul 边界）。
