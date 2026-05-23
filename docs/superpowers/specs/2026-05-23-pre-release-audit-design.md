# 发版前零信任深审 — 审查章程

> Date: 2026-05-23
> Status: 执行中
> 基准: 代码 + `docs/architecture.md#constraint-registry`(零信任,不采信 task/plan/changelog closeout)

## 目标

整个本地产品(CLI + 本地 daemon/API + Host Web Shell + 官方 Soul App hr/qa/custom)
一起发版前的深度审查。本次只产出**分级发现清单**,修复另行授权。非 1.0,允许破坏性修复。

## 基准原则(零信任)

1. 以代码为唯一事实源。`docs/task`、`docs/plan`、`docs/changelog.md` 是审计轨迹(DOC-001),
   其 closeout 标记不构成"已修"的证据;最近 H1–H5 整改一律当成**待证伪的声称**做回归。
2. 文档可能误导:`docs/task/index.md` 仍挂着已被推翻的旧产品形态(channel adapter、fleet HA、
   agent runtime),不得据此判断当前实现意图。当前合同只有 `AGENTS.md` + `docs/architecture.md`。
3. 机械结论用命令输出说话:typecheck / lint / test / build / migration diff / app validate·smoke。

## 方法(方案 A:按 package 分层 + 横切清单)

以 package/app 为扫描单元,分 6 组并行走查;每组套同一张横切清单。

| 组 | 范围 | 主要约束/风险 |
| --- | --- | --- |
| G1 数据/存储面 | `packages/storage-sqlite`、`packages/fs-layout` | DATA-001、migration 完整性、`worker_secrets` 残留、路径穿越 |
| G2 core + engine bridge | `packages/core` | HOST-001、ENGINE-001、`sanitizeEngineEnv`、spawn 注入、secret 处理 |
| G3 daemon API | `apps/api` | API 契约 zod↔OpenAPI↔client 漂移、边界输入校验、mounted/proxy 信任边界、鉴权 |
| G4 CLI | `apps/cli` | lifecycle、scaffold、边界校验器、命令注入、env 透传 |
| G5 Host Web + UI | `apps/web`、`packages/ui` | UI-001(shadcn/icon)、CONFIG-001(chrome 边界)、mounted surface 信任、localStorage secret、lucide 残留 |
| G6 shared 协议 + Soul 边界 | `packages/shared`、`soul-app-sdk`、`soul-app-runtime`、`soul-app-workbench`、`apps/aiworker-hr/qa/custom` | PROTO-001、MOUNT-001、IMPORT-001、SOUL-001、manifest 合规 |

### 横切清单(每组都跑)

1. **约束合规**:逐条对照 11 条 Constraint Registry,在代码中证伪是否被违反。
2. **安全**:secret 不入 db/manifest/log/prompt/localStorage;env 经 `sanitizeEngineEnv` 而非裸透传;
   engine/CLI spawn 无命令注入;workspace/session locator 无路径穿越;mounted surface 仅传 narrow context;
   API 边界有输入校验。
3. **正确性**:边界错误处理;zod↔OpenAPI↔typed client 一致;migration 与 schema 一致;
   无孤儿表/死引用;H5 god-file 拆分无残留/无回流。
4. **H1–H5 回归**:每项整改在代码中复核是否真落地、有无残留(边界守卫、领域语义泄漏、
   `worker_secrets` 清理、engine env 最小透传、god files 拆分)。

## 分级口径(整个产品一起发,按最严)

- **P0 阻发版**:shipping 代码违反硬约束;安全漏洞(secret 泄漏、注入、env 泄漏、信任边界破);
  build/bundle/migration 损坏;API 契约漂移导致运行期破。
- **P1 高**:约束风险/边界处校验缺失;非黄金路径正确性 bug;有风险的残留/死代码。
- **P2 中**:卫生问题、轻微不一致、非规范性文档↔代码漂移。

## Finding 格式

```
[P0|P1|P2] <一句话标题>
- 位置: path:line
- 违反: <约束 ID 或 安全/正确性类别>
- 证据: <代码事实,而非文档声称>
- 为何阻发版/影响: <一句话>
```

## 产出

汇总成单一分级发现清单(下方 `## 发现清单` 章节)。修复另行授权。

---

## 发现清单

