# Worker 自治倒置 · Plan 1：权威重写（文档 + doc-gate + 倒置 guard）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 canonical 文档与 doc-契约门从「Host 持有 runtime/engine 启动」翻转为「Worker 自治拥有 engine 启动、Host 是可选控制面」，写入 C1–C6 硬约束，解禁 control-plane/gateway 词汇，并加入 G1–G6 倒置 guard 脚手架。

**Architecture:** Contract-first 重构的第 1 阶段（共 5 个 plan）。本 plan 只改**文档内容**与**doc-内容门**（`scripts/check-doc-contract.ts` 短语清单、`tests/architecture/refactor-contract.test.ts` 的 doc 正文断言），**不动**包目录/包名/结构门（那些留给 Plan 2 rename 与 Plan 4 carve 与代码一起翻），也不动任何运行时代码。TDD 顺序：先改门（变红）→ 再改文档（转绿）→ 跑门 → commit。

**Tech Stack:** Bun（`bun test`、`bun:test`）、Markdown canonical docs、TypeScript 契约测试与 `scripts/check-doc-contract.ts`。

**门命令：** `bun run docs:check`（= `bun scripts/check-doc-contract.ts`）与 `bun run test:contracts`（= `bun test tests/architecture scripts/check-soul-app-boundaries.test.ts`）。

**依据 spec：** `docs/superpowers/specs/2026-05-30-worker-autonomy-engine-launch-inversion-design.md`（§4 归属、§5 C1–C6、§6 monorepo、§7 控制契约、§8 文档清单、§10 G1–G6）。

**5-plan 系列（本文件是 Plan 1）：**
1. **权威重写**（本 plan）
2. 机械 rename（host-runtime→worker-runtime 等）
3. 新包 + 最小控制契约（worker-control-protocol / host-control / apps/host-*）
4. carve 4 个 carve-point + worker-*≠host-* 等结构门转绿
5. 自治金路径 G1 + 清理 + `release:check` 全绿

**本 plan 的边界（务必遵守）：**
- ✅ 改：5 份文档 + AGENTS 正文；`check-doc-contract.ts` 短语/禁字清单；`refactor-contract.test.ts` 的 **doc 正文断言**；新增 `tests/architecture/inversion-guards.test.ts`。
- ❌ 不改：`package-ownership.test.ts`（结构/包名门，Plan 2）；`refactor-contract.test.ts` 里**读取当前代码文件**的结构断言（仍指向现存的 `packages/host-runtime/...`，保持绿，Plan 2/4 再翻）；任何 `packages/`、`apps/`、`souls/` 下的运行时代码。
- 文档里**描述目标结构**（worker-runtime / host-control / apps/worker-cli…），代码此刻仍是旧名——这是 contract-first 故意的「文档先行于代码」状态，Plan 2 让代码追上。

---

## 关键事实（执行前必读）

`scripts/check-doc-contract.ts` 用 `requireIncludes('<file>', [<逐字短语>])` 把文档正文钉死，`forbidIncludes` 与 `forbiddenActiveDocPhrases` 禁某些词。`tests/architecture/refactor-contract.test.ts` 同时断言 doc 正文。**改任一文档正文短语，必须同步改这两处对应断言**，否则 `docs:check` / `test:contracts` 立刻红。

`forbiddenActiveDocPhrases`（`check-doc-contract.ts` 顶部）当前禁用：`Host auth is provider-backed`、`admission`、`grant enforcement`、`gateway`、`fleet`、`control-plane`、`Host-owned proposal`、`Host-owned review`、`generic review/lesson ledger`、`generic enablement security review`。本 plan 需解禁 `gateway`、`control-plane`、`fleet`（倒置词汇要用到），其余保持禁用。

`refactor-contract.test.ts` 的 `'AGENTS.md is a short bootstrap'` 测试要求 `lineCount <= 90` 且 AGENTS 含 `'Host is shell / locator / mount / bridge'`；`check-doc-contract.ts` 的 `requireMaxLines('AGENTS.md', 90)` 同。改 AGENTS 时两边一起改并守住 90 行上限。

---

## Task 1：解禁倒置词汇（`forbiddenActiveDocPhrases`）

**Files:**
- Modify: `scripts/check-doc-contract.ts`（顶部 `forbiddenActiveDocPhrases` 数组）
- Test: `tests/architecture/inversion-guards.test.ts`（新建，本 task 起步）

