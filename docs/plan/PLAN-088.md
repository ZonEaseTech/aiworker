# PLAN-088 Project Brain asset model

- **status**: completed
- **createdAt**: 2026-05-04 11:22
- **completedAt**: 2026-05-04 12:35
- **relatedTask**: FEAT-050

## 现状

Project Brain 已经有 filesystem layout、Soul preset、local-filesystem runtime
source 和只读 brain inspection commands，但产品文档还没有把它作为核心资产模型讲清楚。

## 方案

定义 Project Brain asset model：

1. Identity files: `AGENT.md`, `SOUL.md`, `USER.md`。
2. Memory files: `MEMORY.md`, `memories/`。
3. Brain skills: `.aiworker/skills/**/SKILL.md`。
4. Policy and drafts: `policy.json`, `toolsets.json`, `capability-packs.json`, `.aiworker/mcp.json`。
5. Admission state: generated memory / brain skill / policy proposal 的 evidence、scope、confidence、rollback。

## 范围

- architecture docs。
- README quickstart。
- CLI docs for brain commands。

## 非范围

- 不新增 mutating brain command。
- 不实现 admission DB schema。

## 风险

Brain skill 与 engine-native skill 命名容易混淆；所有文案必须带限定词。

## 验证

- docs review。
- `aiworker brain status|skills|memories` examples keep current behavior。

## 完成记录

- 2026-05-04 12:35：完成 Project Brain asset model 文档化。
  - `docs/architecture.md` 新增 “Project Brain asset model” 子章节，五类资产以表格列出文件、所有者、读写规则与当前 CLI；明确 admission state 是 roadmap（PLAN-090）。
  - `docs/cli.md` brain commands 章节顶部加入五类资产小表，显式区分 brain 资产 vs `.aiworker/executor-capabilities.json`。
  - `README.md` Features 中 Project Brain 一行展开为五类资产摘要。
  - 不新增 mutating brain command；不实现 admission DB schema。
- 验证：
  - `rg -n "Project Brain asset model" docs/architecture.md docs/cli.md` 命中预期位置
  - 没有触及代码，无需 typecheck/test gate
