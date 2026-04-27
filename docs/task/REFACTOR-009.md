# REFACTOR-009 Phase 4 — apps/web 独立性强化与回归保护

- **status**: pending
- **priority**: P2
- **owner**: (未分配)
- **createdAt**: 2026-04-27 18:35

## 描述

PLAN-022 Phase 4 落地。FEAT-034 + FEAT-035 完成后，强化 fleet/worker 物理独立性，落 CI 守门，清理旧 dormant 代码。

### 验收标准

1. ESLint `no-restricted-imports` rule（FEAT-033 起的雏形）扩展为完整 enforce：
   - `src/fleet/**` 禁 `import` 任何 `src/worker/**` 路径
   - `src/worker/**` 禁 `import` 任何 `src/fleet/**` 路径
   - `src/shared/**` 禁 `import` 任一边的 `features/` / `routes/` / `lib/api*`
   - `lib/gateway-client*` 仅可被 `src/fleet/**` 与 `src/shared/**` 引；`lib/worker-rest*` 仅可被 `src/worker/**` 与 `src/shared/**` 引
2. CI（`.github/workflows/ci.yml` 或现有 quality gate）加：
   - `bun run --filter '@zonease/aiworker-web' lint` 必须 pass
   - `bun run --filter '@zonease/aiworker-web' build` 双 bundle 必须成功
   - `bun run --filter '@zonease/aiworker-web' test` 必须 pass
3. Vitest 给 fleet/worker 各跑 smoke test（`apps/web/src/{fleet,worker}/__tests__/`）：
   - fleet bundle render `/admin/`（mock gateway client）应见 workers 列表 placeholder
   - worker bundle render `/admin/`（mock worker REST client）应见 worker shell
   - 故意写一个 `import` 跨边界的 `.test.ts`，CI lint 必须报错
4. 旧 `apps/web/src/{routes,features,lib,stores}` 全部删除（搬迁完成后）。用 `git mv` 保历史，commit message 显式标 `refactor(web): 拆分 fleet/worker 视角，文件搬迁见 PLAN-022 Phase 4`。
5. `docs/architecture.md` 补「双视角 web UI」章节，画 fleet/worker 数据通道与托管图。
6. `apps/web/dist/{fleet,worker}/` 体积监控：在 CI 输出 baseline 与本次 PR 增量（gzip 前/后），>20% 增量需 PR description 解释。
7. `apps/web/src/shared/` 内组件循环依赖扫描（如 `madge` 或 `eslint-plugin-import/no-cycle`），CI pass。

### 不做（留给后续 Phase）

- 任何新功能；本 phase 仅做架构守护与清理。
- gateway proto 的 `secrets.*` / `test.*` 等扩展（Phase 5）。

## 进行时描述

强化 apps/web 双视角独立性，CI 守门，清理 dormant 代码

## 依赖

- **blocked by**: FEAT-034, FEAT-035
- **blocks**: REFACTOR-010

## 笔记

- 旧文件清理是 destructive 动作，必须确认 FEAT-034/035 都已 merge 到 main 且没有遗留 import 引用旧路径。
- ESLint rule 用 `no-restricted-imports` 的 `patterns` 字段，比写 `paths` 更灵活：
  ```js
  {
    files: ['src/fleet/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['**/worker/**', '**/lib/worker-rest*'], message: 'fleet UI 禁止 import worker 视角' }
      ] }]
    }
  }
  ```
- CI 双 bundle 体积报告可借现成的 `vite-bundle-visualizer` 或自己写 `du -sh dist/{fleet,worker}/` 并存到 GH Actions summary。
- `madge --circular` 扫 src/shared，如出现循环依赖直接 fail。
