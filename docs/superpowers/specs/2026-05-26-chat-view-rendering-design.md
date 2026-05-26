# 通用 Chat View Renderer 设计

## Decision

AIWorker 要把现在偏“消息列表”的 chat/transcript 展示升级为 `packages/ui`
里的通用渲染组件，而不是为某一个 shell 或产品层定制一块视图。

推荐方案是新增一组通用 primitives：

```text
ChatThread
  -> TranscriptTurn
  -> TranscriptActivityGroup
  -> CommandBlock
  -> AssistantMarkdown
  -> StreamingPlaceholder
  -> ArtifactStrip
```

组件只理解通用 transcript view model：turn、message、activity、command、
tool call、status、markdown、artifact reference。业务对象、工作流语义、
workspace/session/chat 的产品归属都由消费方或 Soul-owned/app-owned surface
负责。

## Context

现有 `packages/ui/src/components/session-thread.tsx` 只有一个简单的
`messages` 列表模型：

- message 只区分 `user`、`status`、`assistant`；
- body 是直接传入的 `ReactNode`；
- artifact 只是普通 item；
- 没有 markdown 渲染、代码块工具栏、命令折叠、activity grouping、
  streaming 预占、长内容懒渲染或历史 turn 压缩。

这种实现能用，但当 chat 过程里混入 engine/tool/status/command 输出时，
用户需要自己从线性流水里找“我问了什么、系统做了什么、最终回答是什么”。

Codex Desktop 的可借鉴点不是它的私有数据模型，而是信息层级：

- 用户意图和最终回答是主阅读路径；
- 命令、文件探索、tool call 和状态是可折叠 activity；
- 代码块有语言标题、复制、换行等操作；
- streaming 时先预占回答区域，减少滚动跳动；
- 长历史内容按 turn 分组、压缩和懒渲染；
- markdown 支持 bold、italic、inline code、fence code 等常见表达。

## Boundary Guardrails

这是本设计最重要的约束。

- 本设计只做 `packages/ui` 通用组件。
- 不把 chat/transcript 叙事写成某个 shell 拥有的 session view。
- 不从 `session`、`turn`、`assistant_delta` 这类字段名推断产品归属。
- workspace、session、chat、transcript、artifact、app-owned work
  都是 worker 之后的产品路径，不能被上收到 Host 产品层。
- Host 最多是 shell、mount 或 locator 的消费者之一；它不拥有
  session/chat/transcript 语义。
- 通用组件不读取数据、不调用 API、不解释 HR/QA/DevOps 等领域语义。
- 如果消费方需要领域标签、领域动作、确认流或业务状态，必须显式通过 props、
  slots 或 app-owned view model 传入。

## Goals

- 提供一套友好的通用 chat/transcript renderer primitives。
- 支持 turn frame、activity grouping、命令块折叠、markdown、artifact strip
  和 streaming placeholder。
- 默认降低工具流水噪音，保留可追溯详情。
- 长内容和历史 turn 不拖慢页面，也不让滚动位置频繁跳动。
- 视觉、交互、图标、radius、theme token 跟随 `packages/ui` 的 shadcn-first
  约束。
- 保留现有 `SessionThread` 的迁移路径，避免一次性破坏消费者。

## Non-Goals

- 不实现某个业务应用的 chat workflow。
- 不做 engine 原始事件解析器；原始 event 到 view model 的映射由消费方负责。
- 不让组件判断 HR profile、QA release verdict、review、lesson 或 artifact
  的业务意义。
- 不复制 Codex Desktop 的私有 bundle、数据结构或视觉细节。
- 不引入 lucide 图标；图标继续使用 `packages/ui/components.json` 当前声明的
  `hugeicons`。
- 不在第一版做完整 rich text 编辑器、全文搜索、跨 turn 引用跳转或无限历史
  数据加载。

## View Model Contract

组件入口接收消费方准备好的 view model。建议第一版类型保持窄而可扩展：

