# PLAN-038 Web UI 视觉系统收敛

- **status**: completed
- **createdAt**: 2026-04-29 17:05
- **approvedAt**: 2026-04-29 17:12
- **relatedTask**: REFACTOR-012

## 现状

本次范围只涉及 `apps/web` 的 Fleet 与 Worker 管理界面，不改变 gateway / worker 数据通道，也不新增 API。

调查结论：

1. `apps/web` 已符合 `pma-web` 的基础栈：React 19、Vite 8、TanStack Router/Query、Zustand、shadcn owned code、Tailwind CSS v4。当前源码已经按 FEAT-032 拆成 `src/fleet`、`src/worker`、`src/shared`，双 bundle 输出也存在。
2. `DESIGN.md` 要求的视觉核心是：黑白高对比、`#76b900` 绿色只作边框/下划线/active signal、默认 2px 圆角、标题 36/24/20px 且 700 weight、正文 15-16px、按钮透明底绿色边框、卡片少阴影、密集工程化布局。
3. 现有 `apps/web/src/shared/styles/globals.css` 仍是 shadcn 默认 neutral token：`--radius: 0.625rem`，`--primary` 是近黑或浅灰，未定义 DESIGN.md 的品牌/语义 token。
4. 共享 primitive 仍带默认 shadcn 视觉：`Button` 默认填充式 `bg-primary`，`Card` 使用 `rounded-xl shadow-sm`，`Input` / `Badge` / `Dialog` / `Table` 多处使用 `rounded-md`、默认灰面和默认 ring。
5. Shell 与功能页面有大量局部视觉类：`rounded-lg`、`shadow-lg`、`emerald-*`、`amber-*`、`tracking-tight/wide`、`text-[...]`、`max-w-[...]` 等。它们让样式绕过 `DESIGN.md` 和 Tailwind token 层。
6. Fleet / Worker 视觉语言不统一：Fleet shell 英文为主，Worker shell 中英混杂；两侧导航都是浅色卡片面，而 DESIGN.md 更适合黑色导航/黑白分区/绿色 active signal。
7. 当前已有 BUG-030 的移动端修复和 responsive shell 测试，重构必须保留 390px / 430px 可用性。

## 方案

批准后按四步实现，保持行为不变，先做视觉系统收敛，不做交互流程重写。

### 1. Token 层

- 重写 `apps/web/src/shared/styles/globals.css` 的设计 token：
  - `--color-black` / `--color-white` / `--color-brand` / `--color-brand-light`
  - neutral、border、surface、status success/warning/error/info token
  - `--radius: 2px`
  - `--shadow-card: 0 0 5px rgb(0 0 0 / 30%)`
- 继续通过 Tailwind CSS v4 `@theme` 输出语义色，不在功能组件新增 hex。
- 字体使用 `NVIDIA-EMEA, Arial, Helvetica, sans-serif`，不引入外部字体下载；如果没有自托管字体，走 fallback。

### 2. Shared UI primitive

- 调整 `Button`：
  - `default` 改为透明底 + 2px 绿色边框 + bold text；
  - `secondary` 改为 1px 绿色边框；
  - `ghost` 只做轻量 hover；
  - `destructive` 使用 error token；
  - icon size / hit area 保持稳定。
- 调整 `Card`、`Input`、`Badge`、`Dialog`、`Table`、`Tooltip`、`Skeleton`：
  - 默认 2px 圆角；
  - 边框、shadow、focus ring 来自 token；
  - status badge 改用语义 token，不直接写 `emerald-*` / `amber-*`。

### 3. Fleet / Worker shell

- Fleet 与 Worker 的 `__root.tsx` 使用一致 shell：
  - 黑色导航面，白色/灰色导航文字；
  - active 项用绿色左边框或下边框，不用大面积绿色填充；
  - 移除导航中的说明性段落，避免把实现边界写成可见 UI 文案；
  - 保留 BUG-030 的窄屏 grid / top nav 行为。