- [ ] **Step 1: 写失败测试** — 新建 `tests/architecture/inversion-guards.test.ts`：

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const repoRoot = join(import.meta.dir, '..', '..')
function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('worker-autonomy inversion guards (Plan 1)', () => {
  test('G0: inversion vocabulary is no longer forbidden in active docs', () => {
    const checker = read('scripts/check-doc-contract.ts')
    const forbiddenBlock = checker.slice(
      checker.indexOf('const forbiddenActiveDocPhrases'),
      checker.indexOf('for (const file of activeDocs)'),
    )
    for (const allowed of ['gateway', 'control-plane', 'fleet'])
      expect(forbiddenBlock).not.toContain(`'${allowed}'`)
    // 仍保留的禁字
    for (const stillForbidden of ['Host auth is provider-backed', 'grant enforcement'])
      expect(forbiddenBlock).toContain(`'${stillForbidden}'`)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/architecture/inversion-guards.test.ts`
Expected: FAIL（`forbiddenBlock` 仍含 `'gateway'` 等）

- [ ] **Step 3: 编辑 `check-doc-contract.ts`** — 从 `forbiddenActiveDocPhrases` 删除 `'gateway'`、`'control-plane'`、`'fleet'` 三行，保留其余。结果数组：

```ts
const forbiddenActiveDocPhrases = [
  'Host auth is provider-backed',
  'admission',
  'grant enforcement',
  'Host-owned proposal',
  'Host-owned review',
  'generic review/lesson ledger',
  'generic enablement security review',
]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test tests/architecture/inversion-guards.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add scripts/check-doc-contract.ts tests/architecture/inversion-guards.test.ts
git commit -m "test(contract): 解禁倒置词汇并起 inversion-guards 脚手架"
```

---

## Task 2：architecture.md — Position 倒置

**Files:**
- Modify: `docs/architecture.md`（`## Position` 段）
- Modify: `scripts/check-doc-contract.ts`（`requireIncludes('docs/architecture.md', [...])`）
- Modify: `tests/architecture/refactor-contract.test.ts`（`'canonical docs are promoted...'` 测试）

- [ ] **Step 1: 改门（变红）** — 在 `check-doc-contract.ts` 的 `requireIncludes('docs/architecture.md', [...])` 数组中：

删除这些条目：
```ts
'Host is shell / locator / mount / bridge',
'Host is shell / locator / mount / bridge.',
'AIWorker is a CLI-first local product for running Soul Apps through native\nengines.',
'Host starts local infrastructure, locates worker/workspace/session context,\nmounts app-owned UI/API, prepares engine invocation context, and observes native\nengine output.',
```
新增这些条目：
```ts
'AIWorker is a worker-centric product. A Worker is an autonomous, CLI-first\nruntime that runs one Soul App through a native engine and owns engine launch.',
'A Worker runs fully standalone. Host is never on the runtime hot path.',
'Host is an optional control plane: distributor, manager, permission allocator,\nand connector authorizer.',
'Worker -> Soul App -> workspace locator -> session -> app-owned work',
'Host -> distribute / manage / authorize / connector -> mount worker config micro-app',
'Host does not spawn, observe, or hold engine processes.',
```
保留 `'CLI-first'`、`'The default product path is:'`→改为 `'The default product paths are:'`（删旧增新）、`'Host is not a domain workflow layer, a product backend, an agent\nruntime, a repository dashboard, or a Soul App configuration center.'`（保留）。

在 `refactor-contract.test.ts` 的 `'canonical docs are promoted as the only architecture authority set'` 测试中：
删除 `expect(architecture).toContain('Host is shell / locator / mount / bridge')`；
新增 `expect(architecture).toContain('Host is an optional control plane: distributor, manager, permission allocator,\nand connector authorizer.')`；
保留 `expect(architecture).toContain('CLI-first')`、`'descriptor-only'`、`'packages/core and packages/shared disappear'`。

- [ ] **Step 2: 跑门确认失败**

Run: `bun run docs:check`
Expected: FAIL（architecture.md 缺新短语）

- [ ] **Step 3: 改文档（转绿）** — 把 `docs/architecture.md` 的 `## Position` 整段替换为：

```markdown
## Position

AIWorker is a worker-centric product. A Worker is an autonomous, CLI-first
runtime that runs one Soul App through a native engine and owns engine launch.

A Worker runs fully standalone. Host is never on the runtime hot path.

Host is an optional control plane: distributor, manager, permission allocator,
and connector authorizer.

The default product paths are:

```text
Worker -> Soul App -> workspace locator -> session -> app-owned work
Host -> distribute / manage / authorize / connector -> mount worker config micro-app
```

A Worker starts its own local infrastructure, locates workspace/session context,
serves its own employee web, owns projection and the engine bridge, launches and
observes the native engine, and exposes a control surface. Host distributes,
manages, allocates permissions, authorizes connectors, and mounts a Worker's
configuration micro-app to configure it. Host does not spawn, observe, or hold
engine processes. Host is not a domain workflow layer, a product backend, an agent
runtime, a repository dashboard, or a Soul App configuration center.
```

- [ ] **Step 4: 跑门确认通过**

Run: `bun run docs:check && bun test tests/architecture/refactor-contract.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add docs/architecture.md scripts/check-doc-contract.ts tests/architecture/refactor-contract.test.ts
git commit -m "docs(architecture): Position 倒置为 worker-centric + Host 控制面"
```

---

## Task 3：architecture.md — Ownership 三层归属

**Files:**
- Modify: `docs/architecture.md`（`## Ownership` 段）
- Modify: `scripts/check-doc-contract.ts`（architecture requireIncludes）

- [ ] **Step 1: 改门（变红）** — 在 `requireIncludes('docs/architecture.md', [...])` 中：

删除：
```ts
'Host owns only platform metadata:',
'- installed app descriptors;\n- worker metadata and worker-scoped SDK-standard configuration envelopes;\n- workspace locator metadata;\n- session lifecycle metadata;\n- engine invocation references;\n- projection receipts;\n- normalized bridge event references;\n- redacted diagnostic references.',
'Host DB must not store Soul domain objects, artifact content, review/profile\nrecords, business confirmation state, engine secrets, engine profile files, or\nnative MCP secret values.',
'Soul Apps own domain state, domain UI/API, business outputs, confirmation\nactions, app-owned history, standalone experience, and mounted product\nexperience.',
```
新增：
```ts
'A Worker is a running instance of a Soul App.',
'A Worker owns its runtime state:',
'- the Soul descriptor or template it runs;\n- workspace locator and workspace root;\n- session lifecycle metadata;\n- engine invocations and engine process state;\n- engine launch via the engine bridge;\n- projection, projection receipts, and receipt-based cleanup;\n- worker-scoped configuration overlays;\n- its own employee web and app-owned API proxy;\n- its own storage and filesystem root;\n- redaction of its own output.',
'Host owns only control-plane metadata:',
'- the worker registry: which workers exist, identity, endpoint, health;\n- assignment metadata: assigned template/soul, connectors, engine/gateway profile, permissions;\n- permission allocation and connector authorization;\n- worker distribution and provisioning records.',
'Host must not own session, invocation, projection, engine processes, domain\nstate, or secrets. A Worker must not depend on Host to run. Worker packages must\nnot import Host packages.',
```

- [ ] **Step 2: 跑门确认失败**

Run: `bun run docs:check`
Expected: FAIL

- [ ] **Step 3: 改文档（转绿）** — 把 `docs/architecture.md` 的 `## Ownership` 整段替换为：

```markdown
## Ownership

Soul Apps, also called Templates, own domain state, domain UI/API, business
outputs, confirmation actions, app-owned history, standalone experience, mounted
product experience, descriptor production, and engine target declaration. A Worker
is a running instance of a Soul App.

A Worker owns its runtime state:

- the Soul descriptor or template it runs;
- workspace locator and workspace root;
- session lifecycle metadata;
- engine invocations and engine process state;
- engine launch via the engine bridge;
- projection, projection receipts, and receipt-based cleanup;
- worker-scoped configuration overlays;
- its own employee web and app-owned API proxy;
- its own storage and filesystem root;
- redaction of its own output.

Host owns only control-plane metadata:

- the worker registry: which workers exist, identity, endpoint, health;
- assignment metadata: assigned template/soul, connectors, engine/gateway profile, permissions;
- permission allocation and connector authorization;
- worker distribution and provisioning records.

Host must not own session, invocation, projection, engine processes, domain
state, or secrets. A Worker must not depend on Host to run. Worker packages must
not import Host packages.
```

- [ ] **Step 4: 跑门确认通过**

Run: `bun run docs:check`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add docs/architecture.md scripts/check-doc-contract.ts
git commit -m "docs(architecture): Ownership 改为 Worker/Host/Soul 三层归属"
```

---

## Task 4：architecture.md — Monorepo Boundary（目标树 + prefix 规则）

**Files:**
- Modify: `docs/architecture.md`（`## Monorepo Boundary` 段）
- Modify: `scripts/check-doc-contract.ts`（architecture requireIncludes）

- [ ] **Step 1: 改门（变红）** — 在 architecture requireIncludes 中：

删除旧目录树短语：
```ts
'apps/\n  cli/\n  web/\n\nsouls/\n  aiworker-freeform/\n\npackages/\n  host-runtime/\n  host-daemon/\n  soul-protocol/\n  soul-app-sdk/\n  soul-app-runtime/\n  soul-workbench/\n  engine-bridge/\n  engine-projection/\n  storage-sqlite/\n  fs-layout/\n  ui/',
'apps/api` migrates to `packages/host-daemon',
'A future `apps/daemon` may exist\nonly as a thin executable wrapper if a separate daemon binary becomes a product\ntarget.',
'`packages/*` own reusable protocol,\nruntime, daemon, storage, projection, engine bridge, SDK, workbench, filesystem,\nand UI capabilities.',
```
新增目标树与 prefix 规则短语：
```ts
'apps/\n  worker-cli/\n  worker-web/\n  host-cli/\n  host-web/\n\nsouls/\n  aiworker-freeform/\n\npackages/\n  worker-runtime/\n  worker-daemon/\n  host-control/\n  worker-control-protocol/\n  soul-protocol/\n  soul-app-sdk/\n  soul-app-runtime/\n  soul-workbench/\n  engine-bridge/\n  engine-projection/\n  storage-sqlite/\n  fs-layout/\n  ui/',
'Package and app names are plane-prefixed: `worker-*` owns the autonomous runtime;\n`host-*` owns the control plane; capability packages keep capability names and are\nconsumed mostly by Workers.',
'`worker-*` packages must not import `host-*` packages.',
'`apps/api` migrated into `packages/worker-daemon`.',
```
保留 `'`apps/*` are runnable product shells. `souls/*` are descriptor-producing Soul App\nproduct packages.'`、`'Do not create\n`core-v2`, `shared-v2`, or any replacement dumping ground.'`、`'The target top-level shape is:'`。

- [ ] **Step 2: 跑门确认失败**

Run: `bun run docs:check`
Expected: FAIL

- [ ] **Step 3: 改文档（转绿）** — 把 `docs/architecture.md` 的 `## Monorepo Boundary` 整段替换为：

```markdown
## Monorepo Boundary

The target top-level shape is:

```text
apps/
  worker-cli/
  worker-web/
  host-cli/
  host-web/

souls/
  aiworker-freeform/

packages/
  worker-runtime/
  worker-daemon/
  host-control/
  worker-control-protocol/
  soul-protocol/
  soul-app-sdk/
  soul-app-runtime/
  soul-workbench/
  engine-bridge/
  engine-projection/
  storage-sqlite/
  fs-layout/
  ui/
```

`apps/*` are runnable product shells. `souls/*` are descriptor-producing Soul App
product packages. Package and app names are plane-prefixed: `worker-*` owns the
autonomous runtime; `host-*` owns the control plane; capability packages keep
capability names and are consumed mostly by Workers. `worker-*` packages must not
import `host-*` packages. For v1 strong acceptance, Freeform is the only shipped
Soul; retired HR/QA app-local source trees stay deleted until they are re-authored
as descriptor-producing `souls/*` packages.

`packages/core and packages/shared disappear` as broad buckets. Do not create
`core-v2`, `shared-v2`, or any replacement dumping ground.

`apps/api` migrated into `packages/worker-daemon`. The control plane lives in
`packages/host-control` with `apps/host-cli` and `apps/host-web` shells.
```

> 注：保留原文已有的 `'For v1 strong acceptance, Freeform is the only shipped Soul;...'` 与 `'packages/core and packages/shared disappear'` 短语（门仍要求），故上面整段已含。

- [ ] **Step 4: 跑门确认通过**

Run: `bun run docs:check`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add docs/architecture.md scripts/check-doc-contract.ts
git commit -m "docs(architecture): Monorepo 目标树改为 worker-*/host-* prefix"
```

---

## Task 5：architecture.md — Protocol Boundary（控制契约 + management-mount）

**Files:**
- Modify: `docs/architecture.md`（`## Protocol Boundary` 段，追加）
- Modify: `scripts/check-doc-contract.ts`（architecture requireIncludes，新增）

- [ ] **Step 1: 改门（变红）** — 在 architecture requireIncludes 新增：

```ts
'The Host-to-Worker boundary is a transport-agnostic control contract owned by\n`packages/worker-control-protocol`.',
'A Worker is the passive control server; Host is the client; a Worker never\ninitiates a connection to Host.',
'The control contract covers worker describe, health, instance lifecycle, and an\nassignment envelope. It must not carry session, invocation, projection, engine,\nor domain data.',
'Management mount lets Host configure a Worker through the Worker configuration\nmicro-app. Management mount is distinct from the employee mount that serves\nworkspace/session/composer; employees connect to the Worker web directly.',
'The mounted configuration micro-app is the only current control-contract\ntransport; non-web transports are reserved and must not be hardcoded out.',
```

- [ ] **Step 2: 跑门确认失败**

Run: `bun run docs:check`
Expected: FAIL

- [ ] **Step 3: 改文档（转绿）** — 在 `docs/architecture.md` 的 `## Protocol Boundary` 段**末尾追加**（保留原有 descriptor-only 与 mounted workbench 段落）：

```markdown
The Host-to-Worker boundary is a transport-agnostic control contract owned by
`packages/worker-control-protocol`. A Worker is the passive control server; Host
is the client; a Worker never initiates a connection to Host. The control contract
covers worker describe, health, instance lifecycle, and an assignment envelope. It
must not carry session, invocation, projection, engine, or domain data.

Management mount lets Host configure a Worker through the Worker configuration
micro-app. Management mount is distinct from the employee mount that serves
workspace/session/composer; employees connect to the Worker web directly. The
mounted configuration micro-app is the only current control-contract transport;
non-web transports are reserved and must not be hardcoded out.
```

- [ ] **Step 4: 跑门确认通过**

Run: `bun run docs:check`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add docs/architecture.md scripts/check-doc-contract.ts
git commit -m "docs(architecture): Protocol Boundary 增 Host↔Worker 控制契约与 management-mount"
```

---

## Task 6：architecture.md — Runtime Boundary + Decision Coverage Index + Destructive Migration Rules

**Files:**
- Modify: `docs/architecture.md`（`## Runtime Boundary`、`## Decision Coverage Index`、`## Destructive Migration Rules`）
- Modify: `scripts/check-doc-contract.ts`（architecture requireIncludes）

- [ ] **Step 1: 改门（变红）** — 在 architecture requireIncludes：

a) Runtime Boundary：新增
```ts
'A session is a Worker locator for workspace locator, selected capability, and\ninvocation references. Engine execution lives in `engine_invocations` and is\nowned by the Worker.',
'The Worker, not Host, prepares engine invocation context and observes native\nengine output.',
```

b) Decision Coverage Index：新增
```ts
'- docs/architecture.md owns worker autonomy, Host control-plane ownership, monorepo\n  boundaries, data ownership, Freeform v1 scope, and destructive migration\n  constraints.',
'- worker-control-protocol owns the transport-agnostic Host↔Worker control contract.',
```
删除（被上面替换的旧条目）
```ts
'- docs/architecture.md owns product position, Host/Soul ownership, monorepo\n  boundaries, data ownership, Freeform v1 scope, and destructive migration\n  constraints.',
```
> 注：`refactor-contract.test.ts` 的 `'canonical architecture records the tmp refactor coverage policy'` 测试断言了 protocol/runtime/testing 三条 Index 行（不含上面这条 architecture 行），故不受影响；保持那三条原样。

c) Destructive Migration Rules：删除旧 12 步列表短语
```ts
'1. Promote canonical docs.\n2. Rewrite `AGENTS.md` as a short bootstrap.\n3. Add contract test skeleton before deleting old authority.\n4. Create target package skeleton.\n5. Move protocol/schema.\n6. Move daemon/API boundary.\n7. Build strict Host metadata schema.\n8. Build SDK descriptor and Freeform Soul.\n9. Build projection and engine bridge.\n10. Wire Web mount.\n11. Delete old authority and paths.\n12. Migrate QA/HR as samples.',
```
新增新倒置迁移列表短语
```ts
'1. Promote canonical docs and doc gates to worker autonomy.\n2. Add red inversion guards (G1-G6).\n3. Create target package skeletons: worker-control-protocol, host-control, apps/host-cli, apps/host-web.\n4. Rename host-runtime to worker-runtime, host-daemon to worker-daemon, apps/cli to worker-cli, apps/web to worker-web.\n5. Carve the host/worker split points into worker-runtime and host-control.\n6. Implement the minimal Host↔Worker control contract.\n7. Wire host-web management mount of the Worker configuration micro-app.\n8. Make the Worker standalone golden path pass with Host absent.\n9. Delete old authority and old names.\n10. Update roadmap and memory.',
```

- [ ] **Step 2: 跑门确认失败**

Run: `bun run docs:check`
Expected: FAIL

- [ ] **Step 3: 改文档（转绿）** —

a) 把 `## Runtime Boundary` 段开头两句（`Session lifecycle is separate... A session is a Host locator for worker, workspace locator, selected capability, and invocation references. Engine execution lives in engine_invocations.`）替换为：

