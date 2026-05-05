# PLAN-109 Brain brief / admission read-path 收口

- **status**: completed
- **createdAt**: 2026-05-05 04:25
- **approvedAt**: 2026-05-05 04:25
- **completedAt**: 2026-05-05 04:50
- **relatedTask**: BUG-060, BUG-061, BUG-062, TODO-012

## 现状

QA-005 调试在 0.7.0 published 上发现 brief compiler / admission read path / secret-scan ruleset 三处互锁缺陷：

1. **BUG-060 P1**：`packages/core/src/worker/brain/brief/compiler.ts:199-200` `memory` section 仅读 `MEMORY.md`（trim 到 1200 字），不读 `.aiworker/memories/<topic>.md` body。LLM 拿到索引但拿不到内容，memory-recall 100% 失败。
2. **BUG-061 P1**：`packages/shared/src/brain/admission.ts:153-168` `redactSecretLikeValues` 只对 **field-name** 匹配 `token|api[-_ ]?key|password|secret|bearer|auth|credential` 的 key 替换 `<redacted>`。`payload.body` 这个 key 名不匹配，所以原文照样返回，UI 上的 `redacted: true` 是假的。
3. **BUG-062 P3**：`packages/core/src/worker/brain/brief/compiler.ts:244-267` `buildArtifactSummary` 没有对 refs 做 falsy 过滤；当 cac 把 `--artifact` 解析成 `[undefined]` 之类的退化数组时，会输出 `- undefined: not found ...`。BUG-054 在 0.6.0 修过 CLI 入口侧的 `normalizeRepeatableStringOption`，但 compiler 自己的 defense-in-depth 缺失。
4. **TODO-012 P2**：`packages/shared/src/brain/scan-body.ts:40-46` 当前 5 条 rule（sk-token / jwt / bearer-token / aws-access-key / github-token）+ high-entropy。缺少 Slack / Stripe / GCP API key / PEM private key 等业内标准形态。

涉及文件：

| 层 | 文件 |
|----|------|
| brief compiler | `packages/core/src/worker/brain/brief/compiler.ts` |
| brief shared schema | `packages/shared/src/brain/brief.ts` |
| admission service | `packages/core/src/worker/brain/admission/service.ts` |
| admission redact | `packages/shared/src/brain/admission.ts` |
| secret scanner | `packages/shared/src/brain/scan-body.ts` |
| CLI brief / admission | `apps/cli/src/commands/worker/brain.ts` |
| REST admission | `apps/api/src/worker/brain/routes.ts` |
| 现有测试 | `packages/core/src/worker/brain/brief/compiler.test.ts`、`packages/core/src/worker/brain/admission/service.test.ts`、`packages/shared/src/brain/{scan-body,admission,brief}.test.ts`、`apps/cli/src/commands/worker/{brain-brief,brain-admission}.test.ts`、`apps/api/src/worker/brain/routes.test.ts` |

## 方案

**用户预先授权按既往风格决策（不暂停）**。

### A. BUG-060 brief compiler 注入 memory body（task-aware）

1. `BrainBriefCompilerDeps` 增加可选 `memoriesDir?: string`，默认 `path.join(brainHome, 'memories')`。
2. `buildSection('memory', ctx)` 改为：
   - 读 `MEMORY.md` 索引（保持 1200 字摘要）作为 sub-section "memory-index"。
   - 然后扫 `<memoriesDir>/*.md` 文件名 + 索引行 entries → 与 `validated.task` 做轻量关键词匹配（小写化 + 拆词；`task`、`MEMORY.md` 索引行的人类标题、文件 basename 任一交集即命中）。
   - 命中文件按 priority 排序（索引行命中 > basename 命中），按 `MEMORY_BODY_LIMIT_PER_FILE = 800` 截断每条 body。
   - 把命中的 body 拼成 `# Memory body (task-matched)` 段，与 index 一起作为单个 brief section（id='memory'）；总 body limit 仍 ~3 KB（4 个 800 字）以保护 token budget。
   - 如果 `task` 文本太短或没有命中，仅注入索引（保持原行为，避免回归）。