- Top bar 和主内容区保持紧凑，标题/状态信息遵循 DESIGN.md 字阶。

### 4. 功能页面视觉 sweep

- Fleet：`workers-list`、`workers.$workerId`、`enroll-list`、`audit-list`、`presence-card`。
- Worker：`index`、`config-editor`、`brain-section`、`executor-section`、`channels-section`、`secrets-panel`、`test-panel`、`cron-panel`、`approvals-panel`、`chat-panel`。
- 只替换视觉类和局部结构，不改 API hooks、不改数据流、不改 token 暴露规则。
- 如重复页面骨架过多，可新增很薄的 shared layout helper；若 primitive 与 token 已足够，不新增抽象。

## 风险

1. **视觉 sweep 范围大**：`apps/web/src` 约 88 个文件，直接全量重写容易引入回归。对策：先改 token/primitive/shell，再按路由做小批量 sweep。
2. **绿色使用边界容易失控**：如果把 `primary` 当背景色使用，会违背 DESIGN.md。对策：按钮默认透明，绿色主要用于 border / underline / active indicator / small status signal。
3. **现有测试偏 DOM 行为，视觉回归不足**：对策：保留 Vitest，并用 Playwright 对 Fleet 与 Worker 的桌面/移动截图做人工检查。
4. **功能组件内联类很多**：完全清零 arbitrary class 不是本轮目标，重点处理颜色、圆角、阴影、按钮、卡片和 shell；布局尺寸类只在造成视觉冲突时调整。
5. **字体不可用**：`NVIDIA-EMEA` 未在仓库自托管。对策：声明 font-family fallback，不引入网络字体，后续如有授权字体再补 self-host。

## 工作量

预计触达 20-30 个 web 文件，集中在 `apps/web/src/shared/styles`、`apps/web/src/shared/components/ui`、`apps/web/src/fleet/routes`、`apps/web/src/worker/routes` 和主要 feature component。

验证命令：

- `bun run --cwd apps/web lint`
- `bun run --cwd apps/web typecheck`
- `bun run --cwd apps/web test`
- `bun run --cwd apps/web build`
- `git diff --check`

视觉验证：

- 本地启动 Fleet 与 Worker bundle，分别截取桌面和 390px / 430px 移动视口。
- 检查主要 UI 不横向溢出、按钮文字不溢出、focus state 可见、深浅主题都可读。

## 备选方案

1. **只改 token，不扫功能页面**：改动小，但大量 `rounded-lg`、`emerald-*`、`amber-*`、局部 shadow 会继续覆盖系统视觉，效果不完整。不推荐。
2. **一次性重做所有页面布局**：视觉最彻底，但会把行为、信息架构和视觉改动混在一起，回归面过大。不推荐。
3. **推荐方案：token + primitive + shell + 主要页面视觉 sweep**：既能让 DESIGN.md 成为真实约束，又能控制行为风险。

## 批注

- 2026-04-29 17:05：完成调查并记录 draft。实现尚未开始；等待用户批准。
- 2026-04-29 17:12：用户批准 proposal，进入实现阶段。
- 2026-04-29 17:18：实现完成并通过验证。范围保持在 `apps/web` 视觉系统和 PMA 记录；未改 gateway / worker API 与数据流。

## Verification

- `PATH=/home/ben/.bun/bin:$PATH /home/ben/.bun/bin/bun run --cwd apps/web lint`
- `PATH=/home/ben/.bun/bin:$PATH /home/ben/.bun/bin/bun run --cwd apps/web typecheck`
- `PATH=/home/ben/.bun/bin:$PATH /home/ben/.bun/bin/bun run --cwd apps/web test`
- `PATH=/home/ben/.bun/bin:$PATH /home/ben/.bun/bin/bun run --cwd apps/web build`
- `git diff --check`
- Playwright: `http://127.0.0.1:5173/fleet/workers` desktop + 390px mobile, `http://127.0.0.1:5173/worker/` desktop + 390px mobile, Worker Chat 390px mobile.
