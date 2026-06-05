# Integrations · Phase 2 工具集成蓝图

> **v1 不实现。** 本文件是 Phase 2 蓝图，不在运行热路径上。v1 的 hr-manager 是 descriptor-only 深度知识资产：只有 workspace + knowledge + templates + skills + MCP 占位，无 live API / 工具 / UI。

## 设计意图

把 HRBP 工作流里反复手工搬运的环节，未来通过原生引擎的 MCP（Model Context Protocol）接入，让 skill 能直接读写真实系统而非靠人复制粘贴。蓝图描述「将来怎么接」，不是「现在能用」。

## Phase 2 候选接入（均为蓝图，未实现）

> TTPOS 现状：研发 / PM / 客服协作已跑在**飞书 Lark + GitHub Issues + ttpos-bot**；招聘侧未必有统一 ATS。下表按 TTPOS 实际工具栈选型，但全部是 Phase 2 蓝图，不在 v1 热路径。

| 系统 | 类型 | 设想能力 | 主要用于 skill |
|---|---|---|---|
| ATS（招聘系统，如 Boss 直聘 / Moka / 北森 / Greenhouse） | MCP server | 读职位 / 候选人漏斗、写面试反馈与评分卡、查转化数据 | `competency-jd` / `structured-interview-kit` / benchmarks 诊断 |
| HRIS（人力系统，如北森 / 钉钉 / 飞书人事） | MCP server | 读职级带与薪档结构、查内部同级 compa-ratio、写入职流程 | `compensation-offer` / `onboarding-90day` |
| **飞书 Lark**（IM / 日历 / 审批 / 人事） | MCP server | 排面试、发入职提醒、走 offer 审批流、推送 OKR 复盘节点 | `onboarding-90day` / `compensation-offer` / `okr-goal-setting` |
| **GitHub + ttpos-bot**（研发协作 / 工单） | MCP server（只读为主） | 读研发产出与 sprint / 质量门数据辅助研发 OKR 取证（**只读、不写业务数据**） | `okr-goal-setting`（研发 KR 证据来源） |
| 薪酬调研（Mercer / WTW / Aon 数据导出） | 文件 / 受控接口 | 读分位口径生成薪档（不外传明文调研数据） | `compensation-offer` |

接入形态：以原生引擎的 MCP 配置（`mcp/codex/config.toml`、`mcp/claude-code/.mcp.json`）声明 server；author 可在**本地** MCP 文件中写真实凭据。

## 数据与安全边界（v1 即生效，Phase 2 强约束）

- **个人信息不进 descriptor / DB / 日志**：候选人 / 员工的姓名、联系方式、身份证、简历、具体薪资等**个人信息**绝不写入 soul descriptor、AIWorker 数据库、收据、日志、诊断输出、OpenAPI 示例或 UI。本仓库所有范例一律脱敏（候选人 A、[手机号]、[期望薪资] 等占位）。
- **密钥不进 descriptor / DB / 日志**：MCP 凭据 / api key / token / 飞书 app secret / GitHub token 等**密钥**只存在于 author 本地 MCP 文件；AIWorker 不把密钥复制进 descriptor、数据库、日志或 UI。
- **不碰 TTPOS 业务数据**：接 GitHub / ttpos-bot 仅为研发 OKR 取证（聚合 / 只读），绝不读取或落地 TTPOS 多租户业务库里的商家 / 门店 / 顾客 / 交易等数据；招聘只处理候选人脱敏信息。
- **PIPL 最小必要**：未来接 ATS / HRIS / 飞书人事时，只拉完成当前任务所必需的个人信息字段，明示目的、不超范围留存，离职后按规定删除 / 匿名化。
- **跨境用工另算**：TTPOS 是多市场（含泰国）公司，若涉境外员工 / 数据出境，须按当地法 + 数据出境合规单独送审，不在本 soul 范围。
- **薪酬调研数据**：受版权与保密约束，不把购买的调研明文外传或写入可被投影的资产；skill 只引用「口径 / 方法」，不固化具体薪资数值。

## v1 现状

`mcp/codex/config.toml` 与 `mcp/claude-code/.mcp.json` 为**空占位**（无已声明 server）。需要接入时由 author 在本地按上表填写，并遵守上面的数据与安全边界。
