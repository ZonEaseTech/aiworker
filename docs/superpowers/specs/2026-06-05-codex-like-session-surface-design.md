# Codex-like session surface 设计 (2026-06-05)

- 状态: 用户已批准设计方向, 待 writing-plans 转实施计划
- 范围: `apps/worker-web` 的单个 session surface, 以及 `packages/ui` 中支撑该 surface 的共享 UI primitives
- 主轴: session 的 invocation lifecycle 体验, 不是完整 Codex Desktop 外壳复刻
- 用户批准方向: 路径 2, Session surface 重构

## 背景

当前 AIWorker 的会话 UI 已经有居中列、底部 composer、基本 transcript 和 streaming
恢复能力, 但整体仍像普通 Web chat。用户指出的问题不是单点视觉缺陷, 而是整条会话运行链条不协调:

- stream 节奏僵硬, 信息像日志或整块内容硬塞进聊天框;
- tool/progress、assistant 正文、用户消息和 composer 状态层级不清;
- composer 像大 textarea, 没有运行控制台的状态感;
- rich content 渲染太薄, list、inline keyword、链接、文档、资源卡片、动作栏等 Codex-like 细节没有系统设计;
- 视觉材质偏普通 admin/chat, 缺少暗色层级、柔和浮层和稳定可扫读的 transcript rhythm。

因此第一版不应继续做零散 patch, 也不应先复刻完整桌面外壳。第一版目标是把单个 session 的运行体验做成可理解、可控制、可继续的 Codex-like session surface。

## 目标

1. 把 session surface 设计成 invocation lifecycle 状态机, 覆盖 Ready、Submit、Starting、Streaming、Activities、Continue。
2. 让 timeline 成为主舞台, composer 成为状态控制台, tool/progress 成为辅助层。
3. 系统化 rich transcript rendering, 不再只补用户点名的 list/link/document 项。
4. 保持 Worker-owned Workbench 边界, 不引入 Host 或 Soul UI 概念。
5. 保持 follow-up API 语义不变。

## 非目标

- 不做完整 Codex Desktop 外壳复刻。左侧跨项目历史、窗口 chrome、完整右侧环境栏属于后续增强。
- 不展示权限、context 剩余或模型/强度。
- 不改变 `POST /api/sessions/:sessionId/invocations` follow-up API。
- 不引入 Host-owned session UI, 不让 Soul 提供 UI。
- 不做完整文档、浏览器或图片预览面板。第一版先做 typed resource card 和打开入口。
- 不暴露 raw chunks、secret、chain-of-thought 或未脱敏 tool payload。

## 设计 1: 体验模型

Session surface 是一个状态机, 不是静态聊天列表。

| 状态 | 行为 |
|---|---|
| Ready | composer 显示输入材料、发送入口和当前 session 的继续入口。 |
| Submit | 用户消息立即进入 timeline, composer 保持焦点, send 进入 running/stop 控制态。 |
| Starting | 提交后 300ms 内出现 starting 或 waiting 状态; optimistic 状态必须区别于 engine-derived event。 |
| Streaming | assistant 内容稳定增长; 只在用户贴近底部时 stick-to-latest。 |
| Activities | tool/progress 作为辅助层; 成功默认摘要化, 失败自动展开。 |
| Continue | terminal 后 composer 回到继续变更入口, 继承同一 session/workspace/invocation chain。 |

核心分工:

- `timeline`: 主舞台, 承载用户消息、elapsed/status、assistant 输出、activity summary、resource cards 和 turn actions。
- `composer`: 状态控制台, 承载输入、材料、send/stop、retry/continue。不展示权限、context 剩余或模型/强度。
- `tool/progress`: 辅助层, 不压过主回答。

## 设计 2: 组件边界

第一版应避免继续把条件 UI 堆进当前 `ChatThread`。建议拆为四层:

### ChatSurface

`apps/worker-web` app 层容器:

- 获取 `fetchSessionDetail` snapshot;
- 跟随 active invocation live events;
- 合并 optimistic user submission;
- 处理 submit、cancel、follow-up;
- 管理 focus token、scroll reserve 和 stick-to-latest;
- 不直接处理 rich rendering 细节。

### Timeline mapper

