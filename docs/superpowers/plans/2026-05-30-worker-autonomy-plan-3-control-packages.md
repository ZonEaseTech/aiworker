# Worker 自治倒置 · Plan 3：新包 + 最小 Host↔Worker 控制契约 + G5 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 或 executing-plans 逐 task 执行。步骤用 `- [ ]`。**执行隔离要求**：在隔离 git worktree 内执行（从 `codex/aiworker-refactor-dev-loop` tip 70dd9f7e 分叉），隔离树内跑 `bun run typecheck && bun run test:contracts && bun run lint` 验证后再合回。

**Goal:** 建立 4 个新包/app 骨架（`packages/worker-control-protocol`、`packages/host-control`、`apps/host-cli`、`apps/host-web`）与**最小 Host↔Worker 控制契约**，把 worker-daemon 升级为该契约的被动 server，并把 G5 从 `test.todo` 提升为真断言。

**Architecture:** 5-plan 系列第 3 阶段。Plan 1 已把文档/门翻为 Worker 自治、并在 architecture.md monorepo 树里**预先列出**这 4 个目标包（文档先行）；Plan 2 已 rename。本 plan 让这 4 个包从文档走向**真实骨架 + 最小契约**，但**不做 carve**（host/ 逻辑搬进 host-control 留给 Plan 4），也不做 standalone 金路径（Plan 5）。

**Tech Stack:** Bun workspaces、TypeScript、zod（schema，沿用 soul-protocol 模式）、worker-daemon 的 HTTP 路由、soul-workbench micro-app mount。

**门命令：** `bun run typecheck`、`bun run test:contracts`、`bun run lint`。

**依据：** spec `…-worker-autonomy-engine-launch-inversion-design.md` §6（包结构）、§7（控制契约：worker.describe/health/lifecycle/assignment，transport-agnostic，micro-app 为当前唯一载体，非 web transport 预留）、§10（G5）。

---

## 已定设计决策（执行者遵守）

1. **worker-control-protocol = 纯契约**：只定义 verb 的类型与 zod schema（`worker.describe` / `worker.health` / `worker.lifecycle` / `worker.assignment`），**类型里不得出现任何 transport（HTTP/URL/micro-app）字段**。模板仿 `packages/soul-protocol`（package.json exports "." → src/index.ts，scripts typecheck/test）。
2. **worker = 被动 server，Host = client**：worker-daemon 暴露契约 verb 的端点（worker 自己的控制面，**今由 mounted 配置 micro-app 消费**）；host-control 持有 registry/assignment，对 worker 的直接调用通道**预留**（非 web transport，本 plan 不实现直连 client，只留 seam）。
3. **host-control = 控制面最小骨架**：worker registry（id/identity/endpoint/health）+ assignment 记录（template/soul、connectors[]、permissions[]、gateway profile ref；信封形状+版本，**不实现 connector 行为**），消费 worker-control-protocol 校验 assignment 信封。**不在本 plan 做 carve**（不从 worker-runtime/src/host 搬逻辑）。
4. **apps/host-cli**（bin `aiworker-host`，仿 apps/worker-cli 的 bin 结构）：最小命令 `aiworker-host worker list`（读 host-control registry）。
5. **apps/host-web**（仿 apps/worker-web 的 vite 结构）：最小控制面 web 骨架 + management-mount 占位（复用 soul-workbench micro-app `router-mode="search"` 挂 worker 配置 micro-app）。**UI 用 packages/ui shadcn 原语**（遵 AGENTS.md UI 约束）。
6. **G5/G3 提升**：本 plan 让 `host-control` 存在后，把 inversion-guards 的 G5（唯一 Host→Worker 契约是 worker-control-protocol）与 G3（worker-* 不得 import host-*）从 `test.todo` 升为真断言。G2/G4 仍 todo（依赖 Plan 4 carve）。
7. **bun workspaces**：root package.json 的 `workspaces` 已 glob `apps/*`/`packages/*`，新包自动纳入；建包后 `bun install` 重链。

