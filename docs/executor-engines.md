# Executor engines —— 安装与登录手册

每个 worker 容器按需安装所需的 agentic CLI；`GET /api/worker/engines`
（FEAT-018）只做 PATH 查找 + auth 文件存在性检查，并不替你装或登录。本表给出
每个引擎的 npm 包 / 安装方式 / 登录命令 / 推荐的容器内落地方案。

## 镜像预装（FEAT-020）

自 2026-04-23 起，每次 `build-image` workflow 发两个 tag：

| Tag | 大小 | 内容 |
|---|---|---|
| `ghcr.io/zoneasetech/aiworker:<sha>` | ~150 MB | slim，不预装任一 agentic CLI；worker 依旧可以通过 `npx -y ...` 冷启动 fallback 工作 |
| `ghcr.io/zoneasetech/aiworker:<sha>-full` | ~320 MB | slim 之上额外 `npm install -g` 了 claude-code / codex / gemini-cli / qwen-code 四个 CLI，并通过官方 curl installer 预装 cursor-agent（FEAT-021） |

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

## Auth recipes <a id="auth-recipes"></a>

`-full` 镜像预装了 agentic CLI 二进制，但 **auth 文件从不打进镜像**。
新 worker 容器启动后必须补一次登录态；有两套推荐做法（FEAT-022）。

### Recipe A — 宿主 auth 目录挂载（推荐日常）

操作员在宿主机上已经登录过某个 CLI（比如已经装了 Claude Code），worker
容器以 `:ro` 挂载复用：

```yaml
# docker-compose.worker.example.yml
volumes:
  - ${HOME}/.claude.json:/root/.claude.json:ro
  - ${HOME}/.codex:/root/.codex:ro
  - ${HOME}/.gemini:/root/.gemini:ro
  - ${HOME}/.qwen:/root/.qwen:ro
```

- **优点**：开机即用；token 在宿主机集中管；容器重建不丢登录态。
- **缺点**：只读挂载意味着 CLI 无法在容器内旋转 token（一般也不需要）；
  权限坏了 CLI 会 fallback 到"请再 login"——检查宿主 auth 文件权限。
- **多 worker 复用**：适合。多个 worker 共享同一份宿主 auth 是安全的
  （bearer auth 在 worker ↔ dashboard 之间走单独路径，CLI auth 与之无关）。

### Recipe B — 容器内 `docker exec` 一次性登录

适合一个 worker 用独立账号，或者宿主机本身没装该 CLI：

```bash
docker compose up -d worker
docker exec -it aiworker-worker-example claude login
docker exec -it aiworker-worker-example codex login
# ... 每个 CLI 各跑一次
```

配合 `docker-compose.worker.example.yml` 里的 `aiworker_worker_home`
volume 就能持续化 `/root` 下所有登录态。

- **优点**：container 独立身份；不依赖宿主上装任何 CLI。
- **缺点**：每建一个新 worker 都要重复一遍；OAuth 浏览器流在
  headless 容器里需要走 device-code 备选路径。

### 通用注意

- Token 永远**不进镜像**。镜像里 bake auth 文件会把 secret 泄露给任何
  `docker pull` 的人。
- 登录后 dashboard engine picker 徽标从 `login required` 变 `ready`；
  因为 availability probe 有 10 分钟 cache，按 Refresh 立即绕缓存重查。
- 轮换 token 通常只需要替换 auth 文件/卷内容 + 重启 worker 容器
  （worker bearer token 和 CLI auth 是两回事，不互相影响）。

## http / mcp / cli

这三类引擎不依赖本地 CLI —— 它们走远端 HTTP / MCP / 任意命令，因此探测
结果恒为 `ready`。自 configure panel 上的徽标即可看到 "ready" 标签。

## Doctor status rubric

`aiworker executor doctor` 的顶部 banner 与正文 `Status:` 使用同一套 surfaced
rubric：blocking descriptor / secret / projection 错误是 `FAIL`；缺 binary、显式声明
后的空 overlay 或其它可继续运行但需要 operator 处理的情况是 `WARN`；fresh-init 的空
overlay 和 ambient runtime/auth 说明是 `PASS` / `INFO`，不会提升为 WARN。

