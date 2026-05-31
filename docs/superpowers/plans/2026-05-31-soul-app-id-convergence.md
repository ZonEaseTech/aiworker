# C-ID:soul-app 身份收敛(soulId/appId → 单一 appId)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落实统一边界 spec §3 D1 / §4.1:把系统性承载 **appId 值却命名为 soulId** 的寻址字段收敛为单一 `appId`,域 `soulId` 降级为 descriptor identity 元数据;一并消解控制契约 `describe.soulId`(装 appId)vs `assignment.templateId` 的双键名不一致。

**Architecture:** 这是**跨层契约级**迁移(G5 Host↔Worker 契约 + OpenAPI + DB 列迁移 + 投影 + CLI + 契约测试 pin),独立于 boundary-cleanup 计划。严格 TDD + 逐层推进 + 每层一次提交,保证任意中间提交可通过 typecheck。**先 Task 0 向用户确认命名子决策**,再动代码。

**Tech Stack:** drizzle(SQLite RENAME COLUMN 迁移)、zod、Hono OpenAPI、Bun test、ripgrep。门:`bun run release:check`。

**爆炸半径(spec §4.1,grep 实测):**
- 存储:`packages/storage-sqlite/src/worker/schema.ts:11` `workers.soulId`(列 `soul_id`)装 appId;迁移在 `packages/storage-sqlite/drizzle/worker/`(下一个 0015);`discardRetiredSoulMetadata` 读 `workers.soulId` 查 `['hr','qa']`。
- 投影:`packages/soul-protocol/src/soul-app/registry.ts:153` `ProjectedCapability.soulId = identity.appId`;schema `:22`;`projectedSoul.id = identity.appId`(:130)。
- 控制契约(G5):`packages/worker-control-protocol/src/index.ts:11` `workerDescribeSchema.soulId`(装 appId);`:36` `assignment.templateId`(同一身份,另名);`index.test.ts:13,18`。
- daemon + OpenAPI:`packages/worker-daemon/src/modes/worker.ts:212,229,316,345,369` 响应 `soulId`;`worker/schemas.ts:56`;`/openapi.json`。
- runtime:`packages/worker-runtime/src/worker/runtime.ts` 与 orchestrator 的 `soulId` 字段;`packages/soul-app-runtime/src/index.ts:186` `upsertWorker({ soulId: identity.appId })`。
- CLI:`apps/worker-cli/src/aiworker.ts:1798` `listCapabilities(opts.soul)`(`--soul` 标注 "Soul id" 实需 appId)。
- 契约测试 pin:`tests/architecture/refactor-contract.test.ts:1374,1778`(`soulId: 'hr'` / `"soulId": "hr"`)。

---

## Task 0:全量盘点 + 命名子决策(动代码前必做)

**Files:** 无改动(只读 + 向用户提问)。

- [ ] **Step 1: 全量盘点** — 生成"装 appId 值"字段的精确 rename map:

```bash
rg -n "soulId|soul_id|domainSoulId|\.soul\b" packages apps souls -g '*.ts' -g '*.tsx' --no-heading | rg -v "node_modules|dist" > /tmp/cid-soulid-sites.txt
wc -l /tmp/cid-soulid-sites.txt
```
对每处判定它承载的是 **appId 值**(→ 收敛改名)还是 **域 soulId 值**(→ 降级保留)。产出两份清单。判据:源头若是 `identity.appId` / `worker.soulId`(本身装 appId)即 appId 值;源头是 `descriptor.identity.soulId` / `soul_apps.soul_id` / `metadata.domainSoulId` 即域 soulId 值。

- [ ] **Step 2: 命名子决策(问用户)** — 收敛后的键名:
  - **内部字段**:统一 `appId`(= descriptor 主身份、soul_apps PK 语义、唯一)。
  - **控制契约(Host-facing)**:`describe.soulId` 与 `assignment.templateId` 统一为 **`templateId`**(canon Soul==Template,Host 面用 Template 术语),内部 `appId` ↔ 契约 `templateId` 为单一映射并写进 canon。
  - 备选:契约也用 `appId`(彻底单名,但弃用 canon 的 Template 术语)。
  **默认推荐前者**;若用户选后者,Task 3/7 据此调整。**等用户确认后再进 Task 1。**