```ts
interface ChatThreadModel {
  ariaLabel: string
  turns: TranscriptTurnModel[]
}

interface TranscriptTurnModel {
  id: string
  collapsed?: boolean
  items: TranscriptItemModel[]
  meta?: ReactNode
  title?: ReactNode
}

type TranscriptItemModel =
  | { id: string, kind: 'user-message', body: ReactNode }
  | { id: string, kind: 'assistant-markdown', markdown: string, streaming?: boolean }
  | { id: string, kind: 'activity-group', activities: TranscriptActivityModel[], defaultCollapsed?: boolean }
  | { id: string, kind: 'command', command: string, language?: string, output?: string, status?: ActivityStatus }
  | { id: string, kind: 'artifact-strip', artifacts: TranscriptArtifactModel[] }
  | { id: string, kind: 'status', tone?: 'muted' | 'info' | 'warning' | 'danger', body: ReactNode }
```

第一版不要求把类型一次性定死。实现时可以把 `CommandBlock`、
`TranscriptActivityGroup`、`AssistantMarkdown` 等拆成独立组件，让消费者也能
单独组合。

## Component Design

### ChatThread

`ChatThread` 是外层列表，负责 `role="log"`、间距、滚动友好布局和 turn 顺序。
它不做数据加载、不知道当前 app、worker、workspace 或 session。

### TranscriptTurn

`TranscriptTurn` 是单轮框架。默认当前 turn 展开，历史 turn 可以由消费方传入
`collapsed` 状态。折叠后显示简短 summary，例如“3 条活动、1 条回答、2 个产物”。

组件只负责渲染折叠外观和可访问属性；是否折叠、何时自动折叠由消费方控制。

### TranscriptActivityGroup

activity group 用于把探索、命令、tool call、状态更新等过程性内容聚合成一行
可展开 summary。

默认策略：

- 成功的低风险活动默认折叠；
- 运行中、失败、等待确认或需要用户注意的 activity 默认展开或突出；
- 多条相邻活动可以显示为 “Ran 3 commands”、
  “Explored 8 files” 这类通用 summary；
- 原始命令、输入、输出、错误和 payload 进入展开区域。

组件不自己识别 `rg`、`sed`、`Bash`、MCP tool 等原始事件。消费方传入已经归类
好的 `activities`、summary 和 detail。

### CommandBlock

`CommandBlock` 负责命令和输出的可读展示：

- header 显示 shell/language/title；
- action 区提供复制、换行切换、折叠/展开；
- 输出默认限制高度，长输出可展开；
- 失败命令显示 warning/danger tone；
- 代码和命令区域使用 `dir="ltr"`，避免中英混排破坏命令可读性。

复制失败时保留原内容，不阻断主视图。

### AssistantMarkdown

`AssistantMarkdown` 负责 assistant 正文。第一版支持：

- paragraph；
- bold；
- italic；
- inline code；
- fenced code block；
- ordered/unordered list；
- link；
- blockquote。

streaming 状态下需要先做轻量修补：未闭合 code fence、inline code、bold/italic
不能把后续 UI 撑坏。解析失败时退回 plain text。

Mermaid、KaTeX、复杂 directive、图片/video embed 留到后续版本。

### StreamingPlaceholder

`StreamingPlaceholder` 用于回答开始前或 tool prework 阶段的预占块：

- 保持最小高度，避免回答区域突然出现导致滚动跳动；
- 可显示简短状态文案；
- 支持 loading shimmer，但必须使用 semantic token；
- `aria-live` 应克制，避免每个 delta 都打扰读屏器。

### ArtifactStrip

`ArtifactStrip` 渲染产物引用，而不解释产物业务意义。

它只展示消费方传入的 title、description、status、href/action slot。HR profile、
QA report、review artifact 等具体意义留在 owning app。

## Rendering Behavior

