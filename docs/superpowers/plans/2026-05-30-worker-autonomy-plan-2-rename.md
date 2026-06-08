# Worker 自治倒置 · Plan 2：机械 rename + Host metadata→Worker metadata 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **执行隔离要求：本 plan 必须在隔离 git worktree 内执行（superpowers:using-git-worktrees），并在隔离树内跑完整 `bun run release:check` 验证后再合回 `codex/aiworker-refactor-dev-loop`。**

**Goal:** 把 host-plane 命名翻成 worker-plane：`host-runtime→worker-runtime`、`host-daemon→worker-daemon`、目录 `apps/cli→apps/worker-cli`、`apps/web→apps/worker-web`；并把领域术语 `Host metadata→Worker metadata`。让 Plan 1 已倒置的文档权威与真实代码/结构门对齐。

**Architecture:** Contract-first 5-plan 系列的第 2 阶段。纯机械 rename（无行为变更），由现有门验证：`typecheck`、`test:contracts`、`build`、`release:check`。Plan 1 已把 architecture.md 的 monorepo 目标树写成 worker-*（文档先行），本 plan 让代码追上。

**Tech Stack:** Bun（`bun test`、`bun install`、workspaces）、TypeScript、bun.lock、GitHub Actions workflows。

**门命令：** `bun run typecheck`、`bun run test:contracts`、`bun run build`、`bun run release:check`（仅在隔离 worktree 内跑）。

**依据：** spec `docs/superpowers/specs/2026-05-30-worker-autonomy-engine-launch-inversion-design.md` §6；Plan 1 `…-plan-1-authority-rewrite.md`（已落地 HEAD dcab7f17）；爆炸半径测绘（本会话）。

---

## 已定决策（执行者必须遵守，不要更改）

| 旧 | 新目录 | 新包名 | 备注 |
|---|---|---|---|
| `packages/host-runtime` | `packages/worker-runtime` | `@zonease/aiworker-worker-runtime` | 内部包，dir+name 都改 |
| `packages/host-daemon` | `packages/worker-daemon` | `@zonease/aiworker-worker-daemon` | 内部包，dir+name 都改 |
| `apps/cli` | `apps/worker-cli` | **`@zonease/aiworker-cli`（不变）** | **只移目录；发布名与 binary `aiworker` 不变** |
| `apps/web` | `apps/worker-web` | `@zonease/aiworker-worker-web` | 内部包，dir+name 都改 |

- **关键：`@zonease/aiworker-cli` 这个包名字符串一律不替换**——它是已发布 npm 名 + binary，保持不变。本 plan 对 cli 只改**路径** `apps/cli`→`apps/worker-cli`。
- `Host metadata` → `Worker metadata`（领域术语；Phase C）。

## 安全警告（rename 易错点，全部来自爆炸半径测绘）

1. **只替换原子串**：`@zonease/aiworker-host-runtime`、`@zonease/aiworker-host-daemon`、`@zonease/aiworker-web`、`packages/host-runtime`、`packages/host-daemon`、`apps/cli`、`apps/web`。**绝不**替换裸 token `host-runtime`/`host-daemon`（会误伤路径内子串与无关文字）。
2. **`bun.lock` 不手改**：rename 完 package.json 名后跑 `bun install` 让 bun 重生 lockfile。
3. **eslint/boundary/governance 必须同步**：`eslint.config.ts` no-import 名单、`scripts/check-soul-app-boundaries.ts`（forbidden 名 + walk roots `apps/cli`/`apps/web` + path 检查 `packages/host-*`）、`scripts/governance-kernel-harness.ts`（path `apps/cli/dist/...`）。漏改 boundary checker 会**静默回归**（walk 不到目录就不报错）。
4. **workflows**：`.github/workflows/lint.yml`（`--filter '@zonease/aiworker-web'` 等）与 `release.yml`（`apps/cli/src/aiworker.ts`、`apps/cli/scripts/*`、`working-directory: apps/cli/dist`）必须改。
5. **结构门巨量**：`tests/architecture/refactor-contract.test.ts`（~280 行硬编码路径）、`package-ownership.test.ts`（~19 处）、`scripts/check-doc-contract.ts`（testing.md 清单块 + build-script 门 L908 + webBuildScript L800）、`docs/testing.md`（"Host runtime/daemon tests" 清单块 + 路径）。这些随 rename 一起翻才会绿。
6. **Host metadata 耦合链（Phase C 原子改）**：`packages/storage-sqlite/src/worker/index.ts`（抛错串）→ `packages/host-daemon(→worker-daemon)/src/modes/worker/settings.ts` 与 `worker.ts`（`startsWith` 守卫）→ `apps/cli(→worker-cli)/src/aiworker.test.ts`（`toContain`）。任一漏改即红。

