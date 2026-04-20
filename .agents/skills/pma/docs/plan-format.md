# Plan Format Reference

This document defines the plan management format for the `docs/plan/` directory, including ID rules and initialization templates.

## Table of Contents

- [Directory Structure](#directory-structure)
- [Index Entry Format](#index-entry-format)
- [Detail File Format](#detail-file-format)
- [Plan ID Rules](#plan-id-rules)
- [Status Markers](#status-markers)
- [Update Rules](#update-rules)
- [Index Templates](#index-templates)

## Directory Structure

```text
docs/plan/
├── index.md          # Plan index (one line per plan)
└── PLAN-NNN.md       # Plan detail files (one per plan)
```

## Index Entry Format

Each plan in `index.md` is a single-line link with creation date and no sub-fields.

```markdown
- [ ] [**PLAN-001 Short plan title**](PLAN-001.md) `YYYY-MM-DD`
```

All detailed information goes in the corresponding detail file.

## Detail File Format

Create the detail file atomically when adding a new plan line to `index.md`.

English is the default for plan files. Use the Chinese template only when the user explicitly requests a specific plan document in Chinese.

### English Template

```markdown
# PLAN-001 Short plan title

- **status**: draft
- **createdAt**: YYYY-MM-DD HH:mm
- **approvedAt**: (pending)
- **relatedTask**: PREFIX-NNN

## Context

Investigation findings and current state: which files/modules are involved, call chains, existing logic.

## Proposal

Specific changes: what to modify and how to modify it. Include code snippets.

## Risks

Side effects, potential bugs, migration needs.

## Scope

Estimated scope of changes.

## Alternatives

(If multiple approaches exist, list comparisons here.)

## Annotations

(User annotations and responses. Keep all history.)
```

### Chinese Template (Explicit Request Only)

```markdown
# PLAN-001 简短方案标题

- **status**: draft
- **createdAt**: YYYY-MM-DD HH:mm
- **approvedAt**: (待审批)
- **relatedTask**: PREFIX-NNN

## 现状

调查发现及现状：涉及哪些文件/模块，调用链，现有逻辑。

## 方案

具体改哪些文件、怎么改，含代码片段。

## 风险

副作用、可能的 Bug、是否需要迁移。

## 工作量

改动范围评估。

## 备选方案

（有多种方案时列出对比。）

## 批注

（用户批注和回复。保留所有历史记录。）
```

### Detail File Update Rules

- Allowed detail `status` values: `draft`, `implementing`, `completed`, `rejected`
- Approved: set `status` to `implementing`, set `approvedAt` to current timestamp
- Completed: set `status` to `completed`
- Rejected: set `status` to `rejected`, add reason to annotations
- User annotations: append to annotations and keep all history

## Plan ID Rules

- Format: `PLAN-NNN` (fixed prefix `PLAN` + zero-padded 3-digit sequence)
- Sequence starts from `001`, incrementing globally
- Once assigned, never reuse or renumber
- Each ID maps to exactly one file: `docs/plan/PLAN-NNN.md`

## Status Markers

| Marker | Meaning | Detail file `status` |
|------|------|------|
| `[ ]` | Draft / Pending review | `draft` |
| `[-]` | Approved / Implementing | `implementing` |
| `[x]` | Completed | `completed` |
| `[~]` | Rejected / Abandoned | `rejected` |

## Update Rules

- **`index.md`**: Update only checkbox markers (for example, `[ ]` -> `[-]`). Never delete plan lines.
- **Detail files**: Update status, approvedAt, and annotations in place. Never delete existing sections.
- New plans append to the end of `index.md`.
- Plan IDs are permanent.

## Index Templates

English is the default for plan indexes. Use the Chinese template only when the user explicitly requests that specific document in Chinese.

### English Template

```markdown
# Project Name - Plan Index

> Updated: YYYY-MM-DD

## Usage

Each plan is a single line linking to its detail file. All detailed information lives in `docs/plan/PLAN-NNN.md`.

### Format

- [ ] [**PLAN-001 Short plan title**](PLAN-001.md) `YYYY-MM-DD`

### Status Markers

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Draft / Pending review |
| `[-]`  | Approved / Implementing |
| `[x]`  | Completed |
| `[~]`  | Rejected / Abandoned |

### Rules

- Only update the checkbox marker; never delete the line.
- New plans append to the end.
- See each `PLAN-NNN.md` for full details.

---

## Plans

```

### Chinese Template (Explicit Request Only)

```markdown
# 项目名 — 方案索引

> 更新日期: YYYY-MM-DD

## 使用规范

每个方案为单行链接，指向对应的详情文件 `docs/plan/PLAN-NNN.md`。

### 格式

- [ ] [**PLAN-001 简短方案标题**](PLAN-001.md) `YYYY-MM-DD`

### 状态标记

| 标记 | 含义 |
|------|------|
| `[ ]` | 草稿/待审批 |
| `[-]` | 已批准/实现中 |
| `[x]` | 已完成 |
| `[~]` | 否决/废弃 |

### 规则

- 仅更新复选框标记，禁止删除方案行。
- 新方案追加到列表末尾。
- 详细信息见各 `PLAN-NNN.md` 文件。

---

## 方案

```
