# PLAN-106 Brain admission MVP 安全 / 鲁棒 / 可观察性补齐

- **status**: completed
- **createdAt**: 2026-05-04 23:30
- **approvedAt**: 2026-05-04 23:30
- **completedAt**: 2026-05-05 01:30
- **relatedTask**: BUG-055, BUG-058, BUG-059, TODO-009, TODO-010

## 现状

PLAN-101 落地 `BrainAdmissionService` MVP，PLAN-103 暴露 REST 与 Worker Admin
UI。QA-004 调试发现 5 个互锁问题：

1. **BUG-055 P0 安全**：`apply --commit` 把 `payload.body` 原样写 filesystem，
   仅做 field-name 级 redact，body 内字符串既不被扫也不被拦。BUG-056 修通后 brain
   memories 进 system prompt → secret 暴露面进一步放大。
2. **BUG-058 P2 鲁棒**：`brain_admission_proposals.evidence` 单条 schema drift
   会让 list / show 整体崩溃，Worker Admin / Fleet brain 视图直接黑屏。
3. **BUG-059 P3 状态机**：apply unsupported kind 不写 decision row，proposal
   status 卡在 `approved`，悬空。
4. **TODO-009 P3 可演示性**：CLI 没有 propose 入口，operator 只能直写 worker.db
   注入 fixture（容易跳过 zod 校验，制造 BUG-058 同形态污染）。
5. **TODO-010 P3 信息丢失**：`evidence` 内 `summary` / 自定义文本被 zod 默认
   strip，operator 决策可见性下降。

涉及文件：

| 层 | 文件 |
|----|------|
| admission service | `packages/core/src/worker/brain/admission/service.ts` |
| zod schema | `packages/shared/src/brain/admission.ts`（或邻近文件） |
| CLI | `apps/cli/src/commands/worker/brain-admission.ts`（命名以代码现状为准） |
| REST | `apps/api/src/worker/brain/routes.ts` |
| migration | `packages/storage-sqlite/src/worker/migrations/*`（如需 failureReason 列） |
| tests | `packages/core/src/worker/brain/admission/__tests__/*` 等 |

## 方案

**用户决策**：BUG-055 两者都做（block + redact + 显式覆盖）；TODO-010 用
Option A（schema 加白名单 summary/notes）；不做向后兼容。

### A. BUG-055 secret scan / block / redact

1. 新增 `scanBodyForSecrets(body: string): { hits: SecretHit[] }`，shared 模块
   下导出，覆盖：
   - `sk-[A-Za-z0-9_-]{20,}`（OpenAI / Anthropic / similar）
   - `eyJ[A-Za-z0-9_=.-]{20,}`（JWT / OIDC）
   - `(?:Bearer|bearer)\s+[A-Za-z0-9._-]{20,}`
   - 长度 ≥ 32 / shannon entropy ≥ 4.0 的疑似高熵串（启发式）
2. materializer dry-run / commit 路径前调用 scan：
   - 默认 **block**：返回 `outcome.kind = 'blocked-by-secret-scan'`，
     `secretScan.action = 'block'`，hits 含 redacted preview（仅前后各 3 字符）。
   - `--allow-secret-body=redact`：替换命中片段为 `[REDACTED:<reason>]` 并继续
     materialize；`secretScan.action = 'redact'`；决策 row `reason` 含
     `operator-redacted-secret-scan`。
   - `--allow-secret-body=raw`：原文落盘；`secretScan.action = 'allow-raw'`；
     决策 row `reason` 含 `operator-overrode-secret-scan-raw`，警告记录到 audit。
3. dry-run JSON 输出始终包含 `outcome.secretScan: { hits, action, scanner: '...' }`。
4. CLI flag：`--allow-secret-body=block|redact|raw`（默认 `block`）；REST
   `?allowSecretBody=block|redact|raw`。
5. shared `scanBodyForSecrets` 复用到 brief compiler 与 fleet brainSummary
   pointer（PLAN-103 已是 aggregate-only，但 pointer summary 仍需扫一次以防
   未来扩展）。

### B. BUG-058 list/show 单行 safeParse 兜底

1. `service.list` / `service.get` 改用 zod `safeParse` per row；失败的 row 不进
   返回结果，但放进 `skipped: { count, ids: [], reasons: [] }`。
