# product-bet #1 Phase 1 — daemon 单-active-worker 收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个 worker daemon 干净地只承载一个 active worker(C1–C5),把 daemon-per-worker fleet 的产品决策落为可观察契约,worker 保持纯净——本 Phase **不写 fleet 代码、无存储 schema 迁移**。

**Architecture:** 基数不变量在 daemon 层强制(create path + bootstrap),由 orchestrator 进程内 async 锁串行化 create 临界区(单写者世界 → 完整串行化,无需存储 schema 全局索引)。storage-sqlite 保持通用多-worker-capable primitive。`/api/control/worker` 去 `listWorkers()[0]` 漂移。workerId locator 形式化为 absent→隐式 self / present→须匹配。最后 promote 进 canon + 契约 pin。

**Tech Stack:** TypeScript / Bun(`bun test`)/ Hono(OpenAPIHono)/ drizzle-sqlite / zod。`AppError`(`@zonease/aiworker-soul-protocol`)经 `errorHandler` 按 `.status` 映射 HTTP。

**权威 spec:** `docs/superpowers/specs/2026-06-01-product-bet-1-daemon-per-worker-fleet-design.md`

**Phase 1 决策(本 plan 内拍板,spec §9 要求):**
- **bootstrap 遇 >1 active 脏 DB → fail-fast**(Task 2)。理由:daemon-per-worker 下 >1 active 仅来自旧多路复用 DB;静默 archive 第二个 active 是有后果的数据决策,应让操作者显式处理;pre-1.0 dev DB 可重置(AGENTS.md 可破坏式重构)。loud > silent。
- **zero-active 态**(fresh daemon / 全 archived)→ `/api/control/worker` 返回今有的 `404 WORKER_NOT_FOUND`(Task 3)。

**执行注(red window):** Task 1 的 C2 守卫与 Task 2 的 active-only bootstrap 一落地,**整个 daemon 套件会红直到 Task 5**(churn 修完)——因 `:872-873` 等旧多路复用测试在单 boot 建多 active。故 **T1–T4 各步的门是其 scoped `-t '<name>'` 运行,不是全 daemon 套件**;全套件全绿在 T5 之后(T7 总验)。subagent-driven 执行时,任务间复审若跑全套件见红属预期,非任务失败。

---

## File Structure

| 文件 | 责任 | 任务 |
|---|---|---|
| `packages/worker-runtime/src/orchestration/async-lock.ts` | **新建** 进程内 async 互斥锁(可测小工具) | T1 |
| `packages/worker-runtime/src/orchestration/orchestrator.ts` | `createSoulWorker` 加 active-worker 守卫 + 锁包裹临界区(C1+C2) | T1 |
| `packages/worker-daemon/src/modes/worker.ts` | bootstrap fail-fast(C4)、`/api/control/worker` 去漂移(C3)、workerId 矩阵(C5) | T2/T3/T4 |
| `packages/worker-daemon/src/modes/worker.local.test.ts` | daemon 路由 locking tests + churn 修正 | T1/T2/T4/T5 |
| `packages/worker-daemon/src/modes/worker/control.test.ts` | C3 control locking tests | T3 |
| `packages/worker-runtime/src/orchestration/orchestrator.test.ts` | C1 并发/守卫 unit test | T1 |
| `docs/architecture.md` `docs/protocol.md` `docs/runtime.md` | canon promote | T6 |
| `scripts/check-doc-contract.ts` `tests/architecture/refactor-contract.test.ts` | 契约 pin | T6 |

---

## Task 1: 进程内创建锁 + active-worker 守卫(C1 + C2)

**Files:**
- Create: `packages/worker-runtime/src/orchestration/async-lock.ts`
- Create: `packages/worker-runtime/src/orchestration/async-lock.test.ts`
- Modify: `packages/worker-runtime/src/orchestration/orchestrator.ts:192-218`(`createSoulWorker`)
- Test: `packages/worker-runtime/src/orchestration/orchestrator.test.ts`、`packages/worker-daemon/src/modes/worker.local.test.ts`

- [ ] **Step 1: 写 async-lock 失败测试**

