# PLAN-047 优化 npx / bunx CLI 启动体验

- **status**: completed
- **createdAt**: 2026-04-30 15:33
- **approvedAt**: 2026-04-30 15:36
- **relatedTask**: BUG-039

## 现状

调查结论：

1. `apps/cli/package.json` 的发布入口是 `bin.aiworker = ./dist/aiworker.js`。
2. `apps/cli/scripts/build-publish-manifest.ts` 会在 `apps/cli/dist/package.json` 中把发布入口改成 `bin.aiworker = ./aiworker.js`，并把 `drizzle/` 与 `web/` 复制进 dist。
3. `apps/cli/src/aiworker.ts` 与当前 `apps/cli/dist/aiworker.js` 都是 Bun entrypoint，shebang 为 `#!/usr/bin/env bun`。
4. CLI bundle 依赖 Bun runtime 能力，历史任务 FEAT-027 已记录它不能直接裸 Node 运行。
5. 已发布 `@zonease/aiworker-cli@0.4.8` tarball 中 `aiworker.js` 存在且可执行，但没有 Bun 时 bin 入口会在 shebang 层失败，应用代码没有机会输出友好错误。
6. 安装 Bun 后，`bunx @zonease/aiworker-cli@0.4.8 --version` 和 `bun apps/cli/dist/aiworker.js -h` 都能正常工作。

## 方案

实现一个很薄的 POSIX shell 预检 shim，把 npm 包的 `bin.aiworker` 从 Bun bundle 切换到 shell shim，真实 Bun bundle 改名为 `aiworker-bun.js`。这样 `npx` 在缺 Bun 时能输出友好提示，同时 `bunx` / Bun-only 环境不需要额外 Node wrapper。

建议改动：

1. 调整 `apps/cli/package.json` 的 `build:bundle`，让 Bun bundle 输出为 `dist/aiworker-bun.js`。
2. 在 `apps/cli/scripts/build-publish-manifest.ts` 中：
   - 复制 `dist/aiworker.js` shell shim，shebang 为 `#!/usr/bin/env sh`；
   - `dist/package.json` 继续声明 `bin.aiworker = ./aiworker.js`；
   - `files` 增加 `aiworker-bun.js`；
   - 保持 `README.md`、`drizzle/`、`web/` 复制逻辑不变。
3. Shell shim 行为：
   - 按顺序查找 `AIWORKER_BUN_BIN`、PATH 中的 `bun`、`$BUN_INSTALL/bin/bun`、`$HOME/.bun/bin/bun`；
   - 找到 Bun 时用 `exec` 执行同目录 `aiworker-bun.js` 并透传 argv/stdin/stdout/stderr/exit code；
   - 找不到 Bun 时输出明确提示：AIWorker CLI 需要 Bun、安装命令、安装后可用 `bunx @zonease/aiworker-cli ...` 或 `npx @zonease/aiworker-cli ...`，无 Bun 可改用 GitHub Release standalone binary；
   - 可选支持 `AIWORKER_BUN_BIN=/path/to/bun` 给非标准安装路径。
4. 加一个聚焦测试，覆盖 shim 在无 Bun PATH 下返回友好提示，以及在指定 fake Bun 时会转发到 `aiworker-bun.js`。
5. 更新 README 的安装段，明确 `npx` 的 runtime 要求和推荐用法。

## 风险

- Shell shim 只能改善 `npx` / `npm install -g` 的错误体验；真实 CLI 仍需要 Bun runtime，除非用户改用 GitHub Release standalone binary。
- shell shim 依赖 Unix-like `sh` / `readlink`，覆盖当前 Linux/macOS 主部署和用户复现场景；Windows 原生 npm 体验如需一等支持，应另开跨平台 launcher 任务。
- 需要确保 systemd/install 逻辑仍能把当前 bin 路径渲染成可执行入口，不假设 bin 文件本身一定是 Bun shebang。
- 需要确保 release workflow 的 single-file binary 编译仍直接使用 `apps/cli/src/aiworker.ts`，不受 npm shim 影响。

## 工作量

预计触碰文件：

- `apps/cli/package.json`
- `apps/cli/scripts/build-publish-manifest.ts`
- `apps/cli/scripts/aiworker-bin-shim.sh`
- `apps/cli/scripts/aiworker-bin-shim.test.ts`
- `README.md`
- `docs/task/BUG-039.md`
- `docs/plan/PLAN-047.md`

聚焦验证：

1. `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' test`
2. `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' build:bundle`
3. 临时目录 npm install `apps/cli/dist` 后：
   - 无 Bun PATH：`./node_modules/.bin/aiworker -h` 输出友好提示；
   - 有 Bun PATH：`./node_modules/.bin/aiworker --version` 输出当前版本；
   - `bunx ./apps/cli/dist --version` 或等价本地 tarball smoke 正常。
4. `git diff --check`

## 备选方案

1. 只更新 README。最小，但无法解决用户已经看到的 `env: bun` 原始错误。
2. 把 CLI 改成 Node runtime。范围过大，因为当前 gateway、worker、sqlite、server 运行路径都依赖 Bun 能力。
3. npm 包直接发布 standalone binary。体验最好，但需要平台分包或 install-time 下载逻辑，发布和安全面明显更大，不适合作为这次快速修复。

## 批注

- 2026-04-30 15:33 用户提供 `npx @zonease/aiworker-cli -h` 失败输出，要求优化 npx / bunx 使用体验。
- 2026-04-30 15:36 用户确认 runtime 只兼容 Bun，并回复 `proceed` 批准实现。
- 2026-04-30 15:47 完成实现。实际采用 shell shim，避免 Bun-only 用户因为 `bunx` 被迫依赖 Node。

## Verification

- Passed: `PATH="$HOME/.bun/bin:$PATH" bun test apps/cli/scripts/aiworker-bin-shim.test.ts`
- Passed: `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' test`
- Passed: `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' typecheck`
- Passed: `PATH="$HOME/.bun/bin:$PATH" bun run lint`
- Passed: `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' build`
- Passed: npm-installed `apps/cli/dist` with Bun on PATH reports `aiworker/0.4.8 linux-x64 node-v24.3.0`.
- Passed: npm-installed `apps/cli/dist` with fake HOME/BUN_INSTALL and no Bun on PATH exits 127 with the actionable Bun install / `bunx` / standalone binary message.
- Passed: `npm pack` from `apps/cli/dist` includes executable `aiworker.js` shell shim, executable `aiworker-bun.js`, `drizzle/`, and `web/`.
- Passed: `npx -y ./tmp/zonease-aiworker-cli-0.4.8.tgz --version` reports `aiworker/0.4.8 linux-x64 node-v24.3.0`.
