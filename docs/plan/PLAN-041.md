# PLAN-041 Worker 初始化与 Soul 生命周期：安全 init、模板预置、能力包与更新治理

- **status**: rejected
- **createdAt**: 2026-04-29 17:50
- **approvedAt**: 2026-04-29 18:04
- **rejectedAt**: 2026-05-01 14:53
- **relatedTask**: FEAT-039

## 关闭标记 / Split Future Work

本计划作为一个大范围方案已关闭，不再作为 ongoing implementation 入口。S1-S3 与后续 FEAT-043 / FEAT-044 已经交付当前 MVP：safe init、Soul preset/customize、capability draft、`aiworker doctor` 静态 validation、executor-native projection 独立边界。

未完成的 S4-S6 需要未来重新发起更窄方案，不应继续在本计划里滚动追加：

- External adapter sync；
- Soul update / pin / diff；
- Self-iteration admission gate；
- Mutating brain/runtime quick config。

最终边界保留：

- 已交付且继续有效：`aiworker init`、Soul templates / customize、brain/runtime project capability 草案、`aiworker doctor` 静态 validation。
- 未来重开时仍有效：external agent adapter、Soul update、self-iteration admission gate 必须保持 proposal/diff/approval/rollback。
- 已拆出：executor-native MCP/skill/plugin projection。相关实现只以 FEAT-044 / PLAN-055 为准。
- 命名约束：本文早期草案里的 `aiworker skill add`、`aiworker mcp add`、`toolset enable` 不能作为 executor 命令规格；当前已落地命令是 `aiworker doctor` 与 `aiworker executor mcp add/sync/doctor`。

## 现状

1. **基础初始化已完成**：FEAT-036 / PLAN-023 已实现 project-scope `aiworker init` / `aiworker scope`，并能创建 `.aiworker/`、`local/`、`AGENT.md`、`SOUL.md`、`USER.md`、`MEMORY.md`、`ROLLUP.md`、`skills/`、`memories/`、`mcp.json`。
2. **当前模板仍是 stub**：`ensureProjectAiworker()` 只 seed 通用占位内容；没有 Soul 模板、能力包、外部 agent adapter、MCP/Skill validation 或 wizard。
3. **PLAN-039 定义 runtime 决策管线**：Intent Router、Capability Registry、Context Manager、Quality Gate、Learning Loop 解决 worker “运行时怎么做”。本计划解决用户“怎么快速且安全地配置出这样的 worker”。
4. **防污染是核心约束**：初始化、Soul 更新、自我迭代都可能改写长期上下文。如果没有 diff、approval、scope 和 rollback，低质量记忆或约束会削弱 worker 能力。
5. **边界更新**：本计划中的 capability packs / `.aiworker/mcp.json` / `.aiworker/skills/` 属于 brain/runtime project capability 草案；executor 原生 MCP/skill/plugin 配置不复用这些文件，独立由 FEAT-044 / PLAN-055 的 `.aiworker/executor-capabilities.json` 投影。

## 目标效果

用户进入一个项目后，可以用一个安全 wizard 完成 worker 配置：

```bash
aiworker init
# detect scope -> choose soul -> choose packs -> preview diff -> apply -> doctor
```

也可以用非交互命令快速配置：

```bash
aiworker init --soul developer --pack code --pack devops --dry-run
aiworker doctor
aiworker executor mcp add context7 --engine codex -- command ...
aiworker executor mcp sync --engine codex --dry-run
```

历史草案中的 `aiworker skill add`、`aiworker mcp add`、`toolset enable` 尚不是当前规格；尤其 `aiworker mcp add` 不得被用于 executor-native projection。executor MCP 快速配置必须显式挂在 `aiworker executor mcp ...` 下。

最终得到：

- `.aiworker/` 作为权威源；
- Soul 定义 worker 身份、职责边界、沟通风格和越权策略；
- Skill/MCP/Toolset 作为 brain/runtime capability packs 进入 registry；
- executor-native capability 通过 `.aiworker/executor-capabilities.json` 投影到 engine project config；
- `AGENTS.md` / `CLAUDE.md` / `.agents/` / `.claude/` 等外部文件作为 adapter 投影或导入来源；
- 云端 Soul 更新必须可 diff、可 pin、可回滚；
- 自我迭代写入前必须经过高质量收录门禁。