`packages/worker-runtime/src/orchestration/async-lock.test.ts`:
```ts
import { describe, expect, it } from 'bun:test'
import { AsyncLock } from './async-lock'

describe('AsyncLock', () => {
  it('serializes concurrent critical sections (no interleaving)', async () => {
    const lock = new AsyncLock()
    const trace: string[] = []
    async function critical(tag: string) {
      return lock.run(async () => {
        trace.push(`${tag}:enter`)
        await Promise.resolve() // yield → 若无锁会让出给另一个
        trace.push(`${tag}:exit`)
      })
    }
    await Promise.all([critical('a'), critical('b')])
    // 串行化 ⇒ 一个完整 enter/exit 后另一个才开始
    expect(trace).toEqual(['a:enter', 'a:exit', 'b:enter', 'b:exit'])
  })

  it('releases the lock even if the critical section throws', async () => {
    const lock = new AsyncLock()
    await expect(lock.run(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    const ok = await lock.run(async () => 'recovered')
    expect(ok).toBe('recovered')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd packages/worker-runtime && bun test src/orchestration/async-lock.test.ts`
Expected: FAIL — `Cannot find module './async-lock'`.

- [ ] **Step 3: 实现 AsyncLock**

`packages/worker-runtime/src/orchestration/async-lock.ts`:
```ts
/**
 * 进程内 async 互斥锁(Promise 链)。串行化临界区。
 * 用于 orchestrator 的 create-worker check+insert 临界区。注意:今天该临界区
 * (active 检查 → upsertWorker)是**同步**的,JS run-to-completion 已保证原子,
 * 故 C1 当下由"守卫 + 同步插入"强制;此锁是**前向保险**——一旦日后有人在
 * check 与 insert 之间引入 await,锁仍保证原子。daemon-per-worker 下每个 daemon
 * 是其 DB 唯一写者,故进程内串行化足够,无需存储 schema 全局索引(见 spec §4 C1)。
 */
export class AsyncLock {
  private tail: Promise<void> = Promise.resolve()

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail
    let release: () => void = () => {}
    this.tail = new Promise<void>((resolve) => { release = resolve })
    await prev
    try {
      return await fn()
    }
    finally {
      release()
    }
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd packages/worker-runtime && bun test src/orchestration/async-lock.test.ts`
Expected: PASS（2 tests）。

- [ ] **Step 5: 写 orchestrator 守卫失败测试**

在 `packages/worker-runtime/src/orchestration/orchestrator.test.ts` 末尾(已有 `createSoulWorker` 测试,参照其 setup)新增:
```ts
it('rejects creating a second active worker (one active per daemon)', async () => {
  const created = await runtime.createSoulWorker({ appId: FREEFORM_APP_ID, name: 'First' })
  expect(created.worker.status).toBe('active')
  await expect(
    runtime.createSoulWorker({ appId: FREEFORM_APP_ID, name: 'Second' }),
  ).rejects.toMatchObject({ code: 'WORKER_ALREADY_ACTIVE', status: 409 })
})

it('allows archive-then-recreate (archived worker does not count as active)', async () => {
  const first = await runtime.createSoulWorker({ appId: FREEFORM_APP_ID, name: 'First' })
  upsertWorker({ id: first.worker.id, appId: first.worker.appId, name: first.worker.name, status: 'archived' })
  const second = await runtime.createSoulWorker({ appId: FREEFORM_APP_ID, name: 'Second' })
  expect(second.worker.status).toBe('active')
})

it('concurrent createSoulWorker yields exactly one active worker (invariant)', async () => {
  // 不变量测试:今天 check+insert 同步即原子,此处钉死"并发也只得一个 active",
  // 防未来在 check 与 insert 间引入 await 时破坏(锁是前向保险,见 async-lock.ts)。
  const results = await Promise.allSettled([
    runtime.createSoulWorker({ appId: FREEFORM_APP_ID, name: 'A' }),
    runtime.createSoulWorker({ appId: FREEFORM_APP_ID, name: 'B' }),
  ])
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
  expect(listWorkers().filter(w => w.status === 'active')).toHaveLength(1)
})
```
注:`FREEFORM_APP_ID` / `runtime` / `upsertWorker` / `listWorkers` import 沿用该测试文件顶部既有写法(若未 import,从 `@zonease/aiworker-storage-sqlite/worker` 引入,与 orchestrator.ts 同源)。**框架澄清**:C1 当下由"守卫(Step 7)+ 同步插入"强制,锁不可在原地红测(去掉锁今天无可观察变化);锁本身由 `async-lock.test.ts`(Step 1)隔离覆盖,并发不变量由本块钉死。