## 边界

- ✅ 建 4 个新包/app + 改 worker-daemon（加控制端点）+ 改 worker-control-protocol/host-control + 升 inversion-guards G5/G3 + 更新 package-ownership.test.ts/testing.md。
- ❌ 不 carve worker-runtime/src/host（Plan 4）；不动 engine 启动/session/projection 逻辑；不实现 connector 行为；不实现 host-control→worker 直连 client（预留）。

---

## Task 1：worker-control-protocol 包骨架 + 契约 schema

**Files:**
- Create: `packages/worker-control-protocol/package.json`、`tsconfig.json`、`src/index.ts`、`src/index.test.ts`

- [ ] **Step 1: 写失败测试** — `packages/worker-control-protocol/src/index.test.ts`：

```ts
import { describe, expect, test } from 'bun:test'
import {
  parseWorkerAssignmentEnvelope,
  parseWorkerDescribe,
  WORKER_CONTROL_PROTOCOL_VERSION,
} from './index'

describe('worker-control-protocol contract', () => {
  test('describe accepts a valid worker self-description', () => {
    const ok = parseWorkerDescribe({
      workerId: 'w1',
      soulId: 'freeform',
      version: '0.1.0',
      health: { ready: true },
      configMicroAppEntry: '/api/mount/workbench',
    })
    expect(ok.soulId).toBe('freeform')
  })

  test('assignment envelope is shape+version only, no connector behavior', () => {
    const env = parseWorkerAssignmentEnvelope({
      version: WORKER_CONTROL_PROTOCOL_VERSION,
      templateId: 'freeform',
      connectors: [{ id: 'enterprise-kb', authorized: true }],
      permissions: ['read'],
      gatewayProfileRef: 'env:OPENAI_API_KEY',
    })
    expect(env.templateId).toBe('freeform')
  })

  test('rejects assignment envelope carrying domain/session/secret data', () => {
    expect(() => parseWorkerAssignmentEnvelope({
      version: WORKER_CONTROL_PROTOCOL_VERSION,
      templateId: 'freeform',
      connectors: [],
      permissions: [],
      gatewayProfileRef: 'env:X',
      sessionId: 'leak', // 非契约字段
    } as never)).toThrow()
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — Run: `bun test packages/worker-control-protocol/src/index.test.ts` — Expected: FAIL（模块不存在）。

- [ ] **Step 3: 建 package.json**（仿 soul-protocol）：
```json
{
  "name": "@zonease/aiworker-worker-control-protocol",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "scripts": { "typecheck": "tsc --noEmit", "test": "bun test" },
  "dependencies": { "zod": "^3.23.0" },
  "devDependencies": { "typescript": "^5.9.3" }
}
```
> zod 版本对齐仓库现有版本：先 `grep '"zod"' packages/soul-protocol/package.json packages/*/package.json | head -1` 取实际版本填入。

- [ ] **Step 4: 建 tsconfig.json**（复制 `packages/soul-protocol/tsconfig.json` 内容，路径相对不变即可）。

- [ ] **Step 5: 建 src/index.ts** — transport-agnostic 契约：
```ts
import { z } from 'zod'

export const WORKER_CONTROL_PROTOCOL_VERSION = 1 as const

export const workerHealthSchema = z.object({
  ready: z.boolean(),
  detail: z.string().optional(),
}).strict()

export const workerDescribeSchema = z.object({
  workerId: z.string().min(1),
  soulId: z.string().min(1),
  version: z.string().min(1),
  health: workerHealthSchema,
  // 配置 micro-app entry：host-web 据此 mount（载体 = micro-app；契约不绑定 transport 细节，仅给出 entry 引用）
  configMicroAppEntry: z.string().min(1),
}).strict()

export const workerLifecycleSchema = z.object({
  workerId: z.string().min(1),
  action: z.enum(['stop', 'decommission']),
}).strict()

export const workerAssignmentEnvelopeSchema = z.object({
  version: z.literal(WORKER_CONTROL_PROTOCOL_VERSION),
  templateId: z.string().min(1),
  connectors: z.array(z.object({ id: z.string().min(1), authorized: z.boolean() }).strict()),
  permissions: z.array(z.string()),
  gatewayProfileRef: z.string().min(1),
}).strict()

export type WorkerDescribe = z.infer<typeof workerDescribeSchema>
export type WorkerLifecycle = z.infer<typeof workerLifecycleSchema>
export type WorkerAssignmentEnvelope = z.infer<typeof workerAssignmentEnvelopeSchema>

export function parseWorkerDescribe(input: unknown): WorkerDescribe {
  return workerDescribeSchema.parse(input)
}
export function parseWorkerLifecycle(input: unknown): WorkerLifecycle {
  return workerLifecycleSchema.parse(input)
}
export function parseWorkerAssignmentEnvelope(input: unknown): WorkerAssignmentEnvelope {
  return workerAssignmentEnvelopeSchema.parse(input)
}
```
> `.strict()` 确保 assignment 拒绝 sessionId 等非契约字段（呼应 C5：契约不得携带 session/invocation/projection/engine/domain 数据）。

- [ ] **Step 6: bun install + 跑测试确认通过**
Run: `bun install && bun test packages/worker-control-protocol/src/index.test.ts`
Expected: PASS。

- [ ] **Step 7: commit**
```bash
git add packages/worker-control-protocol bun.lock
git commit -m "feat(worker-control-protocol): 最小 transport-agnostic Host↔Worker 控制契约"
```

---

## Task 2：host-control 包骨架（registry + assignment store）

**Files:**
- Create: `packages/host-control/{package.json,tsconfig.json,src/index.ts,src/registry.test.ts}`

- [ ] **Step 1: 写失败测试** — `packages/host-control/src/registry.test.ts`：
```ts
import { describe, expect, test } from 'bun:test'
import { createWorkerRegistry } from './index'

describe('host-control worker registry', () => {
  test('registers and lists workers', () => {
    const reg = createWorkerRegistry()
    reg.register({ workerId: 'w1', soulId: 'freeform', endpoint: 'http://127.0.0.1:9217', health: { ready: true } })
    expect(reg.list().map(w => w.workerId)).toEqual(['w1'])
    expect(reg.get('w1')?.soulId).toBe('freeform')
  })

  test('stores an assignment envelope validated by the control protocol', () => {
    const reg = createWorkerRegistry()
    reg.register({ workerId: 'w1', soulId: 'freeform', endpoint: 'http://x', health: { ready: true } })
    reg.assign('w1', {
      version: 1,
      templateId: 'freeform',
      connectors: [],
      permissions: ['read'],
      gatewayProfileRef: 'env:OPENAI_API_KEY',
    })
    expect(reg.get('w1')?.assignment?.templateId).toBe('freeform')
  })

  test('rejects an assignment that violates the control protocol', () => {
    const reg = createWorkerRegistry()
    reg.register({ workerId: 'w1', soulId: 'freeform', endpoint: 'http://x', health: { ready: true } })
    expect(() => reg.assign('w1', { version: 1, templateId: '', connectors: [], permissions: [], gatewayProfileRef: 'env:X' })).toThrow()
  })
})
```

- [ ] **Step 2: 跑确认失败** — `bun test packages/host-control/src/registry.test.ts` → FAIL。

- [ ] **Step 3: package.json**：
```json
{
  "name": "@zonease/aiworker-host-control",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "scripts": { "typecheck": "tsc --noEmit", "test": "bun test" },
  "dependencies": { "@zonease/aiworker-worker-control-protocol": "workspace:*" },
  "devDependencies": { "typescript": "^5.9.3" }
}
```

- [ ] **Step 4: tsconfig.json**（复制 soul-protocol 的）。

- [ ] **Step 5: src/index.ts**：
```ts
import type { WorkerAssignmentEnvelope } from '@zonease/aiworker-worker-control-protocol'
import { parseWorkerAssignmentEnvelope } from '@zonease/aiworker-worker-control-protocol'

export interface WorkerRegistryEntry {
  workerId: string
  soulId: string
  endpoint: string
  health: { ready: boolean, detail?: string }
  assignment?: WorkerAssignmentEnvelope
}

export interface WorkerRegistry {
  register: (entry: Omit<WorkerRegistryEntry, 'assignment'>) => void
  list: () => WorkerRegistryEntry[]
  get: (workerId: string) => WorkerRegistryEntry | undefined
  assign: (workerId: string, envelope: unknown) => void
}

export function createWorkerRegistry(): WorkerRegistry {
  const entries = new Map<string, WorkerRegistryEntry>()
  return {
    register(entry) { entries.set(entry.workerId, { ...entry }) },
    list() { return [...entries.values()] },
    get(workerId) { return entries.get(workerId) },
    assign(workerId, envelope) {
      const entry = entries.get(workerId)
      if (!entry)
        throw new Error(`unknown worker: ${workerId}`)
      entry.assignment = parseWorkerAssignmentEnvelope(envelope)
    },
  }
}
```
> v1 用内存 registry（持久化留给 roadmap）。host-control 只 import worker-control-protocol，**不 import 任何 worker-\* 包**（满足 G3/C3）。

- [ ] **Step 6: bun install + 测试通过** — `bun install && bun test packages/host-control/src/registry.test.ts` → PASS。
- [ ] **Step 7: commit**
```bash
git add packages/host-control bun.lock
git commit -m "feat(host-control): worker registry + assignment 信封存储骨架"
```

---

## Task 3：worker-daemon 暴露控制契约 server 面

**Files:**
- Modify: `packages/worker-daemon/package.json`（加 dep worker-control-protocol）、`packages/worker-daemon/src/modes/worker.ts`（注册控制端点）
- Create: `packages/worker-daemon/src/modes/worker/control.test.ts`

- [ ] **Step 1: 写失败测试** — `control.test.ts`：起 worker-daemon（仿 `worker.local.test.ts` 的 app 启动方式，先读该文件 30 行学其测试夹具），断言：
  - `GET /api/control/worker` 返回符合 `workerDescribeSchema` 的自描述（含 configMicroAppEntry）。
  - `GET /api/control/health` 返回 `{ ready: true }`。
  - `PUT /api/control/assignment` 接受合法 assignment 信封（用 worker-control-protocol 校验），拒绝带 `sessionId` 的非法信封（400）。
  - `POST /api/control/lifecycle` 接受 `{action:'stop'}`。
  （断言用 worker-control-protocol 的 parse 函数验证响应/请求形状。）

- [ ] **Step 2: 跑确认失败**（端点未注册 → 404）。

- [ ] **Step 3: 实现** —
  - `packages/worker-daemon/package.json` deps 加 `"@zonease/aiworker-worker-control-protocol": "workspace:*"`（保持 deps 键字母序，避免 lint sort-keys）。
  - `worker.ts` 注册 4 个端点：`GET /api/control/worker`、`GET /api/control/health`、`PUT /api/control/assignment`、`POST /api/control/lifecycle`。describe 从现有 worker/soul 元数据组装；assignment/lifecycle 用 `parseWorkerAssignmentEnvelope`/`parseWorkerLifecycle` 校验请求体，校验失败回 400（复用现有 error-handler 中间件）。**这些端点只读/接收控制信封，不得触碰 session/invocation/projection/engine 逻辑**（C5）。
  - import 顺序按 perfectionist/sort-imports（worker-control-protocol 在 soul-protocol 之后、worker-runtime 之前按字母序）。

- [ ] **Step 4: 跑测试通过** — `bun install && bun test packages/worker-daemon/src/modes/worker/control.test.ts`。
- [ ] **Step 5: typecheck + lint** — `bun run --filter '@zonease/aiworker-worker-daemon' typecheck && bunx eslint packages/worker-daemon`。
- [ ] **Step 6: commit**
```bash
git add packages/worker-daemon bun.lock
git commit -m "feat(worker-daemon): 暴露 worker.describe/health/lifecycle/assignment 控制契约端点"
```

---

## Task 4：apps/host-cli 骨架（bin aiworker-host）

**Files:**
- Create: `apps/host-cli/{package.json,tsconfig.json,src/aiworker-host.ts,src/aiworker-host.test.ts}`

- [ ] **Step 1: 写失败测试** — `aiworker-host.test.ts`：调用 `runHostCli(['worker','list'])`（仿 apps/worker-cli/src/aiworker.test.ts 的 runCli 模式），喂一个内存 registry（含 1 个 worker），断言 stdout JSON 含该 workerId。

- [ ] **Step 2: 跑确认失败**。

- [ ] **Step 3: 实现** —
  - `package.json`：`name` `@zonease/aiworker-host-cli`，`bin: { "aiworker-host": "./dist/aiworker-host.js" }`，deps `@zonease/aiworker-host-control`，scripts typecheck/test（仿 apps/worker-cli/package.json 精简版）。
  - `tsconfig.json`（复制 apps/worker-cli/tsconfig.json）。
  - `src/aiworker-host.ts`：导出 `runHostCli(argv, deps?)`，实现 `worker list` 子命令（从注入的 host-control registry 读取并打印 JSON）；`if (import.meta.main) process.exit(await runHostCli(process.argv.slice(2)))`。
  - **eslint**：`apps/host-cli/**` 也是 CLI top-level await——在 eslint.config.ts 把现有 `apps/worker-cli/**` 的 `antfu/no-top-level-await: off` override 的 files 扩展为 `['apps/worker-cli/**/*.ts','apps/host-cli/**/*.ts']`。