2. `reason` 字符串规范：`schema-drift:<path-summary>`、`json-parse-error:<msg>`
   等枚举级形态，便于 UI 渲染。
3. 失败 row 写入 worker.db audit log（worker 侧）；如果当前 worker.db 没有
   audit_events 表，本轮新增 minimal `worker_audit_events` 表（schema 简化版，
   FEAT-051 已在 fleet 侧有 fleet audit）。
4. CLI list / show 输出 footer 渲染 `skipped: 1, reasons: [...]`。
5. REST `/api/worker/brain/admission` 响应 body 加 `skipped` 字段；OpenAPI
   schema 同步更新。

### C. BUG-059 unsupported kind 状态机

1. `service.apply` unsupported 分支：
   - 写 `brain_admission_decisions` 行，`decision='unsupported-skip'`，
     `decided_by` / `decided_at` / `reason='unsupported-kind:<kind>'`。
   - 把 proposal `status` 迁移到 `failed`，新增列 `failureReason TEXT NULL`
     存 `unsupported-kind:<kind>`。
2. migration：在 `worker_migrations/` 加 `add_brain_admission_failure_reason.sql`
   或等价 Drizzle migration。
3. `list --status failed` 能看到此条；`list --status approved` 不再看到悬空 row。
4. 现有"必须 status=approved 才能 apply"约束保持；rejected / failed 仍不可 apply。

### D. TODO-009 admission propose debug 入口

1. CLI：`aiworker brain admission propose --i-know-this-is-debug` 子命令，args：
   `--kind / --target / --summary / --rollback / --risk / --confidence /
   --evidence @file.json / --payload @file.json / --soul`，`--commit` 写库，
   省略时仅 dry-run。
2. REST：`POST /api/worker/brain/admission`（绑定与 PLAN-103 同样 bearer-auth；
   仅 dev mode `WORKER_DEV_TOOLS=true` 启用，否则 403）。
3. 走与 orchestrator 内部 `propose` 等价的 zod 校验路径，避免重复实现。
4. 测试：CLI propose → list → show → approve → apply 一气呵成。

### E. TODO-010 evidence schema 加 summary / notes

1. `BrainAdmissionEvidence` zod schema 增加：
   - `summary?: string`（≤ 500 字符）
   - `notes?: string`（≤ 2000 字符）
2. redact pass：复用 PLAN-101 现有 field-name secret-like 名称匹配（`apiKey` /
   `token` / `password` / `secret` / `bearer` / `auth` / `credential` 等），对
   summary / notes 做内容扫描（复用 BUG-055 的 `scanBodyForSecrets`）后落到
   `[REDACTED]`。
3. CLI / REST 默认输出 summary / notes（已经过 redact）；`--show-sensitive` 仅
   解开 field-name 级 redact，仍尊重内容 secret-scan 的 `[REDACTED]`。
4. 不做向后兼容：现有 db row 无 summary / notes 仍合法（zod optional 字段）；如
   有未来 schema 演进需要再补 migration。

## 风险

1. **secret scanner 误报率**：高熵启发式可能误伤合法长 hash / commit SHA / UUID。
   `--allow-secret-body=raw` 是兜底，但默认 block 会让一部分合法 proposal 被拦。
   需要在文档明示 scanner regex 列表，让 operator 可读可判断。
2. **scanBodyForSecrets 回调 shared**：放在 `@zonease/aiworker-shared` 还是
   `@zonease/aiworker-core/secrets`？为避免 PLAN-101 的 brain-admission 与
   `secrets-vault` 边界混淆，**放 shared，纯函数 + 测试覆盖**。
3. **BUG-058 audit 表新增**：worker.db 增表会动 schema baseline；migration 必须
   走 Drizzle 标准生成，并跑 `bun run db:generate:worker`。
4. **TODO-009 debug 入口被误用到 prod**：`WORKER_DEV_TOOLS=true` flag + CLI
   `--i-know-this-is-debug` 双闸；CLI 输出明显警告，REST 默认 403。
5. **跨 PLAN 共用 helper**：`scanBodyForSecrets` 也会被 PLAN-105 brief compiler
   后续 follow-up 用到；本轮先落到 shared，未来 follow-up 直接复用。

