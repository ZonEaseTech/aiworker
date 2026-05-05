---
name: aiworker-release-debug
description: AIWorker 已发版（npm `@zonease/aiworker-cli`）端到端调试与缺陷收集。重点验证 Project Brain（SOUL.md / AGENT.md / MEMORY.md / capability-packs / scope manifest / brain admission / brief compiler）是否真的注入 LLM、Soul 调教是否真的引导推理、brain 决策层 LLM 是否真的工作。触发：用户说"调试 worker / Soul / Brain / executor"、"全面收集缺陷"、"测试已发版版本"、"验证 Project Brain 是否如预期执行"。**只对已发版包做黑盒调试**，不要直接跑源码 dev server。
---

# AIWorker Release Debug

End-to-end debug skill for **published** `@zonease/aiworker-cli` releases. Focus: worker / Soul / Brain / executor with real LLM behavioral sampling.

Keep this entry small. Load references on demand.

## Triggering

Use this skill when the user asks to:
- 调试 / 测试 / 采样已发版的 aiworker（npm latest 或指定版本）
- 全面收集缺陷 / 优化项 / 落盘到 PMA
- 验证 Soul / Brain / executor 是否如预期执行（不仅功能层，还要业务层）
- 调教 brain 到生产标准

**Do NOT trigger** for: 仓库源码本身的开发任务（用 `/pma` + `/pma-bun` / `/pma-web` 即可），单一功能 unit test 校验，或纯文档修改。

## Always-On Rules（来自历史用户多次强调 + 0.7.0 campaign 沉淀）

