# REFACTOR-070 HR Role Search Cockpit evidence-first UX

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-12 12:40
- **claimedAt**: 2026-05-12 12:40
- **completedAt**: 2026-05-12 12:55
- **plan**: PLAN-277
- **relatesTo**: REFACTOR-069, PLAN-276, apps/web

## 背景

REFACTOR-069 已经证明 HR Soul 可以走专业工作台路径，但首版 Role Search Cockpit
更像架构落点：它展示了 pipeline、evidence matrix、roundup packet 和 agent task tray，
却还没有充分降低 HR 用户的“我该从哪里开始”的认知成本。

本次迭代不改变 Soul 差异化架构，也不扩展其他 Soul。目标是在现有 HR workbench 上把
布局重心从说明型页面推进到证据优先的操作台，让用户自然围绕 role search、candidate
evidence、review checklist 和 next action 组织工作。

## 目标

- 让 HR 首屏优先呈现正在推进的 role search、证据覆盖、下一步动作和产物提案。
- 将 Evidence Matrix 提升为中心主视图，而不是多个卡片中的一个普通模块。
- 将 Agent Task Tray 调整为 “Next Actions + Proposal Composer”，强调 agent 是辅助工具，
  输出仍是可审查 proposal，不是最终招聘判断。
- 保持 PM、QA、DevOps 等其他 Soul 的当前通用工作台实现不变。
- 浏览器验证不仅检查元素存在，还要检查布局层级、移动端可用性和交互连贯性。

## 非目标

- 不实现 ATS/HRIS 真实 connector。
- 不引入候选人排名、录用/拒绝自动化或薪酬承诺。
- 不重做 worker route、session route 或其他 Soul 的信息架构。
- 不把 HR workbench 写成脱离 descriptor / shared runtime 的孤立应用。

## 验收标准

- HR worker route 呈现 evidence-first Role Search Command Center。
- 首屏能清晰区分 context rail、evidence workspace、next actions / proposal composer。
- Evidence Matrix 是中心主视图，Rubric 和 Roundup 作为辅助面板。
- 点击 HR next action 仍会选择对应 artifact target 并预填 proposal context。
- 空 workspace、已有 workspace、session handoff 以及 PM fallback 测试不回归。
- 桌面和移动端浏览器检查确认无明显拥挤、遮挡或交互断层。

## 完成记录

- 将 HR Role Search Cockpit 调整为 context rail / evidence workspace / next actions
  三段式工作台，移除说明型 hero，把 Evidence Matrix 放到中心主视图。
- 将右侧 Agent Task Tray 收敛为 Next Actions + Proposal Composer，强调 agent
  输出是 artifact proposal，仍需 review。
- 增加中英文 HR cockpit 文案，中文界面下减少不必要的混排。
- 保持 PM/QA/DevOps 等非 HR Soul 继续走通用 worker studio fallback。
- 修复 local daemon 静态托管缺少 `/fonts/*` 路由导致构建版 Worker Web 字体 404
  的问题，保证 `9327` 构建预览与 Vite 预览一致。
- Playwright UX 检查覆盖桌面、移动端、HR action-to-composer 路径和 PM fallback。
