# Worker 自治倒置 · Plan 5（收官）：G1 守卫 + browser 测试硬化 + cleanup + release:check 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development（推荐）或 executing-plans 逐 task 执行。步骤用 `- [ ]`。**执行隔离**：在隔离 git worktree（从 `codex/aiworker-refactor-dev-loop` tip fork，建议名 `worker-autonomy-plan5`）内执行。

**Goal:** 提升最后的 G1 守卫（worker standalone 金路径，Host 缺席）、硬化 flaky 的 `test:browser:freeform`、清理残留，并跑全 `release:check` 收官 5-plan 系列。

**Architecture:** 5-plan 系列收官。release:check 已实证：确定性门全绿，唯一红是 browser 环境性 flake（15s micro-app mount 超时，非回归）。本 plan 不改运行时行为——G1 是结构守卫锚既有行为金路径；browser 硬化只放宽/条件化等待（不放宽断言）；cleanup 是删 cruft + 测试 prose。

**Tech Stack:** Bun workspaces、TypeScript、`bun:test`、Playwright(经 bun)。

**门命令：** `bun run test:contracts`、`bun run test:browser:freeform`、`bun run release:check`、`bun run lint`、`bun run typecheck`。

**依据：** design doc `docs/superpowers/specs/2026-05-30-worker-autonomy-plan-5-standalone-finalize-design.md`（§3 组件 A–D）。

---

## 已定设计决策（执行者遵守）

1. **G1 = 结构守卫锚行为金路径**（非行为 runner）：断言 `freeform-golden-path.test.ts` 存在、host-free、wired 进 `test:cli`。与 G3 区分。
2. **browser 硬化 = 放宽/条件化等待**：env 可覆盖超时（默认 45s）+ 加 `data-child-ready="true"` 就绪 OR-branch；**不放宽任何断言语义**。
3. **cleanup**：`rm -rf` 两个 0-tracked-file cruft 目录（`packages/host-runtime`、`packages/host-daemon`，非 git 内容）；清 `orchestration/orchestrator.test.ts` 的 Host prose。
4. **不重写** `docs/superpowers/plans|specs/*` 历史文档；不动运行时行为；不动已真的 G0/G2–G6。
5. **收官**：inversion-guards 达 **7 pass / 0 todo**；release:check 绿（browser 若需 rerun，如实写明）。

## 边界

- ✅ 升 G1 + 硬化两 browser spec mount 等待 + rm cruft + 清 test prose + 全 release:check + 更新 memory。
- ❌ 不重写历史文档；不放宽断言；不加功能；不动 G0/G2–G6。

---

## Task 1：提升 G1（worker standalone 金路径守卫）

**Files:**
- Modify: `tests/architecture/inversion-guards.test.ts`（line 104–105 的 `test.todo('G1...')`）

- [ ] **Step 1: 写真断言替换 test.todo**
把 line 104–105：
```ts
// G1 ↔ C1：worker standalone 金路径，Host 缺席全通。Plan 5 真证；此处先文档锚点。
test.todo('G1: worker standalone golden path passes with Host absent')
```
替换为：
```ts
// G1 ↔ C1：worker standalone 金路径行为证据存在、host-free、且被 release:check 执行（经 test:cli）。
// 与 G3（包依赖方向）区分：锚定「自治行为证据存在且 host-free 且真的跑」。
test('G1: worker standalone golden path passes with Host absent', () => {
  const goldenPath = 'apps/worker-cli/src/freeform-golden-path.test.ts'
  // (1) 行为自治证据存在
  expect(existsSync(join(repoRoot, goldenPath)), `${goldenPath} must exist`).toBe(true)
  // (2) 金路径 host-free：不引用任何 host-* 控制面包 / host-control / aiworker-host 二进制
  const source = read(goldenPath)
  for (const hostRef of ['@zonease/aiworker-host-', 'host-control', 'aiworker-host '])
    expect(source, `golden path must not reference Host plane via ${hostRef}`).not.toContain(hostRef)
  // (3) wired 进 test:cli（release:check 真的会跑这条自治证据）
  const rootPkg = JSON.parse(read('package.json')) as { scripts?: Record<string, string> }
  expect(rootPkg.scripts?.['test:cli'] ?? '', 'test:cli must run the standalone golden path').toContain('freeform-golden-path.test.ts')
})
```
> `existsSync`/`join`/`read` 均已在文件顶部可用（Plan 1/3）。检查串用具体形态避免误伤：`'@zonease/aiworker-host-'` 命中 host-control/cli/web 包名，`'aiworker-host '`（含尾空格）命中二进制调用而非 `AIWORKER_HOME`/`localhost`。

