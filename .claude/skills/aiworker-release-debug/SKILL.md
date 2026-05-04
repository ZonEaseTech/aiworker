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

## Always-On Rules（来自历史用户多次强调）

1. **黑盒、用已发版**：`npm install -g @zonease/aiworker-cli@<version>` 到隔离 prefix，不修改 published 包；不要图方便直接跑源码 dev server。本规则若被违反，发现的"问题"可能是仓库源码状态而非 release 状态。
2. **token 不是减少采样的理由**：用户明确"不在乎 token 消耗"。每个 Soul 至少 5 类 prompt 真实 LLM 采样；不要靠"看代码推断行为"省样本。
3. **Brain 真机注入必须用 fake-claude shim 验证**：`aiworker brain memories` / `brain status` 显示数据无意义，关键看 LLM 子进程实际收到了什么 stdin / argv。**只看上层接口会漏掉 BUG-056 这一类产品定位级缺陷**。
4. **必须做对照实验**：在确认 brain 注入失效时，删除 SOUL.md / AGENT.md / MEMORY.md 重跑同 prompt，回答几乎一致就是定锤证据；不做对照只能停在"看起来对题"的假象上。
5. **brain 决策层（intent / capability / quality）也要走 LLM 路径采样**：默认 heuristic，需 `aiworker config set` 显式开 `evaluator: llm`，再用 fake-claude 抓三次决策调用是否真的产生 valid JSON。
6. **executor engine 用 claude-code**（用户的常用环境）；其它 engine 在调试结尾给"是否同样断"的推断或抽样验证。
7. **调试期间默认中文交流**；落盘到仓库 `docs/task/` 的 task 标题用英文（remote-visible metadata 规范），正文中文，evidence 路径指 `<debug-root>/findings/...`。
8. **缺陷与优化项必须按 PMA 规范落盘**：`docs/task/BUG-NNN.md` / `TODO-NNN.md` + 同步 `docs/task/index.md`；不擅自创建 PLAN-* （等 owner 认领后再起 plan）。详见 [references/findings.md](references/findings.md)。
9. **不破坏调试痕迹**：fake-claude shim 抓到的 dump、samples 下的 LLM 回答原文、admission fixture SQL 都属于 evidence，调试结束不要清理；它们是后续 owner 复现时的唯一来源。
10. **收尾必须 kill serve / 清残留 claude 子进程**：`pgrep -af 'aiworker serve'` 验证；不能让后台进程污染下一次调试。

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

- 隔离 npm prefix → `npm install -g @zonease/aiworker-cli@<version>`
- 验证 `aiworker --version`、根 help 命令树完整、`aiworker soul list` 暴露 schema pack
- 不在乎 PATH 漂移：每条命令显式 `export PATH="<bun-bin>:<npm-prefix>/bin:..."`，bun-bin 必须前置（aiworker.js 是 bun bundle，需要 bun runtime）

### Phase 2 — Init matrix（多 Soul preset）

- 至少 4 个 preset：developer / hr-recruiting / finance-ops / general-assistant；按需加 devops-sre / product-designer / qa-reviewer / project-manager / support-operator
- 每个 preset 检查 `.aiworker/scope.json` kind / SOUL.md 风格 / capability-packs.json / toolsets.json / policy.json 是否真的差异化
- `aiworker doctor` PASS / WARN 是否合理；`aiworker executor doctor --engine claude-code` 是否正确探测 claude binary

### Phase 3 — Brain artifact / scope manifest / brief compiler

- 空态测试 `brain status / skills / memories / artifacts list`
- `brain brief --task "..."` 默认输出（注意 BUG-054：未传 `--artifact` 时仍出现 `undefined: not found` 段，是 0.6.0 已知陷阱）
- token-budget / unknown-soul / executor-hint 边界

### Phase 4 — Admission MVP（CRUD + materialize）

- 0.6.0 published CLI 没有 `propose` 子命令（详见 TODO-009）→ 必须直写 worker.db 注入 fixture（见 [templates/admission-fixture.sql](templates/admission-fixture.sql)）
- 状态机覆盖：pending → approved → applied（dry-run vs --commit）；pending → rejected → 不可 apply；applied → 不可 re-apply；unsupported kind 路径
- **必测安全路径**：注入一条 `payload.body` 含明文 secret 的 fixture，跑 `apply --commit`，看 `.aiworker/memories/<topic>.md` 是不是把 secret 落盘了（BUG-055 已知缺陷）

### Phase 5 — Executor + 真机 LLM 业务采样（关键阶段）

详见 [references/prompt-suite.md](references/prompt-suite.md)。

- `aiworker executor select --engine claude-code --apply`
- 装 fake-claude shim：`cp templates/claude-shim.sh <debug-root>/bin/claude && chmod +x`
- 每个 Soul 至少跑 5 类 prompt：self-intro / in-scope / high-risk / out-of-scope / memory-recall
- 用 [templates/run-one.sh](templates/run-one.sh) 保存 final text + intent / capability / quality 三个 decision 事件到 `samples/<label>.txt`
- **对照实验**：在某个 Soul 的 project 里 `mv .aiworker/SOUL.md .aiworker/SOUL.md.bak`、`mv .aiworker/AGENT.md .aiworker/AGENT.md.bak`、`mv .aiworker/MEMORY.md .aiworker/MEMORY.md.bak`，重跑 self-intro，对比回答 → 检测 brain 是否真的进入 LLM
- 检查 `~/.claude/projects/<dir-hash>/<sessId>.jsonl`：里面的 attachment 是否含 .aiworker 字面 / Developer Soul 等 brain 关键词，用以辨别"通过 cwd-CLAUDE.md 兜底"还是"真注入"
- BUG-056 已确认 0.6.0 在 claude-code adapter 不注入 system prompt；如果 adapter 修过，需重跑这一阶段做 regression

