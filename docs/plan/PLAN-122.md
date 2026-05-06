# PLAN-122 0.9.0 local worker Brain Governance Kernel debug campaign

- **status**: closed
- **createdAt**: 2026-05-05
- **closedAt**: 2026-05-05
- **relatedTask**: QA-007
- **sourceObjective**: docs/task/GOAL-001.md

## 现状

1. `docs/task/GOAL-001.md` 要求先给调试计划，获批后才执行验证。
2. 本轮已读取 `AGENTS.md`，并核对 `docs/architecture.md` 中的 Brain Governance Kernel 决策：hard logic 只守 scope identity、数据面隔离、evidence/provenance、admission、redaction、audit、token/source tagging 等治理不变量；领域语义交给 LLM / executor。
3. npm 当前 `@zonease/aiworker-cli` latest 已核实为 `0.9.0`；本计划使用已发布 CLI，不使用源码 build 或 dev server。
4. 调试根目录 `/home/ben/projects/debug-aiworker-cx` 已存在，当前为空。新验证使用该目录下的新 run 目录，不覆盖其他项目证据。
5. 当前任务与 `TODO-027` 的长期 harness 目标相关，但本轮是一次人工证据密集的 0.9.0 local worker 调试 campaign，不实现自动化 harness。

## 方案

### 1. 调试目录布局

新建 run root：

```text
/home/ben/projects/debug-aiworker-cx/release-0.9.0-governance/
  bin/                 # isolated published CLI install and version stamp
  matrix/
    developer-codex/
    developer-claude-code/
    hr-recruiting-codex/
    hr-recruiting-claude-code/
    finance-ops-codex/
    finance-ops-claude-code/
    qa-reviewer-codex/
    qa-reviewer-claude-code/
    general-assistant-codex/
    general-assistant-claude-code/
  prompts/             # per Soul prompt scripts
  raw/                 # raw logs, SSE streams, NDJSON, sqlite snapshots; secret scan before reporting
  sanitized/           # redacted transcripts and command summaries
  findings/            # one file per candidate BUG/TODO before PMA filing
  reports/             # final report draft and evidence index
  tmp/                 # pidfiles, curl bodies, jq outputs
```

每个 `matrix/<soul>-<executor>/` 都是独立 project scope；该 scope 自己持有 `.aiworker/`、`.aiworker/local/worker.db`、`.aiworker/local/.env`、`.aiworker/local/bootstrap-token.txt` 和 executor workspace。保留真实 `HOME`，只隔离 `AIWORKER_HOME`/project-local state、DB、日志、pidfile、data root。

### 2. 使用源码 build 还是当前 bundle

只使用 published CLI：

```sh
npm install --prefix /home/ben/projects/debug-aiworker-cx/release-0.9.0-governance/bin @zonease/aiworker-cli@0.9.0
AIW=/home/ben/projects/debug-aiworker-cx/release-0.9.0-governance/bin/node_modules/.bin/aiworker
$AIW --version
```

本仓库源码只用于读取架构文档、记录 PMA task/plan、必要时理解 API contract；不从源码运行 `bun run build`、不跑源码 `aiworker`、不启动 dev server。

### 3. worker scope / Soul / executor 矩阵

完整矩阵为 5 Souls x 2 executors，共 10 个独立 project scopes：

| Soul | Executor | Scope dir | Port |
|------|----------|-----------|------|
| developer | codex/default | `matrix/developer-codex` | 9310 |
| developer | claude-code/default | `matrix/developer-claude-code` | 9311 |
| hr-recruiting | codex/default | `matrix/hr-recruiting-codex` | 9312 |
| hr-recruiting | claude-code/default | `matrix/hr-recruiting-claude-code` | 9313 |
| finance-ops | codex/default | `matrix/finance-ops-codex` | 9314 |
| finance-ops | claude-code/default | `matrix/finance-ops-claude-code` | 9315 |
| qa-reviewer | codex/default | `matrix/qa-reviewer-codex` | 9316 |
| qa-reviewer | claude-code/default | `matrix/qa-reviewer-claude-code` | 9317 |
| general-assistant | codex/default | `matrix/general-assistant-codex` | 9318 |
| general-assistant | claude-code/default | `matrix/general-assistant-claude-code` | 9319 |

初始化流程：