## 方案

### 1. Safe Init Contract

`aiworker init` 默认必须 safe/idempotent：

- 没有 `.aiworker/`：进入新建 wizard。
- 已有 `.aiworker/`：只做诊断和缺失项修复建议，不覆盖用户内容。
- 已有 `AGENTS.md`、`CLAUDE.md`、`.agents/`、`.claude/`：只检测并提示 import/adopt，不直接改。
- 已有 worker identity / worker.db：识别为现有 worker，提示 update/repair/migrate。
- 覆盖类动作必须先生成 snapshot 与 diff。

建议命令形态：

```bash
aiworker init              # 安全初始化或现状诊断
aiworker init --dry-run    # 只输出将要创建/修改的文件
aiworker init --merge      # 交互式合并缺失能力
aiworker init --adopt      # 导入现有 AGENTS.md/.agents/.claude 作为来源
aiworker init --reset      # 备份后重建 .aiworker
aiworker init --force      # 明确覆盖，必须二次确认
```

### 2. Soul Template Wizard

初始化早期询问 Soul。Soul 不只是语气模板，而是 worker 的职责边界、默认能力、风险姿态和交接策略。

首批模板建议：

- `developer`：开发、调试、代码审查、仓库维护。
- `project-manager`：计划、拆解、进度、风险、跨人协作。
- `devops-sre`：部署、监控、事故响应、环境治理。
- `product-designer`：产品、交互、界面、设计系统。
- `qa-reviewer`：测试、验收、质量门禁、回归分析。
- `support-operator`：客服、工单、用户问题处理。
- `finance-ops`：对账、财务运营、报表、审计辅助。
- `hr-recruiting`：招聘、面试、员工流程。
- `general-assistant`：通用项目助手。
- `customize`：用户自然语言自定义。

推荐模型：一个 primary soul + 多个 capability packs。比如 primary soul 是 `developer`，再叠加 `project-manager` 与 `devops-sre` 的部分能力。

### 3. Customize Flow

`customize` 是正式路径，不是兜底。wizard 应只问少量高信号问题：

1. 这个 worker 的主要职责是什么？
2. 明确不该做什么？
3. 遇到职责外任务时应该如何处理？
4. 默认沟通风格是什么？
5. 高风险操作是否必须 approval？
6. 默认要启用哪些 Skill/MCP/Tool？

输出目标：

```text
.aiworker/
  SOUL.md
  AGENT.md
  policy.json
  toolsets.json
  skills/
  mcp.json
```

结构化配置可以放在 frontmatter 或独立 JSON 中，但人类可读文件必须保留为权威审阅入口。

### 4. Capability Packs

Soul 选择后预置 capability packs，包括但不限于：

- Skill pack：拷贝或引用 `.aiworker/skills/<name>/SKILL.md`。
- MCP pack：写入 `.aiworker/mcp.json` 的 runtime server descriptor；不写 Codex / Claude Code / Cursor 的 engine project config。
- Toolset pack：写入 `.aiworker/toolsets.json`，定义默认启用工具组。
- Policy pack：写入 `.aiworker/policy.json`，定义 allowlist、approval、risk profile、denylist。
- Adapter pack：准备 `AGENTS.md`、`CLAUDE.md`、`.agents/`、`.claude/` 等外部 agent 适配。

所有 pack 启用前必须 validation：

- Skill：frontmatter、name、description、capabilities、依赖、示例、权限。
- MCP：server 可启动、`listTools` 可用、schema 合法、secret 只用 ref。
- Toolset：所有 tool 都在 worker/channel allowlist 内。
- Policy：没有与 Soul、AGENT、既有 policy 冲突。

### 5. External Agent Adapters

`.aiworker/` 是权威源；外部文件是投影或导入来源，不能反向抢权威。

建议目录：

```text
.aiworker/
  adapters/
    claude.json
    codex.json
    cursor.json
```

adapter 规则：