### Phase 6 — Brain 决策层 LLM evaluator 验证

- `aiworker config set` 把 `orchestrator.decisionPipeline.intentClassifier.evaluator='llm'` + `qualityGate.evaluator='llm'` 显式开
- 跑一次普通 prompt，fake-claude shim 应抓到 4 次调用（intent / main / quality / 偶尔 capability）
- 检查每次 stdin 是否含 system message 段 + JSON schema 指令；如果没有 → BUG-057 仍未修，事件 reason 字段会是 `"llm-intent-classifier-error: SyntaxError: JSON Parse error: Unexpected identifier ..."`

### Phase 7 — Worker REST + Admin UI 边界

- `aiworker token rotate` 拿 bearer
- `aiworker serve --port <port> --no-open` 后台启动（用 `setsid + > log 2>&1 &`，写 pidfile）
- curl 验证：`/health` 无需 auth；`/api/worker/info` 401 → bearer 通；brainSummary 字段含 admissions byStatus / scopeManifest
- `/api/worker/brain/admission/<id>?showSensitive=true` 默认 redact
- admin/ 返回 SPA HTML
- **收尾**：`kill -TERM <pid>` + `pgrep -af 'aiworker serve'` 二次确认

### Phase 8 — Findings → PMA task 落盘

详见 [references/findings.md](references/findings.md)。

- 临时 finding 文件用 `BUG-N-*.md` / `UX-N-*.md` 命名（debug-root 内）
- 收尾时映射到仓库 PMA task（`BUG-NNN.md` / `TODO-NNN.md` / `QA-NNN.md`），用下一个可用编号
- index.md 末尾追加；维护 `Updated: <date>` 字段
- `QA-NNN` 的 task 用 `status: completed`，登记本次调试 campaign，列出所有 finding ↔ task 对照表

## Pitfalls（来自本次实测踩到的坑）

- **PATH 漂移**：bun bin 必须出现在 npm-prefix/bin 之前；否则 `aiworker.js` shebang fallback 到 node 会跑通但行为偏移（aiworker.js 是 bun bundle）
- **claude-code session resume 假象**：第二轮起 argv 加 `--resume <sessId>`，stdin 只发 incoming message；这看起来"省 token"实则让 brain 永远漂移到 claude-code 自己的 session，AIWorker 注入的 system 永远不会被刷新
- **fake-claude shim 必须 tee stdin**：直接 `cat | claude` 会消耗 stdin 让真 claude 收不到；正确做法见 [templates/claude-shim.sh](templates/claude-shim.sh) 的 `<(tee -a $LOG)` 写法
- **admission propose 缺失**：CLI 没有 `aiworker brain admission propose`（TODO-009），手动注入 worker.db 时 evidence JSON 必须含 `at/kind/ref` 三字段，缺一个整个 list 命令崩溃（BUG-058），不是只这条 row 的问题
- **brain 决策层 token 浪费**：开启 LLM evaluator 后单轮对话变成 4 次 claude-code 子进程（每次 cold start ~1.5s + 默认 system 3000+ token），但 100% fallback heuristic（BUG-057）；不要把"LLM evaluator 开了"当成"brain 决策走 LLM 了"
- **Soul "看起来在引导" 是假象**：dev Soul 拒绝 drop table、out-of-scope 提示、in-scope 风格貌似正确，**但全部来自 claude-code CLI 自身 default system prompt + chat history 推断**；只有对照实验（删 SOUL.md 重跑）才能验证

## Templates & Helpers

- [templates/claude-shim.sh](templates/claude-shim.sh) — fake-claude wrapper（PATH 前置即可抓 stdin）
- [templates/run-one.sh](templates/run-one.sh) — 业务采样 helper：跑 `aiworker run` 并提取 final text + 三个决策事件
- [templates/admission-fixture.sql](templates/admission-fixture.sql) — 直写 worker.db 注入 admission fixture（含合法 evidence schema 与 secret-leak / unsupported-kind 边界 fixture）

## References

- [references/recipes.md](references/recipes.md) — 完整命令配方（install / fake-claude / fixture / 对照实验 / REST / 收尾）
- [references/prompt-suite.md](references/prompt-suite.md) — 跨 Soul 业务采样矩阵 + 期望行为对照表
- [references/findings.md](references/findings.md) — PMA 落盘规范：编号、严重度判定、task 文件结构、index 维护

## Historical Reference

本 skill 由 2026-05-04 对 `@zonease/aiworker-cli@0.6.0` 的端到端调试沉淀。完整证据：
- 总报告：`/home/ben/projects/debug-aiworker/qa-2026-05-04/REPORT.md`
- 10 份 finding：`/home/ben/projects/debug-aiworker/qa-2026-05-04/findings/`
- 落盘的 PMA task：`docs/task/QA-004.md`、`docs/task/BUG-054..059.md`、`docs/task/TODO-009..011.md`