```markdown
Session lifecycle is separate from native engine execution. A session is a Worker
locator for workspace locator, selected capability, and invocation references.
Engine execution lives in `engine_invocations` and is owned by the Worker. The
Worker, not Host, prepares engine invocation context and observes native engine
output.
```
（保留该段其后的 `Follow-up is session-level:` 与 B+ bridge 列表原文。）

b) 把 `## Decision Coverage Index` 段里 architecture 那一行（`- docs/architecture.md owns product position, Host/Soul ownership, ...`）替换为：

```markdown
- docs/architecture.md owns worker autonomy, Host control-plane ownership, monorepo
  boundaries, data ownership, Freeform v1 scope, and destructive migration
  constraints.
```
并在该列表（protocol/runtime/soul-authoring/testing 各行之后）追加一行：
```markdown
- worker-control-protocol owns the transport-agnostic Host↔Worker control contract.
```

c) 把 `## Destructive Migration Rules` 段的有序列表替换为新 10 步（与门短语逐字一致）：

```markdown
Contract and guardrails come first:

1. Promote canonical docs and doc gates to worker autonomy.
2. Add red inversion guards (G1-G6).
3. Create target package skeletons: worker-control-protocol, host-control, apps/host-cli, apps/host-web.
4. Rename host-runtime to worker-runtime, host-daemon to worker-daemon, apps/cli to worker-cli, apps/web to worker-web.
5. Carve the host/worker split points into worker-runtime and host-control.
6. Implement the minimal Host↔Worker control contract.
7. Wire host-web management mount of the Worker configuration micro-app.
8. Make the Worker standalone golden path pass with Host absent.
9. Delete old authority and old names.
10. Update roadmap and memory.
```
（保留段尾 `Do not modify the new architecture to satisfy old E2E assumptions. Legacy\napp-local adapter exports are removed, not migrated.`。）