- 若外部文件不存在，可生成。
- 若外部文件存在，只做 managed section 插入或生成 patch proposal。
- 每次同步记录 source hash、target hash、生成器版本。
- 用户手改外部文件后，下一次 sync 必须提示冲突，不能静默覆盖。
- `AGENTS.md` / `CLAUDE.md` 可通过引用方式指向 `.aiworker/AGENT.md` / `.aiworker/SOUL.md`，减少重复内容漂移。

### 6. Out-of-Scope Behavior

Soul 要定义职责外响应策略，而不是让 worker 随意拒绝。

四档策略：

1. **可做但不是核心职责**：接受任务，并说明按通用能力处理。
2. **需要额外能力**：说明当前未启用能力，并建议 Skill/MCP/Tool。
3. **应交给其他 worker**：生成 handoff proposal，包括任务摘要、推荐 worker、所需上下文和原因。
4. **不应执行**：涉及越权、危险写入、无授权访问或安全策略冲突时拒绝，并给出安全替代路径。

### 7. Soul Update

未来可支持云端或本地 registry：

```bash
aiworker soul list
aiworker soul diff developer
aiworker soul update developer
aiworker soul pin developer@1.2.0
```

更新流程：

```text
拉取模板 -> 本地 diff -> 冲突检测 -> migration proposal -> 用户批准 -> 备份 -> 应用
```

默认 pin 到具体版本，避免云端模板变化导致 worker 行为漂移。`latest` / `stable` / `experimental` 可以作为显式 opt-in channel。

### 8. Self-Iteration Admission

自我迭代默认只能生成 proposal，不能直接写长期记忆或策略。

每条 memory/skill/policy proposal 必须带：

- `source`: user_directive / operator_approval / repeated_success / quality_gate_failure / model_summary
- `scope`: project / worker / user / global
- `confidence`
- `evidence`: session id、用户纠正、gate 失败、成功任务或 operator override
- `review`: specificity、reuse value、overgeneralization risk、conflict check
- `rollback`: 变更前 hash 与可回滚 diff

默认写入规则：

- 用户明确指令和 operator approval 可以直接进入对应 scope。
- 多次成功执行证据可以进入 proposal，review 通过后启用。
- 单次模型总结只能进入草稿。
- 与 Soul/AGENT/policy 冲突的内容不能覆盖，只能生成冲突 proposal。

## 推进顺序

建议分六段实现：

1. **S1：Init preflight + dry-run diff**
   - 增强 `aiworker init` 检测已有 `.aiworker/`、外部 agent 文件、identity、worker.db。
   - 新增 dry-run 输出和 no-overwrite contract 测试。
2. **S2：Soul templates + customize wizard**
   - 引入首批 Soul 模板和少量交互问题。
   - 生成 `SOUL.md`、`AGENT.md`、policy/toolset 草案。
3. **S3：Capability packs + validation**
   - Skill/MCP/Toolset/Policy pack 描述、启用、doctor 检查。
   - 已落地最小切片只做静态 schema / validation 与 `aiworker doctor`；mutating brain/runtime quick config 命令需另起计划，executor-native quick config 已由 FEAT-044 / PLAN-055 承接。
4. **S4：External adapter sync**
   - 实现 adapter manifest、managed section、hash-based conflict detection。
   - 覆盖 `AGENTS.md`、`CLAUDE.md`、`.agents/`、`.claude/` 的安全投影。
5. **S5：Soul update / pin / diff**
   - 引入本地 registry 接口，云端 registry 先作为未来扩展。
   - 默认 diff/proposal，不自动 apply。
6. **S6：Self-iteration admission gate**
   - 给 memory/skill/policy proposal 增加 evidence、scope、confidence、review、rollback metadata。
   - 与 PLAN-039 Learning Loop 对接。

## 风险

1. **初始化过度复杂**：wizard 太长会阻碍首次使用。对策：默认模板 + capability pack 快速路径，advanced 配置放后续 `doctor` / `merge`。
2. **多源配置漂移**：`.aiworker/`、`AGENTS.md`、`CLAUDE.md`、`.agents`、`.claude` 容易冲突。对策：`.aiworker/` 单一权威，外部只投影，hash/diff 检测。
3. **模板污染项目**：不合适的 Soul 或 pack 会引入错误约束。对策：所有模板可 diff、可 rollback、可 pin。
4. **云端更新带来行为漂移**：远端模板变化会改变 worker 行为。对策：默认 pin 版本，update 必须 approval。
5. **自我迭代降智**：低质量记忆或过度泛化约束会削弱能力。对策：proposal-first、evidence、scope、confidence、conflict check、rollback。
6. **和 PLAN-039 边界重叠**：本计划不实现 runtime classifier/gate，只提供配置和 admission metadata；runtime 消费由 PLAN-039 处理。

