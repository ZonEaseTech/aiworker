# Executor engines —— 安装与登录手册

每个 worker 容器按需安装所需的 agentic CLI；`GET /api/worker/engines`
（FEAT-018）只做 PATH 查找 + auth 文件存在性检查，并不替你装或登录。本表给出
每个引擎的 npm 包 / 安装方式 / 登录命令 / 推荐的容器内落地方案。

## 镜像预装（FEAT-020）

自 2026-04-23 起，每次 `build-image` workflow 发两个 tag：

| Tag | 大小 | 内容 |
|---|---|---|
| `ghcr.io/zoneasetech/aiworker:<sha>` | ~150 MB | slim，不预装任一 agentic CLI；worker 依旧可以通过 `npx -y ...` 冷启动 fallback 工作 |
| `ghcr.io/zoneasetech/aiworker:<sha>-full` | ~300 MB | slim 之上额外 `npm install -g` 了 claude-code / codex / gemini-cli / qwen-code 四个 CLI（Cursor 另行 opt-in，见 FEAT-021） |

部署到 aiwork 时用 `scripts/deploy.ts install --image-variant=full` 或在
`/opt/aiworker-deploy/.env` 里设置 `AIWORKER_IMAGE_VARIANT_SUFFIX=-full`。
**auth 文件永不进镜像** —— 预装只省你装 binary 的步骤；首次登录仍需在
容器里跑一次对应 CLI 的 login 命令，或把宿主的 auth 文件挂载进来。

> 通用策略：如果用 `-full` 镜像，Dockerfile 已 bake 好版本（和源代码
> `DEFAULT_*_CLI_VERSION` / `agent.defaultVersion` 保持一致）；通过
> `ExecutorProfile.overrides.cmd.cliVersion` 可覆盖到任意 npx 可拉的版本。
> 登录后 auth 文件会缓存在 `$HOME/...`，10 分钟内在 worker 端的
> `/engines` 缓存里透明命中。操作员在 dashboard 的 executor 面板点
> "Refresh" 可立即绕缓存重查。

## http / mcp / cli

这三类引擎不依赖本地 CLI —— 它们走远端 HTTP / MCP / 任意命令，因此探测
结果恒为 `ready`。自 configure panel 上的徽标即可看到 "ready" 标签。

## claude-code <a id="claude-code"></a>

- **npm 包**：`@anthropic-ai/claude-code`
- **二进制**：`claude`
- **auth 文件**：`~/.claude.json`（或 `~/.claude/config.json`）
- **`-full` 镜像里已预装**（pinned 到 `DEFAULT_CLAUDE_CLI_VERSION` = `2.1.112`）。
- **安装**（容器内，用 slim 镜像时）：
  ```bash
  npm i -g @anthropic-ai/claude-code@<pinned-version>
  ```
  也可在首次 `run` 时由 worker 的 npx 回退路径 `npx -y @anthropic-ai/claude-code@<v>`
  拉取 —— 这会导致每次 cold start 重新下载，建议预装或用 `-full` 镜像。
- **登录**：
  ```bash
  claude login          # 交互式浏览器登录
  ```
  服务器无浏览器时使用 Anthropic 控制台生成的 API Key，再以
  `ANTHROPIC_API_KEY=<key>` 环境变量注入 worker 容器（`claude` 自动 fallback
  到 env var，不强依赖 `~/.claude.json`）。
- **推荐落地**：
  1. Dockerfile 里 `RUN npm i -g @anthropic-ai/claude-code@<v>`
  2. 启动脚本判断 `$ANTHROPIC_API_KEY` 或挂载宿主 `~/.claude.json` 到容器
     `/root/.claude.json`（目录权限 `600`）。

## acp <a id="acp"></a>

ACP harness 支持两个 agent：**Gemini CLI** 与 **Qwen Code**。探测结果按 agent
展开为两条记录；dashboard 在 variant picker 右侧分别渲染。

### Gemini CLI <a id="acp-gemini"></a>

- **npm 包**：`@google/gemini-cli`
- **二进制**：`gemini`
- **auth 文件**：`~/.gemini/oauth_creds.json`
- **`-full` 镜像里已预装**（pinned 到 `gemini.defaultVersion` = `0.9.0`）。
- **安装**（slim 镜像时）：
  ```bash
  npm i -g @google/gemini-cli@<pinned-version>
  ```
- **登录**：
  ```bash
  gemini                # 首次启动会打印 OAuth 设备码链接
  ```
  或设置 `GEMINI_API_KEY=<key>` 走 API-Key 路径。
- **推荐落地**：
  1. 基础镜像里预装 CLI。
  2. 首次启动容器时交互式登录一次，然后把生成的 `~/.gemini/` 目录塞进专用
     named volume（例如 `gemini-creds:/root/.gemini`）持续复用。

### Qwen Code <a id="acp-qwen"></a>

- **npm 包**：`@qwen-code/qwen-code`
- **二进制**：`qwen`
- **auth 文件**：`~/.qwen/oauth_creds.json` 或 `~/.qwen/settings.json`
- **`-full` 镜像里已预装**（pinned 到 `qwen.defaultVersion` = `0.0.14`）。
- **安装**（slim 镜像时）：
  ```bash
  npm i -g @qwen-code/qwen-code@<pinned-version>
  ```
- **登录**：
  ```bash
  qwen                  # 同 Gemini，交互式走 OAuth
  ```
  或设置 `QWEN_API_KEY=<key>`。
- **推荐落地**：同 Gemini。

## codex <a id="codex"></a>

- **npm 包**：`@openai/codex`
- **二进制**：`codex`
- **auth 文件**：`~/.codex/auth.json`
- **`-full` 镜像里已预装**（pinned 到 `DEFAULT_CODEX_CLI_VERSION` = `0.121.0`）。
- **安装**（slim 镜像时）：
  ```bash
  npm i -g @openai/codex@<pinned-version>
  ```
  或让 worker 自动 fallback 到 `npx -y @openai/codex@<v> app-server`。
- **登录**：
  ```bash
  codex login
  ```
  将把 access / refresh token 写入 `~/.codex/auth.json`。
- **推荐落地**：
  1. 镜像里预装 CLI。
  2. 启动脚本若检测不到 `~/.codex/auth.json` 则要求操作员在主机侧登录后把
     文件挂到容器 `/root/.codex/auth.json`。

## cursor <a id="cursor"></a>

- **安装来源**：Cursor 官方 CLI —— `https://cursor.com/cli`（**无 npm 包**）
- **`-full` 镜像**：**未预装**（无 npm 包 + glibc / arch 依赖需要运维定制）；FEAT-021 追踪可选的镜像 bake。
- **二进制**：`cursor-agent`
- **auth 文件**：`~/.cursor/cli-config.json` 或 `~/.cursor-agent/auth.json`
  （不同版本命名有差异，探测会依次检查几个常见路径）
- **安装**：
  ```bash
  curl https://cursor.com/install -fsSL | bash
  ```
  安装脚本把二进制放在 `~/.local/bin/cursor-agent`；在镜像里固定到
  `/usr/local/bin/cursor-agent` 会让 PATH 查找更稳定。
- **登录**：
  ```bash
  cursor-agent login
  ```
- **推荐落地**：
  1. Dockerfile 里 `RUN curl https://cursor.com/install -fsSL | bash` 后把产物
     复制到 `/usr/local/bin/`。
  2. 将 `~/.cursor` 挂载为卷以复用登录态。
- **注意**：Cursor CLI 没有 `npx` 回退路径 —— 不安装就是 `not installed`。
