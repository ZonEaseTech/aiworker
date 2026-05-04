# PLAN-094 Hermes thin adapter spike

- **status**: completed
- **createdAt**: 2026-05-04 11:22
- **completedAt**: 2026-05-04 13:50
- **relatedTask**: FEAT-052

## 现状

Hermes Agent 支持 CLI/profile/cwd/context files，比较适合作为 cwd-native 或 profile-aware external executor runtime。AIWorker 不需要接管 Hermes 的 memory、skills、MCP 或 profiles。

## 方案

1. 先做 read-only spike，确认 Hermes non-interactive CLI 输出、session/resume、cwd/context 行为。
2. 保持真实 user HOME / HERMES_HOME，除非 operator 显式配置 profile。
3. AIWorker 只归一化 stream/result 到 `AgentEvent`。
4. Project Brain 通过 prompt/context 注入或 workspace hint 参与，不改 Hermes native memory。

## 范围

- spike plan。
- optional prototype adapter after approval。

## 非范围

- 不同步 Hermes skills。
- 不迁移 Hermes memory。
- 不做 Hermes isolation。

## 风险

Hermes CLI output 如果不是稳定 machine-readable，需要先上游或 wrapper 约定。

## 验证

- local Hermes smoke with harmless prompt。
- focused adapter tests with fake spawn.

## 完成记录

- 2026-05-04 13:50：完成 spike plan 文档化，**未** 引入 Hermes adapter 代码（按 PLAN-094 范围 “是否落代码视 spike 结果”）。本次 spike 在当前 sandbox 不能联网安装 Hermes CLI、也不能调用 Hermes 远程账号；落 Hermes adapter 必须在能跑真实 Hermes CLI 的环境里另开实施任务。

### Spike 触发条件

只有在以下条件全部满足时再开实施任务：

1. operator 提供一个能联网调用 Hermes CLI 的环境（dev workstation 或专用 worker host），并保证用真实 user `HOME` / `HERMES_HOME`（不要把 AIWorker `--isolated` 那套环境变量过滤误用到 Hermes spike）。
2. 当前 Hermes CLI 提供以下任意一组 machine-readable 输出：(a) JSONL stream over stdout，包含 turn / token-delta / tool-call / final，或 (b) 稳定的 JSON-RPC over stdio。两者都没有的话先上游 wrapper，不要在 AIWorker 里硬解析自由 ANSI 输出。
3. Hermes 提供 session/thread resume 句柄；如果没有，AIWorker 的 `EngineSessionBinding` 字段对 Hermes 留空，回退到 in-prompt 历史。

### Spike 任务清单（执行实施任务时跑）

1. `which hermes` + `hermes --version` 记录 binary path / version。
2. 干净 cwd 跑一次 `hermes run --json --prompt 'echo hello'`（或等价 non-interactive 子命令），捕获 stdout / stderr 全程，确认是否有：
   - stable JSON 行 with `event` 字段或类似；
   - tool-call / tool-result 事件结构；
   - final assistant message 形态（一次性 vs delta）。
3. 复跑同一 prompt 加 `--session <id>` / `--resume <handle>`，确认 Hermes 是否暴露稳定 binding；如有，记录 binding payload（与 AIWorker `EngineSessionBinding` 对齐）。
4. 改 cwd 到一个临时 project workspace，确认 Hermes 是否读取 cwd-context 文件（例如 `AGENTS.md` / `.hermes/`），并记录加载顺序。
5. 在不带任何 `HERMES_*` env 的纯净 shell 跑一次，再在带 `HERMES_HOME=<tmp>` 的 shell 跑一次，确认 user/host config / profile 是否被正确隔离到 operator 选择的目录。
6. 输出一份 spike report 到 `docs/task/<spike-task-id>.md`，记录：CLI 行为、AgentEvent 映射草案、cancel/abort 实现路径、resume 是否可用、错误分类建议。

### Spike 不做

- 不写 production adapter 代码，只产 spike report。
- 不动 Hermes user/host config、不接管 Hermes 的 memory / skills / MCP / profile。
- 不在 AIWorker `packages/core/src/worker/executor/engines/` 下创建 hermes 子目录；spike 阶段任何代码原型只放 `tmp/hermes-spike/`。
- 不修改 `ExecutorProvider` 或 `AgentEvent` schema；如果 Hermes 输出确实需要新事件类型，spike report 单独提议，由独立 PMA 任务推进。

### AIWorker 侧前置准备（已就位）

- thin adapter 契约（PLAN-093）已固化在 `packages/shared/src/providers/executor.ts` 与 `docs/architecture.md`，spike 后落地的 adapter 直接复用。
- doctor 输出（PLAN-086）四档 readiness 中 `INFO ambient runtime: ...` 行已经预留 Hermes engine 的语义位（spike 落地后只需在 `SUPPORTED_ENGINES` 表里追加 `hermes` 即可）。
- `aiworker executor mcp ...` 命令保留 codex / claude-code 两个 engine 的 best-effort projection；Hermes 接入时若需要类似 hint，必须显式在另一份 PMA 中评估能否复用 overlay 通路或保持空 overlay。
