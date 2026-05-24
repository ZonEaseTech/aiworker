# Executor Engines

AIWorker 只在 session 层调用或观察外部 engine。外部 engine 负责自己的 tool loop、model
routing、approval、sandbox、profile、MCP、插件、skill 和 native session。

Host 只做 readiness 探测与 best-effort 配置透传，不拥有 engine 登录态，也不隔离 engine 的
真实权限。

## Readiness Probe

`GET /api/local/settings/engines` 返回持久化的本地 engine status，供 Settings 与 mounted
workbench readiness 使用。它包含：

- 上次发现的 binary path/version；
- 当前选择的 `engineId`；
- 当前选择的 `executionMode`；
- BYOK 的非 secret 投影：`provider`、`model` 和 `apiKeyRefPresent`。

该 endpoint 是只读 metadata surface，不 spawn CLI，不读取 secret 内容，也不保证 engine
最终会加载哪些 host/user 级 plugin、MCP、skill 或 native session。`ready` 表示持久化的本地
状态命中，不表示 AIWorker 已接管该 engine。

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

在 Worker Web settings 里执行 engine scan/test。

## HTTP / MCP / CLI

这三类 engine 不依赖 AIWorker 管理登录态：

- `http`：调用 OpenAI-compatible HTTP endpoint；
- `mcp`：连接外部 MCP endpoint；
- `cli`：执行 operator 配置的任意命令。

Secret 应放在 `.env`、系统 keychain、vault/ref 或外部 engine 自己的配置里，不要写入
worker.db metadata、workspace 文件、manifest、prompt、review rubric 或日志。

## Claude Code <a id="claude-code"></a>

- **npm package**：`@anthropic-ai/claude-code`
- **binary**：`claude`
- **auth files**：`~/.claude.json` 或 `~/.claude/config.json`
- **install**：
  ```bash
  npm i -g @anthropic-ai/claude-code
  ```
- **login**：
  ```bash
  claude login
  ```
- **model**：AIWorker 不主动固定模型；只有 operator 显式配置 `model` / `modelId` 时才作为
  best-effort hint 转发。

## ACP <a id="acp"></a>

ACP harness 支持 Gemini CLI 与 Qwen Code。

### Gemini CLI <a id="acp-gemini"></a>

- **npm package**：`@google/gemini-cli`
- **binary**：`gemini`
- **auth file**：`~/.gemini/oauth_creds.json`
- **install**：
  ```bash
  npm i -g @google/gemini-cli
  ```
- **login**：
  ```bash
  gemini
  ```
  或设置 `GEMINI_API_KEY=<key>`。

### Qwen Code <a id="acp-qwen"></a>

- **npm package**：`@qwen-code/qwen-code`
- **binary**：`qwen`
- **auth files**：`~/.qwen/oauth_creds.json` 或 `~/.qwen/settings.json`
- **install**：
  ```bash
  npm i -g @qwen-code/qwen-code
  ```
- **login**：
  ```bash
  qwen
  ```
  或设置 `QWEN_API_KEY=<key>`。

## Codex <a id="codex"></a>

- **npm package**：`@openai/codex`
- **binary**：`codex`
- **auth file**：`~/.codex/auth.json`
- **install**：
  ```bash
  npm i -g @openai/codex
  ```
- **login**：
  ```bash
  codex login
  ```
- **event granularity**：Codex 的 function call 与 shell command lifecycle 会被归一化为
  AIWorker session events。需要更细粒度 file-level diff 时仍应读取 executor 自身输出或后续
  app-exposed artifact/review evidence。

## Cursor <a id="cursor"></a>

- **source**：Cursor 官方 CLI，`https://cursor.com/install`
- **binary**：`cursor-agent`
- **auth files**：`~/.cursor/cli-config.json` 或 `~/.cursor-agent/auth.json`
- **install**：
  ```bash
  curl -fsSL https://cursor.com/install | bash
  ```
- **login**：
  ```bash
  cursor-agent login
  ```
- **note**：Cursor CLI 没有 npm/npx 回退路径；未安装时 readiness 会显示 `not-found`。

## Timeout

`aiworker turn send` 或 session 相关等待只控制 AIWorker CLI/API 等待终态事件的最长时间；它不
临时改写 engine 自身 hard timeout。长任务应先调整对应 engine/profile 配置，再运行任务。
