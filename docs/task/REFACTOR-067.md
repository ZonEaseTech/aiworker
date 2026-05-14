# REFACTOR-067 Worker Web design system, component, and motion upgrade

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-12 00:00
- **claimedAt**: 2026-05-12 00:00
- **plan**: PLAN-271
- **relatesTo**: AGENTS.md, DESIGN.md, GOALS.md, docs/architecture.md, apps/web, packages/component

## 背景

Worker Web 已经完成 worker-first IA、workspace/session 主路径、共享布局和若干
局部视觉修复，但本轮检查仍暴露三个产品质量问题：

1. `apps/web` 配置了 Tailwind CSS v4 插件，但样式入口没有实际导入
   Tailwind，也没有通过 `@theme` 承载 `DESIGN.md` token；
2. 组件化主要停留在布局、按钮、select 和 dialog，业务界面仍把大量 section、
   empty state、status pill、list row、brand/header pattern 写在页面组件里；
3. 交互运动层很薄，除了少量 transition 和 settings spinner，缺少统一的进入、
   列表、消息、抽屉和控件反馈节奏，导致整体体验僵硬。

## 目标

在不改变 worker、workspace、session、artifact、review、lesson API 合同的前提下，
把 Worker Web 收敛到 `DESIGN.md` + Tailwind v4 token 约束下，并落地可复用组件
pattern 与克制的交互动效。

## 验收标准

- Web 样式入口实际启用 Tailwind v4，并通过 `@theme` 暴露 `DESIGN.md` 的核心
  color、radius、font、motion token。
- 新增或扩展 `packages/component` 的 studio pattern 组件，至少覆盖 section header、
  empty state、pill/status、activity/list row 等高频结构。
- Worker Web 关键页面使用新增 pattern，减少 `worker-studio.tsx` / session surfaces
  中的重复 UI 结构。
- 交互动效覆盖 shell/panel/list/card/select/chat/drawer 等关键路径，并尊重
  `prefers-reduced-motion`。
- 视觉仍保持 `DESIGN.md` 的白底、黑白中性色、pill-first、hairline、无渐变/装饰阴影
  约束。
- 桌面和移动视口不出现明显文本溢出、控件重叠或布局跳动。

## 验证

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Browser desktop/mobile smoke
- `bun run crg:update`
- `bun run crg:review`

## Closeout

Completed on 2026-05-12.

- Worker Web now imports Tailwind CSS v4 and maps the `DESIGN.md` palette,
  radius, font, spacing, and motion values through `@theme`.
- Added reusable studio pattern components in `packages/component` for section
  headers, empty states, pills/status, and activity rows.
- Migrated repeated Worker Web section/empty/status/activity structures to the
  new shared patterns.
- Added a restrained motion layer for shell, panel, list, card, select, chat,
  drawer, and status-dot feedback with `prefers-reduced-motion` support.
- Browser desktop and mobile smoke passed against the local 9217 daemon without
  layout overlap or console errors beyond the React DevTools info message.