- [ ] **Step 6: 跑测试确认失败**

Run: `cd packages/worker-runtime && bun test src/orchestration/orchestrator.test.ts`
Expected: FAIL — 守卫缺失时第二个 create 返回成功(不抛 `WORKER_ALREADY_ACTIVE`),`rejects creating a second active worker` 与 `concurrent ... exactly one active worker` 两块红;`archive-then-recreate` 块应已绿。

- [ ] **Step 7: 实现守卫 + 锁包裹**

`orchestrator.ts`:顶部 import 处加 `import { AsyncLock } from './async-lock'`;在类里加私有字段:
```ts
  private readonly createWorkerLock = new AsyncLock()
```
把 `createSoulWorker` 体包进锁,并在 mint/per-id 检查后、`upsertWorker` 前加 active 守卫:
```ts
  async createSoulWorker(input: CreateSoulWorkerInput): Promise<CreateSoulWorkerResult> {
    return this.createWorkerLock.run(async () => {
      const soul = this.requireAvailableSoul(input.appId)
      const name = requireText(input.name, 'name')
      const workerId = input.id ? requireText(input.id, 'id') : mintWorkerId()
      if (getWorker(workerId))
        throw new AppError('CONFLICT', 409, `Worker already exists: ${workerId}`)
      // C2:每个 daemon 至多一个 active worker(archived 不计)
      if (listWorkers().some(existing => existing.status === 'active'))
        throw new AppError('WORKER_ALREADY_ACTIVE', 409, 'A daemon hosts at most one active worker.')

      const worker = upsertWorker({
        id: workerId,
        appId: soul.id,
        name,
        defaultEngineId: input.defaultEngineId ?? 'codex',
        metadataJson: {
          defaultCapabilities: [...soul.defaultCapabilities],
          description: soul.description,
          soulAppId: getHostedSoulApp(soul.id)?.appId ?? null,
          ...(input.metadata ?? {}),
        },
      })
      const runtime = this.createRuntimeForWorker(worker)
      await runtime.init()
      return { runtime, snapshot: runtime.snapshot(), worker }
    })
  }
```
确认 `AppError` 与 `listWorkers` 已 import(orchestrator.ts 顶部应已有 `listWorkers`、`getWorker`、`upsertWorker` 来自 storage-sqlite,以及 `AppError` 来自 `@zonease/aiworker-soul-protocol`;若 `AppError` 未 import 则补)。

- [ ] **Step 8: 跑 orchestrator + async-lock 测试确认通过**

Run: `cd packages/worker-runtime && bun test src/orchestration/orchestrator.test.ts src/orchestration/async-lock.test.ts`
Expected: PASS。

- [ ] **Step 9: 写 daemon 路由 409 失败测试**

在 `packages/worker-daemon/src/modes/worker.local.test.ts` 新增(用既有 `app()` + `createFreeformWorker` helper):
```ts
it('POST /api/workers rejects a second active worker with 409', async () => {
  const target = await app()
  await createFreeformWorker(target, 'first-active-worker')
  const res = await target.request('/api/workers', {
    body: JSON.stringify({ id: 'second-active-worker', name: 'Second', appId: FREEFORM_APP_ID }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  expect(res.status).toBe(409)
  expect(await res.json()).toMatchObject({ error: { code: 'WORKER_ALREADY_ACTIVE' } })
})
```
（`FREEFORM_APP_ID` 沿用该文件顶部常量。）

- [ ] **Step 10: 跑测试确认通过(守卫经 errorHandler 自动出 409)**

Run: `cd packages/worker-daemon && bun test src/modes/worker.local.test.ts -t 'rejects a second active worker'`
Expected: PASS（`AppError(409)` 经 `app.onError(errorHandler)` → `c.json(err.toJSON(), 409)`）。

- [ ] **Step 11: Commit**

```bash
git add packages/worker-runtime/src/orchestration/async-lock.ts packages/worker-runtime/src/orchestration/async-lock.test.ts packages/worker-runtime/src/orchestration/orchestrator.ts packages/worker-runtime/src/orchestration/orchestrator.test.ts packages/worker-daemon/src/modes/worker.local.test.ts
git commit -m "feat(worker-runtime): 一 daemon 至多一 active worker — 进程内锁 + 409 守卫(C1+C2)"
```