- [ ] **Step 4: 跑门确认通过**

Run: `bun run docs:check && bun test tests/architecture/refactor-contract.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add docs/architecture.md scripts/check-doc-contract.ts
git commit -m "docs(architecture): Runtime Boundary/Coverage Index/Migration Rules 倒置"
```

---

## Task 7：AGENTS.md — Product/Runtime/Monorepo/Protocol Boundary 倒置（守 90 行）

**Files:**
- Modify: `AGENTS.md`
- Modify: `scripts/check-doc-contract.ts`（`requireIncludes('AGENTS.md', [...])`）
- Modify: `tests/architecture/refactor-contract.test.ts`（`'AGENTS.md is a short bootstrap...'` 测试）

- [ ] **Step 1: 改门（变红）** —

a) 在 `requireIncludes('AGENTS.md', [...])`：
删除
```ts
'Host is shell / locator / mount / bridge',
'Host is shell / locator / mount / bridge。',
'AIWorker -> Soul App -> workspace locator -> session -> app-owned work',
'Native engine 采用 B+ structured bridge。AIWorker 管 projection、process observation、redacted raw chunks、normalized bridge events、opaque external refs、cancel、reattach、reconciler；native engine 自己管理模型、tool loop、approval、sandbox、auth/profile 和 native session。',
'禁止创建 `core-v2` / `shared-v2`。`packages/core` 与 `packages/shared` 最终消失。`apps/api` 迁移为 `packages/host-daemon`。',
```
新增
```ts
'Worker 是自治 CLI-first 运行体，拥有 engine 启动权；Host 是可选控制面：分发 / 管理 / 权限分配 / connector 授权，并 mount worker 配置 micro-app。',
'Worker -> Soul App -> workspace locator -> session -> app-owned work',
'Worker 管 projection、process observation、redacted raw chunks、normalized bridge events、opaque external refs、cancel、reattach、reconciler、engine 启动；native engine 自己管理模型、tool loop、approval、sandbox、auth/profile 和 native session。',
'禁止创建 `core-v2` / `shared-v2`。`packages/core` 与 `packages/shared` 最终消失。`apps/api` 迁移为 `packages/worker-daemon`。',
'`worker-*` 包禁止 import `host-*` 包。Worker 必须能脱离 Host 独立运行。',
```
保留 `'CLI-first'`、`'descriptor-only'`、`'POST /api/sessions/:sessionId/invocations'`、`'Production mounted workbench 必须使用 micro-app `router-mode="search"`'`、`'Session 只保留 lifecycle：`active | archived | deleted`...'`、`'Host/Soul 是 descriptor-only：...'`。

