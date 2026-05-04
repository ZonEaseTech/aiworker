# TODO-010 Admission evidence entries lose summary fields after zod parse

- **status**: pending
- **priority**: P3
- **owner**: unassigned
- **createdAt**: 2026-05-04 22:35
- **plan**: TBD
- **relatesTo**: PLAN-101, PLAN-103

## Description

worker.db 里的 `brain_admission_proposals.evidence` JSON 字段含 `summary` / 自定义文本 /
其它附加字段时，CLI `aiworker brain admission show` 与 REST `/api/worker/brain/admission/:id`
即便 `--show-sensitive` / `?showSensitive=true` 也只输出 `at` / `kind` / `ref` 三字段。

实测：

```sql
-- evidence JSON 中含 summary
'[{"at":"...","kind":"observation","ref":"r","summary":"contains secret","apiKey":"sk-...","token":"bearer-..."}]'
```

CLI 输出（任一 redact 模式）：

```json
"evidence": [{"at":"...","kind":"observation","ref":"r"}]
```

`summary` 字段连同 secret-like 字段一起被静默 strip。

## Decision needed

两选一，需要产品决定后落到 zod schema + 文档：

### Option A（推荐）：加白名单字段

`BrainAdmissionEvidence` zod schema 增加 `summary?: string` / `notes?: string`，过 redact pass：
- summary / notes 走 secret-like field-name redact（与 PLAN-101 现有机制一致）
- 让 operator 在 `aiworker brain admission show` 看到实际证据摘要，做出 approve / reject 决策

### Option B：明确文档"evidence 只允许 at/kind/ref"

- proposal.summary 已经是简短摘要的来源
- evidence 只是"指针"（at / kind / ref）
- 但需要在 docs/architecture.md / docs/cli.md 明确，并在 CLI / REST 文档警告：runtime 写入
  `evidence` 时不要塞 summary，否则会被 strip

## Why this matters

- PLAN-101 设计目标是"operator 能基于 proposal 内容做 approve / reject 决策"
- 当前只能看到 ref id（如 `qa-fixture-evidence`），无法判断该证据的内容
- Worker Admin UI 的 admission review 卡片同样依赖 evidence 字段渲染

## Reproducer

`/home/ben/projects/debug-aiworker/qa-2026-05-04/findings/UX-5-evidence-summary-stripped.md`