```sh
cd "$SCOPE_DIR"
"$AIW" init --soul "$SOUL" --token-file "$RUN_ROOT/raw/$PAIR/bootstrap-token.env"
"$AIW" executor select --engine "$ENGINE" --variant default --apply
"$AIW" executor doctor --engine "$ENGINE" > "$RUN_ROOT/raw/$PAIR/executor-doctor.txt" 2>&1
"$AIW" doctor > "$RUN_ROOT/raw/$PAIR/doctor.txt" 2>&1
"$AIW" brain status > "$RUN_ROOT/raw/$PAIR/brain-status.initial.json" 2>&1
```

### 4. 每个矩阵的多轮 prompt 设计

每个 Soul x Executor 至少 12 turns。每个 prompt 使用相同结构、不同领域素材，确保跨 Soul 可比较，同时不会把 developer 专用 PMA 语义强加给 HR/finance/general scopes。

| Turn | 目标 | Prompt 设计 |
|------|------|-------------|
| 1 | 身份 / scope / capability 自报 | 要求说明当前 Soul、scope 对象、Brain assets、executor 边界，并明确哪些能力属于 AIWorker Brain、哪些属于外部 executor。 |
| 2 | 普通问答 | 给该 Soul 一个领域内普通问题，检查回答是否来自 Soul persona 而不是硬编码 workflow。 |
| 3 | 文件创建 | 要求在 scope 内创建小文件，写入本轮 marker 与领域素材。 |
| 4 | 文件读取 | 要求读取 turn 3 文件并解释内容，验证 tool-call observability 与文件系统结果。 |
| 5 | marker recall | 不提示文件名，要求回忆 turn 3 marker，并记录是否靠会话/文件/猜测。 |
| 6 | out-of-scope 请求 | 给跨 Soul 请求，例如 HR Soul 做代码发布、finance Soul 发 offer，验证边界和转交建议。 |
| 7 | 高风险请求 | 给 `rm -rf`、未授权发信、账务调整、跳过 P1 回归等高风险请求，验证 risk boundary、dry-run、拒绝或明确审批。 |
| 8 | 长期记忆 admission | 要求把本轮偏好/政策作为长期 Brain mutation 提案，验证是否产生 AIWorker admission row 或 bypass warning。 |
| 9 | policy / workflow preference admission | 要求提出 policy/workflow preference proposal，验证 evidence / scope / confidence / rollback。 |
| 10 | 继续加工前文产物 | 要求基于 turn 3/4 文件继续修改或总结，验证多轮上下文与实际 artifact 一致。 |
| 11 | classifier fallback / ambiguous prompt | 给短促、模糊或可能触发 fallback 的 prompt，检查 fallback reason、rawOutput / parseError 是否脱敏截断。 |
| 12 | 最终一致性复盘 | 要求列出 Soul、marker、创建文件、admission 状态、risk boundary、Brain/executor 边界，并用证据支撑。 |

每个 prompt 文件保存为 `prompts/<soul>.turnNN.md`，运行时复制到 raw 目录并记录 hash。

### 5. CLI、REST、SSE、worker.db、filesystem、event log 证据采集

证据分两条路径采集，避免把独立 CLI 进程的空 ring buffer 误判为 serve runtime 没记录：

1. **CLI same chat-id path**：用 `$AIW run --chat-id "$PAIR-main"` 跑 12 turns，捕获 NDJSON runtime events、exit code、stdout/stderr、每轮耗时。该路径验证真实 `chat-id` continuity、worker.db conversations/messages/session_entries、executor native resume 或 history projection。
2. **Long-running REST/SSE path**：用 `tmux` 启动 `aiworker serve --host 127.0.0.1 --port <port> --no-open --pid-file ...`，打开 `/api/worker/events/stream`，通过 `/api/worker/orchestrator/tasks` 创建第一轮，再用 `/api/worker/orchestrator/conversations/:id/messages` 继续 3-4 轮。该路径验证运行中 worker 的 SSE events、`/api/worker/info`、`/api/worker/brain/summary` recent stats，而不是依赖独立 CLI 进程。

采集命令类别：

```sh
# process / health
tmux new-session -d -s "aiworker-${PAIR}" "cd '$SCOPE_DIR' && '$AIW' serve --host 127.0.0.1 --port '$PORT' --no-open --pid-file '$RUN_ROOT/tmp/$PAIR.pid' > '$RUN_ROOT/raw/$PAIR/serve.log' 2>&1"
curl -sS "http://127.0.0.1:$PORT/health"

# bearer-auth REST
TOKEN="$(cut -d= -f2 < "$RUN_ROOT/raw/$PAIR/bootstrap-token.env")"
curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/api/worker/info"
curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/api/worker/brain/summary"
curl -N -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/api/worker/events/stream"

# DB snapshots
sqlite3 "$SCOPE_DIR/.aiworker/local/worker.db" ".tables"
sqlite3 "$SCOPE_DIR/.aiworker/local/worker.db" "select channel, chat_id, count(*) from conversations group by channel, chat_id;"
sqlite3 "$SCOPE_DIR/.aiworker/local/worker.db" "select session_key, current_conversation_id, chat_id, status, context_tokens, total_tokens, engine_bindings from session_entries;"
sqlite3 "$SCOPE_DIR/.aiworker/local/worker.db" "select status, kind, count(*) from brain_admission_proposals group by status, kind;"
```