b) 在 `refactor-contract.test.ts` 的 `'AGENTS.md is a short bootstrap and does not preserve old authority'` 测试：
删除 `expect(agents).toContain('Host is shell / locator / mount / bridge')`；
新增 `expect(agents).toContain('Worker 是自治 CLI-first 运行体，拥有 engine 启动权；Host 是可选控制面')`；
保留 `lineCount <= 90` 与其余 `not.toContain` 断言。

- [ ] **Step 2: 跑门确认失败**

Run: `bun run docs:check`
Expected: FAIL

- [ ] **Step 3: 改文档（转绿）** — 编辑 `AGENTS.md`：

将 `## Product Boundary` 段从 `Host is shell / locator / mount / bridge。` 起替换为：

```markdown
Worker 是自治 CLI-first 运行体，拥有 engine 启动权；Host 是可选控制面：分发 / 管理 / 权限分配 / connector 授权，并 mount worker 配置 micro-app。

AIWorker 是 worker-centric local product。默认路径：

```text
Worker -> Soul App -> workspace locator -> session -> app-owned work
Host -> distribute / manage / authorize / connector -> mount worker config micro-app
```

Worker 启动本地壳、定位 workspace/session、serve 员工 web、拥有 projection 与 engine bridge、启动并观察 native engine、暴露控制面。Host 分发、管理、分配权限、授权 connector，并 mount worker 配置 micro-app 来配置它。Host 不 spawn/观察/持有 engine 进程，也不是领域工作流、产品后端、通用 agent runtime、仓库 dashboard 或 Soul App 配置中心。
```

将 `## Monorepo Boundary` 段的 `禁止创建...apps/api 迁移为 packages/host-daemon。` 改为 `packages/worker-daemon。`，并追加一行 `` `worker-*` 包禁止 import `host-*` 包。Worker 必须能脱离 Host 独立运行。``。

