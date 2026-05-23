# H2 领域语义泄漏整改设计

- 日期：2026-05-23
- 来源：`docs/superpowers/specs/2026-05-23-zero-trust-boundary-audit-design.md`（H2，致命）
- 目标：移除 Host Web 自持的领域 catalog 与 soul-id 硬编码，Host 改为泛化消费 manifest 描述符
- 约束基线：HOST-001、PROTO-001（Host 不解释/不翻译领域语义，泛化消费 manifest descriptor）

## 背景与已核实事实

- Host Web 的 souls/templates 数据**已是动态来源**：前端 `/api/local/souls`、`/api/local/templates`
  → `apps/api/src/modes/worker.ts:244-245` → `packages/core/src/soul-app/registry.ts:175-198`
  的 `listHostSoulCatalog()`，从**已安装 Soul App 的 manifest** 投影（`projectSoulAppSoul`、
  `projectSoulAppCapabilityTemplates`，仅 `enabled` app 投影模板）。
- manifest schema 已携带领域描述符：`soulAppSoulSchema`（`packages/shared/src/soul-app/manifest.ts:37-43`，
  含 name/description/domain）与 `soulAppCapabilitySchema`（`:57-69`，含 name/description/outputKind/
  `reviewRubricRef`）。
- Host 的 `displaySoul`/`displayTemplate`（`apps/web/src/features/i18n/index.ts:30-37`）**已经 fallback**
  到 manifest 投影值：`builtinSoulCopy[locale][soul.id] ?? { description: soul.description, ... }`。

结论：`catalog.ts` 是一层 Host 自持的**本地化覆盖**，既重复 manifest 又越权（HOST-001/PROTO-001），
且为 pm/devops/finance/legal/ops 等**不存在的 app** 凭空声明了 soul/模板与 review rubric。官方 app 经核实
只有 hr/qa/custom 三个（`packages/core/src/soul-app/official.ts:42-54`），catalog 里其余 5 个 soul 及其模板
是纯死领域数据。

`apps/web/src/features/local-workspace/` 经核实是薄透传层（数据中转 + UI 绑定），非 Host-owned 领域工作流，
不需要大拆。

## 本地化决策（用户确认）

删除 catalog 后，**Host 直接渲染 manifest 声明的单语言串**（作者所写）。领域术语的本地化是 Soul App
自己的职责（其 mounted UI 或未来 manifest i18n）。Host chrome 自身的按钮/状态文案保留现有 i18n；只是
领域标签不再由 Host 翻译。不扩 manifest schema 加多语言。

## 改动单元（约 4-5 文件）

1. **删除 `apps/web/src/features/i18n/catalog.ts`**：`builtinSoulCopy`（7 soul）与
   `builtinTemplateCopy`（25 模板 × 4 语）整体移除。

2. **简化 `displaySoul`/`displayTemplate`（`apps/web/src/features/i18n/index.ts:30-37`）**：
   去掉 catalog 查找，直接返回 manifest 投影值。
   - `displaySoul(soul)` 返回 `{ name: soul.name, description: soul.description, domain: soul.domain }`。
   - `displayTemplate(template)` 返回 `{ name, description, inputHints, outputKind }`——**不含 reviewRubric**。
   - 保留函数名以最小化 6 个调用点改动（`creation-dialogs.tsx`、`worker-studio.tsx`、
     `workspace-fallback.tsx`、`first-run-soul-app-home.tsx`）；移除对 `locale` 的领域翻译依赖。

3. **`apps/web/src/features/local-workspace/model.ts:47-57` `projectNamePlaceholder`**：
   删掉 `aiworker-hr/hr/pm/aiworker-qa/qa/devops` 分支，统一返回 `copy.create.projectPlaceholders.default`。

4. **`apps/web/src/features/i18n/types.ts:60` `projectPlaceholders`**：
   类型从 `Record<'default'|'devops'|'hr'|'pm'|'qa', string>` 收窄为单一 `default`（或 `{ default: string }`）；
   `locales/` 各语种里对应的 soul-specific 占位条目删除，保留 `default`。

5. **Host 停止呈现 review rubric**：rubric 是 Soul-owned 领域治理（manifest 仅给 `reviewRubricRef`）。
   `displayTemplate` 不再返回 rubric，模板卡片只展示 manifest 的 name/description。实现时确认并移除
   所有 rubric 渲染点（grep `reviewRubric`/`rubric` in `apps/web/src`）。

6. **默认 soul（用户确认）**：`defaultNewWorkerSoulId = 'aiworker-hr'`
   （`apps/web/src/worker/worker-studio.tsx:47`、`apps/web/src/worker/studio/locator.ts:31`）
   改为**取 `listSouls()` 返回的第一个已启用 soul**；无可用 soul 时不预选（空态/用户自选）。

## 测试

- 删除断言硬编码 catalog/soul-specific placeholder 的旧测试。
- 新增断言：`displaySoul`/`displayTemplate` 返回 manifest 投影的 name/description（非 catalog 覆盖）；
  返回值**不含 reviewRubric**。
- 新增断言：`projectNamePlaceholder` 对任意 soul id 均返回 `default` 占位（不再有 soul 分支）。
- 新增/调整：默认 soul 选择取第一个已启用 soul；无 soul 时不预选。
- Host Web 既有相关测试（如 `worker-studio.test.tsx`）相应更新。

## 验证

- `bun run --filter '@zonease/aiworker-web' test`（或聚焦相关 test 文件）。
- `bun run typecheck`（确认 `projectPlaceholders` 收窄、删除 catalog 后无类型残留）。
- `bun run lint`（含边界守卫；确认无新违规）。
- `bun run ui:check`（如改动触及模板卡片渲染）。
- 人工：本地起 Host Web，确认 worker 新建对话框、模板选择卡片显示的是 hr/qa/custom 的 manifest 文案，
  无 rubric、无 phantom soul（pm/devops/finance/legal/ops 本就不在已安装列表）。

## 非目标

- 不动 `apps/web/src/features/local-workspace/types.compat.ts`（Thin Shell 迁移遗留的兼容类型副本，非领域硬编码）。
- 不扩 manifest schema 加多语言（本地化归 Soul App）。
- 不新增"Host 不得硬编码 soul id"的 lint 守卫（YAGNI，留作可选后续）。
- 不碰 H3（数据面）/H4（engine env）。
- 不收敛 `aiworker app validate` 的 `scanPrivateImports` runtime 漏扫（已登记为收尾前必提的独立跟进）。