---

## Task 2: bootstrap 遇 >1 active fail-fast(C4)

**Files:**
- Modify: `packages/worker-daemon/src/modes/worker.ts:189-193`(bootstrap 循环)
- Test: `packages/worker-daemon/src/modes/worker.local.test.ts`

- [ ] **Step 1: 写 bootstrap fail-fast 失败测试**

`worker.local.test.ts` 新增(直接经 `upsertWorker` 种入两个 active 行,绕过路由守卫,模拟旧多路复用脏 DB):
```ts
it('bootstrap fails fast when the DB holds more than one active worker', async () => {
  // 先正常起一次,种入两个 active worker 行(直插存储,绕过路由守卫)
  const dbPath = join(dir, 'worker.db')
  await bootstrapWorkerApp({ dbPath, runtimeVersion: 'test', workersRoot: join(dir, 'workers'), executor: noopExecutor })
  upsertWorker({ id: 'dirty-a', appId: FREEFORM_APP_ID, name: 'A', status: 'active' })
  upsertWorker({ id: 'dirty-b', appId: FREEFORM_APP_ID, name: 'B', status: 'active' })
  closeWorkerDb()
  // 再 boot 同一 DB → 应 fail-fast
  await expect(
    bootstrapWorkerApp({ dbPath, runtimeVersion: 'test', workersRoot: join(dir, 'workers'), executor: noopExecutor }),
  ).rejects.toThrow(/more than one active worker/i)
})
```
注:`noopExecutor` = 该文件 `app()` 里用的同款 executor;若无独立常量,内联 `{ async invoke(i){ i.onEvent?.({kind:'text',text:'done'}); return {artifacts:[],summary:'done'} } }`。`upsertWorker`/`closeWorkerDb` 从 `@zonease/aiworker-storage-sqlite/worker` import(文件应已 import `closeWorkerDb`;补 `upsertWorker`)。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd packages/worker-daemon && bun test src/modes/worker.local.test.ts -t 'bootstrap fails fast'`
Expected: FAIL — 当前 bootstrap 为两个 active 各建 runtime,不抛错。

- [ ] **Step 3: 实现 fail-fast**

`worker.ts:188-193`,把:
```ts
  await state.host.bootstrapOfficialSoulApps()
  for (const worker of listWorkers()) {
    const runtime = state.host.createRuntimeForWorker(worker)
    await runtime.init()
    runtimes.set(worker.id, runtime)
  }
```
改为:
```ts
  await state.host.bootstrapOfficialSoulApps()
  const activeWorkers = listWorkers().filter(worker => worker.status === 'active')
  if (activeWorkers.length > 1) {
    throw new AppError(
      'DAEMON_MULTIPLE_ACTIVE_WORKERS',
      500,
      `Daemon DB holds more than one active worker (${activeWorkers.map(w => w.id).join(', ')}); a daemon hosts at most one active worker.`,
    )
  }
  for (const worker of activeWorkers) {
    const runtime = state.host.createRuntimeForWorker(worker)
    await runtime.init()
    runtimes.set(worker.id, runtime)
  }
```
注:`AppError` 应已在 worker.ts import(:53 区附近有 soul-protocol import;若无补 `import { AppError } from '@zonease/aiworker-soul-protocol'`)。**行为变更**:bootstrap 只为 **active** worker 建 runtime(archived 不再建,符合 C4)。

- [ ] **Step 4: 跑测试确认通过 + 跑全 daemon 测试看是否触发 archived-runtime 回归**

Run: `cd packages/worker-daemon && bun test src/modes/worker.local.test.ts`
Expected: 新测试 PASS;若有测试依赖 "archived worker 仍有 runtime",会红 → 归入 Task 5 churn 处理(记录失败用例名)。

- [ ] **Step 5: 验证生产路径不依赖 archived worker 的 runtime**

active-only bootstrap 是**生产行为变更**:重启后 archived worker 不再有 runtime。grep 非测试 `requireRuntime` 调用者,确认没有以 archived workerId 可达的路径(如对 archived worker 的 config-read/delete):
```bash
cd /home/ben/projects/aiworker
grep -rn "requireRuntime(" packages/worker-daemon/src/ | grep -v test
```
逐个核对:daemon-per-worker 语义下对 archived worker 调 runtime 的路径应已不可达(或本就该 4xx)。若发现可达路径,补一条 locking test 并在此修(prefer 经 active worker 解析;archived → 明确 4xx)。**确认而非假设。**

- [ ] **Step 6: Commit**

```bash
git add packages/worker-daemon/src/modes/worker.ts packages/worker-daemon/src/modes/worker.local.test.ts
git commit -m "feat(worker-daemon): bootstrap 只重建 ≤1 active worker,>1 active fail-fast(C4)"
```

---

## Task 3: `/api/control/worker` 去 `listWorkers()[0]` 漂移(C3)

**Files:**
- Modify: `packages/worker-daemon/src/modes/worker.ts:223-234`
- Test: `packages/worker-daemon/src/modes/worker/control.test.ts`

- [ ] **Step 1: 写 C3 失败测试**

`control.test.ts` 新增:
```ts
it('GET /api/control/worker returns the single active worker (not listWorkers()[0])', async () => {
  const target = await app()
  await createFreeformWorker(target, 'the-active-worker')
  const res = await target.request('/api/control/worker')
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ workerId: 'the-active-worker' })
})