纯函数层, 输入 session events、invocations、live invocation、optimistic user turn, 输出稳定 timeline view model。

该 view model 应允许 first-class items:

- user turn;
- invocation header;
- assistant rich markdown;
- activity summary;
- command block;
- resource card;
- diff summary;
- table/data summary;
- status/error/warning;
- turn action rail。

### SessionTimeline

UI 层:

- turn 布局;
- elapsed/status;
- assistant streaming;
- activity summary;
- rich content items;
- loading/empty/error history 状态;
- scroll behavior。

### SessionComposerDock

UI 层:

- 输入材料和附件;
- textarea;
- send/stop;
- idle/running/completed/failed/cancelled 状态;
- focus 回收;
- 不展示权限、context 剩余或模型/强度。

`packages/ui` 提供可复用视觉 primitives; `apps/worker-web` 负责 Worker session 编排和 engine event mapping。

## 设计 3: Stream rhythm 和 timeline 行为

Stream 的目标不是加花哨动画, 而是让信息按正确节奏进入正确层级。

验收行为:

- 提交后立即看到用户消息和 starting 状态;
- 300ms 内不允许空白等待;
- assistant streaming 时同一段内容不闪烁、不整块替换、不造成明显滚动跳动;
- 用户贴近底部时自动跟随最新输出;
- 用户上滚阅读历史时不抢滚动;
- tool/progress 不压过主回答;
- failed tool 或 failed command 自动展开并保留证据;
- terminal 后 streaming cursor 消失, activity 收敛, composer 回到继续变更。

刷新或重新打开 session 后, 历史 transcript 必须使用同一套视觉层级, 不能和 live 状态是两套 UI。

## 设计 4: Rich transcript rendering inventory

Codex-like 的会话质感来自一套内容对象渲染系统, 不是一个简单 markdown div。第一版至少覆盖 P0 inventory, P1 进入设计并按实施风险分批。

### P0: 第一版必须覆盖

| 类别 | 设计要求 |
|---|---|
| Prose rhythm | 段落、heading、粗体、斜体、引用、分隔的间距和字重稳定。 |
| Lists | 有序、无序、嵌套、任务列表; 缩进稳定; streaming 半截不破版。 |
| Inline semantics | inline code、状态词、路径、命令、分支名、文件名使用低对比 token 背景, 支持复制语义。 |
| Links | URL、markdown link、localhost link、external source link 有图标、hover、打开方式和复制地址。 |
| Resource cards | 网页、文件、目录、文档、图片、浏览器页渲染为 typed card, 包含类型、标题、位置、状态和打开入口。 |
| Commands | 命令、输出、失败输出、复制、wrap、展开/收起; 视觉上要能轻量嵌入 timeline/activity。 |
| Tool/activity | 读取文件、搜索、运行测试、打开浏览器、查看文档等活动有动词、对象、状态和摘要。 |
| Turn actions | assistant turn 底部有低调动作栏: 复制、反馈、打开、引用、来源。 |

### P1: 设计纳入, 可分批实现

- diff stats、diff summary、unified diff、file diff card;
- code snippet: 语言标签、复制、横向滚动、streaming fence repair、长代码折叠;
- table/data: 小表格、CSV/JSON 摘要、字段对齐、横向滚动;
- document/media card: docx、pdf、image、web preview 的打开入口;
- errors/warnings: warning、error、cancelled、lost 的区分颜色和文案;
- progress/checklists: completed、running、pending checklist 的独立 rhythm。

### P2: 后续增强

- diagrams;
- full browser/document/image preview panel。

### 当前差距

- `AssistantMarkdown` 目前是基础 parser, 支持段落、list、quote、link、inline code、粗斜体、code fence, 但缺 heading/table/task list、typed links、rich inline semantics 和 turn actions。
- `ArtifactStrip` 是 generic item, 缺网页/文档/文件/目录/图片的类型化卡片和打开方式。
- `CommandBlock` 有复制、wrap、展开, 但视觉偏重, 需要变成 timeline 内更轻量的 command/activity object。
- Transcript view model 还没有 resource/diff/table/action rail 等 first-class item。

## 设计 5: 视觉材质和 composer

视觉目标: 低调、顺滑、有桌面工作台质感, 不是 admin 面板, 也不是卡片堆。

### 材质原则

