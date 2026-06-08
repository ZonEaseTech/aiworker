# Soul dist 生成产物迁移设计

## 结论

`souls/*/dist` 应该成为本地和 CI 构建生成的发布包内容，而不是 Git 维护的源码资产。仓库的 Soul 源码真相应收敛到 `soul.config.ts` 与 `engine/**`；`dist/soul.descriptor.json` 和 `dist/engine-assets/**` 由 SDK 在构建时生成，并在 CLI、npm 包和 standalone release 打包时复制进最终发布产物。

这不是单纯的 `.gitignore` 清理。当前 official Soul registry、release copy 和若干测试直接读取 `souls/<id>/dist/soul.descriptor.json`。因此迁移必须先补齐 official Soul 构建与校验链路，再取消 Git 跟踪。

## 用户问题

Soul 作者改的是能力源文件：workspace 入口文件、skills、native MCP 占位和 `soul.config.ts`。当前仓库同时维护这些源文件和生成后的 `dist` 快照，带来三个问题：

- PR 容易出现重复 diff，reviewer 需要同时看源文件和构建副本。
- source 与 dist 可能漂移，发布包可能复制到旧快照。
- `dist` 内包含 native MCP 文件副本；即使当前是占位，也不应该鼓励把构建副本作为手写资产长期维护。

期望结果是：开发者只提交 Soul 源文件，构建和发布流程负责生成、校验并打包完整 descriptor bundle。最终用户体验不变，仍通过 official app registry 或 `dist/soul.descriptor.json` 安装 Soul。

## 当前证据

- Canonical docs 定义 `dist/soul.descriptor.json` 是安装入口，`dist/engine-assets/` 是 build output。
- `packages/soul-sdk` 的 `buildSoul()` 会删除并重建 Soul 根目录下的 `dist`，说明它是派生产物。
- `packages/worker-runtime/src/soul-app/official.ts` 当前列出五个 official Souls 的 `souls/<id>/dist/soul.descriptor.json`。
- `apps/worker-cli/scripts/build-publish-manifest.ts` 当前把 `souls/<id>/dist` 复制到 `apps/worker-cli/dist/official-apps/<id>/dist`。
- 当前 Git 已跟踪 `souls/**/dist/**` 文件，顶层 `.gitignore` 的 `dist/` 不会影响已跟踪文件。

## 非目标

- 不改变 descriptor v1 协议形状。
- 不让 Host 或 Workbench 读取 Soul source。
- 不把 Soul UI、app-owned API、capability 或领域业务字段重新引入 descriptor。
- 不改变最终用户安装 official Soul 的体验。
- 不在本迁移中引入远端发布系统或 Host 分发能力。

## 方案比较

### 方案 A：继续跟踪 `souls/*/dist`

优点是风险最低，当前发布路径无需改变。缺点是 source 与 dist 双重维护，长期会扩大 review 噪音和漂移风险。这个方案只适合短期过渡。

### 方案 B：直接删除 tracked `dist`

优点是立刻符合“构建产物不进 Git”的原则。缺点是当前 official registry、CLI release copy、browser/CLI smoke 和部分架构测试会直接缺文件。这个方案会把一个源码卫生问题变成发布链路故障，不建议采用。

### 方案 C：先生成、校验、打包，再取消跟踪

推荐采用。先把 official Soul 构建变成 CLI build/release 的前置步骤，并添加 freshness/contract 检查；确认 fresh clone 可以从 source 生成完整 official descriptor bundle 后，再 `git rm --cached` tracked `souls/**/dist/**`。这能保持用户体验不变，同时去掉重复快照。

## 目标状态

Git 维护：

```text
souls/<id>/
  package.json
  soul.config.ts
  engine/
    workspace/
    skills/
    mcp/
```

构建生成但 Git 不维护：

```text
souls/<id>/dist/
  soul.descriptor.json
  engine-assets/
    workspace/
    skills/
    mcp/
```

发布产物继续包含：

```text
official-apps/<id>/dist/
  soul.descriptor.json
  engine-assets/
```

## 架构设计