- [ ] **Step 2: 跑通过 + 仅剩 0 todo**
Run: `bun test tests/architecture/inversion-guards.test.ts`
Expected: **7 pass / 0 todo / 0 fail**（G0–G6 全真）。若 (2) 因某 host 串误命中而 fail，先 `grep -n "@zonease/aiworker-host-\|host-control\|aiworker-host " apps/worker-cli/src/freeform-golden-path.test.ts` 核实——预期空（金路径本就 host-free）。

- [ ] **Step 3: 非空性验证（注入违例 → 必 fail）**
```bash
# 临时在金路径测试顶部加一行 host-control 引用
printf "import '@zonease/aiworker-host-control'\n" | cat - apps/worker-cli/src/freeform-golden-path.test.ts > /tmp/gp && mv /tmp/gp apps/worker-cli/src/freeform-golden-path.test.ts
bun test tests/architecture/inversion-guards.test.ts 2>&1 | grep -iE "G1|fail" | head
git checkout -- apps/worker-cli/src/freeform-golden-path.test.ts
bun test tests/architecture/inversion-guards.test.ts 2>&1 | tail -3
```
Expected: 注入后 G1 **fail**；还原后 **7 pass / 0 todo**。

- [ ] **Step 4: commit**
```bash
git add tests/architecture/inversion-guards.test.ts
git commit -m "test(contract): 提升 G1 真断言（worker standalone 金路径存在/host-free/wired 进 test:cli）——inversion-guards 7 pass/0 todo"
```

---

## Task 2：硬化 flaky browser 测试（mount 等待）

**Files:**
- Create: `tests/browser/mount-wait.ts`
- Modify: `tests/browser/freeform-cli-golden-path.spec.ts`、`tests/browser/freeform-mounted-workbench.spec.ts`

- [ ] **Step 1: 建 env 可覆盖的超时常量模块**
Create `tests/browser/mount-wait.ts`：
```ts
import process from 'node:process'

// micro-app 挂载/就绪等待上限。默认 45s 容忍高系统负载（load≈15 下 15s 会 flake）；
// CI/本地可经 AIWORKER_BROWSER_MOUNT_TIMEOUT_MS 调整。
export const MOUNT_TIMEOUT_MS = Number.parseInt(process.env.AIWORKER_BROWSER_MOUNT_TIMEOUT_MS ?? '', 10) || 45_000
```

- [ ] **Step 2: cli-golden-path.spec.ts —— import 常量 + 放宽两处等待 + 加就绪 OR-branch**
在 `tests/browser/freeform-cli-golden-path.spec.ts` 顶部 import 区加：
```ts
import { MOUNT_TIMEOUT_MS } from './mount-wait'
```
把 line 132：
```ts
  await microApp.waitFor({ state: 'attached', timeout: 15_000 })
```
改为：
```ts
  await microApp.waitFor({ state: 'attached', timeout: MOUNT_TIMEOUT_MS })
```
把 `waitForFreeformWorkbench` 内（约 line 369–376）的 `waitForFunction` 改为放宽超时 + 加 `data-child-ready` 就绪 OR-branch：
```ts
    await page.waitForFunction(() => {
      const text = document.body.textContent ?? ''
      const microApp = document.querySelector('micro-app') as (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null
      return text.includes('AIWorker Common Workbench')
        || text.includes('Bridge event refs')
        || Boolean(document.querySelector('[data-aiworker-common-workbench="true"]'))
        || Boolean(microApp?.shadowRoot?.querySelector('[data-aiworker-common-workbench="true"]'))
        || Boolean(document.querySelector('micro-app[data-slot="soul-app-mounted-micro-app"][data-child-ready="true"]'))
    }, undefined, { timeout: MOUNT_TIMEOUT_MS })
```
> 仅新增 1 个 OR-branch（`data-child-ready="true"` = host 侧标记子应用就绪的真实信号，见 `apps/worker-web/src/worker/studio/mounted-surface.tsx:288`）+ 放宽超时；既有断言分支不删。