- [ ] **Step 3: 记录决策** — 把命名决策追加进 spec §3 D1(一行),提交:

```bash
git add docs/superpowers/specs/2026-05-31-boundary-unified-design.md
git commit -m "docs(spec): 记录 C-ID 收敛命名子决策(internal appId / contract templateId)"
```

---

## Task 1:投影层 — `ProjectedCapability.soulId` → `appId`

**事实:** `packages/soul-protocol/src/soul-app/registry.ts:22`(schema 字段)、`:153`(`soulId: identity.appId`)装的是 appId。`projectedSoul.id`(:130)已是 `id`,无需改名,仅语义注释。

**Files:** `packages/soul-protocol/src/soul-app/registry.ts`、其 `.test.ts`;下游消费 `ProjectedCapability.soulId` 的 `packages/worker-runtime/src/soul-app/registry.ts:206`(`capability.soulId === soulId`)与 orchestrator。

- [ ] **Step 1: 写失败测试** — 在 soul-protocol registry 测试加:

```ts
test('projected capability uses appId as its addressing key', () => {
  const cap = projectSoulAppCapability(freeformDescriptor, freeformDescriptor.capabilities[0])
  expect(cap).toHaveProperty('appId', freeformDescriptor.identity.appId)
  expect(cap).not.toHaveProperty('soulId')
})
```
- [ ] **Step 2: 跑确认失败** → FAIL。
- [ ] **Step 3: 改 schema + 投影** — `projectedCapabilitySchema:22` 把 `soulId: zod.string().min(1)` 改 `appId: zod.string().min(1)`;`projectSoulAppCapability:153` 把 `soulId: identity.appId` 改 `appId: identity.appId`。
- [ ] **Step 4: 改下游消费** — `packages/worker-runtime/src/soul-app/registry.ts:206` `capability.soulId === soulId` → `capability.appId === appId`;改 `listCapabilitiesForSoul(soulId)` 参数与 orchestrator 调用点为 appId 语义(读 orchestrator.ts:162-168 确认)。
- [ ] **Step 5: 跑绿** — `bun run --filter '@zonease/aiworker-soul-protocol' test && bun run --filter '@zonease/aiworker-worker-runtime' typecheck`。
- [ ] **Step 6: 提交** — `git commit -m "refactor(projection): ProjectedCapability.soulId → appId(C-ID Task1)"`。

---

## Task 2:存储层 — `workers.soul_id` → `app_id`(列迁移)

**事实:** `schema.ts:11` `soulId: text('soul_id')` 装 appId。drizzle 迁移目录 `packages/storage-sqlite/drizzle/worker/`。`discardRetiredSoulMetadata` 读该列查 `['hr','qa']`(by-design 退役占位,index.test.ts 守)。

**Files:** `packages/storage-sqlite/src/worker/schema.ts`、新迁移 `drizzle/worker/0015_*.sql` + 快照/journal、`packages/storage-sqlite/src/worker/index.ts`(call sites + discardRetiredSoulMetadata)、`index.test.ts`、所有写/读 `workers.soulId` 的上游(worker-runtime、soul-app-runtime、daemon)。

- [ ] **Step 1: 确认迁移生成机制** — `rg -n "db:generate|drizzle-kit|drizzle.config" package.json packages/storage-sqlite/package.json`;若有 `drizzle-kit generate` 脚本则用它,否则手写 `.sql` + `_journal.json` 条目(读 `drizzle/worker/meta/_journal.json` 末项照格式追加)。
- [ ] **Step 2: 写失败测试** — `index.test.ts` 加:`upsertWorker` 后读回 `worker.appId`(非 `soulId`):