3. `BrainBrief` shape 不变；section.body 内部多 sub-heading；用 brief warnings 通报命中文件名。
4. CLI handler / runtime 不动；compiler 的 dep 与新 limit 走单元测试。
5. 单元测试 `compiler.test.ts`：(a) MEMORY.md + 2 个 memories 文件 + task 中带关键词 → body 段含命中文件 body；(b) task 不命中 → 仅 index；(c) `memoriesDir` 不存在 → 仅 index 并 emit warning。

### B. BUG-062 brief compiler artifact-summary 防御性过滤

1. `compile()` L112 把 `validated.artifactRefs` 先经 `Array.from(new Set(refs.filter(r => typeof r === 'string' && r.trim().length > 0).map(r => r.trim())))`，命中条件改为 `if (refs.length > 0)`。
2. `buildArtifactSummary` 内部循环也 `if (typeof ref !== 'string' || ref.trim() === '') continue`。
3. 测试：传 `[undefined as unknown as string]` 与 `['', '   ']` → brief 不出现 artifact-summary 段。

### C. BUG-061 admission redact 内容扫描

1. `packages/shared/src/brain/admission.ts` 引入 `redactBodySecrets` 自 scan-body。
2. 新增 `redactStringContent(value: string): { value: string, hits: SecretHit[] }`：调用 `redactBodySecrets`，返回 redacted string + hits。
3. 改造 `redactSecretLikeValues` 走深度遍历：
   - field-name 命中（与现状一致）→ 直接 `<redacted>`；hits 列入 string-hit accumulator？— 简单起见：field-name 命中全替换，不再做内容扫描。
   - field-name 未命中且 value 是 string → 走 `redactBodySecrets`，命中替换为 `[REDACTED:<rule>]`。
   - 嵌套 array / object 递归。
4. 改造 `redactBrainAdmissionProposal`：summary / rollback / target 之前是直接透传，现在也走 string-content 扫描（因为操作员可能在 summary 里贴 token）。
5. CLI `runBrainAdmissionShow` / REST `GET /admission/:id` 增加 `--show-sensitive` + 环境变量 `AIWORKER_ADMIN_REVEAL=1` 双闸：默认 redact；要拿原文必须 (a) `--show-sensitive` 或 `?showSensitive=true`，(b) `AIWORKER_ADMIN_REVEAL=1` 环境变量。任意一个缺失都 fall-back 到 redact 并在 stderr 打 hint。同样适用于 list。
6. CLI 输出 `secretScan: { hits: [...] }` 段，UI 也能拿到 hits 列表显示"X 个内容已被 redact"。
7. 测试：(a) payload.body 里嵌 `apiKey=sk-LIVE-shouldnotpersist` → 默认 redact 后字符串包含 `[REDACTED:sk-token]`；(b) `--show-sensitive=true` + `AIWORKER_ADMIN_REVEAL=1` → 原文；(c) 仅 `--show-sensitive=true` 不带 env → fall-back redact + warn；(d) summary 内嵌 jwt → 同样 redact。

### D. TODO-012 secret-scan ruleset 扩展

1. 在 `RULES` 数组追加：
   - `slack-token`：`/\bxox[abprs]-[A-Za-z0-9-]{10,}/g`
   - `stripe-live`：`/\bsk_live_[A-Za-z0-9]{16,}/g`
   - `gcp-api-key`：`/\bAIza[A-Za-z0-9_-]{35}\b/g`
   - `pem-private-key`：`/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g`
2. 把 `SecretRuleId` union 同步扩展。
3. 更新 redact / preview 逻辑（已经 generic，应该自动覆盖）。
4. 单元测试 `scan-body.test.ts` 增加 4 条 rule 的 hit / preview / redact 校验。
5. README/docs 不动（admission 文档下一轮统一 sweep）。

## 风险