## Soul recommendation contract

`aiworker init` 针对 Soul 打印的 suggested / also-tested executor 只是 onboarding
hint，不是 enforced compatibility matrix。`aiworker executor select` 不会因为某个
engine 不在建议列表中而 warn 或 block；只要 engine 在 AIWorker 支持集合内，operator
可以选择它。实际可用能力仍以外部 executor 自身登录态、host/user 配置和 `executor
doctor` 输出为准。

## Executor turn timeout

`aiworker executor select --timeout-ms <n> --apply` 会把 per-turn hard timeout
持久化到当前 worker 的 executor profile（`executor.overrides.timeoutMs`）。
对 Codex / Claude Code / ACP / Cursor 这类 native executor，未显式设置
`timeoutMs` 时 AIWorker **不会**安装单轮 kill timer；外部 runtime 可以按自己的
原生 session、approval、sandbox 与工具循环继续执行。设置 `timeoutMs` 才表示
operator 明确要求 AIWorker 在该时长后中断子进程。

`aiworker run --timeout-ms <n>` 只控制 CLI 等待终态事件的最长时间；它不会临时改写
worker 配置里的 executor hard timeout，也不会改变正在运行的 native executor。
需要 AIWorker 管理 watchdog 时，先调整 executor profile，再运行任务：

```bash
aiworker executor select --engine codex --timeout-ms 240000 --apply
aiworker run --message "..." --timeout-ms 240000
```

默认发行配置保持 observation-first：native adapter 不强制 Codex approval
policy，不给 Claude Code 添加 `--dangerously-skip-permissions`，ACP 不默认 yolo /
auto-approve。executor 的有效权限、MCP、skill、plugin、sandbox、approval 和登录态
仍由外部 runtime / operator profile 自己管理。

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
- **默认模型**：`claude-code/default` 不主动传 `--model`，让 Claude Code
  使用当前 operator account / host config 的 engine-native 默认模型。只有
  operator 显式配置 `model` / `modelId` 时，AIWorker 才把它作为 best-effort
  hint 转发给 CLI；这不是 AIWorker 的模型兼容性来源。

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
- **事件粒度**：当前 `app-server` 协议下，Codex 的 function call 与 shell command
  lifecycle 会被归一化为 `orchestrator.tool_call`。shell exec 目前以同一 correlation id
  暴露 logical `exec_command` 与实际 `commandExecution` lifecycle；消费者需要更细粒度
  file-level diff 时仍应读取 executor 自身输出或后续 audit，而不能假设 Codex 提供与
  claude-code 完全相同的 built-in tool 名称。

## cursor <a id="cursor"></a>

- **安装来源**：Cursor 官方 CLI —— `https://cursor.com/install`（**无 npm 包**）
- **`-full` 镜像里已预装**（自 FEAT-021 起）：build 时跑
  `curl -fsSL https://cursor.com/install | bash`，安装脚本把产物解包到
  `/root/.local/share/cursor-agent/versions/<ver>/` 并在 `/root/.local/bin/`
  建 symlink；Dockerfile 再把 `/usr/local/bin/cursor-agent` 做成指向版本化
  二进制的 symlink，PATH 查找全容器生效。build 阶段以 `cursor-agent --version`
  做 sanity gate，installer 回归会让镜像构建失败而不是把坏 CLI 发进产线。
- **二进制**：`cursor-agent`（bash wrapper，`realpath $0` 解析到版本目录后调用同目录的 `node`）
- **auth 文件**：`~/.cursor/cli-config.json` 或 `~/.cursor-agent/auth.json`
  （不同版本命名有差异，探测会依次检查几个常见路径）
- **安装**（slim 镜像时）：
  ```bash
  curl -fsSL https://cursor.com/install | bash
  ```
  脚本把二进制放在 `~/.local/bin/cursor-agent`。
- **登录**：
  ```bash
  cursor-agent login
  ```
- **推荐落地**：
  1. 用 `-full` 镜像即开箱即用；或 slim 镜像在容器内一次性跑 installer。
  2. 将 `~/.cursor` 挂载为卷以复用登录态。
- **注意**：Cursor CLI 没有 `npx` 回退路径 —— slim 镜像里不安装就是 `not installed`。
