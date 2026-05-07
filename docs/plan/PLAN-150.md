# PLAN-150 Cohere 设计语言 Web UI 全面切换

- **status**: completed
- **createdAt**: 2026-05-07 02:14
- **approvedAt**: 2026-05-07 09:36
- **completedAt**: 2026-05-07 10:04
- **relatedTask**: REFACTOR-017

## 现状

本轮目标是把 `DESIGN.md` 已替换的新设计语言真正落到 `apps/web` 的 Fleet 与
Worker 管理界面，而不是只改 token 名称。

调查结论：

1. 新 `DESIGN.md` 定义的是 Cohere 2026 风格：白色 editorial canvas、深绿
   `#003c33` / dark navy `#071829` product bands、near-black `#17171c` pill
   CTA、soft stone `#eeece7`、pale green/blue wash、coral taxonomy accent、
   flat surfaces、thin rules、8px/22px 圆角和 CohereText / Unica77 /
   CohereMono 字体分层。
2. 当前 `apps/web/src/shared/styles/globals.css` 仍是 REFACTOR-012 的旧体系：
   `--brand: #76b900`、黑色 sidebar、2px radius、`shadow-card` 和 NVIDIA
   fallback 字体。
3. Shared primitives 继续放大旧体系：`Button` 默认是绿色边框粗体按钮；
   `Card` 默认有 `shadow-card`；`TableHead` 是深色填充；`Badge` 使用粗体小标签。
4. Fleet 和 Worker shell 均是深色侧边栏 + 紧凑正文；这与新版设计的三分区顶栏、
   规则分隔、深色 product/status band 和更大 editorial whitespace 不一致。
5. 主要页面仍以通用卡片/表格为主，视觉上偏旧工程控制台，而非新版 Cohere 的
   flat、rule-driven、pill/action link、soft surface 组合。
6. 现有响应式测试覆盖 Fleet shell、audit internal scroll、Worker shell 和 chat
   mobile column，重构必须保持这些行为约束。

## 方案

批准后按五个阶段实现，范围保持在 `apps/web` 与 PMA 记录，不触碰后端协议。

### 1. Token 与基础 CSS

- 用新版 `DESIGN.md` 重写 `globals.css` token：
  - brand：near-black、deep-green、dark-navy、soft-stone、pale-green、
    pale-blue、coral、action/focus blue、hairline/border/muted。
  - typography：display/body/mono fallback，新增 section/card/body/micro 级别
    Tailwind text tokens，保持移动端不使用 viewport 字号缩放。
  - radius：4px / 8px / 16px / 22px / 30px / 32px / full。
  - shadow：默认无重阴影；保留极轻浮层阴影只给 dialog/popover。
- 保持 Tailwind CSS v4 `@theme` 作为唯一 token 出口，避免 feature component
  散落新 hex。

### 2. Shared UI primitives

- `Button`：
  - default = near-black pill primary；
  - secondary/link = text-only underline or rule-aligned action；
  - outline = 30px pill outline；
  - ghost/icon = flat utility button with visible focus。
- `Card`：默认 flat bordered surface，8px radius；新增/允许 22px major panel 用法，
  不再默认 shadow。
- `Input` / `Dialog` / `Tooltip` / `Badge` / `Table` / `Skeleton`：
  - 输入框薄灰边 + focus violet/blue；
  - table 改成白底 rule-separated rows，表头不再深色填充；
  - badge 降低字重，状态色使用 token；
  - dialog 使用 rounded 22px white card，轻 shadow，保留 focus/close accessibility。

### 3. Shell 与导航

- Fleet / Worker 采用一致 app chrome：
  - 顶部三分区导航：brand 左、主 nav 中、theme/action 右；
  - 移动端折叠为横向/多行 nav，不产生横向溢出；
  - 首屏内容以白色 canvas + 深绿/navy status band 组织，不使用旧黑色侧栏作为主视觉。
- Worker top status 从旧黑条改为 compact dark product band：worker id、config、
  executor、brain 等状态保持可扫描。
- Locked/token state 改为 contact-form-card 风格：白色圆角表单卡片，输入 focus
  明确，错误态红色 token 化。

### 4. Fleet / Worker route sweep

