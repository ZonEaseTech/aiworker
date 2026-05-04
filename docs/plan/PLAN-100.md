# PLAN-100 Soul-specific schema packs and validation samples

- **status**: completed
- **createdAt**: 2026-05-04 13:52
- **approvedAt**: 2026-05-04 15:45
- **completedAt**: 2026-05-04 16:00
- **relatedTask**: FEAT-054

## 现状

Soul 已有职责和边界描述，但缺少可执行的领域 schema。没有 schema pack 时，
Brain Kernel 无法知道 HR 的 candidate / resume / screening decision 与
developer 的 module / test rule / architecture decision 是不同业务对象，也无法
用多 Soul 样本验证架构没有重新偏回 software project。

## 方案

为内置 Soul 建立最小 schema pack：

1. 每个 Soul module 声明自己的 `artifactTypes`、`entityTypes`、`proposalTypes`、
   `workflowStates` 和 `defaultRetention`。
2. 第一阶段至少完整覆盖 developer 与 hr-recruiting，finance/support 提供轻量
   skeleton。
3. Schema pack 只定义领域对象和校验，不直接实现业务自动化。
4. validation samples 放在测试 fixture 中，覆盖 developer repo 与 HR resume pool。

## 范围

- Soul-specific schema pack 类型。
- developer / HR 最小 schema。
- finance / support skeleton。
- static validation tests。
- docs examples。

## 非范围

- 不实现实际简历筛选模型。
- 不实现财务对账或工单流转自动化。
- 不做 UI 表单生成。

## 风险

1. 中央 schema 文件会重新把 Soul 揉在一起；每个 Soul 的 schema pack 必须独立维护。
2. HR / finance 示例涉及敏感数据想象；fixtures 只能用 synthetic sample。
3. Schema 太具体会阻碍用户自定义 Soul；第一版保留 extension metadata。

## 验证

- Soul registry tests 覆盖 schema pack loading。
- synthetic developer / HR validation fixtures。
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`

## 进度

- 2026-05-04 15:45：用户批准方案。
- 2026-05-04 16:00：实现完成。
  - 9 个内置 Soul 在 `packages/shared/src/soul/modules/<id>.ts` 中填充 `schemaPack`：developer / hr-recruiting 完整覆盖（≥5 个 artifactTypes、完整 workflow lifecycle）；project-manager / devops-sre / product-designer / qa-reviewer / support-operator / finance-ops / general-assistant skeleton（每个 1+ artifactTypes、4-5 个 workflowStates）。所有 Soul 都把 `memory-add` 列入 `proposalTypes`（admission MVP baseline）。
  - `SoulRegistry` 加 `findByArtifactType(type)` / `findByProposalType(type)` / `getSchemaPack(soulId)` 三个反查 helper，PLAN-101 / PLAN-102 直接消费。
  - CLI `aiworker soul show` 在已有 Capability packs / Toolsets 之后追加 `Schema pack` 段：primary scope kind、supported scopes、artifact types、entity types、proposal types、workflow states；entity types 为空时输出 `<none>`。
  - 测试：`registry.test.ts` 加 5 个 case 覆盖 findByArtifactType / findByProposalType / getSchemaPack；新建 `schema-packs.test.ts` 12 个 case 覆盖 developer + HR fixture validation、跨 Soul artifact type 共享（design-doc 同时归 developer + product-designer）、kebab-case 不变量、memory-add baseline；CLI 新建 `soul.test.ts` 4 个 case 验证 schema pack 输出。
  - 边界遵守：fixtures 全部 synthetic（无 PII）；HR / finance 不引入业务自动化；Brain Kernel 仍只验 shape 不强制 artifact type 唯一归属。
  - 验证：`bun run --filter '@zonease/aiworker-shared' test` 91 pass、`bun run --filter '@zonease/aiworker-cli' test` 141 pass、`bun run typecheck` 全 workspace 通过、`bun run lint` 通过。