```ts
it('worker row exposes appId as the soul-app addressing key', () => {
  const w = upsertWorker({ id: 'w_test', appId: 'aiworker-freeform', name: 'X', defaultEngineId: null, metadataJson: {} })
  expect(w.appId).toBe('aiworker-freeform')
})
```
- [ ] **Step 3: 跑确认失败** → FAIL(字段还叫 soulId)。
- [ ] **Step 4: 改 schema 字段** — `schema.ts:11` `soulId: text('soul_id')` → `appId: text('app_id')`;`:20` 索引 `workers_soul_idx`.on(table.soulId) → `workers_app_idx`.on(table.appId)(索引名也迁移)。
- [ ] **Step 5: 生成迁移** — `drizzle-kit generate`(或手写)产出 `0015_*.sql`:

```sql
ALTER TABLE `workers` RENAME COLUMN `soul_id` TO `app_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `workers_soul_idx`;--> statement-breakpoint
CREATE INDEX `workers_app_idx` ON `workers` (`app_id`);
```
并按格式更新 `meta/_journal.json` + 快照。
- [ ] **Step 6: 改 call sites** — `rg -n "\.soulId|soulId:" packages/storage-sqlite/src/worker/index.ts` 逐处:`upsertWorker` 入参/写入、`WorkerRow` 映射、`discardRetiredSoulMetadata`(把读 `workers.soulId` 改 `workers.appId`,查的 `['hr','qa']` 值不变——它们是历史 appId==soulId 的占位值)。同步改 `index.test.ts` 的 `discards/repairs legacy` 用例(它们被 refactor-contract pin 排除,见 Task 7)。
- [ ] **Step 7: 跑绿(含快照契约)** — `bun run --filter '@zonease/aiworker-storage-sqlite' test && bun test tests/architecture/forbidden-host-domain-schema.test.ts`(后者校验最新快照;若它 pin 了列名,同步)。
- [ ] **Step 8: 提交** — `git commit -m "feat(storage): workers.soul_id → app_id 列迁移(C-ID Task2)"`。

---

## Task 3:控制契约(G5)— `describe.soulId` → `templateId`

**事实:** `worker-control-protocol/src/index.ts:11` `workerDescribeSchema.soulId`(装 appId);`:36` `assignment.templateId`。按 Task 0 命名决策统一为 `templateId`(Host-facing)。

**Files:** `packages/worker-control-protocol/src/index.ts`、`index.test.ts`。

- [ ] **Step 1: 改 `index.test.ts`** — `:13` fixture `soulId:'freeform'` → `templateId:'aiworker-freeform'`(注意值也从域 soulId 变 appId);`:18` `expect(ok.soulId)` → `expect(ok.templateId).toBe('aiworker-freeform')`。
- [ ] **Step 2: 跑确认失败** → FAIL。
- [ ] **Step 3: 改 schema** — `workerDescribeSchema:11` `soulId: z.string().min(1)` → `templateId: z.string().min(1)`(更新行内注释:它承载 descriptor appId)。
- [ ] **Step 4: 跑绿** — `bun run --filter '@zonease/aiworker-worker-control-protocol' test`。
- [ ] **Step 5: 提交** — `git commit -m "feat(control-protocol): describe.soulId → templateId,消除与 assignment 的双键名(C-ID Task3)"`。

---

## Task 4:worker-daemon 响应 + OpenAPI

**事实:** `worker.ts:212,229,316,345,369` 响应字段 `soulId: ...`;`:229` 是 `/api/control/worker`(产出 describe);`worker/schemas.ts:56` 含 `soulId`。

**Files:** `packages/worker-daemon/src/modes/worker.ts`、`worker/schemas.ts`、`worker/openapi.ts`(若 pin 字段名)。

- [ ] **Step 1: 写失败测试** — 在 daemon 测试(或现有 control 测试)断言 `/api/control/worker` 响应含 `templateId`(= appId)且无 `soulId`;`/api/workers` 响应行含 `appId`。读现有测试文件确认断言点。
- [ ] **Step 2: 跑确认失败** → FAIL。
- [ ] **Step 3: 改响应** — `:229` describe 响应 `soulId: worker.soulId` → `templateId: worker.appId`;`:212` 列举 `soulId: worker.soulId` → `appId: worker.appId`;`:316/345/369`(create/get/patch worker 响应)`soulId` → `appId`;`schemas.ts:56` 字段改名;`worker.ts:688` `state.host.getApp(worker.soulId)` → `getApp(worker.appId)`。
- [ ] **Step 4: OpenAPI** — `worker/openapi.ts` 若显式声明响应 schema 字段名则同步;`/openapi.json` 由 zod-openapi 自动生成,跑后核对。
- [ ] **Step 5: 跑绿** — `bun run --filter '@zonease/aiworker-worker-daemon' test && bun run --filter '@zonease/aiworker-worker-daemon' typecheck`。
- [ ] **Step 6: 提交** — `git commit -m "feat(daemon): control/worker 响应 soulId → templateId/appId + OpenAPI(C-ID Task4)"`。

---

## Task 5:worker-runtime + soul-app-runtime 接缝

**事实:** `worker-runtime/src/worker/runtime.ts` 多处 `this.#workerInput.soulId`(:203,780,803,806,957);orchestrator `soulId` 入参;`soul-app-runtime/src/index.ts:186` `upsertWorker({ soulId: identity.appId })`、:192-194 `metadataJson.domainSoulId`。

