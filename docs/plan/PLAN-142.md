# PLAN-142 Docker image gateway path correction

- **status**: completed
- **createdAt**: 2026-05-06 14:54
- **approvedAt**: 2026-05-06 14:54
- **completedAt**: 2026-05-06 14:59
- **relatedTask**: BUG-084

## 现状

1. Gateway 当前代码包位于 `packages/gateway`，不是 `apps/gateway`。
2. `Dockerfile` 仍复制 `apps/gateway/package.json` 和 `/app/apps/gateway`。
3. `ops/compose/docker-compose.yml` 仍以 `bun apps/gateway/src/index.ts`
   启动 gateway。
4. main push 的 `build-image` workflow 因缺失 `apps/gateway/package.json`
   失败。

## 方案

1. 将 Dockerfile 的 gateway manifest copy 改为 `packages/gateway/package.json`。
2. 将 runtime 阶段复制的 gateway source 改为 `/app/packages/gateway`。
3. 将 compose command 改为 `bun packages/gateway/src/index.ts`。
4. 同步当前部署/架构文档中的 gateway package 路径，避免继续误导。
5. 跑 Docker runtime target build 和 whitespace check。

## 风险

1. Docker build 可能因为网络或镜像层缓存环境失败；若失败需区分路径修复失败还是外部依赖失败。
2. 只修当前可执行/部署路径，不清理历史记录里的旧路径引用。

## 范围

- `Dockerfile`
- `ops/compose/docker-compose.yml`
- 当前部署/架构文档
- PMA task/plan/changelog/index

## 非范围

- 不改变 release workflow。
- 不改变 gateway package API。
- 不修改历史 PMA/changelog 事实记录。

## 验证

同 BUG-084 Validation。

## 进度

- 2026-05-06 14:54：记录 BUG-084 / PLAN-142，开始修复 Docker image gateway path。
- 2026-05-06 14:59：修复已 push 为 `7c6f0ca`；GitHub Actions
  `build-image` run `25443020176` 全绿，slim/full image 均成功 build/push；
  `lint` run `25443020173` 全绿。
