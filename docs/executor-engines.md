# Executor engines —— 安装与登录手册

AIWorker 只在 session 层调用外部 engine，并记录 invocation / artifact /
review 证据。外部 engine 负责自己的 tool loop、model routing、approval、
sandbox、profile、MCP、插件、skill 和 native session。

`GET /api/local/settings/engines` 只做只读 readiness 探测：

- CLI 是否在 `PATH`；
- 常见 auth 文件是否存在；
- HTTP/MCP/任意命令类 engine 是否有可用配置。

探测不读取 secret 内容，不 spawn CLI，也不保证 engine 最终会加载哪些 host/user 级
插件或 MCP server。

## Local Auth Recipes

推荐在运行 AIWorker daemon 的同一 OS user 下完成 engine 登录：

```bash
claude login
codex login
gemini
qwen
cursor-agent login
```

然后启动 local daemon：

```bash
aiworker daemon foreground --host 127.0.0.1 --port 9217
```

在 Worker Web settings 里执行 engine scan/test。`ready` 只表示本地探测命中，不代表
AIWorker 拥有或隔离 engine 的真实权限。

## http / mcp / cli

这三类引擎不依赖 AIWorker 管理登录态：

- `http`：调用 OpenAI-compatible HTTP endpoint；
- `mcp`：连接外部 MCP endpoint；
- `cli`：执行 operator 配置的任意命令。

这些 engine 的 readiness 主要由配置完整性决定。Secret 应放在 `.env`、系统 keychain、
vault/ref 或外部 engine 自己的配置里，不要写入 worker.db metadata、workspace 文件或
日志。

## claude-code <a id="claude-code"></a>

- **npm 包**：`@anthropic-ai/claude-code`
- **二进制**：`claude`
- **auth 文件**：`~/.claude.json`（或 `~/.claude/config.json`）
- **安装**：
  ```bash
  npm i -g @anthropic-ai/claude-code
  ```
- **登录**：
  ```bash
  claude login
  ```
- **模型**：AIWorker 不主动固定模型；只有 operator 显式配置 `model` /
  `modelId` 时才作为 best-effort hint 转发给 CLI。

## acp <a id="acp"></a>

ACP harness 支持 Gemini CLI 与 Qwen Code。

### Gemini CLI <a id="acp-gemini"></a>

- **npm 包**：`@google/gemini-cli`
- **二进制**：`gemini`
- **auth 文件**：`~/.gemini/oauth_creds.json`
- **安装**：
  ```bash
  npm i -g @google/gemini-cli
  ```
- **登录**：
  ```bash
  gemini
  ```
  或设置 `GEMINI_API_KEY=<key>`。

### Qwen Code <a id="acp-qwen"></a>

- **npm 包**：`@qwen-code/qwen-code`
- **二进制**：`qwen`
- **auth 文件**：`~/.qwen/oauth_creds.json` 或 `~/.qwen/settings.json`
- **安装**：
  ```bash
  npm i -g @qwen-code/qwen-code
  ```
- **登录**：
  ```bash
  qwen
  ```
  或设置 `QWEN_API_KEY=<key>`。

## codex <a id="codex"></a>

- **npm 包**：`@openai/codex`
- **二进制**：`codex`
- **auth 文件**：`~/.codex/auth.json`
- **安装**：
  ```bash
  npm i -g @openai/codex
  ```
- **登录**：
  ```bash
  codex login
  ```
- **事件粒度**：Codex 的 function call 与 shell command lifecycle 会被归一化为
  AIWorker session events。需要更细粒度 file-level diff 时仍应读取 executor 自身输出
  或后续 artifact/review 证据。

## cursor <a id="cursor"></a>

- **安装来源**：Cursor 官方 CLI，`https://cursor.com/install`
- **二进制**：`cursor-agent`
- **auth 文件**：`~/.cursor/cli-config.json` 或 `~/.cursor-agent/auth.json`
- **安装**：
  ```bash
  curl -fsSL https://cursor.com/install | bash
  ```
- **登录**：
  ```bash
  cursor-agent login
  ```
- **注意**：Cursor CLI 没有 npm/npx 回退路径；未安装时 readiness 会显示
  `not-found`。

## Executor Turn Timeout

`aiworker run --timeout-ms <n>` 只控制 CLI 等待终态事件的最长时间；它不会临时改写
engine 自身的 hard timeout。长任务应先调整对应 engine/profile 配置，再运行任务。
