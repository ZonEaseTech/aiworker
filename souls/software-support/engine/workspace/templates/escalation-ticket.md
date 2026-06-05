# 升级工单骨架（escalation-ticket）= 能过 ttpos-bot 质量门的 GitHub issue

> 由 `skills/ticket-triage` 产出。**这是一条 GitHub issue 的正文**，由 ttpos-bot 评 5 维质量门（playbook §7）。
> 缺「复现五要素」任一项不进 L3（playbook §3.3 / §4.1）。所有日志/标识**脱敏**（去支付密钥、token、商户 PII、shop 库连接串）。

---

## 0. 标题（在 GitHub issue 标题栏，不在正文）
> 规则：唯一动作 + 症状，无歧义；**禁用 `[POS]`/`[FEAT]`/`[支付]` 等方括号前缀**（带前缀 `title_specificity` 最高只给 1）。
>
> 模板：`<门店/终端> <具体功能/支付方式> <症状>（<关键状态值>）`
> 例：`曼谷某店 kiosk PromptPay 已扣款但 SaleOrder 仍为未结账(status=0)`

## 元信息（正文首行，便于分派）
**分级（P0–P3）：** <P_>　|　**分级依据：** <影响面 × 紧急度，引用 sla-matrix.md>
**来源（Lark/工单）：** <脱敏占位>　|　**升级目标：** L3（研发）　|　**故障域：** <见 playbook §1.3>

## 问题描述
<客观描述「实际发生什么」，不含猜测。落到 playbook §1.3 某故障域。>

## 复现路径
> 从已知起点编号，含确切输入值与时序。这里的步骤要凑成可验证条目（喂 `verifiable_items`）。
1. <起点状态，如「pos 已登录、桌台空闲」>
2. <操作 + 确切输入值>
3. <…>
4. 预期：<应发生什么>　实际：<实际发生什么>

## 影响范围
> 谁受影响、是否核心交易链路、是否涉资金、是否有绕过；与分级依据一致。列成可核对要点（继续喂 `verifiable_items`）。
- 影响门店/终端：<单店/连锁/全平台；约 N 台>
- 是否涉资金：<客人是否实际扣款 / 对账是否受影响>
- 绕过方案：<有/无；如「可改现金收款」>
- 频率与首次时间：<必现/偶发；首次发生 YYYY-MM-DD HH:mm，门店当地时区>

## 环境
> bug 必备：**终端 + 版本 + 商户** 三者齐全 → 满足元数据「环境」小节 + `context_links` 维。
- 终端：<pos / kds / kiosk / tablet / member …>
- 版本：<server v2.23.x / flutter v2.22.x>
- 商户：<company_uuid（**实际工单填真实值**——它是定位 shop{uuid} 库的租户标识，非密钥；本范例用 <REDACTED> 仅为脱敏示意）/ 门店 / 市场(泰国/中国/日本)>
- 设备/网络：<打印机 LAN/USB / EDC 型号 / 在线-离线-弱网>

## 代码定位
> `code_locality` 维（仅咨询不卡门，但务必写，加速研发）。给文件路径/符号/模块，引 playbook §1.3 起点。
- <如 `ttpos-server-go/main/app/constant/payment.go`：`PaymentOrderStatusUnPay=0` / `PaymentMethodCodeQRPromptPay=80`>
- <如 `ttpos-flutter/packages/printer/lib/src/network/network_printer.dart`>

## 已尝试方案
- <做了什么 → 结果>
- <做了什么 → 结果>

## 相关日志 / 证据（脱敏）
```
<终端/server 日志/支付回执片段；支付密钥/token/PII/连接串用 [REDACTED] 替换>
```

## 相似 issue / 关联（可选，加强 context_links）
- <#关联 GitHub issue / 父子/兄弟 issue>

## 给商家的回执（下一步与节奏）
<已升级研发、下次反馈时间；涉资金只说「会核实并回复」；不承诺修复时间>

---

## 质量门自检（提交 GitHub issue 前逐条勾，playbook §7）
- [ ] **标题**：唯一动作+症状、含关键状态值、**无方括号前缀** → `title_specificity=2`
- [ ] **正文含 `## 问题描述` / `## 复现路径` / `## 影响范围` 三节且实在** → `narrative_completeness=2`
- [ ] **可验证条目 ≥3 条**（复现步骤 + 影响要点） → `verifiable_items=2`
- [ ] **`## 环境` 写全 终端+版本+商户** → `context_links=2`（4 维 gating 满分 8 ✓）
- [ ] **`## 代码定位` 有具体指针**（文件/符号/模块） → `code_locality=2`（咨询项，不卡门）
- [ ] 正文小节标题用了可被元数据匹配的词（问题描述/复现路径/影响范围/环境，或其别名）
- [ ] 日志/支付/商户标识已**脱敏**