## 范围

- `packages/shared/src/brain/admission.ts` 与新 `scan-body.ts`
- `packages/core/src/worker/brain/admission/service.ts`
- `packages/storage-sqlite/src/worker/schema/*` + migration
- `apps/cli/src/commands/worker/brain-admission.ts`（命名以现状为准）
- `apps/api/src/worker/brain/routes.ts` + OpenAPI schema
- `apps/web/...`（如 Worker Admin UI 需要渲染 secretScan / skipped / failed
  列）—— 本轮仅最小渲染，Fleet UI 边界保持
- focused unit + integration tests
- docs/cli.md / docs/architecture.md（admission 默认行为变更必须文档化）

## 非范围

- 高熵 scanner 持久化白名单（false-positive 反馈循环留 follow-up）
- 跨 worker / fleet admission 同步（PLAN-103 已显式禁止 fleet 复制 payload）
- channel inbound 验签

## 验证

- `scanBodyForSecrets` shared unit tests（hit / miss / 边界 / 高熵启发式）
- admission service unit tests：block / redact / raw 三路径决策 row + dry-run
  JSON 字段；schema drift safeParse 跳行 + skipped；unsupported apply 写 failure。
- CLI unit + snapshot tests：propose debug 入口；list / show footer；apply
  --allow-secret-body 三模式输出。
- REST integration tests：bearer-auth；?allowSecretBody=...；POST /admission 仅
  dev 模式可达；OpenAPI snapshot。
- migration tests：新增列 / 表能正常 up & down。
- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run typecheck` / `bun run lint` 全量
- `bun run test` 全量（最终）

## 进度

- 2026-05-04 23:30：用户批准方案（block + redact + raw 三档；evidence schema
  加 summary/notes Option A；不做向后兼容）。Plan claimed BUG-055/058/059 +
  TODO-009/010。
- 2026-05-05 01:30：实施完成。
  - shared `scan-body.ts` + 9 单元测试：sk-token / JWT / bearer / AWS / GitHub
    / 高熵兜底；redactBodySecrets 标注 `[REDACTED:<rule>]`；overlap-aware 排序。
  - `BrainAdmissionService.apply` 接 secret scan：默认 block →
    `blocked-by-secret-scan`（HTTP 409）；`allowSecretBody='redact'` 替换并
    materialize；`allowSecretBody='raw'` 原文落盘并写 decision row reason。
    dry-run JSON 始终含 `secretScan: { hits, action, policy }`。
  - `list` / `get` 走 per-row safeParse；list 返回 `BrainAdmissionListResult`
    含 `proposals + skipped`；get 在 schema-drift 时返回 null（新增 `getSafe`
    暴露 skip reason）。CLI / REST 输出新增 `skipped` footer。
  - `apply` unsupported kind 在 `commit=true` 路径写入 `failed` decision row
    + 状态机迁移到 `failed`（`failureReason='unsupported-kind:<kind>'`），
    list `--status approved` 不再悬空；dry-run 仍返回 `unsupported` 不变状态。
  - `BrainAdmissionEvidence` schema 增加 `summary?: string ≤ 500` + `notes?:
    string ≤ 2000`，与 PLAN-101 现有 field-name redact 协同。
  - CLI 新增 `aiworker brain admission propose --i-know-this-is-debug`（root +
    `worker brain admission` 双入口），与 orchestrator 内部 `propose` 等价 zod
    校验；help 索引 + 注册测试同步。
  - REST 新增 `POST /admission`，`WORKER_DEV_TOOLS=true` 时启用，否则 403。
  - 应用层错误：`apply --commit` 在 secret block 时退出码 1；CLI 统一对
    `--allow-secret-body` 仅接受 `block | redact | raw`。
- 2026-05-05 01:30：验证通过：core 579 / shared 129 / cli 162 / api 83 / web 59
  / gateway 148 / storage 19 / gateway-proto 19 / fs-layout 20 = 1218 tests
  pass（baseline 1181）。Workspace typecheck 9/9 全绿，root lint 0 violation。
  BUG-055 / BUG-058 / BUG-059 + TODO-009 / TODO-010 全部 completed。
