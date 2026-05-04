# PLAN-098 Scope manifest and business-scope bootstrap

- **status**: draft
- **createdAt**: 2026-05-04 13:52
- **approvedAt**: (pending)
- **relatedTask**: FEAT-054

## 现状

`<project>/.aiworker/` 已经是 project-scope filesystem layout，但尚无显式
scope manifest。当前 scope 语义主要来自目录位置、Soul preset 和文档约定；
这不足以表达 HR 的岗位 / 简历库、finance 的账期 / 报表目录、support 的工单队列等
非 developer 场景。

## 方案

新增 `.aiworker/scope.yaml`（或等价 schema 文件）作为 worker-bound business
scope 的显式声明：

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

1. `Project` 历史命名与 `scope.yaml` 新语义并存，文案要明确 layout 名称和产品语义的区别。
2. 过多必填字段会让 init 变重；第一版只要求 scope kind + primary Soul。
3. manifest 可能包含敏感业务描述；默认模板应避免写入隐私内容。

## 验证

- focused schema tests。
- `bun test apps/cli/src/commands/worker/init.integration.test.ts`
- `bun test apps/cli/src/commands/worker/doctor.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