**Files:** `packages/worker-runtime/src/worker/runtime.ts`、`orchestration/orchestrator.ts`、`packages/soul-app-runtime/src/index.ts`。

- [ ] **Step 1: 写失败测试** — worker-runtime 测试断言 worker 运行态以 `appId` 寻址(读 `runtime.test.ts` 现有 worker fixture,把 `soulId` 改 `appId` 并断言寻址成功)。
- [ ] **Step 2: 跑确认失败** → FAIL。
- [ ] **Step 3: 改 runtime/orchestrator** — `#workerInput.soulId` → `#workerInput.appId`(含类型 `runtime.ts:77`、:203/803/806/957 写入、:780 日志串 `Soul id:` → `App id:`);orchestrator `requireAvailableSoul(input.soulId)`/`getHostedSoulApp(worker.soulId)` 等改 appId 语义(`findCatalogSoul` 的 catalog 键已是 appId 值,仅改参数名)。
- [ ] **Step 4: 改 soul-app-runtime** — `:186` `upsertWorker({ ..., soulId: identity.appId })` → `{ ..., appId: identity.appId }`;`:192-194` `metadataJson.domainSoulId: identity.soulId` 保留为**纯 descriptor 元数据**(域 soulId 的合法归宿,符合 D1 降级)。
- [ ] **Step 5: 跑绿** — `bun run --filter '@zonease/aiworker-worker-runtime' test && bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck`。
- [ ] **Step 6: 提交** — `git commit -m "refactor(runtime): worker 寻址键 soulId → appId,域 soulId 降级为 metadata(C-ID Task5)"`。

---

## Task 6:CLI `--soul` UX papercut

**事实:** `apps/worker-cli/src/aiworker.ts:1798` `listCapabilities(opts.soul)`;`--soul` 标注 "Soul id" 实需 appId,用户传域 soulId(`freeform`)得 `SOUL_NOT_AVAILABLE`。

**Files:** `apps/worker-cli/src/aiworker.ts`、`aiworker.test.ts`。

