# AIWorker 产品定位与 Custom Soul App 设计

## 问题陈述

AIWorker 面临的核心质疑：「这跟我直接用 Cursor IDE 新建一个目录写 prompt 有什么区别？」

答案是：**AIWorker 不跟 Cursor 在 AI 层竞争，而是在「领域封装」层提供 Cursor 做不到的价值。**
Cursor 是开发者的 AI 代码编辑器；AIWorker 是把 AI 封装进领域工具（HR、QA 等）之后，让业务
用户感知到"领域工具"而不是"prompt 工程"。

## 产品叙事

> Cursor 让你自己写 prompt 让 AI 干活。AIWorker 让你打开一个 HR 工具——这个工具背后有 AI，
> 但你不必知道。

与 Open Design 的对比：
- Open Design = 设计师的 AI 协作工作台
- AIWorker = 每个部门的 AI 工作台，在同一个企业空间里共享权限、审计和团队上下文

## 战略路径

**双线架构：单品 standalone + 平台聚合**

- **单品线**：每个 Soul App 可独立运行（standalone），HR 部门可单独采购使用
- **平台线**：多个 Soul App 在 AIWorker Host 内聚合成企业工作台，统一 team space、权限、审计

前期用 HR Soul App 自证价值，卖给 IT/HR 决策者；后续 QA、DevOps 等 Soul App 跟进，
证明这不是「一个 HR 工具」而是「一种新的工作方式」。

## Custom Soul App

### 定位

`aiworker-custom` 是一个与 HR、QA 平级的标准 Soul App，领域是「自由探索」。它不绑定任何
业务领域，提供高度自由的 worker 环境用于 runtime overlay skills/MCP/entry files。

### 与 Cursor 裸目录的对比

| | Cursor 目录 | AIWorker + Custom Soul |
|---|---|---|
| 环境 | 一次性、随手建 | 有 workerId、可回溯、同一 worker 下多 workspace |
| 引擎 | 绑死 Cursor | manifest 声明引擎支持，Host 桥接切换 |
| 知识注入 | 手动复制粘贴 skills 文件 | Worker Configuration 对话框管理，projection 写入 |
| 升级路径 | 无 | overlay assets 沉淀为 Soul App engine-assets |
| 协作潜力 | 无 | 同一 Soul App 下不同 worker/workspace 可共享 |

### 设计

```
apps/aiworker-custom/
  soul-app.manifest.json    # 标准 manifest，soulId = "aiworker-custom"
  engine-assets/
    workspace/
      AGENTS.md             # 极简，说明这是一个自由沙盒
      CLAUDE.md             # @AGENTS.md
    skills/                 # 空，用户通过 overlay 补充
    mcp-clients/            # 空，用户通过 overlay 补充
  host-adapter/
    index.ts
    mounted/host-mounted.ts
    standalone/standalone.ts
```

Custom Soul App 的 `engine-assets/` 极简，能力通过 Worker Configuration 对话框动态注入。

### 架构约束

- `soulId` 保持必填，不开洞绕过 Soul App 框架
- Custom Soul 与 HR/QA 平级，安装、启用、创建 worker/workspace/session 流程完全一致
- 差异仅在于 engine-assets 厚度

## 升级路径：Custom → 正式 Soul App

### Step 1：验证期（Custom Worker 内）
用户在 Custom Worker 里反复叠加、调整 skills/MCP/entry files，跑 session 验证效果。
Overlay assets 归 Worker Configuration 对话框管，随时改随时 project。

### Step 2：固化期（抽出 Soul App）
工作流稳定后，用 `aiworker app create <app-id>` 脚手架生成 Soul App 目录，把 overlay
assets 内容搬进 `engine-assets/`，补上 manifest、workspace 模板、领域 UI 入口。

### Step 3：分发期（安装使用）
```bash
aiworker app install <manifest>
aiworker app enable <id>
```
创建 Soul worker 即开箱即用。团队不再需要各自配 skills/MCP。

核心价值：从「我一个人这样用」到「团队标准工作流」的成本极低。Cursor 里调好的 prompt
想分享只能复制粘贴文件；AIWorker 里一个 `aiworker app install` 解决。

## First-Run 体验

初期保持简单：空壳 + 用户自行创建 worker。后续可引导直接创建 Custom Worker。

## 实现要点

1. 创建 `apps/aiworker-custom/` 目录，包含标准 Soul App 结构
2. `soul-app.manifest.json` 声明通用工作区类型
3. 极简 `engine-assets/`（空 skills/MCP，最小 AGENTS.md）
4. `host-adapter/` 基于官方脚手架模板
5. `aiworker app bootstrap official` 增加 custom soul
6. 通过 `aiworker app validate` 和 `aiworker app smoke`
