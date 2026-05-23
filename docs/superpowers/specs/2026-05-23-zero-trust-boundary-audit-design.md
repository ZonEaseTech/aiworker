# 零信任边界审计与整改设计

- 日期：2026-05-23
- 范围：全仓零信任审查（边界隔离 / 通信协议 / 数据面 / engine 桥接）
- 方法：先全仓快扫建风险热力图，再对热点逐文件深挖，证据均带 `文件:行号`
- 合同基线：`docs/architecture.md#constraint-registry`（HOST-001 / SOUL-001 / PROTO-001 / IMPORT-001 / MOUNT-001 / DATA-001 / ENGINE-001）

## 背景与结论

Host↔Soul 之间**没有被 import 越界打穿**（手工 grep 干净）。但零信任视角下，"边界合规"在很大程度上是假象，由三条断裂叠加构成：

1. 守卫扫的是空目录，IMPORT-001 的自动化控制完全失效；
2. 领域语义（含 review rubric）已固化进 Host Web；
3. Host DB 在内联存储领域内容，并存放加密 secret。

也就是说，当前边界靠开发者自觉维持，而非控制生效。任何一次回归都不会被 CI 拦住。

## 风险热力图

| # | 严重度 | 维度 | 发现 | 违反约束 |
| --- | --- | --- | --- | --- |
| H1 | 致命 | 边界隔离（控制层） | 边界守卫在空目录上空转 | IMPORT-001 |
| H2 | 致命 | 边界隔离 / 协议 / 耦合 | 领域语义与 review rubric 固化进 Host Web | HOST-001、PROTO-001 |
| H3 | 高 | 数据面 | worker.db 内联存领域内容，并存加密 secret | DATA-001、Isolation/Security |
| H4 | 高 | 通信协议 / 安全 | engine 子进程全量继承 Host env | ENGINE-001 |
| H5 | 中 | 代码异味 / 耦合 | God files（`aiworker.ts` 2481 行等） | — |
| H6 | 低 | 边界漂移 | 架构地图缺登记包 + 幽灵空目录 | DOC-001 |

## H1 边界守卫完全空转（致命）

`scripts/check-soul-app-boundaries.ts:89` 的 `discoverSoulApps()` 用
`existsSync(path.join(dir, 'src'))` 过滤候选 Soul App，且 `srcDir` 写死为 `apps/X/src`
（`:86`）。

实测：`apps/aiworker-hr/src`、`apps/aiworker-qa/src`、`apps/aiworker-custom/src`
**三个目录都不存在**。真实 Soul 代码全部位于 `host-adapter/`、`product/`、`runtime/`
（HR 41 个 ts、QA 22 个、custom 15 个，`src/` 内 0 个）。

后果：

- `discoverSoulApps()` 返回空列表；
- `scanSoulAppImports`（`:105`）与 `scanSoulAppWebStorageUsage`（`:169`）在空列表上循环，**从不检查任何真实 Soul 代码**；
- IMPORT-001 的 import 隔离、raw-web-storage 检查对实际代码是 no-op；
- `scanHostImports`（`:141`）的"Host 不得 import Soul src"比较项也因 app 列表为空而失真。

附加盲区：

- `hostPrivatePackages`（`:21`）未含 `@zonease/aiworker-fs-layout`，Soul 可 import Host 路径助手而不被拦；
- import 检测为正则 `importSpecifiers`（`:317`），但主因仍是 `srcDir` 作用域错误，而非解析方式。

## H2 领域语义与 review rubric 泄漏进 Host（致命）

`apps/web/src/features/i18n/catalog.ts` 不是少量文案，而是一份完整领域知识库：

- `builtinSoulCopy`（`:13-50`）：内置 HR/QA/PM/DevOps/Finance/Legal/Ops **七个领域**的 name/description/domain，四语种（en/zh-CN/ja/de）；
- `builtinTemplateCopy`（`:52+`）：内置 `person-profile`、`candidate-screen`、`interview-brief`、`evidence-matrix`、`hiring-risk`、`test-plan`、`regression-matrix` 等领域模板，含 **review rubric**：`'No protected-class inference'`、`'Decision remains human-owned'`、`'No candidate ranking without human decision'`。

这正是 AGENTS.md 明令禁止的"把 Soul App 记忆提升规则 / review rubric 硬编码进平台"。

伴生硬编码分支：

- `apps/web/src/features/local-workspace/model.ts:47-57` 按 `soulId==='aiworker-hr'/'hr'/'pm'/'qa'/'devops'` 分支；
- `apps/web/src/worker/worker-studio.tsx:47` 与 `apps/web/src/worker/studio/locator.ts:31` 写死 `defaultNewWorkerSoulId = 'aiworker-hr'`。

越界放大：`finance`/`legal`/`ops`/`pm`/`devops` 在 Host 文案中条目齐全，但**没有对应官方 app**（`packages/core/src/soul-app/official.ts:42-54` 只有 hr/qa/custom）。Host 已成为领域定义来源，而非泛化消费方。