- 主路径按“用户消息 -> activity summary -> assistant markdown -> artifacts”组织。
- 工具细节默认不抢主阅读路径，但展开后能看到证据。
- 历史 turn 的折叠状态由消费方持有；组件暴露 `onCollapsedChange`。
- 正在运行的 activity 和失败 activity 不应被完全埋进折叠区。
- 长 markdown、长 output 和历史 turn 使用 `content-visibility`、稳定高度或后续
  virtualization，避免大 transcript 卡顿。
- 所有按钮都有可访问名称；折叠控件使用 `aria-expanded` 和 `aria-controls`。

## Component Library Preflight

已检查 `packages/ui` 现状：

- `SessionThread`：当前过于线性，可作为兼容 wrapper 或迁移对象。
- `Collapsible` / `CollapsibleGroup`：可承载 activity group 折叠。
- `Button` / `Badge` / `Item` / `Alert` / `Skeleton` / `Tooltip`：可复用为
  command header、status、placeholder 和 artifact strip。
- `ScrollArea`：可用于长输出区域，但不应滥用嵌套滚动。
- `packages/ui/components.json`：当前 `iconLibrary` 是 `hugeicons`。

实现阶段新增 UI 必须：

- 使用 shadcn semantic CSS variables 和 Tailwind v4 token；
- 不新增 feature 级 hex 字面量；
- 不使用 lucide；
- 不做 card-in-card；
- 不把可复用 primitives 留在 app-local 文件里；
- 跑 `bun run ui:check` 或等价 UI governance 检查。

## Migration Shape

第一版建议保留现有 `SessionThread` 导出，避免破坏当前测试和消费者。

迁移方式：

1. 新增通用组件文件，例如 `chat-thread.tsx`、
   `transcript-activity-group.tsx`、`command-block.tsx`、
   `assistant-markdown.tsx`。
2. 让 `SessionThread` 变成薄兼容层，继续支持旧 `messages` props。
3. 新消费者直接使用新的通用 primitives。
4. 后续再根据真实消费情况决定是否废弃旧 `SessionThreadMessage` 模型。

命名上优先使用 `Chat*` / `Transcript*`，避免继续强化“session thread 属于某个
shell”的误读。

## Error Handling

- unknown item 使用 generic status/fallback，不丢内容。
- markdown parse 失败回退 plain text。
- command output 过大时先截断展示，并提供展开或外部引用 slot。
- failed activity 默认可见，避免错误被折叠掉。
- artifact 缺 title 时使用消费方传入的 fallback；组件不猜业务名。
- copy API 不可用时隐藏 copy action 或显示非阻断错误状态。

## Testing

设计进入实现后，最小验证集：

- `packages/ui` component tests：
  - turn 折叠/展开和 `aria-expanded`；
  - activity group summary/detail；
  - command block copy/wrap/long output；
  - assistant markdown bold/italic/inline code/fenced code；
  - streaming placeholder 稳定渲染；
  - artifact strip 不产生 nested cards；
  - legacy `SessionThread` 兼容。
- `bun run --filter '@zonease/aiworker-ui' test`
- `bun run --filter '@zonease/aiworker-ui' typecheck`
- `bun run ui:check`
- 需要真实页面接入时，再做浏览器截图和 light/dark 检查。
- 生产代码改动后跑 code-review-graph；仅文档阶段跳过并说明。

## Open Implementation Notes

- markdown renderer 可以先从小语法集实现，避免第一版引入大而不可控的渲染面。
- 如果后续要做 syntax highlighting，应采用懒加载或 viewport 附近再渲染。
- virtualization 可以先留接口和布局约束，除非真实 transcript 已经证明需要。
- activity parser 不属于 `packages/ui` renderer；它可以在消费方、SDK helper
  或后续独立包中出现。

## Approval State

用户已认可“友好的 Codex-like 效果”，并明确纠正边界：当前目标是通用组件，
不是 Host session view。本文按该口径收敛。