将 `## Runtime Boundary` 段的 `Native engine 采用 B+ structured bridge。AIWorker 管 ...` 改为 `Native engine 采用 B+ structured bridge。Worker 管 projection、process observation、redacted raw chunks、normalized bridge events、opaque external refs、cancel、reattach、reconciler、engine 启动；native engine 自己管理模型、tool loop、approval、sandbox、auth/profile 和 native session。`。

> 守约：编辑后 `AGENTS.md` 必须 ≤ 90 行。删旧增新时若超行，压缩措辞但保留所有门要求短语。

- [ ] **Step 4: 跑门确认通过**

Run: `bun run docs:check && bun test tests/architecture/refactor-contract.test.ts`
Expected: PASS（含 `requireMaxLines('AGENTS.md', 90)` 与 `lineCount <= 90`）

- [ ] **Step 5: commit**

```bash
git add AGENTS.md scripts/check-doc-contract.ts tests/architecture/refactor-contract.test.ts
git commit -m "docs(agents): Boundary 倒置为 Worker 自治 + Host 控制面"
```

---

## Task 8：runtime.md — Local Daemon / Engine Bridge / Projection 归属翻转

**Files:**
- Modify: `docs/runtime.md`
- Modify: `scripts/check-doc-contract.ts`（`requireIncludes('docs/runtime.md', [...])`）
- Modify: `tests/architecture/refactor-contract.test.ts`（`'runtime doc promotes projection, assets CRUD, and bridge hard rules'` 的**doc 正文断言**部分）

- [ ] **Step 1: 改门（变红）** —

a) 在 `requireIncludes('docs/runtime.md', [...])`：
删除
```ts
'`packages/host-daemon` owns the local broker API used by CLI, Web, and mounted\nSoul Apps. It forwards orchestration to `packages/host-runtime`.',
'Host orchestrates projection; engine-projection executes projection; SDK and protocol define projection inputs.',
'Host runtime calls it\nbecause Host owns worker, workspace locator, session, selected engine, worker\nconfiguration, and filesystem root facts.',
'- CLI, Web, or app-owned UI requests an SDK-standard worker configuration\n  action.\n- Host validates and stores worker-scoped overlay records.\n- Worker-scoped overlay records live in Host metadata; projected file contents do not.\n- `engine-projection` materializes descriptor assets plus overlays for one\n  selected engine target.\n- Projection writes a receipt for cleanup, freshness, and diagnostics.',
```
新增
```ts
'`packages/worker-daemon` owns the local broker API used by the Worker CLI, the\nWorker web, and mounted Soul Apps. It forwards orchestration to\n`packages/worker-runtime`.',
'Worker orchestrates projection; engine-projection executes projection; SDK and protocol define projection inputs.',
'Worker runtime calls it\nbecause the Worker owns workspace locator, session, selected engine, worker\nconfiguration, and filesystem root facts.',
'- The Worker CLI, the Worker web, or app-owned UI requests an SDK-standard worker\n  configuration action.\n- The Worker validates and stores worker-scoped overlay records.\n- Worker-scoped overlay records live in Worker metadata; projected file contents do not.\n- `engine-projection` materializes descriptor assets plus overlays for one\n  selected engine target.\n- Projection writes a receipt for cleanup, freshness, and diagnostics.',
```
保留 engine-bridge 列表、Native engines own 列表、failure codes、bridge event classes、secrets 段（这些归属未变，仍由 worker 侧 engine-bridge 拥有，文字不变）。

b) 在 `refactor-contract.test.ts` 的 `'runtime doc promotes projection, assets CRUD, and bridge hard rules'` 测试中，把 doc 正文断言：
`expect(runtime).toContain('Host orchestrates projection; engine-projection executes projection; SDK and protocol define projection inputs.')`
改为
`expect(runtime).toContain('Worker orchestrates projection; engine-projection executes projection; SDK and protocol define projection inputs.')`
并把
`expect(runtime).toContain('Worker-scoped overlay records live in Host metadata; projected file contents do not.')`
改为
`expect(runtime).toContain('Worker-scoped overlay records live in Worker metadata; projected file contents do not.')`
> 该测试其余部分读取 `packages/host-runtime/src/worker/runtime.test.ts` 等现存代码文件，**保持不变**（Plan 2/4 再翻）。

- [ ] **Step 2: 跑门确认失败**

Run: `bun run docs:check`
Expected: FAIL

- [ ] **Step 3: 改文档（转绿）** — 编辑 `docs/runtime.md`：

`## Local Daemon` 段替换为：
```markdown
## Local Daemon

`packages/worker-daemon` owns the local broker API used by the Worker CLI, the
Worker web, and mounted Soul Apps. It forwards orchestration to
`packages/worker-runtime`.

The daemon is not a product backend and does not own domain routes.
```

`## Projection` 段中两句：
`Host orchestrates projection; engine-projection executes projection; SDK and protocol define projection inputs.` → `Worker orchestrates projection; engine-projection executes projection; SDK and protocol define projection inputs.`；
`Host runtime calls it because Host owns worker, workspace locator, session, selected engine, worker configuration, and filesystem root facts.` → `Worker runtime calls it because the Worker owns workspace locator, session, selected engine, worker configuration, and filesystem root facts.`

`## Runtime skills, MCP, and entry-file CRUD` 段的项目符号列表中：把 `Host validates and stores` → `The Worker validates and stores`；`CLI, Web, or app-owned UI` → `The Worker CLI, the Worker web, or app-owned UI`；`live in Host metadata` → `live in Worker metadata`。

- [ ] **Step 4: 跑门确认通过**

Run: `bun run docs:check && bun test tests/architecture/refactor-contract.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add docs/runtime.md scripts/check-doc-contract.ts tests/architecture/refactor-contract.test.ts
git commit -m "docs(runtime): Local Daemon/Projection 归属翻转到 Worker"
```

---

## Task 9：runtime.md — BYOK 偏差 re-home 到 worker-runtime