1. **黑盒、用已发版**：`npm install -g @zonease/aiworker-cli@<version>` 到隔离 prefix，不修改 published 包；不要图方便直接跑源码 dev server。本规则若被违反，发现的"问题"可能是仓库源码状态而非 release 状态。
2. **token 不是减少采样的理由**：用户明确"不在乎 token 消耗"。**campaign 规模标准 ≈ 9 Soul preset × 6 类 prompt + 至少 1 个 Soul × 5 轮 multi-turn + 至少 1 次 cross-engine 抽样**；不要靠"看代码推断行为"省样本。
3. **Brain 真机注入必须三件套**：fake-claude shim 抓 stdin/argv + ablation（删 SOUL/AGENT/MEMORY 重跑） + 横向 9 Soul × 多类 prompt。三者缺一会让你停在"看起来对题"或"这一条 Soul 似乎在引导"的假象上。**只看 `brain memories / brain status` 上层接口会漏掉 BUG-056 / BUG-060 这一类产品定位级缺陷**。
4. **brain 决策层（intent / capability / quality）也要走 LLM 路径采样**：默认 heuristic，需 `aiworker config set` 显式开 `evaluator: llm`，再用 fake-claude 抓 4 次决策调用是否真的产生 valid JSON。开 LLM evaluator 后单轮变 4-5 次串行 cold-start LLM 调用，**默认 90s timeout 不够**，必要时 `--timeout-ms 240000+`。**0.8.0 实测（BUG-066/067）**：默认配置下 100% 的 turn 都是 `intent_decision.source="intent-heuristic"` + `quality_gate.evaluator="heuristic"` + `mode="observe_only"`；`conversation.classifier` 100% `reason: "non-json-classifier-output"` silent fallback（60/60 turn）。**注意 `mode: "observe_only"` 是产品语义**：即使切到 LLM evaluator，事件层有 LLM 决策但下游 prompt assembly 不被 gating，要么 docs 改、要么实现 enforce mode，phase 6 必须显式判读 `mode` 字段而不是只看 `source`。
5. **chat-id 必须唯一**：每条 sample 用 `--chat-id "<label>:$(date +%s)"` 隔离；同 chat-id 串多类 prompt 会被 conversation history 污染，让上一轮回答漂进下一轮判读，造成假阳性"BUG-056 复发"或假阴性"Soul 引导生效"。Multi-turn 稳定性测试是反过来——**有意**复用同一 chat-id 跑 N 轮，看 stdin 是否每轮重新注入完整 brain。
6. **shim 必须 hard-code 绝对路径**：DUMP_DIR 用 absolute path、shebang 用 `#!/bin/bash`（不要 `#!/usr/bin/env bash`）。原因：engine adapter 给 child 进程的 env allowlist 只放 PATH/HOME/USER 等基础键 + `CLAUDE_*`/`CODEX_*`/`NODE_*`/`NPM_CONFIG_*`/`XDG_*`/`LC_*` 等已知前缀（详见 TODO-014），`AIWORKER_*`/`DEBUG_*` 不会传到 engine child；`#!/usr/bin/env bash` 在 PATH 被 sandbox 时找不到 bash。
7. **Cross-engine 至少抽样**：claude-code 是主 engine，但 codex 通过完全不同的注入机制（jsonrpc `turn/start` 的 `<System>...</System>` tag）也要抽样验证 BUG-056 类已修复在 codex 上同样生效；**单 engine 通过不代表全局通过**。codex 在 out-of-scope 上比 claude-code "软"是已知现象（codex CLI 自身 default system prompt 偏积极完成任务），不要当成 brain 注入失败来追。
8. **pre-debug baseline 检查**：phase 1 装 0.x.0 之前先 `pgrep -af 'aiworker serve'` + `pgrep -af 'claude'`，清理上一版残留进程；前一版可能占着 19310 端口让本版 phase 7 REST smoke 撞错 worker（TODO-016 是相关 BUG）。
9. **每条 sample 后用 extract 重抽 .txt**：streaming 中 `.txt` 可能短暂 0 byte，`.log` 才是权威。事后再跑提取脚本（见 templates/extract-all.sh 思路）保证 final inventory 完整。
10. **结尾必给"上一版修复确认 + 本版仍存在 + 本版新发现"三栏对照表**：上一版 BUG/TODO 必须逐条**用 ablation/dump 真实证据**重新校验，不能因为"看起来正常"就跳过；漏校验会把 partial-injection（如 BUG-060：MEMORY.md 索引注入但 body 没注入）当成"已修"。
11. **调试期间默认中文交流**；落盘到仓库 `docs/task/` 的 task 标题用英文（remote-visible metadata 规范），正文中文，evidence 路径指 `<debug-root>/findings/...`。
12. **缺陷与优化项必须按 PMA 规范落盘**：`docs/task/BUG-NNN.md` / `TODO-NNN.md` + 同步 `docs/task/index.md`；不擅自创建 PLAN-* （等 owner 认领后再起 plan）。详见 [references/findings.md](references/findings.md)。
13. **不破坏调试痕迹**：fake-claude/codex shim 抓到的 dump、samples 下的 LLM 回答原文、admission fixture SQL、ablation 对照样本都属于 evidence，调试结束不要清理；它们是后续 owner 复现时的唯一来源。
14. **收尾必须 kill serve / 清残留 claude 子进程**：`pgrep -af 'aiworker serve'` + `pgrep -af 'claude.exe'` 双重验证；不能让后台进程污染下一次调试。
15. **DB 直读 ≫ LLM 自报告（来自 0.8.0 BUG-074 教训）**：LLM 在 final text 里说"proposal 已采纳"、"已落盘"、"已记录到长期记忆"**全部不可信**。每条 admission / memory / artifact / cron 类断言都必须用 `sqlite3 .aiworker/local/worker.db` 直接查 `brain_admission_proposals` / `brain_artifacts` / `cron_jobs` 表 count + content，或 `find .aiworker/memories -type f` 直查文件系统。0.8.0 验证 60 turn 中至少 3/5 Soul 都出现"LLM 自信宣称已落盘但 DB 0 条"的 hallucination。这一项是任何 admission / memory / artifact phase 的强制收尾步骤，不是可选项。
16. **claude-code engine 上的 admission bypass 模式（来自 0.8.0 BUG-068）**：claude-code 自带 user-level memory（`~/.claude/projects/<scope-hash>/memory/MEMORY.md` + topic 文件），LLM 默认绕过 AIWorker `brain admission` 走 user-level memory 落盘。0.8.0 实测 claude-code 上 0/3 Soul 触发 `brain_admission_proposals` DB 写入；codex 上 2/2 Soul 真写入。phase 4 / phase 5 / phase 9 必须**两路对照**：(a) `sqlite3 ... brain_admission_proposals` count，(b) `ls ~/.claude/projects/-home-...-<sub>/memory/`。如果前者 0、后者非空，已经定锤 admission bypass，不需要再观察更多 turn —— 直接把 finding 落到 BUG-068 类。
17. **Multi-turn 必须 DB 校验 conversation 切分（来自 0.8.0 BUG-069）**：codex executor 上同 chat-id 跑 N 轮可能被切成 N 个 conversation（claude-code 上是 1 个）。每次 multi-turn campaign 收尾必须 `sqlite3 .aiworker/local/worker.db "SELECT count(*) FROM conversations WHERE chat_id=?"`，必须 = 1；> 1 即 BUG-069 类。**marker recall 是配套必跑测试**：turn 1 让 LLM 记一个具体 marker（`MARKER_<sub>_T1=alpha-<n>`），turn 4+ 让它精确回忆；codex 在切多 conversation 时会 fail。
18. **codex 事件流不完整（来自 0.8.0 BUG-070）**：codex executor 在 AIWorker 事件流里完全不发 `orchestrator.tool_call` 事件，即使它真的执行了 file write / shell exec。**codex 抽样不能只看事件流**，必须辅以 `find .aiworker/local`、`find .aiworker/memories`、`sqlite3 brain_admission_proposals` 等文件系统/DB 直读。否则会把"codex 真做了的事"当成"codex 啥也没做"。