---

## Task 0：建隔离 worktree（前置，必须）

**Files:** 无（环境）

- [ ] **Step 1:** 用 superpowers:using-git-worktrees 在 HEAD `dcab7f17`（或当前分支 tip）创建隔离 worktree，分支名如 `worker-autonomy-plan2-rename`。后续所有 task 在该 worktree 内执行。
- [ ] **Step 2:** 在 worktree 内确认基线绿：`bun install && bun run typecheck && bun run test:contracts`，Expected: PASS（基线）。
- [ ] **Step 3:** 记录起始 SHA（合回与最终 review 用）。

---

## Task A1：rename packages host-runtime→worker-runtime, host-daemon→worker-daemon（含全部 import 站点 + 内部包名）

**Files（来自爆炸半径 A1/A2/A4/B）：** `packages/host-runtime/**`→`packages/worker-runtime/**`、`packages/host-daemon/**`→`packages/worker-daemon/**`；import 站点：`apps/cli/package.json`、`apps/cli/scripts/build-publish-manifest.ts`、`apps/cli/src/aiworker.ts`(+test, +soul-app-boundary.ts/.test.ts)、`packages/worker-daemon/**`(自身)、`packages/soul-app-runtime/{package.json,src/index.ts}`、`eslint.config.ts`、`scripts/check-soul-app-boundaries.ts`(+test)、`README.md`、`tests/architecture/package-ownership.test.ts`、`tests/architecture/refactor-contract.test.ts`、`scripts/check-doc-contract.ts`、`docs/testing.md`。

- [ ] **Step 1: git mv 目录**
```bash
git mv packages/host-runtime packages/worker-runtime
git mv packages/host-daemon packages/worker-daemon
```

- [ ] **Step 2: 改两个内部包名 + 自名字面量**
- `packages/worker-runtime/package.json` `name`: `@zonease/aiworker-host-runtime` → `@zonease/aiworker-worker-runtime`
- `packages/worker-runtime/src/index.ts` 自名字面量（L2 `name: '@zonease/aiworker-host-runtime'`）→ worker-runtime
- `packages/worker-daemon/package.json` `name`: `@zonease/aiworker-host-daemon` → `@zonease/aiworker-worker-daemon`