- [ ] **Step 3: mounted-workbench.spec.ts —— 同样处理**
在 `tests/browser/freeform-mounted-workbench.spec.ts` 顶部 import `MOUNT_TIMEOUT_MS`。
把 line 117：
```ts
    await microApp.waitFor({ state: 'attached' })
```
改为：
```ts
    await microApp.waitFor({ state: 'attached', timeout: MOUNT_TIMEOUT_MS })
```
把其 `waitForFunction`（约 line 130–137，原 `timeout: 5_000`）改为：
```ts
      await page.waitForFunction(() => {
        const text = document.body.textContent ?? ''
        const microApp = document.querySelector('micro-app') as (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null
        return text.includes('AIWorker Common Workbench')
          || text.includes('Bridge event refs')
          || Boolean(document.querySelector('[data-aiworker-common-workbench="true"]'))
          || Boolean(microApp?.shadowRoot?.querySelector('[data-aiworker-common-workbench="true"]'))
          || Boolean(document.querySelector('micro-app[data-slot="soul-app-mounted-micro-app"][data-child-ready="true"]'))
      }, undefined, { timeout: MOUNT_TIMEOUT_MS })
```
（即放宽超时为 `MOUNT_TIMEOUT_MS` + 新增最后一个 `data-child-ready="true"` OR-branch；既有断言分支不删。）

- [ ] **Step 4: 残留 15_000/5_000 mount 等待复查**
Run: `grep -nE "15_000|5_000|waitFor\(\{ state: 'attached' \}\)" tests/browser/freeform-cli-golden-path.spec.ts tests/browser/freeform-mounted-workbench.spec.ts`
Expected: 与 mount/workbench 就绪相关的 15_000/5_000 与无超时 `attached` 已全部改为 `MOUNT_TIMEOUT_MS`（与 micro-app 挂载无关的其它超时如 `waitForHealth` 不强制改）。

- [ ] **Step 5: 跑 browser 门确认稳定**（先清泄漏 chromium）
```bash
pkill -9 -f "chromium|playwright-core|headless_shell" 2>/dev/null; sleep 2
bun run test:browser:freeform 2>&1 | tail -8
```
Expected: 退出码 0（两 spec 通过）。若仍 flake（负载极端），单跑确认各 spec 在隔离下通过，并在完成声明写明。

- [ ] **Step 6: typecheck + lint + commit**
```bash
bun run --filter '@zonease/aiworker-worker-web' typecheck >/dev/null 2>&1 || true   # specs 不在某包 tsconfig 内时跳过
bunx eslint tests/browser/mount-wait.ts tests/browser/freeform-cli-golden-path.spec.ts tests/browser/freeform-mounted-workbench.spec.ts
git add tests/browser/mount-wait.ts tests/browser/freeform-cli-golden-path.spec.ts tests/browser/freeform-mounted-workbench.spec.ts
git commit -m "test(browser): 硬化 micro-app mount 等待（env 可覆盖超时默认 45s + data-child-ready 就绪条件）消除负载 flake"
```

---

## Task 3：清理残留（cruft 目录 + orchestrator.test.ts Host prose）

**Files:**
- Delete (filesystem cruft, 非 git): `packages/host-runtime/`、`packages/host-daemon/`
- Modify: `packages/worker-runtime/src/orchestration/orchestrator.test.ts`

- [ ] **Step 1: rm 两个 0-tracked-file cruft 目录**
```bash
# 先确认 0 tracked files（安全）
git ls-files packages/host-runtime packages/host-daemon | wc -l   # Expected: 0
rm -rf packages/host-runtime packages/host-daemon
ls -d packages/host-runtime packages/host-daemon 2>/dev/null || echo "removed ok"
```
> 这两目录无 git 跟踪内容（rename 后残渣），`rm` 不产生 git 改动。