## 范围

本计划覆盖：

- `aiworker init` 安全初始化体验；
- Soul 模板与自定义；
- Skill/MCP/Toolset/Policy capability packs；
- 外部 agent adapter 生成/同步；
- Soul 更新治理；
- 自我迭代收录门禁 metadata。

本计划不覆盖：

- PLAN-039 的 runtime Intent Router / Capability Registry / Quality Gate 实现；
- Web UI 完整配置页面；
- 云端模板服务本身；
- 具体业务 Soul 模板的最终文案打磨；
- 自动跨 worker 任务转交执行。

## 备选方案

1. **继续让 `init` 只创建 stub**：实现最少，但无法形成“快速配置可用 worker”的产品体验。不推荐。
2. **把 Soul 模板直接硬编码进 `SOUL.md`**：简单，但缺少版本、diff、pack 和 adapter 治理。只可作为 S2 的临时实现。
3. **让外部文件成为权威源**：兼容已有工具，但会导致多源漂移。不推荐。
4. **允许云端 Soul 自动更新**：看似省事，但会让 worker 行为不可预测。不推荐。

## 批注

用户已批准开工。先实施 S1（Init preflight + dry-run diff），因为它不会改变运行时行为，却能先把“默认不覆盖、所有变更可预览”的安全基线立住。执行通过 BKD 子任务分片推进，避免单 session 过大。

- 2026-05-01 13:08：S2 的后续可见性与测试收口已完成：init 后 next steps、`aiworker soul list/show`、全内置 Soul init 矩阵、Soul preset 独立文件拆分、CLI test gate 恢复通过。下一 session 可直接调查并推进 S3（Capability packs + validation）。
- 2026-05-01 13:22：S3 已批准实施。本切片只做静态 schema/validation 与 doctor 展示，不实现 mutating `skill add` / `mcp add` / `toolset enable`，也不启动 MCP server 或接入 runtime enforcement。
- 2026-05-01 13:34：S3 最小切片完成。交付共享 manifest/schema、CLI 静态 validation、`aiworker doctor`、init/soul validation 状态呈现和聚焦测试；MCP 仍只做 descriptor/secretRef 静态检查，真实 server probe 和 mutating capability commands 留给后续切片。
- 2026-05-01 14:32：补充废案标记：本文早期关于 `aiworker mcp add` / executor MCP 的隐含方向已经废弃。PLAN-041 后续仅承载 brain/runtime project capability 与 Soul 生命周期治理；executor-native projection 以 PLAN-055 为唯一入口。
- 2026-05-01 14:53：关闭本大计划。已交付 MVP 和边界澄清；S4-S6 若需要，按新任务/新计划重开。

2026-04-29 18:18：S1 已通过 BKD 子任务 `urey7cyc` 合入 main，merge commit `8284aa5`。后续仍按分片推进，下一阶段才考虑 S2 Soul templates registry skeleton，不在 S1 session 里扩展。

2026-04-30 15:47：补充 init 体验决策：git repo 只应是“可追踪项目上下文”的加分项，不应是初始化项目级 worker 的硬门槛。brand-new `aiworker init` 默认在当前 cwd 创建 `.aiworker/`；非 git cwd 通过 preflight notes 提醒用户确认目标目录，避免用 error 把正常空项目拦住。

2026-04-30 17:46：BUG-040 完成 S2R 修复。`aiworker init` 在 brand-new project 创建 worker identity / worker.db 前先解析 Soul；非交互路径必须传 `--soul <preset>`，交互路径提供 preset wizard 和 `customize` 问答；project layout 现在生成非 stub `SOUL.md` / `AGENT.md` 以及 `policy.json`、`toolsets.json`、`capability-packs.json` 草案。S3-S6 仍按本计划后续切片推进。
