# PLAN-088 Project Brain asset model

- **status**: draft
- **createdAt**: 2026-05-04 11:22
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