> 生成: 2026-05-23。方法:6 组并行分层走查(只读)+ 实跑机械 gate。所有结论以代码/命令输出为准。
> 机械 gate 实跑结果:`build`/`build:bundle` ✅、`db:generate:worker` 无漂移 ✅;
> `typecheck` ❌(EXIT=2)、`lint` ❌(11 errors)、`test` ❌(1 fail)。详见 P0-A。

### 概览(按主题归并跨层 finding)

| # | 主题 | 级别 | 触点 | 违反 |
| --- | --- | --- | --- | --- |
| P0-A | 绿灯 gate 全红(typecheck/lint/test) | P0 | storage-sqlite、多包 style、aiworker-qa | 发版门槛 |
| P0-B | 子进程裸透传 `process.env`,Host secret 泄漏给 Soul 子进程(H4 回归) | P0 | apps/cli smoke、apps/api mounted | secret / Isolation |
| P0-C | `aiworker app validate` 边界扫描只覆盖 4 目录,可绕过 | P0 | apps/cli soul-app-boundary | IMPORT-001 执行 |
| P1-D | Host 在 shared 合成领域 prompt/reviewRubric(H2 残留) | P1 | shared+core registry | HOST-001/SOUL-001/PROTO-001 |
| P1-E | daemon API 无 token 时全匿名放行 + operatorId 可经 query 伪造 | P1 | apps/api | 鉴权/信任边界 |
| P1-F | 路径定位器缺 id 净化(fs-layout)+ smoke cwd 无校验 | P1 | fs-layout、apps/cli | 路径穿越(潜在) |
| P1-G | 边界校验器实现脆弱且与 CI gate 分叉 | P1 | apps/cli soul-app-boundary | IMPORT-001 执行 |
| P1-H | protocol.ts 协议面宽于架构声明(休眠未消费) | P1 | shared protocol | PROTO-001 |
| P2-* | zod/OpenAPI 契约债、死代码、god file 残留、UI 卫生、注释漂移 | P2 | 多处 | 卫生 |

**安全主面实测干净**:engine native spawn 经 `sanitizeEngineEnv`、命令全数组化无 shell 注入、secret 仅 `$`/`env:` 引用不入 DB/log/prompt/localStorage、mounted proxy 剥离 auth/cookie/x-forwarded 且强制 loopback、micro-app sandbox+scopecss 开启、静态托管防越界、`worker_secrets` vault 已彻底移除且 migration 链一致、DATA-001 worker.db 收敛为纯 Host metadata。

---

### P0-A 绿灯 gate 全红(发版门槛)
整个产品一起发、按最严口径下,`typecheck`/`lint`/`test` 任一红都阻发版。根因多为机械/陈旧:

- **typecheck EXIT=2** — `packages/storage-sqlite/src/worker/index.test.ts:337,340` TS2769:`ids[n]` 在严格索引下为 `number|undefined`,`toEqual([...])` 期望 `number[]`。仅测试文件类型错误。
- **lint 11 errors** — 全为可 `--fix` 的 style 错误(`style/quotes`、`perfectionist/sort-imports`、`style/no-multiple-empty-lines`、`padded-blocks`、`operator-linebreak`),散落 soul-app-workbench、官方 app web、apps/web、packages/ui。另有 64 warnings。
- **test 1 fail** — `apps/aiworker-qa/host-adapter/index.test.ts:118` 断言 bundle 含 `'Engine bridge ready'`。该硬编码字面串已被 `docs/task/BUG-151.md` 有意移除(改为真实 engine readiness 计算)。**用例陈旧,非行为回归**;但 `bun run test` 因此变红。

### P0-B 子进程裸透传 process.env,Host secret 泄漏给 Soul 子进程(H4 回归)
Host 已建立 `sanitizeEngineEnv()`(剥离 `AIWORKER_`/`WORKER_`/`OD_` 前缀),engine native bridge 正确使用。但两条子进程 spawn 路径绕过了它,把完整 `process.env` 交给信任级别更低的 Soul 进程:
- `apps/cli/src/aiworker.ts:1192-1196`(`runMountedServiceSmoke`):`env: { ...process.env, PORT: '0' }` spawn manifest 自带的任意 `command`。`aiworker app smoke <第三方>` 即用全量本机 env 执行不可信进程。
- `apps/api/src/modes/worker.ts:1028-1032`(`startMountedSoulAppService`):`env: { ...process.env, AIWORKER_MOUNT_TOKEN, PORT: '0' }`。受默认 loopback 绑定缓解,但同类缺陷。