- [ ] **Step 4: 测试 + typecheck + lint 通过**。
- [ ] **Step 5: commit**
```bash
git add apps/host-cli eslint.config.ts bun.lock
git commit -m "feat(host-cli): aiworker-host 控制面 CLI 骨架（worker list）"
```

---

## Task 5：apps/host-web 骨架（控制面 web + management-mount 占位）

**Files:**
- Create: `apps/host-web/{package.json,tsconfig.json,vite.config.ts,index.html,src/main.tsx,src/app.tsx}`（仿 apps/worker-web 精简；先读 apps/worker-web/{package.json,vite.config.ts} 学结构）

- [ ] **Step 1: 写失败测试** — 一个轻量组件/单元测试（仿 worker-web 的 vitest 设置）：断言 host-web 暴露一个 `MountWorkerConfig` 组件，它用 soul-workbench 的 micro-app `router-mode="search"` 渲染传入的 `configMicroAppEntry`（management mount）。**不引 fleet/旧 shell**（遵 eslint worker-web 约束的精神）。

- [ ] **Step 2: 跑确认失败**。

- [ ] **Step 3: 实现** — 最小 vite + React 骨架；`MountWorkerConfig({ entry })` 用 packages/ui shadcn 原语 + soul-workbench micro-app 挂 `entry`（management mount，区别于 worker-web 的 employee mount）。`package.json` name `@zonease/aiworker-host-web`，deps 含 `@zonease/aiworker-ui`、`@zonease/aiworker-soul-workbench`。

