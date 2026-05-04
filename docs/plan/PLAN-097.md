# PLAN-097 Soul module contract and registry ownership

- **status**: completed
- **createdAt**: 2026-05-04 13:52
- **approvedAt**: 2026-05-04 14:05
- **completedAt**: 2026-05-04 14:25
- **relatedTask**: FEAT-054

## 现状

内置 Soul 已经拆到 `apps/cli/src/soul/presets/*.ts`，但它们仍然只是 CLI init
preset：字段集中在职责、边界、沟通风格、packs 和 toolsets，主要服务模板生成与
`soul list/show`。随着 Project Brain 语义扩展到 worker-bound business scope，
Soul 需要成为跨 CLI / core / API / web 可消费的领域模块，而不是 CLI app 私有数据。

## 方案

定义 `SoulModuleDefinition` 契约，并把内置 Soul 迁到更中立的模块归属：

1. 新增 Soul module contract：`manifest`、`supportedScopeKinds`、`artifactTypes`、
   `proposalTypes`、`riskPolicy`、`retentionDefaults`、`briefCompilerHooks`。
2. 建立 Soul registry：只负责发现、加载、版本、兼容性检查，不揉入具体领域逻辑。
3. 现有 CLI `SoulPresetDefinition` 作为 init projection / compatibility layer，
   从 Soul module 派生，不再作为长期 source of truth。
4. 每个内置 Soul 独立维护自己的模块文件，避免中央大表继续膨胀。

## 范围

- Soul module 类型定义。
- 内置 Soul registry 归属调整。
- CLI init / soul list/show 继续通过 registry 读取。
- focused tests 覆盖所有内置 Soul 仍可初始化和展示。

## 非范围

- 不实现 artifact registry。
- 不实现 admission DB。
- 不实现 Worker Admin UI。
- 不改变 executor capability 语义。

## 风险

1. 过早把 contract 做得太重会损害轻量定位；第一版只保留后续 plan 必需字段。
2. CLI preset 迁移容易造成 init 输出漂移；需要保持现有用户可见字段稳定。
3. developer Soul 容易主导 contract；验收样本必须至少同时覆盖 developer 与 HR。

## 验证

- `bun test apps/cli/src/soul/presets.test.ts`
- `bun test apps/cli/src/commands/worker/init.integration.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`

## 进度

- 2026-05-04 14:05：用户批准 epic 执行。开始落地 SoulModule contract / registry 与 9 个内置 Soul 在 shared 中的迁移。
- 2026-05-04 14:25：实现完成。
  - shared 新增 `packages/shared/src/soul/{module,registry,index}.ts` + `modules/<id>.ts × 9` + `modules/index.ts`，并在 `packages/shared/src/index.ts` 暴露。
  - CLI projection 改为消费 shared registry；`apps/cli/src/soul/presets/*.ts` 旧文件删除。
  - 新增 shared `module.test.ts` / `registry.test.ts`，扩展 CLI `presets.test.ts`。
  - schemaPack / retentionDefaults 留空占位，PLAN-099 / PLAN-100 接续填充；briefHooks 已为每个 Soul 声明合理 default + protected sections，PLAN-102 直接消费。
  - 验证：`bun run --filter '@zonease/aiworker-shared' test` 48 pass、`bun run --filter '@zonease/aiworker-cli' test` 126 pass、`bun run typecheck` 全 workspace 通过、`bun run lint` 通过。