- 暗色主背景避免纯黑硬度;
- composer、用户 bubble、activity/resource 使用柔和浮层;
- 边框低对比, 阴影用于浮动层级而不是重卡片;
- 发送/停止是唯一强动作点;
- 文本字号和行距服务可扫读, 不使用 hero-scale type。

### Composer 状态

| 状态 | 行为 |
|---|---|
| idle | 输入目标或要求后续变更。 |
| submitting/running | send 变 stop; 输入区可准备下一条, 但不误触提交。 |
| completed | 恢复 send, 保持 focus, 允许继续追问。 |
| failed/cancelled | 保留上下文, 明确可重试或继续。 |

Composer 只显示输入材料、运行状态、发送/停止和继续追问入口。不展示权限、context 剩余或模型/强度。

## 数据流

1. Snapshot: `fetchSessionDetail` 提供历史 invocations/events, 刷新后还原同一套 timeline 层级。
2. Live stream: `useInvocationEvents` 跟随当前 invocation; SSE 失败时保留 polling fallback。
3. Timeline VM: mapper 输出 first-class items。
4. Render layer: rich transcript primitives 消费 view model。
5. Control loop: ComposerDock 触发 submit/cancel/follow-up, 状态回流到 ChatSurface。

Worker runtime 仍拥有 engine bridge events、invocation status、redacted payload 和 resource references。worker-web 只消费 Worker broker API 和 redacted event surface。

## 错误处理

- Snapshot 失败: timeline 显示 history unavailable, composer 仍可继续输入。
- SSE 断开: 保留最后稳定内容, 转 polling fallback, 不清空 stream。
- Unsafe link/resource: 降级为纯文本, 不渲染危险 href。
- Unknown resource kind: 使用 generic resource card, 不丢标题、位置和状态。
- Failed tool/command: 自动展开失败项并保留输出证据。
- Cancelled/lost: composer 回到可继续状态, timeline 明确显示终态。
- Redaction: UI 不显示 raw chunks、secret、chain-of-thought 或未脱敏 tool payload。

## 测试验收

### Unit tests

- mapper tests: bridge events 到 timeline VM, 覆盖 tool replace、progress slot、resource refs、terminal status、unknown fallback;
- rich rendering tests: AssistantMarkdown、ResourceCard、Command、Diff、Table、ActionRail 的语义、sanitization、streaming repair;
- ComposerDock tests: idle/running/completed/failed/cancelled、send/stop、材料 chips、focus、disabled 状态;
- scroll tests: stick-to-latest、用户上滚不抢滚动、composer reserve、refresh restore。

### Browser proof

用真实 worker-web 跑一次 session:

- 从 empty session 提交;
- 看到 starting feedback;
- 看到 streaming assistant;
- 看到 tool failure 自动展开;
- 看到 resource card 和 turn action rail;
- 完成后继续追问;
- 刷新后 transcript 使用同一套视觉层级。

### Visual checks

桌面和移动 viewport 都要证明:

- 页面非空;
- 文本不重叠;
- composer 不漂移;
- resource/action 可见;
- streaming 不造成明显滚动跳动;
- assistant rich content 不破版。

实现完成后, 因为这是代码变更, 需要运行最小新鲜验证并运行 code-review-graph。设计文档本身是 docs-only, 不需要 code-review-graph。

## 第一版通过标准

- 真实 session 从输入到完成, timeline、composer、activity、rich content 的状态转换一致。
- stream 不硬跳, 失败不丢证据, 刷新后 transcript 不换视觉语言。
- P0 rendering inventory 被覆盖: prose/list/inline/link/resource/command/activity/action rail。
- 没有引入 Host/Soul UI 概念。
- 没有展示权限、context 剩余或模型/强度。

## 后续计划输入

writing-plans 应按以下顺序拆解:

1. 先扩 timeline VM 和 mapper tests。
2. 再实现 rich transcript primitives 的 P0 inventory。
3. 再实现 SessionTimeline 和 ComposerDock。
4. 再接入 ChatSurface。
5. 最后做 browser proof、visual checks、package-local tests 和 code-review-graph。

计划需要保持 Web-only scope。API/daemon 只在已有 broker response 缺少 typed resource metadata 时做最小补充, 不改变 follow-up 语义。