- [ ] **Step 4: typecheck + lint + 测试通过**（host-web 的 vitest）。
- [ ] **Step 5: commit**
```bash
git add apps/host-web bun.lock
git commit -m "feat(host-web): 控制面 web 骨架 + management-mount worker 配置 micro-app"
```

---

## Task 6：提升 G5/G3 + 更新结构门

**Files:**
- Modify: `tests/architecture/inversion-guards.test.ts`（G5/G3 todo→真断言）、`tests/architecture/package-ownership.test.ts`（targetPackages 加新包）、`docs/testing.md`（Required Test Areas 加新包测试）、`scripts/check-doc-contract.ts`（如 testing.md 新增 gated 短语）

- [ ] **Step 1: 升 G5/G3（先改测试，可能红→实现已就绪应直接绿）** — 在 inversion-guards.test.ts：
  - G3：`worker-*` 包的 package.json deps 不含任何 `host-*` 包名（遍历 packages/worker-* + apps/worker-* 的 package.json 断言）。
  - G5：唯一跨面契约是 worker-control-protocol——`host-control` 的 deps 只含 `worker-control-protocol`（不含 worker-runtime/worker-daemon/任何 worker-* 运行时包）；且 `apps/host-*` 不 import worker-* 运行时内部。
  把这两个从 `test.todo` 改为真 `test(...)`。