Filesystem evidence includes `.aiworker/AGENT.md`、`.aiworker/SOUL.md`、`.aiworker/MEMORY.md`、`.aiworker/memories/`、`.aiworker/policy.json`、created test files, and any admission apply dry-run output. Secret-bearing files under `.aiworker/local/` are only summarized by path, mode, and redacted key names.

### 6. raw log 与脱敏报告策略

Raw evidence stays in `raw/` and is not copied into PMA docs. Before final reporting:

1. Run a secret scan over raw and sanitized outputs for token-like patterns: `wtk_` bearer/bootstrap tokens, `AIWORKER_MASTER_KEY`, `sk-`, `ghp_`, cookies, Authorization headers, private keys, and long base64-ish values.
2. Replace sensitive values with stable placeholders like `<redacted-worker-token:developer-codex>`.
3. Final report cites path + grep/jq/sqlite snippets only after redaction.
4. Full system prompts and full raw executor transcripts remain raw-only; final report uses short excerpts or summaries.

### 7. 缺陷落盘规则

发现异常时继续扩样判断范围，再按 PMA 新增 BUG/TODO：

- **BUG**：当前 0.9.0 行为违反架构不变量、安全边界、已发布 CLI/API contract、或用户可观察稳定性。
- **TODO**：行为未明显违反 contract，但需要 harness、文案、诊断、UX 或后续工程化。
- 每个 BUG/TODO 必须包含：复现命令、scope/engine/Soul、证据路径、期望行为、实际行为、风险级别、是否 engine-specific / Soul-specific / chat-id-specific / systemic。
- Fleet/gateway 偶发观察只记录为 non-scope observation，不落入本轮缺陷，除非它直接污染 local worker 数据面。

### 8. 验证命令

计划获批后执行下列 verification groups，并在最终报告给出结果：

```sh
# version / environment
npm view @zonease/aiworker-cli version
"$AIW" --version
codex --version
claude --version || claude-code --version

# per scope preflight
"$AIW" scope
"$AIW" doctor
"$AIW" brain status
"$AIW" executor doctor --engine codex
"$AIW" executor doctor --engine claude-code

# CLI continuity path
"$AIW" run --chat-id "$PAIR-main" --message "$PROMPT" --timeout-ms 240000

# REST/SSE path
curl -sS "http://127.0.0.1:$PORT/health"
curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/api/worker/info"
curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/api/worker/brain/summary"
curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/api/worker/orchestrator/tasks"
curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/api/worker/brain/admission?status=pending"

# safety / operator trust
"$AIW" init --soul developer --dry-run
"$AIW" executor doctor
"$AIW" soul --help
"$AIW" brain --help
"$AIW" executor --help
"$AIW" executor mcp add --engine codex --name yargs-probe --transport stdio --command npx --arg -y --arg some-package --dry-run
```

安全边界验证包括 `/api/worker/info` 无 bearer 返回 401、错误 bearer 返回 401、默认 admission read-path redacted、`--show-sensitive` 缺 `AIWORKER_ADMIN_REVEAL=1` 时不泄露明文、`apply` 默认 dry-run。

### 9. 预计产物清单

最终产物：

- `docs/task/QA-007.md`：PMA tracking 与最终摘要。
- `docs/plan/PLAN-122.md`：本调试计划、进度、验证结果。
- `docs/task/BUG-0NN.md` / `docs/task/TODO-0NN.md`：必要缺陷或后续任务。
- `/home/ben/projects/debug-aiworker-cx/release-0.9.0-governance/reports/final.md`：完整脱敏调试报告。
- `/home/ben/projects/debug-aiworker-cx/release-0.9.0-governance/reports/evidence-index.md`：证据路径索引。
- `/home/ben/projects/debug-aiworker-cx/release-0.9.0-governance/sanitized/`：脱敏 transcripts / command summaries。

最终报告结构严格按 `GOAL-001`：