it('GET /api/control/worker returns 404 when no active worker exists (zero-active)', async () => {
  const target = await app() // fresh daemon, 未创建任何 worker
  const res = await target.request('/api/control/worker')
  expect(res.status).toBe(404)
  expect(await res.json()).toMatchObject({ error: { code: 'WORKER_NOT_FOUND' } })
})
```

- [ ] **Step 2: 跑测试确认失败/或暴露漂移**

Run: `cd packages/worker-daemon && bun test src/modes/worker/control.test.ts -t 'control/worker'`
Expected: zero-active 用例当前应已 PASS(`listWorkers()[0]` 为 undefined → 404);active 用例当前在单 worker 下也 PASS——故此处主要是**锁定行为防回归**。若想看红:可临时种入一个 archived worker 验证 `listWorkers()[0]` 会错取 archived(见 Step 3 动机)。

- [ ] **Step 3: 实现去漂移(取唯一 active)**

`worker.ts:223-226`,把 `const worker = listWorkers()[0]` 改为:
```ts
  app.get('/api/control/worker', (c) => {
    const worker = listWorkers().find(candidate => candidate.status === 'active')
    if (!worker)
      return c.json({ error: { code: 'WORKER_NOT_FOUND', message: 'no active worker registered' } }, 404)
```
其余 body(workerId/templateId/version/health/configMicroAppEntry)不变。动机:`listWorkers()[0]` 按 `id` 排序可能取到 archived worker;`find(active)` 恒取该 daemon 的唯一 active worker。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd packages/worker-daemon && bun test src/modes/worker/control.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/worker-daemon/src/modes/worker.ts packages/worker-daemon/src/modes/worker/control.test.ts
git commit -m "fix(worker-daemon): /api/control/worker 取唯一 active worker,去 listWorkers()[0] 漂移(C3)"
```

---

## Task 4: workerId locator 矩阵(C5)

**背景(读代码后的现实):** `requireRuntime(state, workerId)` 对无 runtime 的 workerId 已抛错;daemon-per-worker 下只有唯一 active worker 有 runtime,故 **present-mismatch 已被现有 requireRuntime 拦下**。本任务:(1) 用 locking test 钉死 present-mismatch 被拒;(2) 形式化 absent→隐式 self(`/api/capabilities`、`GET /api/sessions` 这类 workerId 可选路由)。**不改 required/optional 契约**(spec C5)。

**Files:**
- Modify: `packages/worker-daemon/src/modes/worker.ts`(`/api/capabilities` :262-265、`GET /api/sessions` :493-505)
- Test: `packages/worker-daemon/src/modes/worker.local.test.ts`

- [ ] **Step 1: 写 present-mismatch 锁定测试**

`worker.local.test.ts` 新增:
```ts
it('POST /api/workspace-locators rejects a workerId that is not the active worker', async () => {
  const target = await app()
  await createFreeformWorker(target, 'real-worker')
  const res = await target.request('/api/workspace-locators', {
    body: JSON.stringify({ workerId: 'ghost-worker', rootPath: mkdtempSync(join(dir, 'ghost-')) }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  // ghost workerId 应被拒(client error)。注:POST /api/workspace-locators 上
  // unavailableSoulAppResponse(:428) 先于 requireRuntime(:431) 跑,确切码需执行期实测后钉死。
  expect(res.status).toBeGreaterThanOrEqual(400)
  expect(res.status).toBeLessThan(500)
})
```

- [ ] **Step 2: 跑测试确认通过(现有 requireRuntime / unavailableSoulAppResponse 已拦)**

Run: `cd packages/worker-daemon && bun test src/modes/worker.local.test.ts -t 'not the active worker'`
Expected: PASS（锁定既有 4xx 拒绝防回归)。**执行期**:观察实际状态码(404 或其它 4xx),把 `toBeGreaterThanOrEqual/LessThan` 收紧为 `toBe(<实测码>)`。若意外 2xx(未拦)→ 转 Step 3 加显式 workerId==active 校验。

- [ ] **Step 3: 写 absent→隐式 self 锁定测试(capabilities)**

```ts
it('GET /api/capabilities without workerId resolves to the single active worker', async () => {
  const target = await app()
  const worker = await createFreeformWorker(target, 'cap-worker')
  const all = await (await target.request('/api/capabilities')).json() as { capabilities: unknown[] }
  const scoped = await (await target.request(`/api/capabilities?workerId=${worker.id}`)).json() as { capabilities: unknown[] }
  // 单 active worker 下,absent 与 present(self)结果一致
  expect(all.capabilities).toEqual(scoped.capabilities)
})
```
注:`createFreeformWorker` 当前不返回 worker(control.test.ts 版),用 worker.local.test.ts 的版本(:117 返回 `worker`)。

- [ ] **Step 4: 跑测试**

Run: `cd packages/worker-daemon && bun test src/modes/worker.local.test.ts -t 'resolves to the single active worker'`
Expected: 单 active worker 下 `listCapabilities()`(全部)== `listCapabilitiesForWorker(self)` → **若相等则 PASS**(行为已自然收敛,无需改码)。若不等(全局含非 worker-scoped 能力)→ Step 5 改 handler 让 absent 解析 self。

- [ ] **Step 5: (条件)absent→self 显式解析**

仅当 Step 4 红:在 worker.ts 加 helper 并用于 `/api/capabilities`、`GET /api/sessions`:
```ts
function activeWorkerIdOrNull(): string | null {
  return listWorkers().find(w => w.status === 'active')?.id ?? null
}
```
`/api/capabilities`(:262-265)改为:
```ts
  app.get('/api/capabilities', (c) => {
    const workerId = c.req.query('workerId') ?? activeWorkerIdOrNull() ?? undefined
    return c.json({ capabilities: workerId ? state.host.listCapabilitiesForWorker(workerId) : state.host.listCapabilities() })
  })
```
（`GET /api/sessions` :493-505 同理:`const workerId = c.req.query('workerId') ?? activeWorkerIdOrNull() ?? undefined`,后续逻辑不变。)