泄漏面包含 `AIWORKER_LOCAL_TOKEN`(可反向认证整个 `/api/local/*`)、BYOK key、`WORKER_DB_PATH` 等。修复小:两处复用 `sanitizeEngineEnv()` 后再注入白名单变量。

### P0-C `aiworker app validate` 边界扫描只覆盖 4 目录,可绕过(IMPORT-001 执行)
- `apps/cli/src/soul-app-boundary.ts:70-74`(`appSourceScanDirs`)只递归扫 `host-adapter/product/runtime/src`。manifest 入口字段(`api.entry`/`exports.*`/`modes.*.entry`)在 schema 仅 `string().min(1)` 无目录约束,代码可合法落在 `scripts/`、`lib/`、`migrations/` 等未扫描目录,其中的 Host-private import 不会被 `scanPrivateImports` 读到;`validateManifestAssetRefs` 只验存在性不扫 import。
- 反差:CI gate `scripts/check-soul-app-boundaries.ts` 递归扫整树能拦住——两套并行实现覆盖面不一致,operator 面向的命令是弱的那个。第三方 Soul App 经 validate 通过仍可越界 import Host 私有包。

### P1-D Host 在 shared 合成领域 prompt/reviewRubric(H2 残留)
- `packages/shared/src/soul-app/registry.ts:111-137`(`projectSoulAppCapabilityTemplate`)凭 manifest 的 `promptRef`/`reviewRubricRef` 在 Host 侧合成领域 prompt 文本与 reviewRubric 数组;经 `packages/core/src/soul-app/registry.ts:175-198` 落入 Host catalog,`apps/web` settings 展示。
- H2 closeout 声称"去除领域 catalog/rubric"被证伪:只是从硬编码改成 manifest 投影,Host 仍是 review/capability 文本作者。
- **缓解(故降 P1)**:合成文本仅供 catalog/Settings 展示;engine prompt(`core/worker/runtime.ts:421-438`)只用 `capabilityTemplateId` 与 `outputKind`,不注入合成文本;`apps/api` `enrichTemplateMetadata` 已 no-op。但 `createSession` 强制 `capabilityTemplateId`(runtime.ts:209)使其成为 Host 配置层依赖,触 PROTO-001。建议把合成下沉给 Soul(Host 只透传 ref)或在 Constraint Registry 显式登记债务。

### P1-E daemon API 无 token 时全匿名放行 + operatorId 可伪造
- `packages/core/src/host/identity-provider.ts:45-47` + `apps/api/src/modes/worker.ts:178-187`:`AIWORKER_LOCAL_TOKEN` 为 `.optional()` 且 CLI 不生成默认 token,未配置时 `authenticate` 返回 `anonymous`,中间件仅拒 `denied`,匿名直接放行。
- `worker.ts:877-878`:`identity?.operatorId ?? c.req.query('operatorId')` —— 匿名态下 operatorId 直接采信查询参数,写入下发给 Soul 的签名 mount context。
- 受默认 `127.0.0.1` 绑定缓解;但本机多用户/容器共享 loopback 下是真实越权面。建议默认 fail-closed 或强制 token。

### P1-F 路径定位器缺 id 净化 + smoke cwd 无校验(潜在穿越)
- `packages/fs-layout/src/index.ts:101-116`:`resolveWorkerHome`/`resolveWorkspacesRoot`/`ensureWorkerHome` 对 `workerId` 无净化,`../` 或绝对路径可逃出 `AIWORKER_HOME`。当前**无生产调用方**(活跃 workspace 路径走 `randomUUID()` + `LocalWorkspaceFiles.resolve` 的 root 包含校验),为对外公共契约的潜在穿越点。
- `apps/cli/src/aiworker.ts:1194`:smoke 的 `service.cwd` 无 `..`/绝对路径约束,可定位到 rootDir 外(叠加 P0-B 放大不可信执行面)。