- [ ] **Step 3: 全局替换原子串（tracked 文件，排除 bun.lock 与 docs/superpowers/*）**
```bash
git ls-files -z -- ':!:bun.lock' ':!:docs/superpowers/*' \
  | xargs -0 perl -pi -e '
      s{\@zonease/aiworker-host-runtime}{\@zonease/aiworker-worker-runtime}g;
      s{\@zonease/aiworker-host-daemon}{\@zonease/aiworker-worker-daemon}g;
      s{packages/host-runtime}{packages/worker-runtime}g;
      s{packages/host-daemon}{packages/worker-daemon}g;
    '
```
> 排除 `docs/superpowers/*`（spec/plan 是过程产物历史叙述，且本 plan 文件正被执行者读取，不能被自我改写）。canonical docs（docs/*.md）仍在替换范围。
> 这一步会同时翻转 `package-ownership.test.ts`、`refactor-contract.test.ts`、`check-doc-contract.ts`、`docs/testing.md` 里所有 `packages/host-runtime|host-daemon` 路径与两个 `@zonease` 名（结构门随之对齐）。

- [ ] **Step 4: 处理 testing.md 的 "Host runtime/daemon tests" 标题（裸 token，需手改）**
- `docs/testing.md`：`Host runtime tests:` → `Worker runtime tests:`；`Host daemon tests:` → `Worker daemon tests:`（其下代码块路径已被 Step 3 翻成 packages/worker-runtime|worker-daemon）。
- `scripts/check-doc-contract.ts`：对应 gated 短语 `'Host runtime tests:'`→`'Worker runtime tests:'`、`'Host daemon tests:'`→`'Worker daemon tests:'`（L431/L437），其代码块字符串（L432/L438）已被 Step 3 翻路径。

- [ ] **Step 5: regen lockfile**
```bash
bun install
```

- [ ] **Step 6: 验证**
```bash
bun run typecheck && bun run test:contracts
```
Expected: PASS（typecheck 全包过；test:contracts 绿——package-ownership 的 targetPackages 现指向 worker-runtime/worker-daemon 且存在）。

- [ ] **Step 7: commit**
```bash
git add -A
git commit -m "refactor(rename): host-runtime→worker-runtime, host-daemon→worker-daemon"
```
> 本 plan 在**隔离 worktree** 内，无 peer 并发，故此处可用 `git add -A`（与共享树规则不冲突）。

---

## Task A2：rename apps cli→worker-cli（仅目录）, web→worker-web（目录+名）

**Files（来自爆炸半径 A3/A4/C/D）：** `apps/cli/**`→`apps/worker-cli/**`、`apps/web/**`→`apps/worker-web/**`；路径引用：root `package.json` scripts、`.github/workflows/{lint,release}.yml`、`scripts/dev-{local,apps,status,clean}.sh`、`scripts/web-quality.ts`、`scripts/check-web-ui-components.ts`、`scripts/check-soul-app-boundaries.ts`(walk roots)、`scripts/governance-kernel-harness.ts`、`scripts/check-doc-contract.ts`（apps/cli 读取 + webBuildScript）、`apps/worker-cli/scripts/*`、`README.md`、`tests/architecture/refactor-contract.test.ts`、`tests/architecture/package-ownership.test.ts`、`eslint.config.ts`(@zonease/aiworker-web 名)。

- [ ] **Step 1: git mv 目录**
```bash
git mv apps/cli apps/worker-cli
git mv apps/web apps/worker-web
```

- [ ] **Step 2: 改 web 包名（cli 名不变！）**
- `apps/worker-web/package.json` `name`: `@zonease/aiworker-web` → `@zonease/aiworker-worker-web`
- `apps/worker-cli/package.json` `name`: **不变**（保持 `@zonease/aiworker-cli`），bin `aiworker` **不变**。

- [ ] **Step 3: 全局替换（tracked，排除 bun.lock 与 docs/superpowers/*）——注意 cli 只替路径不替名**
```bash
git ls-files -z -- ':!:bun.lock' ':!:docs/superpowers/*' \
  | xargs -0 perl -pi -e '
      s{\@zonease/aiworker-web}{\@zonease/aiworker-worker-web}g;
      s{apps/cli}{apps/worker-cli}g;
      s{apps/web}{apps/worker-web}g;
    '
```
> 不替换 `@zonease/aiworker-cli`（保留）。`apps/cli`→`apps/worker-cli` 会同时翻转 refactor-contract.test.ts(~apps/cli 行)、package-ownership.test.ts(apps/cli read)、root scripts 无（root build 用 `--filter '@zonease/...'` 名，cli 名不变故 build 的 cli 段不动；但 root `dev:host`/`dev:web` 等若含 apps 路径会被翻）、workflows、dev 脚本、governance-harness、check-soul-app-boundaries walk roots、check-web-ui-components 的 apps/web/src/worker 路径、check-doc-contract apps/cli 读取。

- [ ] **Step 4: 修 root build/test 脚本的 worker-web/worker-daemon filter**
- root `package.json`：`--filter '@zonease/aiworker-host-daemon'`（已在 A1 翻成 worker-daemon）、`--filter '@zonease/aiworker-web'`→`--filter '@zonease/aiworker-worker-web'`（已被 Step 3 翻）；确认 `--filter '@zonease/aiworker-cli'` **仍是 cli**（不变）。
- `scripts/check-doc-contract.ts` `webBuildScript`（L800）与 `tests/architecture/refactor-contract.test.ts` `webBuildScript`（L1983）已被 Step 3 翻成 worker-web；确认 build-script 门（check-doc-contract L908 `includes('@zonease/aiworker-worker-daemon')`）已在 A1 翻。

- [ ] **Step 5: regen lockfile**
```bash
bun install
```

- [ ] **Step 6: 验证（含 build + boundary + soul-app boundary）**
```bash
bun run typecheck && bun run test:contracts && bun run lint && bun run build
```
Expected: PASS。`lint` 含 `check-soul-app-boundaries`（walk roots 已改为 apps/worker-cli/worker-web，否则静默回归——若 lint 通过但你怀疑 walk 空跑，手动 `bun scripts/check-soul-app-boundaries.ts` 并确认它真的扫到了文件）。

- [ ] **Step 7: commit**
```bash
git add -A
git commit -m "refactor(rename): apps/cli→apps/worker-cli (dir only), apps/web→apps/worker-web"
```

---

## Task A3：rename 后的真实 smoke/build 验证（apps/worker-cli 产物链）

**Files:** 无（验证）。爆炸半径显示 `apps/worker-cli/scripts/*`（smoke-*、package-release-bundles、build-publish-manifest）、`smoke-npm-package.ts`(node_modules 路径用 `@zonease/aiworker-cli` 名——名不变故 OK)、`aiworker-bin-shim.sh`(npx `@zonease/aiworker-cli`——名不变故 OK)、`governance-kernel-harness.ts`(path `apps/worker-cli/dist/...` 已翻) 都依赖路径/产物。

- [ ] **Step 1: 跑 CLI/smoke 链**
```bash
bun run build && bun run smoke:dist-release && bun run smoke:standalone-release && bun run smoke:standalone-runtime && bun run smoke:npm-package
```
Expected: 全 PASS（证明 dir rename 没破坏 CLI 产物、binary `aiworker`、npm 包名 `@zonease/aiworker-cli`、updater、bin-shim）。

- [ ] **Step 2: 若某 smoke 红** → 多半是某处 `apps/cli` 路径漏翻或误翻了 `@zonease/aiworker-cli` 名。`rg "apps/cli\b"` 找漏网路径；`rg "aiworker-worker-cli"` 确认没把 cli 名误改。修正后重跑。
- [ ] **Step 3:** 无独立 commit（验证 task）；若有修正，commit `fix(rename): 修 apps/worker-cli 产物链漏翻`。

---

## Task C1：Host metadata → Worker metadata（领域术语，耦合链原子改）

**Files（来自爆炸半径 E15/E16，路径已是 rename 后）：** `packages/storage-sqlite/src/worker/index.ts`(抛错串 L95/97/108/116/138)、`packages/storage-sqlite/src/worker/index.test.ts`(17 处 toThrow)、`packages/worker-daemon/src/modes/worker/settings.ts`(L97/105 startsWith)、`packages/worker-daemon/src/modes/worker.ts`(L1016/1023-1025)、`apps/worker-cli/src/aiworker.test.ts`(L708 toContain)、`packages/worker-runtime/src/worker/runtime.test.ts`(L2143/2526 描述)、`tests/architecture/refactor-contract.test.ts`(L285/2185/2189/2190)、canonical docs `docs/protocol.md`(L56/179/180)、`docs/runtime.md`(L204)、`docs/testing.md`(L159/161 + ledger row)、`scripts/check-doc-contract.ts`(L194/327/465/467/602/614/618)。

- [ ] **Step 1: 全局替换原子串 `Host metadata`→`Worker metadata`（tracked，排除 bun.lock 与 docs/superpowers/*）**
```bash
git ls-files -z -- ':!:bun.lock' ':!:docs/superpowers/*' \
  | xargs -0 perl -pi -e 's{Host metadata}{Worker metadata}g'
```
> 排除 `docs/superpowers/*`（spec/plan 过程产物 + 本 plan 文件正被读取）。canonical docs（protocol/runtime/testing）仍在替换范围。

- [ ] **Step 2: 处理 3 项 Plan-1 deferred wrinkle（非 "Host metadata" 直配的，手改）**
- `docs/testing.md` Coverage Ledger 行标签 `Host shell / locator / mount / bridge` → `Worker autonomy / Host control plane`；同步 `scripts/check-doc-contract.ts` 对应 gated 短语（爆炸半径 D12 提到 testing.md 该行）。
- 确认 `docs/protocol.md:56`（worker-scoped config "stored in Host metadata"→"stored in Worker metadata"）已被 Step 1 翻；`docs/runtime.md:204` 生命周期句同理。check-doc-contract L194/L327 对应 gated 短语已被 Step 1 翻（因为门短语里也含 "Host metadata"）。

- [ ] **Step 3: 验证（耦合链 + 文档门 + 存储/cli/daemon 套件）**
```bash
bun run docs:check && bun run test:contracts && \
bun run --filter '@zonease/aiworker-storage-sqlite' test && \
bun run --filter '@zonease/aiworker-worker-daemon' test && \
bun test apps/worker-cli/src/aiworker.test.ts
```
Expected: 全 PASS（storage 抛错串、daemon startsWith 守卫、cli toContain、文档门、storage 17 toThrow 全一致）。

- [ ] **Step 4: commit**
```bash
git add -A
git commit -m "refactor(term): Host metadata→Worker metadata + 收尾 Plan-1 deferred 文档措辞"
```

---

## Task D1：worktree 内全量 release:check + 合回主分支

**Files:** 无（验证 + 合并）

- [ ] **Step 1: 隔离树内跑完整 release 门**
```bash
bun run release:check
```
Expected: exit 0（docs:check / test:contracts / test:protocol / test:cli / test:browser:freeform / typecheck / lint / build / 4×smoke / test / check 全绿）。这是 rename 无行为回归的硬证明。**注意**：`test:browser:freeform` 跑真实 chromium，确认 mounted workbench 仍工作。

- [ ] **Step 2: 若任何门红** → 用 systematic-debugging 定位漏翻/误翻；常见：`rg "host-runtime|host-daemon|@zonease/aiworker-web\b|apps/cli\b|apps/web\b|Host metadata"`（排除本 plan 文件与历史 plan）应**零命中**于 active 代码/门/canonical docs。修正后重跑 release:check。

- [ ] **Step 3: 合回 `codex/aiworker-refactor-dev-loop`** — 用 superpowers:finishing-a-development-branch 的合并路径。合并前**复查主分支 git status**（共享树并发）：若 peer 在主分支也动了被 rename 的文件，按 peer work 处理冲突（保留双方意图，不盲覆盖），合并后在主分支再跑一次 `bun run test:contracts` 确认绿。
- [ ] **Step 4:** 合回后清理 worktree。

---

## Self-Review（执行者完成后自检）

1. **零残留**：`rg "@zonease/aiworker-host-runtime|@zonease/aiworker-host-daemon|@zonease/aiworker-web\b|packages/host-runtime|packages/host-daemon|\bapps/cli\b|\bapps/web\b"`（排除本 plan + 历史 plan 文档）在 active 代码/门/canonical docs 中**零命中**。`@zonease/aiworker-cli` 名应**仍存在**（cli 发布名保留）。
2. **Host metadata 清零**：`rg "Host metadata"`（排除历史 plan）在 active 代码/canonical docs/门中零命中。
3. **门全绿**：worktree 内 `release:check` exit 0。
4. **boundary 未静默回归**：`bun scripts/check-soul-app-boundaries.ts` 确实扫到 `apps/worker-cli`/`apps/worker-web` 下文件（非空跑）。
5. **未触 G2/G3 promote**：G2/G3 仍为 `test.todo`（它们在 host-control 存在后才有牙；留给 Plan 4 carve）。本 plan 只翻 package-ownership/refactor-contract 的结构路径门。
6. **下一步**：Plan 3（新包 worker-control-protocol/host-control + apps/host-cli/host-web + 最小控制契约 / G5），落地后另行编写。
