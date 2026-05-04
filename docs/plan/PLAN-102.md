# PLAN-102 Brain brief compiler and projection boundary

- **status**: completed
- **createdAt**: 2026-05-04 13:52
- **approvedAt**: 2026-05-04 17:00
- **completedAt**: 2026-05-04 17:35
- **relatedTask**: FEAT-054

## 现状

`ContextManager` 当前把 `AGENT.md`、`SOUL.md`、`USER.md`、`MEMORY.md`、
`ROLLUP.md` 和前 N 个 brain skill 直接拼进 system prompt。这能启动 Project Brain，
但无法根据 task、scope、Soul、artifact、risk 和 token budget 编译最小相关上下文。

## 方案

实现 task-specific Brain brief compiler：

1. 新增 `BrainBriefRequest` / `BrainBrief` 类型，输入 task、scope、Soul、
   artifact refs、risk、executor、token budget。
2. 编译器从 scope manifest、Soul module、artifact registry、memories、policies、
   admission/audit 摘要中选择相关内容。
3. CLI 提供 `aiworker brain brief --task ...` 预览，不默认启动 executor。
4. Orchestrator 后续可用 brief 替代粗粒度 persona 拼接，但第一阶段保持可选开关。
5. Projection boundary：AGENTS.md / CLAUDE.md / Copilot instructions / executor hints
   都是 projection，不是 canonical source of truth。

## 范围

- shared brief types。
- core compiler service。
- CLI preview。
- developer + HR fixture tests。
- docs examples。

## 非范围

- 不默认改写 executor-specific 文件。
- 不改变 executor adapter contract。
- 不做 semantic vector retrieval。

## 风险

1. Brief compiler 如果默认替换 system prompt，可能造成行为漂移；第一版先 preview / opt-in。
2. token budget 截断可能丢掉高风险 policy；policy 和 risk sections 要有保底优先级。
3. Projection 容易被误解为 source of truth；CLI 文案必须明确 canonical brain 在 AIWorker scope。

## 验证

- compiler unit tests。
- CLI preview snapshot tests。
- developer / HR fixture coverage。
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' test`

## 进度

- 2026-05-04 17:00：用户批准方案（preview-only、token budget 默认 4000、protected sections 强制保留、artifact summary 作为可选额外段）。
- 2026-05-04 17:35：实现完成。
  - shared `packages/shared/src/brain/brief.ts`：`BrainBriefRequest` / `BrainBrief` zod schema + 7 个 source 枚举（agent-doc / soul-doc / memory-doc / rollup-doc / risk-policy / admission-summary / artifact-summary / scope-manifest / soul-skeleton）+ `estimateBrainBriefTokens` 启发式 (~4 char/token，1 char min) + `DEFAULT_BRAIN_BRIEF_TOKEN_BUDGET=4000`。
  - core `packages/core/src/worker/brain/brief/compiler.ts`：`BrainBriefCompiler` + `createBrainBriefCompiler(deps)`。依赖注入 `brainHome` / `soulRegistry` / `scopeManifestReader?` / `artifactRegistry?` / `admissionService?` / `estimateTokens?` / `now?`。流程：scope manifest → 推 soulId（请求 → manifest.primarySoul → general-assistant fallback）→ 用 Soul.briefHooks.defaultSections 构建段（AGENT/SOUL/MEMORY/ROLLUP 文件 + risk-policy 合成 + 7 类 Soul-specific skeleton）→ 可选 artifact-summary（解析 artifactRefs → artifactRegistry.get） → token budget 截断（protected 优先；超预算时 protected 强制保留并 warning，非 protected 丢入 droppedSections）→ 还原原始段顺序。
  - CLI `aiworker brain brief`（root + worker namespace）：`--task` 必填；`--scope` / `--soul` / `--artifact <id>` (重复) / `--executor` / `--token-budget` 可选；输出 JSON 包含 brief + projection note。`brainHome` 来自 `resolveBrainHome(workerId)`；scopeManifestReader 通过 `projectScopeManifestPath` + `parseScopeManifestJson` 加载；artifactRegistry 默认接 `BrainArtifactRegistry`。`apps/cli/src/aiworker.test.ts` + `help.ts` 同步注册元数据。
  - 测试：shared 11 个 case 覆盖 schema / 默认值 / token estimator 边界；core compiler 8 个 case 覆盖 developer 文件加载 + risk-policy 合成、scope manifest fallback 推 soulId、token budget 截断保留 protected、artifact-summary 解析（命中 + missing）、artifactRefs 但无 registry 警告、缺失 canonical 文件、未知 soulId 抛错、executor 字段透传；CLI brief 6 个 case 覆盖 --task 必填、developer 文件加载、artifact 注入、token 预算、--executor 透传、未知 soulId 错误。
  - 边界：preview-only；orchestrator 没改；不写 executor-specific 文件；不改 executor adapter contract；不做 vector retrieval；CLI 输出包含 projection-note 提醒 canonical brain 在 `<brainHome>`。
  - 验证：`bun run --filter '@zonease/aiworker-shared' test` 120 pass、`bun run --filter '@zonease/aiworker-core' test` 554 pass、`bun run --filter '@zonease/aiworker-cli' test` 159 pass、`bun run typecheck` 全 workspace 通过、`bun run lint` 通过。