- [ ] **Step 2: 更新 package-ownership.test.ts** — `targetPackages` 数组加 `['packages/worker-control-protocol','@zonease/aiworker-worker-control-protocol']` 与 `['packages/host-control','@zonease/aiworker-host-control']`；加方向断言：`host-control` deps 不含 worker-runtime/worker-daemon。

- [ ] **Step 3: 更新 docs/testing.md** — Required Test Areas 加新包测试路径（worker-control-protocol/host-control/host-cli/host-web 的 test 文件）；若 check-doc-contract 钉 testing.md 短语，同步加。

- [ ] **Step 4: 跑门** — `bun run docs:check && bun run test:contracts`（含 inversion-guards G5/G3 真断言通过、package-ownership 含新包通过）。Expected: PASS（G2/G4 仍 todo）。

- [ ] **Step 5: commit**
```bash
git add tests/architecture docs/testing.md scripts/check-doc-contract.ts
git commit -m "test(contract): 提升 G5/G3 真断言 + package-ownership 纳入新控制面包"
```

---

## Task 7：worktree 内整体验证 + 合回

- [ ] **Step 1:** `bun install && bun run typecheck && bun run test:contracts && bun run lint && bun run test`（不需全 release:check：本 plan 未动 CLI 产物/engine/browser 流；但跑 test 覆盖新包 + 确保无回归）。Expected: 全绿。
  > 注：browser 测试既存环境性 flaky（见 memory [[worker-autonomy-inversion]]），如跑 test:browser:freeform 失败先单跑确认 flaky，非本 plan 回归。
- [ ] **Step 2:** 合回 `codex/aiworker-refactor-dev-loop`（FF 若可）：合并前复查主树 peer 改动（共享树）；用 finishing-a-development-branch。
- [ ] **Step 3:** 更新 memory [[worker-autonomy-inversion]]：Plan 3 落地 HEAD、G5/G3 已真断言、下一步 Plan 4（carve）。

---

## Self-Review（执行者完成后）

1. **Spec 覆盖**：worker-control-protocol（§7 四 verb，transport-agnostic）、host-control（registry+assignment 信封）、apps/host-cli、apps/host-web（management-mount）、worker-daemon 控制 server、G5/G3 提升 —— 对齐 spec §6/§7/§10。
2. **边界**：未 carve（worker-runtime/src/host 未动）；host-control/apps/host-* **零** worker-* 运行时 import（G5/G3 守）；契约类型零 transport 字段（C5）；assignment 信封 `.strict()` 拒 domain/session 字段。
3. **lint**：新 CLI（host-cli）的 top-level-await override 已加；新包 deps 键/ import 字母序正确。
4. **下一步**：Plan 4 = carve 4 个 split point（host/runtime、identity-provider、soul-app/registry、executor）入 worker-runtime/host-control + 提升 G2/G4，JIT 编写。
