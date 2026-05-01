# PLAN-054 稳定 CLI test gate 并拆分 Soul preset 模块

- **status**: completed
- **createdAt**: 2026-05-01 12:58
- **approvedAt**: 2026-05-01 12:58
- **completedAt**: 2026-05-01 13:08
- **relatedTask**: REFACTOR-013

## 现状

1. FEAT-043 已新增 `aiworker soul list/show` 和共享 Soul registry。
2. `bun run --filter '@zonease/aiworker-cli' test` 当前暴露两个非功能红点：
   - npm bin shim 测试在 macOS 上收到 `/private/var/...`，但期望是 `tmpdir()` 返回的 `/var/...`。
   - `common.test.ts` 单跑通过，整包运行时因其它测试全局 mock `./common` 导致 `withSession` 被污染。
3. `apps/cli/src/soul/presets.ts` 当前仍聚合维护 9 个 Soul preset。短期可用，但后续 PLAN-041 S3/S5 会增加能力、policy、adapter、版本与 validation 字段，继续聚合会放大 review 冲突。

## 方案

1. **修 shim path 测试**
   - 在 `aiworker-bin-shim.test.ts` 中用真实路径规范化 expected bundle path，兼容 macOS `/var` 与 `/private/var`。

2. **修测试 mock 泄漏**
   - 给 `pair` / `enroll` command runner 增加测试专用依赖注入口，让测试不再使用全局 `mock.module('./common')`。
   - `common.test.ts` 通过显式 `createClient` 注入验证 URL normalization，避免整包测试受其它文件 mock 污染。

3. **拆 Soul preset 文件**
   - 新增 `apps/cli/src/soul/presets/{developer,project-manager,...}.ts`。
   - `apps/cli/src/soul/presets.ts` 保留类型、`CUSTOMIZE_SOUL_ID`、统一 `BUILTIN_SOUL_PRESETS` 和查询函数，只 import 每个 preset。
   - 保持现有 import path 不变，降低影响面。

4. **验证**
   - 先跑两个失败测试文件。
   - 再跑 `bun run --filter '@zonease/aiworker-cli' test`。
   - 跑 CLI typecheck、lint 和 `git diff --check`。

## 风险

1. 测试专用依赖注入口可能被生产调用误用；保持为可选参数，默认路径仍使用真实 session/client/state。
2. 拆分文件可能触发 import 排序或循环类型问题；使用 type-only import 或 `satisfies` 避免运行时循环。
3. 保持 `apps/cli/src/soul/presets.ts` 为统一入口，避免消费点跟着大量改动。

## 工作量

预计改动 15 个左右文件：2 个测试修复、9 个 Soul preset 文件、registry、测试/文档/跟踪收尾。

## 备选方案

1. **只修测试，不拆 Soul**：可以恢复 gate，但会把维护成本留给 PLAN-041 S3。不推荐。
2. **改成 JSON/YAML 数据文件**：更接近未来模板 registry，但当前 TypeScript 模块能保留类型安全和 bundle 简单性，先不做数据格式迁移。

## 批注

- 2026-05-01 12:58：用户批准做 release gate 修复与 Soul preset 拆分。
- 2026-05-01 13:08：实现完成。npm bin shim 测试改用真实路径规范化；aim command 测试改为依赖注入，不再泄漏 full-module mock；Soul preset 已拆成每个 Soul 一个文件并保留统一 registry。
- 验证通过：
  - `bun test --timeout=30000 apps/cli/scripts/aiworker-bin-shim.test.ts apps/cli/src/aim/commands/common.test.ts apps/cli/src/aim/commands/pair.test.ts apps/cli/src/aim/commands/enroll.test.ts`
  - `bun test --timeout=30000 apps/cli/src/soul/presets.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/init.integration.test.ts`
  - `bun run --filter '@zonease/aiworker-cli' typecheck`
  - `bun run --filter '@zonease/aiworker-cli' test`
  - `bun run lint`
  - `git diff --check`
