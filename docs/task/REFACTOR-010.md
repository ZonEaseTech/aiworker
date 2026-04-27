# REFACTOR-010 Phase 5 — Web UI 能力补齐与可观测性（可选）

- **status**: pending
- **priority**: P3
- **owner**: (未分配)
- **createdAt**: 2026-04-27 18:35

## 描述

PLAN-022 Phase 5 落地。在前四 Phase 完成、双视角 UI 稳定运行之后，补齐可选能力。本 phase 是 nice-to-have，不影响主线验收。

### 验收标准

1. **gateway proto 扩展**（仅在用户需要 cross-worker 能力时做）：
   - `audit.list` 已在 Phase 2 加，本 phase 视情况补 `system.capabilities`、`secrets.list/put/delete`、`test.{brain,executor,channel}` 等让 fleet UI 也能跨 worker 触发。
   - 所有新 method 走 `operator-to-node` routing，proto 单测 + gateway server-side 实现 + zod 校验齐全。
2. **fleet UI cross-worker dashboard**：
   - 所有 worker 的 cron 总览（`cron.list` per worker，列表合并 + filter）
   - 所有 worker 的 approval 总览（`approval.list` per worker，列表合并 + filter）
   - 单点跳转到目标 worker 的 `/admin/cron/<id>` 或 `/admin/approvals/<id>`
3. **i18n**：
   - 默认 zh-CN，加 en placeholder
   - 用 `react-i18next`，namespace 按 `fleet` / `worker` / `shared` 拆
   - 切换不丢页面状态（query state、route params、滚动位置）
4. **dark mode**：
   - pma-web dual-channel theming（CSS variable + `data-theme` attribute）
   - Toggle 持久化到 localStorage（per-bundle 各自存）
   - 默认跟随 OS `prefers-color-scheme`
5. **可观测性补强**（可选 within 可选）：
   - fleet UI dashboard 加 audit event 时间轴
   - worker UI activity-panel 加 message bus 事件流可视化
   - 性能预算监控：fleet bundle 主路由 LCP < 1.5s（loopback dev mode）

### 不做

- WebSocket 双向 chat（依赖 `chat.send` 现有 server-side）；
- 任何破坏 ESLint 独立性 rule 的捷径。

## 进行时描述

Web UI 能力补齐：cross-worker dashboard + i18n + dark mode

## 依赖

- **blocked by**: REFACTOR-009
- **blocks**: (无)

## 笔记

- 本 phase 不阻塞 epic 验收。可在 Phase 4 完成后视使用反馈决定具体范围。
- gateway proto 扩展时务必同步 `packages/gateway-proto/src/methods.ts` 与 server-side dispatcher，避免 method_not_implemented stub。
- i18n 落地建议用 `lingui` 或 `react-i18next`：前者编译期 extract，后者运行期 resolve。pma-web `references/runtime-and-data.md` 推荐 `react-i18next`，沿用即可。
- dark mode 用 Tailwind v4 的 `@layer theme` + `data-theme="dark"` selector；不要混用 `dark:` class。
