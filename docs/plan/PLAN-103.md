# PLAN-103 Worker/Fleet Brain surface closeout

- **status**: draft
- **createdAt**: 2026-05-04 13:52
- **approvedAt**: (pending)
- **relatedTask**: FEAT-054

## 现状

Worker Admin 已有 brain test card，Fleet topology 已明确 gateway 不复制 brain /
conversation / secret 内容。但 Soul modules、scope manifest、artifact registry 与
admission MVP 落地后，需要一个后置收口，确保这些能力在 UI/API/docs 中可见，
同时不破坏 worker 数据面和 fleet 控制面的边界。

## 方案

做 Worker/Fleet Brain surface 收口：

1. Worker Admin 展示 scope manifest、Soul module、artifact summary、pending
   admissions、brain health、retention warnings 和 brief preview 入口。
2. Worker REST 暴露只读 brain summary 与 admission review endpoints。
3. Fleet UI 只显示 worker 级 brain health / pending count / last checked，不复制
   proposal 全文、artifact 内容或 canonical brain。
4. docs/architecture / README / docs/cli 收口整条路线，明确前置准备和后置边界。
5. 运行全量或接近全量 gate，作为 FEAT-054 的 epic 收口。

## 范围

- Worker Admin Brain surface。
- Worker REST read-only summary / admission endpoints（如 PLAN-101 已提供底层 service）。
- Fleet summary display。
- docs closeout。
- focused + full verification。

## 非范围

- 不做跨 worker brain sync。
- 不在 fleet.db 存 brain/admission/artifact 正文。
- 不做 organization-level policy marketplace。

## 风险

1. UI 容易诱导 gateway 复制 worker brain 内容；API 和前端边界必须按 worker-local / fleet-summary 分层。
2. Admission review UI 涉及敏感摘要；默认只展示 summary / risk / target，原文按需展开。
3. closeout 可能跨度较大；若 PLAN-097..102 任一未完成，本 plan 应保持 draft。

## 验证

- Worker API focused tests。
- Worker/Fleet UI component tests。
- web dual-bundle build。
- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`