- Fleet：
  - `workers-list` / worker detail：列表转 rule-driven table + soft action area；
    empty/loading/dialog/row menu 统一 pill/action link 交互。
  - `enroll-list`：审批按钮和 one-time token dialog 切换到新 form/card 语言。
  - `audit-list`：保留内部滚动，改 research-table 风格、filter chips/input 和
    rule-separated JSON detail。
  - `presence-card`：summary 改 flat metric blocks + hairline dividers，不用旧 card
    shadow/深色表头。
- Worker：
  - overview/brain/config/secrets/test/cron/approvals：统一 section header、flat
    capability/product cards、forms、lists、状态 badge。
  - chat：保留 conversation continuation 行为，改成 agent-console-card 语义：
    dark/soft message surfaces、稳定 composer、streaming/failure state 不跳布局。

### 5. 测试与视觉验证

- 更新现有 responsive tests，使它们验证新 shell 的移动端形态，而不是旧 sidebar
  class 名。
- 保留/补充关键交互测试：workers actions、pair/launch wizard、chat mobile、
  audit internal scroll、theme toggle。
- 运行 focused gates：
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `git diff --check`
- 启动本地 web dev server，用桌面和移动视口检查 Fleet/Worker 主要页面截图：
  workers、audit、presence、worker overview、brain、config、chat、locked state。

## 风险

1. **范围大**：这是跨 shared primitives、shell、Fleet/Worker route 的全面视觉
   重构。对策：按 token -> primitives -> shell -> route sweep 小批推进，每批跑
   focused tests。
2. **设计语言来自营销/产品页，目标是 admin app**：不能照搬 hero/landing page。
   对策：只提取 typography、surface、rules、bands、pill actions 和 whitespace，
   信息密度保持操作台语义。
3. **现有测试耦合旧 class 名**：responsive tests 会因预期旧 sidebar 失败。
   对策：更新为验证行为和布局不变量，而不是旧视觉 class。
4. **无授权字体文件**：不能引入外链字体。对策：使用 `DESIGN.md` fallback 栈，
   后续有字体资产再 self-host。
5. **交互 primitive 不完整**：现有 row actions 是手写 menu。对策：本轮优先修复
   focus/hover/click-away 和视觉一致性；若引入 headless menu primitive，会控制在
   shared UI 范围并补测试。

## 范围

- `apps/web/src/shared/styles/globals.css`
- `apps/web/src/shared/components/ui/*`
- `apps/web/src/shared/components/theme-toggle.tsx`
- `apps/web/src/fleet/routes/*`
- `apps/web/src/fleet/features/**/*`
- `apps/web/src/worker/routes/*`
- `apps/web/src/worker/features/**/*`
- `apps/web/src/{fleet,worker}/__tests__/*` 及必要 focused tests
- `docs/task/REFACTOR-017.md`
- `docs/plan/PLAN-150.md`
- `docs/changelog.md`（完成时记录）

## 非范围

- 不改 `apps/api`、`apps/cli`、`packages/*` runtime 行为。
- 不改 gateway / worker REST / SSE / WS 协议。
- 不重做产品定位文档或架构文档。
- 不做发布任务或版本号 bump。

## 验证

- PASS: `bun run --filter '@zonease/aiworker-web' typecheck`
- PASS: `bun run --filter '@zonease/aiworker-web' lint`
- PASS: `bun run --filter '@zonease/aiworker-web' test`（16 files / 62 tests）
- PASS: `bun run --filter '@zonease/aiworker-web' build`（fleet + worker bundle；
  Vite chunk size warning 仍存在但 build 成功）
- PASS: 桌面/移动截图人工检查，截图位于 `tmp/webui-cohere-screenshots/`。
- PASS: `git diff --check`

## 进度

- 2026-05-07 02:14：完成调查，创建 draft plan，等待用户批准后实现。
- 2026-05-07 09:36：用户批准 proposal，进入实现阶段。
- 2026-05-07 10:04：完成 token、shared primitives、Fleet/Worker shell、主要 route
  sweep、responsive tests、Vite Markdown text import 兼容修正和截图验收。
- 2026-05-07 10:04：最后一轮浏览器实测覆盖 Fleet 桌面/移动、Worker 锁定态、
  Worker overview、Worker chat 移动端和 Worker chat dark theme；active nav
  hover 过渡后保持明确 primary 状态。