**Files:**
- Modify: `docs/runtime.md`（`## Accepted Execution-Mode Deviation` 段）

> 该段不在 `check-doc-contract.ts` 的 requireIncludes 里（门未钉死其逐字），故只改文档即可；但仍跑门确保不踩其它断言。

- [ ] **Step 1: 改文档** — 把 `## Accepted Execution-Mode Deviation` 段中 `byok` 描述里的归属从 host-runtime 改为 worker-runtime，并降级偏差性质。关键句改写：

将 `When no native engine CLI is\ninstalled, `byok` is the fallback execution mode and `packages/host-runtime`\nissues an OpenAI-compatible `chat/completions` request directly so a worker\nwithout a native engine can still run. This deviates from native-engine\nmodel-call ownership ...`
改为：
```markdown
When no native engine CLI is
installed, `byok` is the fallback execution mode and `packages/worker-runtime`
issues an OpenAI-compatible `chat/completions` request directly so a Worker
without a native engine can still run. This is a worker-internal non-native-engine
fallback, not a Host-owned model call: it deviates from native-engine model-call
ownership ...
```
并把段尾 `This\ndeviation must not be cited to justify any new Host-owned model call ...` 改为 `This deviation must not be cited to justify any Host-owned model call or any engine-secret persistence on either plane.`

- [ ] **Step 2: 跑门确认通过**

Run: `bun run docs:check && bun test tests/architecture/refactor-contract.test.ts`
Expected: PASS

- [ ] **Step 3: commit**

```bash
git add docs/runtime.md
git commit -m "docs(runtime): BYOK 偏差 re-home 到 worker-runtime 并降级性质"
```

---

## Task 10：protocol.md — 追加 Host↔Worker 控制契约段（additive）

**Files:**
- Modify: `docs/protocol.md`（文末追加一节）
- Modify: `scripts/check-doc-contract.ts`（`requireIncludes('docs/protocol.md', [...])` 新增标题与短语）

> 纯追加，不动现有 descriptor-only / broker routes 短语，故不破坏现有断言。

- [ ] **Step 1: 改门（变红）** — 在 `requireIncludes('docs/protocol.md', [...])` 新增：
```ts
'## Host-to-Worker Control Contract',
'`packages/worker-control-protocol` defines a transport-agnostic control contract.',
'worker.describe, worker.health, worker.lifecycle, and a worker.assignment envelope',
'The Worker is the passive control server; Host is the client.',
'The mounted configuration micro-app is the only current transport; non-web\ntransports are reserved.',
'The control contract must not carry session, invocation, projection, engine, or\ndomain data.',
```

- [ ] **Step 2: 跑门确认失败**

Run: `bun run docs:check`
Expected: FAIL

- [ ] **Step 3: 改文档（转绿）** — 在 `docs/protocol.md` 文末追加：

```markdown
## Host-to-Worker Control Contract

`packages/worker-control-protocol` defines a transport-agnostic control contract.
It covers worker.describe, worker.health, worker.lifecycle, and a worker.assignment
envelope. The Worker is the passive control server; Host is the client. A Worker
never initiates a connection to Host.

The mounted configuration micro-app is the only current transport; non-web
transports are reserved. The control contract must not carry session, invocation,
projection, engine, or domain data. The assignment envelope carries authorized
connectors, permissions, and an engine/gateway profile ref by shape and version
only; connector behavior is out of contract scope.
```

- [ ] **Step 4: 跑门确认通过**

Run: `bun run docs:check`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add docs/protocol.md scripts/check-doc-contract.ts
git commit -m "docs(protocol): 追加 Host↔Worker 控制契约段"
```

---

## Task 11：testing.md — Coverage Ledger 加 C1–C6/G1–G6，Required Test Areas 加 inversion-guards

**Files:**
- Modify: `docs/testing.md`（`## Required Test Areas` 架构测试块 + `## Canonical Coverage Ledger` 表）
- Modify: `scripts/check-doc-contract.ts`（`requireIncludes('docs/testing.md', [...])` 新增）

> `refactor-contract.test.ts` 的 `documentedTestingPaths()` 会扫描 testing.md 代码块里的 `*.test.ts` 路径并断言其存在；故新增的 `tests/architecture/inversion-guards.test.ts` 必须在 Task 1 已创建（已建）。

- [ ] **Step 1: 改门（变红）** — 在 `requireIncludes('docs/testing.md', [...])` 新增：
```ts
'## Worker Autonomy Inversion Guards',
'tests/architecture/inversion-guards.test.ts',
'C1 worker runs standalone with Host absent',
'C2 engine launch lives only in worker-*',
'C3 host-control owns no runtime/domain/secret state',
'C5 only Host->Worker surface is worker-control-protocol',
```

- [ ] **Step 2: 跑门确认失败**

Run: `bun run docs:check`
Expected: FAIL

- [ ] **Step 3: 改文档（转绿）** —

a) 在 `## Required Test Areas` 的「Architecture tests」代码块中加入新文件：
```text
tests/architecture/
  forbidden-host-domain-schema.test.ts
  freeform-mounted-workbench-contract.test.ts
  freeform-soul-contract.test.ts
  inversion-guards.test.ts
  package-ownership.test.ts
  refactor-contract.test.ts
```

b) 在 `## Canonical Coverage Ledger` 表后**新增一节**：
```markdown
## Worker Autonomy Inversion Guards

The worker-autonomy inversion is guarded by `tests/architecture/inversion-guards.test.ts`:

- C1 worker runs standalone with Host absent — G1 (Worker standalone golden path).
- C2 engine launch lives only in worker-* — G2.
- C3 host-control owns no runtime/domain/secret state — G4.
- C4 Soul = Template definition; Worker is its instance — covered by package/doc gates.
- C5 only Host->Worker surface is worker-control-protocol — G5.
- C6 secret redaction holds on both planes — G6.

Guards whose code lands in later inversion plans start as `test.todo` and are
promoted to real assertions when that plan lands.
```

