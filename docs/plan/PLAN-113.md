# PLAN-113 发布 aiworker CLI 0.8.0

- **status**: completed
- **createdAt**: 2026-05-05 06:30
- **approvedAt**: 2026-05-05 06:30
- **completedAt**: 2026-05-05 06:50
- **relatedTask**: REL-015

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.7.0`。
2. GitHub Release latest 是 `v0.7.0`。
3. 本地与远端最新 release tag 是 `v0.7.0`。
4. 自 `v0.7.0` 至 `HEAD (69491c1)` 共 5 个 release-relevant commit（外加 1 个 hooks/skills tooling commit `0b290ca` 已合并入主线）：
   - `9f47ff4` docs(pma)：record QA-005 0.7.0 调试发现并立项 PLAN-110..112。
   - `7911e43` fix(brain)：PLAN-109 收口 brain brief / admission read-path（BUG-060 / BUG-061 / BUG-062 / TODO-012）。
   - `09c0a98` fix(orchestrator)：PLAN-110 收口 decision pipeline 强化（BUG-063 / BUG-064 / TODO-013）。
   - `4bb9c1f` fix(worker)：PLAN-111 收口 worker API surface（BUG-065 / TODO-014 / TODO-016）。
   - `69491c1` fix(cli)：PLAN-112 收口 doctor 首次运行 UX 噪声（TODO-015）。
5. 上轮 PLAN-109..112 closeout 已记 `typecheck` / `lint` / 全量 `test` 全绿，但未跑 `bun run build`。
6. 本次按 semver 0.x 走 `0.8.0` minor：
   - BUG-061：admission read-path redact 默认行为变化 — 之前 `redacted: true` 但 payload.body 内嵌 secret 仍返回明文，现在内容化扫描 + `--show-sensitive` × `AIWORKER_ADMIN_REVEAL=1` 双闸。
   - BUG-063：每个 Soul preset 在 SOUL.md 里多一段 "模糊或缺失上下文" 引导（SoulRiskPolicy schema 新增 `vagueContextStrategy` 字段；9 个内置 Soul 全部填充）+ 新增 dead-loop detector + worker config `orchestrator.deadLoop` 字段。
   - BUG-064：intent classifier heuristic risk 词典扩展（force-push / drop table / 落账 直接 / 立即上线 等都标 high）。
   - TODO-013：worker config 新增 `orchestrator.qualityGate.budgetMs`，LLM evaluator 超 budget fall-back heuristic。
   - TODO-014：safe-env 显式允许 `AIWORKER_DEBUG_*` / `DEBUG_*` prefix 透传到 engine subprocess（之前被 `BLOCK_PREFIXES` 拦下）。
   - TODO-016：CLI 新增 `--pid-file` flag；serve 端口冲突时 fail-fast；`/health` 新增 `workerHome` / `runtimeVersion` 自描述字段。
   - BUG-065：worker `/openapi.json` paths 从空变到 12+ 条 typed 注册。
   - TODO-015：doctor / executor doctor 顶部 summary line + fresh-init 噪声抑制 + `brain-skills.empty` / `executor-overlay.{capabilities,mcp}.empty` 命名消歧（旧 `skills.empty` / `executor.capability_manifest_empty` / `executor.mcp_empty` 代码废弃）。

## 方案

1. Bump `apps/cli/package.json` 到 `0.8.0`。
2. 同步 `REL-015` / `PLAN-113` / changelog 发版记录。
3. 跑本地 release gates：
   - root typecheck；
   - root lint；
   - workspace tests；
   - root build；
   - `apps/cli/dist/package.json` 版本字段断言；
   - `git diff --check`。
4. 用 conventional commit 提交 release bump：`chore(release): 发布 CLI 0.8.0`。
5. 打 `v0.8.0` annotated tag。
6. push `main` 与 tag，监控 GitHub Actions release workflow，然后验证 npm 与 GitHub Release。

## 风险

1. GitHub repository 的 `NPM_TOKEN` 缺失或过期会导致 release workflow 在 publish 阶段失败（与 REL-014 同样风险面）。
2. BUG-061 default-redact 默认行为变化：曾经依赖 `?showSensitive=true` 直接拿明文的 admin UI / fleet relay 升级后会拿到 `[REDACTED:<rule>]` + `showSensitiveDenied: missing-env-gate`；需要在 worker host 配 `AIWORKER_ADMIN_REVEAL=1` env 才能恢复。CLI `--show-sensitive` 同样收紧。
3. BUG-063 dead-loop detector 默认 enabled / threshold=8：连续 ≥ 8 个 tool_call 无 text delta 触发 abort。极少数合法 tool 链工作流可能命中误报，需通过 worker config `orchestrator.deadLoop.enabled=false` 关闭。
4. TODO-014 把 `AIWORKER_DEBUG_*` / `DEBUG_*` 加入 explicit-allow，可能让操作员误以为 `AIWORKER_*` 全开放；测试覆盖 `AIWORKER_MASTER_KEY` / `AIWORKER_JOIN_TOKEN` 仍 block 用以守门。
5. TODO-016 serve preflight 在端口冲突时立即 exit 1；之前依赖 `setsid + > log 2>&1 &` 的部署脚本拿到 0 退出码即认定成功，升级后需要重新校准 wrapper 的退出码处理。

## 范围

- `apps/cli/package.json`
- `docs/task/REL-015.md`
- `docs/task/index.md`
- `docs/plan/PLAN-113.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不修改 release workflow（`.github/workflows/release.yml`）。
- 不 bump 其它 workspace package version（仅 cli 发 npm）。
- 不重建 fleet.db / worker.db。
- 不改 Caddy 或外部入口配置。
- 不做 published-package post-release smoke（留 release 后单独跟进）。

## 验证

- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `apps/cli/dist/package.json` 版本字段 = `0.8.0`
- `git diff --check`
- GitHub Actions release workflow 全绿
- `npm view @zonease/aiworker-cli version` → `0.8.0`
- `gh release view v0.8.0` → 4 个平台 binary uploaded

## 进度

- 2026-05-05 06:30：PLAN-113 / REL-015 创建，进入 implementing。
- 2026-05-05 06:50：实施完成。
  - Release gates 全通过：typecheck 9/9、lint 0 violation、test 1195
    pass（fs-layout 20 / shared 140 / gateway-proto 19 / storage 19 /
    gateway 148 / core 592 / api 86 / cli 171）、build OK（fleet
    639 kB / worker 664 kB / cli aiworker-bun.js 1.1 MB）、
    `apps/cli/dist/package.json` 版本字段 = `0.8.0`、`git diff
    --check` 干净。
  - Release commit `2230deb chore(release): 发布 CLI 0.8.0` +
    annotated tag `v0.8.0` 已 push 到 origin。
  - GitHub Actions release workflow run id `25377089930`（job
    `74415001398`）2m5s 全绿。
  - npm `@zonease/aiworker-cli` `latest=0.8.0` 已上线。
  - GitHub Release `v0.8.0` 非 draft / 非 prerelease；4 个平台
    binary 全部 uploaded（darwin-arm64 23.95 MB / darwin-x64 26.37
    MB / linux-arm64 39.65 MB / linux-x64 39.98 MB）。