- [ ] **Step 6: 跑测试确认通过**

Run: `cd packages/worker-daemon && bun test src/modes/worker.local.test.ts -t 'workerId|active worker|capabilities'`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add packages/worker-daemon/src/modes/worker.ts packages/worker-daemon/src/modes/worker.local.test.ts
git commit -m "feat(worker-daemon): workerId locator 矩阵 absent→self/present→match(C5)"
```

---

## Task 5: 测试 churn — 修正单 boot 内建多 active worker 的测试

**背景:** 决策(一 daemon ≤1 active)使任何在**单次 `app()` boot 内**经 POST 建 ≥2 active worker 的测试必然撞 C2 守卫(Task 1)或 C4 fail-fast(Task 2)。已知 `worker.local.test.ts:872-873`(`requested-root-worker` + `sibling-root-worker`)。本任务全量枚举并逐个修正。

**Files:**
- Modify: `packages/worker-daemon/src/modes/worker.local.test.ts`(+ 任何枚举命中的测试文件)

- [ ] **Step 1: 枚举所有命中**

Run:
```bash
cd /home/ben/projects/aiworker
# 列出每个测试文件里 POST /api/workers 的出现,人工核对哪些在同一 it() 内出现 ≥2 次且都期望 201、且中间无 daemon 重启
grep -rn "method: 'POST'" packages/worker-daemon/src/modes/worker.local.test.ts | head -50
grep -n "createFreeformWorker\|/api/workers'" packages/worker-daemon/src/modes/worker.local.test.ts
```
逐个 `it()` 判定:**同一 boot 内 ≥2 个 active create** = 命中;**daemon 重启复用单 worker**(如 `:345` restarted 上下文)= 不命中。把命中清单写进本步勾选项。已知命中:`:872-873`。

- [ ] **Step 2: 逐个修正命中测试(转用 fixture 直插或拆 boot)**

对每个命中,二选一(按测试意图):
- **A. 若测试需要两个 worker 的元数据共存但不需都 active**:第二个改经存储直插(绕过路由守卫),并标记 archived 或仅作元数据:
  ```ts
  // 之前:const siblingWorker = await createFreeformWorker(target, 'sibling-root-worker')
  // 之后:用存储直插一个非-active 行作 fixture(不经路由,不撞守卫)
  upsertWorker({ id: 'sibling-root-worker', appId: FREEFORM_APP_ID, name: 'Sibling', status: 'archived' })
  const siblingWorker = getWorker('sibling-root-worker')!
  ```
- **B. 若测试本质是"两个独立 worker 各自隔离"**:拆成两次独立 `app()` boot(各自 DB dir),分别建单 worker。

读 `:865-900` 的 `it()` 全文判定 `requested-root-worker`/`sibling-root-worker` 测的是什么(rootPath 兄弟隔离)再选 A/B。`upsertWorker`/`getWorker` 从 `@zonease/aiworker-storage-sqlite/worker` import。

- [ ] **Step 3: 跑全 daemon 包测试确认全绿**

Run: `cd packages/worker-daemon && bun test`
Expected: PASS（含 Task 2 Step 4 记录的 archived-runtime 回归一并修复)。

- [ ] **Step 4: Commit**

```bash
git add packages/worker-daemon/src/modes/worker.local.test.ts
git commit -m "test(worker-daemon): 修正单 boot 建多 active worker 的旧多路复用测试(churn)"
```

---

## Task 6: promote 进 canon + 契约 pin

**Files:**
- Modify: `docs/architecture.md`、`docs/protocol.md`、`docs/runtime.md`
- Modify: `scripts/check-doc-contract.ts`、`tests/architecture/refactor-contract.test.ts`

- [ ] **Step 1: 写契约 pin 失败测试(先红)**

`tests/architecture/refactor-contract.test.ts` 新增(沿用顶部 `readRepoFile` helper):
```ts
test('product-bet #1: daemon-per-worker + worker purity is documented and enforced', () => {
  const architecture = readRepoFile('docs/architecture.md')
  const protocol = readRepoFile('docs/protocol.md')
  const runtime = readRepoFile('docs/runtime.md')
  const daemon = readRepoFile('packages/worker-daemon/src/modes/worker.ts')
  const orchestrator = readRepoFile('packages/worker-runtime/src/orchestration/orchestrator.ts')

  // canon 明文(needle 须 backtick-free + 不跨换行,与 Step 3-5 写入文本逐字一致)
  expect(architecture).toContain('A Worker daemon hosts at most one active Worker.')
  expect(architecture).toContain('The Worker never registers with or pushes to Host.')
  expect(protocol).toContain('rejects creation when the daemon already hosts an active')
  expect(runtime).toContain('A daemon reconstitutes at most one active Worker at bootstrap')

  // 代码:C3 去漂移(worker.ts 不再用 listWorkers()[0]);C2 守卫在 orchestrator(worker-runtime),非 worker.ts
  expect(daemon).not.toContain('listWorkers()[0]')
  expect(orchestrator).toContain('WORKER_ALREADY_ACTIVE')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/ben/projects/aiworker && bun test tests/architecture/refactor-contract.test.ts -t 'daemon-per-worker'`
Expected: FAIL — canon 字符串尚未写入(`listWorkers()[0]` 在 Task 3 已删 → 该断言应已绿;canon 断言红)。

- [ ] **Step 3: 写 architecture.md canon 段落**

在 `docs/architecture.md` 的 Ownership 表(~47-76)与 Monorepo Boundary(~108)之间新增小节:
```markdown
## Daemon Topology (daemon-per-worker)

A Worker daemon hosts at most one active Worker. The fleet is N worker daemon
processes, each with its own storage root; an optional Host control plane brokers
across worker endpoints by endpoint. A Worker daemon carries zero fleet/Host
awareness: it is a passive control server, and Host is the active client that
discovers and connects in. The Worker never registers with or pushes to Host.
`worker-*` packages must not import `host-*` packages — a runtime direction rule,
not only a build-time dependency rule.
```

- [ ] **Step 4: 写 protocol.md canon 句**

在 `docs/protocol.md` 的 `POST /api/workers`(~127-133)附近补一句:
```markdown
- `POST /api/workers` rejects creation when the daemon already hosts an active
  Worker (409); a daemon hosts at most one active Worker. archive-then-recreate
  is permitted (archived rows do not count). When a route receives `workerId`, it
  must equal the daemon's active Worker; when omitted, it resolves to that single
  active Worker.
```

- [ ] **Step 5: 写 runtime.md canon 句**

在 `docs/runtime.md` Local Daemon 段(~17-23)补:
```markdown
A daemon reconstitutes at most one active Worker at bootstrap; finding more than
one active Worker is a violation and the daemon refuses to boot (fail-fast).
```

- [ ] **Step 6: 在 check-doc-contract.ts 加 requireIncludes pin**

`scripts/check-doc-contract.ts`,在对应文档的 `requireIncludes(...)` 数组各补一行 needle:
```ts
// requireIncludes('docs/architecture.md', [...]) 内补:
'A Worker daemon hosts at most one active Worker.',
// requireIncludes('docs/protocol.md', [...]) 内补(backtick-free,与 Step 1 测试 needle 一致):
'rejects creation when the daemon already hosts an active',
// requireIncludes('docs/runtime.md', [...]) 内补:
'A daemon reconstitutes at most one active Worker at bootstrap',
```
（按 check-doc-contract.ts 现有各 `requireIncludes(<file>, [...])` 块定位;若某 doc 尚无块,参 architecture.md 块新增。needle 须与 Step 3-5 写入文本逐字一致。)

- [ ] **Step 7: 跑契约 + doc-check 确认通过**

Run:
```bash
cd /home/ben/projects/aiworker
bun test tests/architecture/refactor-contract.test.ts -t 'daemon-per-worker'
bun run docs:check    # 或 bun scripts/check-doc-contract.ts
```
Expected: 均 PASS。

- [ ] **Step 8: Commit**

```bash
git add docs/architecture.md docs/protocol.md docs/runtime.md scripts/check-doc-contract.ts tests/architecture/refactor-contract.test.ts
git commit -m "docs(canon): promote daemon-per-worker + worker 纯净不变量 + 契约 pin(product-bet #1 Phase 1)"
```

---

## Task 7: 最小新鲜验证(touched surface)

- [ ] **Step 1: 跑触及包的测试 + 契约 + lint**

Run:
```bash
cd /home/ben/projects/aiworker
bun test packages/worker-runtime packages/worker-daemon tests/architecture > /tmp/p1.log 2>&1
echo "exit=$?"   # 单独读 exit;勿用 | tail / ; echo 吞退出码
```
读 `/tmp/p1.log` 确认全绿。

- [ ] **Step 2: (可选)release:check 全门**

Run: `bun run release:check > /tmp/rc.log 2>&1`(单命令,**勿** `| tail` / `; echo $?`),再读 `/tmp/rc.log`。
注:跑前 `git status` 确认无并发 peer 改动混入(共享工作树)。

---

## Self-Review(写完即查,见 writing-plans)

- **Spec 覆盖:** C1→T1(锁)、C2→T1(守卫+409)、C3→T3、C4→T2、C5→T4;§3 纯净不变量→T6 canon;§9 bootstrap-脏数据决策→T2(fail-fast);§9 churn 枚举→T5;§9 canon+pin→T6;"无存储迁移"→全程未碰 storage schema。✅
- **占位扫描:** T4 Step 5、T5 Step 1-2 含"条件/枚举"步骤——均给出真实命令 + 真实 transform 代码,非占位(枚举是执行期必需的真实发现步)。✅
- **类型一致:** `AsyncLock.run` / `createWorkerLock` / `WORKER_ALREADY_ACTIVE` / `DAEMON_MULTIPLE_ACTIVE_WORKERS` / `activeWorkerIdOrNull` 跨任务一致;`AppError(code,status,message)` 签名与 orchestrator.ts:197 既有用法一致。✅
- **退出码避坑:** T7 明确禁 `| tail` / `; echo $?`(本仓库踩过)。✅