- [ ] **Step 4: 跑门确认通过**

Run: `bun run docs:check && bun test tests/architecture/refactor-contract.test.ts`
Expected: PASS（`documentedTestingPaths()` 找到 inversion-guards.test.ts 且其存在）

- [ ] **Step 5: commit**

```bash
git add docs/testing.md scripts/check-doc-contract.ts
git commit -m "docs(testing): 加 Worker Autonomy Inversion Guards 与 C1–C6 映射"
```

---

## Task 12：inversion-guards.test.ts — G1–G6 脚手架（可证的真断言 + 依赖后续阶段的 todo）

**Files:**
- Modify: `tests/architecture/inversion-guards.test.ts`（在 Task 1 基础上补 G1–G6）

- [ ] **Step 1: 写 guard（部分真、部分 todo）** — 把 `tests/architecture/inversion-guards.test.ts` 追加为：

```ts
// G6 ↔ C6：secret 边界文档双面覆盖（现在可证：文档已写）
test('G6: docs forbid engine-secret persistence on both planes', () => {
  const runtime = read('docs/runtime.md')
  expect(runtime).toContain('any engine-secret persistence on either plane')
})

// G2 ↔ C2：engine 启动只在 worker-*。rename 落地前（Plan 2/4）目录还是 host-*，故 todo。
test.todo('G2: engine launch symbols are imported only by worker-* packages')

// G3 ↔ D6：worker-* 不得 import host-*。新包/rename 落地后可证（Plan 2/4）。
test.todo('G3: worker-* packages never depend on host-* packages')

// G4 ↔ C3：host-control 无 runtime/domain/secret 归属。host-control 建包后（Plan 3）可证。
test.todo('G4: host-control exposes no session/invocation/projection/engine/domain/secret ownership')

// G5 ↔ C5：唯一 Host→Worker 面是 worker-control-protocol（今经 micro-app 载体）。Plan 3 可证。
test.todo('G5: the only Host->Worker contract is worker-control-protocol')

// G1 ↔ C1：worker standalone 金路径，Host 缺席全通。Plan 5 真证；此处先文档锚点。
test.todo('G1: worker standalone golden path passes with Host absent')
```

> 说明：`bun:test` 支持 `test.todo(name)`，计为 pending、不算失败，suite 保持绿；各后续 plan 把对应 `test.todo` 升级为真断言并使其通过。

- [ ] **Step 2: 跑测试确认通过（含 todo 为 pending）**

Run: `bun test tests/architecture/inversion-guards.test.ts`
Expected: PASS（G0、G6 通过；G1–G5 为 todo/pending，不失败）

- [ ] **Step 3: commit**

```bash
git add tests/architecture/inversion-guards.test.ts
git commit -m "test(contract): G1–G6 倒置 guard 脚手架（G0/G6 真断言，余 todo）"
```

---

## Task 13：Plan 1 全门校验 + 更新 memory + 收尾

**Files:**
- 校验：全部已改文件
- Modify（memory，提示路径）：`/home/ben/.claude/projects/-home-ben-projects-aiworker/memory/refactor-state-2026-05.md` 与 `MEMORY.md`

- [ ] **Step 1: 跑 Plan 1 全门**

Run: `bun run docs:check && bun run test:contracts`
Expected: PASS（两道门全绿；`inversion-guards.test.ts` 的 todo 计 pending）

- [ ] **Step 2: 跑更广校验确认无误伤**

Run: `bun run typecheck`
Expected: PASS（本 plan 未动运行时代码，typecheck 应不受影响）

> 若 `package-ownership.test.ts` 仍绿（它断言现存 host-runtime 等），说明边界遵守正确：本 plan 未碰结构门。

- [ ] **Step 3: 更新 memory（标记 v1-done 被本阶段取代）** — 编辑 `refactor-state-2026-05.md`，在正文追加一行：`2026-05-30：开启 worker-autonomy engine-launch 倒置重构（5-plan 系列），取代「Freeform v1 done = refactor done」终态；Plan 1（权威重写）已落地，文档/doc-gate 已翻转为 Worker 自治 + Host 控制面。` 并在 `MEMORY.md` 对应行末追加 `；2026-05-30 起进入 worker-autonomy 倒置（见 spec/plan）`。

- [ ] **Step 4: commit memory**

```bash
git add /home/ben/.claude/projects/-home-ben-projects-aiworker/memory/refactor-state-2026-05.md /home/ben/.claude/projects/-home-ben-projects-aiworker/memory/MEMORY.md
git commit -m "chore(memory): 记录 worker-autonomy 倒置 Plan 1 落地"
```

> 注：memory 文件在仓库外（`~/.claude/...`），若不在 git 仓库内则跳过 commit，仅写文件。

---

## Self-Review 检查（执行者完成全部 task 后自检）

1. **Spec 覆盖**：本 plan 对应 spec §8 文档清单的 architecture/runtime/protocol/testing/AGENTS 五项 + §10 的 G1–G6 脚手架 + §5 C1–C6 写入文档。connectors/delivery/隔离 driver/gateway 实现属 roadmap，不在本 plan。
2. **边界遵守**：确认未改 `package-ownership.test.ts` 与 `refactor-contract.test.ts` 中读取现存代码文件的结构断言；未改任何 `packages/`/`apps/`/`souls/` 代码。
3. **门一致性**：每改一处文档正文短语，`check-doc-contract.ts` 与（如涉及）`refactor-contract.test.ts` 的对应断言均同步更新；`docs:check` 与 `test:contracts` 全绿。
4. **行数约束**：`AGENTS.md` ≤ 90 行。
5. **下一步**：Plan 2（机械 rename）就绪后另行编写，届时把 `package-ownership.test.ts` 与结构断言翻到 worker-*，并升级 G2/G3 todo。
</content>