- [ ] **Step 2: 改 orchestrator.test.ts 的 Host prose**
在 `packages/worker-runtime/src/orchestration/orchestrator.test.ts`：
- line 56：`describe('Host runtime boundary', () => {` → `describe('Worker orchestrator boundary', () => {`
- line 71：`function host() {` → `function orchestrator() {`
- 4 处调用点（line 112/169/185/204）：`const runtime = host()` → `const runtime = orchestrator()`
（用 `sed -i 's/\bconst runtime = host()/const runtime = orchestrator()/g; s/\bfunction host()/function orchestrator()/g'` 后核对 `describe` 单独改。）

- [ ] **Step 3: 残留复查 + 测试**
```bash
grep -n "function host()\|= host()\|Host runtime boundary" packages/worker-runtime/src/orchestration/orchestrator.test.ts || echo "无残留 Host prose"
bun test packages/worker-runtime/src/orchestration
bunx eslint packages/worker-runtime/src/orchestration/orchestrator.test.ts
```
Expected: 无残留；orchestration 测试全 pass；eslint 0。

- [ ] **Step 4: commit**
```bash
git add packages/worker-runtime/src/orchestration/orchestrator.test.ts
git commit -m "test(worker-runtime): 清 orchestrator.test.ts 遗留 Host prose（describe/host()→orchestrator）+ rm host-runtime/host-daemon cruft"
```

---

## Task 4：全 release:check 收官 + 合回

- [ ] **Step 1: 清泄漏 chromium + 跑全 release:check**
```bash
pkill -9 -f "chromium|playwright-core|headless_shell" 2>/dev/null; sleep 2
bun install
bun run release:check 2>&1 | tee /tmp/p5-releasecheck.log | tail -20; echo "RELEASE_CHECK_EXIT=${PIPESTATUS[0]}"
```
Expected: 退出 0。含 inversion-guards **7 pass / 0 todo**。
> 若 `test:browser:freeform` 在极端负载下仍 flake：清 chromium 后单跑两 spec 确认隔离通过，完成声明如实写「release:check green, browser specs passed on rerun」。

- [ ] **Step 2: code-review-graph**（AGENTS.md，非 docs-only）
对分支 diff 跑 `detect_changes_tool`（base = 合回前 codex tip）。预期：守卫/测试硬化/prose，关注 G1 断言与 browser 等待改动是否合理、无放宽断言。

- [ ] **Step 3: 合回**
用 finishing-a-development-branch：`ExitWorktree(action: keep)` 回主树（EnterWorktree 会话）；复查 codex tip 未前移可 FF；FF 合入 `codex/aiworker-refactor-dev-loop`；合并后主树复跑 `test:contracts + typecheck`；`git worktree remove` + 删分支。

- [ ] **Step 4: 更新 memory [[worker-autonomy-inversion]]**：**5-plan 系列完成**——engine 启动权倒置落地、G0–G6 全真（inversion-guards 7 pass / 0 todo）、release:check 绿、Plan 5 落地 HEAD。标注后续 roadmap（connectors / delivery-profile / 隔离 driver / gateway 鉴权 / 非 web transport）仍 deferred。

---

## Self-Review（执行者完成后）

1. **Spec 覆盖**：G1（§3.A）→ T1；browser 硬化（§3.B）→ T2；cleanup（§3.C）→ T3；release:check 收官（§3.D）→ T4。对账（旧权威/名已 Plan 1/2/4 完成）已在 design doc §1。
2. **边界**：未重写历史文档；未放宽断言（T2 只放宽/条件化等待）；未动 G0/G2–G6；未加功能。
3. **类型/串一致**：G1 检查串具体（`@zonease/aiworker-host-`/`host-control`/`aiworker-host `）；`MOUNT_TIMEOUT_MS` 在两 spec 一致 import。
4. **收官**：inversion-guards 7 pass / 0 todo；release:check 绿。**5-plan 系列至此完成。**
