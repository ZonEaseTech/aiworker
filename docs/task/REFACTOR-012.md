# REFACTOR-012 按 DESIGN.md 收敛 Web UI 视觉系统

- **status**: completed
- **priority**: P2
- **owner**: ui-refactor
- **createdAt**: 2026-04-29 17:05

## 描述

将 `apps/web` 的 Fleet 与 Worker 管理界面从当前 shadcn 默认中性视觉，收敛到 `DESIGN.md` 定义的高对比、工程化、低圆角视觉系统，并遵守 `pma-web` 的 Tailwind CSS v4 token、共享 UI primitive、React 19 + Vite 8 质量门禁规范。

验收标准：

1. 视觉 token 集中在 `apps/web/src/shared/styles/globals.css`，通过 Tailwind CSS v4 `@theme` 暴露，不在功能组件中散落 hex 或新增任意颜色。
2. 共享 UI primitive（button / badge / card / input / table / dialog / tooltip / skeleton）统一使用 DESIGN.md 的 2px 圆角、黑白高对比、绿色信号色、可见 focus state。
3. Fleet 与 Worker shell 使用同一套视觉语言：黑色导航面、白色正文或卡片面、绿色只作为 active / border / underline / status signal，不作为大面积背景。
4. Fleet 主要路由（workers / enroll / audit / presence）和 Worker 主要路由（overview / config / secrets / test / cron / approvals / chat）不再依赖 shadcn 默认的大圆角、灰色填充主按钮或随意的 emerald / amber 类名。
5. 保持 FEAT-032 的数据边界不变量：Fleet UI 只走 gateway WS，Worker UI 只走 worker REST + bearer-auth。
6. 保持 BUG-030 后的移动端可用性，390px 与 430px 宽度下不出现主要内容横向溢出。
7. `bun run --cwd apps/web lint`、`typecheck`、`test`、`build` 通过，并补充/更新必要的 UI 回归测试。

## 进行时描述

收敛 Web UI 视觉系统

## 依赖

- **blocked by**: 用户批准 proposal
- **blocks**: (无)
- **relates to**: FEAT-032, FEAT-034, FEAT-035, BUG-030, DESIGN.md

## 笔记

- 2026-04-29 17:05：调查发现 `globals.css` 仍是 shadcn 默认 neutral token，根半径为 `0.625rem`；`Button` 默认是填充式 `bg-primary`，`Card` 使用 `rounded-xl`；大量功能组件直接使用 `rounded-lg`、`emerald-*`、`amber-*`、`tracking-*`、`text-[...]` 等视觉类。实现代码尚未修改，等待 proposal 批准。
- 2026-04-29 17:18：已完成实现。Web token 层改为 DESIGN.md 黑白高对比与 NVIDIA green 信号色；共享 UI primitive 收敛为 2px 半径、绿色边框按钮、token 化 badge/status/focus/shadow；Fleet/Worker shell 统一为黑色导航面；主要页面完成视觉类 sweep；移除生产/开发首屏可见的 React Query Devtools 浮动入口。

## Verification

- `PATH=/home/ben/.bun/bin:$PATH /home/ben/.bun/bin/bun run --cwd apps/web lint`
- `PATH=/home/ben/.bun/bin:$PATH /home/ben/.bun/bin/bun run --cwd apps/web typecheck`
- `PATH=/home/ben/.bun/bin:$PATH /home/ben/.bun/bin/bun run --cwd apps/web test`
- `PATH=/home/ben/.bun/bin:$PATH /home/ben/.bun/bin/bun run --cwd apps/web build`
- `git diff --check`
- Playwright screenshots: Fleet workers desktop/mobile, Worker overview desktop/mobile, Worker chat mobile.
