# REFACTOR-017 按新版 Cohere 设计语言全面重构 Web UI

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-07 02:14
- **claimedAt**: 2026-05-07 09:36
- **completedAt**: 2026-05-07 10:04
- **plan**: PLAN-150
- **sourceObjective**: DESIGN.md 已替换为新的 Cohere 2026 设计语言，严格遵循
  新设计要求，全面重构 Web UI 相关布局、组件、交互，直至完整切换到新的设计
  理念风格。
- **relatesTo**: REFACTOR-012, PLAN-038, FEAT-032, FEAT-034, FEAT-035,
  BUG-030, DESIGN.md, apps/web

## Context

`DESIGN.md` 已从上一版黑白高对比 + NVIDIA green 信号体系，替换为 Cohere
2026 web system：白色 editorial canvas、深绿/深 navy product bands、近黑 pill
CTA、低阴影、薄规则、圆角媒体/产品卡片、CohereText / Unica77 / CohereMono
字体分层，以及 coral / blue 作为少量 editorial accent。

当前 `apps/web` 仍基本沿用 REFACTOR-012 的旧视觉收敛结果：

1. `apps/web/src/shared/styles/globals.css` 仍定义 `--brand: #76b900`、
   `--surface-ink: #000000`、2px radius 和 `shadow-card`，不符合新版
   `DESIGN.md` 的 Cohere token。
2. Shared primitives 仍是旧工程化风格：按钮透明底绿色边框、卡片默认
   `shadow-card`、表头深色填充、badge/text 多处 `font-bold`，与新版 near-black
   pill CTA、薄规则、少阴影、常规 400/500 字重不一致。
3. Fleet / Worker shell 仍是侧边深色导航 + 紧凑 top bar；新版设计更适合白色
   operational canvas、三分区顶栏、深绿/深 navy 状态 band 和规则分隔的内容区。
4. Fleet routes（workers / enroll / audit / presence / worker detail）和 Worker
   routes（overview / brain / config / secrets / test / cron / approvals / chat /
   locked state）仍有大量旧卡片化、深色表头、粗体 badge、旧 button/interactions。
5. 当前移动端响应式回归测试覆盖 390px / 430px shell 和 chat/audit 滚动行为；
   新版重构必须保留这些约束。

## Scope

- 将 `apps/web` 的设计 token 切换到新版 `DESIGN.md`：颜色、字体 fallback、
  radius、shadow、focus、状态色和 Tailwind v4 `@theme` 语义映射。
- 重做 shared UI primitives：button、badge、card、input、table、dialog、tooltip、
  skeleton，使默认视觉符合 Cohere flat / rule-driven / pill CTA 系统。
- 重构 Fleet 与 Worker app shell：统一顶栏、导航、状态 band、移动端 collapse 和
  内容容器节奏，保留两套 bundle 和数据边界。
- 覆盖 Fleet 主要页面：workers list、worker detail、enrollments、audit、
  presence 及相关 dialogs / row actions。
- 覆盖 Worker 主要页面：overview、brain、config、secrets、test、cron、
  approvals、chat、locked token state 及相关 forms / lists / streaming state。
- 更新必要测试，保留现有 API hook / gateway / worker REST/SSE 边界不变量。

## Out of Scope

- 不改 gateway / worker API、WS/SSE 协议、DB schema 或 executor/brain runtime。
- 不新增 marketing landing page，不把 admin UI 改成宣传页。
- 不引入网络字体；没有授权字体文件时使用 `DESIGN.md` 指定 fallback。
- 不为 REFACTOR-012 的旧视觉系统保留兼容 alias。

## Acceptance Criteria

1. `apps/web/src/shared/styles/globals.css` 以新版 `DESIGN.md` 为唯一视觉 token
   来源，旧 `#76b900` 绿色品牌 token、旧 2px radius 体系和重 `shadow-card`
   不再作为默认 UI 语言。
2. Shared UI primitives 默认渲染 Cohere 风格：near-black pill primary、text/link
   secondary、outline pill filter/action、8px/22px 主要圆角、薄边框、无重阴影、
   可见 focus state。
3. Fleet 与 Worker shell 全面切换到新版布局节奏：白色 canvas、顶栏/导航一致、
   深绿或 navy band 只用于产品/状态分区，移动端不横向溢出。
4. Fleet 所有现有路由和 Worker 所有现有路由的主视觉、表单、表格、列表、弹窗、
   empty/loading/error/locked/streaming 状态均不再显著保留旧视觉体系。
5. 功能边界保持不变：Fleet UI 只走 gateway WS / fleet API，Worker UI 只走
   worker REST/SSE + bearer-auth。
6. 390px / 430px 移动端和桌面视口通过截图人工检查：无文本溢出、无控件重叠、
   主导航和表格/聊天滚动可用。
7. Focused gates 通过：`bun run --filter '@zonease/aiworker-web' lint`、
   `typecheck`、`test`、`build`，以及 `git diff --check`。

## Notes

- 2026-05-07 02:14：完成初始调查并创建 proposal。实现尚未开始，等待用户批准。
- 2026-05-07 09:36：用户批准 proposal，进入实现阶段。
- 2026-05-07 10:04：完成 Fleet / Worker Web UI 全面切换。核心交付包括新版
  `globals.css` token、shared UI primitives、Fleet/Worker 顶栏壳层、Worker
  深绿状态 band、锁定态表单、Fleet workers/enroll/audit/presence/worker detail
  以及 Worker overview/brain/config/secrets/test/cron/approvals/chat 主要页面。
- 2026-05-07 10:04：卡片类容器半径收敛到 8px；按钮和顶栏导航保留 pill 形态。
  本地截图验收产物位于 `tmp/webui-cohere-screenshots/`。
- 2026-05-07 10:04：由于并行的 Brain Skill Pack 变更引入 Markdown text import，
  本轮同步修正 `apps/web/vite.config.ts` 的 `.md?import` 读取逻辑，保证 web
  test/build 不受 Vite `/@fs/...md` id 形态影响。
- 2026-05-07 10:04：最后一轮浏览器实测覆盖 Fleet 桌面/移动、Worker 锁定态、
  Worker overview、Worker chat 移动端和 Worker chat dark theme；active nav
  hover 过渡后保持明确 primary 状态。

## Validation

- PASS: `bun run --filter '@zonease/aiworker-web' typecheck`
- PASS: `bun run --filter '@zonease/aiworker-web' lint`
- PASS: `bun run --filter '@zonease/aiworker-web' test`（16 files / 62 tests）
- PASS: `bun run --filter '@zonease/aiworker-web' build`（fleet + worker bundle；
  Vite 仍提示 chunk > 500 kB，非本轮新增 failure）
- PASS: 桌面/移动截图人工检查：
  `tmp/webui-cohere-screenshots/fleet-workers-desktop.png`、
  `tmp/webui-cohere-screenshots/fleet-workers-mobile.png`、
  `tmp/webui-cohere-screenshots/worker-locked-desktop.png`、
  `tmp/webui-cohere-screenshots/worker-locked-mobile.png`、
  `tmp/webui-cohere-screenshots/worker-overview-desktop.png`、
  `tmp/webui-cohere-screenshots/worker-overview-mobile.png`、
  `tmp/webui-cohere-screenshots/worker-chat-mobile.png`、
  `tmp/webui-cohere-screenshots/worker-chat-dark-desktop.png`
- PASS: `git diff --check`