新增或收敛一个 official Soul build 步骤，输入来自 `packages/worker-runtime` 的 official Soul 列表或等价的单一 registry。该步骤逐个运行对应 Soul package 的 `build` 脚本，生成 `souls/<id>/dist`。

`apps/worker-cli/scripts/build-publish-manifest.ts` 在复制 official apps 前必须确保 official Soul dist 已生成。最保守的实现是让 root build 或 worker-cli build 显式运行全部 official Soul build；更强的实现是把 build-publish-manifest 内部改为调用一个可测试的 `ensureOfficialSoulDists()`，然后再复制。

official runtime registry 仍可保留 descriptor path 语义：开发仓库内解析到 `souls/<id>/dist/soul.descriptor.json`，发布包内解析到 `official-apps/<id>/dist/soul.descriptor.json`。区别是开发仓库的 `dist` 来自构建步骤，不来自 Git 快照。

## 数据流

1. 作者修改 `souls/<id>/soul.config.ts` 或 `souls/<id>/engine/**`。
2. `bun run --filter <official-soul-package> build` 调用 SDK。
3. SDK 生成 `souls/<id>/dist/soul.descriptor.json` 和 `dist/engine-assets/**`。
4. CLI build/release 复制生成后的 `dist` 到 `apps/worker-cli/dist/official-apps/<id>/dist`。
5. npm package 和 standalone release 从 `apps/worker-cli/dist/official-apps` 打包。
6. Worker 运行时只消费 packaged descriptor，不读取 Soul source。

## 错误处理

- official Soul build 失败时，CLI build/release 失败，不允许继续复制旧 dist。
- descriptor 缺失、不是 descriptor v1、资源引用缺文件或引用逃逸 official app root 时，现有 release artifact 检查继续失败。
- fresh clone 没有本地 `dist` 时，运行 build 或相关 smoke 前必须自动生成，而不是要求开发者手动恢复 tracked 文件。
- 如果 source 改动导致生成 descriptor 与协议不一致，focused tests 应在发布前发现。

## 测试策略

- 增加或调整 build-publish-manifest 测试，证明复制 official app 前会从 source 生成或要求生成后的 dist。
- 增加 freshness 测试或脚本：对 official Souls 重建 `dist` 后，确认工作树中的 generated output 与当前 source 可一致生成；迁移完成后该测试不依赖 tracked dist。
- 保留 release artifact smoke：确认 npm 和 standalone 包里仍包含 `official-apps/<id>/dist/soul.descriptor.json` 和 descriptor 引用的 engine assets。
- 保留 browser/CLI golden path：确认 Freeform 和 official Souls 的安装、启用、投影路径不因 untrack dist 改变。
- 迁移 implementation 结束前运行最小证明面：official Soul build、相关 focused tests、`docs:check`、`test:contracts`、`git diff --check` 和代码变更对应的 `crg:review`。

## 迁移顺序

1. 补 official Soul build helper 或脚本，覆盖五个 official Souls。
2. 修改 worker-cli build/release，使复制 official apps 前必定有 freshly built dist。
3. 调整依赖 repo-local `souls/*/dist` 的测试，让它们显式构建或使用 build fixture。
4. 加 generated output freshness gate，防止发布复制旧结果。
5. `git rm --cached -r souls/*/dist`，保留本地生成行为并依赖 `.gitignore` 忽略新 dist。
6. 跑 smoke 和 release packaging 证明最终发布包仍包含完整 official descriptor bundle。

## 验收标准

- 修改 `souls/<id>/engine/**` 后，PR 不需要提交 `souls/<id>/dist/**`。
- fresh clone 后运行 root build 可以生成全部 official Soul dist。
- `apps/worker-cli/dist/official-apps/<id>/dist` 在 CLI build 后完整存在。
- npm package 和 standalone release 仍包含 official Soul descriptor bundle。
- Worker official registry 可以在开发仓库和发布包中解析并安装 official Souls。
- CI 能发现 descriptor 无效、资源引用缺失、发布包缺 official assets、source/build 漂移和密钥泄漏风险。
