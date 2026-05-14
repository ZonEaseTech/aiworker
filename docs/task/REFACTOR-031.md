# REFACTOR-031 Materialize worker packs during project init

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 17:24
- **claimedAt**: 2026-05-09 17:24
- **completedAt**: 2026-05-09 18:10
- **plan**: PLAN-197
- **relatesTo**: REFACTOR-026, REFACTOR-030, PLAN-192, apps/cli/src/commands/worker/init.ts, packages/fs-layout/src/index.ts, packages/shared/src/worker-pack.ts

## 背景

S3A 已经建立 OD-style worker pack registry 和 CLI `pack list/show`，但 `aiworker init`
仍只物化旧 Soul / Project Brain 资产。用户从一个新 scope 开始时，仍然看不到类似
Open Design `SKILL.md` / `DESIGN.md` 的业务工作台资产。

S3B 的目标是把 worker pack 变成 project init 的默认可见文件，而不是继续停留在
registry 输出里。

## 目标

1. `aiworker init --soul <id>` 在同名内置 worker pack 存在时默认物化该 pack。
2. 新增 `aiworker init --pack <id>`，允许显式选择 worker pack，并覆盖默认同名映射。
3. 物化路径保持在 `.aiworker/` 内：
   - `.aiworker/worker-packs/<pack>/SKILL.md`
   - `.aiworker/domain-systems/<pack>/DOMAIN.md`
4. `policy.json` 记录选中的 worker pack 及来源，便于后续 Web/workbench 读取。
5. preflight / next steps 展示 worker pack 资产与 `aiworker pack show` 入口。
6. 补充 fs-layout path guard 与 CLI init integration tests。

## 非目标

- 不删除或重命名 `Soul` preset。
- 不把 pack 投影到 `.agents/skills` / `.claude/skills`。
- 不让 pack parser 驱动领域硬 workflow engine。
- 不改 Worker Web picker；S5 再接入。
- 不引入 legacy alias 或迁移层。

## 验收标准

- `init --soul developer` 默认写入 developer worker pack files。
- `init --pack hr-recruiting --soul developer` 写入 hr-recruiting pack，并在 policy 中标记来源为 flag。
- unknown `--pack` 返回 exit 2，并列出可用 pack ids。
- fs-layout 拒绝逃逸 `.aiworker/` 的 pack seed path。
- focused tests、changed package typecheck、diff check 与 CRG 审查通过。

## 实现记录

- `ProjectAiworkerSeed` 新增 `workerPackFiles`，并由 fs-layout 受限写入
  `.aiworker/worker-packs/<pack>/SKILL.md` 与
  `.aiworker/domain-systems/<pack>/DOMAIN.md`。
- `aiworker init` / `aiworker worker init` 新增 `--pack <id>`。
- `init --soul <id>` 在同名内置 pack 存在时默认物化该 pack；显式 `--pack`
  覆盖默认映射。
- `policy.json` 在 brand-new init 时记录 `workerPack.id/label/source`。
- preflight 与 next steps 展示 worker pack、资产路径和 `aiworker pack show`。
- root help 增加 worker pack 初始化和查看入口。

## 验证

- `bun run --filter '@zonease/aiworker-fs-layout' test -- src/index.test.ts`
  passed: 26 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-cli' test -- src/commands/worker/init.integration.test.ts src/aiworker.test.ts`
  passed: 62 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-fs-layout' typecheck` passed。
- `bun run --filter '@zonease/aiworker-cli' typecheck` passed。
- `git diff --check` passed。
- CRG passed: `detect-changes` risk 0.40, 0 affected flows；static gaps 指向
  init helper / output functions，已由 init integration、help test 和 fs-layout
  path guard tests 覆盖。
