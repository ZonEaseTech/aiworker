# PLAN-271 Worker Web design system, component, and motion upgrade

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 00:00
- **approvedAt**: 2026-05-12 00:00
- **relatedTask**: REFACTOR-067

## Current State

- 产品边界已由 `GOALS.md`、`docs/architecture.md` 和 `AGENTS.md` 固化为
  local-first vertical Soul workspace。Worker Web 必须围绕 Soul worker、
  workspace/session、artifact、review、lesson，而不是治理概念或 fleet 控制面。
- `DESIGN.md` 指向极简、文档化、黑白中性色、pill-first、hairline、无渐变/无装饰阴影
  的视觉系统。
- `apps/web` 已安装 `tailwindcss` 与 `@tailwindcss/vite`，但 `src/styles/index.css`
  只导入本地 CSS 文件，没有 `@import "tailwindcss"`；`tokens.css` 也没有 `@theme`。
- 现有 CSS token 大体贴近 `DESIGN.md`，但仍以 ad hoc CSS variables + hex 为主，
  Tailwind 设计层未成为约束来源。
- 组件包已有 `WorkerStudioLayout`、`StudioMainFrame`、`Button`、`IconButton`、
  `ActionCard`、`Dialog`、`StudioSelect` 等基础能力，但高频业务 pattern 仍直接散落在
  `WorkerStudio`、`SessionDetail` 和 `WorkerSessionChat`。
- 动效层只有少量 transition 与 spinner，没有统一的 motion token，也缺少面板进入、
  列表项进入、消息进入、drawer 宽度、select menu 等产品级反馈。

## Proposal

1. **Tailwind + token foundation**
   - 在 Web CSS 入口启用 Tailwind v4；
   - 在 `tokens.css` 增加 `@theme` token，把 `DESIGN.md` 的 palette、radius、font、
     spacing、motion duration/easing 映射为 Tailwind 主题变量；
   - 保留现有 CSS variables 作为当前手写 CSS 与组件样式的兼容层，但用 theme token
     派生，避免继续扩散深层字面量。

2. **Reusable studio patterns**
   - 在 `packages/component` 增加 Worker Web 可复用 pattern：
     `StudioSectionHeader`、`StudioEmptyState`、`StudioPill`、`StudioStatusPill`、
     `StudioActivityRow` 或等价命名；
   - 在 `apps/web` 的 worker/workspace/session surface 中替换重复结构，优先处理
     section header、empty state、status pill、metadata/action row。

3. **Motion system**
   - 新增统一 motion tokens 与 CSS keyframes：soft enter、list item enter、
     drawer/panel reveal、pulse dot；
   - 应用到 app shell、sidebar card、workspace card、select menu、chat message、
     artifact rail、status dot；
   - 使用 `prefers-reduced-motion: reduce` 关闭非必要动画。

4. **UX polish within current contracts**
   - 不改 API/schema/router 语义；
   - 不恢复 fleet/gateway/default admin surface；
   - 不引入渐变、装饰阴影、彩色品牌系统或大型营销 hero；
   - 保持业务对象文案：Soul worker、workspace、session、artifact、review、lesson。

## Scope

In scope:

- `apps/web/src/styles/*`
- `apps/web/src/worker/*`
- `apps/web/src/features/local-workspace/components/*`
- `packages/component/src/*`
- Worker Web focused tests where component boundaries or accessible output changes.

Out of scope:

- Backend API/schema changes.
- CLI command changes.
- Fleet/gateway surfaces.
- Release publishing.

## Risks

- Tailwind import can perturb generated CSS ordering. Keep imports centralized and verify built CSS selectors.
- More motion can hurt usability if it causes layout shift. Use transform/opacity, stable dimensions, and reduced-motion opt-out.
- Component extraction can become a broad rewrite. Only extract repeated, product-neutral studio patterns and keep behavior local.
- Dark mode exists even though `DESIGN.md` is mostly light. Preserve functionally neutral dark mode without expanding the palette.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Browser smoke for worker route, workspace route, session route, settings dialog, desktop and mobile.
- `bun run crg:update`
- `bun run crg:review`

## Approval Gate

Approved by operator on 2026-05-12 with explicit instruction to take over this
development in goal mode and complete the implementation.

## Progress

- 2026-05-12 00:00: Created and claimed after investigation of `DESIGN.md`,
  Worker Web structure, existing component package, Tailwind config, CSS token
  usage, and PMA history.
- 2026-05-12 02:33: Completed Tailwind/theme token wiring, reusable studio
  pattern extraction, restrained motion layer, Worker Web component adoption,
  focused Web gates, browser smoke, and code-review-graph review.

## Result

Completed on 2026-05-12.

- `apps/web/src/styles/index.css` now imports Tailwind CSS v4, and
  `tokens.css` defines the Worker Web design system through `@theme` while
  keeping the existing CSS variable compatibility layer.
- `packages/component` now exposes reusable Worker Web studio patterns:
  section header, empty state, pill/status, and activity row.
- Worker home, workspace rail, session chat, and session detail surfaces now
  use those shared patterns for repeated section headers, empty states, status
  pills, produced chips, turn rows, and event rows.
- `motion.css` adds a consistent, reduced-motion-aware interaction layer for
  shell/panel/list/card/select/chat/drawer/status feedback.
- Focused verification passed: Web typecheck, lint, test, build, `git diff
  --check`, browser desktop/mobile smoke, `crg:update`, and `crg:review`.