## Workspace Convention

调试根：`/home/ben/projects/debug-aiworker/qa-<YYYY-MM-DD>/`（与仓库源码 `~/projects/aiworker` 物理隔离）。

```
qa-<date>/
├── npm-prefix/      # npm install -g 隔离 prefix
├── bin/claude       # fake-claude shim（PATH 前置）
├── dump/            # shim 抓到的 stdin / argv / env
├── proj-<soul>/     # 每个 Soul preset 一个独立 project
├── samples/         # 业务采样 helper + 每条 prompt 的 final text + 三个 decision 事件
├── run/             # serve 后台日志 / pid（结尾 kill）
├── findings/        # 每条缺陷一份独立 md（BUG-N / UX-N 临时编号）
└── REPORT.md        # 总报告
```

最终把 `findings/` 与 PMA `docs/task/BUG-NNN.md` 双向链接（task 文件 evidence 段引 findings 路径）。

## Phase Outline

只列阶段，详细配方在 [references/recipes.md](references/recipes.md)。

### Phase 1 — Install & smoke

- **先 baseline 检查**：`pgrep -af 'aiworker serve'` + `pgrep -af 'claude.exe'` 清理上一版残留（避免 phase 7 撞错 worker）
- 隔离 npm prefix → `npm install -g @zonease/aiworker-cli@<version>`
- 验证 `aiworker --version`、根 help 命令树完整、`aiworker soul list` 暴露 schema pack
- 不在乎 PATH 漂移：每条命令显式 `export PATH="<bun-bin>:<npm-prefix>/bin:..."`，bun-bin 必须前置（aiworker.js 是 bun bundle，需要 bun runtime）；npm-prefix/bin 必须在系统 npm-global/bin 之前，否则会跑前一版残留 install

### Phase 2 — Init matrix（9 Soul preset 全跑）