### P1-G 边界校验器实现脆弱且与 CI gate 分叉
- `apps/cli/src/soul-app-boundary.ts:141-149` 用 `importPath.includes('apps/api')` 子串匹配(既误伤 `@scope/apps/api-client`,又对 Windows 路径漏判);CI gate 用路径段匹配,二者语义分叉。
- import 扫描基于正则非 AST(注释 import 假阳,动态 `import('@zonease/'+'core')` 假阴)。
- sibling 拒绝清单 `SOUL_APP_PACKAGE_IMPORT_PREFIXES`(line 26-29)漏 `@zonease/aiworker-custom`(CI gate 用动态发现已覆盖,validate 命令反馈不一致)。

### P1-H protocol.ts 协议面宽于架构声明(休眠)
- `packages/shared/src/soul-app/protocol.ts:46-93` 定义 `classifyIntent`/`resolveCapability`/`enrichTurnContext`/`ui()`/`readEvidence`/`invokeAction` 及 `reviewRubric`/`artifactTypes` 等领域协议面,超出架构 Protocol Surfaces 声明。
- **缓解(故降 P1)**:Host 生产代码 0 处 dispatch 这些 handler,三个官方 manifest 也未声明对应块——休眠的 SDK authoring 类型,非 active 消费。建议收敛或显式标注 SOUL/SDK-only。

### P2 卫生 / 债务(不阻发版,建议登记)
- **API 契约债**:`apps/api` 多数写入 route 用手写 `readJson<T>` 断言而非 zod(worker.ts 多处);`worker/openapi.ts` 是与 handler 脱钩的手写 path 列表,response 全 `passthrough` 占位、req body/query 缺失,`/openapi.json` 不反映真实入参出参。typed client 无法可靠生成,新增 route 易静默漂移。建议长期收敛到 `createRoute`/`zValidator`。
- **死代码/未实现声明**:`packages/core/src/adapters/openai/*`、`adapters/mcp/*` 无生产消费者也未导出;`identity-provider.ts` 暴露未实现的 `logto` auth;`fs-layout` 三个 resolver 死代码 + `ResolveScopeOptions` 保留 deprecated 形参;`engine-bridge.ts:57-60` `input.env` 在 sanitize 之后展开(当前调用方不传 env,潜在纵深防御缺口);`executor.ts` codex `reasoning` 值未枚举校验直拼进 `-c` TOML(本地威胁模型低危)。
- **H5 god file 残留**:`apps/cli/src/aiworker.ts` 仍 1656 行、~40 command 内联;design doc 自己登记为未排期低优债。closeout 措辞("H5 拆分已完成")与代码事实有出入。
- **UI 卫生**:`apps/web/.../worker-configuration-dialog.tsx:504-521` 手写 `role="tab"` 而非 `packages/ui` Tabs primitive(值用 semantic token,故 P2)。
- **注释漂移**:`packages/storage-sqlite/src/index.ts:3` 头注释仍把 `artifact` 列为 DB 存储项(artifacts 表已 migration 0006 移除)。

### 文档↔代码漂移(贯穿主题,印证"别被文档误判")
- `docs/task/index.md` 仍挂 Telegram/Lark/WhatsApp channel adapter、fleet HA、agent runtime 等已被推翻的产品形态 FEAT 任务。
- H2(领域语义)、H5(god files)、QA `Engine bridge ready` 等 closeout 措辞普遍**超报完成度**:或残留(H2)、或未排期(H5)、或对应测试已陈旧(BUG-151)。零信任审计必须以代码为准。

### 建议处置顺序(修复另行授权)
1. **P0-A** 先把绿灯 gate 修绿:`lint --fix` 清 11 style 错;修 storage-sqlite test 类型;更新 aiworker-qa 陈旧断言(对齐 BUG-151 移除 hard-coded readiness)。
2. **P0-B** smoke + mounted spawn 复用 `sanitizeEngineEnv()`(+ smoke cwd 做 rootDir 包含校验,顺带 P1-F 后半)。
3. **P0-C / P1-G** `app validate` 改为递归扫整个 app rootDir(对齐 CI gate),或至少纳入 manifest 全部 entry;边界匹配改路径段 + 动态 sibling 发现。
4. **P1-D / P1-H** 决策:把领域 prompt/rubric 合成下沉给 Soul + 收敛协议面,或在 Constraint Registry 显式登记为已知债务。
5. **P1-E** API 默认 fail-closed 或强制 token;匿名态不采信 query operatorId。
6. **P1-F / P2** 按收敛原则清理潜在穿越点与死代码;API 契约债排期收敛到 zod/createRoute。
