# PLAN-098 Scope manifest and business-scope bootstrap

- **status**: completed
- **createdAt**: 2026-05-04 13:52
- **approvedAt**: 2026-05-04 14:30
- **completedAt**: 2026-05-04 14:55
- **relatedTask**: FEAT-054

## 现状

`<project>/.aiworker/` 已经是 project-scope filesystem layout，但尚无显式
scope manifest。当前 scope 语义主要来自目录位置、Soul preset 和文档约定；
这不足以表达 HR 的岗位 / 简历库、finance 的账期 / 报表目录、support 的工单队列等
非 developer 场景。

## 方案

新增 `.aiworker/scope.json` 作为 worker-bound business scope 的显式声明
（沿用 `policy.json` / `toolsets.json` 同款 JSON 形态，零新依赖）：

1. 字段包括 `id`、`kind`、`primarySoul`、`subject`、`artifactRoots`、
   `privacy`、`retention`、`approval`、`labels`。
2. `aiworker init --soul <id>` 根据 Soul module 生成最小 scope skeleton。
3. `aiworker brain status` / `aiworker doctor` 展示 scope kind、primary Soul、
   privacy、retention 和 artifact roots。
4. user scope / explicit worker home 也能展示 “no scope manifest” 的可解释状态，
   但不强制 project scope。

## 范围

- scope manifest schema 与 parser。
- init bootstrap skeleton。
- brain status / doctor 只读展示。
- docs/cli 与 architecture 更新。

## 非范围

- 不扫描 artifact 内容。
- 不建立 artifact registry DB。
- 不做迁移层；1.0 前可以破坏性收敛。

## 风险

1. `Project` 历史命名与 `scope.json` 新语义并存，文案要明确 layout 名称和产品语义的区别。
2. 过多必填字段会让 init 变重；第一版只要求 scope kind + primary Soul。
3. manifest 可能包含敏感业务描述；默认模板应避免写入隐私内容。

## 验证

- focused schema tests。
- `bun test apps/cli/src/commands/worker/init.integration.test.ts`
- `bun test apps/cli/src/commands/worker/doctor.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`

## 进度

- 2026-05-04 14:30：用户批准 scope.json（与 policy.json 同款 JSON，零新依赖）。
- 2026-05-04 14:55：实现完成。
  - `packages/shared/src/scope/manifest.ts`：`ScopeManifest` zod schema（`schemaVersion=1`、必填 `kind` + `primarySoul`、可选 `id` / `subject` / `artifactRoots` / `privacy` / `retention` / `approval` / `labels`），加 `parseScopeManifestJson` / `parseOptionalScopeManifestJson` / `buildScopeManifest` 工具，并在 `packages/shared/src/index.ts` 暴露。
  - `packages/fs-layout/src/index.ts`：新增 `resolveScopeManifestPath` / `projectScopeManifestPath`；`ProjectAiworkerSeed` 增加可选 `scopeJson`；`ensureProjectAiworker` 仅在 seed 提供时写入 `scope.json`，保留 idempotent 行为（不覆盖已有内容）。fs-layout 保持零运行时依赖。
  - `apps/cli/src/commands/worker/init.ts`：从 `BUILTIN_SOUL_REGISTRY` 取 Soul 的 `primaryScopeKind`，用 `buildScopeManifest` 生成最小 skeleton（`kind` = Soul.primaryScopeKind、`primarySoul` = Soul.id、`privacy=private`、`approval=manual-approval`），写入 `scope.json`；同步 `PROJECT_TEMPLATE_PATHS` 让 dry-run preflight 也提示 `.aiworker/scope.json`。
  - `apps/cli/src/commands/worker/doctor.ts`：新增 `Scope manifest:` 段，五状态 `ok` / `missing` / `malformed` / `unknown-soul` / `kind-mismatch`，分别返回 0 / 0 / 1 / 1 / 1；`ok` 时显示 kind / primary soul / privacy / retention / approval / artifactRoots。
  - `apps/cli/src/commands/worker/brain.ts`：`runBrainStatus` JSON 输出新增 `scope` 字段（status + manifest 摘要），不复制原始 file。
  - 测试新增/扩展：shared `manifest.test.ts` 覆盖 schema 必填、错误状态、HR + developer 双样本与 `buildScopeManifest`；fs-layout 新增两个 case 验证 `scopeJson` 缺省与提供时的 idempotent 写入；CLI doctor 新增四个 case（missing/unknown-soul/kind-mismatch/malformed）；CLI init.integration 新增 `scope.json` 内容断言（默认 + Soul matrix）+ brain status 输出 `scope.manifest` 字段断言。
  - 验证：`bun run --filter '@zonease/aiworker-shared' test` 62 pass；`bun run --filter '@zonease/aiworker-fs-layout' test` 20 pass；`bun run --filter '@zonease/aiworker-cli' test` 130 pass；`bun run typecheck` 全 workspace 通过；`bun run lint` 通过。