- **9 个 preset 全跑**：developer / hr-recruiting / finance-ops / devops-sre / product-designer / qa-reviewer / support-operator / project-manager / general-assistant；这是 prod-grade 调教的最小横向规模
- 每个 preset 检查 `.aiworker/scope.json` kind / SOUL.md 风格 / capability-packs.json / toolsets.json / policy.json / **0.7.0+ 新增 USER.md / ROLLUP.md / mcp.json / skills/** 是否真的差异化
- `aiworker doctor` PASS / WARN 是否合理（注意 0.7.0 doctor 噪声，0.8.0 PLAN-112 已收口）；`aiworker executor doctor --engine claude-code` 是否正确探测 claude binary

### Phase 3 — Brain artifact / scope manifest / brief compiler

- 空态测试 `brain status / skills / memories / artifacts list`
- `brain brief --task "..."` 默认输出（关注 BUG-054 / BUG-062 类：未传 `--artifact` 时仍出现 `undefined: not found` 段）
- token-budget / unknown-soul / executor-hint 边界

### Phase 4 — Admission MVP（CRUD + materialize）

- 0.7.0+ 已暴露 `aiworker brain admission propose --i-know-this-is-debug` debug 入口（TODO-009 已修），优先走 CLI propose 路径
- SQL 直写 [templates/admission-fixture.sql](templates/admission-fixture.sql) 仍保留作为 **schema-drift / 边界 fixture**：刻意 craft malformed evidence、unsupported kind、明文 secret 等用 CLI 不允许产出的 corner case
- 状态机覆盖：pending → approved → applied（dry-run vs --commit）；pending → rejected → 不可 apply；applied → 不可 re-apply；unsupported kind 路径（关注 status=`failed` + audit row 是否落）
- **必测安全路径**：
  - `payload.body` 含明文 secret 的 fixture → `apply` 默认 `--allow-secret-body block`，应命中 secret-scan（BUG-055 已修于 0.7.0，要重新校验）
  - `--allow-secret-body redact` 模式应替换为 `[REDACTED:sk-token]`
  - secret-scan 规则集是否覆盖 sk-token 之外的 JWT / AWS / GitHub PAT 等（TODO-012 是相关 gap）
  - admission `show/list` 默认 redact 是否真的 redact 了 `payload.body`（**BUG-061 类**：claim redacted 但 body 字段明文返回）
- **memory body vs index 注入对齐**：apply 后既要看 `.aiworker/memories/<topic>.md` 是否落盘，也要在 phase 5 验证 `MEMORY.md` 索引行 + body 都进了 LLM stdin（**BUG-060 类 partial-injection**）
- **DB 直读必跑（0.8.0 BUG-068/074）**：每一步状态机断言都加 `sqlite3 .aiworker/local/worker.db "SELECT count(*) FROM brain_admission_proposals;"` + `... WHERE status='pending';` + `... WHERE status='applied';` 校验数字与 CLI list 一致。**绝对不要相信 LLM 在 phase 5 final text 里说的"proposal 已提交"——只看 DB**

### Phase 5 — Executor + 真机 LLM 业务采样（关键阶段）

详见 [references/prompt-suite.md](references/prompt-suite.md)。

- `aiworker executor select --engine claude-code --apply`
- 装 fake-claude shim（hard-code DUMP_DIR / `#!/bin/bash`）：`cp templates/claude-shim.sh <debug-root>/bin/claude && chmod +x`
- **9 Soul × 6 类 prompt = 54 条业务采样**：A self-intro / B in-scope×1-2 / C high-risk×2（直白 + 隐性 destructive） / D out-of-scope×1-2 / E memory-recall / F edge-case（vague 模糊 prompt 看是否触发 brute-force tool loop / 越界 cwd 扫描，BUG-063 类）
- 每条用唯一 `--chat-id "<soul>:<label>:$(date +%s)"` 隔离，避免 conversation history 污染
- 用 [templates/run-one.sh](templates/run-one.sh) 保存 final text + intent / capability / quality 三个 decision 事件到 `samples/<label>.txt`
- **对照实验（ablation）**：至少在 dev / hr / general 三个 Soul project 上 `mv .aiworker/{SOUL,AGENT,USER,MEMORY,ROLLUP}.md .bak`，重跑 self-intro 对比；删除前后回答风格几乎一致（回退到 engine CLI default identity）→ 定锤"brain 真注入了 LLM"
- 检查 `~/.claude/projects/<dir-hash>/<sessId>.jsonl`：里面的 attachment 是否含 .aiworker 字面 / Developer Soul 等 brain 关键词，用以辨别"通过 cwd-CLAUDE.md 兜底"还是"真注入"
- **不要因为单条 Soul 单条 prompt 看起来对题就停**：横向 9 Soul × 4 必跑（A/B/C/D）+ ablation 三件套才算 prod-grade 证据
- **admission bypass 必查（0.8.0 BUG-068）**：每个 claude-code Soul 跑完一组采样后，对照 `sqlite3 .../brain_admission_proposals count` vs `ls ~/.claude/projects/-home-<absolute-path-with-dashes>/memory/`。前者 0 + 后者 ≥1 = LLM 用 user-level memory bypass 了 admission，是 BUG-068 类 finding，不是采样的 happy path
- **codex Soul 文件系统辅助 evidence（0.8.0 BUG-070）**：codex 不发 `orchestrator.tool_call` 事件；任何"codex 是不是真做了 X"的判定都加 `find .aiworker/local` + `find .aiworker/memories` + `find <project-cwd> -newer init-marker -type f`，不能只看 stream log

### Phase 6 — Brain 决策层 LLM evaluator 验证

- `aiworker config set` 把 `orchestrator.decisionPipeline.intentClassifier.evaluator='llm'` + `qualityGate.evaluator='llm'` 显式开
- **必加 `--timeout-ms 240000`**（默认 90s 在 4-5 次 LLM 串行 cold-start 下不够，TODO-013 是相关 gap）
- 跑一次普通 prompt，fake-claude shim 应抓到 4 次调用（intent / main / quality / 偶尔 capability）
- 检查每次 stdin 是否含 system message 段 + strict JSON schema 指令；如果都 fallback 到 heuristic 且事件 reason 字段是 `"llm-intent-classifier-error: ..."` → BUG-057 类回归
- 0.7.0 已修 BUG-057；新版本要重新做 regression check
- **0.8.0 实测（BUG-066 / BUG-067）**：默认配置下事件 source 始终是 `intent-heuristic` / `capability-registry` / `heuristic`，`mode` 始终是 `observe_only`，60 turn 全部 `conversation.classifier reason: "non-json-classifier-output"`。开启 `evaluator: llm` 后必须**两项都验证**：(a) `intent_decision.source` 是否切到 `intent-llm-...`；(b) `mode` 是否离开 `observe_only`。如果 source 切了但 `mode` 还是 `observe_only` —— **下游不被 gating，决策没真起作用**，要么 docs 改、要么实现 enforce mode，按 BUG-066 类落盘

### Phase 7 — Worker REST + Admin UI 边界

- 前置：再次 `pgrep -af 'aiworker serve'` 清理（TODO-016：serve 端口冲突时静默 fail，前一版残留会让本次 smoke 命中错 worker）
- `aiworker token rotate` 拿 bearer
- `aiworker serve --port <port> --no-open` 后台启动（用 `setsid + > log 2>&1 &`，写 pidfile；启动后 `tail -3 serve.log` 确认绑定成功）
- curl 验证：`/health` 无需 auth；`/api/worker/info` 401 → bearer 通；brainSummary 字段含 admissions byStatus / scopeManifest
- `/api/worker/brain/admission/<id>?showSensitive=true` 默认 redact 是否真的 redact（**BUG-061 类**）
- **`/openapi.json` paths 字段不能是 `{}`**（BUG-065 类，OpenAPI 注册全断会让 Scalar UI 空壳）
- admin/ 返回 SPA HTML、/docs 返回 Scalar HTML：用 `curl -i`（GET + headers），不要用 `curl -sI`（HEAD 自然返回 0 content-length）
- **收尾**：`kill -TERM <pid>` + `pgrep -af 'aiworker serve'` 二次确认

### Phase 8 — Findings → PMA task 落盘

详见 [references/findings.md](references/findings.md)。

- 临时 finding 文件用 `BUG-N-*.md` / `UX-N-*.md` 命名（debug-root 内）
- 收尾时映射到仓库 PMA task（`BUG-NNN.md` / `TODO-NNN.md` / `QA-NNN.md`），用下一个可用编号
- index.md 末尾追加；维护 `Updated: <date>` 字段
- `QA-NNN` 的 task 用 `status: completed`，登记本次调试 campaign，**必含上一版 BUG/TODO 修复确认核对表**（已修 / 仍存在 / 部分修复 / 新发现 四列）+ finding ↔ task 对照表

### Phase 9 — Multi-turn 稳定性 + Cross-engine 验证

新增于 0.7.0 campaign（详见 [references/recipes.md](references/recipes.md) R11/R12）。

- **Multi-turn 稳定性**（用 [templates/run-multi-turn.sh](templates/run-multi-turn.sh)）：
  - 在 dev / hr 两个 Soul project 上**复用同一 `--chat-id` 跑至少 5 轮**（0.8.0 起建议 ≥10 轮，覆盖 marker recall × 越权 × admission × risk × summary）
  - 每轮 stdin 都应含完整 brain（不应该出现 `--resume` 形式让 brain 漂到 engine 自己的 session）
  - turn 5+ 应能引用 turn 1+3 的 context（验证 conversation history 拼接正确）
  - stdin 体积随轮数线性增长是预期（170B → 2000B+ 量级），不是 bug，但要标记成 token 成本注意点
  - **conversation 切分必查（0.8.0 BUG-069）**：跑完后必跑 `sqlite3 .aiworker/local/worker.db "SELECT count(*) FROM conversations WHERE chat_id=?"`，必须 = 1。codex 上常见 = N（每轮一个），claude-code 上 = 1。> 1 即 BUG-069 类
  - **marker recall 是 multi-turn 的强制采样点（0.8.0 BUG-069）**：turn 1 让 LLM 记 `MARKER_<sub>_T1=<distinctive>`，turn 4 / turn 8 / turn 12 各回忆一次。turn 4 失败而 claude-code 同条件成功 = 上面 conversation 切分的因果证据
- **Cross-engine 抽样**（至少 codex）：
  - `aiworker executor select --engine codex --apply`
  - 装 codex shim（[templates/codex-shim.sh](templates/codex-shim.sh)，结构同 claude-shim）
  - 在 dev Soul 上跑 4 类 prompt（A self-intro / C high-risk / D out-of-scope / no-brain ablation），对比 claude-code 同 Soul 行为
  - codex 通过 jsonrpc `turn/start` 的 `<System>...</System>` tag 注入 brain（与 claude-code 的 `--append-system-prompt` 路径不同，要分别确认）
  - codex 在 D-out-of-scope 比 claude-code "软"（倾向"我可以先给一版草案"）是 codex CLI default 与 SOUL.md 交互的产物，记录但**不当 BUG**，合并到 SOUL prod-grade suggestions
  - **codex 事件流不全（0.8.0 BUG-070）**：codex 在 `aiworker run` 的 stream 里**完全不发 `orchestrator.tool_call` 事件**；任何"codex 是不是真调了 tool / 写了文件 / 调了 CLI"的判定都必须用 `sqlite3 brain_admission_proposals` + `find .aiworker/local` + `find <project-cwd>` 文件系统直读，不能只看事件流。否则会把"codex 真做了"误判成"codex 啥也没做"
  - **admission engine asymmetry（0.8.0 BUG-068 关键发现）**：claude-code engine 上的 LLM 倾向用 user-level memory（`~/.claude/projects/<scope-hash>/memory/`）替代 AIWorker brain admission；codex engine 上的 LLM 反而会摸到 `aiworker brain admission propose --i-know-this-is-debug` CLI 路径并真写入 DB。**必须 cross-engine 双跑同一组 prompt** 才能暴露这个 asymmetry：单 claude-code 通过看不出 admission 缺失（user-level memory 假装填补了），单 codex 也看不出（codex 走对了）；只有横向对照才能定锤是 admission pipeline 的 LLM 入口设计 gap 而不是某个 engine 的孤立问题
  - acp / cursor / mcp 在没人手抽样的情况下用 `推断` 表达，不要在 REPORT 里写"已修复"

## Pitfalls（来自历次实测踩到的坑）

- **PATH 漂移**：bun bin 必须出现在 npm-prefix/bin 之前；否则 `aiworker.js` shebang fallback 到 node 会跑通但行为偏移（aiworker.js 是 bun bundle）。npm-prefix/bin 也要在系统 npm-global/bin 之前，否则会跑前一版残留 install
- **fake-claude shim 必须 tee stdin**：直接 `cat | claude` 会消耗 stdin 让真 claude 收不到；正确做法见 [templates/claude-shim.sh](templates/claude-shim.sh) 的 `<(tee -a $LOG)` 写法
- **engine child env allowlist**：adapter 给 child 进程的 env 经过 allowlist 过滤，`AIWORKER_*`/`DEBUG_*`/`DEBUG_ROOT` 都不会传到 engine child（详见 TODO-014）。**shim 内一切路径必须 hard-code absolute**，不要 `${DEBUG_ROOT:-/tmp}` fallback；否则 dump 会落到 `/tmp/dump` 而你以为它没工作
- **shebang 用 `#!/bin/bash` 绝对路径**：engine child 的 PATH 经过 sandbox，`#!/usr/bin/env bash` 在某些情况下找不到 bash 让 shim 直接 silent skip
- **chat-id 不唯一造成假阳性**：连续多 prompt 不显式 `--chat-id` 会让上一轮回答的 token 漂进下一轮判读，可能让"BUG-056 已修"的版本看起来像复发（其实只是上一轮"我是 Claude Code"残留），也可能让"Soul 引导失效"的版本看起来像生效。每条 sample 一个 chat-id 是底线
- **claude-code session resume 假象（已知风险）**：旧版本曾出现第二轮起 argv 加 `--resume <sessId>`，stdin 只发 incoming message，brain 永远漂移到 claude-code 自己的 session。0.7.0 已规避（每轮重新注入 `--append-system-prompt`），但**新版本必须用 multi-turn 实测确认没有回归**
- **multi-turn stdin 线性增长**：同一 chat-id N 轮，每轮注入完整 brain + 历史 conversation，stdin 体积 170B → 2000B+ 单调增长。这是 token 成本注意点，不是 bug；但如果发现 turn N stdin 比 turn N-1 还小，说明 conversation history 没拼上去
- **brain 决策层 token 成本**：开启 LLM evaluator 后单轮对话变成 4-5 次 engine 子进程（每次 cold start ~1.5s + 默认 system 3000+ token）。0.7.0 已修 BUG-057 让 JSON 解析成功，但 **timeout 默认 90s 在串行 cold-start 下会超时**，要把 `--timeout-ms` 提到 240000+
- **Soul "看起来在引导" 是假象**：单条 Soul 单条 prompt 拒绝 drop table、out-of-scope 提示、in-scope 风格貌似正确，**可能全部来自 engine CLI 自身 default system prompt + chat history 推断**；只有"横向 9 Soul × 4 必跑 + ablation 删除 brain 重跑"三件套才能确凿
- **Partial-injection 容易被错杀成"已修"**：MEMORY.md 索引行进了 stdin、但 memory body 没注入（BUG-060 类）；admission show 默认 redact 字段返回了 redacted 但 payload.body 字段明文（BUG-061 类）。只看上层接口或 brain status 完全发现不了，**必须 dump shim stdin 全文 grep memory body 关键词 + 直接读 payload 各字段**
- **Heuristic 漏关键词**：intent classifier heuristic 只看字面 destructive verb（drop / 转账），漏 force-push main / rm -rf workspace 等隐性高风险（BUG-064 类）。Type C high-risk prompt 必须包含至少 1 条隐性 destructive，否则覆盖不到这一类
- **OpenAPI 注册全断 silent**：`/openapi.json` 返回 200 但 paths 字段是 `{}`，Scalar UI 也照样渲染空壳（BUG-065 类）。phase 7 必加 `paths != {}` 检查，不要只看 HTTP 200 + content-length 非零
- **Cross-engine 行为差异不是 BUG**：codex 在 D-out-of-scope 软于 claude-code（倾向"先给一版草案"），是 codex CLI default 系统提示的产物。记入 SOUL prod-grade suggestions，不要建 BUG task
- **REST smoke 撞前一版残留**：上一版残留 `aiworker serve` 占着默认端口，本版本启动会静默 fail（TODO-016），后续所有 curl 命中错 worker，看起来像 401 / 找不到 admission。phase 1 + phase 7 都要 `pgrep -af 'aiworker serve'`
- **LLM hallucinate "已落盘 / proposal 已采纳" 是常态（0.8.0 BUG-074）**：claude-code 上的 LLM 在 admission proposal phase 几乎必定输出"proposal 已提交为 pending"或"该条目已完整落盘，无需重复提交"——但 `sqlite3 brain_admission_proposals` 计数为 0。**LLM 自报告的"成功"完全不可信**，把它当作 noise；唯一权威是 DB count。**调试 review 时**：每次 LLM 用了"已落盘 / 已采纳 / 已提交 / 已记录"等措辞都打个 sqlite3 实查；一致就归档，不一致就立刻是 BUG-074 类 finding
- **claude-code 上 admission bypass 是隐形 silent leak（0.8.0 BUG-068）**：admission count=0 + user-level memory 文件却 ≥1，意味着"长期记忆"被写到了 AIWorker scope 之外、operator 也看不到的目录（`~/.claude/projects/-home-ben-projects-debug-aiworker-...-<sub>/memory/MEMORY.md` + topic 文件）。这是 product governance 级 leak —— operator 在 fleet UI 上看到 admissions 队列空、以为 LLM 没做长期记忆操作；实际上 LLM 在 user-level memory 里持续累积。phase 5 / phase 9 收尾必须 `find ~/.claude/projects/-home-ben-projects-debug-aiworker-<date>-<sub>/memory -type f` 校验
- **0.8.0 brain 决策层 mode=observe_only 是产品语义陷阱（BUG-066）**：phase 6 即使切到 `evaluator: llm` 后看到 `intent_decision.source` 是 `intent-llm-...`，**仍然要看 `mode` 字段是否离开 `observe_only`**。`observe_only` 意味着事件层有 LLM 决策但下游 prompt assembly / capability gating / risk threshold 不被影响 —— 决策事件被记录但不真起作用。0.8.0 默认所有事件都是 `observe_only`，这一项是 prod-grade 调教必查
- **codex 同 chat-id 切多 conversation 是 multi-turn 隐形 trap（0.8.0 BUG-069）**：codex 上 12 turn 同 chat-id 跑完，`conversations` 表可能有 5-7 条；`aiworker sessions list` 只报最新 conversationId 作为 currentConversationId，前轮 history 失访。表面上 `aiworker run --chat-id <id>` 每次都 exit 0、output 看起来连贯；只有 turn 4+ 让 LLM 引用 turn 1 marker 才会暴露。**multi-turn campaign 不放 marker recall 等于没测连续性**

## Templates & Helpers

- [templates/claude-shim.sh](templates/claude-shim.sh) — fake-claude wrapper（PATH 前置即可抓 stdin）
- [templates/codex-shim.sh](templates/codex-shim.sh) — fake-codex wrapper（cross-engine 验证用，结构同 claude-shim）
- [templates/run-one.sh](templates/run-one.sh) — 业务采样 helper：跑 `aiworker run` 并提取 final text + 三个决策事件
- [templates/run-multi-turn.sh](templates/run-multi-turn.sh) — multi-turn 同 chat-id N 轮 driver，验证每轮 brain 是否重新注入
- [templates/admission-fixture.sql](templates/admission-fixture.sql) — 直写 worker.db 注入 admission fixture（含合法 evidence schema 与 secret-leak / unsupported-kind 边界 fixture）

## References

- [references/recipes.md](references/recipes.md) — 完整命令配方（install / fake-claude / fixture / 对照实验 / REST / multi-turn / cross-engine / 修复确认 / 收尾）
- [references/prompt-suite.md](references/prompt-suite.md) — 9 Soul × 6 类业务采样矩阵 + 期望行为对照表 + cross-engine 行为差异
- [references/findings.md](references/findings.md) — PMA 落盘规范：编号、严重度判定、task 文件结构、index 维护、上一版修复确认核对表

## Historical Reference

本 skill 由三轮端到端调试沉淀：

- **2026-05-04 / `@zonease/aiworker-cli@0.6.0`** — baseline campaign，详见 `/home/ben/projects/debug-aiworker/qa-2026-05-04/REPORT.md` + `findings/`，落盘 `docs/task/QA-004.md`、`BUG-054..059.md`、`TODO-009..011.md`
- **2026-05-04 / `@zonease/aiworker-cli@0.7.0`** — 第二轮 campaign（91 业务采样 + 6 ablation pair + 5 phase6 dump + multi-turn + codex cross-engine），详见 `/home/ben/projects/debug-aiworker/qa-2026-05-04-v0.7.0/REPORT.md` + `findings/`，落盘 `docs/task/QA-005.md`、`BUG-060..065.md`、`TODO-012..016.md`。0.6.0 关键 BUG（055/056/057/058/059 + TODO-009）全部已修复确认；新发现包括 partial-injection（BUG-060）、admission show redact 漏（BUG-061）、heuristic 漏隐性 destructive verb（BUG-064）、`/openapi.json` paths={}（BUG-065）等
- **2026-05-05 / `@zonease/aiworker-cli@0.8.0`** — 第三轮 campaign，5 Souls × 12 turns × 2 engines（developer × claude-code，developer × codex，hr-recruiting × claude-code，finance-ops × codex，qa-reviewer × claude-code）= 60 turn multi-turn 矩阵，详见 `/home/ben/projects/debug-aiworker/release-0.8.0/`，落盘 `docs/task/QA-006.md`、`BUG-066..074.md`、`TODO-026.md`。0.7.0 关键 BUG-065（OpenAPI paths={}）已修复确认（12 paths）。新发现 9 条：
  - **BUG-066 P1** Brain 决策层 intent / capability / quality_gate 全部 heuristic + `mode: "observe_only"`，60/60 turn 无任何 LLM source；产品定位"Brain decision LLM"未落地
  - **BUG-067 P1** `conversation.classifier reason: "non-json-classifier-output"` 100% silent fallback，原始 LLM 输出未保留
  - **BUG-068 P1** brain admission proposal 缺 LLM-discoverable 入口；claude-code engine 上 0/3 Soul 触发真实 admission DB 写入（全部 bypass 到 user-level memory），codex 上 2/2 Soul 真写入。**admission engine asymmetry 是 prod-critical 设计 gap**
  - **BUG-069 P1** codex executor 同 chat-id 跨 12 turn 切成 6-7 个 conversation（claude-code 同条件 = 1 个），导致 turn 4+ marker recall 失败
  - **BUG-070 P1** codex executor 在事件流里完全不发 `orchestrator.tool_call` 事件，observability 严重不对等
  - **BUG-071 P2** `aiworker executor doctor` banner 与 body Status 矛盾（"0 ERR · 0 WARN" vs `Status: WARN`）
  - **BUG-072 P2** `aiworker init` stdout 直接打印 bootstrap token + master-key，warning UX 弱、易随 stdout 泄漏
  - **BUG-074 P2** LLM 在 claude-code 上 hallucinate "proposal 已采纳"，但 admission DB count = 0
  - **BUG-073 P3** `aiworker soul --help` 等未知子命令静默回退到顶级 help
  - **TODO-026 P3** `aiworker init` "alternates" 推荐文案是 advisory 但渲染得像权威；finance-ops 选 codex 也允许，需要在 advisory 与 enforced 之间二选一
  
  正面结论：Soul / persona / scope / capability / boundary / risk-policy 注入 LLM 真实工作，5/5 Soul 全部正确拒绝越权请求与高风险动作；claude-code engine 单 chat-id 跨 12 turn 维持单一 conversation 与精确 marker recall；worker REST/admin/openapi 健康。