1. **BUG-060 retrieval 准确性**：关键词命中规则简单，可能 false negative（相关 memory 没命中）或 false positive（噪声 memory 进 brief）。我们走 conservative：MEMORY.md 索引行的人类标题命中权重最高；basename 命中次之；body 内字符串不参与 match（避免引入大文件扫描）。如果用户实际验证发现召回率不够，留 follow-up 走语义检索。
2. **BUG-061 性能**：`redactBodySecrets` 用了高熵扫描；large evidence body 上有 O(n) 开销。admission list 默认 limit=50，可接受。如果未来 list 全部走 redact，预算约 50 × ~10 KB = 500 KB scan，毫秒级。
3. **BUG-061 兼容性**：`redactBrainAdmissionProposal` 现在会改写 summary / rollback / target — 老 worker.db row 在历史上没有 secret，redact 应是 no-op；新数据按预期 redact。
4. **TODO-012 误报**：`pem-private-key` 跨行 regex 在 large body 上是 OK 但要小心 catastrophic backtracking——用 `[\s\S]+?` non-greedy 即安全。`gcp-api-key` 39 字符（`AIza` + 35 chars）是固定长度，无歧义。
5. **AIWORKER_ADMIN_REVEAL 环境变量**：新增 worker process env，不需要走 vault；只做"运维显式声明意图"信号。文档同步加 hint。

## 范围

- `packages/shared/src/brain/{scan-body,admission}.ts` + 对应测试
- `packages/core/src/worker/brain/brief/compiler.ts` + 测试
- `packages/core/src/worker/brain/admission/service.ts`（如 read-path 需要 secret-scan 旁路）
- `apps/cli/src/commands/worker/brain.ts`（`--show-sensitive` 双闸 + redact hint）
- `apps/api/src/worker/brain/routes.ts`（`?showSensitive=true` 双闸）
- focused unit + integration tests
- `docs/cli.md` 简短更新 admission show / brain brief 行为段

## 非范围

- LLM 语义化记忆检索（留 follow-up）
- admission redact 默认行为下增加内容扫描以外的 secret 检测层（vault 集成等）
- BrainBriefCompiler 接入 orchestrator system prompt 直接路径（PLAN-105 已完成 system 注入贯穿；这里只动 brief compiler 输出）

## 验证

- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run typecheck` / `bun run lint` 全量
- 手工 smoke：在 sandbox project 创建 memory + apply admission proposal → `aiworker brain brief --task "foo"` 应包含 body 而非仅索引；`aiworker brain admission show` 默认 redact `sk-LIVE-...`。

## 进度

- 2026-05-05 04:25：plan created（用户已批准接管 BUG-060/061/062 + TODO-012）。
- 2026-05-05 04:50：实施完成。
  - `packages/shared/src/brain/scan-body.ts` 增加 4 条新规则（slack-token / stripe-live / gcp-api-key / pem-private-key），AWS access-key 扩展支持 `ASIA` 临时凭据；新增 5 条单元测试 + 1 条 redact 标记测试。
  - `packages/shared/src/brain/admission.ts` `redactSecretLikeValues` 改为对所有 string-valued field 走 `redactBodySecrets` 内容扫描；`redactBrainAdmissionProposal` 同时扫 summary / rollback / target；新增 2 条 BUG-061 单元测试。
  - `apps/cli/src/commands/worker/brain.ts` 新增 `resolveAdmissionRedactPolicy` 双闸（`--show-sensitive` + `AIWORKER_ADMIN_REVEAL=1` env）；list / show 接入；新增 2 条 CLI 测试覆盖 gate 行为 + 1 条 body content 扫描测试。
  - `apps/api/src/worker/brain/routes.ts` 新增 `resolveAdmissionRedact` 与 CLI 等价的双闸；`/api/worker/brain/admission` 与 `/api/worker/brain/admission/:id` 都接入；新增 3 条 REST 测试。
  - `packages/core/src/worker/brain/brief/compiler.ts` 重构 `memory` section：保留 MEMORY.md 索引，按 task 关键词与 memory 文件 basename / index 标题做 lowercase overlap 检索，命中文件的 body 按 `MEMORY_BODY_LIMIT_PER_FILE=800` 截断后注入；新增 `parseMemoryIndexRows` / `scoreMemoryMatches` / `tokenize`（含中英文 stopword）helpers；artifact-summary 增加 falsy ref 防御性过滤；新增 3 条单元测试覆盖 BUG-060/062。
- 2026-05-05 04:50：验证通过：shared 140 / core 582 / cli 166 / api 85 全 pass；workspace typecheck 9/9 全绿；root lint 0 violation。BUG-060/061/062 + TODO-012 全部 completed。