## H3 数据面违约（高）

worker.db 同时存在两套相反契约：

- 引用式（符合 DATA-001）：`worker_engine_invocations` 用 `input_ref/stdout_ref/stderr_ref`（`packages/storage-sqlite/src/worker/schema.ts:147-149`）；
- 内联式（违反 DATA-001）：`turns.input/response`（`:95-96`）、`engine_invocations.prompt`（`:120`）、`session_events.payload_json`（`:177`，type 含 `assistant_delta/tool/artifact`）。

写入点在 Host core：`packages/core/src/worker/runtime.ts:239`（`input`）、`:291`（`response: result.summary`）、`:385`（`appendEvent('assistant_delta', { delta, text })`）。

**更正（2026-05-23 复核 + 用户裁决）**：初稿把上述内联 transcript 判为 DATA-001 违约，过严。复核后认定它是 **Host 对 engine bridge 的合法操作台账**——Host 本地壳的 session 列表/时间线/状态依赖它，DATA-001 本就把 “sessions、engine invocation references” 列为合法 Host metadata。结论：**内联 transcript 非违约，不做 ref 化**；仅 Soul 产出的 artifact 文件留 workspace。此解释写入架构合同（见 `2026-05-23-h3-data-plane-fix-design.md` 的 H3b 决策）。

secret-in-DB：`worker_secrets`（`schema.ts:263-269`）字面冲突于 “Secret 不得写入 DB metadata”。**复核更进一步**：支撑它的 `SecretsVault` 类已在更早的收敛中从 `packages/core` 删除，残留的只是孤儿表/migration、死 `secretRef:` 分支、未接入 CI 的陈旧 smoke 脚本和 test-setup 的 master-key——纯死代码。

**裁决（2026-05-23，用户确认）**：`worker_secrets` 属过度设计，**直接删除**（孤儿清理，零运行时风险）；secret 继续走 `.env`/`env:`/vault-ref 单一路径。这同时消解了 H4 中“解密后 secret 进 env 透传”的叠加风险。H3 整改即 H3a（删孤儿设施）+ 架构合同补注，详见 `docs/superpowers/specs/2026-05-23-h3-data-plane-fix-design.md`。

## H4 engine env 全量透传（高）

三处无过滤注入子进程：

- `packages/core/src/worker/engine-bridge.ts:56-60`：`env: { ...process.env, ...input.env }`；
- `packages/core/src/worker/executor.ts:207-210`：`env: { ...process.env, ...engine.env }`；
- `packages/core/src/worker/executor.ts:335`：`env: options.env ?? process.env`。

零信任下外部 engine 是半受信边界。整个 Host 进程环境（可能含 API key、vault 凭据，以及 H3 中解密后的 secret）被无差别交给 engine，无 allowlist / 最小权限。H3 与 H4 叠加放大泄漏面。

## H5 / H6（中 / 低）

- H5 God files：`apps/cli/src/aiworker.ts`(2481)、`apps/api/src/modes/worker.ts`(1653)、`apps/web/src/features/settings/components/settings-dialog.tsx`(858)。职责过载，难以隔离推理与测试。
- H6 漂移：`docs/architecture.md` Repository Map 缺登 `packages/soul-app-workbench`、`apps/aiworker-custom`；`packages/gateway`、`packages/gateway-proto` 是 `2026-05-13-gateway-fleet-removal` 后遗留的幽灵空目录，应删除。

## 整改排序与候选方向

四项为相互独立的整改，各自走独立 spec→plan→实现。推荐排序：

1. **H1（控制层，先做）**：守卫真正生效后会自动暴露并兜住 H2/H3/H4 的回归。
   - 候选 a：守卫改为以"含 `soul-app.manifest.json` 的 app 目录"为根，扫描全目录（排除 `dist`/`node_modules`/生成文件），不再写死 `src/`。
   - 候选 b：补 `fs-layout` 等遗漏的 Host 私有包到禁止清单。
   - 候选 c：用真实违规 fixture 加回归测试，断言守卫"扫到了非空文件集"，防止再次空转。
2. **H2**：H1 修好后守卫会报出 H2 违规点；把 `builtinSoulCopy`/`builtinTemplateCopy` 从 Host 移除，改由 Soul manifest descriptor 声明、Host 泛化渲染；删除无对应 app 的领域条目与硬编码分支。
3. **H3 / H4（可并行）**：
   - H3：内联内容统一到 ref-based（向 `worker_engine_invocations` 看齐），内容落 workspace 文件；就 secret-in-DB 与文档约束做显式裁决。
   - H4：engine env 改 allowlist 最小透传，secret 按需注入而非整包继承。

H5/H6 作为低优先清理项，可在上述整改顺带处理。

## 后续

本文是审计发现交付物（DOC-001：审计轨迹，不覆盖架构合同）。下一步对 H1 走 brainstorming→writing-plans，产出可执行整改计划。