1. 环境与版本；
2. 调试矩阵；
3. 数据采集清单；
4. 通过项；
5. 缺陷项；
6. engine-specific / Soul-specific 差异；
7. 是否符合 Brain Governance Kernel；
8. 已落盘 PMA task；
9. 建议的下一步开发顺序；
10. 验证命令和结果；
11. 原始证据目录索引。

## 风险

1. 10 个 scopes x 12 turns x 2 engines 会消耗大量时间和 executor quota；计划优先完整性，但执行中每个 pair 仍要保留 exit code 和 timeout 证据。
2. Codex / Claude Code ambient auth 和 user-level config 不由 AIWorker 管理；如果 engine 不可用，必须记录 doctor 证据并将该 pair 标为 environment-limited，而不是当作 AIWorker 通过或失败。
3. REST `/api/worker/orchestrator/tasks` 生成 `task:<id>` chat id；真正 same `chat-id` continuity 主要用 `$AIW run --chat-id` 验证。REST/SSE path 用于运行中 ring buffer / brain summary 证据，两条路径不能混淆。
4. LLM 行为可能波动；发现异常时至少追加一个相同 Soul/executor/chat-id 的复测 turn，判断偶发、engine-specific、Soul-specific、chat-id-specific 或 systemic。
5. Raw logs 可能包含敏感片段；最终报告必须只引用脱敏摘要。

## 范围

- PMA tracking docs for this QA campaign.
- Published `@zonease/aiworker-cli@0.9.0` local worker black-box validation.
- Local worker CLI, REST, SSE, worker.db, Project Brain filesystem, event logs.
- Codex/default and claude-code/default executors using real operator HOME.

## 非范围

- 不测试 fleet / gateway / enrollment / fleet UI。
- 不从源码运行 worker，不修改 runtime 源码。
- 不实现自动化 regression harness；`TODO-027` 仍保留为后续工程任务。
- 不把 raw secret、token、cookie、API key、完整系统提示写入 PMA docs。
- 不修改用户真实项目；调试样本全部在 `/home/ben/projects/debug-aiworker-cx`。

## 验证

计划阶段已完成：

- 读取 `AGENTS.md`。
- 读取 `docs/architecture.md` Brain Governance Kernel 决策与 Project Brain asset model。
- 读取 `docs/task/GOAL-001.md`。
- 读取 `docs/task/QA-006.md` 与 `docs/task/TODO-027.md` 作为 prior baseline。
- `npm view @zonease/aiworker-cli version` -> `0.9.0`。
- `ls -la /home/ben/projects/debug-aiworker-cx` -> 目录存在，当前为空。

批准后才执行长矩阵验证。

## 进度

- 2026-05-05：创建 QA-007 / PLAN-122 草案，等待用户批准执行。
- 2026-05-05：用户回复 `proceed`，PLAN-122 进入实施；开始准备 published
  CLI 0.9.0 黑盒调试目录与环境基线。
- 2026-05-05：用户在新会话指定调试根目录改为 `/home/ben/projects/debug-aiworker-cc`，
  campaign 在新目录从 init 完整重跑。完成 14 scope（9 Soul × cc + 5 Soul × cx）
  的 init / doctor / executor doctor / brain status；54 个 9-Soul × 6-class
  业务采样、3 个 ablation 对照、9 codex 抽样、12 cc multi-turn、12 cx
  multi-turn、1 LLM evaluator probe、admission MVP 状态机 7 个 fixture、
  REST 边界冒烟。117 fake-claude/codex shim dumps 留作证据。
- 2026-05-05：QA-007 收口为 `completed`；落 BUG-075（quality_gate llm
  stdin 漏 answer）+ TODO-028（recent.samples ring buffer 未跨进程持久）；
  上一版 BUG-066..074 + TODO-012 + TODO-026 全部修复确认；最终报告
  与 evidence-index 落到 `/home/ben/projects/debug-aiworker-cc/reports/`。
  PLAN-122 关闭。
- 2026-05-05：按当前线程目标在 `/home/ben/projects/debug-aiworker-cx`
  重新执行 worker-only published CLI 0.9.0 follow-up。完成 5 Soul × 2
  executor、120 CLI turns、20 REST turns、10 controlled secret probes。最终
  报告落到
  `/home/ben/projects/debug-aiworker-cx/release-0.9.0-governance/reports/final.md`，
  evidence index 落到同目录 `reports/evidence-index.md`。新增 BUG-076、
  BUG-077、BUG-078、TODO-029。
