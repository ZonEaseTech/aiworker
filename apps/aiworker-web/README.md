# AIWorker Web

AIWorker Web 是面向管理员的薄控制台，只管理 AIWorker-owned metadata：assignment、provisioning plan、Soul release、Paseo environment、audit 与 redacted handoff。

它不渲染、不代理、不观察 Paseo workspace/session/runtime/provider traffic。

## 开发命令

```bash
bun run dev:aiworker-web
bun run test:aiworker-web
bun run build:aiworker-web
```

## shadcn 约束

本应用通过官方 CLI 初始化并维护组件：

```bash
bunx --bun shadcn@latest info --cwd apps/aiworker-web
bunx --bun shadcn@latest docs button card sidebar
bunx --bun shadcn@latest add button card sidebar --yes --cwd apps/aiworker-web
```

主题 token 与 sibling `aiworker-next` 的 shadcn `radix-mira`/`phosphor`/zinc 基线保持一致；合同测试在 `tests/architecture/aiworker-web-contract.test.ts`。