- [ ] **Step 1: 写失败测试** — `aiworker.test.ts` 断言 `--app aiworker-freeform`(或保留 `--soul` 但帮助文案/解析按 appId)能列出 capabilities;读现有 capability 列举测试照其风格写。
- [ ] **Step 2: 跑确认失败** → FAIL。
- [ ] **Step 3: 改 CLI** — 把 flag 重命名为 `--app <appId>`(保留 `--soul` 为 deprecated alias 或直接改,取决于 Task 0 是否允许破坏 CLI;pre-1.0 默认直接改),帮助文案从 "Soul id" 改 "Soul App id (appId, e.g. aiworker-freeform)";`:1798` `opts.soul` → `opts.app`。
- [ ] **Step 4: 跑绿** — `bun run test:cli`(含 `aiworker.test.ts` + golden-path)。
- [ ] **Step 5: 提交** — `git commit -m "fix(cli): --soul → --app(appId 寻址,消除 UX papercut)(C-ID Task6)"`。

---

## Task 7:契约测试 pin + canon 协议版本说明

**事实:** `refactor-contract.test.ts:1374,1778` pin `soulId:'hr'`/`"soulId":"hr"`(断言 runtime/storage 测试**不含**退役 HR fixture)。改列名后这些测试 fixture 的字段也变,pin 需同步。canon `protocol.md` 控制契约节需记 `describe.templateId`(= appId)+ 协议变更说明。

**Files:** `tests/architecture/refactor-contract.test.ts`、`docs/protocol.md`、`scripts/check-doc-contract.ts`。

- [ ] **Step 1: 同步 refactor-contract pin** — 读 `:1365-1382` 与 `:1770-1784`,把 `retiredWorkerSnippets` 里的 `'soulId: \'hr\''`/`'"soulId": "hr"'` 改为收敛后的字段名形态(`'appId: \'hr\''` 等),保持"断言退役 HR fixture 缺席"的语义。跑 `bun test tests/architecture/refactor-contract.test.ts` 确认仍绿(被测源文件已在 Task2/5 去 HR)。
- [ ] **Step 2: 改 canon protocol.md** — 在控制契约节明确:`workerDescribeSchema.templateId` 与 `workerAssignmentEnvelopeSchema.templateId` 同指 Soul-App/Template 身份,承载值是 descriptor `appId`(不透明 key);并加一句 **协议变更说明**(pre-1.0:`describe.soulId` 已更名 `templateId`,`WORKER_CONTROL_PROTOCOL_VERSION` 维持 `1` 或按需 bump——读 wcp 决定是否 bump)。
- [ ] **Step 3: 同步 check-doc-contract pin** — `scripts/check-doc-contract.ts` 中与上句对应的 pin 串改为逐字一致。
- [ ] **Step 4: 跑绿** — `bun run docs:check && bun test tests/architecture/refactor-contract.test.ts`。
- [ ] **Step 5: 提交** — `git commit -m "docs+test(contract): 同步 C-ID 后的 describe.templateId pin 与协议说明(C-ID Task7)"`。

---

## 收尾验证

- [ ] **Final: 全量门** — `bun run release:check`。Expected: 全绿(含 test:contracts / test:protocol / test:cli / test:browser:freeform / typecheck / lint / build / smoke)。逐项排查残留 `soulId`(装 appId 语义的)漏改:`rg -n "soulId" packages apps -g '*.ts' | rg -v "domainSoulId|descriptor.identity.soulId|soul_apps"` 应只剩域 soulId 的合法用途。注意并发共享树:提交前 `git status` 只暂存本计划改动文件。

## Self-Review 覆盖核对(spec §4.1 surface → task)

- 存储 workers.soul_id→app_id → Task2 ✓ · 投影 ProjectedCapability.soulId → Task1 ✓ · 控制契约 describe.soulId → Task3 ✓ · daemon/OpenAPI → Task4 ✓ · runtime/soul-app-runtime → Task5 ✓ · CLI --soul → Task6 ✓ · refactor-contract pin + 协议版本 → Task7 ✓ · 域 soulId 降级(metadata.domainSoulId 保留)→ Task5 ✓ · 命名子决策 → Task0(用户确认)✓
- 类型一致:内部统一 `appId`、控制契约统一 `templateId`(Task0 决策),Task1-6 一致采用;`upsertWorker` 入参从 `soulId` 改 `appId` 在 Task2 定义、Task5 调用方同步 ✓
